/**
 * Clinical constants, state protocol lookup, and checklist steps.
 *
 * All values here are static defaults bundled with the app binary.
 * `protocolCache.ts` may overwrite STATE_PROTOCOLS at runtime with a
 * fresher copy from the server. Thresholds and checklist steps are not
 * overridden at runtime.
 *
 * IMPORTANT: The state authorization data below is illustrative placeholder
 * content for development and demo. Do NOT treat it as authoritative EMS
 * policy. Production deployments must source protocol authorization from
 * the agency's medical director or an authoritative registry.
 */

// --- Clinical thresholds -------------------------------------------------

/**
 * Shock index (HR / SBP) above which transfusion criteria are met.
 * 0.9 is a commonly cited cutoff in trauma literature for hemorrhage concern.
 */
export const SHOCK_INDEX_THRESHOLD = 0.9;

/** Shock index above which the patient is considered critically unstable. */
export const SHOCK_INDEX_CRITICAL = 1.2;

/** Cold-chain temperature range for stored blood, in °C. */
export const BLOOD_TEMP_MIN = 2;
export const BLOOD_TEMP_MAX = 6;

/** Days before expiry at which a unit should be flagged as "expiring soon". */
export const EXPIRY_WARNING_DAYS = 3;

// --- State protocols -----------------------------------------------------

/**
 * Per-state authorization for prehospital whole-blood transfusion.
 * Keyed by full state name as returned by reverse geocoding.
 *
 * `authorized`: whether the rules engine should allow transfusion in this state.
 * `version`: opaque version string; used to detect when cached protocols are stale.
 * `notes`: free-text shown in the Eligibility screen so the medic sees context.
 */
export interface StateProtocol {
  authorized: boolean;
  version: string;
  notes: string;
}

export const STATE_PROTOCOLS: Record<string, StateProtocol> = {
  Massachusetts: {
    authorized: true,
    version: '2026.01',
    notes:
      'Whole blood authorized for hemorrhagic shock per state EMS protocol. ' +
      'Medical control contact recommended for pediatric or pregnant patients.',
  },
  California: {
    authorized: true,
    version: '2025.11',
    notes:
      'Authorized within scope-of-practice for paramedic units carrying ' +
      'cold-chain–verified product.',
  },
  Texas: {
    authorized: true,
    version: '2026.02',
    notes:
      'Authorized statewide. Trauma alert criteria apply for ER notification.',
  },
  'New York': {
    authorized: true,
    version: '2025.09',
    notes: 'Authorized for designated trauma transport units.',
  },
  Florida: {
    authorized: true,
    version: '2026.01',
    notes:
      'Authorized for hemorrhagic shock and traumatic arrest per regional ' +
      'medical director.',
  },
  'New Jersey': {
    authorized: true,
    version: '2025.10',
    notes: 'Authorized for MICU-level units.',
  },
  Pennsylvania: {
    authorized: true,
    version: '2025.12',
    notes: 'Authorized for paramedic units operating under regional protocol.',
  },
  Connecticut: {
    authorized: true,
    version: '2026.01',
    notes: 'Authorized within sponsor-hospital medical direction.',
  },
  'Rhode Island': {
    authorized: true,
    version: '2025.08',
    notes: 'Authorized for designated transport units.',
  },
  Ohio: {
    authorized: true,
    version: '2026.01',
    notes: 'Authorized for paramedic-level transport units.',
  },
  Georgia: {
    authorized: false,
    version: '2026.02',
    notes:
      'Prehospital whole blood pending regulatory approval. Component therapy ' +
      'per existing scope only.',
  },
};

// --- Checklist -----------------------------------------------------------

export interface ChecklistStep {
  id: string;
  title: string;
  description: string;
}

/**
 * Ordered transfusion protocol steps shown on the Checklist screen.
 * Step ids are stable — used as keys for tracking completion state.
 */
export const CHECKLIST_STEPS: ChecklistStep[] = [
  {
    id: 'confirm-eligibility',
    title: 'Confirm eligibility',
    description:
      'Verify shock index ≥ 0.9, mechanism consistent with hemorrhage, no ' +
      'contraindications. Document on the Eligibility tab before proceeding.',
  },
  {
    id: 'verify-unit',
    title: 'Verify blood unit',
    description:
      'Scan the bag QR. Confirm ABO type, expiry date, and temperature in ' +
      'the 2–6 °C range. Two-person check where staffing permits.',
  },
  {
    id: 'iv-access',
    title: 'Establish IV access',
    description:
      'Two large-bore IVs preferred. Use blood-administration tubing with ' +
      'integrated filter. Y-site with warmed normal saline if available.',
  },
  {
    id: 'pre-transfusion-vitals',
    title: 'Record pre-transfusion vitals',
    description:
      'Baseline HR, BP, SpO₂, RR, temperature, GCS. These anchor the ' +
      'reaction-monitoring algorithm.',
  },
  {
    id: 'begin-infusion',
    title: 'Begin infusion',
    description:
      'Start slowly for the first 15 minutes (≈2 mL/kg/hr). Stay at the ' +
      'bedside. Use a pressure infuser only if hemodynamically warranted.',
  },
  {
    id: 'monitor-reaction',
    title: 'Monitor for reaction',
    description:
      'Reassess vitals q5 min. Watch for fever, chills, urticaria, ' +
      'hypotension, dyspnea, back pain. The app monitors trends automatically.',
  },
  {
    id: 'titrate-rate',
    title: 'Titrate infusion rate',
    description:
      'If no reaction after the initial 15 minutes and hemodynamics warrant, ' +
      'increase rate per local protocol. Document the rate change.',
  },
  {
    id: 'contact-medical-control',
    title: 'Contact medical control',
    description:
      'Notify online medical control of transfusion initiation and any ' +
      'concerns. Confirm receiving facility activation.',
  },
  {
    id: 'document',
    title: 'Document',
    description:
      'Unit id, start time, volume infused, vitals timeline, any reaction ' +
      'signs, interventions. Required for blood-bank chain of custody.',
  },
  {
    id: 'er-prealert',
    title: 'Send ER pre-alert',
    description:
      'Use the Alert tab to transmit the structured pre-arrival packet. ' +
      'Queues automatically if offline; sends when connectivity returns.',
  },
];