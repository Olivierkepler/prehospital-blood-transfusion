/**
 * Shock Index — HR / SBP.
 *
 * Used both as a direct eligibility criterion (≥ SHOCK_INDEX_THRESHOLD) and
 * as an input to the risk-scoring functions in src/ml/. This file is the
 * single source of truth for the calculation and severity bands so the
 * eligibility engine, ML models, and UI all agree on the same numbers.
 *
 * Pure functions, no side effects, no I/O. Safe to call during render.
 */

import {
    SHOCK_INDEX_CRITICAL,
    SHOCK_INDEX_THRESHOLD,
  } from '../constants/protocols';
  
  /** How we describe a shock index value across the app. */
  export type ShockSeverity = 'normal' | 'concerning' | 'critical';
  
  /**
   * Compute shock index = heart rate / systolic BP.
   *
   * Returns 0 if `systolicBP` is non-positive (a clinically impossible reading,
   * usually meaning the field is empty / not yet entered). 0 is safe because
   * downstream code treats it as "below threshold" — i.e. don't trigger anything
   * on missing data. Returning NaN would propagate badly through comparisons.
   *
   * Rounded to two decimals so display and comparisons don't drift on the
   * 15th decimal place of floating-point.
   */
  export function computeShockIndex(
    heartRate: number,
    systolicBP: number
  ): number {
    if (!Number.isFinite(heartRate) || !Number.isFinite(systolicBP)) return 0;
    if (systolicBP <= 0) return 0;
    if (heartRate < 0) return 0;
  
    const raw = heartRate / systolicBP;
    return Math.round(raw * 100) / 100;
  }
  
  /**
   * Map a shock index value to a severity band.
   *
   *   < SHOCK_INDEX_THRESHOLD  → normal
   *   < SHOCK_INDEX_CRITICAL   → concerning  (≥ threshold but < critical)
   *   otherwise                → critical
   *
   * Note: 0 (the "missing data" sentinel from computeShockIndex) maps to
   * "normal" — intentional. We don't want to flash a critical warning while
   * the medic is still typing the BP into the form.
   */
  export function getShockSeverity(shockIndex: number): ShockSeverity {
    if (shockIndex >= SHOCK_INDEX_CRITICAL) return 'critical';
    if (shockIndex >= SHOCK_INDEX_THRESHOLD) return 'concerning';
    return 'normal';
  }
  
  /**
   * Format a shock index for display: "0.92", "1.24", "—" for missing data.
   *
   * Using an em dash for missing data is a small UX choice — clearer than
   * "0.00" (which looks like a real reading) when vitals aren't entered yet.
   */
  export function formatShockIndex(shockIndex: number): string {
    if (shockIndex <= 0) return '—';
    return shockIndex.toFixed(2);
  }