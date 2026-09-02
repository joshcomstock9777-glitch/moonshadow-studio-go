import assert from 'node:assert/strict';
import test from 'node:test';

process.env.EXPO_PUBLIC_RENDERER_API_URL = 'https://renderer.example.test';
const { getRendererHealth } = await import('../src/modules/factory/rendererClient.ts');

test('renderer health fails closed when connectivity lacks render proof', async () => {
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ connected: true, backend: 'test-renderer' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  const health = await getRendererHealth();
  assert.equal(health.state, 'disconnected');
  assert.equal(health.verificationId, undefined);
});

test('renderer health requires non-empty verification evidence', async () => {
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({ connected: true, renderVerified: true, verificationId: '   ' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );

  const health = await getRendererHealth();
  assert.equal(health.state, 'disconnected');
});

test('renderer health becomes connected only with verified render evidence', async () => {
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        connected: true,
        renderVerified: true,
        verificationId: 'render-proof-123',
        backend: 'test-renderer',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );

  const health = await getRendererHealth();
  assert.equal(health.state, 'connected');
  assert.equal(health.verificationId, 'render-proof-123');
  assert.equal(health.backend, 'test-renderer');
});
