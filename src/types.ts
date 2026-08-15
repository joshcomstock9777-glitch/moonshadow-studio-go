/**
 * Studio Go type definitions
 * 
 * Shared types for components, hooks, and services
 */

export interface Seat {
  id: string;
  name: string;
  color: string;
  status: SeatStatus;
  enabled: boolean;
  muted: boolean;
  avatar?: string;
  provider?: string;
  model?: string;
  voiceId?: string;
  profileId?: string | null;
  isEditorCapable?: boolean;
}

export type SeatStatus =
  | 'listening'
  | 'thinking'
  | 'waiting'
  | 'speaking'
  | 'muted'
  | 'offline';

export type TopMode =
  | 'room'
  | 'brain'
  | 'checkpoint'
  | 'speaker'
  | 'notes'
  | 'reference'
  | 'shotlist'
  | 'tasks'
  | 'prompt'
  | 'info';

export type ToolPanelState = 'collapsed' | 'expanded' | 'half' | 'full' | 'locked';

export interface TranscriptEntry {
  id: string;
  seatId: string | 'human' | 'system' | 'path';
  name: string;
  text: string;
  timestamp: number;
  isPartial?: boolean;
}

export type OrchestratorMode =
  | 'natural'
  | 'round_robin'
  | 'brainstorm'
  | 'one_speaker'
  | 'everyone_brief';

export type FloorState =
  | 'listening'
  | 'decide_speaker'
  | 'generating'
  | 'speaking'
  | 'floor_open';

export interface ExpertProfile {
  id: string;
  name: string;
  description?: string;
  prompt: string;
  tags?: string[];
  isEditorCapable?: boolean;
}

export type EditorCommand =
  | { type: 'load_media'; payload: { uri: string; name?: string } }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'seek'; payload: { time: number } }
  | { type: 'split' }
  | { type: 'trim_start' }
  | { type: 'trim_end' }
  | { type: 'move_clip'; payload: { clipId: string; toTime: number } }
  | { type: 'duplicate_clip' }
  | { type: 'delete_clip' }
  | { type: 'add_text'; payload: { text: string } }
  | { type: 'adjust_volume'; payload: { level: number } }
  | { type: 'mute_track' }
  | { type: 'add_fade'; payload: { in?: number; out?: number } }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'save_project' }
  | { type: 'export_preview' }
  | { type: 'show_frame'; payload: { time: number } }
  | { type: 'select_clip'; payload: { clipId: string } };

export interface EditorAdapter {
  execute: (cmd: EditorCommand) => Promise<{ ok: boolean; message?: string }>;
  canExecute: (cmd: EditorCommand) => boolean;
}
