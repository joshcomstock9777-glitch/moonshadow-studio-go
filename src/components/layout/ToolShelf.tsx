import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput } from 'react-native';
import { ToolPanelState } from '../../types';
import { EditorRuntime, EditorState } from '../../modules/editor/runtime';
import { assetLibrary } from '../../modules/assets/library';
import { persistAsset } from '../../modules/assets/storageClient';

interface ToolShelfProps {
  state: ToolPanelState;
  onStateChange: (state: ToolPanelState) => void;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  editorRuntime: EditorRuntime;
}

const BASE_TABS = [
  { id: 'markup', label: 'Markup', status: 'NOT CONNECTED', detail: 'Drawing/annotation module is not mounted yet.' },
  { id: 'media', label: 'Media', status: 'PARTIAL', detail: 'Direct media URI import is connected to the shared editor runtime. Device/gallery picker and durable asset storage are not connected yet.' },
  { id: 'browser', label: 'Browser', status: 'NOT CONNECTED', detail: 'Browser/research surface is not mounted yet.' },
  { id: 'notes', label: 'Notes', status: 'PARTIAL', detail: 'Project notes can be persisted through the durable Asset Storage contract. A note is not reported saved unless storage confirmation is returned.' },
  { id: 'audio', label: 'Audio', status: 'PARTIAL', detail: 'Selected-clip volume and mute controls are connected to the shared editor runtime. Recording, waveform processing, and production mixing remain unconnected.' },
  { id: 'text', label: 'Text', status: 'PARTIAL', detail: 'Text insertion is mounted on the shared editor runtime. Production rendering/export remains unconnected.' },
] as const;

export default function ToolShelf({
  state,
  onStateChange,
  activeTab = 'markup',
  onTabChange,
  editorRuntime,
}: ToolShelfProps) {
  const isOpen = state !== 'collapsed';
  const [mediaUri, setMediaUri] = useState('');
  const [mediaName, setMediaName] = useState('');
  const [mediaMessage, setMediaMessage] = useState('');
  const [textValue, setTextValue] = useState('');
  const [textMessage, setTextMessage] = useState('');
  const [notesValue, setNotesValue] = useState('');
  const [notesMessage, setNotesMessage] = useState('');
  const [notesSaving, setNotesSaving] = useState(false);
  const [audioMessage, setAudioMessage] = useState('');
  const [editorState, setEditorState] = useState<EditorState>(() => editorRuntime.getState());
  const tabs = useMemo(() => BASE_TABS, []);
  const active = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];
  const selectedClip = editorState.media.find((clip) => clip.id === editorState.selectedClipId) || null;

  useEffect(() => {
    const unsubscribe = editorRuntime.subscribe(setEditorState);
    return () => {
      unsubscribe();
    };
  }, [editorRuntime]);

  const cycle = () => {
    if (state === 'collapsed') onStateChange('half');
    else if (state === 'half') onStateChange('full');
    else if (state === 'full') onStateChange('half');
    else onStateChange('half');
  };

  const toggleLock = () => {
    if (state === 'locked') onStateChange('half');
    else onStateChange('locked');
  };

  const importMedia = async () => {
    const uri = mediaUri.trim();
    if (!uri) {
      setMediaMessage('Enter a media URI before importing.');
      return;
    }
    const result = await editorRuntime.execute({
      type: 'load_media',
      payload: { uri, name: mediaName.trim() || undefined },
    });
    setMediaMessage(result.message);
    if (result.ok) {
      setMediaUri('');
      setMediaName('');
    }
  };

  const addText = async () => {
    const value = textValue.trim();
    if (!value) {
      setTextMessage('Enter text before adding it.');
      return;
    }
    const result = await editorRuntime.execute({ type: 'add_text', payload: { text: value } });
    setTextMessage(result.message);
    if (result.ok) setTextValue('');
  };

  const saveNotes = async () => {
    const value = notesValue.trim();
    if (!value) {
      setNotesMessage('Enter project notes before saving.');
      return;
    }

    const parentAssetIds = Array.from(new Set(editorState.media.map((clip) => clip.assetId)));
    setNotesSaving(true);
    setNotesMessage('Saving notes through durable Asset Storage…');
    try {
      const confirmation = await persistAsset({
        name: `${editorState.projectName} notes`,
        kind: 'project_state',
        projectName: editorState.projectName,
        parentAssetIds,
        metadata: {
          noteText: value,
          noteType: 'project_notes',
          mediaCount: editorState.media.length,
          textCount: editorState.text.length,
          savedAt: Date.now(),
        },
      });
      assetLibrary.registerDurableAsset(confirmation.asset);
      setNotesMessage(`Project notes saved durably at ${new Date(confirmation.confirmedAt).toLocaleTimeString()}.`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Durable Asset Storage did not confirm the note.';
      setNotesMessage(`Notes were not marked saved. ${reason}`);
    } finally {
      setNotesSaving(false);
    }
  };

  const adjustVolume = async (level: number) => {
    const result = await editorRuntime.execute({ type: 'adjust_volume', payload: { level } });
    setAudioMessage(result.message);
  };

  const toggleMute = async () => {
    const result = await editorRuntime.execute({ type: 'mute_track' });
    setAudioMessage(result.message);
  };

  return (
    <View
      style={[
        styles.container,
        isOpen && styles.open,
        state === 'full' && styles.full,
        state === 'locked' && styles.locked,
      ]}
    >
      <Pressable style={styles.handleArea} onPress={cycle} onLongPress={toggleLock}>
        <View style={[styles.handle, state === 'locked' && styles.handleLocked]} />
        <Text style={[styles.handleHint, state === 'locked' && styles.handleHintLocked]}>
          {state === 'collapsed'
            ? 'Pull tools'
            : state === 'locked'
            ? 'Locked • long-press to unlock'
            : 'Tools'}
        </Text>
      </Pressable>

      {isOpen && (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.tabRow}
            contentContainerStyle={styles.tabContent}
          >
            {tabs.map((tab) => (
              <Pressable
                key={tab.id}
                onPress={() => onTabChange?.(tab.id)}
                style={[styles.tab, activeTab === tab.id && styles.tabActive]}
              >
                <Text style={[styles.tabText, activeTab === tab.id && styles.tabTextActive]}>
                  {tab.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <View style={styles.body}>
            <Text style={styles.surfaceTitle}>{active.label}</Text>
            <Text style={[styles.status, active.status === 'PARTIAL' && styles.statusPartial]}>{active.status}</Text>
            <Text style={styles.detail}>{active.detail}</Text>

            {active.id === 'media' ? (
              <View style={styles.toolPanel}>
                <TextInput
                  style={styles.input}
                  value={mediaUri}
                  onChangeText={setMediaUri}
                  placeholder="Media URI (file://, content://, https://...)"
                  placeholderTextColor="#6b7280"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TextInput
                  style={styles.input}
                  value={mediaName}
                  onChangeText={setMediaName}
                  placeholder="Optional clip name"
                  placeholderTextColor="#6b7280"
                />
                <Pressable style={styles.actionButton} onPress={importMedia}>
                  <Text style={styles.actionButtonText}>Import to timeline</Text>
                </Pressable>
                {!!mediaMessage && <Text style={styles.toolMessage}>{mediaMessage}</Text>}
                <Text style={styles.boundary}>Import adds the supplied URI to the real shared editor timeline. It does not claim the URI is durable, uploaded, or renderer-validated.</Text>
              </View>
            ) : active.id === 'text' ? (
              <View style={styles.toolPanel}>
                <TextInput
                  style={[styles.input, styles.multilineInput]}
                  value={textValue}
                  onChangeText={setTextValue}
                  placeholder="Text to add at the current playhead"
                  placeholderTextColor="#6b7280"
                  multiline
                />
                <Pressable style={styles.actionButton} onPress={addText}>
                  <Text style={styles.actionButtonText}>Add text at playhead</Text>
                </Pressable>
                {!!textMessage && <Text style={styles.toolMessage}>{textMessage}</Text>}
                <Text style={styles.boundary}>Success means the text item was added to shared editor project state at the current playhead. It does not claim rendered pixels or exported media exist.</Text>
              </View>
            ) : active.id === 'notes' ? (
              <View style={styles.toolPanel}>
                <TextInput
                  style={[styles.input, styles.multilineInput]}
                  value={notesValue}
                  onChangeText={setNotesValue}
                  placeholder="Project notes, continuity, edit decisions, or publish notes"
                  placeholderTextColor="#6b7280"
                  multiline
                />
                <Pressable style={[styles.actionButton, notesSaving && styles.disabledButton]} disabled={notesSaving} onPress={saveNotes}>
                  <Text style={styles.actionButtonText}>{notesSaving ? 'Saving…' : 'Save notes durably'}</Text>
                </Pressable>
                {!!notesMessage && <Text style={styles.toolMessage}>{notesMessage}</Text>}
                <Text style={styles.boundary}>Notes are registered in Asset Library only after the server returns durable storage evidence. Failed or unavailable storage leaves the note explicitly unconfirmed.</Text>
              </View>
            ) : active.id === 'audio' ? (
              <View style={styles.toolPanel}>
                <Text style={styles.audioSelection}>
                  {selectedClip ? `${selectedClip.name} • ${Math.round(selectedClip.volume * 100)}%${selectedClip.muted ? ' • muted' : ''}` : 'Select or import a clip before changing audio.'}
                </Text>
                <View style={styles.audioRow}>
                  <Pressable
                    style={[styles.secondaryButton, !selectedClip && styles.disabledButton]}
                    disabled={!selectedClip}
                    onPress={() => adjustVolume(Math.max(0, (selectedClip?.volume || 0) - 0.1))}
                  >
                    <Text style={styles.secondaryButtonText}>−10%</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.actionButton, !selectedClip && styles.disabledButton]}
                    disabled={!selectedClip}
                    onPress={toggleMute}
                  >
                    <Text style={styles.actionButtonText}>{selectedClip?.muted ? 'Unmute' : 'Mute'}</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.secondaryButton, !selectedClip && styles.disabledButton]}
                    disabled={!selectedClip}
                    onPress={() => adjustVolume(Math.min(2, (selectedClip?.volume || 0) + 0.1))}
                  >
                    <Text style={styles.secondaryButtonText}>+10%</Text>
                  </Pressable>
                </View>
                {!!audioMessage && <Text style={styles.toolMessage}>{audioMessage}</Text>}
                <Text style={styles.boundary}>These controls mutate selected-clip volume/mute state in the real shared editor runtime. They do not claim recording, waveform processing, rendered audio, or exported media.</Text>
              </View>
            ) : (
              <Text style={styles.boundary}>No action on this surface reports success until a real module is connected.</Text>
            )}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#141416',
    borderTopWidth: 1,
    borderTopColor: '#2a2a2e',
    maxHeight: 48,
  },
  open: {
    maxHeight: 260,
  },
  full: {
    maxHeight: 390,
  },
  locked: {
    borderTopColor: '#f59e0b',
  },
  handleArea: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#4b5563',
    marginBottom: 4,
  },
  handleLocked: {
    backgroundColor: '#f59e0b',
  },
  handleHint: {
    color: '#6b7280',
    fontSize: 11,
  },
  handleHintLocked: {
    color: '#f59e0b',
  },
  tabRow: {
    maxHeight: 40,
  },
  tabContent: {
    paddingHorizontal: 12,
    gap: 8,
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 14,
    backgroundColor: '#1c1c1f',
  },
  tabActive: {
    backgroundColor: '#f59e0b',
  },
  tabText: {
    color: '#9ca3af',
    fontSize: 13,
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#000',
  },
  body: {
    flex: 1,
    paddingHorizontal: 16,
    paddingBottom: 14,
    alignItems: 'center',
  },
  surfaceTitle: {
    color: '#e5e5e5',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 5,
  },
  status: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 6,
  },
  statusPartial: {
    color: '#f59e0b',
  },
  detail: {
    color: '#9ca3af',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 8,
  },
  toolPanel: {
    width: '100%',
    gap: 7,
  },
  input: {
    width: '100%',
    minHeight: 36,
    borderRadius: 8,
    backgroundColor: '#1c1c1f',
    color: '#e5e5e5',
    paddingHorizontal: 10,
    fontSize: 12,
  },
  multilineInput: {
    minHeight: 58,
    paddingTop: 9,
    textAlignVertical: 'top',
  },
  actionButton: {
    alignSelf: 'center',
    borderRadius: 10,
    backgroundColor: '#f59e0b',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  actionButtonText: {
    color: '#000',
    fontSize: 12,
    fontWeight: '800',
  },
  secondaryButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#4b5563',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  secondaryButtonText: {
    color: '#e5e5e5',
    fontSize: 12,
    fontWeight: '700',
  },
  disabledButton: {
    opacity: 0.35,
  },
  audioRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  audioSelection: {
    color: '#d1d5db',
    fontSize: 12,
    textAlign: 'center',
  },
  toolMessage: {
    color: '#d1d5db',
    fontSize: 11,
    textAlign: 'center',
  },
  boundary: {
    color: '#6b7280',
    fontSize: 11,
    textAlign: 'center',
  },
});
