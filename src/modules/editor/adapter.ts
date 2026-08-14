// Editor Control Adapter
// The only way AI seats talk to the editor.
// Real implementation will talk to the existing editor core.

import { EditorCommand, EditorAdapter } from '../../types';

export function createEditorAdapter(): EditorAdapter {
  return {
    canExecute(cmd: EditorCommand): boolean {
      // For now allow everything. Later: permissions, suggest-only mode, etc.
      return true;
    },

    async execute(cmd: EditorCommand): Promise<{ ok: boolean; message?: string }> {
      // Stub — logs the command. Real version will call into the mounted editor.
      console.log('[EditorAdapter]', cmd.type, 'payload' in cmd ? cmd.payload : '');
      return {
        ok: true,
        message: `Executed: ${cmd.type}`,
      };
    },
  };
}
