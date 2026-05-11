/**
 * useConnectivity — single source of truth for network state in the UI.
 *
 * Wraps @react-native-community/netinfo and exposes UI-ready fields:
 *   - isOffline: boolean for offline-aware rendering
 *   - signalLabel: "5G" / "LTE" / "WiFi" / "Offline" / etc., for the header pill
 *   - signalColor: pill color matching signal quality
 *   - pendingAlerts: count of queued ER alerts (stubbed until outbox.ts exists)
 *
 * One subscription per app instance — multiple components can call this hook
 * cheaply because NetInfo broadcasts state changes to all listeners.
 */

import { useEffect, useState } from 'react';
import NetInfo, {
  NetInfoState,
  NetInfoStateType,
} from '@react-native-community/netinfo';
import { Colors } from '../theme/colors';

/** How often to refresh pendingAlerts count from the outbox, in ms. */
const PENDING_POLL_INTERVAL_MS = 5000;

interface ConnectivityState {
  isOffline: boolean;
  signalLabel: string;
  signalColor: string;
  pendingAlerts: number;
}

/**
 * Map a NetInfo snapshot to a human-readable signal label.
 *
 * On cellular, NetInfo exposes `details.cellularGeneration` ("2g" | "3g" | "4g" | "5g").
 * Cast through `any` because the typed shape varies by connection type and isn't
 * worth a full discriminated-union for a label.
 */
function classifySignal(state: NetInfoState): {
  label: string;
  color: string;
} {
  if (!state.isConnected || state.isInternetReachable === false) {
    return { label: 'Offline', color: Colors.danger };
  }

  if (state.type === NetInfoStateType.wifi) {
    return { label: 'WiFi', color: Colors.success };
  }

  if (state.type === NetInfoStateType.cellular) {
    const generation = (state.details as any)?.cellularGeneration as
      | string
      | undefined;

    switch (generation) {
      case '5g':
        return { label: '5G', color: Colors.success };
      case '4g':
        return { label: 'LTE', color: Colors.success };
      case '3g':
        return { label: '3G', color: Colors.warning };
      case '2g':
        return { label: '2G', color: Colors.warning };
      default:
        return { label: 'Cellular', color: Colors.success };
    }
  }

  if (state.type === NetInfoStateType.ethernet) {
    return { label: 'Wired', color: Colors.success };
  }

  // unknown, none, bluetooth, vpn, wimax, other
  return { label: 'Online', color: Colors.info };
}

/**
 * STUB — replaced by real outbox query in Phase 5.
 * Returns 0 so the UI renders correctly until the outbox exists.
 */
async function getPendingCount(): Promise<number> {
  // TODO(phase-5): import { getPendingCount } from '../storage/outbox';
  return 0;
}

export function useConnectivity(): ConnectivityState {
  const [state, setState] = useState<ConnectivityState>({
    isOffline: false,
    signalLabel: 'Online',
    signalColor: Colors.info,
    pendingAlerts: 0,
  });

  useEffect(() => {
    // Subscribe to NetInfo. The callback fires once immediately with current
    // state, then on every change. unsubscribe() detaches the listener on unmount.
    const unsubscribe = NetInfo.addEventListener((netState) => {
      const { label, color } = classifySignal(netState);
      const offline =
        !netState.isConnected || netState.isInternetReachable === false;

      setState((prev) => ({
        ...prev,
        isOffline: offline,
        signalLabel: label,
        signalColor: color,
      }));
    });

    // Poll the outbox queue length on an interval. Cheap (one AsyncStorage read).
    // Not tied to NetInfo events because alerts can be queued by the user while
    // the device's network state is unchanged.
    const pollPending = async () => {
      const count = await getPendingCount();
      setState((prev) =>
        prev.pendingAlerts === count ? prev : { ...prev, pendingAlerts: count }
      );
    };

    pollPending();
    const interval = setInterval(pollPending, PENDING_POLL_INTERVAL_MS);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  return state;
}