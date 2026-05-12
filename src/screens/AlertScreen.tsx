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
 * No editing happens here. If data is missing the screen prompts the user
 * to go to the Eligibility tab to complete inputs — that keeps the Alert
 * screen focused on transmission rather than data entry.
 */

import React, { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
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

// --- Screen -------------------------------------------------------------

export default function AlertScreen({ navigation }: Props) {
  const { callState, detectedState } = useApp();
  const { isOffline, pendingAlerts } = useConnectivity();

  const [status, setStatus] = useState<'idle' | 'sending' | 'queued'>('idle');

  // The same ML assessment Eligibility ran — we recompute here because
  // we don't persist its output, and the cost is sub-millisecond.
  const assessment = useMemo(() => {
    const v = callState.patientVitals;
    if (!v) return null;
    return runFullMLAssessment({
      heartRate: v.heartRate,
      systolicBP: v.systolicBP,
      mechanism: v.injuryType,
      minutesToHospital: DEFAULT_MINUTES_TO_HOSPITAL,
      transfusionInitiated: false,
      txa: false,
    });
  }, [callState.patientVitals]);

  const stateProtocol = STATE_PROTOCOLS[detectedState.trim()];
  const hasMinimum = !!callState.patientVitals && !!callState.eligibilityResult;

  // --- Build payload ----------------------------------------------------

  const buildPayload = (): AlertPayload | null => {
    if (!callState.patientVitals || !callState.eligibilityResult) return null;

    // Derive a stable callId from the call's start time. Lets the
    // receiving system de-dupe if the medic taps send twice.
    const callId = callState.startTime
      ? `call-${new Date(callState.startTime).getTime()}`
      : `call-${Date.now()}`;

    return {
      callId,
      timestamp: new Date().toISOString(),
      detectedState,
      vitals: callState.patientVitals,
      eligibility: callState.eligibilityResult,
      mlAssessment: assessment ?? undefined,
      transfusion: {
        unitId: callState.selectedBloodUnit?.id ?? null,
        bloodType: callState.selectedBloodUnit?.bloodType ?? null,
        initiated: false,
      },
      protocol: {
        state: detectedState,
        version: stateProtocol?.version ?? null,
        mdoActive: stateProtocol?.authorized ?? false,
      },
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
      // Brief "queued" confirmation, then back to idle. The pending-alert
      // badge in the header gives the user a persistent indicator.
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
            <SummaryStat
              label="Class"
              value={assessment.shock.shockClass}
            />
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

        <Row
          label="Patient"
          value={`${callState.patientVitals!.heartRate} bpm / ${
            callState.patientVitals!.systolicBP
          } mmHg · ${callState.patientVitals!.injuryType}`}
        />

        <Row
          label="Eligibility"
          value={callState.eligibilityResult!.eligible ? 'Eligible' : 'Not eligible'}
          valueColor={
            callState.eligibilityResult!.eligible ? Colors.success : Colors.danger
          }
        />

        <Row
          label="Selected unit"
          value={
            callState.selectedBloodUnit
              ? `${callState.selectedBloodUnit.bloodType} · ${callState.selectedBloodUnit.id}`
              : 'None'
          }
          valueColor={callState.selectedBloodUnit ? Colors.text : Colors.textMuted}
        />

        <Row
          label="State"
          value={detectedState}
        />

        <Row
          label="Protocol"
          value={
            stateProtocol
              ? `${stateProtocol.version} · ${
                  stateProtocol.authorized ? 'Authorized' : 'Not authorized'
                }`
              : 'Not cached'
          }
          valueColor={
            stateProtocol?.authorized ? Colors.success : Colors.warning
          }
        />
      </View>

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
        Transmits to the receiving facility's notification system. Does not
        replace verbal radio report.
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
        style={[
          styles.rowValue,
          valueColor && { color: valueColor },
        ]}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}

// --- Styles -------------------------------------------------------------

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: Colors.background,
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

  // Placeholder
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

  // Urgency banner
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

  // Summary stats
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

  // Survival
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

  // Rows
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

  // Outbox card
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

  // Send button
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

  // Primary button (placeholder action)
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
});