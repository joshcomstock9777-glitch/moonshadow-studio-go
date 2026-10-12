import type { ScriptStorage } from './project.ts';

const KEY = 'moonshadow.script-project.v1';
export const scriptStorage: ScriptStorage = {
  async read() { return localStorage.getItem(KEY); },
  async write(value) { localStorage.setItem(KEY, value); },
};

export async function exportTextFile(filename: string, text: string): Promise<void> {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Let the browser consume the file URL before releasing it.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
