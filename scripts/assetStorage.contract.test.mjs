import assert from 'node:assert/strict';
import test from 'node:test';

process.env.EXPO_PUBLIC_ASSET_STORAGE_API_URL = 'https://storage.example.test';
const { persistAsset } = await import('../src/modules/assets/storageClient.ts');

function responseAsset(overrides = {}) {
  return {
    id: 'asset-1',
    name: 'Moonshadow project state',
    kind: 'project_state',
    storageState: 'durable',
    provenance: {
      source: 'editor_project',
      projectName: 'Moonshadow',
      createdAt: Date.now(),
      parentAssetIds: ['source-1', 'source-2'],
    },
    metadata: {
      schemaVersion: 1,
    },
    ...overrides,
  };
}

function storageResponse(asset) {
  return new Response(JSON.stringify({
    durable: true,
    externalStorageId: 'storage-123',
    confirmedAt: Date.now(),
    asset,
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

const input = {
  name: 'Moonshadow project state',
  kind: 'project_state',
  projectName: 'Moonshadow',
  parentAssetIds: ['source-1', 'source-2'],
  metadata: { schemaVersion: 1 },
};

test('accepts durable asset evidence only when it is bound to the persistence request', async () => {
  globalThis.fetch = async () => storageResponse(responseAsset());
  const confirmation = await persistAsset(input);
  assert.equal(confirmation.asset.id, 'asset-1');
  assert.equal(confirmation.externalStorageId, 'storage-123');
});

test('rejects durable confirmation for a different project', async () => {
  globalThis.fetch = async () => storageResponse(responseAsset({
    provenance: {
      source: 'editor_project',
      projectName: 'Different Project',
      createdAt: Date.now(),
      parentAssetIds: ['source-1', 'source-2'],
    },
  }));

  await assert.rejects(() => persistAsset(input), /different project/);
});

test('rejects durable confirmation with different parent provenance', async () => {
  globalThis.fetch = async () => storageResponse(responseAsset({
    provenance: {
      source: 'editor_project',
      projectName: 'Moonshadow',
      createdAt: Date.now(),
      parentAssetIds: ['source-other'],
    },
  }));

  await assert.rejects(() => persistAsset(input), /mismatched parent assets/);
});

test('rejects durable confirmation for a different asset name', async () => {
  globalThis.fetch = async () => storageResponse(responseAsset({ name: 'Unrelated project state' }));
  await assert.rejects(() => persistAsset(input), /requested name/);
});
