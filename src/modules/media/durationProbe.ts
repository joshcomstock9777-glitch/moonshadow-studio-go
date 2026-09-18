export interface MediaDurationProbeResult {
  durationKnown: boolean;
  durationSeconds: number | null;
  method: 'wav-bytes' | 'media-metadata' | 'unknown';
}

function readAscii(view: DataView, offset: number, length: number): string {
  let value = '';
  for (let i = 0; i < length; i += 1) value += String.fromCharCode(view.getUint8(offset + i));
  return value;
}

function probeWav(buffer: ArrayBuffer): number | null {
  if (buffer.byteLength < 44) return null;
  const view = new DataView(buffer);
  if (readAscii(view, 0, 4) !== 'RIFF' || readAscii(view, 8, 4) !== 'WAVE') return null;

  let offset = 12;
  let byteRate: number | null = null;
  let dataBytes: number | null = null;
  while (offset + 8 <= view.byteLength) {
    const id = readAscii(view, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (body + size > view.byteLength) return null;
    if (id === 'fmt ' && size >= 16) byteRate = view.getUint32(body + 8, true);
    if (id === 'data') dataBytes = size;
    offset = body + size + (size % 2);
  }
  if (!byteRate || !dataBytes) return null;
  const duration = dataBytes / byteRate;
  return Number.isFinite(duration) && duration > 0 ? duration : null;
}

async function probeBytes(uri: string): Promise<MediaDurationProbeResult | null> {
  try {
    const response = await fetch(uri);
    if (!response.ok) return null;
    const buffer = await response.arrayBuffer();
    const wav = probeWav(buffer);
    if (wav !== null) return { durationKnown: true, durationSeconds: wav, method: 'wav-bytes' };
  } catch {
    // Fall through to runtime metadata probing.
  }
  return null;
}

function probeBrowserMetadata(uri: string): Promise<MediaDurationProbeResult> {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    return Promise.resolve({ durationKnown: false, durationSeconds: null, method: 'unknown' });
  }
  return new Promise((resolve) => {
    const media = document.createElement('video');
    let settled = false;
    const finish = (duration: number | null) => {
      if (settled) return;
      settled = true;
      media.removeAttribute('src');
      media.load();
      resolve(duration !== null
        ? { durationKnown: true, durationSeconds: duration, method: 'media-metadata' }
        : { durationKnown: false, durationSeconds: null, method: 'unknown' });
    };
    const timer = setTimeout(() => finish(null), 8000);
    media.preload = 'metadata';
    media.onloadedmetadata = () => {
      clearTimeout(timer);
      const duration = media.duration;
      finish(Number.isFinite(duration) && duration > 0 ? duration : null);
    };
    media.onerror = () => {
      clearTimeout(timer);
      finish(null);
    };
    media.src = uri;
  });
}

export async function probeMediaDuration(uri: string): Promise<MediaDurationProbeResult> {
  const bytes = await probeBytes(uri);
  if (bytes) return bytes;
  return probeBrowserMetadata(uri);
}
