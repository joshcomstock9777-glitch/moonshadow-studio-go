import { EditorCommand, EditorAdapter } from '../../types';
import { EditorRuntime } from './runtime';

export function createEditorAdapter(runtime: EditorRuntime): EditorAdapter {
  return {
    canExecute(cmd: EditorCommand): boolean {
      const state = runtime.getState();
      if (cmd.type === 'play' || cmd.type === 'export_preview') return state.media.length > 0;
      if (cmd.type === 'undo') return runtime.canUndo();
      if (cmd.type === 'redo') return runtime.canRedo();
      if (['split', 'trim_start', 'trim_end', 'duplicate_clip', 'delete_clip', 'adjust_volume', 'mute_track', 'add_fade'].includes(cmd.type)) {
        return Boolean(state.selectedClipId);
      }
      return true;
    },

    async execute(cmd: EditorCommand): Promise<{ ok: boolean; message?: string }> {
      if (!this.canExecute(cmd)) {
        return { ok: false, message: `Editor command ${cmd.type} is not available in the current state.` };
      }
      return runtime.execute(cmd);
    },
  };
}
