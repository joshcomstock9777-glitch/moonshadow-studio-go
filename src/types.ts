/**
 * Studio Go type definitions
 * 
 * Shared types for components, hooks, and services
 */

export interface Seat {
  id: string;
  name: string;
  color: string;
  status: 'listening' | 'thinking' | 'speaking' | 'offline';
  enabled: boolean;
  muted: boolean;
  isEditorCapable: boolean;
}

export type TopMode = 'room' | 'brain' | 'checkpoint';

export type ToolPanelState = 'collapsed' | 'expanded';

export interface TranscriptEntry {
  id: string;
  seatId: string | 'human' | 'system' | 'path';
  name: string;
  text: string;
  timestamp: number;
}
