/**
 * HomeScreen — operational dashboard.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Animated,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import AppMap from '../components/AppMap';
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

function daysUntil(isoDate: string): number {
  const target = new Date(isoDate).getTime();
  const now = Date.now();

  return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
}

export default function HomeScreen({ navigation }: Props) {
  const { callState, bloodInventory, detectedState, startCall, endCall } =
    useApp();

  const [now, setNow] = useState(Date.now());

  const pulseAnim = useMemo(() => new Animated.Value(0), []);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 900,
          useNativeDriver: true,
        }),
      ])
    );

    loop.start();

    return () => loop.stop();
  }, [pulseAnim]);

  const chevronOpacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.25, 1],
  });

  const chevronTranslate = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 8],
  });

  const circleScale = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.06],
  });

  useEffect(() => {
    if (!callState.active) return;

    const interval = setInterval(() => setNow(Date.now()), 1000);

    return () => clearInterval(interval);
  }, [callState.active]);

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
      <View style={styles.locationRow}>
        <Ionicons
          name="location"
          size={14}
          color={Colors.textSecondary}
        />

        <Text style={styles.locationText}>
          {detectedState}
        </Text>
      </View>

      <View>
        <AppMap defaultExpanded={false} />
      </View>

     

      <Pressable
        style={({ pressed }) => [
          styles.card,
          pressed && styles.cardPressed,
        ]}
        onPress={() => navigation.navigate('Inventory')}
      >
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleWrapper}>
            <View>
              <Text style={styles.cardEyebrow}>
                Inventory Status
              </Text>

              <Text style={styles.cardTitle}>
                Blood Inventory
              </Text>
            </View>
          </View>

          <View style={styles.cardChevronWrap}>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={Colors.primary}
            />
          </View>
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

      <View
        style={[
          styles.card,
          callState.active && styles.callCardActive,
        ]}
      >
        {callState.active ? (
          <>
            {/* <View style={styles.callHeaderRow}> */}
              {/* <View style={styles.activeDot} /> */}

              {/* <Text style={styles.callActiveLabel}>
                Call active
              </Text> */}
            {/* </View> */}

            <Text style={styles.timer}>
              {formatElapsed(elapsedMs)}
            </Text>

            <Text style={styles.callMeta}>
              Started {new Date(callState.startTime!).toLocaleTimeString()}
            </Text>

            <Pressable
  style={({ pressed }) => [
    styles.endButtonModern,
    pressed && styles.endButtonPressed,
  ]}
  onPress={endCall}
>
  <Text style={styles.endButtonModernText}>
    Stop time
  </Text>

  <Animated.View
    style={[
      styles.endChevronGroup,
      {
        opacity: chevronOpacity,
        transform: [{ translateX: chevronTranslate }],
      },
    ]}
  >
    <Ionicons
      name="chevron-forward"
      size={20}
      color="rgba(255,255,255,0.35)"
    />

    <Ionicons
      name="chevron-forward"
      size={20}
      color="rgba(255,255,255,0.55)"
    />

    <Ionicons
      name="chevron-forward"
      size={20}
      color="#fff"
    />
  </Animated.View>

  <Animated.View
    style={[
      styles.endButtonCircle,
      {
        transform: [{ scale: circleScale }],
      },
    ]}
  >
    <Ionicons
      name="close"
      size={30}
      color="black"
    />
  </Animated.View>
</Pressable>
          </>
        ) : (
          <>
            {/* <Text style={styles.cardLabel}>
              No active call
            </Text> */}

            {/* <Text style={styles.cardHint}>
              Start a call to begin tracking vitals, eligibility, and
              transfusion progress.
            </Text> */}

            <Pressable
              style={({ pressed }) => [
                styles.startButtonModern,
                pressed && styles.startButtonPressed,
              ]}
              onPress={startCall}
            >
              <Text style={styles.startButtonModernText}>
                Timer
              </Text>

              <Animated.View
                style={[
                  styles.chevronGroup,
                  {
                    opacity: chevronOpacity,
                    transform: [{ translateX: chevronTranslate }],
                  },
                ]}
              >
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color="rgba(255,255,255,0.35)"
                />

                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color="rgba(255,255,255,0.55)"
                />

                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color="#fff"
                />
              </Animated.View>

              <Animated.View
                style={[
                  styles.startButtonCircle,
                  {
                    transform: [{ scale: circleScale }],
                  },
                ]}
              >
                <Ionicons
                  name="checkmark"
                  size={34}
                  color="#2563EB"
                />
              </Animated.View>
            </Pressable>
          </>
        )}
      </View>


      <Text style={styles.sectionLabel}>
        Quick actions
      </Text>

      <View style={styles.quickNavRow}>
        <QuickNav
          icon="shield-checkmark"
          image={require('../../assets/images/patientMonitor.png')}
          label="Eligibility"
          onPress={() => navigation.navigate('Eligibility')}
        />

        <QuickNav
          icon="list-circle"
          image={require('../../assets/images/Subject4.png')}
          label="Protocol"
          onPress={() => navigation.navigate('Checklist')}
        />

        <QuickNav
          icon="send"
          image={require('../../assets/images/image.png')}
          label="ER Alert"
          onPress={() => navigation.navigate('Alert')}
        />
      </View>
    </ScrollView>
  );
}

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
      <Text style={[styles.statValue, { color: toneColor }]}>
        {value}
      </Text>

      <Text style={styles.statLabel}>
        {label}
      </Text>
    </View>
  );
}

function QuickNav({
  icon,
  image,
  label,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  image: ReturnType<typeof require>;
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
      <Image
        source={image}
        style={styles.quickNavImage}
        resizeMode="cover"
      />

      <View style={styles.quickNavOverlay}>
        <Ionicons
          name={icon}
          size={20}
          color="#fff"
        />

        <Text style={styles.quickNavLabel}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: {
    marginVertical: 100,
    marginBottom: 40,
    flex: 1,
    backgroundColor: Colors.background,
  borderTopLeftRadius: 28,
  borderTopRightRadius: 28,
  // "translate top a bit" and add zIndex
  marginTop: 110,
  zIndex: 1,
  },

  scrollContent: {
    padding: 16,
    paddingBottom: 120,
  },

  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
    marginTop: 12
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
    // borderWidth: 1,
    // borderColor: Colors.border,
  },

  cardPressed: {
    opacity: 0.7,
  },

  callCardActive: {
    borderColor: Colors.danger,
    backgroundColor: '',
  },

  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
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
    fontSize: 28,
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
    color: 'black',
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
    height: 130,
    borderRadius: 22,
    overflow: 'hidden',

    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 12,
  },

  quickNavImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },

  quickNavOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },

  quickNavLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
  },

  cardTitleWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  cardEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 2,
  },

  cardChevronWrap: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: 'rgba(220, 38, 38, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  cardTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.text,
  },

  startButtonModern: {
    height: 62,
    borderRadius: 999,
    backgroundColor: '#111933',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    paddingLeft: 28,
    paddingRight: 10,
    flexDirection: 'row',
    alignItems: 'center',

    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 12,
    },
    shadowOpacity: 0.28,
    shadowRadius: 24,

    elevation: 14,
  },

  startButtonPressed: {
    transform: [{ scale: 0.985 }],
    opacity: 0.96,
  },

  startButtonModernText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.2,
  },

  chevronGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 18,
  },

  startButtonCircle: {
    marginLeft: 'auto',
    width: 50,
    height: 50,
    borderRadius: 999,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',

    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.18,
    shadowRadius: 14,

    elevation: 10,
  },
  endButtonModern: {
    height: 62,
  
    borderRadius: 999,
  
    backgroundColor: '#20b26c',
  
    borderWidth: 1,
    borderColor: '#20b26c', // green
  
    paddingLeft: 28,
    paddingRight: 10,
  
    flexDirection: 'row',
    alignItems: 'center',
  
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 12,
    },
    shadowOpacity: 0.28,
    shadowRadius: 24,
  
    elevation: 14,
  },
  
  endButtonPressed: {
    transform: [{ scale: 0.985 }],
    opacity: 0.96,
  },
  
  endButtonModernText: {
    color: '#fff',
  
    fontSize: 16,
    fontWeight: '600',
  
    letterSpacing: 0.2,
  },
  
  endChevronGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  
    marginLeft: 18,
  },
  
  endButtonCircle: {
    marginLeft: 'auto',
  
    width: 50,
    height: 50,
  
    borderRadius: 999,
  
    backgroundColor: '#fff',
  
    alignItems: 'center',
    justifyContent: 'center',
  
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.18,
    shadowRadius: 14,
  
    elevation: 10,
  },
});