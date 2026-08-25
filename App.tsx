import React, { useState, useRef, useCallback, useEffect } from 'react';
import { StyleSheet, View, SafeAreaView, StatusBar, TextInput, Pressable, Text, KeyboardAvoidingView, Platform } from 'react-native';
import AIRoomStrip from './src/components/layout/AIRoomStrip';
import EditorSurface from './src/components/layout/EditorSurface';
import ToolShelf from './src/components/layout/ToolShelf';
import { Seat, TopMode, ToolPanelState, TranscriptEntry } from './src/types';
import { usePathMessage } from './src/hooks/usePathMessage';
import { PathEntry } from './src/services/pathClient';
import { createOrchestrator } from './src/modules/orchestrator';
import { createEditorAdapter } from './src/modules/editor/adapter';

const DEFAULT_SEATS: Seat[] = [
  { id:'1', name:'Grok', color:'#f59e0b', status:'listening', enabled:true, muted:false, isEditorCapable:true },
  { id:'2', name:'Amber', color:'#22c55e', status:'listening', enabled:true, muted:false, isEditorCapable:false },
  { id:'3', name:'Ellie', color:'#3b82f6', status:'listening', enabled:true, muted:false, isEditorCapable:true },
  { id:'4', name:'Gemini', color:'#a855f7', status:'offline', enabled:false, muted:false, isEditorCapable:false },
];

export default function App() {
  const [seats,setSeats]=useState<Seat[]>(DEFAULT_SEATS);
  const [roomExpanded,setRoomExpanded]=useState(false);
  const [topMode,setTopMode]=useState<TopMode>('room');
  const [toolState,setToolState]=useState<ToolPanelState>('collapsed');
  const [activeToolTab,setActiveToolTab]=useState('markup');
  const [inputText,setInputText]=useState('');
  const [transcript,setTranscript]=useState<TranscriptEntry[]>([]);
  const [currentSpeakerId,setCurrentSpeakerId]=useState<string|null>(null);
  const [pathError,setPathError]=useState<string|null>(null);

  const orchestrator=useRef(createOrchestrator({mode:'natural',allowSilence:true})).current;
  useRef(createEditorAdapter()).current;

  // Wire Path adapter
  const { session, isLoading, error, sendToAllie, clearError } = usePathMessage();

  // Track last seen Path transcript entries to avoid duplicates
  const lastPathIndexRef = useRef<number>(-1);

  // Add entry to Studio Go transcript
  const addTranscript=useCallback((seatId:string|'human'|'system'|'path',name:string,text:string)=>{
    const entry:TranscriptEntry={
      id:`${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
      seatId,
      name,
      text,
      timestamp:Date.now()
    };
    setTranscript(p=>[...p,entry]);
    return entry;
  },[]);

  // Sync Path session transcript into Studio Go transcript
  useEffect(() => {
    if (!session?.transcript || session.transcript.length === 0) return;

    const newEntries = session.transcript.slice(lastPathIndexRef.current + 1);
    for (const entry of newEntries) {
      const entryName = entry.identity || entry.from || 'Path';
      const entryText = entry.body || '';
      addTranscript('path', entryName, entryText);
    }

    lastPathIndexRef.current = session.transcript.length - 1;
  }, [session?.transcript, addTranscript]);

  // Sync Path error state
  useEffect(() => {
    if (error) {
      setPathError(error);
      // Auto-clear error after 5 seconds
      const timer = setTimeout(() => {
        setPathError(null);
        clearError();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error, clearError]);

  // Sync Path session status
  useEffect(() => {
    if (session?.status === 'final') {
      addTranscript('system', 'Path', '✓ Request completed');
    } else if (session?.status === 'error') {
      addTranscript('system', 'Path', `✗ Request error: ${session.error || 'unknown error'}`);
    }
  }, [session?.status, session?.error, addTranscript]);

  // Handle send: try Path first (new flow), fall back to orchestrator (existing flow)
  const handleSend=useCallback(async ()=>{
    const text=inputText.trim();
    if(!text)return;
    if(isLoading)return; // Block send while loading

    setInputText('');
    addTranscript('human','You',text);

    // Try Path first for this proof
    try {
      await sendToAllie(text);
    } catch (err) {
      console.error('Path send error:', err);
      // Fall back to orchestrator if Path fails
      const decision=orchestrator.onHumanInput(text,seats,transcript);
      if(decision.action==='speak'&&decision.seatId){
        const seat=seats.find(s=>s.id===decision.seatId);
        if(!seat)return;
        setSeats(p=>p.map(s=>s.id===seat.id?{...s,status:'thinking'}:{...s,status:s.status==='speaking'?'listening':s.status}));
        setCurrentSpeakerId(seat.id);
        setTimeout(()=>{
          setSeats(p=>p.map(s=>s.id===seat.id?{...s,status:'speaking'}:s));
          addTranscript(seat.id,seat.name,`[${seat.name}] Got it. Working with that.`);
          setTimeout(()=>{
            setSeats(p=>p.map(s=>s.id===seat.id?{...s,status:'listening'}:s));
            setCurrentSpeakerId(null);
            orchestrator.onAiFinishedSpeaking(seat.id);
          },1200);
        },600);
      }
    }
  },[inputText,seats,transcript,addTranscript,orchestrator,isLoading,sendToAllie]);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0b"/>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS==='ios'?'padding':undefined}>
        <AIRoomStrip 
          seats={seats} 
          isExpanded={roomExpanded} 
          currentMode={topMode} 
          transcript={transcript} 
          currentSpeakerId={currentSpeakerId} 
          onToggleExpand={()=>setRoomExpanded(v=>!v)} 
          onModeChange={setTopMode}
        />
        <View style={styles.editorWrap}>
          <EditorSurface/>
        </View>
        <ToolShelf 
          state={toolState} 
          onStateChange={setToolState} 
          activeTab={activeToolTab} 
          onTabChange={setActiveToolTab}
        />
        {/* Error display */}
        {pathError && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>⚠ {pathError}</Text>
            <Pressable onPress={() => setPathError(null)}>
              <Text style={styles.errorClose}>✕</Text>
            </Pressable>
          </View>
        )}
        <View style={styles.talkBar}>
          <Pressable style={styles.micBtn}>
            <Text style={styles.micIcon}>🎙</Text>
          </Pressable>
          <TextInput 
            style={[styles.input, isLoading && styles.inputDisabled]} 
            placeholder={isLoading ? "Sending to Path..." : "Talk to Allie..."}
            placeholderTextColor="#6b7280" 
            value={inputText} 
            onChangeText={setInputText} 
            onSubmitEditing={handleSend} 
            returnKeyType="send"
            editable={!isLoading}
          />
          <Pressable 
            style={[styles.sendBtn, isLoading && styles.sendBtnDisabled]} 
            onPress={handleSend}
            disabled={isLoading}
          >
            <Text style={styles.sendText}>{isLoading ? '⏳' : '↑'}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles=StyleSheet.create({
  safe:{flex:1,backgroundColor:'#0a0a0b'},
  root:{flex:1},
  editorWrap:{flex:1},
  talkBar:{
    flexDirection:'row',
    alignItems:'center',
    paddingHorizontal:12,
    paddingVertical:8,
    backgroundColor:'#111113',
    borderTopWidth:1,
    borderTopColor:'#1f1f23',
    gap:10
  },
  micBtn:{width:40,height:40,borderRadius:20,backgroundColor:'#1c1c1f',justifyContent:'center',alignItems:'center'},
  micIcon:{fontSize:18},
  input:{flex:1,height:40,backgroundColor:'#1c1c1f',borderRadius:20,paddingHorizontal:16,color:'#e5e5e5',fontSize:15},
  inputDisabled:{opacity:0.6,backgroundColor:'#141416'},
  sendBtn:{width:40,height:40,borderRadius:20,backgroundColor:'#f59e0b',justifyContent:'center',alignItems:'center'},
  sendBtnDisabled:{backgroundColor:'#8b7355',opacity:0.6},
  sendText:{color:'#000',fontSize:18,fontWeight:'700'},
  errorBanner:{
    flexDirection:'row',
    alignItems:'center',
    justifyContent:'space-between',
    backgroundColor:'#7c2d12',
    borderBottomWidth:1,
    borderBottomColor:'#92400e',
    paddingHorizontal:12,
    paddingVertical:8,
    gap:8
  },
  errorText:{color:'#fef3c7',fontSize:13,flex:1},
  errorClose:{color:'#fef3c7',fontSize:16,fontWeight:'bold'}
});
