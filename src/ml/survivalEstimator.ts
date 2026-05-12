/**
 * Survival estimator — Model 2.
 *
 * Consumes Model 1's outputs plus additional clinical and operational
 * variables, returns survival projections with and without transfusion.
 *
 * IMPORTANT: this is a deterministic scoring function. The baseline survival
 * table, penalty functions, and transfusion-benefit curve are author-set
 * defaults informed by trauma literature, NOT calibrated against outcomes.
 * Treat outputs as a triage aid, not a clinical prediction.
 *
 * Pure, synchronous, no I/O. Safe to call inside useMemo.
 */

import { InjuryType } from '../types';
import { ShockClass } from './shockPredictor';

// --- Input / output shapes ----------------------------------------------

export interface SurvivalEstimatorInput {
  /** From Model 1. */
  riskScore: number;
  /** From Model 1. */
  shockIndex: number;
  /** From Model 1. */
  shockClass: ShockClass;

  /** Glasgow Coma Scale 3–15. Optional. */
  gcs?: number;
  /** Systolic BP, mmHg. */
  systolicBP: number;
  /** Respiratory rate, breaths/min. Optional. */
  respiratoryRate?: number;
  /** Patient age, years. Optional. */
  age?: number;
  mechanism: InjuryType;

  /** Minutes between injury and assessment. Optional. */
  minutesSinceInjury?: number;
  /** Estimated minutes to hospital. */
  minutesToHospital: number;

  /** Did the medic initiate transfusion? */
  transfusionInitiated: boolean;
  /** Tranexamic acid administered. */
  txa: boolean;
}

export type UrgencyLevel = 'immediate' | 'urgent' | 'monitor' | 'stable';

/**
 * A projected survival value at a future time point. Used to render the
 * timeline showing how the patient's situation deteriorates without action.
 */
export interface SurvivalProjection {
  /** Minutes from now. */
  atMinute: number;
  /** Survival % without further intervention. */
  withoutTransfusion: number;
  /** Survival % if transfusion is initiated immediately. */
  withTransfusion: number;
}

export interface SurvivalEstimatorOutput {
  /** Survival probability % (0–100) with no transfusion, current state. */
  withoutTransfusion: number;
  /** Survival probability % if transfusion is initiated. */
  withTransfusion: number;
  /** Benefit in percentage points (withTransfusion − withoutTransfusion). */
  benefit: number;
  /**
   * Estimated cost of each minute of delay, in percentage points of survival.
   * Small for stable patients, large for class IV shock.
   */
  minuteValue: number;
  urgencyLevel: UrgencyLevel;
  /** One-line, time-pressuring message appropriate to urgency. */
  timeMessage: string;
  /** Projection points at +0, +5, +10, +15, +20 minutes. */
  projectedAt: SurvivalProjection[];
}

// --- Baseline survival by shock class -----------------------------------

/**
 * Starting "without transfusion" survival % by shock class. These are
 * author-set defaults. Real numbers would come from a registry-derived
 * outcome model (TQIP, NEMSIS), not from a constant table.
 */
const BASELINE_SURVIVAL: Record<ShockClass, number> = {
  I: 96,
  II: 88,
  III: 70,
  IV: 42,
};

// --- Penalty and benefit functions --------------------------------------

function agePenalty(age: number | undefined): number {
  if (age === undefined) return 0;
  if (age >= 75) return 12;
  if (age >= 65) return 7;
  if (age >= 55) return 3;
  if (age <= 5) return 8;
  if (age <= 12) return 4;
  return 0;
}

function mechanismPenalty(mechanism: InjuryType): number {
  switch (mechanism) {
    case 'penetrating':
      return 8;
    case 'blunt':
      return 4;
    case 'other':
    default:
      return 2;
  }
}

function gcsPenalty(gcs: number | undefined): number {
  if (gcs === undefined) return 0;
  if (gcs <= 8) return 14;
  if (gcs <= 12) return 6;
  return 0;
}

function respiratoryPenalty(rr: number | undefined): number {
  if (rr === undefined) return 0;
  if (rr >= 30 || rr < 8) return 8;
  if (rr > 24) return 3;
  return 0;
}

function delayPenalty(minutes: number | undefined): number {
  if (minutes === undefined) return 0;
  if (minutes >= 60) return 10;
  if (minutes >= 30) return 5;
  if (minutes >= 15) return 2;
  return 0;
}

/**
 * Faster transport reduces the gap a small amount — represents the value
 * of getting to definitive care quickly. Bigger for high-risk patients.
 */
function transportBonus(minutesToHospital: number, riskScore: number): number {
  if (minutesToHospital <= 5) return 6;
  if (minutesToHospital <= 15) return riskScore >= 60 ? 4 : 3;
  if (minutesToHospital <= 30) return 1;
  return 0;
}

/**
 * Benefit added by initiating transfusion, in percentage points. Scales
 * with risk — higher-risk patients gain more from prehospital transfusion.
 * TXA gives a small additional bump in penetrating trauma scenarios.
 */
function transfusionBenefit(
  riskScore: number,
  shockClass: ShockClass,
  txa: boolean,
  mechanism: InjuryType
): number {
  // Roughly: at riskScore 1, benefit ~1pp; at riskScore 99, benefit ~22pp.
  // Class IV gets a small extra boost on top.
  const base = 1 + (riskScore / 99) * 21;
  const classBoost = shockClass === 'IV' ? 4 : shockClass === 'III' ? 2 : 0;
  const txaBoost = txa && mechanism === 'penetrating' ? 3 : txa ? 1.5 : 0;
  return Math.round((base + classBoost + txaBoost) * 10) / 10;
}

// --- Urgency classification ---------------------------------------------

function urgencyFrom(
  withoutTransfusion: number,
  benefit: number,
  shockClass: ShockClass
): UrgencyLevel {
  if (shockClass === 'IV' || withoutTransfusion < 50) return 'immediate';
  if (shockClass === 'III' || benefit >= 12) return 'urgent';
  if (shockClass === 'II' || benefit >= 6) return 'monitor';
  return 'stable';
}

function urgencyMessage(
  urgency: UrgencyLevel,
  minuteValue: number,
  minutesToHospital: number
): string {
  switch (urgency) {
    case 'immediate':
      return `Every minute costs ~${minuteValue.toFixed(1)}pp survival. ${minutesToHospital} min to hospital — transfuse now, do not wait.`;
    case 'urgent':
      return `Each minute of delay costs ~${minuteValue.toFixed(1)}pp survival. Initiate transfusion en route.`;
    case 'monitor':
      return `Patient stable but trending. Prepare unit, reassess vitals every 5 minutes.`;
    case 'stable':
    default:
      return `Patient stable. Standard resuscitation; transfusion not indicated by current trajectory.`;
  }
}

// --- Minute value (slope) -----------------------------------------------

/**
 * Estimated survival cost per minute of delay, in percentage points.
 * Steeper for higher-risk patients. Used for both the timeline projection
 * and the urgency message.
 */
function minuteValueFor(shockClass: ShockClass, riskScore: number): number {
  switch (shockClass) {
    case 'IV':
      return 1.8 + (riskScore / 99) * 0.6;
    case 'III':
      return 0.9 + (riskScore / 99) * 0.4;
    case 'II':
      return 0.3 + (riskScore / 99) * 0.2;
    case 'I':
    default:
      return 0.05;
  }
}

// --- Projection over time ------------------------------------------------

function projectTimeline(
  withoutNow: number,
  withNow: number,
  minuteValue: number
): SurvivalProjection[] {
  const points = [0, 5, 10, 15, 20];
  return points.map((m) => ({
    atMinute: m,
    // Without transfusion, drift down by minuteValue per minute, floored at 0.
    withoutTransfusion: Math.max(0, Math.round((withoutNow - minuteValue * m) * 10) / 10),
    // With transfusion, the benefit erodes more slowly (transfusion has bought
    // time, but isn't infinite). Half the slope.
    withTransfusion: Math.max(0, Math.round((withNow - minuteValue * 0.5 * m) * 10) / 10),
  }));
}

// --- Public entry point -------------------------------------------------

export function estimateSurvival(
  input: SurvivalEstimatorInput
): SurvivalEstimatorOutput {
  // Start from baseline by shock class.
  const baseline = BASELINE_SURVIVAL[input.shockClass];

  // Apply penalties.
  const penalties =
    agePenalty(input.age) +
    mechanismPenalty(input.mechanism) +
    gcsPenalty(input.gcs) +
    respiratoryPenalty(input.respiratoryRate) +
    delayPenalty(input.minutesSinceInjury);

  // Apply transport bonus (small).
  const bonus = transportBonus(input.minutesToHospital, input.riskScore);

  const withoutTransfusion = Math.max(
    1,
    Math.min(99, Math.round((baseline - penalties + bonus) * 10) / 10)
  );

  const benefit = transfusionBenefit(
    input.riskScore,
    input.shockClass,
    input.txa,
    input.mechanism
  );

  const withTransfusion = Math.max(
    1,
    Math.min(99, Math.round((withoutTransfusion + benefit) * 10) / 10)
  );

  const minuteValue = minuteValueFor(input.shockClass, input.riskScore);
  const urgencyLevel = urgencyFrom(withoutTransfusion, benefit, input.shockClass);
  const timeMessage = urgencyMessage(
    urgencyLevel,
    minuteValue,
    input.minutesToHospital
  );
  const projectedAt = projectTimeline(withoutTransfusion, withTransfusion, minuteValue);

  return {
    withoutTransfusion,
    withTransfusion,
    benefit: Math.round(benefit * 10) / 10,
    minuteValue: Math.round(minuteValue * 10) / 10,
    urgencyLevel,
    timeMessage,
    projectedAt,
  };
}