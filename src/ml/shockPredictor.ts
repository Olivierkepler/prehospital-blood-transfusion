/**
 * Shock predictor — Model 1.
 *
 * Takes patient vitals plus mechanism and minutes-since-injury, returns a
 * weighted-sum risk score (1–99) and structured outputs the UI can render.
 *
 * IMPORTANT: this is a deterministic scoring function, not a trained ML
 * model. The weights below are hand-set, informed by trauma scoring
 * literature (shock index, GCS, RR, age, mechanism are all known prognostic
 * variables) but NOT calibrated against outcome data. Treat the score as a
 * decision aid for triage thinking, not a validated prediction.
 *
 * Pure, synchronous, no I/O. Safe to call inside useMemo.
 */

import { InjuryType } from '../types';
import { computeShockIndex } from '../logic/shockIndex';

// --- Input / output shapes ----------------------------------------------

export interface ShockPredictorInput {
  heartRate: number;
  systolicBP: number;
  /** Respiratory rate, breaths/min. Optional — score works without it but with lower confidence. */
  respiratoryRate?: number;
  /** Glasgow Coma Scale 3–15. Optional. */
  gcs?: number;
  /** Oxygen saturation %. Optional. */
  spo2?: number;
  /** Patient age in years. Optional. */
  age?: number;
  /** Mechanism of injury. */
  mechanism: InjuryType;
  /** Minutes between injury and assessment. Optional. */
  minutesSinceInjury?: number;
}

export type ShockSeverityBand = 'low' | 'moderate' | 'high' | 'critical';

/** ATLS-style hemorrhagic shock class. */
export type ShockClass = 'I' | 'II' | 'III' | 'IV';

export interface ShockPredictorOutput {
  /** 1–99 integer. Higher = higher concern. */
  riskScore: number;
  severity: ShockSeverityBand;
  shockIndex: number;
  shockClass: ShockClass;
  /** One-line recommendation appropriate to severity. */
  recommendation: string;
  /** Up to three contributing factors, ordered by weight. */
  topFactors: string[];
  /** Confidence of the score given how many optional inputs were provided. */
  confidence: 'low' | 'moderate' | 'high';
}

// --- Weights -------------------------------------------------------------

/**
 * Sub-score weights. Sum to 1.0. Tuning these is the main lever if/when
 * we ever calibrate against outcome data.
 */
const WEIGHTS = {
  shockIndex: 0.32,
  gcs: 0.22,
  respiratoryRate: 0.14,
  spo2: 0.1,
  age: 0.08,
  mechanism: 0.08,
  delay: 0.06,
} as const;

// --- Sub-score functions ------------------------------------------------

/**
 * Each sub-score returns 0..1 where 1 = maximum concern for that variable.
 * Keeping them as separate functions makes the model auditable — you can
 * read one and see exactly what it does.
 */

function shockIndexSubScore(si: number): number {
  // Clinically: ≥1.4 is "extreme tachycardia relative to BP" — saturate at 1.
  // Below 0.5 is essentially normal — floor at 0.
  if (si >= 1.4) return 1;
  if (si <= 0.5) return 0;
  return (si - 0.5) / (1.4 - 0.5);
}

function gcsSubScore(gcs: number | undefined): number {
  if (gcs === undefined) return 0;
  // GCS 15 = normal, 3 = no response. Linear inverse.
  if (gcs >= 15) return 0;
  if (gcs <= 3) return 1;
  return (15 - gcs) / 12;
}

function respiratoryRateSubScore(rr: number | undefined): number {
  if (rr === undefined) return 0;
  // 12–20 normal; tachypnea ≥30 is high concern; bradypnea <8 is also concerning.
  if (rr >= 12 && rr <= 20) return 0;
  if (rr >= 30 || rr < 8) return 1;
  if (rr > 20) return (rr - 20) / 10;
  return (12 - rr) / 4;
}

function spo2SubScore(spo2: number | undefined): number {
  if (spo2 === undefined) return 0;
  if (spo2 >= 95) return 0;
  if (spo2 <= 80) return 1;
  return (95 - spo2) / 15;
}

function ageSubScore(age: number | undefined): number {
  if (age === undefined) return 0;
  // Pediatric and geriatric patients deteriorate faster from blood loss.
  if (age >= 65) return Math.min(1, 0.4 + (age - 65) / 50);
  if (age <= 12) return 0.5;
  if (age >= 55) return 0.25;
  return 0;
}

function mechanismSubScore(mechanism: InjuryType): number {
  // Penetrating trauma has higher early-mortality risk than blunt in
  // hemorrhagic shock contexts.
  switch (mechanism) {
    case 'penetrating':
      return 0.8;
    case 'blunt':
      return 0.5;
    case 'other':
    default:
      return 0.3;
  }
}

function delaySubScore(minutes: number | undefined): number {
  if (minutes === undefined) return 0;
  // The "golden hour" framing: risk climbs with delay.
  if (minutes <= 10) return 0;
  if (minutes >= 90) return 1;
  return (minutes - 10) / 80;
}

// --- Classification helpers ---------------------------------------------

function classifyShock(
  shockIndex: number,
  sbp: number,
  gcs: number | undefined
): ShockClass {
  // Loose ATLS-style mapping:
  //   I:   minimal — SI < 0.9
  //   II:  mild    — SI 0.9–1.0
  //   III: moderate — SI > 1.0 OR SBP < 90
  //   IV:  severe  — SI > 1.4 OR SBP < 70 OR GCS < 9 with hypotension
  if (shockIndex > 1.4 || sbp < 70 || (gcs !== undefined && gcs < 9 && sbp < 90)) {
    return 'IV';
  }
  if (shockIndex > 1.0 || sbp < 90) return 'III';
  if (shockIndex >= 0.9) return 'II';
  return 'I';
}

function bandFromScore(score: number): ShockSeverityBand {
  if (score >= 80) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 35) return 'moderate';
  return 'low';
}

function recommendationFor(
  band: ShockSeverityBand,
  shockClass: ShockClass
): string {
  switch (band) {
    case 'critical':
      return `Class ${shockClass} shock pattern. Initiate transfusion immediately, contact medical control en route, request mass-transfusion activation on arrival.`;
    case 'high':
      return `Class ${shockClass} shock pattern. Strongly consider transfusion, expedite transport, pre-alert receiving facility.`;
    case 'moderate':
      return `Class ${shockClass} pattern. Continue resuscitation, reassess vitals every 5 minutes, prepare unit for possible transfusion.`;
    case 'low':
    default:
      return `Class ${shockClass} pattern. Standard resuscitation. Transfusion not indicated by current vitals.`;
  }
}

function topFactorsFrom(subScores: {
  shockIndex: number;
  gcs: number;
  respiratoryRate: number;
  spo2: number;
  age: number;
  mechanism: number;
  delay: number;
}): string[] {
  const labeled: Array<{ label: string; weighted: number }> = [
    {
      label: 'Elevated shock index',
      weighted: subScores.shockIndex * WEIGHTS.shockIndex,
    },
    { label: 'Reduced GCS', weighted: subScores.gcs * WEIGHTS.gcs },
    {
      label: 'Respiratory rate abnormal',
      weighted: subScores.respiratoryRate * WEIGHTS.respiratoryRate,
    },
    { label: 'Hypoxia (SpO₂)', weighted: subScores.spo2 * WEIGHTS.spo2 },
    { label: 'Age risk', weighted: subScores.age * WEIGHTS.age },
    { label: 'Mechanism risk', weighted: subScores.mechanism * WEIGHTS.mechanism },
    {
      label: 'Time since injury',
      weighted: subScores.delay * WEIGHTS.delay,
    },
  ];

  return labeled
    .filter((f) => f.weighted > 0.02) // ignore negligible contributors
    .sort((a, b) => b.weighted - a.weighted)
    .slice(0, 3)
    .map((f) => f.label);
}

function confidenceFrom(input: ShockPredictorInput): 'low' | 'moderate' | 'high' {
  // Heart rate and SBP are the two essentials. Each additional optional
  // field raises confidence — 3+ optionals = high.
  const optionalsProvided = [
    input.respiratoryRate,
    input.gcs,
    input.spo2,
    input.age,
    input.minutesSinceInjury,
  ].filter((v) => v !== undefined).length;

  if (optionalsProvided >= 3) return 'high';
  if (optionalsProvided >= 1) return 'moderate';
  return 'low';
}

// --- Public entry point -------------------------------------------------

export function predictShockRisk(
  input: ShockPredictorInput
): ShockPredictorOutput {
  const shockIndex = computeShockIndex(input.heartRate, input.systolicBP);

  // Compute each sub-score (0..1).
  const subScores = {
    shockIndex: shockIndexSubScore(shockIndex),
    gcs: gcsSubScore(input.gcs),
    respiratoryRate: respiratoryRateSubScore(input.respiratoryRate),
    spo2: spo2SubScore(input.spo2),
    age: ageSubScore(input.age),
    mechanism: mechanismSubScore(input.mechanism),
    delay: delaySubScore(input.minutesSinceInjury),
  };

  // Weighted sum, mapped to 1..99.
  const weightedSum =
    subScores.shockIndex * WEIGHTS.shockIndex +
    subScores.gcs * WEIGHTS.gcs +
    subScores.respiratoryRate * WEIGHTS.respiratoryRate +
    subScores.spo2 * WEIGHTS.spo2 +
    subScores.age * WEIGHTS.age +
    subScores.mechanism * WEIGHTS.mechanism +
    subScores.delay * WEIGHTS.delay;

  // weightedSum is in [0, 1]. Scale to [1, 99] integer.
  const riskScore = Math.max(1, Math.min(99, Math.round(weightedSum * 99)));

  const severity = bandFromScore(riskScore);
  const shockClass = classifyShock(shockIndex, input.systolicBP, input.gcs);

  return {
    riskScore,
    severity,
    shockIndex,
    shockClass,
    recommendation: recommendationFor(severity, shockClass),
    topFactors: topFactorsFrom(subScores),
    confidence: confidenceFrom(input),
  };
}