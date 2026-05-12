/**
 * EligibilityScreen — combines patient data, blood unit, state protocol,
 * and clinical scoring into a single decision-support view.
 *
 * Sections (top to bottom):
 *   1. Protocol header — detected state + authorization status
 *   2. Vitals form    — required + optional inputs, live recomputation
 *   3. Eligibility    — verdict, shock index, reasons, unit picker
 *   4. Risk score     — Models 1+2 outputs with honest framing
 *
 * Live computation: every input change re-runs the rules engine and the
 * full ML assessment via useMemo. Pure functions make this cheap.
 *
 * Note on persistence: form state (vitals + optional inputs) is local to
 * this screen. The selected blood unit IS persisted to callState because
 * it's set via tap, not via render. When the Alert screen needs vitals
 * in Phase 5, we'll either lift form state to context or add an explicit
 * "Save vitals" action — both avoid the render-loop hazard of useEffect-
 * based syncing of derived state.
 */

import React, { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Colors } from '../theme/colors';
import { useApp } from '../context/AppContext';
import { BloodUnit, InjuryType, PatientVitals } from '../types';
import { STATE_PROTOCOLS } from '../constants/protocols';
import { checkEligibility } from '../logic/eligibilityEngine';
import { getShockSeverity, formatShockIndex } from '../logic/shockIndex';
import { runFullMLAssessment } from '../ml';

const DEFAULT_MINUTES_TO_HOSPITAL = 15;

// --- Small input helpers ------------------------------------------------

/** Parse a text-input string to a number, returning undefined for empty/invalid. */
function parseNumber(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

// --- Screen -------------------------------------------------------------

export default function EligibilityScreen() {
  const {
    callState,
    bloodInventory,
    detectedState,
    setSelectedBloodUnit,
  } = useApp();

  // Local input state (strings, because TextInput is string-based).
  const [hrInput, setHrInput] = useState('');
  const [sbpInput, setSbpInput] = useState('');
  const [mechanism, setMechanism] = useState<InjuryType>('blunt');

  // Optional inputs (collapsible section).
  const [showOptional, setShowOptional] = useState(false);
  const [rrInput, setRrInput] = useState('');
  const [gcsInput, setGcsInput] = useState('');
  const [spo2Input, setSpo2Input] = useState('');
  const [ageInput, setAgeInput] = useState('');
  const [minutesSinceInjuryInput, setMinutesSinceInjuryInput] = useState('');
  const [minutesToHospitalInput, setMinutesToHospitalInput] = useState('');

  const [infoModalVisible, setInfoModalVisible] = useState(false);

  // Parse inputs once per render.
  const hr = parseNumber(hrInput);
  const sbp = parseNumber(sbpInput);
  const rr = parseNumber(rrInput);
  const gcs = parseNumber(gcsInput);
  const spo2 = parseNumber(spo2Input);
  const age = parseNumber(ageInput);
  const minutesSinceInjury = parseNumber(minutesSinceInjuryInput);
  const minutesToHospital =
    parseNumber(minutesToHospitalInput) ?? DEFAULT_MINUTES_TO_HOSPITAL;

  const vitalsComplete = hr !== undefined && sbp !== undefined;

  // --- Build PatientVitals when complete ------------------------------

  const vitals: PatientVitals | null = useMemo(() => {
    if (!vitalsComplete) return null;
    return {
      heartRate: hr!,
      systolicBP: sbp!,
      injuryType: mechanism,
    };
  }, [hr, sbp, mechanism, vitalsComplete]);

  // --- Eligibility check ---------------------------------------------

  const eligibility = useMemo(() => {
    if (!vitals) return null;
    return checkEligibility(vitals, callState.selectedBloodUnit, detectedState);
  }, [vitals, callState.selectedBloodUnit, detectedState]);

  // --- ML assessment -------------------------------------------------

  const assessment = useMemo(() => {
    if (!vitals) return null;
    return runFullMLAssessment({
      heartRate: vitals.heartRate,
      systolicBP: vitals.systolicBP,
      mechanism: vitals.injuryType,
      respiratoryRate: rr,
      gcs,
      spo2,
      age,
      minutesSinceInjury,
      minutesToHospital,
      transfusionInitiated: false,
      txa: false,
    });
  }, [vitals, rr, gcs, spo2, age, minutesSinceInjury, minutesToHospital]);

  // --- State protocol --------------------------------------------------

  const stateProtocol = STATE_PROTOCOLS[detectedState.trim()];

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {/* 1. Protocol header */}
      <ProtocolHeader
        detectedState={detectedState}
        protocol={stateProtocol}
      />

      {/* 2. Vitals form */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Patient vitals</Text>

        <View style={styles.fieldRow}>
          <NumberField
            label="Heart rate"
            unit="bpm"
            value={hrInput}
            onChange={setHrInput}
            required
          />
          <NumberField
            label="Systolic BP"
            unit="mmHg"
            value={sbpInput}
            onChange={setSbpInput}
            required
          />
        </View>

        <Text style={styles.fieldLabel}>Mechanism</Text>
        <View style={styles.chipRow}>
          {(['blunt', 'penetrating', 'other'] as InjuryType[]).map((m) => (
            <Pressable
              key={m}
              style={[
                styles.chip,
                mechanism === m && styles.chipActive,
              ]}
              onPress={() => setMechanism(m)}
            >
              <Text
                style={[
                  styles.chipText,
                  mechanism === m && styles.chipTextActive,
                ]}
              >
                {m[0].toUpperCase() + m.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>

        <Pressable
          style={styles.expandRow}
          onPress={() => setShowOptional((v) => !v)}
        >
          <Ionicons
            name={showOptional ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={Colors.primary}
          />
          <Text style={styles.expandText}>
            {showOptional ? 'Hide additional inputs' : 'Show additional inputs'}
          </Text>
        </Pressable>

        {showOptional && (
          <View style={styles.optionalSection}>
            <View style={styles.fieldRow}>
              <NumberField
                label="Resp. rate"
                unit="/min"
                value={rrInput}
                onChange={setRrInput}
              />
              <NumberField
                label="GCS"
                unit="3–15"
                value={gcsInput}
                onChange={setGcsInput}
              />
            </View>
            <View style={styles.fieldRow}>
              <NumberField
                label="SpO₂"
                unit="%"
                value={spo2Input}
                onChange={setSpo2Input}
              />
              <NumberField
                label="Age"
                unit="yrs"
                value={ageInput}
                onChange={setAgeInput}
              />
            </View>
            <View style={styles.fieldRow}>
              <NumberField
                label="Min. since injury"
                unit="min"
                value={minutesSinceInjuryInput}
                onChange={setMinutesSinceInjuryInput}
              />
              <NumberField
                label="ETA to hospital"
                unit="min"
                value={minutesToHospitalInput}
                onChange={setMinutesToHospitalInput}
                placeholder={String(DEFAULT_MINUTES_TO_HOSPITAL)}
              />
            </View>
          </View>
        )}
      </View>

      {/* 3. Eligibility card */}
      {!vitals ? (
        <View style={[styles.card, styles.placeholderCard]}>
          <Ionicons name="clipboard-outline" size={32} color={Colors.textMuted} />
          <Text style={styles.placeholderTitle}>Enter HR and SBP to begin</Text>
          <Text style={styles.placeholderBody}>
            Heart rate and systolic blood pressure are required to compute
            eligibility and risk.
          </Text>
        </View>
      ) : eligibility ? (
        <EligibilityCard
          eligibility={eligibility}
          inventory={bloodInventory}
          selectedUnit={callState.selectedBloodUnit}
          onSelectUnit={setSelectedBloodUnit}
        />
      ) : null}

      {/* 4. Risk score card */}
      {assessment && (
        <RiskScoreCard
          assessment={assessment}
          onInfoPress={() => setInfoModalVisible(true)}
        />
      )}

      <InfoModal
        visible={infoModalVisible}
        onClose={() => setInfoModalVisible(false)}
      />
    </ScrollView>
  );
}

// --- Subcomponents ------------------------------------------------------

function ProtocolHeader({
  detectedState,
  protocol,
}: {
  detectedState: string;
  protocol: { authorized: boolean; version: string; notes: string } | undefined;
}) {
  if (!protocol) {
    return (
      <View style={[styles.protocolHeader, styles.protocolUnknown]}>
        <Ionicons name="warning" size={16} color={Colors.warning} />
        <Text style={styles.protocolTextWarn}>
          {detectedState} · Protocol not cached — proceed with medical direction.
        </Text>
      </View>
    );
  }

  const icon = protocol.authorized ? 'checkmark-circle' : 'close-circle';
  const color = protocol.authorized ? Colors.success : Colors.danger;

  return (
    <View
      style={[
        styles.protocolHeader,
        { borderColor: color, backgroundColor: `${color}14` },
      ]}
    >
      <Ionicons name={icon} size={16} color={color} />
      <Text style={[styles.protocolText, { color }]}>
        {detectedState} · Protocol {protocol.version} ·{' '}
        {protocol.authorized ? 'Authorized' : 'Not authorized'}
      </Text>
    </View>
  );
}

function NumberField({
  label,
  unit,
  value,
  onChange,
  placeholder,
  required,
}: {
  label: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>
        {label}
        {required && <Text style={styles.requiredAsterisk}> *</Text>}
      </Text>
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={Colors.textMuted}
          keyboardType="numeric"
          inputMode="numeric"
        />
        <Text style={styles.unitLabel}>{unit}</Text>
      </View>
    </View>
  );
}

function EligibilityCard({
  eligibility,
  inventory,
  selectedUnit,
  onSelectUnit,
}: {
  eligibility: { eligible: boolean; reasons: string[]; shockIndex: number };
  inventory: BloodUnit[];
  selectedUnit: BloodUnit | null;
  onSelectUnit: (unit: BloodUnit | null) => void;
}) {
  const severity = getShockSeverity(eligibility.shockIndex);
  const shockColor =
    severity === 'critical'
      ? Colors.danger
      : severity === 'concerning'
      ? Colors.warning
      : Colors.success;

  const verdictColor = eligibility.eligible ? Colors.success : Colors.danger;
  const verdictIcon = eligibility.eligible ? 'checkmark-circle' : 'close-circle';
  const verdictLabel = eligibility.eligible ? 'Eligible' : 'Not eligible';

  return (
    <View style={styles.card}>
      <View style={styles.verdictRow}>
        <View
          style={[
            styles.verdictBadge,
            { backgroundColor: `${verdictColor}1A`, borderColor: verdictColor },
          ]}
        >
          <Ionicons name={verdictIcon} size={20} color={verdictColor} />
          <Text style={[styles.verdictText, { color: verdictColor }]}>
            {verdictLabel}
          </Text>
        </View>
        <View style={styles.shockIndexBox}>
          <Text style={styles.shockIndexLabel}>Shock index</Text>
          <Text style={[styles.shockIndexValue, { color: shockColor }]}>
            {formatShockIndex(eligibility.shockIndex)}
          </Text>
        </View>
      </View>

      {eligibility.reasons.length > 0 && (
        <View style={styles.reasonsBlock}>
          <Text style={styles.reasonsTitle}>Reasons</Text>
          {eligibility.reasons.map((reason, i) => (
            <View key={i} style={styles.reasonRow}>
              <Ionicons
                name="alert-circle"
                size={14}
                color={Colors.danger}
                style={{ marginTop: 2 }}
              />
              <Text style={styles.reasonText}>{reason}</Text>
            </View>
          ))}
        </View>
      )}

      <Text style={styles.unitPickerTitle}>Selected blood unit</Text>
      {inventory.length === 0 ? (
        <Text style={styles.unitPickerEmpty}>
          No units in inventory. Add one in the Inventory tab.
        </Text>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.unitPickerRow}
        >
          {inventory.map((unit) => {
            const selected = selectedUnit?.id === unit.id;
            return (
              <Pressable
                key={unit.id}
                onPress={() => onSelectUnit(selected ? null : unit)}
                style={[
                  styles.unitChip,
                  selected && styles.unitChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.unitChipType,
                    selected && styles.unitChipTextActive,
                  ]}
                >
                  {unit.bloodType}
                </Text>
                <Text
                  style={[
                    styles.unitChipId,
                    selected && styles.unitChipTextActive,
                  ]}
                >
                  {unit.id}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

function RiskScoreCard({
  assessment,
  onInfoPress,
}: {
  assessment: ReturnType<typeof runFullMLAssessment>;
  onInfoPress: () => void;
}) {
  const { shock, survival } = assessment;

  const scoreColor =
    shock.severity === 'critical'
      ? Colors.danger
      : shock.severity === 'high'
      ? Colors.danger
      : shock.severity === 'moderate'
      ? Colors.warning
      : Colors.success;

  const urgencyColor =
    survival.urgencyLevel === 'immediate'
      ? Colors.danger
      : survival.urgencyLevel === 'urgent'
      ? Colors.warning
      : survival.urgencyLevel === 'monitor'
      ? Colors.info
      : Colors.success;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>Risk score</Text>
        <Pressable
          onPress={onInfoPress}
          hitSlop={8}
          style={styles.infoButton}
        >
          <Ionicons
            name="information-circle-outline"
            size={20}
            color={Colors.textMuted}
          />
        </Pressable>
      </View>

      <View style={styles.scoreRow}>
        <View style={styles.scoreBlock}>
          <Text style={[styles.scoreNumber, { color: scoreColor }]}>
            {shock.riskScore}
          </Text>
          <Text style={styles.scoreCaption}>
            {shock.severity.toUpperCase()}
          </Text>
        </View>
        <View style={styles.scoreMetaBlock}>
          <Text style={styles.metaLabel}>Shock class</Text>
          <Text style={styles.metaValue}>{shock.shockClass}</Text>
          <Text style={styles.metaLabel}>Confidence</Text>
          <Text style={styles.metaValue}>{shock.confidence}</Text>
        </View>
      </View>

      {shock.topFactors.length > 0 && (
        <View style={styles.factorsBlock}>
          <Text style={styles.metaLabel}>Top factors</Text>
          {shock.topFactors.map((factor, i) => (
            <Text key={i} style={styles.factorItem}>
              · {factor}
            </Text>
          ))}
        </View>
      )}

      <View style={styles.survivalBlock}>
        <View style={styles.survivalRow}>
          <View style={styles.survivalCell}>
            <Text style={styles.metaLabel}>Without transfusion</Text>
            <Text style={styles.survivalValue}>
              {survival.withoutTransfusion}%
            </Text>
          </View>
          <View style={styles.survivalCell}>
            <Text style={styles.metaLabel}>With transfusion</Text>
            <Text style={[styles.survivalValue, { color: Colors.success }]}>
              {survival.withTransfusion}%
            </Text>
          </View>
          <View style={styles.survivalCell}>
            <Text style={styles.metaLabel}>Benefit</Text>
            <Text style={[styles.survivalValue, { color: Colors.primary }]}>
              +{survival.benefit}pp
            </Text>
          </View>
        </View>
      </View>

      <View
        style={[
          styles.urgencyBar,
          { backgroundColor: `${urgencyColor}1A`, borderColor: urgencyColor },
        ]}
      >
        <Ionicons name="time" size={14} color={urgencyColor} />
        <Text style={[styles.urgencyText, { color: urgencyColor }]}>
          {survival.timeMessage}
        </Text>
      </View>

      <Text style={styles.disclaimer}>
        Decision aid — not validated for clinical use. Tap ⓘ for details.
      </Text>
    </View>
  );
}

function InfoModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>About this score</Text>
          <Text style={styles.modalBody}>
            The risk score combines patient vitals (HR, SBP, GCS, RR, SpO₂),
            age, mechanism of injury, and time since injury into a weighted
            sum. Weights are informed by trauma scoring literature but are
            author-set defaults, not calibrated against patient outcome data.
            {'\n\n'}
            Survival estimates extend this score with assumed penalties for
            comorbid factors and an assumed benefit curve for transfusion.
            They are decision aids, not validated predictions.
            {'\n\n'}
            This tool does not replace clinical judgment, local medical
            direction, scope-of-practice rules, or blood-bank procedures.
          </Text>
          <Pressable style={styles.modalCloseButton} onPress={onClose}>
            <Text style={styles.modalCloseText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
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

  // Protocol header
  protocolHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  protocolUnknown: {
    backgroundColor: '#FEF3C7',
    borderColor: Colors.warning,
  },
  protocolText: {
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
  protocolTextWarn: {
    fontSize: 12,
    fontWeight: '700',
    color: '#92400E',
    flex: 1,
  },

  // Cards
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  placeholderCard: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 6,
  },
  placeholderTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
    marginTop: 4,
  },
  placeholderBody: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
    paddingHorizontal: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 12,
  },
  infoButton: {
    marginBottom: 12,
  },

  // Fields
  fieldRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  field: {
    flex: 1,
    gap: 4,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  requiredAsterisk: {
    color: Colors.danger,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceMuted,
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  input: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 15,
    color: Colors.text,
    fontWeight: '600',
  },
  unitLabel: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: '700',
    marginLeft: 4,
  },

  // Chip selector
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  chipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
  },
  chipTextActive: {
    color: '#fff',
  },

  // Expandable section
  expandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
    paddingVertical: 6,
  },
  expandText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.primary,
  },
  optionalSection: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },

  // Verdict
  verdictRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  verdictBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  verdictText: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  shockIndexBox: {
    alignItems: 'flex-end',
  },
  shockIndexLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  shockIndexValue: {
    fontSize: 28,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },

  // Reasons
  reasonsBlock: {
    marginBottom: 14,
    padding: 12,
    backgroundColor: '#FEF2F2',
    borderRadius: 10,
    gap: 6,
  },
  reasonsTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.danger,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  reasonRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  reasonText: {
    flex: 1,
    fontSize: 13,
    color: Colors.text,
    lineHeight: 18,
  },

  // Unit picker
  unitPickerTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  unitPickerEmpty: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontStyle: 'italic',
  },
  unitPickerRow: {
    gap: 8,
    paddingRight: 8,
  },
  unitChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    minWidth: 90,
  },
  unitChipActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
  },
  unitChipType: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
  },
  unitChipId: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '600',
    marginTop: 2,
  },
  unitChipTextActive: {
    color: '#fff',
  },

  // Risk score
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    marginBottom: 16,
  },
  scoreBlock: {
    alignItems: 'center',
  },
  scoreNumber: {
    fontSize: 56,
    fontWeight: '900',
    lineHeight: 60,
    fontVariant: ['tabular-nums'],
  },
  scoreCaption: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    color: Colors.textMuted,
    marginTop: 2,
  },
  scoreMetaBlock: {
    flex: 1,
    gap: 2,
  },
  metaLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  metaValue: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 4,
  },

  // Top factors
  factorsBlock: {
    marginBottom: 14,
    gap: 4,
  },
  factorItem: {
    fontSize: 13,
    color: Colors.text,
    fontWeight: '600',
  },

  // Survival
  survivalBlock: {
    marginBottom: 12,
    padding: 12,
    backgroundColor: Colors.surfaceMuted,
    borderRadius: 10,
  },
  survivalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  survivalCell: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  survivalValue: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.text,
    fontVariant: ['tabular-nums'],
  },

  // Urgency
  urgencyBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 10,
  },
  urgencyText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },

  // Disclaimer
  disclaimer: {
    fontSize: 11,
    color: Colors.textMuted,
    fontStyle: 'italic',
    textAlign: 'center',
  },

  // Info modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 36,
    gap: 14,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text,
  },
  modalBody: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 21,
  },
  modalCloseButton: {
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    marginTop: 6,
  },
  modalCloseText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});