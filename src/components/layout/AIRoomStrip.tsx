import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Seat, TopMode, TranscriptEntry } from '../../types';

interface AIRoomStripProps {
  seats: Seat[];
  isExpanded: boolean;
  currentMode: TopMode;
  transcript: TranscriptEntry[];
  currentSpeakerId?: string | null;
  onToggleExpand: () => void;
  onModeChange: (mode: TopMode) => void;
  onSeatPress?: (seatId: string) => void;
}

const MODES: { key: TopMode; label: string }[] = [
  { key: 'room', label: 'ROOM' },
  { key: 'speaker', label: 'SPEAKER' },
  { key: 'notes', label: 'NOTES' },
  { key: 'reference', label: 'REFERENCE' },
];

export default function AIRoomStrip({
  seats,
  isExpanded,
  currentMode,
  transcript,
  currentSpeakerId,
  onToggleExpand,
  onModeChange,
  onSeatPress,
}: AIRoomStripProps) {
  const recent = transcript.slice(-6);

  return (
    <View style={[styles.container, isExpanded && styles.expanded]}>
      <View style={styles.modeRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.modeScroll}>
          {MODES.map((m) => (
            <Pressable
              key={m.key}
              onPress={() => onModeChange(m.key)}
              style={[styles.modeTab, currentMode === m.key && styles.modeTabActive]}
            >
              <Text style={[styles.modeText, currentMode === m.key && styles.modeTextActive]}>
                {m.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        <Pressable onPress={onToggleExpand} style={styles.expandBtn}>
          <Text style={styles.expandText}>{isExpanded ? '▾' : '▴'}</Text>
        </Pressable>
      </View>

      {!isExpanded && (
        <View style={styles.collapsedRow}>
          {seats.map((seat) => (
            <Pressable
              key={seat.id}
              onPress={() => onSeatPress?.(seat.id)}
              style={[
                styles.seatChip,
                { borderColor: seat.color },
                currentSpeakerId === seat.id && styles.seatSpeaking,
              ]}
            >
              <View style={[styles.statusDot, { backgroundColor: statusColor(seat.status) }]} />
              <Text style={styles.seatName} numberOfLines={1}>{seat.name}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {isExpanded && (
        <View style={styles.expandedBody}>
          {currentMode === 'room' && (
            <>
              {recent.length === 0 ? (
                <>
                  <Text style={styles.placeholderText}>The room is quiet</Text>
                  <Text style={styles.placeholderSub}>
                    Hold the mic or type below. Address a seat by name — “Amber?” — or ask everybody for one thought.
                  </Text>
                </>
              ) : (
                <ScrollView style={styles.transcript} showsVerticalScrollIndicator={false}>
                  {recent.map((entry) => (
                    <View key={entry.id} style={styles.entry}>
                      <Text style={styles.entryName}>{entry.name}</Text>
                      <Text style={styles.entryText}>{entry.text}</Text>
                    </View>
                  ))}
                </ScrollView>
              )}
              <View style={styles.seatRow}>
                {seats.map((seat) => (
                  <Pressable
                    key={seat.id}
                    onPress={() => onSeatPress?.(seat.id)}
                    style={[
                      styles.seatCard,
                      { borderColor: seat.color },
                      currentSpeakerId === seat.id && styles.seatSpeaking,
                    ]}
                  >
                    <Text style={styles.seatCardName}>{seat.name}</Text>
                    <Text style={styles.seatStatus}>{seat.status.toUpperCase()}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          {currentMode === 'speaker' && (
            <View style={styles.speakerMode}>
              <Text style={styles.placeholderText}>
                {currentSpeakerId
                  ? seats.find((s) => s.id === currentSpeakerId)?.name ?? '—'
                  : 'No one speaking'}
              </Text>
              <Text style={styles.placeholderSub}>Current floor holder</Text>
            </View>
          )}

          {(currentMode === 'notes' || currentMode === 'reference') && (
            <View style={styles.speakerMode}>
              <Text style={styles.placeholderText}>{currentMode.toUpperCase()}</Text>
              <Text style={styles.placeholderSub}>Surface ready for content</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function statusColor(status: string) {
  switch (status) {
    case 'speaking': return '#22c55e';
    case 'thinking': return '#eab308';
    case 'listening': return '#3b82f6';
    case 'offline': return '#6b7280';
    case 'muted': return '#ef4444';
    default: return '#9ca3af';
  }
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#111113',
    borderBottomWidth: 1,
    borderBottomColor: '#1f1f23',
  },
  expanded: {
    minHeight: 200,
  },
  modeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 4,
  },
  modeScroll: {
    flexDirection: 'row',
    gap: 6,
    paddingRight: 8,
  },
  modeTab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#1c1c1f',
  },
  modeTabActive: {
    backgroundColor: '#f59e0b',
  },
  modeText: {
    color: '#9ca3af',
    fontSize: 12,
    fontWeight: '600',
  },
  modeTextActive: {
    color: '#000',
  },
  expandBtn: {
    padding: 8,
    marginLeft: 4,
  },
  expandText: {
    color: '#9ca3af',
    fontSize: 16,
  },
  collapsedRow: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    paddingBottom: 8,
    gap: 8,
  },
  seatChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: '#1a1a1d',
    gap: 6,
  },
  seatSpeaking: {
    backgroundColor: '#1f1a10',
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  seatName: {
    color: '#e5e5e5',
    fontSize: 12,
    fontWeight: '500',
    maxWidth: 70,
  },
  expandedBody: {
    padding: 12,
    paddingTop: 4,
  },
  placeholderText: {
    color: '#e5e5e5',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 4,
  },
  placeholderSub: {
    color: '#6b7280',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 17,
  },
  transcript: {
    maxHeight: 90,
    marginBottom: 10,
  },
  entry: {
    marginBottom: 6,
  },
  entryName: {
    color: '#f59e0b',
    fontSize: 11,
    fontWeight: '600',
  },
  entryText: {
    color: '#d1d5db',
    fontSize: 13,
  },
  seatRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: 8,
  },
  seatCard: {
    flex: 1,
    backgroundColor: '#1a1a1d',
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
    alignItems: 'center',
  },
  seatCardName: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  seatStatus: {
    color: '#9ca3af',
    fontSize: 10,
    marginTop: 2,
  },
  speakerMode: {
    paddingVertical: 20,
    alignItems: 'center',
  },
});
