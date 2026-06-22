/**
 * AlertScreen — builds and sends ER pre-arrival alerts.
 *
 * Reads the current call state from AppContext, runs the ML assessment
 * against the same inputs Eligibility used, packages everything into an
 * AlertPayload, and hands it to the outbox.
 *
 * The outbox handles offline: queueAlert always succeeds locally, and a
 * background flusher drains queued alerts when connectivity returns.
 * This screen labels the send button accordingly but never blocks on
 * network.
 *
 * Radio summary card: a deterministic, template-based generator that
 * builds a 3-5 sentence radio handoff paragraph from every available
 * piece of call data — patient name, vitals, eligibility, transfusion
 * progress, peak reaction severity, and the medic's free-text note.
 * The paragraph is editable; the edited version travels with the
 * queued alert payload.
 */

import React, { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';

import { Colors } from '../theme/colors';
import { useApp } from '../context/AppContext';
import { useConnectivity } from '../hooks/useConnectivity';
import { RootTabParamList } from '../types';
import { STATE_PROTOCOLS } from '../constants/protocols';
import { runFullMLAssessment } from '../ml';
import { AlertPayload, queueAlert } from '../storage/outbox';

const DEFAULT_MINUTES_TO_HOSPITAL = 15;

type Props = BottomTabScreenProps<RootTabParamList, 'Alert'>;

// --- Helpers ------------------------------------------------------------

function urgencyTone(level: string | undefined): {
  bg: string;
  border: string;
  fg: string;
  icon: 'warning' | 'time' | 'pulse' | 'checkmark-circle';
  label: string;
} {
  switch (level) {
    case 'immediate':
      return {
        bg: '#FEF2F2',
        border: Colors.danger,
        fg: Colors.danger,
        icon: 'warning',
        label: 'IMMEDIATE',
      };
    case 'urgent':
      return {
        bg: '#FFFBEB',
        border: Colors.warning,
        fg: '#92400E',
        icon: 'time',
        label: 'URGENT',
      };
    case 'monitor':
      return {
        bg: '#EFF6FF',
        border: Colors.info,
        fg: Colors.info,
        icon: 'pulse',
        label: 'MONITOR',
      };
    case 'stable':
    default:
      return {
        bg: '#F0FDF4',
        border: Colors.success,
        fg: Colors.success,
        icon: 'checkmark-circle',
        label: 'STABLE',
      };
  }
}

/**
 * Format the structured call data as a radio handoff paragraph.
 *
 * Deterministic; runs in microseconds. Sentence order mirrors how EMS
 * medics actually phrase pre-alerts on radio:
 *   1. Identification — receiving, en route, patient name, ETA
 *   2. Patient assessment + key vitals + shock pattern
 *   3. Intervention + eligibility
 *   4. (if applicable) Transfusion progress
 *   5. (if applicable) Reaction status
 *   6. (if present) Medic note verbatim
 *   7. Urgency / requested ER posture
 */
function formatSummary(args: {
  detectedState: string;
  patientName: string;
  vitals: { heartRate: number; systolicBP: number; injuryType: string };
  eligibility: { eligible: boolean; reasons: string[]; shockIndex: number };
  shockClass: string;
  riskScore: number;
  severity: string;
  withoutTransfusion: number;
  withTransfusion: number;
  urgency: string;
  unit: { bloodType: string; id: string } | null;
  minutesToHospital: number;
  transfusion: {
    active: boolean;
    startedAt: string | null;
    elapsedSec: number;
    volumeInfusedMl: number;
    peakSeverity: 'none' | 'mild' | 'moderate' | 'severe';
    peakReactionType: string | null;
    medicNote: string;
  };
}): string {
  const { vitals, eligibility, unit, severity, urgency, transfusion } = args;

  const mechanismPhrase =
    vitals.injuryType === 'penetrating'
      ? 'penetrating trauma'
      : vitals.injuryType === 'blunt'
      ? 'blunt trauma'
      : 'trauma';

  const severityPhrase =
    severity === 'critical' || severity === 'high'
      ? 'hemodynamically unstable'
      : severity === 'moderate'
      ? 'borderline unstable'
      : 'currently stable but at risk';

  const sentences: string[] = [];

  // 1. Identification + patient assessment + key vitals
  const nameClause = args.patientName.trim()
    ? ` with ${args.patientName.trim()}`
    : '';
  sentences.push(
    `Receiving facility, EMS en route${nameClause}, ETA ${args.minutesToHospital} minutes. ` +
      `Patient is ${severityPhrase} from ${mechanismPhrase}. ` +
      `Heart rate ${vitals.heartRate}, systolic ${vitals.systolicBP}, ` +
      `shock index ${eligibility.shockIndex.toFixed(2)}, ${args.shockClass} shock pattern.`
  );

  // 2. Intervention + eligibility
  if (unit) {
    if (eligibility.eligible) {
      sentences.push(
        `Initiating ${unit.bloodType} whole blood, unit ${unit.id}. Eligibility confirmed.`
      );
    } else {
      sentences.push(
        `${unit.bloodType} unit ${unit.id} available but eligibility not met — holding transfusion.`
      );
    }
  } else if (eligibility.eligible) {
    sentences.push('Eligible for transfusion, no unit selected yet.');
  } else {
    sentences.push('Not eligible for transfusion at this time.');
  }

  // 3. Transfusion state — only if started
  if (transfusion.startedAt) {
    const minutes = Math.round(transfusion.elapsedSec / 60);

    const minutesPhrase =
      minutes === 0
        ? 'just started'
        : minutes === 1
        ? 'underway for 1 minute'
        : `underway for ${minutes} minutes`;

    const volumePhrase =
      transfusion.volumeInfusedMl > 0
        ? `, approximately ${transfusion.volumeInfusedMl} mL infused`
        : '';

    const statePhrase = transfusion.active
      ? `Transfusion ${minutesPhrase}${volumePhrase}.`
      : `Transfusion completed after ${minutes} minute${
          minutes === 1 ? '' : 's'
        }${volumePhrase}.`;

    sentences.push(statePhrase);
  }

  // 4. Reaction status — only if anything beyond 'none' observed
  if (transfusion.peakSeverity !== 'none') {
    const sevLabel =
      transfusion.peakSeverity === 'severe'
        ? 'Severe'
        : transfusion.peakSeverity === 'moderate'
        ? 'Moderate'
        : 'Mild';

    const typeLabel = transfusion.peakReactionType
      ? ` ${transfusion.peakReactionType.replace(/_/g, ' ')}`
      : '';

    const continuedPhrase =
      transfusion.peakSeverity === 'severe'
        ? 'transfusion stopped per protocol.'
        : 'transfusion continued under close monitoring.';

    sentences.push(
      `${sevLabel}${typeLabel} reaction observed during infusion; ${continuedPhrase}`
    );
  }

  // 5. Medic note — verbatim if present
  if (transfusion.medicNote.trim()) {
    sentences.push(`Medic note: ${transfusion.medicNote.trim()}`);
  }

  // 6. Urgency
  sentences.push(
    urgency === 'immediate'
      ? 'Requesting trauma activation and OR readiness on arrival.'
      : urgency === 'urgent'
      ? 'Requesting trauma team standby on arrival.'
      : urgency === 'monitor'
      ? 'No immediate activation requested; continue monitoring.'
      : 'Patient stable, standard handoff.'
  );

  return sentences.join(' ');
}

// --- Screen -------------------------------------------------------------

export default function AlertScreen({ navigation }: Props) {
  const { callState, detectedState } = useApp();
  const { isOffline, pendingAlerts } = useConnectivity();

  const [status, setStatus] = useState<'idle' | 'sending' | 'queued'>('idle');

  // The current radio summary text. Lives at the screen level so
  // buildPayload() can include it in the alert and so the value survives
  // any future re-mounts of the card.
  const [radioSummary, setRadioSummary] = useState<string | null>(null);

  // The same ML assessment Eligibility ran — recomputed here because we
  // don't persist its output, and the cost is sub-millisecond.
  // transfusionInitiated tracks whether the medic has started the infusion;
  // affects the survival benefit curve in the assessment.
  const assessment = useMemo(() => {
    const v = callState.patientVitals;
    if (!v) return null;
    return runFullMLAssessment({
      heartRate: v.heartRate,
      systolicBP: v.systolicBP,
      mechanism: v.injuryType,
      minutesToHospital: DEFAULT_MINUTES_TO_HOSPITAL,
      transfusionInitiated: callState.transfusion.startedAt !== null,
      txa: false,
    });
  }, [callState.patientVitals, callState.transfusion.startedAt]);

  const stateProtocol = STATE_PROTOCOLS[detectedState.trim()];
  const hasMinimum = !!callState.patientVitals && !!callState.eligibilityResult;

  // --- Build payload ----------------------------------------------------

  const buildPayload = (): AlertPayload | null => {
    if (!callState.patientVitals || !callState.eligibilityResult) return null;

    const callId = callState.startTime
      ? `call-${new Date(callState.startTime).getTime()}`
      : `call-${Date.now()}`;

    return {
      callId,
      timestamp: new Date().toISOString(),
      detectedState,
      patientName: callState.patientName,
      vitals: callState.patientVitals,
      mlAssessment: assessment ?? undefined,
      transfusion: {
        unitId: callState.selectedBloodUnit?.id ?? null,
        bloodType: callState.selectedBloodUnit?.bloodType ?? null,
        initiated: callState.transfusion.startedAt !== null,
        elapsedSec: callState.transfusion.elapsedSec,
        volumeInfusedMl: callState.transfusion.volumeInfusedMl,
        peakSeverity: callState.transfusion.peakSeverity,
        peakReactionType: callState.transfusion.peakReactionType,
        medicNote: callState.transfusion.medicNote,
      },
      protocol: {
        state: detectedState,
        version: stateProtocol?.version ?? null,
        mdoActive: stateProtocol?.authorized ?? false,
      },
      radioSummary: radioSummary ?? undefined,
 
    };
  };

  // --- Send action ------------------------------------------------------

  const handleSend = async () => {
    const payload = buildPayload();
    if (!payload) return;

    setStatus('sending');
    try {
      await queueAlert(payload);
      setStatus('queued');
      setTimeout(() => setStatus('idle'), 1500);
    } catch (err) {
      console.warn('[alert] queueAlert failed:', err);
      setStatus('idle');
    }
  };

  // --- Render: not enough data -----------------------------------------

  if (!hasMinimum) {
    return (
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={[styles.card, styles.placeholderCard]}>
          <Ionicons name="warning-outline" size={40} color={Colors.warning} />
          <Text style={styles.placeholderTitle}>Not enough data to alert</Text>
          <Text style={styles.placeholderBody}>
            The Eligibility tab needs heart rate, systolic BP, and a completed
            eligibility check before the ER alert can be assembled.
          </Text>
          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.buttonPressed,
            ]}
            onPress={() => navigation.navigate('Eligibility')}
          >
            <Ionicons name="arrow-forward" size={16} color="#fff" />
            <Text style={styles.primaryButtonText}>Go to Eligibility</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  // --- Render: full alert builder --------------------------------------

  const urgencyLevel = assessment?.survival.urgencyLevel;
  const tone = urgencyTone(urgencyLevel);

  const buttonLabel =
    status === 'queued'
      ? 'Alert queued'
      : status === 'sending'
      ? 'Queueing…'
      : isOffline
      ? 'Queue alert (offline)'
      : 'Send alert';

  const buttonIcon =
    status === 'queued'
      ? 'checkmark'
      : isOffline
      ? 'cloud-offline-outline'
      : 'send';

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {/* Urgency banner */}
      <View
        style={[
          styles.urgencyBanner,
          { backgroundColor: tone.bg, borderColor: tone.border },
        ]}
      >
        <Ionicons name={tone.icon} size={22} color={tone.fg} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.urgencyLabel, { color: tone.fg }]}>
            {tone.label}
          </Text>
          {assessment && (
            <Text style={styles.urgencyMessage}>
              {assessment.survival.timeMessage}
            </Text>
          )}
        </View>
      </View>

      {/* Assessment summary */}
      {assessment && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Clinical summary</Text>

          <View style={styles.summaryRow}>
            <SummaryStat
              label="Shock index"
              value={assessment.shock.shockIndex.toFixed(2)}
            />
            <SummaryStat
              label="Risk score"
              value={String(assessment.shock.riskScore)}
              caption={assessment.shock.severity.toUpperCase()}
            />
            <SummaryStat label="Class" value={assessment.shock.shockClass} />
          </View>

          <View style={styles.survivalRow}>
            <SurvivalCell
              label="No transfusion"
              value={`${assessment.survival.withoutTransfusion}%`}
            />
            <SurvivalCell
              label="With transfusion"
              value={`${assessment.survival.withTransfusion}%`}
              tone="positive"
            />
            <SurvivalCell
              label="Benefit"
              value={`+${assessment.survival.benefit}pp`}
              tone="info"
            />
          </View>
        </View>
      )}

      {/* Payload preview */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Alert details</Text>

        {callState.patientName.trim().length > 0 && (
          <Row label="Name" value={callState.patientName} />
        )}

        <Row
          label="Patient"
          value={`${callState.patientVitals!.heartRate} bpm / ${
            callState.patientVitals!.systolicBP
          } mmHg · ${callState.patientVitals!.injuryType}`}
        />

        <Row
          label="Eligibility"
          value={
            callState.eligibilityResult!.eligible
              ? 'Eligible'
              : 'Not eligible'
          }
          valueColor={
            callState.eligibilityResult!.eligible
              ? Colors.success
              : Colors.danger
          }
        />

        <Row
          label="Selected unit"
          value={
            callState.selectedBloodUnit
              ? `${callState.selectedBloodUnit.bloodType} · ${callState.selectedBloodUnit.id}`
              : 'None'
          }
          valueColor={
            callState.selectedBloodUnit ? Colors.text : Colors.textMuted
          }
        />

        <Row label="State" value={detectedState} />

        <Row
          label="Protocol"
          value={
            stateProtocol
              ? `${stateProtocol.version} · ${
                  stateProtocol.authorized
                    ? 'Authorized'
                    : 'Not authorized'
                }`
              : 'Not cached'
          }
          valueColor={
            stateProtocol?.authorized ? Colors.success : Colors.warning
          }
        />
      </View>

      {/* Radio summary card */}
      {assessment && callState.patientVitals && callState.eligibilityResult && (
        <RadioSummaryCard
          summary={radioSummary}
          onChange={setRadioSummary}
          buildSummary={() =>
            formatSummary({
              detectedState,
              patientName: callState.patientName,
              vitals: callState.patientVitals!,
              eligibility: callState.eligibilityResult!,
              shockClass: assessment.shock.shockClass,
              riskScore: assessment.shock.riskScore,
              severity: assessment.shock.severity,
              withoutTransfusion: assessment.survival.withoutTransfusion,
              withTransfusion: assessment.survival.withTransfusion,
              urgency: assessment.survival.urgencyLevel,
              unit: callState.selectedBloodUnit
                ? {
                    bloodType: callState.selectedBloodUnit.bloodType,
                    id: callState.selectedBloodUnit.id,
                  }
                : null,
              minutesToHospital: DEFAULT_MINUTES_TO_HOSPITAL,
              transfusion: callState.transfusion,
            })
          }
        />
      )}

      {/* Outbox status */}
      {pendingAlerts > 0 && (
        <View style={styles.outboxCard}>
          <Ionicons name="time" size={14} color={Colors.warning} />
          <Text style={styles.outboxText}>
            {pendingAlerts} alert{pendingAlerts > 1 ? 's' : ''} pending in
            outbox — will send when connectivity returns.
          </Text>
        </View>
      )}

      {/* Send button */}
      <Pressable
        style={({ pressed }) => [
          styles.sendButton,
          status === 'queued' && styles.sendButtonQueued,
          isOffline && status !== 'queued' && styles.sendButtonOffline,
          pressed && styles.buttonPressed,
        ]}
        onPress={status === 'idle' ? handleSend : undefined}
        disabled={status !== 'idle'}
      >
        <Ionicons name={buttonIcon} size={18} color="#fff" />
        <Text style={styles.sendButtonText}>{buttonLabel}</Text>
      </Pressable>

      <Text style={styles.disclaimer}>
        Transmits to the receiving facility's notification system. Does
        not replace verbal radio report.
      </Text>
    </ScrollView>
  );
}

// --- Subcomponents ------------------------------------------------------

function SummaryStat({
  label,
  value,
  caption,
}: {
  label: string;
  value: string;
  caption?: string;
}) {
  return (
    <View style={styles.summaryStat}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
      {caption && <Text style={styles.summaryCaption}>{caption}</Text>}
    </View>
  );
}

function SurvivalCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'positive' | 'info';
}) {
  const color =
    tone === 'positive'
      ? Colors.success
      : tone === 'info'
      ? Colors.primary
      : Colors.text;
  return (
    <View style={styles.survivalCell}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.survivalValue, { color }]}>{value}</Text>
    </View>
  );
}

function Row({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text
        style={[styles.rowValue, valueColor && { color: valueColor }]}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}

function RadioSummaryCard({
  summary,
  onChange,
  buildSummary,
}: {
  summary: string | null;
  onChange: (text: string | null) => void;
  buildSummary: () => string;
}) {
  // The "freshly generated" version, kept so we can detect when the medic
  // has edited it (EDITED badge) and so Reset has something to revert to.
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);

  const handleGenerate = () => {
    const fresh = buildSummary();
    setLastGenerated(fresh);
    onChange(fresh);
  };

  const handleReset = () => {
    if (lastGenerated) {
      onChange(lastGenerated);
    }
  };

  const isEdited = summary !== null && summary !== lastGenerated;

  return (
    <View style={[styles.card, styles.radioCard]}>
      <View style={styles.radioHeader}>
        <Ionicons name="radio-outline" size={16} color={Colors.primary} />
        <Text style={styles.radioTitle}>Radio handoff summary</Text>
        {isEdited && (
          <View style={styles.editedBadge}>
            <Text style={styles.editedBadgeText}>EDITED</Text>
          </View>
        )}
      </View>

      {summary !== null ? (
        <TextInput
          style={styles.radioInput}
          value={summary}
          onChangeText={onChange}
          multiline
          textAlignVertical="top"
          autoCorrect
          autoCapitalize="sentences"
          placeholder="Generated summary appears here. Edit as needed."
          placeholderTextColor={Colors.textMuted}
        />
      ) : (
        <Text style={styles.radioHint}>
          Tap to generate a 3-5 sentence summary you can read over radio to
          the receiving emergency department. Editable after generation.
        </Text>
      )}

      <View style={styles.radioActions}>
        <Pressable
          style={({ pressed }) => [
            styles.radioButton,
            pressed && styles.buttonPressed,
          ]}
          onPress={handleGenerate}
        >
          <Ionicons
            name={summary ? 'refresh' : 'document-text-outline'}
            size={16}
            color="#fff"
          />
          <Text style={styles.radioButtonText}>
            {summary ? 'Regenerate' : 'Generate summary'}
          </Text>
        </Pressable>

        {isEdited && (
          <Pressable
            style={({ pressed }) => [
              styles.radioSecondaryButton,
              pressed && styles.buttonPressed,
            ]}
            onPress={handleReset}
          >
            <Ionicons name="arrow-undo" size={14} color={Colors.primary} />
            <Text style={styles.radioSecondaryButtonText}>Reset</Text>
          </Pressable>
        )}
      </View>

      {summary !== null && (
        <Text style={styles.radioDisclaimer}>
          Verify against the structured data above before transmitting. The
          edited summary is included with the alert payload when you tap Send.
        </Text>
      )}
    </View>
  );
}

// --- Styles -------------------------------------------------------------

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: Colors.background,
    marginTop: 110,
    marginBottom: 100,
    zIndex: 1,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  scrollContent: {
    padding: 14,
    paddingBottom: 32,
    gap: 12,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  placeholderCard: {
    alignItems: 'center',
    paddingVertical: 36,
    gap: 10,
  },
  placeholderTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.text,
    marginTop: 4,
  },
  placeholderBody: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  urgencyBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  urgencyLabel: {
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  urgencyMessage: {
    fontSize: 13,
    color: Colors.text,
    lineHeight: 18,
    fontWeight: '600',
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  summaryStat: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: Colors.surfaceMuted,
    borderRadius: 10,
    paddingVertical: 10,
  },
  summaryLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.text,
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  summaryCaption: {
    fontSize: 9,
    fontWeight: '800',
    color: Colors.textMuted,
    letterSpacing: 0.5,
    marginTop: 1,
  },
  survivalRow: {
    flexDirection: 'row',
    gap: 10,
  },
  survivalCell: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: Colors.surfaceMuted,
    borderRadius: 10,
    paddingVertical: 10,
  },
  survivalValue: {
    fontSize: 18,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  row: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  rowLabel: {
    width: 110,
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    paddingTop: 1,
  },
  rowValue: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'right',
  },
  outboxCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: Colors.warning,
  },
  outboxText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#92400E',
    lineHeight: 17,
  },
  sendButton: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    marginTop: 4,
  },
  sendButtonOffline: {
    backgroundColor: Colors.warning,
  },
  sendButtonQueued: {
    backgroundColor: Colors.success,
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
  primaryButton: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: Colors.primary,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  buttonPressed: {
    opacity: 0.85,
  },
  disclaimer: {
    fontSize: 11,
    color: Colors.textMuted,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingHorizontal: 16,
    marginTop: 4,
  },
  radioCard: {
    borderColor: Colors.primary,
    borderWidth: 1.5,
    backgroundColor: '#EFF6FF',
  },
  radioHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  radioTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    flex: 1,
  },
  radioHint: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 17,
    marginBottom: 10,
  },
  radioInput: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    fontSize: 14,
    color: Colors.text,
    lineHeight: 21,
    fontWeight: '500',
    minHeight: 100,
  },
  radioActions: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'stretch',
  },
  radioButton: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: Colors.primary,
  },
  radioButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  radioSecondaryButton: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    backgroundColor: Colors.surface,
  },
  radioSecondaryButtonText: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  editedBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: Colors.warning,
  },
  editedBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  radioDisclaimer: {
    fontSize: 10,
    color: Colors.textMuted,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 8,
  },
});