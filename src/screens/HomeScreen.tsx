/**
 * HomeScreen — placeholder.
 *
 * Real version (Phase 3) will show: call active/inactive state with elapsed
 * timer, detected state, blood inventory summary, temperature and expiry
 * warnings, and quick-nav buttons to other tabs.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Colors } from '../theme/colors';

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Home page</Text>
      <Text style={styles.subtitle}>
        Call status, inventory summary, and quick navigation will live here.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
});