/**
 * App — root entry point.
 *
 * Composition order matters:
 *   GestureHandlerRootView → SafeAreaProvider → AppProvider → AppShell
 *
 *   SafeAreaProvider must be outermost (after gesture handler) so any
 *   descendant can read insets. AppProvider must wrap AppShell because
 *   the inner components call useApp().
 *
 * Two loading-style phases happen on cold start:
 *   1. Splash phase (presentational, 1.5–2 s) — branded identity moment
 *      defined in SplashScreen. App.tsx cross-fades it out into AppShell.
 *   2. Hydration phase (functional, usually < 200 ms) — AppShell reads
 *      isLoading from AppContext and shows a spinner while AsyncStorage
 *      loads. Almost always done by the time the splash cross-fade
 *      finishes, but the spinner is the safety net for slow devices.
 *
 * Warm starts (background → foreground) don't remount App, so the splash
 * correctly doesn't reappear when the user switches back to the app.
 */

import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  StyleSheet,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AppProvider, useApp } from './src/context/AppContext';
import AppNavigator from './src/navigation/AppNavigator';
import SplashScreen from './src/screens/SplashScreen';
import { Colors } from './src/theme/colors';
// import { LLMProvider } from './src/components/LLMBridge';

/** How long the splash stays visible after its entrance anim completes. */
const HOLD_MS = 1200;
/** Cross-fade duration when transitioning to the main app. */
const CROSSFADE_MS = 350;

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
  // Three phases of the splash → app transition.
  //   'splash'      — only the splash is visible
  //   'crossfade'   — both render; splash fades out, shell fades in
  //   'shell'       — only the main app is visible; splash unmounted
  const [phase, setPhase] = useState<'splash' | 'crossfade' | 'shell'>(
    'splash'
  );

  const splashOpacity = useRef(new Animated.Value(1)).current;
  const shellOpacity = useRef(new Animated.Value(0)).current;

  // Called by SplashScreen once its entrance animation has finished.
  // We then hold for HOLD_MS so the splash is visible for a deliberate
  // moment, then cross-fade to the main app.
  const handleSplashReady = () => {
    setTimeout(() => {
      setPhase('crossfade');
      Animated.parallel([
        Animated.timing(splashOpacity, {
          toValue: 0,
          duration: CROSSFADE_MS,
          useNativeDriver: true,
        }),
        Animated.timing(shellOpacity, {
          toValue: 1,
          duration: CROSSFADE_MS,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setPhase('shell');
      });
    }, HOLD_MS);
  };

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <AppProvider>
          {/* <LLMProvider> */}
          <View style={styles.root}>
            {/* Main app — mounted as soon as we leave 'splash' so its
                providers (and AsyncStorage hydration) get a head start
                while the splash is still visible. By the time the
                cross-fade completes, isLoading is usually already false. */}
            {phase !== 'splash' && (
              <Animated.View
                style={[styles.layer, { opacity: shellOpacity }]}
                pointerEvents={phase === 'shell' ? 'auto' : 'none'}
              >
                <AppShell />
              </Animated.View>
            )}

            {/* Splash — unmounts after crossfade completes to free its
                Animated values. pointerEvents none so taps fall through
                even during the brief crossfade. */}
            {phase !== 'shell' && (
              <Animated.View
                style={[styles.layer, { opacity: splashOpacity }]}
                pointerEvents="none"
              >
                <SplashScreen onReady={handleSplashReady} />
              </Animated.View>
            )}
          </View>
          {/* </LLMProvider> */}

          <StatusBar style={phase === 'shell' ? 'dark' : 'light'} />
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
  layer: {
    ...StyleSheet.absoluteFillObject,
  },
});