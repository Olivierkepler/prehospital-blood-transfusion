/**
 * ER alert outbox — persistent queue for pre-arrival alerts.
 *
 * Problem: alerts get triggered in moving ambulances where cell signal
 * is unreliable. We can't lose them, and we can't block the UI on
 * network calls. So we:
 *   1. queueAlert() always succeeds locally — writes to AsyncStorage
 *   2. flushOutbox() tries to send queued items when online
 *   3. startOutboxFlusher() runs flush on an interval AND on connectivity
 *      changes, so alerts drain quickly when signal returns
 *
 * Items that fail 5+ times are dropped with a warning — a stuck alert
 * shouldn't grow the queue forever or block fresher alerts.
 *
 * The endpoint URL points at the README's placeholder host. Real
 * deployments would set this from app config; for now sends will
 * predictably fail with a network error, which the outbox handles
 * gracefully.
 */

import NetInfo from '@react-native-community/netinfo';

import {
  EligibilityResult,
  PatientVitals,
} from '../types';
import {
  FullAssessmentOutput,
} from '../ml';
import { load, save, StorageKeys } from './localStorage';

// --- Endpoint ------------------------------------------------------------

const ALERTS_ENDPOINT = 'https://api.bloodready.app/alerts';
const SEND_TIMEOUT_MS = 8000;
const FLUSH_INTERVAL_MS = 30_000;
const MAX_ATTEMPTS = 5;

// --- Payload shape -------------------------------------------------------

/**
 * Wire format for an ER pre-alert. The receiving system gets a structured
 * snapshot of the call: who, what, where, the medic's clinical assessment,
 * and the planned transfusion intervention.
 */
export interface AlertPayload {
  callId: string;
  timestamp: string;
  detectedState: string;
  /** Patient name as known to the medic. Empty string when unknown. */
  patientName: string;
  vitals: PatientVitals | null;
  /** Full ML assessment if available (risk score + survival). */
  mlAssessment?: FullAssessmentOutput;
  /** Transfusion details. */
  transfusion: {
    unitId: string | null;
    bloodType: string | null;
    initiated: boolean;
    /** Seconds elapsed since transfusion started. */
    elapsedSec?: number;
    /** mL infused at time of alert. */
    volumeInfusedMl?: number;
    /** Worst severity observed during transfusion. */
    peakSeverity?: 'none' | 'mild' | 'moderate' | 'severe';
    /** Type of reaction at peak severity. */
    peakReactionType?: string | null;
    /** Medic's free-text observation note. */
    medicNote?: string;
  };
  /** Protocol context. */
  protocol: {
    state: string;
    version: string | null;
    /** Whether the patient is under medical-direction order (MDO). */
    mdoActive: boolean;
  };
  /**
   * Medic-edited radio handoff paragraph, if present. The structured
   * fields above are always authoritative; this is a human-readable
   * narrative the receiving facility can read alongside them.
   * Optional — older alerts without it remain valid.
   */
  radioSummary?: string;
}

/** Internal queue entry — payload plus retry bookkeeping. */
interface PendingAlert {
  id: string;
  payload: AlertPayload;
  /** When this alert first entered the queue. */
  queuedAt: string;
  /** When we last attempted to send it. Null if never tried. */
  lastAttemptAt: string | null;
  attempts: number;
  status: 'pending' | 'failed';
}

// --- Internal helpers ---------------------------------------------------

async function readQueue(): Promise<PendingAlert[]> {
  return (await load<PendingAlert[]>(StorageKeys.pendingAlerts)) ?? [];
}

async function writeQueue(queue: PendingAlert[]): Promise<void> {
  await save(StorageKeys.pendingAlerts, queue);
}

function makeId(): string {
  return `alert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Send one alert with a timeout. Returns true on 2xx, false on anything
 * else (network error, non-2xx, timeout). We don't distinguish failure
 * reasons here — the queue retries on next flush regardless.
 */
async function sendOne(payload: AlertPayload): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);

  try {
    const response = await fetch(ALERTS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

// --- Public API ---------------------------------------------------------

/**
 * Add an alert to the queue. Always succeeds locally. If the device is
 * online, kicks off a flush immediately so the alert sends without waiting
 * for the next interval tick.
 */
export async function queueAlert(payload: AlertPayload): Promise<void> {
  const entry: PendingAlert = {
    id: makeId(),
    payload,
    queuedAt: new Date().toISOString(),
    lastAttemptAt: null,
    attempts: 0,
    status: 'pending',
  };

  const queue = await readQueue();
  queue.push(entry);
  await writeQueue(queue);

  // Fire-and-forget immediate flush attempt. We don't await it because
  // queueAlert should return as soon as the local write is durable.
  const netState = await NetInfo.fetch();
  if (netState.isConnected && netState.isInternetReachable !== false) {
    void flushOutbox();
  }
}

/**
 * Try to send every pending alert. Reads the queue, attempts each in turn,
 * removes successes, increments attempts on failures, and drops items past
 * MAX_ATTEMPTS. Returns the count of items still pending after the flush.
 */
export async function flushOutbox(): Promise<{
  sent: number;
  pending: number;
  dropped: number;
}> {
  const queue = await readQueue();
  if (queue.length === 0) return { sent: 0, pending: 0, dropped: 0 };

  // Pre-flight: don't even try if we know we're offline. Saves time and
  // avoids tripping the timeout/abort path 10 times in a row.
  const netState = await NetInfo.fetch();
  if (!netState.isConnected || netState.isInternetReachable === false) {
    return { sent: 0, pending: queue.length, dropped: 0 };
  }

  let sent = 0;
  let dropped = 0;
  const remaining: PendingAlert[] = [];

  for (const entry of queue) {
    const ok = await sendOne(entry.payload);
    if (ok) {
      sent += 1;
      continue;
    }

    const nextAttempts = entry.attempts + 1;
    if (nextAttempts >= MAX_ATTEMPTS) {
      console.warn(
        `[outbox] dropping alert ${entry.id} after ${nextAttempts} attempts`
      );
      dropped += 1;
      continue;
    }

    remaining.push({
      ...entry,
      attempts: nextAttempts,
      lastAttemptAt: new Date().toISOString(),
      status: 'failed',
    });
  }

  await writeQueue(remaining);
  return { sent, pending: remaining.length, dropped };
}

/**
 * Start the background flusher. Returns a cleanup function the caller
 * should invoke when the app shuts down (or when AppProvider unmounts,
 * which in practice never happens but it's the right shape).
 *
 * Two triggers:
 *   - Interval every FLUSH_INTERVAL_MS (covers idle apps where nothing
 *     else nudges the queue)
 *   - NetInfo subscription: flush when device transitions to connected
 *     (covers the "tunnel ends, signal returns" case)
 */
export function startOutboxFlusher(): () => void {
  // Initial flush on startup — in case the app was killed mid-flush
  // last time and there are stale items.
  void flushOutbox();

  const interval = setInterval(() => {
    void flushOutbox();
  }, FLUSH_INTERVAL_MS);

  // Track previous connection state so we only flush on offline → online
  // transitions, not on every NetInfo broadcast.
  let wasOnline: boolean | null = null;
  const unsubscribe = NetInfo.addEventListener((state) => {
    const isOnline =
      !!state.isConnected && state.isInternetReachable !== false;
    if (wasOnline === false && isOnline) {
      void flushOutbox();
    }
    wasOnline = isOnline;
  });

  return () => {
    clearInterval(interval);
    unsubscribe();
  };
}

/**
 * Read the current pending count without modifying the queue.
 * Called by useConnectivity for the header badge.
 */
export async function getPendingCount(): Promise<number> {
  const queue = await readQueue();
  return queue.length;
}

/**
 * Wipe every entry in the queue. For "reset app" flows and tests.
 */
export async function clearOutbox(): Promise<void> {
  await writeQueue([]);
}