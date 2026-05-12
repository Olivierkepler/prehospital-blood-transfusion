/**
 * Clinical risk assessment orchestrator.
 *
 * Bundles Model 1 (shock predictor) and Model 2 (survival estimator) into a
 * single call so screens get a complete picture without manually threading
 * Model 1's outputs into Model 2's inputs.
 *
 * Model 3 (reaction monitor) is NOT included here — it has a different
 * lifecycle (continuous snapshot monitoring during transfusion, driven by
 * useReactionMonitor in Phase 5) and a different input shape.
 *
 * This file is also the public surface for the ml/ directory. Screens
 * should import from '../ml', not from '../ml/shockPredictor' etc.
 */

import {
    predictShockRisk,
    ShockPredictorInput,
    ShockPredictorOutput,
  } from './shockPredictor';
  import {
    estimateSurvival,
    SurvivalEstimatorOutput,
  } from './survivalEstimator';
  
  // Re-exports — screens import these from '../ml'.
  export {
    predictShockRisk,
    estimateSurvival,
  };
  export {
    monitorForReaction,
    formatReactionType,
  } from './reactionMonitor';
  
  export type {
    ShockPredictorInput,
    ShockPredictorOutput,
    ShockSeverityBand,
    ShockClass,
  } from './shockPredictor';
  export type {
    SurvivalEstimatorInput,
    SurvivalEstimatorOutput,
    SurvivalProjection,
    UrgencyLevel,
  } from './survivalEstimator';
  export type {
    VitalsSnapshot,
    ReactionType,
    ReactionSeverity,
    ReactionMonitorOutput,
  } from './reactionMonitor';
  
  // --- Full assessment input ----------------------------------------------
  
  /**
   * Combined input for the orchestrator. Includes everything Model 1 needs,
   * plus the extras Model 2 needs that Model 1 doesn't (minutes to hospital,
   * transfusion initiated, TXA given).
   */
  export interface FullAssessmentInput extends ShockPredictorInput {
    /** Estimated minutes to hospital. Required for Model 2. */
    minutesToHospital: number;
    /** Has the medic initiated transfusion? Default false. */
    transfusionInitiated?: boolean;
    /** TXA administered? Default false. */
    txa?: boolean;
  }
  
  /** Combined output — Model 1's results plus Model 2's results. */
  export interface FullAssessmentOutput {
    shock: ShockPredictorOutput;
    survival: SurvivalEstimatorOutput;
  }
  
  // --- Public entry point -------------------------------------------------
  
  /**
   * Run the full clinical risk assessment: shock prediction + survival estimate.
   *
   * Pure, synchronous. Safe to call inside useMemo.
   */
  export function runFullMLAssessment(
    input: FullAssessmentInput
  ): FullAssessmentOutput {
    const shock = predictShockRisk(input);
  
    const survival = estimateSurvival({
      riskScore: shock.riskScore,
      shockIndex: shock.shockIndex,
      shockClass: shock.shockClass,
      gcs: input.gcs,
      systolicBP: input.systolicBP,
      respiratoryRate: input.respiratoryRate,
      age: input.age,
      mechanism: input.mechanism,
      minutesSinceInjury: input.minutesSinceInjury,
      minutesToHospital: input.minutesToHospital,
      transfusionInitiated: input.transfusionInitiated ?? false,
      txa: input.txa ?? false,
    });
  
    return { shock, survival };
  }