import { EditorCommand } from '../../types';
import { assetLibrary } from '../assets/library';
import { persistAsset } from '../assets/storageClient';
import { renderProject } from '../factory/rendererClient';

export interface EditorMediaItem {
  id: string;
  assetId: string;
  uri: string;
  name: string;
  start: number;
  duration: number;
  volume: number;
  muted: boolean;
  fadeIn?: number;
  fadeOut?: number;
}

export interface EditorTextItem {
  id: string;
  text: string;
  time: number;
}

export interface EditorState {
  projectName: string;
  media: EditorMediaItem[];
  text: EditorTextItem[];
  selectedClipId: string | null;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  dirty: boolean;
  lastSavedAt: number | null;
  lastExportedAt: number | null;
  lastMessage: string;
}

type Listener = (state: EditorState) => void;
type HistorySnapshot = Omit<EditorState, 'lastMessage' | 'isPlaying'>;

const INITIAL_STATE: EditorState = {
  projectName: 'Untitled Studio Go Project',
  media: [],
  text: [],
  selectedClipId: null,
  currentTime: 0,
  duration: 0,
  isPlaying: false,
  dirty: false,
  lastSavedAt: null,
  lastExportedAt: null,
  lastMessage: 'Editor ready. Load media to begin.',
};

const HISTORY_LIMIT = 50;

export class EditorRuntime {
  private state: EditorState = INITIAL_STATE;
  private listeners = new Set<Listener>();
  private undoStack: HistorySnapshot[] = [];
  private redoStack: HistorySnapshot[] = [];

  getState(): EditorState {
    return this.state;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private publish(next: EditorState) {
    this.state = next;
    this.listeners.forEach((listener) => listener(next));
  }

  private update(patch: Partial<EditorState>) {
    this.publish({ ...this.state, ...patch });
  }

  private snapshot(): HistorySnapshot {
    return {
      projectName: this.state.projectName,
      media: this.state.media.map((clip) => ({ ...clip })),
      text: this.state.text.map((item) => ({ ...item })),
      selectedClipId: this.state.selectedClipId,
      currentTime: this.state.currentTime,
      duration: this.state.duration,
      dirty: this.state.dirty,
      lastSavedAt: this.state.lastSavedAt,
      lastExportedAt: this.state.lastExportedAt,
    };
  }

  private rememberEdit() {
    this.undoStack.push(this.snapshot());
    if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
    this.redoStack = [];
  }

  private restore(snapshot: HistorySnapshot, message: string) {
    this.publish({ ...snapshot, isPlaying: false, lastMessage: message });
  }

  private timelineDuration(media: EditorMediaItem[]): number {
    return media.reduce((max, clip) => Math.max(max, clip.start + clip.duration), 0);
  }

  async execute(cmd: EditorCommand): Promise<{ ok: boolean; message: string }> {
    const fail = (message: string) => {
      this.update({ lastMessage: message });
      return { ok: false, message };
    };
    const selected = this.state.media.find((clip) => clip.id === this.state.selectedClipId) || null;

    switch (cmd.type) {
      case 'load_media': {
        const name = cmd.payload.name || cmd.payload.uri.split('/').pop() || 'Media';
        const sourceAsset = assetLibrary.registerSourceUri(cmd.payload.uri, name);
        const clip: EditorMediaItem = {
          id: `clip-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          assetId: sourceAsset.id,
          uri: cmd.payload.uri,
          name,
          start: this.state.duration,
          duration: 5,
          volume: 1,
          muted: false,
        };
        this.rememberEdit();
        const media = [...this.state.media, clip];
        const duration = this.timelineDuration(media);
        const message = `Loaded ${clip.name}; source provenance recorded as URI reference only.`;
        this.update({ media, duration, selectedClipId: clip.id, dirty: true, lastMessage: message });
        return { ok: true, message };
      }
      case 'play':
        if (!this.state.media.length) return fail('Cannot play: no media is loaded.');
        this.update({ isPlaying: true, lastMessage: 'Playing timeline.' });
        return { ok: true, message: 'Playing timeline.' };
      case 'pause':
        this.update({ isPlaying: false, lastMessage: 'Timeline paused.' });
        return { ok: true, message: 'Timeline paused.' };
      case 'seek': {
        const time = Math.max(0, Math.min(cmd.payload.time, this.state.duration));
        this.update({ currentTime: time, lastMessage: `Playhead moved to ${time.toFixed(1)}s.` });
        return { ok: true, message: `Playhead moved to ${time.toFixed(1)}s.` };
      }
      case 'select_clip':
        if (!this.state.media.some((clip) => clip.id === cmd.payload.clipId)) return fail('Cannot select clip: clip was not found.');
        this.update({ selectedClipId: cmd.payload.clipId, lastMessage: 'Clip selected.' });
        return { ok: true, message: 'Clip selected.' };
      case 'move_clip': {
        const index = this.state.media.findIndex((clip) => clip.id === cmd.payload.clipId);
        if (index < 0) return fail('Cannot move clip: clip was not found.');
        this.rememberEdit();
        const media = [...this.state.media];
        media[index] = { ...media[index], start: Math.max(0, cmd.payload.toTime) };
        this.update({ media, duration: this.timelineDuration(media), dirty: true, lastMessage: 'Clip moved.' });
        return { ok: true, message: 'Clip moved.' };
      }
      case 'split': {
        if (!selected) return fail('Cannot split: select a clip first.');
        const splitAt = this.state.currentTime;
        const clipEnd = selected.start + selected.duration;
        if (splitAt <= selected.start || splitAt >= clipEnd) return fail('Cannot split: move the playhead inside the selected clip.');
        this.rememberEdit();
        const leftDuration = splitAt - selected.start;
        const rightDuration = clipEnd - splitAt;
        const right: EditorMediaItem = { ...selected, id: `clip-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, start: splitAt, duration: rightDuration };
        const media = this.state.media.flatMap((clip) => clip.id === selected.id ? [{ ...clip, duration: leftDuration }, right] : [clip]);
        const message = `Clip split at ${splitAt.toFixed(1)}s.`;
        this.update({ media, selectedClipId: right.id, duration: this.timelineDuration(media), dirty: true, lastMessage: message });
        return { ok: true, message };
      }
      case 'trim_start': {
        if (!selected) return fail('Cannot trim start: select a clip first.');
        const trimAt = this.state.currentTime;
        const clipEnd = selected.start + selected.duration;
        if (trimAt <= selected.start || trimAt >= clipEnd) return fail('Cannot trim start: move the playhead inside the selected clip.');
        this.rememberEdit();
        const media = this.state.media.map((clip) => clip.id === selected.id ? { ...clip, start: trimAt, duration: clipEnd - trimAt } : clip);
        const message = `Clip start trimmed to ${trimAt.toFixed(1)}s.`;
        this.update({ media, duration: this.timelineDuration(media), dirty: true, lastMessage: message });
        return { ok: true, message };
      }
      case 'trim_end': {
        if (!selected) return fail('Cannot trim end: select a clip first.');
        const trimAt = this.state.currentTime;
        const clipEnd = selected.start + selected.duration;
        if (trimAt <= selected.start || trimAt >= clipEnd) return fail('Cannot trim end: move the playhead inside the selected clip.');
        this.rememberEdit();
        const media = this.state.media.map((clip) => clip.id === selected.id ? { ...clip, duration: trimAt - selected.start } : clip);
        const duration = this.timelineDuration(media);
        const message = `Clip end trimmed to ${trimAt.toFixed(1)}s.`;
        this.update({ media, duration, currentTime: Math.min(this.state.currentTime, duration), dirty: true, lastMessage: message });
        return { ok: true, message };
      }
      case 'duplicate_clip': {
        if (!selected) return fail('Cannot duplicate: select a clip first.');
        this.rememberEdit();
        const copy = { ...selected, id: `clip-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, start: selected.start + selected.duration };
        const media = [...this.state.media, copy];
        this.update({ media, duration: this.timelineDuration(media), selectedClipId: copy.id, dirty: true, lastMessage: 'Clip duplicated.' });
        return { ok: true, message: 'Clip duplicated.' };
      }
      case 'delete_clip': {
        if (!selected) return fail('Cannot delete: select a clip first.');
        this.rememberEdit();
        const media = this.state.media.filter((clip) => clip.id !== selected.id);
        const duration = this.timelineDuration(media);
        this.update({ media, duration, selectedClipId: media[0]?.id || null, currentTime: Math.min(this.state.currentTime, duration), dirty: true, lastMessage: 'Clip deleted.' });
        return { ok: true, message: 'Clip deleted.' };
      }
      case 'add_text': {
        if (!cmd.payload.text.trim()) return fail('Cannot add empty text.');
        this.rememberEdit();
        const text = [...this.state.text, { id: `text-${Date.now()}`, text: cmd.payload.text.trim(), time: this.state.currentTime }];
        this.update({ text, dirty: true, lastMessage: 'Text added at playhead.' });
        return { ok: true, message: 'Text added at playhead.' };
      }
      case 'adjust_volume': {
        if (!selected) return fail('Cannot adjust volume: select a clip first.');
        const level = Math.max(0, Math.min(cmd.payload.level, 2));
        this.rememberEdit();
        const media = this.state.media.map((clip) => clip.id === selected.id ? { ...clip, volume: level } : clip);
        this.update({ media, dirty: true, lastMessage: `Clip volume set to ${Math.round(level * 100)}%.` });
        return { ok: true, message: `Clip volume set to ${Math.round(level * 100)}%.` };
      }
      case 'mute_track': {
        if (!selected) return fail('Cannot mute: select a clip first.');
        this.rememberEdit();
        const media = this.state.media.map((clip) => clip.id === selected.id ? { ...clip, muted: !clip.muted } : clip);
        this.update({ media, dirty: true, lastMessage: selected.muted ? 'Clip unmuted.' : 'Clip muted.' });
        return { ok: true, message: selected.muted ? 'Clip unmuted.' : 'Clip muted.' };
      }
      case 'add_fade': {
        if (!selected) return fail('Cannot add fade: select a clip first.');
        const fadeIn = Math.max(0, Math.min(cmd.payload.in ?? selected.fadeIn ?? 0, selected.duration));
        const fadeOut = Math.max(0, Math.min(cmd.payload.out ?? selected.fadeOut ?? 0, selected.duration));
        if (fadeIn + fadeOut > selected.duration) return fail('Cannot add fade: combined fade duration exceeds the selected clip.');
        this.rememberEdit();
        const media = this.state.media.map((clip) => clip.id === selected.id ? { ...clip, fadeIn, fadeOut } : clip);
        const message = `Clip fades set to ${fadeIn.toFixed(1)}s in / ${fadeOut.toFixed(1)}s out.`;
        this.update({ media, dirty: true, lastMessage: message });
        return { ok: true, message };
      }
      case 'save_project': {
        const timestamp = Date.now();
        const mediaAssetIds = Array.from(new Set(this.state.media.map((clip) => clip.assetId)));
        const memorySnapshot = assetLibrary.recordProjectSnapshot({ projectName: this.state.projectName, mediaAssetIds, mediaCount: this.state.media.length, textCount: this.state.text.length, duration: this.state.duration, savedAt: timestamp });
        const projectStateJson = JSON.stringify({ schemaVersion: 1, projectName: this.state.projectName, media: this.state.media, text: this.state.text, selectedClipId: this.state.selectedClipId, currentTime: this.state.currentTime, duration: this.state.duration, savedAt: timestamp });
        try {
          const confirmation = await persistAsset({ name: `${this.state.projectName} state`, kind: 'project_state', projectName: this.state.projectName, parentAssetIds: mediaAssetIds, metadata: { mediaCount: this.state.media.length, textCount: this.state.text.length, duration: this.state.duration, savedAt: timestamp, sourceMemoryAssetId: memorySnapshot.id, projectStateSchemaVersion: 1, projectStateJson } });
          assetLibrary.registerDurableAsset(confirmation.asset);
          const message = 'Project state saved durably with reconstructable timeline/text payload, storage confirmation, and provenance evidence.';
          this.update({ dirty: false, lastSavedAt: confirmation.confirmedAt, lastMessage: message });
          return { ok: true, message };
        } catch (error) {
          const reason = error instanceof Error ? error.message : 'Durable asset storage failed.';
          const message = `Project snapshot remains in memory only; durable save was not confirmed. ${reason}`;
          this.update({ dirty: true, lastMessage: message });
          return { ok: false, message };
        }
      }
      case 'export_preview': {
        if (!this.state.media.length) return fail('Cannot export preview: no media is loaded.');
        if (this.state.dirty) return fail('Cannot export preview: save the current project state durably first.');
        const projectAsset = assetLibrary.list().find((asset) => asset.kind === 'project_state' && asset.storageState === 'durable' && asset.provenance.projectName === this.state.projectName);
        if (!projectAsset) return fail('Cannot export preview: no durable project-state asset exists for the current editor project.');
        try {
          const confirmation = await renderProject({ projectAssetId: projectAsset.id, projectName: this.state.projectName, outputName: `${this.state.projectName} preview`, mimeType: 'video/mp4' });
          const renderedAsset = assetLibrary.registerDurableAsset(confirmation.asset);
          const timestamp = confirmation.confirmedAt;
          const message = `Preview rendered durably as ${renderedAsset.name}; renderer and Asset Storage evidence confirmed.`;
          this.update({ lastExportedAt: timestamp, lastMessage: message });
          return { ok: true, message };
        } catch (error) {
          const reason = error instanceof Error ? error.message : 'Renderer failed without durable output evidence.';
          return fail(`Preview export was not confirmed. ${reason}`);
        }
      }
      case 'show_frame': {
        const time = Math.max(0, Math.min(cmd.payload.time, this.state.duration));
        this.update({ currentTime: time, isPlaying: false, lastMessage: `Showing frame at ${time.toFixed(1)}s.` });
        return { ok: true, message: `Showing frame at ${time.toFixed(1)}s.` };
      }
      case 'undo': {
        const previous = this.undoStack.pop();
        if (!previous) return fail('Nothing to undo.');
        this.redoStack.push(this.snapshot());
        this.restore(previous, 'Undid the last editor change.');
        return { ok: true, message: 'Undid the last editor change.' };
      }
      case 'redo': {
        const next = this.redoStack.pop();
        if (!next) return fail('Nothing to redo.');
        this.undoStack.push(this.snapshot());
        this.restore(next, 'Redid the last editor change.');
        return { ok: true, message: 'Redid the last editor change.' };
      }
      default:
        return fail('Unsupported editor command.');
    }
  }
}

export function createEditorRuntime() {
  return new EditorRuntime();
}
