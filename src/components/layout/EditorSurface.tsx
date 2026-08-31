import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { EditorRuntime, EditorState } from '../../modules/editor/runtime';

interface Props {
  runtime: EditorRuntime;
}

export default function EditorSurface({ runtime }: Props) {
  const [state, setState] = useState<EditorState>(runtime.getState());

  useEffect(() => runtime.subscribe(setState), [runtime]);

  const togglePlayback = () => {
    runtime.execute({ type: state.isPlaying ? 'pause' : 'play' });
  };

  const jump = (delta: number) => {
    runtime.execute({ type: 'seek', payload: { time: state.currentTime + delta } });
  };

  const progress = state.duration > 0 ? Math.min(100, (state.currentTime / state.duration) * 100) : 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.label}>EDITOR CORE</Text>
          <Text style={styles.project}>{state.projectName}</Text>
        </View>
        <Text style={[styles.status, state.dirty && styles.dirty]}>{state.dirty ? 'UNSAVED' : 'SAVED'}</Text>
      </View>

      <ScrollView style={styles.timeline} contentContainerStyle={styles.timelineContent}>
        {state.media.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No media loaded</Text>
            <Text style={styles.emptyBody}>The editor runtime is active. Media import is the next connection point.</Text>
          </View>
        ) : (
          state.media.map((clip) => {
            const selected = clip.id === state.selectedClipId;
            return (
              <Pressable
                key={clip.id}
                style={[styles.clip, selected && styles.clipSelected]}
                onPress={() => runtime.execute({ type: 'select_clip', payload: { clipId: clip.id } })}
              >
                <Text style={styles.clipName}>{clip.name}</Text>
                <Text style={styles.clipMeta}>{clip.start.toFixed(1)}s · {clip.duration.toFixed(1)}s · {clip.muted ? 'MUTED' : `${Math.round(clip.volume * 100)}%`}</Text>
              </Pressable>
            );
          })
        )}

        {state.text.map((item) => (
          <View key={item.id} style={styles.textCue}>
            <Text style={styles.textCueTime}>{item.time.toFixed(1)}s</Text>
            <Text style={styles.textCueBody}>{item.text}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.messageBar}>
        <Text style={styles.message}>{state.lastMessage}</Text>
      </View>

      <View style={styles.transport}>
        <Pressable onPress={() => jump(-5)}><Text style={styles.transportBtn}>⏮</Text></Pressable>
        <Pressable onPress={togglePlayback}><Text style={[styles.transportBtn, styles.play]}>{state.isPlaying ? '⏸' : '▶'}</Text></Pressable>
        <Pressable onPress={() => jump(5)}><Text style={styles.transportBtn}>⏭</Text></Pressable>
        <View style={styles.scrubber}>
          <View style={[styles.scrubberFill, { width: `${progress}%` }]} />
        </View>
        <Text style={styles.time}>{state.currentTime.toFixed(1)} / {state.duration.toFixed(1)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0b' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1f1f23' },
  label: { color: '#f59e0b', fontSize: 11, fontWeight: '700', letterSpacing: 1.4 },
  project: { color: '#e5e5e5', fontSize: 13, marginTop: 2 },
  status: { color: '#22c55e', fontSize: 10, fontWeight: '700' },
  dirty: { color: '#f59e0b' },
  timeline: { flex: 1 },
  timelineContent: { padding: 16, gap: 10 },
  empty: { flex: 1, minHeight: 180, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emptyTitle: { color: '#e5e5e5', fontSize: 15, fontWeight: '700' },
  emptyBody: { color: '#6b7280', fontSize: 12, textAlign: 'center', marginTop: 8, lineHeight: 18 },
  clip: { backgroundColor: '#17171a', borderWidth: 1, borderColor: '#2a2a2e', borderRadius: 8, padding: 12 },
  clipSelected: { borderColor: '#f59e0b' },
  clipName: { color: '#e5e5e5', fontSize: 13, fontWeight: '600' },
  clipMeta: { color: '#8b8b92', fontSize: 11, marginTop: 4 },
  textCue: { flexDirection: 'row', gap: 10, padding: 10, backgroundColor: '#111113', borderRadius: 6 },
  textCueTime: { color: '#f59e0b', fontSize: 11 },
  textCueBody: { color: '#d1d5db', fontSize: 12, flex: 1 },
  messageBar: { paddingHorizontal: 16, paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#1f1f23' },
  message: { color: '#8b8b92', fontSize: 10 },
  transport: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#111113', borderTopWidth: 1, borderTopColor: '#1f1f23', gap: 16 },
  transportBtn: { color: '#e5e5e5', fontSize: 18 },
  play: { color: '#f59e0b', fontSize: 22 },
  scrubber: { flex: 1, height: 4, backgroundColor: '#2a2a2e', borderRadius: 2, overflow: 'hidden' },
  scrubberFill: { height: '100%', backgroundColor: '#f59e0b' },
  time: { color: '#8b8b92', fontSize: 10, minWidth: 62, textAlign: 'right' },
});
