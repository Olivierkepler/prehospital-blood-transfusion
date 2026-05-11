/**
 * App — root entry point.
 *
 * Composition order matters:
 *   SafeAreaProvider → AppProvider → AppNavigator
 *
 *   SafeAreaProvider must be outermost so any descendant can read insets.
 *   AppProvider must wrap AppNavigator because the navigator calls useApp().
 *
 * While AsyncStorage hydrates, we show a centered spinner instead of
 * rendering the navigator. Prevents a flash of empty-state on Home before
 * persisted inventory and call state load.
 */

import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AppProvider, useApp } from './src/context/AppContext';
import AppNavigator from './src/navigation/AppNavigator';
import { Colors } from './src/theme/colors';

/**
 * Inner component that reads the loading flag from AppProvider.
 * Must be a child of AppProvider so useApp() works.
 */
function AppShell() {
  const { isLoading } = useApp();

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return <AppNavigator />;
}

export default function App() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <AppProvider>
          <AppShell />
          <StatusBar style="dark" />
        </AppProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});