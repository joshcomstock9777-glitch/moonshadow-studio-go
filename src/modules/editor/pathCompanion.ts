import { EditorCommand } from '../../types';
import { EditorState } from './runtime';
import { CompanionMode } from './companion';

export interface CreatorEditorDirective {
  instruction: string;
  mode: CompanionMode;
  destructiveApproved: boolean;
}

export interface PathEditorEnvelope {
  commands: EditorCommand[];
  rationale?: string;
}

const OPEN = '```studio-go-editor';
const CLOSE = '```';

export function parseCreatorEditorDirective(text: string): CreatorEditorDirective | null {
  const trimmed = text.trim();
  const execute = trimmed.startsWith('/edit!');
  const suggest = trimmed.startsWith('/edit ' ) || trimmed === '/edit';
  if (!execute && !suggest) return null;

  let instruction = trimmed.slice(execute ? '/edit!'.length : '/edit'.length).trim();
  const destructiveApproved = execute && /(^|\s)approve-delete(\s|$)/i.test(instruction);
  instruction = instruction.replace(/(^|\s)approve-delete(\s|$)/i, ' ').replace(/\s+/g, ' ').trim();

  return {
    instruction,
    mode: execute ? 'execute' : 'suggest',
    destructiveApproved,
  };
}

export function buildPathEditorPrompt(directive: CreatorEditorDirective, state: EditorState): string {
  const editorState = {
    projectName: state.projectName,
    currentTime: state.currentTime,
    duration: state.duration,
    dirty: state.dirty,
    selectedClipId: state.selectedClipId,
    media: state.media.map((clip) => ({
      id: clip.id,
      assetId: clip.assetId,
      name: clip.name,
      start: clip.start,
      duration: clip.duration,
      volume: clip.volume,
      muted: clip.muted,
      fadeIn: clip.fadeIn ?? 0,
      fadeOut: clip.fadeOut ?? 0,
    })),
    text: state.text.map((item) => ({ id: item.id, text: item.text, time: item.time })),
  };

  return [
    'EDITOR COMPANION REQUEST',
    `Creator instruction: ${directive.instruction || '(empty)'}`,
    `Requested mode: ${directive.mode}. Studio Go decides whether execution is permitted; do not claim an edit happened yourself.`,
    'Current editor state:',
    JSON.stringify(editorState),
    'Return exactly one fenced studio-go-editor JSON envelope and no simulated completion claim.',
    `${OPEN}`,
    '{"commands":[{"type":"..."}],"rationale":"brief reason"}',
    CLOSE,
    'Allowed command types: load_media, play, pause, seek, split, trim_start, trim_end, move_clip, duplicate_clip, delete_clip, add_text, adjust_volume, mute_track, add_fade, undo, redo, save_project, export_preview, show_frame, select_clip.',
    'Use only fields required by the command contract. Never include credentials, secrets, or invented asset IDs/clip IDs.',
  ].join('\n');
}

export function parsePathEditorEnvelope(text: string): PathEditorEnvelope | null {
  const start = text.indexOf(OPEN);
  if (start < 0) return null;
  const jsonStart = start + OPEN.length;
  const end = text.indexOf(CLOSE, jsonStart);
  if (end < 0) return null;

  const raw = text.slice(jsonStart, end).trim();
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as { commands?: unknown; rationale?: unknown };
    if (!Array.isArray(parsed.commands)) return null;
    const commands = parsed.commands.map(validateCommand);
    if (commands.some((command) => command === null)) return null;
    return {
      commands: commands as EditorCommand[],
      rationale: typeof parsed.rationale === 'string' ? parsed.rationale : undefined,
    };
  } catch {
    return null;
  }
}

function validateCommand(value: unknown): EditorCommand | null {
  if (!isRecord(value) || typeof value.type !== 'string') return null;
  const payload = isRecord(value.payload) ? value.payload : null;

  switch (value.type) {
    case 'play':
    case 'pause':
    case 'split':
    case 'trim_start':
    case 'trim_end':
    case 'duplicate_clip':
    case 'delete_clip':
    case 'mute_track':
    case 'undo':
    case 'redo':
    case 'save_project':
    case 'export_preview':
      return { type: value.type } as EditorCommand;
    case 'load_media':
      return payload && typeof payload.uri === 'string' && (!('name' in payload) || typeof payload.name === 'string')
        ? { type: 'load_media', payload: { uri: payload.uri, ...(typeof payload.name === 'string' ? { name: payload.name } : {}) } }
        : null;
    case 'seek':
    case 'show_frame':
      return payload && finite(payload.time)
        ? { type: value.type, payload: { time: payload.time as number } } as EditorCommand
        : null;
    case 'move_clip':
      return payload && typeof payload.clipId === 'string' && finite(payload.toTime)
        ? { type: 'move_clip', payload: { clipId: payload.clipId, toTime: payload.toTime as number } }
        : null;
    case 'select_clip':
      return payload && typeof payload.clipId === 'string'
        ? { type: 'select_clip', payload: { clipId: payload.clipId } }
        : null;
    case 'add_text':
      return payload && typeof payload.text === 'string'
        ? { type: 'add_text', payload: { text: payload.text } }
        : null;
    case 'adjust_volume':
      return payload && finite(payload.level)
        ? { type: 'adjust_volume', payload: { level: payload.level as number } }
        : null;
    case 'add_fade': {
      if (!payload) return null;
      const hasIn = 'in' in payload;
      const hasOut = 'out' in payload;
      if (!hasIn && !hasOut) return null;
      if (hasIn && !finite(payload.in)) return null;
      if (hasOut && !finite(payload.out)) return null;
      return {
        type: 'add_fade',
        payload: {
          ...(hasIn ? { in: payload.in as number } : {}),
          ...(hasOut ? { out: payload.out as number } : {}),
        },
      };
    }
    default:
      return null;
  }
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
