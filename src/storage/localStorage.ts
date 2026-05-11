/**
 * Typed wrapper around AsyncStorage.
 *
 * Every persisted key in the app is namespaced under `bloodready:` so it
 * coexists cleanly with anything Expo or third-party libs might store.
 *
 * All functions are safe to call before storage is ready — they catch and
 * log errors rather than throwing, so a corrupt entry never crashes the app.
 * Callers that need to distinguish "not found" from "error" should check
 * the return value (load returns null for both, by design — the app boots
 * with defaults either way).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// --- Storage keys --------------------------------------------------------

/**
 * Every key the app reads or writes. Centralized so typos can't drift
 * keys apart over time (writer puts to "inventory", reader reads
 * "inventroy", silent data loss).
 *
 * Stringly-typed keys (just `string`) work, but a const object + a union
 * type means autocomplete and refactor-safety throughout the app.
 */
export const StorageKeys = {
  inventory: 'bloodready:inventory',
  callState: 'bloodready:callState',
  detectedState: 'bloodready:detectedState',
  protocols: 'bloodready:protocols',
  pendingAlerts: 'bloodready:pendingAlerts',
  callHistory: 'bloodready:callHistory',
  lastSync: 'bloodready:lastSync',
} as const;

export type StorageKey = (typeof StorageKeys)[keyof typeof StorageKeys];

// --- Core helpers --------------------------------------------------------

/**
 * Persist a value under a key. Serializes with JSON.stringify.
 * Returns true on success, false on failure (errors are swallowed and logged).
 *
 * Type parameter `T` is for the caller's clarity — at runtime everything
 * becomes JSON. Don't try to persist functions, Symbols, or Date objects
 * (Dates serialize fine but won't auto-rehydrate; store as ISO strings).
 */
export async function save<T>(key: StorageKey, value: T): Promise<boolean> {
  try {
    const json = JSON.stringify(value);
    await AsyncStorage.setItem(key, json);
    return true;
  } catch (err) {
    console.warn(`[storage] save failed for key "${key}":`, err);
    return false;
  }
}

/**
 * Read a value previously written with save().
 * Returns null if the key doesn't exist or the stored JSON is corrupt.
 *
 * Callers should treat null as "no value, use defaults" — that's how the
 * app stays bootable even if AsyncStorage gets into a weird state.
 */
export async function load<T>(key: StorageKey): Promise<T | null> {
  try {
    const json = await AsyncStorage.getItem(key);
    if (json === null) return null;
    return JSON.parse(json) as T;
  } catch (err) {
    console.warn(`[storage] load failed for key "${key}":`, err);
    return null;
  }
}

/**
 * Delete a single key. Idempotent — fine to call on a key that doesn't exist.
 */
export async function remove(key: StorageKey): Promise<boolean> {
  try {
    await AsyncStorage.removeItem(key);
    return true;
  } catch (err) {
    console.warn(`[storage] remove failed for key "${key}":`, err);
    return false;
  }
}

/**
 * Wipe every key this app owns. Used for "reset app" flows and tests.
 * Only removes keys defined in StorageKeys — won't touch unrelated AsyncStorage entries.
 */
export async function clearAll(): Promise<boolean> {
  try {
    const keys = Object.values(StorageKeys);
    await AsyncStorage.multiRemove(keys);
    return true;
  } catch (err) {
    console.warn('[storage] clearAll failed:', err);
    return false;
  }
}