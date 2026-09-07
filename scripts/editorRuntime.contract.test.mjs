import assert from 'node:assert/strict';
import test from 'node:test';

const { createEditorRuntime } = await import('../src/modules/editor/runtime.ts');

test('play fails closed when the real media engine is not connected', async () => {
  const runtime = createEditorRuntime();
  await runtime.execute({
    type: 'load_media',
    payload: { uri: 'file:///source.mp4', name: 'Source', durationSeconds: 8 },
  });

  const result = await runtime.execute({ type: 'play' });

  assert.equal(result.ok, false);
  assert.match(result.message, /decoder\/playback engine is not connected/);
  assert.equal(runtime.getState().isPlaying, false);
});

test('show_frame fails closed when the real preview engine is not connected', async () => {
  const runtime = createEditorRuntime();
  await runtime.execute({
    type: 'load_media',
    payload: { uri: 'file:///source.mp4', name: 'Source', durationSeconds: 8 },
  });

  const result = await runtime.execute({ type: 'show_frame', payload: { time: 4 } });

  assert.equal(result.ok, false);
  assert.match(result.message, /decoder\/preview engine is not connected/);
});
