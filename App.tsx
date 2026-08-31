import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  StyleSheet,
  View,
  SafeAreaView,
  StatusBar,
  TextInput,
  Pressable,
  Text,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import AIRoomStrip from './src/components/layout/AIRoomStrip';
import EditorSurface from './src/components/layout/EditorSurface';
import ToolShelf from './src/components/layout/ToolShelf';
import { Seat, TopMode, ToolPanelState, TranscriptEntry } from './src/types';
import { createOrchestrator } from './src/modules/orchestrator';
import { createEditorAdapter } from './src/modules/editor/adapter';
import { createEditorRuntime } from './src/modules/editor/runtime';
import { usePathMessage } from './src/hooks/usePathMessage';

const DEFAULT_SEATS: Seat[] = [
  { id: '1', name: 'Grok', color: '#f59e0b', status: 'listening', enabled: true, muted: false, isEditorCapable: true },
  { id: '2', name: 'Amber', color: '#22c55e', status: 'listening', enabled: true, muted: false, isEditorCapable: false },
  { id: '3', name: 'Allie', color: '#3b82f6', status: 'listening', enabled: true, muted: false, isEditorCapable: true },
  { id: '4', name: 'Gemini', color: '#a855f7', status: 'offline', enabled: false, muted: false, isEditorCapable: false },
];

export default function App() {
  const [seats, setSeats] = useState<Seat[]>(DEFAULT_SEATS);
  const [roomExpanded, setRoomExpanded] = useState(false);
  const [topMode, setTopMode] = useState<TopMode>('room');
  const [toolState, setToolState] = useState<ToolPanelState>('collapsed');
  const [activeToolTab, setActiveToolTab] = useState('markup');
  const [inputText, setInputText] = useState('');
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [currentSpeakerId, setCurrentSpeakerId] = useState<string | null>(null);

  const orchestrator = useRef(createOrchestrator({ mode: 'natural', allowSilence: true })).current;
  const editorRuntime = useRef(createEditorRuntime()).current;
  const editorAdapter = useRef(createEditorAdapter(editorRuntime)).current;
  const { session: pathSession, isLoading: pathIsLoading, error: pathError, sendToAllie } = usePathMessage();
  const seenPathEntries = useRef(new Set<string>());

  useEffect(() => {
    // Keep the adapter live at the app boundary so AI/editor tooling shares the same runtime as the visible surface.
    void editorAdapter;
  }, [editorAdapter]);

  const addTranscript = useCallback((seatId: string | 'human' | 'system', name: string, text: string) => {
    const entry: TranscriptEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      seatId,
      name,
      text,
      timestamp: Date.now(),
    };
    setTranscript((prev) => [...prev, entry]);
    return entry;
  }, []);

  useEffect(() => {
    if (!pathSession) return;

    pathSession.transcript.forEach((entry, index) => {
      const key = `${pathSession.correlationId}:${entry.turn ?? index}:${entry.createdAt ?? ''}`;
      if (seenPathEntries.current.has(key)) return;
      seenPathEntries.current.add(key);

      const identity = entry.identity || entry.from || 'Path';
      const seat = DEFAULT_SEATS.find((candidate) => candidate.name.toLowerCase() === identity.toLowerCase());
      addTranscript(seat?.id || 'system', identity, entry.body || '');
    });

    const activeIdentity = pathSession.transcript[pathSession.transcript.length - 1]?.identity;
    const activeSeat = activeIdentity
      ? DEFAULT_SEATS.find((candidate) => candidate.name.toLowerCase() === activeIdentity.toLowerCase())
      : undefined;
    setCurrentSpeakerId(pathSession.isActive ? activeSeat?.id || null : null);
    setSeats((previous) => previous.map((seat) => ({
      ...seat,
      status: pathSession.isActive && seat.id === activeSeat?.id ? 'thinking' : seat.enabled ? 'listening' : 'offline',
    })));
  }, [pathSession, addTranscript]);

  useEffect(() => {
    if (pathError) addTranscript('system', 'Path', pathError);
  }, [pathError, addTranscript]);

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || pathIsLoading) return;

    setInputText('');
    addTranscript('human', 'You', text);
    orchestrator.onHumanInput(text, seats, transcript);
    await sendToAllie(text);
  }, [inputText, pathIsLoading, seats, transcript, addTranscript, orchestrator, sendToAllie]);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0b" />
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <AIRoomStrip
          seats={seats}
          isExpanded={roomExpanded}
          currentMode={topMode}
          transcript={transcript}
          currentSpeakerId={currentSpeakerId}
          onToggleExpand={() => setRoomExpanded((v) => !v)}
          onModeChange={setTopMode}
        />

        <View style={styles.editorWrap}>
          <EditorSurface runtime={editorRuntime} />
        </View>

        <ToolShelf
          state={toolState}
          onStateChange={setToolState}
          activeTab={activeToolTab}
          onTabChange={setActiveToolTab}
        />

        <View style={styles.talkBar}>
          <Pressable style={styles.micBtn}>
            <Text style={styles.micIcon}>🎙</Text>
          </Pressable>
          <TextInput
            style={styles.input}
            placeholder="Talk to the room..."
            placeholderTextColor="#6b7280"
            value={inputText}
            onChangeText={setInputText}
            onSubmitEditing={handleSend}
            returnKeyType="send"
          />
          <Pressable style={[styles.sendBtn, pathIsLoading && styles.sendBtnDisabled]} onPress={handleSend} disabled={pathIsLoading}>
            <Text style={styles.sendText}>↑</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0a0a0b' },
  root: { flex: 1 },
  editorWrap: { flex: 1 },
  talkBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#111113', borderTopWidth: 1, borderTopColor: '#1f1f23', gap: 10 },
  micBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#1c1c1f', justifyContent: 'center', alignItems: 'center' },
  micIcon: { fontSize: 18 },
  input: { flex: 1, height: 40, backgroundColor: '#1c1c1f', borderRadius: 20, paddingHorizontal: 16, color: '#e5e5e5', fontSize: 15 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#f59e0b', justifyContent: 'center', alignItems: 'center' },
  sendBtnDisabled: { opacity: 0.45 },
  sendText: { color: '#000', fontSize: 18, fontWeight: '700' },
});
