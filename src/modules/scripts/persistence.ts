import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { ScriptStorage } from './project.ts';

function projectFile() { return new File(Paths.document, 'moonshadow-script-project.json'); }

export const scriptStorage: ScriptStorage = {
  async read() {
    const file = projectFile();
    return file.exists ? file.text() : null;
  },
  async write(value) { projectFile().write(value); },
};

export async function exportTextFile(filename: string, text: string): Promise<void> {
  const file = new File(Paths.document, filename);
  file.write(text);
  if (await file.text() !== text) throw new Error('Export readback did not match the saved script.');
  if (!await Sharing.isAvailableAsync()) throw new Error('File saved in app documents; sharing is unavailable on this device.');
  await Sharing.shareAsync(file.uri, { mimeType: 'text/plain', dialogTitle: 'Save Moonshadow script' });
}
