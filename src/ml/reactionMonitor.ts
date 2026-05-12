/**
 * Reaction monitor — Model 3.
 *
 * Watches for early signs of transfusion reactions by comparing baseline
 * vs current vitals (plus recent trend) against a table of known reaction
 * signatures. Returns the highest-probability match.
 *
 * IMPORTANT: deterministic pattern-matching. Signature thresholds are
 * author-set, informed by clinical literature on transfusion reactions
 * (TRALI, TACO, hemolytic, allergic, anaphylactic, septic, febrile
 * non-hemolytic) but NOT calibrated against patient outcome data. Use as
 * a decision aid that prompts clinical reassessment, not as a diagnosis.
 *
 * Pure, synchronous, no I/O. Safe to call inside a polling hook.
 */

// --- Input / output shapes ----------------------------------------------

/** A single point-in-time vitals snapshot during transfusion monitoring. */
export interface VitalsSnapshot {
    /** Unix ms timestamp. */
    timestamp: number;
    heartRate: number;
    systolicBP: number;
    respiratoryRate: number;
    spo2: number;
    /** Skin / core temperature in °C. */
    temperatureCelsius: number;
    /** Volume of blood infused so far, mL. */
    volumeInfusedMl: number;
  }
  
  export type ReactionType =
    | 'none'
    | 'febrile_non_hemolytic'
    | 'allergic'
    | 'anaphylaxis'
    | 'acute_hemolytic'
    | 'taco'
    | 'septic'
    | 'trali';
  
  export type ReactionSeverity = 'none' | 'mild' | 'moderate' | 'severe';
  
  export interface ReactionMonitorOutput {
    /** 0–1 probability that *some* reaction is in progress. */
    reactionProbability: number;
    /** Best-match reaction classification. */
    reactionType: ReactionType;
    severity: ReactionSeverity;
    /** Recommended action text appropriate to severity. */
    action: string;
    /** Human-readable observed warning signs. */
    signs: string[];
    /** Should the medic stop the transfusion immediately. */
    stopTransfusion: boolean;
    /** Should the medic contact online medical control. */
    callMedControl: boolean;
    /** Suggested medications keyed to reaction type. */
    medications: string[];
  }
  
  // --- Display helper -----------------------------------------------------
  
  /** Map an internal reaction type to a UI label. */
  export function formatReactionType(type: ReactionType): string {
    switch (type) {
      case 'febrile_non_hemolytic':
        return 'Febrile non-hemolytic';
      case 'allergic':
        return 'Allergic / urticarial';
      case 'anaphylaxis':
        return 'Anaphylaxis';
      case 'acute_hemolytic':
        return 'Acute hemolytic';
      case 'taco':
        return 'TACO (circulatory overload)';
      case 'septic':
        return 'Septic';
      case 'trali':
        return 'TRALI';
      case 'none':
      default:
        return 'No reaction detected';
    }
  }
  
  // --- Anomaly score: "is something happening at all?" ---------------------
  
  interface VitalsDelta {
    hrChange: number;
    sbpChange: number;
    rrChange: number;
    spo2Change: number;
    tempChange: number;
  }
  
  function computeDelta(
    baseline: VitalsSnapshot,
    current: VitalsSnapshot
  ): VitalsDelta {
    return {
      hrChange: current.heartRate - baseline.heartRate,
      sbpChange: current.systolicBP - baseline.systolicBP,
      rrChange: current.respiratoryRate - baseline.respiratoryRate,
      spo2Change: current.spo2 - baseline.spo2,
      tempChange: current.temperatureCelsius - baseline.temperatureCelsius,
    };
  }
  
  /**
   * Weighted "something is changing" score in [0, 1]. Combines absolute deltas
   * (current vs baseline) and trend (last 3 snapshots). Below ~0.15, treat as
   * normal variation.
   */
  function calcAnomalyScore(
    baseline: VitalsSnapshot,
    current: VitalsSnapshot,
    history: VitalsSnapshot[]
  ): number {
    const delta = computeDelta(baseline, current);
  
    // Per-variable contributions. Each saturates so one extreme reading
    // doesn't dominate the whole score.
    const hrTerm = Math.min(1, Math.abs(delta.hrChange) / 40);
    const sbpTerm = Math.min(1, Math.abs(delta.sbpChange) / 40);
    const rrTerm = Math.min(1, Math.abs(delta.rrChange) / 14);
    const spo2Term = Math.min(1, Math.abs(delta.spo2Change) / 10);
    const tempTerm = Math.min(1, Math.abs(delta.tempChange) / 2);
  
    // Trend term: are the last few readings drifting in the same direction?
    // Catches gradual TRALI/TACO developments that single-snapshot deltas miss.
    let trendTerm = 0;
    if (history.length >= 3) {
      const recent = history.slice(-3);
      const hrTrend = recent[2].heartRate - recent[0].heartRate;
      const sbpTrend = recent[2].systolicBP - recent[0].systolicBP;
      const rrTrend = recent[2].respiratoryRate - recent[0].respiratoryRate;
      trendTerm = Math.min(
        1,
        (Math.abs(hrTrend) + Math.abs(sbpTrend) + Math.abs(rrTrend)) / 40
      );
    }
  
    // Weighted sum. Weights chosen so a single variable can't push past ~0.4
    // alone — multiple variables must move together to reach high probability.
    const score =
      hrTerm * 0.2 +
      sbpTerm * 0.2 +
      rrTerm * 0.2 +
      spo2Term * 0.15 +
      tempTerm * 0.15 +
      trendTerm * 0.1;
  
    return Math.min(1, score);
  }
  
  // --- Reaction signatures -------------------------------------------------
  
  /**
   * A signature describes what a specific reaction "looks like" in deltas
   * from baseline. Each function returns a 0–1 match score for that pattern.
   *
   * Notes encoded below are author-set and rough — real clinical patterns
   * overlap (hemolytic and septic both involve HR up + BP down). The monitor
   * picks the highest-scoring signature and is honest in the UI when scores
   * are close.
   */
  
  function scoreFebrile(delta: VitalsDelta): number {
    // Hallmark: temp rise ≥0.8°C with mild HR/RR rise, BP roughly stable.
    let s = 0;
    if (delta.tempChange >= 0.8) s += 0.5;
    if (delta.hrChange >= 10 && delta.hrChange < 30) s += 0.2;
    if (delta.rrChange >= 2 && delta.rrChange < 8) s += 0.15;
    if (Math.abs(delta.sbpChange) <= 15) s += 0.15;
    return s;
  }
  
  function scoreAllergic(delta: VitalsDelta): number {
    // Hallmark: mild HR rise without BP drop, no fever, often no respiratory.
    let s = 0;
    if (delta.hrChange >= 8 && delta.hrChange < 25) s += 0.4;
    if (Math.abs(delta.sbpChange) <= 10) s += 0.2;
    if (Math.abs(delta.tempChange) < 0.5) s += 0.2;
    if (delta.rrChange >= 0 && delta.rrChange < 6) s += 0.2;
    return s;
  }
  
  function scoreAnaphylaxis(delta: VitalsDelta): number {
    // Hallmark: severe HR up, sharp BP drop, RR up, SpO2 drop.
    let s = 0;
    if (delta.hrChange >= 25) s += 0.35;
    if (delta.sbpChange <= -25) s += 0.3;
    if (delta.rrChange >= 6) s += 0.2;
    if (delta.spo2Change <= -3) s += 0.15;
    return s;
  }
  
  function scoreAcuteHemolytic(delta: VitalsDelta): number {
    // Hallmark: HR up + BP drop, sometimes fever. Less respiratory than anaphylaxis.
    let s = 0;
    if (delta.hrChange >= 20) s += 0.35;
    if (delta.sbpChange <= -20) s += 0.3;
    if (delta.tempChange >= 0.5) s += 0.2;
    if (Math.abs(delta.rrChange) < 6) s += 0.15;
    return s;
  }
  
  function scoreTaco(delta: VitalsDelta): number {
    // Hallmark: BP UP (volume overload), RR up, SpO2 drop. HR variable.
    let s = 0;
    if (delta.sbpChange >= 20) s += 0.4;
    if (delta.rrChange >= 4) s += 0.25;
    if (delta.spo2Change <= -2) s += 0.25;
    if (Math.abs(delta.tempChange) < 0.5) s += 0.1;
    return s;
  }
  
  function scoreSeptic(delta: VitalsDelta): number {
    // Hallmark: fever, HR up, BP drop. Similar to anaphylaxis but with fever
    // and slower respiratory progression.
    let s = 0;
    if (delta.tempChange >= 1.0) s += 0.4;
    if (delta.hrChange >= 15) s += 0.25;
    if (delta.sbpChange <= -15) s += 0.25;
    if (delta.rrChange >= 2) s += 0.1;
    return s;
  }
  
  function scoreTrali(delta: VitalsDelta): number {
    // Hallmark: RR up, SpO2 drop, BP normal-to-low. No fever required, no BP rise.
    let s = 0;
    if (delta.rrChange >= 6) s += 0.35;
    if (delta.spo2Change <= -4) s += 0.35;
    if (delta.sbpChange <= 5) s += 0.2; // not a rise (rules out TACO)
    if (Math.abs(delta.tempChange) < 0.8) s += 0.1;
    return s;
  }
  
  function classifyReaction(delta: VitalsDelta): {
    type: ReactionType;
    matchScore: number;
  } {
    const scores: Array<{ type: ReactionType; score: number }> = [
      { type: 'febrile_non_hemolytic', score: scoreFebrile(delta) },
      { type: 'allergic', score: scoreAllergic(delta) },
      { type: 'anaphylaxis', score: scoreAnaphylaxis(delta) },
      { type: 'acute_hemolytic', score: scoreAcuteHemolytic(delta) },
      { type: 'taco', score: scoreTaco(delta) },
      { type: 'septic', score: scoreSeptic(delta) },
      { type: 'trali', score: scoreTrali(delta) },
    ];
  
    scores.sort((a, b) => b.score - a.score);
    const best = scores[0];
  
    return { type: best.type, matchScore: best.score };
  }
  
  // --- Severity and action -----------------------------------------------
  
  function severityFor(
    probability: number,
    type: ReactionType
  ): ReactionSeverity {
    if (probability < 0.3) return 'none';
  
    // Reactions known to be severe in clinical practice always get at least
    // moderate when probability is meaningful.
    const intrinsicallySevere: ReactionType[] = [
      'anaphylaxis',
      'acute_hemolytic',
      'septic',
      'trali',
    ];
  
    if (intrinsicallySevere.includes(type)) {
      return probability >= 0.55 ? 'severe' : 'moderate';
    }
  
    // TACO is moderate-leaning.
    if (type === 'taco') {
      return probability >= 0.6 ? 'severe' : 'moderate';
    }
  
    // Febrile non-hemolytic and allergic — mostly mild even at high probability.
    return probability >= 0.7 ? 'moderate' : 'mild';
  }
  
  function actionFor(
    severity: ReactionSeverity,
    type: ReactionType
  ): string {
    if (severity === 'none') {
      return 'Continue monitoring. Reassess vitals every 5 minutes.';
    }
    if (severity === 'mild') {
      return 'Slow the infusion. Reassess in 2 minutes. Document signs.';
    }
    if (severity === 'moderate') {
      return 'Pause the transfusion. Reassess immediately. Contact medical control if no improvement in 2 minutes.';
    }
    // severe
    if (type === 'anaphylaxis') {
      return 'Stop transfusion. Epinephrine IM, support airway, contact medical control immediately.';
    }
    if (type === 'trali' || type === 'taco') {
      return 'Stop transfusion. Support oxygenation, sit patient upright, contact medical control.';
    }
    if (type === 'acute_hemolytic') {
      return 'Stop transfusion. Maintain IV access with saline, contact medical control, save the bag for analysis.';
    }
    return 'Stop transfusion. Contact medical control immediately.';
  }
  
  function signsFor(delta: VitalsDelta): string[] {
    const signs: string[] = [];
    if (delta.tempChange >= 0.8) signs.push(`Temp rise ${delta.tempChange.toFixed(1)}°C`);
    if (delta.hrChange >= 15) signs.push(`HR up ${delta.hrChange} bpm`);
    if (delta.hrChange <= -15) signs.push(`HR down ${Math.abs(delta.hrChange)} bpm`);
    if (delta.sbpChange <= -15) signs.push(`SBP down ${Math.abs(delta.sbpChange)} mmHg`);
    if (delta.sbpChange >= 20) signs.push(`SBP up ${delta.sbpChange} mmHg`);
    if (delta.rrChange >= 4) signs.push(`RR up ${delta.rrChange}`);
    if (delta.spo2Change <= -3) signs.push(`SpO₂ down ${Math.abs(delta.spo2Change)}%`);
    return signs;
  }
  
  function medicationsFor(type: ReactionType): string[] {
    switch (type) {
      case 'anaphylaxis':
        return ['Epinephrine 0.3–0.5 mg IM', 'Diphenhydramine IV', 'Methylprednisolone IV'];
      case 'allergic':
        return ['Diphenhydramine IV or PO'];
      case 'febrile_non_hemolytic':
        return ['Acetaminophen PO/IV', 'Antipyretic per protocol'];
      case 'taco':
        return ['Furosemide IV (per medical control)', 'Oxygen, upright positioning'];
      case 'trali':
        return ['Supplemental oxygen', 'Mechanical ventilation if indicated'];
      case 'acute_hemolytic':
        return ['Normal saline IV to maintain output', 'No medications without medical control'];
      case 'septic':
        return ['Broad-spectrum antibiotics per medical control', 'IV fluids', 'Vasopressor support if hypotensive'];
      case 'none':
      default:
        return [];
    }
  }
  
  // --- Public entry point --------------------------------------------------
  
  export function monitorForReaction(
    baseline: VitalsSnapshot,
    current: VitalsSnapshot,
    history: VitalsSnapshot[]
  ): ReactionMonitorOutput {
    const anomaly = calcAnomalyScore(baseline, current, history);
  
    // Below 0.15, we treat everything as normal variation. Zeros out the
    // classification entirely — important so noise doesn't drive a "mild
    // febrile reaction" alert during a routine infusion.
    if (anomaly < 0.15) {
      return {
        reactionProbability: 0,
        reactionType: 'none',
        severity: 'none',
        action: actionFor('none', 'none'),
        signs: [],
        stopTransfusion: false,
        callMedControl: false,
        medications: [],
      };
    }
  
    const delta = computeDelta(baseline, current);
    const { type, matchScore } = classifyReaction(delta);
  
    // Probability = anomaly × signature match. Anomaly says "something is
    // happening"; match says "and it looks like THIS specific thing."
    const reactionProbability = Math.round(anomaly * matchScore * 100) / 100;
  
    const severity = severityFor(reactionProbability, type);
    const signs = signsFor(delta);
  
    return {
      reactionProbability,
      reactionType: severity === 'none' ? 'none' : type,
      severity,
      action: actionFor(severity, type),
      signs,
      stopTransfusion: severity === 'severe',
      callMedControl: severity === 'severe' || severity === 'moderate',
      medications: medicationsFor(severity === 'none' ? 'none' : type),
    };
  }