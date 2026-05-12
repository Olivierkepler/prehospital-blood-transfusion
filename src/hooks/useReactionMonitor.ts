/**
 * useReactionMonitor — drives Model 3 (monitorForReaction) on a tick during
 * simulated transfusion.
 *
 * Manages baseline / current / history vitals snapshots, elapsed time,
 * volume infused, and optional spoken status updates. Speech fires only
 * on severity transitions so the medic isn't told "monitoring" every 10s.
 *
 * Simulation: the README is explicit that the drift logic in driftVitals
 * is a stand-in until BLE vitals integration. In production with a real
 * vitals monitor, replace the setInterval below with a BLE listener that
 * pushes new VitalsSnapshots into the history.
 */

import { useEffect, useRef, useState } from 'react';
import * as Speech from 'expo-speech';

import { PatientVitals } from '../types';
import {
  monitorForReaction,
  ReactionMonitorOutput,
  ReactionSeverity,
  VitalsSnapshot,
  formatReactionType,
} from '../ml';

const TICK_MS = 10_000;
const HISTORY_LIMIT = 30;

/**
 * Volume infusion rate (mL/min). 100 mL/min is a typical rapid-infuser
 * rate; lower for the first 15 minutes per protocol. We use a flat 60
 * mL/min for the simulation — close enough for the demo.
 */
const ML_PER_MINUTE = 60;

export type SimulationMode = 'normal' | 'reaction';

interface UseReactionMonitorArgs {
  /** Whether monitoring is active. Tick stops when false. */
  active: boolean;
  /** Vitals captured at transfusion start. Anchors all delta calculations. */
  baselineVitals: PatientVitals | null;
  /** Which simulated trajectory to drift toward. */
  simulationMode: SimulationMode;
  /** Speak severity transitions. */
  speechEnabled: boolean;
}

interface UseReactionMonitorResult {
  output: ReactionMonitorOutput | null;
  elapsedSec: number;
  volumeInfusedMl: number;
  currentSnapshot: VitalsSnapshot | null;
  history: VitalsSnapshot[];
}

// --- Simulated drift -----------------------------------------------------

/**
 * Build the initial snapshot from baseline vitals. Fills in defaults for
 * fields PatientVitals doesn't carry (RR, SpO2, temp). When BLE integration
 * lands, this whole function goes away.
 */
function buildInitialSnapshot(
  baseline: PatientVitals,
  startTime: number
): VitalsSnapshot {
  return {
    timestamp: startTime,
    heartRate: baseline.heartRate,
    systolicBP: baseline.systolicBP,
    respiratoryRate: 16,
    spo2: 98,
    temperatureCelsius: 36.8,
    volumeInfusedMl: 0,
  };
}

/**
 * Drift one snapshot toward either a normal or reaction trajectory.
 * Small random jitter (±1-2) overlaid on a directional bias.
 */
function driftVitals(
  previous: VitalsSnapshot,
  baseline: VitalsSnapshot,
  mode: SimulationMode,
  elapsedSec: number
): VitalsSnapshot {
  // Tiny jitter so the timeline doesn't look frozen.
  const jitter = () => (Math.random() - 0.5) * 2;

  if (mode === 'normal') {
    return {
      ...previous,
      timestamp: Date.now(),
      heartRate: clamp(baseline.heartRate + jitter() * 2, 40, 180),
      systolicBP: clamp(baseline.systolicBP + jitter() * 3, 60, 200),
      respiratoryRate: clamp(baseline.respiratoryRate + jitter(), 8, 30),
      spo2: clamp(previous.spo2 + jitter() * 0.5, 90, 100),
      temperatureCelsius:
        Math.round((baseline.temperatureCelsius + jitter() * 0.1) * 10) / 10,
      volumeInfusedMl: previous.volumeInfusedMl + (ML_PER_MINUTE * TICK_MS) / 60000,
    };
  }

  // Reaction mode: drift toward an "anaphylaxis-like" pattern over ~3 minutes.
  // Progress factor 0..1 from start to ~180s.
  const progress = Math.min(1, elapsedSec / 180);

  return {
    ...previous,
    timestamp: Date.now(),
    heartRate: Math.round(
      baseline.heartRate + progress * 35 + jitter() * 2
    ),
    systolicBP: Math.round(
      baseline.systolicBP - progress * 30 + jitter() * 3
    ),
    respiratoryRate: Math.round(
      baseline.respiratoryRate + progress * 8 + jitter()
    ),
    spo2: Math.round(98 - progress * 5 + jitter() * 0.5),
    temperatureCelsius:
      Math.round(
        (baseline.temperatureCelsius + progress * 0.5 + jitter() * 0.1) * 10
      ) / 10,
    volumeInfusedMl: previous.volumeInfusedMl + (ML_PER_MINUTE * TICK_MS) / 60000,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

// --- Hook ----------------------------------------------------------------

export function useReactionMonitor(
  args: UseReactionMonitorArgs
): UseReactionMonitorResult {
  const { active, baselineVitals, simulationMode, speechEnabled } = args;

  const [history, setHistory] = useState<VitalsSnapshot[]>([]);
  const [output, setOutput] = useState<ReactionMonitorOutput | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [volumeInfusedMl, setVolumeInfusedMl] = useState(0);

  // Refs so the tick callback always sees the latest values without
  // re-creating the interval each tick.
  const baselineSnapshotRef = useRef<VitalsSnapshot | null>(null);
  const lastSpokenSeverityRef = useRef<ReactionSeverity | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const simulationModeRef = useRef<SimulationMode>(simulationMode);

  // Keep simulationModeRef in sync without restarting the interval.
  useEffect(() => {
    simulationModeRef.current = simulationMode;
  }, [simulationMode]);

  // Main tick lifecycle: starts when active flips true, tears down when false.
  useEffect(() => {
    if (!active || !baselineVitals) {
      // Reset state when monitoring stops.
      setHistory([]);
      setOutput(null);
      setElapsedSec(0);
      setVolumeInfusedMl(0);
      baselineSnapshotRef.current = null;
      lastSpokenSeverityRef.current = null;
      startTimeRef.current = null;
      return;
    }

    const start = Date.now();
    startTimeRef.current = start;
    const initial = buildInitialSnapshot(baselineVitals, start);
    baselineSnapshotRef.current = initial;
    setHistory([initial]);

    const tick = () => {
      const baseline = baselineSnapshotRef.current;
      if (!baseline) return;
      const startedAt = startTimeRef.current;
      if (!startedAt) return;

      const now = Date.now();
      const elapsed = Math.floor((now - startedAt) / 1000);

      setHistory((prev) => {
        const last = prev[prev.length - 1] ?? baseline;
        const next = driftVitals(last, baseline, simulationModeRef.current, elapsed);
        const updated = [...prev, next].slice(-HISTORY_LIMIT);

        // Run the monitor and update output/speech as a side effect of this
        // setState. Doing it inside the updater means we always use the
        // freshest snapshot, not a stale closure.
        const result = monitorForReaction(baseline, next, updated);
        setOutput(result);
        setElapsedSec(elapsed);
        setVolumeInfusedMl(Math.round(next.volumeInfusedMl));

        // Speech: only fire on severity transitions.
        if (
          speechEnabled &&
          result.severity !== lastSpokenSeverityRef.current &&
          result.severity !== 'none'
        ) {
          const phrase =
            result.severity === 'severe'
              ? `Severe reaction suspected. ${formatReactionType(result.reactionType)}. Stop transfusion.`
              : result.severity === 'moderate'
              ? `Moderate reaction signs detected. ${formatReactionType(result.reactionType)}. Pause and reassess.`
              : `Mild reaction signs. Continue monitoring.`;
          Speech.speak(phrase, { rate: 0.95 });
        }
        lastSpokenSeverityRef.current = result.severity;

        return updated;
      });
    };

    const interval = setInterval(tick, TICK_MS);

    // Run one tick immediately so the medic sees something within a second
    // of tapping Begin transfusion, not after waiting 10s.
    tick();

    return () => {
      clearInterval(interval);
      Speech.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, baselineVitals, speechEnabled]);

  return {
    output,
    elapsedSec,
    volumeInfusedMl,
    currentSnapshot: history[history.length - 1] ?? null,
    history,
  };
}