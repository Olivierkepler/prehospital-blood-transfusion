/**
 * HomeScreen — operational dashboard.
 *
 * Shows the user, at a glance:
 *   - Where they are (detected US state, drives protocol)
 *   - Whether a call is active, and for how long
 *   - Blood inventory health (total / expiring / problems)
 *   - Quick navigation to the next likely action
 *
 * Reads from AppContext; no local state besides the timer tick.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';

import { Colors } from '../theme/colors';
import { useApp } from '../context/AppContext';
import { RootTabParamList } from '../types';
import {
  BLOOD_TEMP_MAX,
  BLOOD_TEMP_MIN,
  EXPIRY_WARNING_DAYS,
} from '../constants/protocols';

type Props = BottomTabScreenProps<RootTabParamList, 'Home'>;

// --- Helpers ------------------------------------------------------------

/** Format a millisecond duration as "HH:MM:SS" (hours optional). */
function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');

  if (hours > 0) {
    const hh = String(hours).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
}

/** Days between now and an ISO date string. Negative = past. */
function daysUntil(isoDate: string): number {
  const target = new Date(isoDate).getTime();
  const now = Date.now();
  return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
}

// --- Screen -------------------------------------------------------------

export default function HomeScreen({ navigation }: Props) {
  const { callState, bloodInventory, detectedState, startCall, endCall } =
    useApp();

  // Tick once per second while a call is active so the elapsed timer updates.
  // When inactive, no interval runs — saves battery during long idle periods.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!callState.active) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [callState.active]);

  // Derived inventory stats. useMemo because the same array reference often
  // re-renders (context value object recreated each render), but the counts
  // only change when the inventory itself changes.
  const inventoryStats = useMemo(() => {
    const total = bloodInventory.length;

    let expiring = 0;
    let problematic = 0;

    for (const unit of bloodInventory) {
      const days = daysUntil(unit.expiryDate);
      const tempOk =
        unit.temperatureCelsius >= BLOOD_TEMP_MIN &&
        unit.temperatureCelsius <= BLOOD_TEMP_MAX;

      if (days < 0 || !tempOk) {
        problematic += 1;
      } else if (days <= EXPIRY_WARNING_DAYS) {
        expiring += 1;
      }
    }

    return { total, expiring, problematic };
  }, [bloodInventory]);

  const elapsedMs = callState.startTime
    ? now - new Date(callState.startTime).getTime()
    : 0;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* Detected state */}
      <View style={styles.locationRow}>
        <Ionicons name="location" size={14} color={Colors.textSecondary} />
        <Text style={styles.locationText}>{detectedState}</Text>
      </View>

      {/* Call status card */}
      <View
        style={[
          styles.card,
          callState.active && styles.callCardActive,
        ]}
      >
        {callState.active ? (
          <>
            <View style={styles.callHeaderRow}>
              <View style={styles.activeDot} />
              <Text style={styles.callActiveLabel}>Call active</Text>
            </View>
            <Text style={styles.timer}>{formatElapsed(elapsedMs)}</Text>
            <Text style={styles.callMeta}>
              Started {new Date(callState.startTime!).toLocaleTimeString()}
            </Text>
            <Pressable
              style={({ pressed }) => [
                styles.endButton,
                pressed && styles.buttonPressed,
              ]}
              onPress={endCall}
            >
              <Ionicons name="stop-circle" size={18} color="#fff" />
              <Text style={styles.endButtonText}>End call</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.cardLabel}>No active call</Text>
            <Text style={styles.cardHint}>
              Start a call to begin tracking vitals, eligibility, and
              transfusion progress.
            </Text>
            <Pressable
              style={({ pressed }) => [
                styles.startButton,
                pressed && styles.buttonPressed,
              ]}
              onPress={startCall}
            >
              <Ionicons name="play-circle" size={18} color="#fff" />
              <Text style={styles.startButtonText}>Start call</Text>
            </Pressable>
          </>
        )}
      </View>

      {/* Inventory summary */}
      <Pressable
        style={({ pressed }) => [
          styles.card,
          pressed && styles.cardPressed,
        ]}
        onPress={() => navigation.navigate('Inventory')}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Blood inventory</Text>
          <Ionicons
            name="chevron-forward"
            size={18}
            color={Colors.textMuted}
          />
        </View>

        <View style={styles.statsRow}>
          <Stat
            label="Total units"
            value={inventoryStats.total}
            tone="neutral"
          />
          <Stat
            label="Expiring soon"
            value={inventoryStats.expiring}
            tone={inventoryStats.expiring > 0 ? 'warning' : 'neutral'}
          />
          <Stat
            label="Problems"
            value={inventoryStats.problematic}
            tone={inventoryStats.problematic > 0 ? 'danger' : 'neutral'}
          />
        </View>
      </Pressable>

      {/* Quick nav */}
      <Text style={styles.sectionLabel}>Quick actions</Text>
      <View style={styles.quickNavRow}>
        <QuickNav
          icon="shield-checkmark"
          label="Eligibility"
          onPress={() => navigation.navigate('Eligibility')}
        />
        <QuickNav
          icon="list-circle"
          label="Protocol"
          onPress={() => navigation.navigate('Checklist')}
        />
        <QuickNav
          icon="send"
          label="ER Alert"
          onPress={() => navigation.navigate('Alert')}
        />
      </View>
    </ScrollView>
  );
}

// --- Subcomponents ------------------------------------------------------

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'neutral' | 'warning' | 'danger';
}) {
  const toneColor =
    tone === 'danger'
      ? Colors.danger
      : tone === 'warning'
      ? Colors.warning
      : Colors.text;

  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color: toneColor }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function QuickNav({
  icon,
  label,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.quickNavCard,
        pressed && styles.cardPressed,
      ]}
      onPress={onPress}
    >
      <Ionicons name={icon} size={22} color={Colors.primary} />
      <Text style={styles.quickNavLabel}>{label}</Text>
    </Pressable>
  );
}

// --- Styles -------------------------------------------------------------

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },

  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  locationText: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '600',
  },

  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardPressed: {
    opacity: 0.7,
  },
  callCardActive: {
    borderColor: Colors.danger,
    backgroundColor: '#FEF2F2',
  },

  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
  },
  cardLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  cardHint: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: 16,
  },

  callHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: Colors.danger,
  },
  callActiveLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.danger,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  timer: {
    fontSize: 38,
    fontWeight: '800',
    color: Colors.text,
    fontVariant: ['tabular-nums'],
    marginBottom: 4,
  },
  callMeta: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 16,
  },

  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: Colors.primary,
  },
  startButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  endButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: Colors.danger,
  },
  endButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  buttonPressed: {
    opacity: 0.85,
  },

  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
  },

  sectionLabel: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 8,
    marginBottom: 10,
    marginLeft: 4,
  },
  quickNavRow: {
    flexDirection: 'row',
    gap: 10,
  },
  quickNavCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  quickNavLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text,
  },
});