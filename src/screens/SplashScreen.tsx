/**
 * SplashScreen — brief identity moment shown on every cold start.
 *
 * Auto-dismisses after the entrance animation completes. The parent
 * (App.tsx) renders this for ~2s, then cross-fades into <AppShell />.
 *
 * Design: a tri-band layout — red top, white middle, red bottom — with
 * the O-Blood mark (a blood drop containing the letter O) centered in
 * the white band. The bands read like a medical banner and create a
 * strong, recognizable identity moment.
 *
 * The layout is built with three flex'd Views so the middle band auto-
 * centers regardless of screen height. The blood drop is a custom SVG
 * via react-native-svg for a clean shape at any size.
 *
 * Purely presentational. No inputs, no taps, no AsyncStorage reads, no
 * navigation.
 */

import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
// To use react-native-svg, install it with:
// npx expo install react-native-svg
// or
// npm install react-native-svg
// For bare React Native, also run `npx pod-install`.

const ENTRY_ANIM_DURATION_MS = 450;

/** Deep clinical red — distinct from the app's bright "danger" red. */
const SPLASH_RED = '#B91C1C';
/** White band between the two red bands. */
const SPLASH_WHITE = '#FFFFFF';

interface SplashScreenProps {
  /** Called when the splash has finished its entrance animation. */
  onReady?: () => void;
}

export default function SplashScreen({ onReady }: SplashScreenProps) {
  // Fade for the whole composition; scale for the centered logo pop.
  const fade = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.85)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: ENTRY_ANIM_DURATION_MS,
        useNativeDriver: true,
      }),
      Animated.spring(logoScale, {
        toValue: 1,
        speed: 11,
        bounciness: 9,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onReady?.();
    });
  }, [fade, logoScale, onReady]);

  return (
    <Animated.View style={[styles.container, { opacity: fade }]}>
      {/* Top red band */}
      <View style={styles.redBand}>
        <Text style={styles.bandText}>EMS CLINICAL DECISION SUPPORT</Text>
      </View>

      {/* White middle band — logo + wordmark */}
      <View style={styles.whiteBand}>
        <Animated.View
          style={[
            styles.logoWrap,
            { transform: [{ scale: logoScale }] },
          ]}
        >
          <BloodDrop size={88} color={SPLASH_RED} />
          <Text style={styles.appName}>O-Blood</Text>
        </Animated.View>
      </View>

      {/* Bottom red band — disclaimer */}
      <View style={styles.redBand}>
        <Text style={styles.disclaimer}>
          Decision aid — not validated for clinical use.
        </Text>
        <Text style={styles.disclaimerSub}>
          Operate under your local medical direction&apos;s protocols.
        </Text>
      </View>
    </Animated.View>
  );
}

// --- Blood drop SVG -----------------------------------------------------

/**
 * Stylized blood drop with a centered "O" cut out. The path is a teardrop:
 * starts at the top point, curves out to a wide base, and the cubic curves
 * close the bottom into a rounded U. The O is rendered as text inside
 * because SVG <Path> for a precise letter would need a font conversion.
 */
function BloodDrop({ size, color }: { size: number; color: string }) {
  return (
    <View style={{ width: size, height: size * 1.2, alignItems: 'center' }}>
      <Svg width={size} height={size * 1.2} viewBox="0 0 100 120">
        <Path
          d="M50 5 C50 5, 12 55, 12 80 C12 100, 30 115, 50 115 C70 115, 88 100, 88 80 C88 55, 50 5, 50 5 Z"
          fill={color}
        />
      </Svg>
      {/* The "O" overlaid in the lower-center of the drop, white on red */}
     
    </View>
  );
}

// --- Styles -------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SPLASH_RED,
  },

  // Red bands top + bottom. flex: 1 each gives them equal height.
  redBand: {
    flex: 1,
    backgroundColor: SPLASH_RED,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 4,
  },
  bandText: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.5,
    textAlign: 'center',
  },
  disclaimer: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.92)',
    textAlign: 'center',
  },
  disclaimerSub: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    fontStyle: 'italic',
  },

  // White middle band — taller than the red bands so the logo dominates.
  whiteBand: {
    flex: 1.4,
    backgroundColor: SPLASH_WHITE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoWrap: {
    alignItems: 'center',
    gap: 12,
  },
  dropLetterWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    // Push the O slightly toward the wider bottom of the drop where
    // there's more room.
    paddingTop: 28,
  },
  dropLetter: {
    color: '#FFFFFF',
    fontSize: 38,
    fontWeight: '900',
    letterSpacing: -1,
  },
  appName: {
    fontSize: 42,
    fontWeight: '900',
    color: SPLASH_RED,
    letterSpacing: -0.8,
  },
});