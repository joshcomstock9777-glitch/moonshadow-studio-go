import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

/**
 * Placeholder for the real editor core.
 * This is the integration point.
 * Do NOT replace the real editor — mount it here later.
 */
export default function EditorSurface() {
  return (
    <View style={styles.container}>
      <View style={styles.timelinePlaceholder}>
        <Text style={styles.label}>EDITOR CORE</Text>
        <Text style={styles.sub}>
          Existing editor mounts here.{'\n'}
          This surface stays dominant.
        </Text>
      </View>

      {/* Minimal transport strip — will be driven by real editor later */}
      <View style={styles.transport}>
        <Text style={styles.transportBtn}>⏮</Text>
        <Text style={[styles.transportBtn, styles.play]}>▶</Text>
        <Text style={styles.transportBtn}>⏭</Text>
        <View style={styles.scrubber}>
          <View style={styles.scrubberFill} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0b',
  },
  timelinePlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  label: {
    color: '#f59e0b',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  sub: {
    color: '#6b7280',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
  transport: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#111113',
    borderTopWidth: 1,
    borderTopColor: '#1f1f23',
    gap: 16,
  },
  transportBtn: {
    color: '#e5e5e5',
    fontSize: 18,
  },
  play: {
    color: '#f59e0b',
    fontSize: 22,
  },
  scrubber: {
    flex: 1,
    height: 4,
    backgroundColor: '#2a2a2e',
    borderRadius: 2,
    overflow: 'hidden',
  },
  scrubberFill: {
    width: '28%',
    height: '100%',
    backgroundColor: '#f59e0b',
  },
});
