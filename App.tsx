import React, { useState, useRef, useCallback } from 'react';
import { StyleSheet, View, SafeAreaView, StatusBar, TextInput, Pressable, Text, KeyboardAvoidingView, Platform } from 'react-native';
import AIRoomStrip from './src/components/layout/AIRoomStrip';
import EditorSurface from './src/components/layout/EditorSurface';
import ToolShelf from './src/components/layout/ToolShelf';
import { Seat, TopMode, ToolPanelState, TranscriptEntry } from './src/types';
import { createOrchestrator } from './src/modules/orchestrator';
import { createEditorAdapter } from './src/modules/editor/adapter';

const DEFAULT_SEATS: Seat[] = [
  { id:'1', name:'Grok', color:'#f59e0b', status:'listening', enabled:true, muted:false, isEditorCapable:true },
  { id:'2', name:'Amber', color:'#22c55e', status:'listening', enabled:true, muted:false, isEditorCapable:false },
  { id:'3', name:'Ellie', color:'#3b82f6', status:'listening', enabled:true, muted:false, isEditorCapable:true },
  { id:'4', name:'Gemini', color:'#a855f7', status:'offline', enabled:false, muted:false, isEditorCapable:false },
];

export default function App() {
  const [seats,setSeats]=useState<Seat[]>(DEFAULT_SEATS); const [roomExpanded,setRoomExpanded]=useState(false); const [topMode,setTopMode]=useState<TopMode>('room'); const [toolState,setToolState]=useState<ToolPanelState>('collapsed'); const [activeToolTab,setActiveToolTab]=useState('markup'); const [inputText,setInputText]=useState(''); const [transcript,setTranscript]=useState<TranscriptEntry[]>([]); const [currentSpeakerId,setCurrentSpeakerId]=useState<string|null>(null);
  const orchestrator=useRef(createOrchestrator({mode:'natural',allowSilence:true})).current; useRef(createEditorAdapter()).current;
  const addTranscript=useCallback((seatId:string|'human'|'system',name:string,text:string)=>{const entry:TranscriptEntry={id:`${Date.now()}-${Math.random().toString(36).slice(2,7)}`,seatId,name,text,timestamp:Date.now()};setTranscript(p=>[...p,entry]);return entry;},[]);
  const handleSend=useCallback(()=>{const text=inputText.trim();if(!text)return;setInputText('');addTranscript('human','You',text);const decision=orchestrator.onHumanInput(text,seats,transcript);if(decision.action==='speak'&&decision.seatId){const seat=seats.find(s=>s.id===decision.seatId);if(!seat)return;setSeats(p=>p.map(s=>s.id===seat.id?{...s,status:'thinking'}:{...s,status:s.status==='speaking'?'listening':s.status}));setCurrentSpeakerId(seat.id);setTimeout(()=>{setSeats(p=>p.map(s=>s.id===seat.id?{...s,status:'speaking'}:s));addTranscript(seat.id,seat.name,`[${seat.name}] Got it. Working with that.`);setTimeout(()=>{setSeats(p=>p.map(s=>s.id===seat.id?{...s,status:'listening'}:s));setCurrentSpeakerId(null);orchestrator.onAiFinishedSpeaking(seat.id);},1200);},600);}},[inputText,seats,transcript,addTranscript,orchestrator]);
  return <SafeAreaView style={styles.safe}><StatusBar barStyle="light-content" backgroundColor="#0a0a0b"/><KeyboardAvoidingView style={styles.root} behavior={Platform.OS==='ios'?'padding':undefined}><AIRoomStrip seats={seats} isExpanded={roomExpanded} currentMode={topMode} transcript={transcript} currentSpeakerId={currentSpeakerId} onToggleExpand={()=>setRoomExpanded(v=>!v)} onModeChange={setTopMode}/><View style={styles.editorWrap}><EditorSurface/></View><ToolShelf state={toolState} onStateChange={setToolState} activeTab={activeToolTab} onTabChange={setActiveToolTab}/><View style={styles.talkBar}><Pressable style={styles.micBtn}><Text style={styles.micIcon}>🎙</Text></Pressable><TextInput style={styles.input} placeholder="Talk to the room..." placeholderTextColor="#6b7280" value={inputText} onChangeText={setInputText} onSubmitEditing={handleSend} returnKeyType="send"/><Pressable style={styles.sendBtn} onPress={handleSend}><Text style={styles.sendText}>↑</Text></Pressable></View></KeyboardAvoidingView></SafeAreaView>;
}
const styles=StyleSheet.create({safe:{flex:1,backgroundColor:'#0a0a0b'},root:{flex:1},editorWrap:{flex:1},talkBar:{flexDirection:'row',alignItems:'center',paddingHorizontal:12,paddingVertical:8,backgroundColor:'#111113',borderTopWidth:1,borderTopColor:'#1f1f23',gap:10},micBtn:{width:40,height:40,borderRadius:20,backgroundColor:'#1c1c1f',justifyContent:'center',alignItems:'center'},micIcon:{fontSize:18},input:{flex:1,height:40,backgroundColor:'#1c1c1f',borderRadius:20,paddingHorizontal:16,color:'#e5e5e5',fontSize:15},sendBtn:{width:40,height:40,borderRadius:20,backgroundColor:'#f59e0b',justifyContent:'center',alignItems:'center'},sendText:{color:'#000',fontSize:18,fontWeight:'700'}});
