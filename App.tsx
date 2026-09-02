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
import FactoryTool from './src/components/factory/FactoryTool';
import AssetLibraryTool from './src/components/assets/AssetLibraryTool';
import { Seat, TopMode, ToolPanelState, TranscriptEntry } from './src/types';
import { createOrchestrator } from './src/modules/orchestrator';
import { createEditorAdapter } from './src/modules/editor/adapter';
import { createEditorRuntime } from './src/modules/editor/runtime';
import { createEditorCompanion, CompanionMode } from './src/modules/editor/companion';
import {
  buildPathEditorPrompt,
  parseCreatorEditorDirective,
  parsePathEditorEnvelope,
} from './src/modules/editor/pathCompanion';
import { usePathMessage } from './src/hooks/usePathMessage';

const DEFAULT_SEATS: Seat[] = [
  { id: '1', name: 'Grok', color: '#f59e0b', status: 'listening', enabled: true, muted: false, isEditorCapable: true },
  { id: '2', name: 'Amber', color: '#22c55e', status: 'listening', enabled: true, muted: false, isEditorCapable: false },
  { id: '3', name: 'Allie', color: '#3b82f6', status: 'listening', enabled: true, muted: false, isEditorCapable: true },
  { id: '4', name: 'Gemini', color: '#a855f7', status: 'offline', enabled: false, muted: false, isEditorCapable: false },
];

type StudioSurface = 'editor' | 'factory' | 'assets';

interface PendingEditorRequest {
  instruction: string;
  mode: CompanionMode;
  destructiveApproved: boolean;
  approvedAt: number | null;
}

export default function App() {
  const [seats, setSeats] = useState<Seat[]>(DEFAULT_SEATS);
  const [roomExpanded, setRoomExpanded] = useState(false);
  const [topMode, setTopMode] = useState<TopMode>('room');
  const [toolState, setToolState] = useState<ToolPanelState>('collapsed');
  const [activeToolTab, setActiveToolTab] = useState('markup');
  const [studioSurface, setStudioSurface] = useState<StudioSurface>('editor');
  const [inputText, setInputText] = useState('');
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [currentSpeakerId, setCurrentSpeakerId] = useState<string | null>(null);

  const orchestrator = useRef(createOrchestrator({ mode: 'natural', allowSilence: true })).current;
  const editorRuntime = useRef(createEditorRuntime()).current;
  const editorAdapter = useRef(createEditorAdapter(editorRuntime)).current;
  const editorCompanion = useRef(createEditorCompanion(editorAdapter, 'suggest')).current;
  const pendingEditorRequest = useRef<PendingEditorRequest | null>(null);
  const seenCompanionEntries = useRef(new Set<string>());
  const { session: pathSession, isLoading: pathIsLoading, error: pathError, sendToAllie } = usePathMessage();
  const seenPathEntries = useRef(new Set<string>());

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
      const identity = entry.identity || entry.from || 'Path';

      if (!seenPathEntries.current.has(key)) {
        seenPathEntries.current.add(key);
        const seat = DEFAULT_SEATS.find((candidate) => candidate.name.toLowerCase() === identity.toLowerCase());
        addTranscript(seat?.id || 'system', identity, entry.body || '');
      }

      const pending = pendingEditorRequest.current;
      if (!pending || seenCompanionEntries.current.has(key) || identity.toLowerCase() !== 'allie') return;
      const envelope = parsePathEditorEnvelope(entry.body || '');
      if (!envelope) return;

      seenCompanionEntries.current.add(key);
      editorCompanion.setMode(pending.mode);
      void editorCompanion.run({
        instruction: pending.instruction,
        commands: envelope.commands,
        rationale: envelope.rationale,
        ...(pending.destructiveApproved && pending.approvedAt
          ? { destructiveApproval: { approved: true as const, approvedAt: pending.approvedAt, approvedBy: 'creator' as const } }
          : {}),
      }).then((result) => {
        if (pendingEditorRequest.current === pending) pendingEditorRequest.current = null;
        const details = result.steps.map((step) => `${step.command.type}: ${step.message || (step.ok ? 'ok' : 'failed')}`).join(' · ');
        addTranscript('system', 'Editor Companion', details ? `${result.summary} ${details}` : result.summary);
      }).catch((error) => {
        if (pendingEditorRequest.current === pending) pendingEditorRequest.current = null;
        const message = error instanceof Error ? error.message : 'Editor Companion failed without a result.';
        addTranscript('system', 'Editor Companion', `No editor completion was recorded. ${message}`);
      });
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
  }, [pathSession, addTranscript, editorCompanion]);

  useEffect(() => {
    if (pathError) addTranscript('system', 'Path', pathError);
  }, [pathError, addTranscript]);

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || pathIsLoading) return;

    setInputText('');
    addTranscript('human', 'You', text);
    orchestrator.onHumanInput(text, seats, transcript);

    const directive = parseCreatorEditorDirective(text);
    if (directive) {
      if (!directive.instruction) {
        addTranscript('system', 'Editor Companion', 'No editor instruction was provided. Use /edit for a suggestion or /edit! to execute permitted edits.');
        return;
      }
      const approvedAt = directive.destructiveApproved ? Date.now() : null;
      pendingEditorRequest.current = {
        instruction: directive.instruction,
        mode: directive.mode,
        destructiveApproved: directive.destructiveApproved,
        approvedAt,
      };
      await sendToAllie(buildPathEditorPrompt(directive, editorRuntime.getState()));
      return;
    }

    await sendToAllie(text);
  }, [inputText, pathIsLoading, seats, transcript, addTranscript, orchestrator, sendToAllie, editorRuntime]);

  const openMicTools = useCallback(() => {
    setStudioSurface('editor');
    setActiveToolTab('audio');
    setToolState((current) => current === 'collapsed' ? 'half' : current);
  }, []);

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
          {studioSurface === 'factory' ? (
            <FactoryTool editorRuntime={editorRuntime} />
          ) : studioSurface === 'assets' ? (
            <AssetLibraryTool editorRuntime={editorRuntime} onOpenEditor={() => setStudioSurface('editor')} />
          ) : (
            <EditorSurface runtime={editorRuntime} />
          )}
        </View>

        {studioSurface === 'editor' && <ToolShelf
          state={toolState}
          onStateChange={setToolState}
          activeTab={activeToolTab}
          onTabChange={setActiveToolTab}
          editorRuntime={editorRuntime}
        />}

        <View style={styles.talkBar}>
          <Pressable
            style={[styles.surfaceBtn, studioSurface === 'factory' && styles.surfaceBtnActive]}
            onPress={() => setStudioSurface((value) => value === 'factory' ? 'editor' : 'factory')}
          >
            <Text style={[styles.surfaceText, studioSurface === 'factory' && styles.surfaceTextActive]}>{studioSurface === 'factory' ? 'Editor' : 'Factory'}</Text>
          </Pressable>
          <Pressable
            style={[styles.surfaceBtn, studioSurface === 'assets' && styles.surfaceBtnActive]}
            onPress={() => setStudioSurface((value) => value === 'assets' ? 'editor' : 'assets')}
          >
            <Text style={[styles.surfaceText, studioSurface === 'assets' && styles.surfaceTextActive]}>{studioSurface === 'assets' ? 'Editor' : 'Assets'}</Text>
          </Pressable>
          <Pressable
            style={[styles.micBtn, studioSurface === 'editor' && activeToolTab === 'audio' && toolState !== 'collapsed' && styles.micBtnActive]}
            onPress={openMicTools}
            accessibilityRole="button"
            accessibilityLabel="Open microphone and audio controls"
          >
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
  talkBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#111113', borderTopWidth: 1, borderTopColor: '#1f1f23', gap: 8 },
  surfaceBtn: { height: 36, borderRadius: 10, borderWidth: 1, borderColor: '#4b5563', paddingHorizontal: 9, justifyContent: 'center', alignItems: 'center' },
  surfaceBtnActive: { backgroundColor: '#f59e0b', borderColor: '#f59e0b' },
  surfaceText: { color: '#d1d5db', fontSize: 10, fontWeight: '800' },
  surfaceTextActive: { color: '#000' },
  micBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#1c1c1f', justifyContent: 'center', alignItems: 'center' },
  micBtnActive: { backgroundColor: '#374151' },
  micIcon: { fontSize: 18 },
  input: { flex: 1, height: 40, backgroundColor: '#1c1c1f', borderRadius: 20, paddingHorizontal: 16, color: '#e5e5e5', fontSize: 15 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#f59e0b', justifyContent: 'center', alignItems: 'center' },
  sendBtnDisabled: { opacity: 0.45 },
  sendText: { color: '#000', fontSize: 18, fontWeight: '700' },
});