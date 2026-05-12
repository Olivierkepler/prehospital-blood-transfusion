/**
 * Eligibility engine — combines clinical, legal, and logistical criteria
 * into a single EligibilityResult.
 *
 * Order of checks (each appends a reason on failure; we run all of them
 * so the medic sees every blocker at once):
 *   1. Legal authority — state protocol authorizes prehospital transfusion
 *   2. Clinical threshold — shock index ≥ SHOCK_INDEX_THRESHOLD
 *   3. Blood chain — a unit is selected, in temperature range, not expired
 *   4. Contraindications — placeholder, not yet implemented
 *
 * Pure function. Safe to call during render or inside useMemo.
 *
 * Disclaimer: the rules and thresholds in this file are software defaults
 * for a development demo. They are not a substitute for the local medical
 * direction, scope-of-practice rules, or blood-bank procedures that govern
 * real prehospital transfusion. A medical director should review and
 * approve any thresholds before deployment.
 */

import {
    BLOOD_TEMP_MAX,
    BLOOD_TEMP_MIN,
    SHOCK_INDEX_THRESHOLD,
    STATE_PROTOCOLS,
  } from '../constants/protocols';
  import {
    BloodUnit,
    EligibilityResult,
    PatientVitals,
  } from '../types';
  import { computeShockIndex } from './shockIndex';
  
  /**
   * Evaluate eligibility for prehospital transfusion.
   *
   * @param vitals          Patient vitals — at minimum systolicBP, heartRate, injuryType.
   * @param selectedUnit    The blood unit the medic plans to hang, or null if none chosen yet.
   * @param detectedState   US state name from reverse geocoding (or default).
   * @returns               EligibilityResult — eligible only when reasons[] is empty.
   */
  export function checkEligibility(
    vitals: PatientVitals,
    selectedUnit: BloodUnit | null,
    detectedState: string
  ): EligibilityResult {
    const reasons: string[] = [];
    const shockIndex = computeShockIndex(vitals.heartRate, vitals.systolicBP);
  
    // 1. Legal authority -----------------------------------------------------
    const stateKey = detectedState.trim();
    const stateProtocol = STATE_PROTOCOLS[stateKey];
  
    if (!stateProtocol) {
      // Unknown state — could mean stale protocol cache, an unsupported region,
      // or a typo in the geocoded name. We do NOT block on this; we log and
      // let the medic proceed. The Eligibility screen surfaces the missing
      // protocol so the medic knows the legal-authority check is being skipped.
      console.warn(
        `[eligibility] No protocol entry for state "${stateKey}". ` +
          `Legal-authority check skipped.`
      );
    } else if (!stateProtocol.authorized) {
      reasons.push(
        `Prehospital transfusion not authorized in ${stateKey}: ${stateProtocol.notes}`
      );
    }
  
    // 2. Clinical threshold --------------------------------------------------
    if (shockIndex < SHOCK_INDEX_THRESHOLD) {
      reasons.push(
        `Shock index ${shockIndex.toFixed(2)} is below the ${SHOCK_INDEX_THRESHOLD} ` +
          `threshold for transfusion.`
      );
    }
  
    // 3. Blood chain ---------------------------------------------------------
    if (!selectedUnit) {
      reasons.push('No blood unit selected from inventory.');
    } else {
      const tempOk =
        selectedUnit.temperatureCelsius >= BLOOD_TEMP_MIN &&
        selectedUnit.temperatureCelsius <= BLOOD_TEMP_MAX;
  
      if (!tempOk) {
        reasons.push(
          `Unit ${selectedUnit.id} is outside the ${BLOOD_TEMP_MIN}–${BLOOD_TEMP_MAX}°C ` +
            `range (currently ${selectedUnit.temperatureCelsius}°C).`
        );
      }
  
      const now = new Date();
      const expiry = new Date(selectedUnit.expiryDate);
      if (Number.isNaN(expiry.getTime())) {
        reasons.push(`Unit ${selectedUnit.id} has an invalid expiry date.`);
      } else if (expiry.getTime() < now.getTime()) {
        reasons.push(
          `Unit ${selectedUnit.id} expired on ${selectedUnit.expiryDate}.`
        );
      }
    }
  
    // 4. Contraindications ---------------------------------------------------
    // TODO(future): documented contraindications (e.g. known IgA deficiency
    // with anaphylaxis history, religious refusal, advance directives).
    // Requires structured contraindication input from the medic UI.
  
    return {
      eligible: reasons.length === 0,
      reasons,
      shockIndex,
    };
  }