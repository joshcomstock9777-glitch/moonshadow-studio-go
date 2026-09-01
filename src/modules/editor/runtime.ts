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

export class EditorRuntime {
  private state: EditorState = INITIAL_STATE;
  private listeners = new Set<Listener>();

  getState(): EditorState {
    return this.state;
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
        const media = [...this.state.media, clip];
        const duration = Math.max(this.state.duration, clip.start + clip.duration);
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
        const media = [...this.state.media];
        media[index] = { ...media[index], start: Math.max(0, cmd.payload.toTime) };
        const duration = media.reduce((max, clip) => Math.max(max, clip.start + clip.duration), 0);
        this.update({ media, duration, dirty: true, lastMessage: 'Clip moved.' });
        return { ok: true, message: 'Clip moved.' };
      }
      case 'duplicate_clip': {
        if (!selected) return fail('Cannot duplicate: select a clip first.');
        const copy = { ...selected, id: `clip-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, start: selected.start + selected.duration };
        const media = [...this.state.media, copy];
        const duration = media.reduce((max, clip) => Math.max(max, clip.start + clip.duration), 0);
        this.update({ media, duration, selectedClipId: copy.id, dirty: true, lastMessage: 'Clip duplicated.' });
        return { ok: true, message: 'Clip duplicated.' };
      }
      case 'delete_clip': {
        if (!selected) return fail('Cannot delete: select a clip first.');
        const media = this.state.media.filter((clip) => clip.id !== selected.id);
        const duration = media.reduce((max, clip) => Math.max(max, clip.start + clip.duration), 0);
        this.update({ media, duration, selectedClipId: media[0]?.id || null, currentTime: Math.min(this.state.currentTime, duration), dirty: true, lastMessage: 'Clip deleted.' });
        return { ok: true, message: 'Clip deleted.' };
      }
      case 'add_text': {
        if (!cmd.payload.text.trim()) return fail('Cannot add empty text.');
        const text = [...this.state.text, { id: `text-${Date.now()}`, text: cmd.payload.text.trim(), time: this.state.currentTime }];
        this.update({ text, dirty: true, lastMessage: 'Text added at playhead.' });
        return { ok: true, message: 'Text added at playhead.' };
      }
      case 'adjust_volume': {
        if (!selected) return fail('Cannot adjust volume: select a clip first.');
        const level = Math.max(0, Math.min(cmd.payload.level, 2));
        const media = this.state.media.map((clip) => clip.id === selected.id ? { ...clip, volume: level } : clip);
        this.update({ media, dirty: true, lastMessage: `Clip volume set to ${Math.round(level * 100)}%.` });
        return { ok: true, message: `Clip volume set to ${Math.round(level * 100)}%.` };
      }
      case 'mute_track': {
        if (!selected) return fail('Cannot mute: select a clip first.');
        const media = this.state.media.map((clip) => clip.id === selected.id ? { ...clip, muted: !clip.muted } : clip);
        this.update({ media, dirty: true, lastMessage: selected.muted ? 'Clip unmuted.' : 'Clip muted.' });
        return { ok: true, message: selected.muted ? 'Clip unmuted.' : 'Clip muted.' };
      }
      case 'save_project': {
        const timestamp = Date.now();
        const mediaAssetIds = Array.from(new Set(this.state.media.map((clip) => clip.assetId)));
        const memorySnapshot = assetLibrary.recordProjectSnapshot({
          projectName: this.state.projectName,
          mediaAssetIds,
          mediaCount: this.state.media.length,
          textCount: this.state.text.length,
          duration: this.state.duration,
          savedAt: timestamp,
        });

        try {
          const confirmation = await persistAsset({
            name: `${this.state.projectName} state`,
            kind: 'project_state',
            projectName: this.state.projectName,
            parentAssetIds: mediaAssetIds,
            metadata: {
              mediaCount: this.state.media.length,
              textCount: this.state.text.length,
              duration: this.state.duration,
              savedAt: timestamp,
              sourceMemoryAssetId: memorySnapshot.id,
            },
          });
          assetLibrary.registerDurableAsset(confirmation.asset);
          const message = 'Project state saved durably with storage confirmation and provenance evidence.';
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

        const projectAsset = assetLibrary.list().find((asset) =>
          asset.kind === 'project_state'
          && asset.storageState === 'durable'
          && asset.provenance.projectName === this.state.projectName,
        );

        if (!projectAsset) {
          return fail('Cannot export preview: no durable project-state asset exists for the current editor project.');
        }

        try {
          const confirmation = await renderProject({
            projectAssetId: projectAsset.id,
            projectName: this.state.projectName,
            outputName: `${this.state.projectName} preview`,
            mimeType: 'video/mp4',
          });
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
      case 'split':
      case 'trim_start':
      case 'trim_end':
      case 'add_fade':
      case 'undo':
      case 'redo':
        return fail(`${cmd.type} is not connected to the production renderer yet.`);
      default:
        return fail('Unsupported editor command.');
    }
  }
}

export function createEditorRuntime() {
  return new EditorRuntime();
}
