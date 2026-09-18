import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditorRuntime } from '../src/modules/editor/runtime.ts';

function oneSecondWavDataUri() {
  const sampleRate = 8000;
  const dataSize = sampleRate;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate, 28);
  buffer.writeUInt16LE(1, 32);
  buffer.writeUInt16LE(8, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  buffer.fill(128, 44);
  return `data:audio/wav;base64,${buffer.toString('base64')}`;
}

test('load_media probes real WAV bytes and records the measured duration', async () => {
  const runtime = createEditorRuntime();
  const result = await runtime.execute({ type: 'load_media', payload: { uri: oneSecondWavDataUri(), name: 'real-one-second.wav' } });
  assert.equal(result.ok, true);
  const clip = runtime.getState().media[0];
  assert.equal(clip.durationKnown, true);
  assert.equal(clip.duration, 1);
  assert.match(runtime.getState().lastMessage, /probed from media/);
});

test('unprobeable media stays UNKNOWN and export remains blocked', async () => {
  const runtime = createEditorRuntime();
  const bad = 'data:application/octet-stream;base64,bm90LW1lZGlh';
  const result = await runtime.execute({ type: 'load_media', payload: { uri: bad, name: 'not-media.bin', durationSeconds: 999 } });
  assert.equal(result.ok, true);
  const clip = runtime.getState().media[0];
  assert.equal(clip.durationKnown, false);
  assert.equal(clip.duration, 0);
  assert.match(runtime.getState().lastMessage, /duration UNKNOWN/);
  const exported = await runtime.execute({ type: 'export_preview' });
  assert.equal(exported.ok, false);
  assert.match(exported.message, /unprobed duration/);
});
