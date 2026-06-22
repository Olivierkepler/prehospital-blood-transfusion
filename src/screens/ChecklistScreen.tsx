/**
 * ChecklistScreen — two modes in one screen.
 *
 * Mode 1: Checklist — the 10 transfusion protocol steps with checkboxes.
 * Mode 2: Active monitoring — once "Begin transfusion" is tapped, switches
 *         to a live monitoring view driven by useReactionMonitor.
 *
 * Baseline vitals come from callState.patientVitals (set on the Eligibility
 * tab) when available; otherwise the screen shows an inline capture form.
 *
 * Transfusion state is mirrored into AppContext.callState.transfusion so
 * the Alert screen's radio summary can include real-time transfusion data
 * (elapsed, volume, peak severity, medic note). Writes are throttled to
 * once every 30s during steady-state, plus immediate writes on transfusion
 * start, end, severity escalations, and medic-note edits.
 */

import { Ionicons } from '@expo/vector-icons';

import { Colors } from '../theme/colors';
import { useApp } from '../context/AppContext';
import { CHECKLIST_STEPS } from '../constants/protocols';
import { InjuryType, PatientVitals } from '../types';
import { useReactionMonitor, SimulationMode } from '../hooks/useReactionMonitor';
import { formatReactionType, ReactionSeverity } from '../ml';
import HomeIVScene from '../components/IVPump/HomeIVScene';
import SigmaPump, {
  PUMP_BASE_HEIGHT,
  PUMP_BASE_WIDTH,
 } from '../components/IVPump/SigmaPump';
 import React, { useEffect, useMemo, useRef, useState } from 'react';
 import {
   Alert,
   Animated,
   Linking,
   Pressable,
   ScrollView,
   StyleSheet,
   Switch,
   Text,
   TextInput,
   TouchableOpacity,
   View,
 } from 'react-native';
// --- Small helpers ------------------------------------------------------


function parseNumber(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function severityColor(severity: ReactionSeverity): string {
  switch (severity) {
    case 'severe':
      return Colors.danger;
    case 'moderate':
      return Colors.warning;
    case 'mild':
      return Colors.info;
    case 'none':
    default:
      return Colors.success;
  }
}

function severityLabel(severity: ReactionSeverity): string {
  switch (severity) {
    case 'none':
      return 'Stable';
    case 'mild':
      return 'Mild signs';
    case 'moderate':
      return 'Moderate signs';
    case 'severe':
      return 'Severe — act now';
  }
}

/** Severity ordering helper — lets us detect escalations. */
const SEVERITY_RANK: Record<ReactionSeverity, number> = {
  none: 0,
  mild: 1,
  moderate: 2,
  severe: 3,
};

const CONTEXT_FLUSH_INTERVAL_MS = 30_000;
const BLOOD_START_ML = 250;
const BLOOD_MAX_ML = 450;
const SALINE_START_ML = 500;
const SALINE_MAX_ML = 1000;

const PUMP_WRAP_W = Math.ceil(PUMP_BASE_WIDTH * 1.15);
const PUMP_WRAP_H = Math.ceil(PUMP_BASE_HEIGHT * 1.15);
// --- Screen -------------------------------------------------------------

export default function ChecklistScreen() {
  const { callState, setTransfusionState } = useApp();

  const [completed, setCompleted] = useState<Record<string, boolean>>({});
  const [monitoring, setMonitoring] = useState(false);
  const [simulationMode, setSimulationMode] = useState<SimulationMode>('normal');
  const [speechEnabled, setSpeechEnabled] = useState(false);

  const [hrInput, setHrInput] = useState('');
  const [sbpInput, setSbpInput] = useState('');

  // Medic note — free-text observations during transfusion. Synced to
  // context so it appears in the radio summary.
  const [medicNote, setMedicNoteLocal] = useState(callState.transfusion.medicNote);

  const baselineFromCall = callState.patientVitals;
  const inlineBaseline = useMemo<PatientVitals | null>(() => {
    const hr = parseNumber(hrInput);
    const sbp = parseNumber(sbpInput);
    if (hr === undefined || sbp === undefined) return null;
    return { heartRate: hr, systolicBP: sbp, injuryType: 'blunt' as InjuryType };
  }, [hrInput, sbpInput]);

  const baseline = baselineFromCall ?? inlineBaseline;

  const monitor = useReactionMonitor({
    active: monitoring,
    baselineVitals: baseline,
    simulationMode,
    speechEnabled,
  });

  // Track peak severity locally so we can spot escalations and flush
  // immediately when one happens.
  const peakSeverityRef = useRef<ReactionSeverity>('none');
  const lastContextFlushRef = useRef<number>(0);
  const pumpScaleAnim = useRef(new Animated.Value(0.82)).current;
  const [pumpExpanded, setPumpExpanded] = useState(false);
  
  const expandPump = () => {
    Animated.spring(pumpScaleAnim, {
      toValue: pumpExpanded ? 0.82 : 1.15,
      useNativeDriver: true,
      friction: 7,
      tension: 80,
    }).start();
  
    setPumpExpanded((value) => !value);
  };
  // --- Effect: monitor → context bridge ---------------------------------

  // On transfusion start: write initial state to context.
  useEffect(() => {
    if (monitoring) {
      const startedAt = new Date().toISOString();
      peakSeverityRef.current = 'none';
      lastContextFlushRef.current = Date.now();
      setTransfusionState({
        active: true,
        startedAt,
        elapsedSec: 0,
        volumeInfusedMl: 0,
        peakSeverity: 'none',
        peakReactionType: null,
        peakObservedAt: null,
      });
    } else {
      // On transfusion end: keep peak data but flip active off.
      setTransfusionState({ active: false });
    }
    // setTransfusionState is stable from context — safe to omit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monitoring]);

  // On every monitor tick: throttle writes + immediate write on escalation.
  useEffect(() => {
    if (!monitoring || !monitor.output) return;

    const currentSeverity = monitor.output.severity;
    const isEscalation =
      SEVERITY_RANK[currentSeverity] > SEVERITY_RANK[peakSeverityRef.current];

    const now = Date.now();
    const shouldFlush =
      isEscalation || now - lastContextFlushRef.current >= CONTEXT_FLUSH_INTERVAL_MS;

    if (!shouldFlush) return;

    lastContextFlushRef.current = now;

    if (isEscalation) {
      peakSeverityRef.current = currentSeverity;
      setTransfusionState({
        elapsedSec: monitor.elapsedSec,
        volumeInfusedMl: monitor.volumeInfusedMl,
        peakSeverity: currentSeverity,
        peakReactionType: monitor.output.reactionType,
        peakObservedAt: new Date().toISOString(),
      });
    } else {
      setTransfusionState({
        elapsedSec: monitor.elapsedSec,
        volumeInfusedMl: monitor.volumeInfusedMl,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monitoring, monitor.output, monitor.elapsedSec, monitor.volumeInfusedMl]);

  // Medic note → context, debounced.
  useEffect(() => {
    const handle = setTimeout(() => {
      setTransfusionState({ medicNote });
    }, 400);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [medicNote]);

  // --- Derived progress -------------------------------------------------

  const completedCount = Object.values(completed).filter(Boolean).length;
  const totalSteps = CHECKLIST_STEPS.length;
  const progressPct = Math.round((completedCount / totalSteps) * 100);

  const infusionStepDone = completed['begin-infusion'] === true;
  const canBeginTransfusion = infusionStepDone && baseline !== null && !monitoring;

  const handleToggleStep = (stepId: string) => {
    setCompleted((prev) => ({ ...prev, [stepId]: !prev[stepId] }));
  };

  const handleBeginTransfusion = () => {
    setMonitoring(true);
  };

  const handleEndTransfusion = () => {
    setMonitoring(false);
  };

  // --- Render: monitoring mode ------------------------------------------

  if (monitoring) {
    return (
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
      <MonitoringCard
  elapsedSec={monitor.elapsedSec}
  volumeMl={monitor.volumeInfusedMl}
  current={monitor.currentSnapshot}
  baselineSnapshot={monitor.history[0] ?? null}
  pumpScaleAnim={pumpScaleAnim}
  onPumpPress={expandPump}
  
/>

        {monitor.output && monitor.output.severity !== 'none' && (
          <ReactionAlertCard output={monitor.output} />
        )}

        {monitor.output && monitor.output.severity === 'none' && (
          <View style={[styles.card, styles.stableCard]}>
            <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
            <Text style={styles.stableText}>
              No reaction signs. Continue routine monitoring.
            </Text>
          </View>
        )}

        <MedicNoteCard
          value={medicNote}
          onChange={setMedicNoteLocal}
        />

        <ControlsCard
          simulationMode={simulationMode}
          onSimulationChange={setSimulationMode}
          speechEnabled={speechEnabled}
          onSpeechChange={setSpeechEnabled}
        />

        <Pressable
          style={({ pressed }) => [
            styles.endButton,
            pressed && styles.buttonPressed,
          ]}
          onPress={handleEndTransfusion}
        >
          <Ionicons name="stop-circle" size={18} color="#fff" />
          <Text style={styles.endButtonText}>End transfusion</Text>
        </Pressable>
      </ScrollView>
    );
  }

  // --- Render: checklist mode -------------------------------------------

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.card}>
        <View style={styles.progressHeader}>
          <Text style={styles.progressLabel}>
            {completedCount} of {totalSteps} complete
          </Text>
          <Text style={styles.progressPct}>{progressPct}%</Text>
        </View>
        <View style={styles.progressBar}>
          <View
            style={[styles.progressFill, { width: `${progressPct}%` }]}
          />
        </View>
      </View>

      {!baselineFromCall && (
        <View style={[styles.card, styles.baselineCard]}>
          <View style={styles.baselineHeader}>
            <Ionicons name="pulse" size={18} color={Colors.primary} />
            <Text style={styles.baselineTitle}>Baseline vitals</Text>
          </View>
          <Text style={styles.baselineHint}>
            No vitals from Eligibility. Capture HR and SBP here so the monitor
            has a baseline to compare against.
          </Text>
          <View style={styles.baselineRow}>
            <View style={styles.baselineField}>
              <Text style={styles.baselineFieldLabel}>HR (bpm)</Text>
              <TextInput
                style={styles.baselineInput}
                value={hrInput}
                onChangeText={setHrInput}
                keyboardType="numeric"
                inputMode="numeric"
                placeholder="e.g. 110"
                placeholderTextColor={Colors.textMuted}
              />
            </View>
            <View style={styles.baselineField}>
              <Text style={styles.baselineFieldLabel}>SBP (mmHg)</Text>
              <TextInput
                style={styles.baselineInput}
                value={sbpInput}
                onChangeText={setSbpInput}
                keyboardType="numeric"
                inputMode="numeric"
                placeholder="e.g. 95"
                placeholderTextColor={Colors.textMuted}
              />
            </View>
          </View>
        </View>
      )}

      {CHECKLIST_STEPS.map((step, index) => (
        <StepCard
          key={step.id}
          index={index}
          step={step}
          completed={!!completed[step.id]}
          onToggle={() => handleToggleStep(step.id)}
        />
      ))}

      {infusionStepDone && (
        <Pressable
          style={({ pressed }) => [
            styles.beginButton,
            !canBeginTransfusion && styles.beginButtonDisabled,
            pressed && canBeginTransfusion && styles.buttonPressed,
          ]}
          onPress={canBeginTransfusion ? handleBeginTransfusion : undefined}
          disabled={!canBeginTransfusion}
        >
          <Ionicons name="play-circle" size={20} color="#fff" />
          <Text style={styles.beginButtonText}>
            {baseline ? 'Begin transfusion monitoring' : 'Enter baseline to begin'}
          </Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

// --- Subcomponents ------------------------------------------------------

function StepCard({
  index,
  step,
  completed,
  onToggle,
}: {
  index: number;
  step: { id: string; title: string; description: string };
  completed: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      onPress={onToggle}
      style={({ pressed }) => [
        styles.stepCard,
        completed && styles.stepCardDone,
        pressed && { opacity: 0.85 },
      ]}
    >
      <View style={[styles.stepCheckbox, completed && styles.stepCheckboxDone]}>
        {completed ? (
          <Ionicons name="checkmark" size={14} color="#fff" />
        ) : (
          <Text style={styles.stepNumber}>{index + 1}</Text>
        )}
      </View>
      <View style={styles.stepBody}>
        <Text style={[styles.stepTitle, completed && styles.stepTitleDone]}>
          {step.title}
        </Text>
        <Text style={styles.stepDescription}>{step.description}</Text>
      </View>
    </Pressable>
  );
}

function MonitoringCard({
  elapsedSec,
  volumeMl,
  current,
  baselineSnapshot,
  pumpScaleAnim,
  onPumpPress,
}: {
  elapsedSec: number;
  volumeMl: number;
  current: ReturnType<typeof useReactionMonitor>['currentSnapshot'];
  baselineSnapshot: ReturnType<typeof useReactionMonitor>['currentSnapshot'];
  pumpScaleAnim: Animated.Value;
  onPumpPress: () => void;
}) {
  const bloodInfusedMl = Math.min(volumeMl, BLOOD_START_ML);

  const salineInfusedMl = Math.min(
    Math.round((elapsedSec / 3600) * 125),
    SALINE_START_ML
  );

  return (
    <View style={styles.card}>
      <View style={styles.monitorHeaderRow}>
        <View style={styles.monitorPulseDot} />
        <Text style={styles.monitorTitle}>Transfusion active</Text>
      </View>

      <View style={styles.monitorMetricsRow}>
        <View style={styles.monitorMetric}>
          <Text style={styles.monitorMetricLabel}>Elapsed</Text>
          <Text style={styles.monitorMetricValue}>
            {formatElapsed(elapsedSec)}
          </Text>
        </View>

        <View style={styles.monitorMetric}>
          <Text style={styles.monitorMetricLabel}>Infused</Text>
          <Text style={styles.monitorMetricValue}>
            {volumeMl} mL
          </Text>
        </View>
      </View>

      <View style={styles.ivSceneWrap}>
        <HomeIVScene
          bloodType="O-"
          bloodVolume={BLOOD_START_ML}
          bloodMaxVolume={BLOOD_MAX_ML}
          bloodInfusedMl={bloodInfusedMl}
          bloodUnitId="BB-9031"
          bloodProductName="Packed Red Cells"
          salineVolume={SALINE_START_ML}
          salineMaxVolume={SALINE_MAX_ML}
          salineInfusedMl={salineInfusedMl}
          salineUnitId="NS-7781"
          salineProductName="Sodium Chloride Injection"
          salineConcentration="0.9% NaCl"
          width={360}
          height={360}
        />
      </View>

      <TouchableOpacity
        activeOpacity={0.9}
        onPress={onPumpPress}
        style={styles.pumpTouchable}
      >
        <View style={styles.pumpCard}>
          <Animated.View
            style={[
              styles.pumpWrap,
              {
                transform: [{ scale: pumpScaleAnim }],
              },
            ]}
          >
            <SigmaPump
              drug="Packed RBC"
              value={volumeMl}
              unit="mL infused"
              mode="LIVE"
            />
          </Animated.View>
        </View>
      </TouchableOpacity>

      {current && baselineSnapshot && (
        <View style={styles.vitalsCompareRow}>
          <VitalCompare
            label="HR"
            current={current.heartRate}
            baseline={baselineSnapshot.heartRate}
          />

          <VitalCompare
            label="SBP"
            current={current.systolicBP}
            baseline={baselineSnapshot.systolicBP}
          />

          <VitalCompare
            label="RR"
            current={current.respiratoryRate}
            baseline={baselineSnapshot.respiratoryRate}
          />

          <VitalCompare
            label="SpO₂"
            current={current.spo2}
            baseline={baselineSnapshot.spo2}
            unit="%"
          />
        </View>
      )}
    </View>
  );
}

function VitalCompare({
  label,
  current,
  baseline,
  unit = '',
}: {
  label: string;
  current: number;
  baseline: number;
  unit?: string;
}) {
  const delta = current - baseline;
  const deltaSign = delta > 0 ? '+' : '';
  const deltaColor =
    Math.abs(delta) < 5 ? Colors.textMuted : Colors.warning;

  return (
    <View style={styles.vitalCompare}>
      <Text style={styles.vitalCompareLabel}>{label}</Text>
      <Text style={styles.vitalCompareValue}>
        {current}
        {unit}
      </Text>
      <Text style={[styles.vitalCompareDelta, { color: deltaColor }]}>
        {delta === 0 ? '0' : `${deltaSign}${delta}`}
      </Text>
    </View>
  );
}

function ReactionAlertCard({
  output,
}: {
  output: NonNullable<ReturnType<typeof useReactionMonitor>['output']>;
}) {
  const color = severityColor(output.severity);

  return (
    <View
      style={[
        styles.card,
        { borderColor: color, borderWidth: 2, backgroundColor: `${color}0F` },
      ]}
    >
      <View style={styles.alertHeaderRow}>
        <Ionicons
          name={output.severity === 'severe' ? 'warning' : 'alert-circle'}
          size={22}
          color={color}
        />
        <View style={{ flex: 1 }}>
          <Text style={[styles.alertSeverity, { color }]}>
            {severityLabel(output.severity).toUpperCase()}
          </Text>
          <Text style={styles.alertType}>
            Suspected: {formatReactionType(output.reactionType)}
          </Text>
        </View>

        <View style={[styles.probabilityBadge, { backgroundColor: color }]}>
          <Text style={styles.probabilityText}>
            {Math.round(output.reactionProbability * 100)}%
          </Text>
        </View>
      </View>

      {output.signs.length > 0 && (
        <View style={styles.signsBlock}>
          <Text style={styles.signsLabel}>Observed</Text>
          <View style={styles.signsRow}>
            {output.signs.map((sign, i) => (
              <View key={i} style={styles.signChip}>
                <Text style={styles.signChipText}>{sign}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      <View style={styles.actionBlock}>
        <Text style={styles.actionLabel}>Action</Text>
        <Text style={styles.actionText}>{output.action}</Text>
      </View>

      {(output.stopTransfusion || output.callMedControl) && (
        <View style={styles.flagsRow}>
          {output.stopTransfusion && (
            <View style={[styles.flag, { backgroundColor: Colors.danger }]}>
              <Ionicons name="hand-left" size={14} color="#fff" />
              <Text style={styles.flagText}>STOP TRANSFUSION</Text>
            </View>
          )}

          {output.callMedControl && (
 <Pressable
 style={({ pressed }) => [
   styles.flag,
   styles.medControlButton,
   pressed && styles.buttonPressed,
 ]}
 onPress={() =>
   Alert.alert(
     'Medical Control',
     'Choose a communication method for physician contact.',
     [
       {
         text: 'Voice Call',
         onPress: () =>
           Linking.openURL('tel:6174590219'),
       },
       {
         text: 'FaceTime Video',
         onPress: () =>
           Linking.openURL('facetime:6174590219'),
       },
       {
         text: 'Cancel',
         style: 'cancel',
       },
     ]
   )
 }
>
 <View style={styles.medControlContent}>
   <View style={styles.medControlIcon}>
     <Ionicons
       name="medkit"
       size={15}
       color="#fff"
     />
   </View>

   <View style={styles.medControlTextWrap}>
     <Text style={styles.flagText}>
       MED CONTROL
     </Text>

     <Text style={styles.medControlSubtext}>
       Tap to call or start video consult
     </Text>
   </View>
 </View>

 <Ionicons
   name="chevron-forward"
   size={16}
   color="rgba(255,255,255,0.9)"
 />
</Pressable>
          )}
        </View>
      )}

      {output.medications.length > 0 && (
        <View style={styles.medicationsBlock}>
          <Text style={styles.medicationsLabel}>Suggested medications</Text>
          {output.medications.map((m, i) => (
            <Text key={i} style={styles.medicationItem}>
              • {m}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

function MedicNoteCard({
    value,
    onChange,
  }: {
    value: string;
    onChange: (text: string) => void;
  }) {
    // Collapsed by default — frees up screen real estate during normal
    // monitoring. The user expands when they want to type or review.
    // Resets to collapsed on every entry to monitoring mode (i.e. every
    // component mount), which is intentional — fresh focus on vitals.
    const [expanded, setExpanded] = useState(false);
  
    // Ref to programmatically focus the input from the "Dictate" button.
    // Tapping summons the keyboard one tap sooner than tapping into the
    // input itself. The iOS keyboard's built-in mic does the actual STT.
    const inputRef = useRef<TextInput>(null);
  
    const handleDictatePress = () => {
      inputRef.current?.focus();
    };
  
    // When expanding via "Show note", also focus the input so the medic
    // can type immediately. When expanding to view an existing note, don't
    // steal focus — they might just be reading.
    const handleToggleExpanded = () => {
      setExpanded((prev) => !prev);
    };
  
    const hasContent = value.trim().length > 0;
    const previewText = hasContent
      ? value.length > 60
        ? `${value.slice(0, 60).trim()}…`
        : value
      : null;
  
    return (
      <View style={[styles.card, styles.noteCard]}>
        {/* Collapsed/expanded header — always visible, tappable */}
        <Pressable
          onPress={handleToggleExpanded}
          style={({ pressed }) => [
            styles.noteHeaderRow,
            pressed && { opacity: 0.85 },
          ]}
        >
          <Ionicons
            name="document-text-outline"
            size={16}
            color={Colors.warning}
          />
          <View style={styles.noteHeaderText}>
            <Text style={styles.noteTitle}>Observation note</Text>
            {!expanded && previewText && (
              <Text style={styles.notePreview} numberOfLines={1}>
                {previewText}
              </Text>
            )}
            {!expanded && !previewText && (
              <Text style={styles.notePreviewEmpty}>
                Tap to add observations
              </Text>
            )}
          </View>
          {hasContent && (
            <View style={styles.noteCountBadge}>
              <Text style={styles.noteCountText}>
                {value.length}
              </Text>
            </View>
          )}
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={Colors.warning}
          />
        </Pressable>
  
        {/* Expanded body */}
        {expanded && (
          <View style={styles.noteBody}>
            <Text style={styles.noteHint}>
              Free-text observations to include in the radio handoff summary
              (e.g. "patient reports chest tightness," "slowed infusion rate at 2 min").
            </Text>
  
            <TextInput
              ref={inputRef}
              style={styles.noteInput}
              value={value}
              onChangeText={onChange}
              multiline
              textAlignVertical="top"
              autoCorrect
              autoCapitalize="sentences"
              placeholder="Tap to add a note…"
              placeholderTextColor={Colors.textMuted}
            />
  
            <Pressable
              style={({ pressed }) => [
                styles.dictateButton,
                pressed && { opacity: 0.85 },
              ]}
              onPress={handleDictatePress}
            >
              <Ionicons name="mic-outline" size={16} color={Colors.warning} />
              <Text style={styles.dictateButtonText}>
                Tap to dictate — use the mic on the keyboard
              </Text>
            </Pressable>
          </View>
        )}
      </View>
    );
  }

function ControlsCard({
  simulationMode,
  onSimulationChange,
  speechEnabled,
  onSpeechChange,
}: {
  simulationMode: SimulationMode;
  onSimulationChange: (m: SimulationMode) => void;
  speechEnabled: boolean;
  onSpeechChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.controlsTitle}>Simulation controls</Text>
      <Text style={styles.controlsHint}>
        Switch the trajectory to rehearse alert flow. Real BLE vitals
        integration replaces this in a future version.
      </Text>

      <Text style={styles.controlLabel}>Trajectory</Text>
      <View style={styles.simRow}>
        {(['normal', 'reaction'] as SimulationMode[]).map((m) => (
          <Pressable
            key={m}
            onPress={() => onSimulationChange(m)}
            style={[
              styles.simChip,
              simulationMode === m && styles.simChipActive,
            ]}
          >
            <Text
              style={[
                styles.simChipText,
                simulationMode === m && styles.simChipTextActive,
              ]}
            >
              {m[0].toUpperCase() + m.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.switchRow}>
        <View>
          <Text style={styles.controlLabel}>Spoken alerts</Text>
          <Text style={styles.controlSubLabel}>Speak on severity changes</Text>
        </View>
        <Switch
          value={speechEnabled}
          onValueChange={onSpeechChange}
          trackColor={{ false: Colors.borderStrong, true: Colors.primary }}
        />
      </View>
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
  scrollContent: { padding: 14, paddingBottom: 32, gap: 12 },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },

  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  progressLabel: { fontSize: 13, fontWeight: '700', color: Colors.text },
  progressPct: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.primary,
    fontVariant: ['tabular-nums'],
  },
  progressBar: {
    height: 8,
    borderRadius: 999,
    backgroundColor: Colors.surfaceMuted,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: Colors.primary },

  baselineCard: {
    backgroundColor: '#EFF6FF',
    borderColor: Colors.primaryLight,
  },
  baselineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  baselineTitle: { fontSize: 14, fontWeight: '800', color: Colors.primary },
  baselineHint: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 17,
    marginBottom: 10,
  },
  baselineRow: { flexDirection: 'row', gap: 10 },
  baselineField: { flex: 1 },
  baselineFieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  baselineInput: {
    backgroundColor: Colors.surface,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },

  stepCard: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  stepCardDone: { opacity: 0.65, backgroundColor: Colors.surfaceMuted },
  stepCheckbox: {
    width: 28,
    height: 28,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: Colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  stepCheckboxDone: {
    backgroundColor: Colors.success,
    borderColor: Colors.success,
  },
  stepNumber: { fontSize: 13, fontWeight: '800', color: Colors.textSecondary },
  stepBody: { flex: 1, gap: 4 },
  stepTitle: { fontSize: 15, fontWeight: '700', color: Colors.text },
  stepTitleDone: { textDecorationLine: 'line-through', color: Colors.textMuted },
  stepDescription: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },

  beginButton: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: Colors.success,
    marginTop: 4,
  },
  beginButtonDisabled: { backgroundColor: Colors.borderStrong },
  beginButtonText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  buttonPressed: { opacity: 0.85 },

  monitorHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  monitorPulseDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: Colors.danger,
  },
  monitorTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.danger,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  monitorMetricsRow: { flexDirection: 'row', gap: 16, marginBottom: 14 },
  monitorMetric: {
    flex: 1,
    backgroundColor: Colors.surfaceMuted,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  monitorMetricLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  monitorMetricValue: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.text,
    fontVariant: ['tabular-nums'],
  },
  vitalsCompareRow: { flexDirection: 'row', gap: 8 },
  vitalCompare: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    backgroundColor: Colors.surfaceMuted,
    borderRadius: 10,
  },
  vitalCompareLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  vitalCompareValue: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  vitalCompareDelta: {
    fontSize: 10,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },

  stableCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F0FDF4',
    borderColor: Colors.success,
  },
  stableText: { flex: 1, fontSize: 13, color: Colors.text, fontWeight: '600' },

  alertHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  alertSeverity: { fontSize: 13, fontWeight: '900', letterSpacing: 0.4 },
  alertType: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text,
    marginTop: 2,
  },
  probabilityBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  probabilityText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  signsBlock: { marginBottom: 12 },
  signsLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  signsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  signChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  signChipText: { fontSize: 11, fontWeight: '700', color: Colors.text },
  actionBlock: { marginBottom: 10 },
  actionLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  actionText: {
    fontSize: 13,
    color: Colors.text,
    lineHeight: 18,
    fontWeight: '600',
  },
  flagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  flag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  flagText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  medicationsBlock: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: 3,
  },
  medicationsLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  medicationItem: { fontSize: 12, color: Colors.text, fontWeight: '600' },

  // Medic note card
  noteCard: {
    backgroundColor: '#FFFBEB',
    borderColor: Colors.warning,
    borderWidth: 1.5,
  },
//   noteHeader: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     gap: 6,
//     marginBottom: 6,
//   },
//   noteTitle: {
//     fontSize: 13,
//     fontWeight: '800',
//     color: '#92400E',
//     textTransform: 'uppercase',
//     letterSpacing: 0.4,
//   },
//   noteHint: {
//     fontSize: 12,
//     color: Colors.textSecondary,
//     lineHeight: 17,
//     marginBottom: 10,
//   },
// Note card — collapsible header + body
noteHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
 
  },
  noteHeaderText: {
    flex: 1,
    gap: 2,
  },
  noteTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#92400E',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  notePreview: {
    fontSize: 12,
    color: Colors.text,
    fontWeight: '600',
  },
  notePreviewEmpty: {
    fontSize: 11,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
  noteCountBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: Colors.warning,
    minWidth: 28,
    alignItems: 'center',
  },
  noteCountText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  noteBody: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.warning,
  },
  noteHint: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 17,
    marginBottom: 10,
  },
  noteInput: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    fontSize: 14,
    color: Colors.text,
    lineHeight: 21,
    fontWeight: '500',
    minHeight: 80,
  },

  controlsTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 4,
  },
  controlsHint: {
    fontSize: 11,
    color: Colors.textMuted,
    fontStyle: 'italic',
    lineHeight: 16,
    marginBottom: 12,
  },
  controlLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  controlSubLabel: { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  simRow: { flexDirection: 'row', gap: 8, marginTop: 6, marginBottom: 14 },
  simChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  simChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  simChipText: { fontSize: 12, fontWeight: '700', color: Colors.text },
  simChipTextActive: { color: '#fff' },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },

  endButton: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: Colors.danger,
  },
  endButtonText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  dictateButton: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: Colors.warning,
    marginTop: 10,
  },
  dictateButtonText: {
    color: '#92400E',
    fontSize: 12,
    fontWeight: '700',
  },
  medControlButton: {
    backgroundColor: Colors.warning,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
  
    shadowColor: Colors.warning,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 3,
  },
  
  medControlContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  
  medControlIcon: {
    width: 30,
    height: 30,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  
  medControlTextWrap: {
    flex: 1,
  },
  
  medControlSubtext: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
  },
  ivSceneWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    marginBottom: 12,
    overflow: 'hidden',
  },
  
  pumpTouchable: {
    alignSelf: 'center',
  
    marginTop: -200,
  
   
  },
  
  pumpCard: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  
  pumpWrap: {
    width: PUMP_WRAP_W,
    height: PUMP_WRAP_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
});