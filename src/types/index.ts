/**
 * Core domain types for the prehospital blood transfusion app.
 *
 * Everything that gets persisted, passed between screens, or sent to the
 * backend should have a type here. If a shape is used in only one screen,
 * keep it local to that screen — this file is for shared contracts.
 */

// --- Blood inventory ------------------------------------------------------

/** ABO + Rh blood types we support in the scanner and inventory. */
export type BloodType =
  | 'O+'
  | 'O-'
  | 'A+'
  | 'A-'
  | 'B+'
  | 'B-'
  | 'AB+'
  | 'AB-';

/** One physical unit of blood on the truck. */
export interface BloodUnit {
  /** Unique id from the bag label (QR or manual). */
  id: string;
  bloodType: BloodType;
  /** ISO date string, e.g. "2026-06-15". */
  expiryDate: string;
  /** Current temperature reading, in °C. Cold-chain target is 2–6 °C. */
  temperatureCelsius: number;
  /** ISO date string of when the unit was drawn. Optional — not all labels carry it. */
  collectionDate?: string;
}

// --- Patient + clinical ---------------------------------------------------

/** Mechanism of injury — drives some scoring weights. */
export type InjuryType = 'blunt' | 'penetrating' | 'other';

/**
 * Minimum vitals needed to evaluate transfusion eligibility.
 * The ML models accept extra fields; this is the core subset.
 */
export interface PatientVitals {
  /** Systolic blood pressure, mmHg. */
  systolicBP: number;
  /** Heart rate, beats per minute. */
  heartRate: number;
  injuryType: InjuryType;
}

/**
 * Result of running the eligibility rules engine.
 * `reasons` lists every failed criterion when `eligible` is false;
 * empty array when eligible.
 */
export interface EligibilityResult {
  eligible: boolean;
  reasons: string[];
  /** Shock index = heartRate / systolicBP, rounded to 2 decimals. */
  shockIndex: number;
}

// --- Call (encounter) state ----------------------------------------------

/**
 * State of the current EMS encounter. One active call at a time.
 * Persisted in AsyncStorage so the app survives backgrounding.
 */
export interface CallState {
  active: boolean;
  /** ISO timestamp when the call was started. Null when no call active. */
  startTime: string | null;
  patientVitals: PatientVitals | null;
  eligibilityResult: EligibilityResult | null;
  /** The specific unit the medic chose to hang. */
  selectedBloodUnit: BloodUnit | null;
}

// --- Location -------------------------------------------------------------

/** GPS reading + reverse-geocoded state name. */
export interface UserLocation {
  latitude: number;
  longitude: number;
  /** US state name from reverse geocoding, e.g. "Massachusetts". */
  state: string | null;
  /** ISO timestamp of when this fix was taken. */
  timestamp: string;
}

// --- Navigation -----------------------------------------------------------

/**
 * Bottom tab navigator route names.
 * Used by React Navigation for typed `navigation.navigate(...)` calls.
 * `undefined` means the route takes no params.
 */
export type RootTabParamList = {
  Home: undefined;
  Eligibility: undefined;
  Inventory: undefined;
  Checklist: undefined;
  Alert: undefined;
};