export type WebMicRecorderState = 'idle' | 'recording' | 'stopped';

export interface RecordedMicClip {
  uri: string;
  mimeType: string;
  size: number;
  recordedAt: number;
}

interface BrowserMediaRecorder {
  start(): void;
  stop(): void;
  state: string;
  ondataavailable: ((event: { data?: { size?: number } }) => void) | null;
  onstop: (() => void) | null;
  onerror: ((event: unknown) => void) | null;
}

interface BrowserMediaStream {
  getTracks(): Array<{ stop(): void }>;
}

interface BrowserBlob {
  size: number;
  type: string;
}

type RecorderConstructor = new (stream: unknown, options?: { mimeType?: string }) => BrowserMediaRecorder;

const getBrowserGlobals = () => {
  const root = globalThis as unknown as {
    navigator?: {
      mediaDevices?: {
        getUserMedia?: (constraints: { audio: boolean; video: boolean }) => Promise<BrowserMediaStream>;
      };
    };
    MediaRecorder?: RecorderConstructor;
    Blob?: new (parts?: unknown[], options?: { type?: string }) => BrowserBlob;
    URL?: { createObjectURL?: (blob: BrowserBlob) => string; revokeObjectURL?: (url: string) => void };
  };
  return root;
};

export function isWebMicCaptureSupported(): boolean {
  const root = getBrowserGlobals();
  return Boolean(
    root.navigator?.mediaDevices?.getUserMedia &&
      root.MediaRecorder &&
      root.Blob &&
      root.URL?.createObjectURL,
  );
}

export class WebMicRecorder {
  private recorder: BrowserMediaRecorder | null = null;
  private stream: BrowserMediaStream | null = null;
  private chunks: unknown[] = [];
  private objectUrl: string | null = null;
  private status: WebMicRecorderState = 'idle';

  getState(): WebMicRecorderState {
    return this.status;
  }

  async start(): Promise<void> {
    if (this.status === 'recording') throw new Error('Microphone recording is already active.');
    const root = getBrowserGlobals();
    const getUserMedia = root.navigator?.mediaDevices?.getUserMedia;
    const Recorder = root.MediaRecorder;
    if (!getUserMedia || !Recorder || !root.Blob || !root.URL?.createObjectURL) {
      throw new Error('Microphone capture is unavailable on this runtime. Use Studio Go web in a browser with microphone permission, or import an existing recording.');
    }

    this.releaseObjectUrl();
    this.chunks = [];
    this.stream = await getUserMedia.call(root.navigator?.mediaDevices, { audio: true, video: false });
    this.recorder = new Recorder(this.stream);
    this.recorder.ondataavailable = (event) => {
      if (event.data && (event.data.size ?? 0) > 0) this.chunks.push(event.data);
    };
    this.recorder.onerror = () => {
      this.stopTracks();
      this.status = 'idle';
    };
    this.recorder.start();
    this.status = 'recording';
  }

  async stop(): Promise<RecordedMicClip> {
    const recorder = this.recorder;
    const root = getBrowserGlobals();
    if (!recorder || this.status !== 'recording' || !root.Blob || !root.URL?.createObjectURL) {
      throw new Error('No microphone recording is active.');
    }

    return new Promise<RecordedMicClip>((resolve, reject) => {
      recorder.onerror = () => {
        this.stopTracks();
        this.status = 'idle';
        reject(new Error('Microphone recording failed before a clip was produced.'));
      };
      recorder.onstop = () => {
        try {
          const blob = new root.Blob!(this.chunks, { type: 'audio/webm' });
          if (!blob.size) throw new Error('The microphone recording contained no audio data.');
          const uri = root.URL!.createObjectURL!(blob);
          this.objectUrl = uri;
          this.status = 'stopped';
          resolve({ uri, mimeType: blob.type || 'audio/webm', size: blob.size, recordedAt: Date.now() });
        } catch (error) {
          this.status = 'idle';
          reject(error instanceof Error ? error : new Error('Unable to finalize microphone recording.'));
        } finally {
          this.stopTracks();
          this.recorder = null;
          this.stream = null;
          this.chunks = [];
        }
      };
      recorder.stop();
    });
  }

  cancel(): void {
    if (this.recorder?.state === 'recording') {
      try { this.recorder.stop(); } catch {}
    }
    this.stopTracks();
    this.recorder = null;
    this.stream = null;
    this.chunks = [];
    this.status = 'idle';
  }

  dispose(): void {
    this.cancel();
    this.releaseObjectUrl();
  }

  private stopTracks(): void {
    this.stream?.getTracks().forEach((track) => {
      try { track.stop(); } catch {}
    });
  }

  private releaseObjectUrl(): void {
    if (!this.objectUrl) return;
    const root = getBrowserGlobals();
    try { root.URL?.revokeObjectURL?.(this.objectUrl); } catch {}
    this.objectUrl = null;
  }
}
