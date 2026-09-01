import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { EditorCommand } from '../../types';
import { EditorRuntime, EditorState } from '../../modules/editor/runtime';

interface Props {
  runtime: EditorRuntime;
}

export default function EditorSurface({ runtime }: Props) {
  const [state, setState] = useState<EditorState>(runtime.getState());
  const [busyAction, setBusyAction] = useState<string | null>(null);

  useEffect(() => runtime.subscribe(setState), [runtime]);

  const execute = async (label: string, command: EditorCommand) => {
    setBusyAction(label);
    try {
      await runtime.execute(command);
    } finally {
      setBusyAction(null);
    }
  };

  const togglePlayback = () => {
    void execute(state.isPlaying ? 'Pause' : 'Play', { type: state.isPlaying ? 'pause' : 'play' });
  };

  const jump = (delta: number) => {
    void execute('Seek', { type: 'seek', payload: { time: state.currentTime + delta } });
  };

  const selectedClip = state.media.find((clip) => clip.id === state.selectedClipId) || null;
  const playheadInsideSelected = !!selectedClip && state.currentTime > selectedClip.start && state.currentTime < selectedClip.start + selectedClip.duration;
  const progress = state.duration > 0 ? Math.min(100, (state.currentTime / state.duration) * 100) : 0;
  const disabled = busyAction !== null;

  const editButtons: Array<{ label: string; command: EditorCommand; enabled: boolean }> = [
    { label: 'Split', command: { type: 'split' }, enabled: playheadInsideSelected },
    { label: 'Trim start', command: { type: 'trim_start' }, enabled: playheadInsideSelected },
    { label: 'Trim end', command: { type: 'trim_end' }, enabled: playheadInsideSelected },
    { label: 'Duplicate', command: { type: 'duplicate_clip' }, enabled: !!selectedClip },
    { label: 'Fade 0.5s', command: { type: 'add_fade', payload: { in: 0.5, out: 0.5 } }, enabled: !!selectedClip && selectedClip.duration >= 1 },
    { label: 'Delete', command: { type: 'delete_clip' }, enabled: !!selectedClip },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.label}>EDITOR CORE</Text>
          <Text style={styles.project}>{state.projectName}</Text>
        </View>
        <Text style={[styles.status, state.dirty && styles.dirty]}>{state.dirty ? 'UNSAVED' : 'SAVED'}</Text>
      </View>

      <View style={styles.actionRow}>
        <Pressable disabled={disabled || !runtime.canUndo()} onPress={() => void execute('Undo', { type: 'undo' })} style={[styles.secondaryAction, (disabled || !runtime.canUndo()) && styles.disabled]}>
          <Text style={styles.secondaryActionText}>Undo</Text>
        </Pressable>
        <Pressable disabled={disabled || !runtime.canRedo()} onPress={() => void execute('Redo', { type: 'redo' })} style={[styles.secondaryAction, (disabled || !runtime.canRedo()) && styles.disabled]}>
          <Text style={styles.secondaryActionText}>Redo</Text>
        </Pressable>
        <Pressable disabled={disabled} onPress={() => void execute('Save', { type: 'save_project' })} style={[styles.primaryAction, disabled && styles.disabled]}>
          <Text style={styles.primaryActionText}>{busyAction === 'Save' ? 'Saving…' : 'Save'}</Text>
        </Pressable>
        <Pressable disabled={disabled || state.dirty || state.media.length === 0} onPress={() => void execute('Export', { type: 'export_preview' })} style={[styles.primaryAction, (disabled || state.dirty || state.media.length === 0) && styles.disabled]}>
          <Text style={styles.primaryActionText}>{busyAction === 'Export' ? 'Exporting…' : 'Export'}</Text>
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.editRail} contentContainerStyle={styles.editRailContent}>
        {editButtons.map((button) => (
          <Pressable key={button.label} disabled={disabled || !button.enabled} onPress={() => void execute(button.label, button.command)} style={[styles.editAction, (disabled || !button.enabled) && styles.disabled]}>
            <Text style={styles.editActionText}>{button.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView style={styles.timeline} contentContainerStyle={styles.timelineContent}>
        {state.media.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No media loaded</Text>
            <Text style={styles.emptyBody}>The real editor runtime is active. Import media from the Media tool shelf to begin editing.</Text>
          </View>
        ) : (
          state.media.map((clip) => {
            const selected = clip.id === state.selectedClipId;
            return (
              <Pressable
                key={clip.id}
                style={[styles.clip, selected && styles.clipSelected]}
                onPress={() => void execute('Select clip', { type: 'select_clip', payload: { clipId: clip.id } })}
              >
                <Text style={styles.clipName}>{clip.name}</Text>
                <Text style={styles.clipMeta}>{clip.start.toFixed(1)}s · {clip.duration.toFixed(1)}s · {clip.muted ? 'MUTED' : `${Math.round(clip.volume * 100)}%`} · fades {(clip.fadeIn || 0).toFixed(1)}s/{(clip.fadeOut || 0).toFixed(1)}s</Text>
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
        <Text style={styles.message}>{busyAction ? `${busyAction} in progress…` : state.lastMessage}</Text>
      </View>

      <View style={styles.transport}>
        <Pressable disabled={disabled} onPress={() => jump(-5)}><Text style={[styles.transportBtn, disabled && styles.transportDisabled]}>⏮</Text></Pressable>
        <Pressable disabled={disabled} onPress={togglePlayback}><Text style={[styles.transportBtn, styles.play, disabled && styles.transportDisabled]}>{state.isPlaying ? '⏸' : '▶'}</Text></Pressable>
        <Pressable disabled={disabled} onPress={() => jump(5)}><Text style={[styles.transportBtn, disabled && styles.transportDisabled]}>⏭</Text></Pressable>
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
  actionRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#1f1f23' },
  primaryAction: { backgroundColor: '#f59e0b', borderRadius: 8, paddingHorizontal: 11, paddingVertical: 7 },
  primaryActionText: { color: '#000', fontSize: 11, fontWeight: '800' },
  secondaryAction: { borderWidth: 1, borderColor: '#3f3f46', borderRadius: 8, paddingHorizontal: 11, paddingVertical: 7 },
  secondaryActionText: { color: '#d4d4d8', fontSize: 11, fontWeight: '700' },
  disabled: { opacity: 0.3 },
  editRail: { maxHeight: 42, borderBottomWidth: 1, borderBottomColor: '#1f1f23' },
  editRailContent: { paddingHorizontal: 12, paddingVertical: 7, gap: 7 },
  editAction: { backgroundColor: '#18181b', borderRadius: 8, paddingHorizontal: 11, paddingVertical: 6 },
  editActionText: { color: '#e5e5e5', fontSize: 11, fontWeight: '600' },
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
  transportDisabled: { opacity: 0.3 },
  play: { color: '#f59e0b', fontSize: 22 },
  scrubber: { flex: 1, height: 4, backgroundColor: '#2a2a2e', borderRadius: 2, overflow: 'hidden' },
  scrubberFill: { height: '100%', backgroundColor: '#f59e0b' },
  time: { color: '#8b8b92', fontSize: 10, minWidth: 62, textAlign: 'right' },
});
