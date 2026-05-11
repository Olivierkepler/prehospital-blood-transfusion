/**
 * AppNavigator — bottom-tab navigation for the five primary screens.
 *
 * Header contents:
 *   - left:   screen title (default React Navigation behavior)
 *   - right:  pending-alert badge + connectivity pill
 *   - below:  offline banner when network is unreachable
 *
 * The visual polish (glass blur, hero photo header, custom pill shapes)
 * lands in Phase 6. This version uses clean, themed defaults so the app
 * is fully usable today.
 */

import React, { ComponentProps } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import { Colors } from '../theme/colors';
import { RootTabParamList } from '../types';
import { useApp } from '../context/AppContext';
import { useConnectivity } from '../hooks/useConnectivity';

import HomeScreen from '../screens/HomeScreen';
import EligibilityScreen from '../screens/EligibilityScreen';
import InventoryScreen from '../screens/InventoryScreen';
import ChecklistScreen from '../screens/ChecklistScreen';
import AlertScreen from '../screens/AlertScreen';

type IoniconsName = ComponentProps<typeof Ionicons>['name'];

const Tab = createBottomTabNavigator<RootTabParamList>();

/**
 * Per-route icon and label config. Centralizing this avoids a switch
 * statement inside the tabBarIcon callback and makes adding a tab a
 * one-line change.
 */
const TAB_CONFIG: Record<
  keyof RootTabParamList,
  { focused: IoniconsName; unfocused: IoniconsName; label: string }
> = {
  Home: { focused: 'home', unfocused: 'home-outline', label: 'Home' },
  Eligibility: {
    focused: 'shield-checkmark',
    unfocused: 'shield-checkmark-outline',
    label: 'Eligibility',
  },
  Inventory: {
    focused: 'water',
    unfocused: 'water-outline',
    label: 'Inventory',
  },
  Checklist: {
    focused: 'list-circle',
    unfocused: 'list-circle-outline',
    label: 'Protocol',
  },
  Alert: {
    focused: 'send',
    unfocused: 'send-outline',
    label: 'ER Alert',
  },
};

// --- Header right: connectivity + pending alerts ------------------------

function HeaderRight() {
  const { signalLabel, signalColor, isOffline, pendingAlerts } =
    useConnectivity();

  return (
    <View style={styles.headerRight}>
      {pendingAlerts > 0 && (
        <View style={styles.pendingBadge}>
          <Ionicons name="time-outline" size={11} color="#fff" />
          <Text style={styles.pendingBadgeText}>{pendingAlerts}</Text>
        </View>
      )}

      <View
        style={[
          styles.connectivityPill,
          {
            backgroundColor: isOffline
              ? 'rgba(220, 38, 38, 0.12)'
              : Colors.surfaceMuted,
            borderColor: isOffline ? Colors.danger : Colors.border,
          },
        ]}
      >
        <View
          style={[styles.connectivityDot, { backgroundColor: signalColor }]}
        />
        <Text style={styles.connectivityLabel}>{signalLabel}</Text>
      </View>
    </View>
  );
}

// --- Offline banner -----------------------------------------------------

function OfflineBanner() {
  const { isOffline, pendingAlerts } = useConnectivity();

  if (!isOffline) return null;

  return (
    <View style={styles.offlineBanner}>
      <Ionicons name="cloud-offline-outline" size={14} color="#fff" />
      <Text style={styles.offlineBannerText}>
        Offline mode active
        {pendingAlerts > 0
          ? ` · ${pendingAlerts} alert${pendingAlerts > 1 ? 's' : ''} queued`
          : ' · all clinical tools remain available'}
      </Text>
    </View>
  );
}

// --- Navigator ----------------------------------------------------------

export default function AppNavigator() {
  const { callState } = useApp();

  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => {
          const tabConfig = TAB_CONFIG[route.name as keyof RootTabParamList];

          return {
            headerStyle: styles.header,
            headerTitleStyle: styles.headerTitle,
            headerTintColor: Colors.text,
            headerShadowVisible: false,
            headerRight: () => <HeaderRight />,

            tabBarStyle: styles.tabBar,
            tabBarActiveTintColor: Colors.primary,
            tabBarInactiveTintColor: Colors.textMuted,
            tabBarLabelStyle: styles.tabLabel,
            tabBarLabel: tabConfig.label,

            tabBarIcon: ({ focused, color, size }) => (
              <Ionicons
                name={focused ? tabConfig.focused : tabConfig.unfocused}
                size={size}
                color={color}
              />
            ),
          };
        }}
      >
        <Tab.Screen
          name="Home"
          component={HomeScreen}
          options={{
            tabBarBadge: callState.active ? '' : undefined,
            tabBarBadgeStyle: styles.activeCallBadge,
          }}
        />

        <Tab.Screen name="Eligibility" component={EligibilityScreen} />

        <Tab.Screen name="Inventory" component={InventoryScreen} />

        <Tab.Screen
          name="Checklist"
          component={ChecklistScreen}
          options={{ title: 'Protocol' }}
        />

        <Tab.Screen
          name="Alert"
          component={AlertScreen}
          options={{ title: 'ER Alert' }}
        />
      </Tab.Navigator>

      <OfflineBanner />
    </NavigationContainer>
  );
}

// --- Styles -------------------------------------------------------------

const styles = StyleSheet.create({
  header: {
    backgroundColor: Colors.surface,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
  },

  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingRight: 16,
  },

  pendingBadge: {
    minWidth: 28,
    height: 24,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: Colors.warning,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  pendingBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#fff',
  },

  connectivityPill: {
    minHeight: 26,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  connectivityDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
  },
  connectivityLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
    color: Colors.text,
  },

  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: Colors.danger,
  },
  offlineBannerText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },

  tabBar: {
    backgroundColor: Colors.surface,
    borderTopColor: Colors.border,
    height: 84,
    paddingTop: 10,
    paddingBottom: 8,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
  },

  activeCallBadge: {
    backgroundColor: Colors.danger,
    minWidth: 8,
    maxWidth: 8,
    height: 8,
    borderRadius: 999,
    fontSize: 0,
  },
});