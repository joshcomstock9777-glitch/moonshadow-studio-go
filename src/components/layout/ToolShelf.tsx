import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ToolPanelState } from '../../types';
import { EditorRuntime, EditorState } from '../../modules/editor/runtime';
import { assetLibrary } from '../../modules/assets/library';
import { persistAsset } from '../../modules/assets/storageClient';
import { isWebMicCaptureSupported, WebMicRecorder } from '../../modules/audio/webMicRecorder';
import { isWebMediaPickerSupported, pickWebMedia } from '../../modules/media/webMediaPicker';
import { saveMarkupNote, saveResearchReference } from '../../modules/tools/evidenceArtifacts';

interface ToolShelfProps {
  state: ToolPanelState;
  onStateChange: (state: ToolPanelState) => void;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  editorRuntime: EditorRuntime;
}

const BASE_TABS = [
  { id: 'markup', label: 'Markup', status: 'PARTIAL', detail: 'Timeline/asset annotation notes are mounted and persist only after durable Asset Storage confirmation. Freehand drawing remains unconnected.' },
  { id: 'media', label: 'Media', status: 'PARTIAL', detail: 'Typed URI import and a real Studio Go web file picker are connected to the shared editor runtime. Browser-local files remain non-durable until a binary upload path confirms storage; native device/gallery picking remains unconnected.' },
  { id: 'browser', label: 'Browser', status: 'PARTIAL', detail: 'A real URL launcher is mounted through the runtime browser, with research-reference capture through durable Asset Storage. Embedded in-app browsing remains unconnected.' },
  { id: 'notes', label: 'Notes', status: 'PARTIAL', detail: 'Project notes can be persisted through the durable Asset Storage contract. A note is not reported saved unless storage confirmation is returned.' },
  { id: 'audio', label: 'Audio', status: 'PARTIAL', detail: 'Selected-clip volume/mute controls are connected. Studio Go web can record a real microphone take through browser MediaRecorder and place it on the shared editor timeline. Native-device recording and production mixing remain unconnected.' },
  { id: 'text', label: 'Text', status: 'PARTIAL', detail: 'Text insertion is mounted on the shared editor runtime. Production rendering/export remains unconnected.' },
] as const;

function normalizeHttpUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error('Enter a URL first.');
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = new URL(candidate);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('Browser requires an http(s) URL.');
  return parsed.toString();
}

export default function ToolShelf({ state, onStateChange, activeTab = 'markup', onTabChange, editorRuntime }: ToolShelfProps) {
  const isOpen = state !== 'collapsed';
  const [mediaUri, setMediaUri] = useState('');
  const [mediaName, setMediaName] = useState('');
  const [mediaMessage, setMediaMessage] = useState('');
  const [mediaSaving, setMediaSaving] = useState(false);
  const [mediaPicking, setMediaPicking] = useState(false);
  const [textValue, setTextValue] = useState('');
  const [textMessage, setTextMessage] = useState('');
  const [notesValue, setNotesValue] = useState('');
  const [notesMessage, setNotesMessage] = useState('');
  const [notesSaving, setNotesSaving] = useState(false);
  const [audioMessage, setAudioMessage] = useState('');
  const [recording, setRecording] = useState(false);
  const [browserUrl, setBrowserUrl] = useState('');
  const [browserTitle, setBrowserTitle] = useState('');
  const [browserNote, setBrowserNote] = useState('');
  const [browserMessage, setBrowserMessage] = useState('');
  const [browserSaving, setBrowserSaving] = useState(false);
  const [markupValue, setMarkupValue] = useState('');
  const [markupMessage, setMarkupMessage] = useState('');
  const [markupSaving, setMarkupSaving] = useState(false);
  const [editorState, setEditorState] = useState<EditorState>(() => editorRuntime.getState());
  const recorderRef = useRef<WebMicRecorder | null>(null);
  const tabs = useMemo(() => BASE_TABS, []);
  const active = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];
  const selectedClip = editorState.media.find((clip) => clip.id === editorState.selectedClipId) || null;
  const webMicSupported = isWebMicCaptureSupported();
  const webMediaPickerSupported = isWebMediaPickerSupported();
  const parentAssetIds = Array.from(new Set(editorState.media.map((clip) => clip.assetId)));

  if (!recorderRef.current) recorderRef.current = new WebMicRecorder();

  useEffect(() => editorRuntime.subscribe(setEditorState), [editorRuntime]);
  useEffect(() => () => recorderRef.current?.dispose(), []);

  const cycle = () => {
    if (state === 'collapsed') onStateChange('half');
    else if (state === 'half') onStateChange('full');
    else if (state === 'full') onStateChange('half');
    else onStateChange('half');
  };

  const toggleLock = () => onStateChange(state === 'locked' ? 'half' : 'locked');

  const importMedia = async () => {
    const uri = mediaUri.trim();
    const name = mediaName.trim() || undefined;
    if (!uri) return setMediaMessage('Enter a media URI before importing.');
    setMediaSaving(true);
    const result = await editorRuntime.execute({ type: 'load_media', payload: { uri, name } });
    if (!result.ok) {
      setMediaMessage(result.message);
      setMediaSaving(false);
      return;
    }
    setMediaUri('');
    setMediaName('');
    setMediaMessage('Imported to the editor timeline. Checking durable Asset Storage…');
    try {
      const confirmation = await persistAsset({
        name: name || `Imported media ${new Date().toISOString()}`,
        kind: 'source_media',
        uri,
        parentAssetIds: [],
        metadata: { importedAt: Date.now(), importSurface: 'studio_go_media_tool' },
      });
      assetLibrary.registerDurableAsset(confirmation.asset);
      setMediaMessage(`Imported to timeline and registered durably at ${new Date(confirmation.confirmedAt).toLocaleTimeString()}.`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Durable Asset Storage did not confirm the source media.';
      setMediaMessage(`Imported to timeline, but durable storage was not confirmed. ${reason}`);
    } finally {
      setMediaSaving(false);
    }
  };

  const chooseLocalMedia = async () => {
    try {
      setMediaPicking(true);
      setMediaMessage('Opening local media picker…');
      const picked = await pickWebMedia();
      if (!picked) return setMediaMessage('Local media selection was cancelled.');
      const result = await editorRuntime.execute({ type: 'load_media', payload: { uri: picked.uri, name: picked.name } });
      if (!result.ok) return setMediaMessage(`Selected local media, but the editor rejected it. ${result.message}`);
      setMediaMessage(`Loaded ${picked.name} (${Math.max(1, Math.round(picked.size / 1024))} KB) from the browser file picker. This browser object URL is local/non-durable until binary Asset Storage upload confirms persistence.`);
    } catch (error) {
      setMediaMessage(error instanceof Error ? error.message : 'Local media selection failed.');
    } finally {
      setMediaPicking(false);
    }
  };

  const addText = async () => {
    const value = textValue.trim();
    if (!value) return setTextMessage('Enter text before adding it.');
    const result = await editorRuntime.execute({ type: 'add_text', payload: { text: value } });
    setTextMessage(result.message);
    if (result.ok) setTextValue('');
  };

  const saveNotes = async () => {
    const value = notesValue.trim();
    if (!value) return setNotesMessage('Enter project notes before saving.');
    setNotesSaving(true);
    setNotesMessage('Saving notes through durable Asset Storage…');
    try {
      const confirmation = await persistAsset({
        name: `${editorState.projectName} notes`,
        kind: 'project_state',
        projectName: editorState.projectName,
        parentAssetIds,
        metadata: { noteText: value, noteType: 'project_notes', mediaCount: editorState.media.length, textCount: editorState.text.length, savedAt: Date.now() },
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

  const openBrowserUrl = async () => {
    try {
      const url = normalizeHttpUrl(browserUrl);
      setBrowserUrl(url);
      setBrowserMessage('Opening URL in the runtime browser…');
      const supported = await Linking.canOpenURL(url);
      if (!supported) throw new Error('This runtime cannot open that URL.');
      await Linking.openURL(url);
      setBrowserMessage('URL opened in the runtime browser. Research evidence has not been saved unless durable storage is confirmed separately.');
    } catch (error) {
      setBrowserMessage(error instanceof Error ? error.message : 'Browser launch failed.');
    }
  };

  const saveResearch = async () => {
    try {
      const url = normalizeHttpUrl(browserUrl);
      setBrowserSaving(true);
      setBrowserMessage('Saving research reference through durable Asset Storage…');
      const confirmation = await saveResearchReference({
        projectName: editorState.projectName,
        url,
        title: browserTitle,
        note: browserNote,
        parentAssetIds,
      });
      setBrowserMessage(`Research reference saved durably at ${new Date(confirmation.confirmedAt).toLocaleTimeString()}.`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Research reference was not confirmed durable.';
      setBrowserMessage(`Research reference was not marked saved. ${reason}`);
    } finally {
      setBrowserSaving(false);
    }
  };

  const saveMarkup = async () => {
    const note = markupValue.trim();
    if (!note) return setMarkupMessage('Enter an annotation before saving.');
    try {
      setMarkupSaving(true);
      setMarkupMessage('Saving timeline annotation through durable Asset Storage…');
      const confirmation = await saveMarkupNote({
        projectName: editorState.projectName,
        note,
        targetAssetId: selectedClip?.assetId,
        timeMs: Math.max(0, editorState.currentTime * 1000),
        parentAssetIds,
      });
      setMarkupValue('');
      setMarkupMessage(`Annotation saved durably at ${new Date(confirmation.confirmedAt).toLocaleTimeString()} for ${selectedClip ? selectedClip.name : 'the project'} at ${editorState.currentTime.toFixed(1)}s.`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Markup annotation was not confirmed durable.';
      setMarkupMessage(`Annotation was not marked saved. ${reason}`);
    } finally {
      setMarkupSaving(false);
    }
  };

  const adjustVolume = async (level: number) => setAudioMessage((await editorRuntime.execute({ type: 'adjust_volume', payload: { level } })).message);
  const toggleMute = async () => setAudioMessage((await editorRuntime.execute({ type: 'mute_track' })).message);

  const startMicRecording = async () => {
    try {
      setAudioMessage('Requesting microphone permission…');
      await recorderRef.current!.start();
      setRecording(true);
      setAudioMessage('Recording microphone take. Stop when the take is finished.');
    } catch (error) {
      setRecording(false);
      setAudioMessage(error instanceof Error ? error.message : 'Microphone recording could not start.');
    }
  };

  const stopMicRecording = async () => {
    try {
      setAudioMessage('Finalizing microphone take…');
      const clip = await recorderRef.current!.stop();
      setRecording(false);
      const name = `Voice take ${new Date(clip.recordedAt).toLocaleTimeString()}`;
      const result = await editorRuntime.execute({ type: 'load_media', payload: { uri: clip.uri, name } });
      if (!result.ok) return setAudioMessage(`Microphone take was captured, but the editor rejected it. ${result.message}`);
      setAudioMessage(`Microphone take captured (${Math.max(1, Math.round(clip.size / 1024))} KB) and placed on the editor timeline. This browser object URL is local/non-durable until a durable media upload path confirms storage.`);
    } catch (error) {
      setRecording(false);
      setAudioMessage(error instanceof Error ? error.message : 'Microphone recording could not be finalized.');
    }
  };

  return (
    <View style={[styles.container, isOpen && styles.open, state === 'full' && styles.full, state === 'locked' && styles.locked]}>
      <Pressable style={styles.handleArea} onPress={cycle} onLongPress={toggleLock}>
        <View style={[styles.handle, state === 'locked' && styles.handleLocked]} />
        <Text style={[styles.handleHint, state === 'locked' && styles.handleHintLocked]}>{state === 'collapsed' ? 'Pull tools' : state === 'locked' ? 'Locked • long-press to unlock' : 'Tools'}</Text>
      </Pressable>
      {isOpen && <>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabRow} contentContainerStyle={styles.tabContent}>
          {tabs.map((tab) => <Pressable key={tab.id} onPress={() => onTabChange?.(tab.id)} style={[styles.tab, activeTab === tab.id && styles.tabActive]}><Text style={[styles.tabText, activeTab === tab.id && styles.tabTextActive]}>{tab.label}</Text></Pressable>)}
        </ScrollView>
        <View style={styles.body}>
          <Text style={styles.surfaceTitle}>{active.label}</Text>
          <Text style={[styles.status, active.status === 'PARTIAL' && styles.statusPartial]}>{active.status}</Text>
          <Text style={styles.detail}>{active.detail}</Text>

          {active.id === 'markup' ? <View style={styles.toolPanel}>
            <Text style={styles.toolMessage}>{selectedClip ? `Target: ${selectedClip.name}` : 'Target: whole project'} • playhead {editorState.currentTime.toFixed(1)}s</Text>
            <TextInput style={[styles.input, styles.multilineInput]} value={markupValue} onChangeText={setMarkupValue} placeholder="Annotation, continuity note, fix, or review comment" placeholderTextColor="#6b7280" multiline />
            <Pressable style={[styles.actionButton, markupSaving && styles.disabledButton]} disabled={markupSaving} onPress={saveMarkup}><Text style={styles.actionButtonText}>{markupSaving ? 'Saving…' : 'Save annotation durably'}</Text></Pressable>
            {!!markupMessage && <Text style={styles.toolMessage}>{markupMessage}</Text>}
            <Text style={styles.boundary}>This is real evidence-backed timeline/asset annotation. It does not claim freehand drawing or rendered markup exists.</Text>
          </View> : active.id === 'browser' ? <View style={styles.toolPanel}>
            <TextInput style={styles.input} value={browserUrl} onChangeText={setBrowserUrl} placeholder="URL or domain" placeholderTextColor="#6b7280" autoCapitalize="none" autoCorrect={false} />
            <View style={styles.audioRow}>
              <Pressable style={styles.actionButton} onPress={openBrowserUrl}><Text style={styles.actionButtonText}>Open browser</Text></Pressable>
              <Pressable style={[styles.secondaryButton, browserSaving && styles.disabledButton]} disabled={browserSaving} onPress={saveResearch}><Text style={styles.secondaryButtonText}>{browserSaving ? 'Saving…' : 'Save reference'}</Text></Pressable>
            </View>
            <TextInput style={styles.input} value={browserTitle} onChangeText={setBrowserTitle} placeholder="Optional reference title" placeholderTextColor="#6b7280" />
            <TextInput style={[styles.input, styles.multilineInput]} value={browserNote} onChangeText={setBrowserNote} placeholder="Optional research note" placeholderTextColor="#6b7280" multiline />
            {!!browserMessage && <Text style={styles.toolMessage}>{browserMessage}</Text>}
            <Text style={styles.boundary}>Open browser launches the real runtime browser through React Native Linking. Save reference is a separate durable-storage action and fails closed if Asset Storage cannot confirm it. Embedded in-app browsing is not claimed.</Text>
          </View> : active.id === 'media' ? <View style={styles.toolPanel}>
            <Pressable style={[styles.actionButton, (!webMediaPickerSupported || mediaPicking) && styles.disabledButton]} disabled={!webMediaPickerSupported || mediaPicking} onPress={chooseLocalMedia}><Text style={styles.actionButtonText}>{mediaPicking ? 'Choosing…' : 'Choose local file'}</Text></Pressable>
            {!webMediaPickerSupported && <Text style={styles.toolMessage}>Local file picking is unavailable in this runtime. Studio Go web requires browser file-input support; native device/gallery picking remains unconnected.</Text>}
            <TextInput style={styles.input} value={mediaUri} onChangeText={setMediaUri} placeholder="Media URI (file://, content://, https://...)" placeholderTextColor="#6b7280" autoCapitalize="none" autoCorrect={false} />
            <TextInput style={styles.input} value={mediaName} onChangeText={setMediaName} placeholder="Optional clip name" placeholderTextColor="#6b7280" />
            <Pressable style={[styles.actionButton, mediaSaving && styles.disabledButton]} disabled={mediaSaving} onPress={importMedia}><Text style={styles.actionButtonText}>{mediaSaving ? 'Importing…' : 'Import URI to timeline'}</Text></Pressable>
            {!!mediaMessage && <Text style={styles.toolMessage}>{mediaMessage}</Text>}
            <Text style={styles.boundary}>Typed URI import and browser-local picking both mutate the real editor timeline. Durable storage is a separate evidence boundary. Browser object URLs are never labeled durable; native device/gallery selection and binary upload remain separate work.</Text>
          </View> : active.id === 'text' ? <View style={styles.toolPanel}>
            <TextInput style={[styles.input, styles.multilineInput]} value={textValue} onChangeText={setTextValue} placeholder="Text to add at the current playhead" placeholderTextColor="#6b7280" multiline />
            <Pressable style={styles.actionButton} onPress={addText}><Text style={styles.actionButtonText}>Add text at playhead</Text></Pressable>
            {!!textMessage && <Text style={styles.toolMessage}>{textMessage}</Text>}
            <Text style={styles.boundary}>Success means the text item was added to shared editor project state at the current playhead. It does not claim rendered pixels or exported media exist.</Text>
          </View> : active.id === 'notes' ? <View style={styles.toolPanel}>
            <TextInput style={[styles.input, styles.multilineInput]} value={notesValue} onChangeText={setNotesValue} placeholder="Project notes, continuity, edit decisions, or publish notes" placeholderTextColor="#6b7280" multiline />
            <Pressable style={[styles.actionButton, notesSaving && styles.disabledButton]} disabled={notesSaving} onPress={saveNotes}><Text style={styles.actionButtonText}>{notesSaving ? 'Saving…' : 'Save notes durably'}</Text></Pressable>
            {!!notesMessage && <Text style={styles.toolMessage}>{notesMessage}</Text>}
            <Text style={styles.boundary}>Notes are registered in Asset Library only after the server returns durable storage evidence. Failed or unavailable storage leaves the note explicitly unconfirmed.</Text>
          </View> : active.id === 'audio' ? <View style={styles.toolPanel}>
            <Text style={styles.audioSelection}>{selectedClip ? `${selectedClip.name} • ${Math.round(selectedClip.volume * 100)}%${selectedClip.muted ? ' • muted' : ''}` : 'Select or import a clip before changing audio.'}</Text>
            <View style={styles.audioRow}>
              <Pressable style={[styles.secondaryButton, !selectedClip && styles.disabledButton]} disabled={!selectedClip} onPress={() => adjustVolume(Math.max(0, (selectedClip?.volume || 0) - 0.1))}><Text style={styles.secondaryButtonText}>−10%</Text></Pressable>
              <Pressable style={[styles.actionButton, !selectedClip && styles.disabledButton]} disabled={!selectedClip} onPress={toggleMute}><Text style={styles.actionButtonText}>{selectedClip?.muted ? 'Unmute' : 'Mute'}</Text></Pressable>
              <Pressable style={[styles.secondaryButton, !selectedClip && styles.disabledButton]} disabled={!selectedClip} onPress={() => adjustVolume(Math.min(2, (selectedClip?.volume || 0) + 0.1))}><Text style={styles.secondaryButtonText}>+10%</Text></Pressable>
            </View>
            <View style={styles.audioRow}>
              <Pressable style={[styles.actionButton, (!webMicSupported || recording) && styles.disabledButton]} disabled={!webMicSupported || recording} onPress={startMicRecording}><Text style={styles.actionButtonText}>Record mic</Text></Pressable>
              <Pressable style={[styles.secondaryButton, !recording && styles.disabledButton]} disabled={!recording} onPress={stopMicRecording}><Text style={styles.secondaryButtonText}>Stop take</Text></Pressable>
            </View>
            {!webMicSupported && <Text style={styles.toolMessage}>Microphone capture is not available in this runtime. Studio Go web requires browser microphone permission; native-device capture remains unconnected.</Text>}
            {!!audioMessage && <Text style={styles.toolMessage}>{audioMessage}</Text>}
            <Text style={styles.boundary}>Volume/mute mutate real editor state. Web microphone capture uses browser MediaRecorder and places the captured take on the same editor timeline. A captured browser object URL is explicitly local/non-durable until Asset Storage confirms an upload.</Text>
          </View> : <Text style={styles.boundary}>No action on this surface reports success until a real module is connected.</Text>}
        </View>
      </>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#141416', borderTopWidth: 1, borderTopColor: '#2a2a2e', maxHeight: 48 },
  open: { maxHeight: 260 },
  full: { maxHeight: 430 },
  locked: { borderTopColor: '#f59e0b' },
  handleArea: { alignItems: 'center', paddingVertical: 8 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#4b5563', marginBottom: 4 },
  handleLocked: { backgroundColor: '#f59e0b' },
  handleHint: { color: '#6b7280', fontSize: 11 },
  handleHintLocked: { color: '#f59e0b' },
  tabRow: { maxHeight: 40 },
  tabContent: { paddingHorizontal: 12, gap: 8 },
  tab: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 14, backgroundColor: '#1c1c1f' },
  tabActive: { backgroundColor: '#f59e0b' },
  tabText: { color: '#9ca3af', fontSize: 13, fontWeight: '500' },
  tabTextActive: { color: '#000' },
  body: { flex: 1, paddingHorizontal: 16, paddingBottom: 14, alignItems: 'center' },
  surfaceTitle: { color: '#e5e5e5', fontSize: 14, fontWeight: '700', marginBottom: 5 },
  status: { color: '#ef4444', fontSize: 12, fontWeight: '800', marginBottom: 6 },
  statusPartial: { color: '#f59e0b' },
  detail: { color: '#9ca3af', fontSize: 12, textAlign: 'center', marginBottom: 8 },
  toolPanel: { width: '100%', gap: 7 },
  input: { width: '100%', minHeight: 36, borderRadius: 8, backgroundColor: '#1c1c1f', color: '#e5e5e5', paddingHorizontal: 10, fontSize: 12 },
  multilineInput: { minHeight: 58, paddingTop: 9, textAlignVertical: 'top' },
  actionButton: { alignSelf: 'center', borderRadius: 10, backgroundColor: '#f59e0b', paddingHorizontal: 14, paddingVertical: 8 },
  actionButtonText: { color: '#000', fontSize: 12, fontWeight: '800' },
  secondaryButton: { borderRadius: 10, borderWidth: 1, borderColor: '#4b5563', paddingHorizontal: 14, paddingVertical: 8 },
  secondaryButtonText: { color: '#e5e5e5', fontSize: 12, fontWeight: '700' },
  disabledButton: { opacity: 0.35 },
  audioRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  audioSelection: { color: '#d1d5db', fontSize: 12, textAlign: 'center' },
  toolMessage: { color: '#d1d5db', fontSize: 11, textAlign: 'center' },
  boundary: { color: '#6b7280', fontSize: 11, textAlign: 'center' },
});
