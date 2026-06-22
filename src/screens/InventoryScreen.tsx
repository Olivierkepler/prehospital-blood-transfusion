/**
 * InventoryScreen — list, filter, add, and remove blood units.
 *
 * Reads inventory from AppContext. Tapping "+" opens the QR scanner modal
 * (or manual entry fallback). Per-unit removal goes through an Alert
 * confirm so a misplaced tap can't clear the cooler.
 *
 * Status classification (per unit):
 *   - safe:        in temperature range and >EXPIRY_WARNING_DAYS to expiry
 *   - expiring:    in temperature range but ≤EXPIRY_WARNING_DAYS to expiry
 *   - problem:     out of temperature range OR already expired
 */

import React, { useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Image
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Colors } from '../theme/colors';
import { useApp } from '../context/AppContext';
import { BloodUnit } from '../types';
import {
  BLOOD_TEMP_MAX,
  BLOOD_TEMP_MIN,
  EXPIRY_WARNING_DAYS,
} from '../constants/protocols';
import BloodBagScanner from '../components/BloodBagScanner';

// --- Status classification ----------------------------------------------

type UnitStatus = 'safe' | 'expiring' | 'problem';
type Filter = 'all' | 'safe' | 'expiring' | 'problem';

function daysUntil(isoDate: string): number {
  const target = new Date(isoDate).getTime();
  const now = Date.now();
  return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
}

function classifyUnit(unit: BloodUnit): {
  status: UnitStatus;
  daysToExpiry: number;
  tempOk: boolean;
} {
  const daysToExpiry = daysUntil(unit.expiryDate);
  const tempOk =
    unit.temperatureCelsius >= BLOOD_TEMP_MIN &&
    unit.temperatureCelsius <= BLOOD_TEMP_MAX;

  let status: UnitStatus;
  if (daysToExpiry < 0 || !tempOk) {
    status = 'problem';
  } else if (daysToExpiry <= EXPIRY_WARNING_DAYS) {
    status = 'expiring';
  } else {
    status = 'safe';
  }

  return { status, daysToExpiry, tempOk };
}

// --- Screen -------------------------------------------------------------

export default function InventoryScreen() {
  const { bloodInventory, addBloodUnit, removeBloodUnit } = useApp();
  const [filter, setFilter] = useState<Filter>('all');
  const [scannerVisible, setScannerVisible] = useState(false);

  // Classify every unit once per render, then derive counts and the
  // filtered subset from that. Avoids classifying each unit multiple times
  // across the counts + filter + render passes.
  const classified = useMemo(
    () => bloodInventory.map((unit) => ({ unit, ...classifyUnit(unit) })),
    [bloodInventory]
  );

  const counts = useMemo(() => {
    const c = { all: classified.length, safe: 0, expiring: 0, problem: 0 };
    for (const item of classified) {
      c[item.status] += 1;
    }
    return c;
  }, [classified]);

  const visible = useMemo(() => {
    if (filter === 'all') return classified;
    return classified.filter((item) => item.status === filter);
  }, [classified, filter]);

  const handleRemove = (unit: BloodUnit) => {
    Alert.alert(
      'Remove unit?',
      `Remove ${unit.bloodType} unit ${unit.id} from inventory? This can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => removeBloodUnit(unit.id),
        },
      ]
    );
  };

  return (
    <View style={styles.root}>
      {/* Filter bar */}
      <View style={styles.filterBar}>
        <FilterPill
          label="All"
          count={counts.all}
          active={filter === 'all'}
          onPress={() => setFilter('all')}
        />
        <FilterPill
          label="Safe"
          count={counts.safe}
          active={filter === 'safe'}
          tone="success"
          onPress={() => setFilter('safe')}
        />
        <FilterPill
          label="Expiring"
          count={counts.expiring}
          active={filter === 'expiring'}
          tone="warning"
          onPress={() => setFilter('expiring')}
        />
        <FilterPill
          label="Probs"
          count={counts.problem}
          active={filter === 'problem'}
          tone="danger"
          onPress={() => setFilter('problem')}
        />
      </View>

      <ScrollView 
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        {visible.length === 0 ? (
          <EmptyState filter={filter} total={counts.all} />
        ) : (
          visible.map(({ unit, status, daysToExpiry, tempOk }) => (
            <UnitCard
              key={unit.id}
              unit={unit}
              status={status}
              daysToExpiry={daysToExpiry}
              tempOk={tempOk}
              onRemove={() => handleRemove(unit)}
            />
          ))
        )}
      </ScrollView>

      {/* Floating add button */}
      <Pressable
        style={({ pressed }) => [
          styles.fab,
          pressed && styles.fabPressed,
        ]}
        onPress={() => setScannerVisible(true)}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </Pressable>

      <BloodBagScanner
        visible={scannerVisible}
        onClose={() => setScannerVisible(false)}
        onAdd={addBloodUnit}
      />
    </View>
  );
}

// --- Subcomponents ------------------------------------------------------

function FilterPill({
  label,
  count,
  active,
  tone,
  onPress,
}: {
  label: string;
  count: number;
  active: boolean;
  tone?: 'success' | 'warning' | 'danger';
  onPress: () => void;
}) {
  const toneColor =
    tone === 'success'
      ? Colors.success
      : tone === 'warning'
      ? Colors.warning
      : tone === 'danger'
      ? Colors.danger
      : Colors.text;

  return (
    <Pressable
      style={[
        styles.filterPill,
        active && styles.filterPillActive,
        active && tone && { backgroundColor: toneColor, borderColor: toneColor },
      ]}
      onPress={onPress}
    >
      <Text
        style={[
          styles.filterLabel,
          active && styles.filterLabelActive,
        ]}
      >
        {label}
      </Text>
      <View
        style={[
          styles.filterCount,
          active && styles.filterCountActive,
        ]}
      >
        <Text
          style={[
            styles.filterCountText,
            active && styles.filterCountTextActive,
          ]}
        >
          {count}
        </Text>
      </View>
    </Pressable>
  );
}

function UnitCard({
  unit,
  status,
  daysToExpiry,
  tempOk,
  onRemove,
}: {
  unit: BloodUnit;
  status: UnitStatus;
  daysToExpiry: number;
  tempOk: boolean;
  onRemove: () => void;
}) {
  const isDemo = unit.id.startsWith('DEMO-');

  const statusColor =
    status === 'safe'
      ? Colors.success
      : status === 'expiring'
      ? Colors.warning
      : Colors.danger;

  const statusLabel =
    status === 'problem'
      ? daysToExpiry < 0
        ? 'Expired'
        : 'Out of temp range'
      : status === 'expiring'
      ? `Expires in ${daysToExpiry}d`
      : 'Safe';

  return (
    <View style={[styles.card, { borderLeftColor: statusColor }]}>
      <View style={styles.cardLeft}>
        <View style={[styles.typeBadge, { backgroundColor: statusColor }]}>
          <Text style={styles.typeBadgeText}>{unit.bloodType}</Text>
        </View>
      </View>

      <View style={styles.cardMiddle}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.unitId}>{unit.id}</Text>
          {isDemo && (
            <View style={styles.demoBadge}>
              <Text style={styles.demoBadgeText}>DEMO</Text>
            </View>
          )}
        </View>

        <Image
          source={require('../../assets/images/bloodbag.png')}
          style={{ width: 48, height: 48, borderRadius: 8, marginTop: 4 }}
          resizeMode="cover"
        />
  



        <View style={styles.metaRow}>
          <Ionicons name="calendar-outline" size={12} color={Colors.textMuted} />
          <Text style={styles.metaText}>{unit.expiryDate}</Text>
          <Ionicons
            name="thermometer-outline"
            size={12}
            color={tempOk ? Colors.textMuted : Colors.danger}
            style={{ marginLeft: 8 }}
          />
          <Text
            style={[
              styles.metaText,
              !tempOk && { color: Colors.danger, fontWeight: '700' },
            ]}
          >
            {unit.temperatureCelsius} °C
          </Text>
        </View>

        <View style={[styles.statusPill, { backgroundColor: `${statusColor}1A` }]}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusText, { color: statusColor }]}>
            {statusLabel}
          </Text>
        </View>
      </View>

      <Pressable
        onPress={onRemove}
        style={({ pressed }) => [
          styles.removeButton,
          pressed && { opacity: 0.5 },
        ]}
        hitSlop={8}
      >
        <Ionicons name="trash-outline" size={18} color={Colors.textMuted} />
      </Pressable>
    </View>
  );
}

function EmptyState({ filter, total }: { filter: Filter; total: number }) {
  if (total === 0) {
    return (
      <View style={styles.emptyState}>
        <Ionicons name="water-outline" size={48} color={Colors.textMuted} />
        <Text style={styles.emptyTitle}>No units in inventory</Text>
        <Text style={styles.emptyBody}>
          Tap the + button to scan a blood bag QR code or enter a unit manually.
        </Text>
      </View>
    );
  }

  if (filter === 'safe') {
    return (
      <View style={styles.emptyState}>
        <Ionicons
          name="checkmark-circle-outline"
          size={48}
          color={Colors.success}
        />
        <Text style={styles.emptyTitle}>No safe units</Text>
        <Text style={styles.emptyBody}>
          Every unit in inventory needs attention. Check the Expiring or
          Problems filters.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.emptyState}>
      <Ionicons
        name="checkmark-circle-outline"
        size={48}
        color={Colors.success}
      />
      <Text style={styles.emptyTitle}>Nothing here</Text>
      <Text style={styles.emptyBody}>
        No units match the {filter} filter. That's a good thing.
      </Text>
    </View>
  );
}

// --- Styles -------------------------------------------------------------

const styles = StyleSheet.create({
  
  root: {
    flex: 1,
    marginVertical: 100,
    marginBottom: 40,
    backgroundColor: Colors.background,
  borderTopLeftRadius: 28,
  borderTopRightRadius: 28,
  // "translate top a bit" and add zIndex
  marginTop: 110,
  zIndex: 1,

  },

  filterBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    padding: 12,
    paddingBottom: 4,
    backgroundColor: Colors.background,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  filterPillActive: {
    backgroundColor: Colors.text,
    borderColor: Colors.text,
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text,
  },
  filterLabelActive: {
    color: '#fff',
  },
  filterCount: {
    minWidth: 20,
    height: 18,
    paddingHorizontal: 6,
    borderRadius: 999,
    backgroundColor: Colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterCountActive: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  filterCountText: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.textSecondary,
  },
  filterCountTextActive: {
    color: '#fff',
  },

  listContent: {
    padding: 12,
    paddingBottom: 100, // room for FAB
    gap: 10,

    
  },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 4,
    padding: 12,
    gap: 12,
  },
  cardLeft: {
    width: 56,
  },
  cardMiddle: {
    flex: 1,
    gap: 6,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  typeBadge: {
    width: 56,
    height: 56,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeBadgeText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.5,
  },
  unitId: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
  },
  demoBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: Colors.warning,
  },
  demoBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.5,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  statusPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    marginTop: 2,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },

  removeButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },

  emptyState: {
    paddingVertical: 60,
    paddingHorizontal: 32,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    marginTop: 4,
  },
  emptyBody: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
  },

  fab: {
    position: 'absolute',
    bottom: 80,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 999,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  fabPressed: {
    opacity: 0.85,
  },
});