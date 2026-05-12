/**
 * AppContext — global state for the prehospital blood transfusion app.
 *
 * What it owns:
 *   - callState:        active encounter (vitals, eligibility, selected unit)
 *   - bloodInventory:   list of blood units currently on the truck
 *   - detectedState:    US state used for protocol lookup
 *   - isLoading:        true until AsyncStorage hydration finishes
 *
 * Behavior:
 *   - On mount, loads persisted state from AsyncStorage in parallel.
 *   - After hydration, auto-saves callState / inventory / detectedState
 *     whenever they change. No save during hydration (would overwrite
 *     stored values with empty defaults on first render).
 *   - Starts the outbox flusher on mount so queued ER alerts drain
 *     automatically as soon as connectivity returns.
 *
 * GPS-based state detection lands in a later phase.
 */

import React, {
    createContext,
    useContext,
    useEffect,
    useRef,
    useState,
    ReactNode,
  } from 'react';
  import {
    BloodUnit,
    CallState,
    EligibilityResult,
    PatientVitals,
  } from '../types';
  import { load, save, StorageKeys } from '../storage/localStorage';
  import { startOutboxFlusher } from '../storage/outbox';
  
  // --- Defaults ------------------------------------------------------------
  
  const DEFAULT_CALL_STATE: CallState = {
    active: false,
    startTime: null,
    patientVitals: null,
    eligibilityResult: null,
    selectedBloodUnit: null,
  };
  
  /**
   * Two demo units so the Inventory screen has something to show on first launch.
   * Production should seed an empty array — this is a development convenience.
   */
  const DEFAULT_INVENTORY: BloodUnit[] = [
    {
      id: 'UNIT-001',
      bloodType: 'O+',
      expiryDate: '2026-08-15',
      temperatureCelsius: 4,
      collectionDate: '2026-04-10',
    },
    {
      id: 'UNIT-002',
      bloodType: 'O-',
      expiryDate: '2026-07-22',
      temperatureCelsius: 5,
      collectionDate: '2026-04-05',
    },
  ];
  
  const DEFAULT_DETECTED_STATE = 'Massachusetts';
  
  // --- Context shape -------------------------------------------------------
  
  interface AppContextValue {
    // State
    callState: CallState;
    bloodInventory: BloodUnit[];
    detectedState: string;
    isLoading: boolean;
  
    // Call lifecycle
    startCall: () => void;
    endCall: () => void;
  
    // Per-field mutators on the active call
    setPatientVitals: (vitals: PatientVitals) => void;
    setEligibilityResult: (result: EligibilityResult) => void;
    setSelectedBloodUnit: (unit: BloodUnit | null) => void;
  
    // Inventory
    addBloodUnit: (unit: BloodUnit) => void;
    removeBloodUnit: (id: string) => void;
  
    // Location
    setDetectedState: (state: string) => void;
  }
  
  const AppContext = createContext<AppContextValue | undefined>(undefined);
  
  // --- Provider ------------------------------------------------------------
  
  interface AppProviderProps {
    children: ReactNode;
  }
  
  export function AppProvider({ children }: AppProviderProps) {
    const [callState, setCallState] = useState<CallState>(DEFAULT_CALL_STATE);
    const [bloodInventory, setBloodInventory] =
      useState<BloodUnit[]>(DEFAULT_INVENTORY);
    const [detectedState, setDetectedStateRaw] = useState<string>(
      DEFAULT_DETECTED_STATE
    );
    const [isLoading, setIsLoading] = useState(true);
  
    /**
     * Tracks whether the initial hydration has finished.
     * useRef instead of useState so flipping it doesn't trigger a re-render —
     * the auto-save effects read it as a side-effect guard, not as render input.
     */
    const hydratedRef = useRef(false);
  
    // ---- Hydration: load persisted state on mount ------------------------
  
    useEffect(() => {
      let cancelled = false;
  
      const hydrate = async () => {
        // Parallel reads — three independent keys, no reason to serialize.
        const [storedCall, storedInventory, storedState] = await Promise.all([
          load<CallState>(StorageKeys.callState),
          load<BloodUnit[]>(StorageKeys.inventory),
          load<string>(StorageKeys.detectedState),
        ]);
  
        if (cancelled) return;
  
        if (storedCall) setCallState(storedCall);
        if (storedInventory) setBloodInventory(storedInventory);
        if (storedState) setDetectedStateRaw(storedState);
  
        hydratedRef.current = true;
        setIsLoading(false);
      };
  
      hydrate();
  
      // If the provider unmounts mid-hydration (unlikely but possible during HMR),
      // skip the setState calls to avoid the "update on unmounted component" warning.
      return () => {
        cancelled = true;
      };
    }, []);
  
    // ---- Outbox flusher: start once on mount -----------------------------
  
    // Drains queued ER alerts on an interval + on connectivity changes.
    // Cleanup is what startOutboxFlusher returns — clears interval and
    // unsubscribes from NetInfo. In practice the provider never unmounts,
    // but returning the cleanup keeps the contract honest.
    useEffect(() => {
      const stop = startOutboxFlusher();
      return stop;
    }, []);
  
    // ---- Auto-save: write to storage when state changes ------------------
  
    // Each effect watches one slice and writes it independently. Three writes
    // instead of one combined write is fine — AsyncStorage handles concurrency,
    // and per-slice writes mean a callState change doesn't rewrite the inventory.
  
    useEffect(() => {
      if (!hydratedRef.current) return;
      save(StorageKeys.callState, callState);
    }, [callState]);
  
    useEffect(() => {
      if (!hydratedRef.current) return;
      save(StorageKeys.inventory, bloodInventory);
    }, [bloodInventory]);
  
    useEffect(() => {
      if (!hydratedRef.current) return;
      save(StorageKeys.detectedState, detectedState);
    }, [detectedState]);
  
    // ---- Mutators --------------------------------------------------------
  
    const startCall = () => {
      setCallState({
        ...DEFAULT_CALL_STATE,
        active: true,
        startTime: new Date().toISOString(),
      });
    };
  
    const endCall = () => {
      setCallState(DEFAULT_CALL_STATE);
    };
  
    const setPatientVitals = (vitals: PatientVitals) => {
      setCallState((prev) => ({ ...prev, patientVitals: vitals }));
    };
  
    const setEligibilityResult = (result: EligibilityResult) => {
      setCallState((prev) => ({ ...prev, eligibilityResult: result }));
    };
  
    const setSelectedBloodUnit = (unit: BloodUnit | null) => {
      setCallState((prev) => ({ ...prev, selectedBloodUnit: unit }));
    };
  
    const addBloodUnit = (unit: BloodUnit) => {
      // De-dupe by id — scanning the same bag twice shouldn't create duplicates.
      setBloodInventory((prev) => {
        if (prev.some((u) => u.id === unit.id)) return prev;
        return [...prev, unit];
      });
    };
  
    const removeBloodUnit = (id: string) => {
      setBloodInventory((prev) => prev.filter((u) => u.id !== id));
    };
  
    const setDetectedState = (state: string) => {
      setDetectedStateRaw(state);
    };
  
    const value: AppContextValue = {
      callState,
      bloodInventory,
      detectedState,
      isLoading,
      startCall,
      endCall,
      setPatientVitals,
      setEligibilityResult,
      setSelectedBloodUnit,
      addBloodUnit,
      removeBloodUnit,
      setDetectedState,
    };
  
    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
  }
  
  // --- Consumer hook -------------------------------------------------------
  
  /**
   * Read app state and mutators from anywhere in the tree.
   * Throws if called outside AppProvider — better than silent undefined access.
   */
  export function useApp(): AppContextValue {
    const ctx = useContext(AppContext);
    if (!ctx) {
      throw new Error('useApp must be used inside <AppProvider>');
    }
    return ctx;
  }