import test from 'node:test';
import assert from 'node:assert/strict';
import {
  executeHeadquartersEditorRequest,
  getHeadquartersEditorManifest,
  validateHeadquartersEditorRequest,
} from '../src/modules/editor/headquartersContract.ts';

function adapter({ fail = false } = {}) {
  return {
    canExecute: () => true,
    execute: async (command) => fail
      ? { ok: false, message: `failed ${command.type}` }
      : { ok: true, message: `ran ${command.type}` },
  };
}

test('manifest exposes Studio Go editor contract and destructive boundary', () => {
  const manifest = getHeadquartersEditorManifest();
  assert.equal(manifest.contract, 'moonshadow.editor');
  assert.equal(manifest.version, '1.0');
  assert.equal(manifest.surface, 'studio-go');
  assert.ok(manifest.capabilities.includes('export_preview'));
  assert.deepEqual(manifest.destructiveCommands, ['delete_clip']);
});

test('rejects unsupported contract versions before editor execution', () => {
  const result = validateHeadquartersEditorRequest({
    contract: 'moonshadow.editor',
    version: '2.0',
    requestId: 'hq-1',
    instruction: 'Add title',
    mode: 'execute',
    commands: [{ type: 'add_text', payload: { text: 'Moonshadow' } }],
  });
  assert.equal(result.ok, false);
  assert.equal(result.response.error?.code, 'UNSUPPORTED_VERSION');
});

test('suggest mode returns evidence without mutating editor', async () => {
  let executions = 0;
  const fakeAdapter = {
    canExecute: () => true,
    execute: async () => {
      executions += 1;
      return { ok: true };
    },
  };
  const response = await executeHeadquartersEditorRequest(fakeAdapter, {
    contract: 'moonshadow.editor',
    version: '1.0',
    requestId: 'hq-suggest',
    instruction: 'Add title',
    mode: 'suggest',
    commands: [{ type: 'add_text', payload: { text: 'Moonshadow' } }],
  });
  assert.equal(response.ok, true);
  assert.equal(response.result?.executed, false);
  assert.equal(executions, 0);
});

test('destructive execution fails closed without creator approval', async () => {
  let executions = 0;
  const fakeAdapter = {
    canExecute: () => true,
    execute: async () => {
      executions += 1;
      return { ok: true };
    },
  };
  const response = await executeHeadquartersEditorRequest(fakeAdapter, {
    contract: 'moonshadow.editor',
    version: '1.0',
    requestId: 'hq-delete',
    instruction: 'Delete selected clip',
    mode: 'execute',
    commands: [{ type: 'delete_clip' }],
  });
  assert.equal(response.ok, false);
  assert.equal(response.error?.code, 'EXECUTION_FAILED');
  assert.equal(response.result?.executed, false);
  assert.equal(executions, 0);
});

test('execution result stays failed when adapter reports a command failure', async () => {
  const response = await executeHeadquartersEditorRequest(adapter({ fail: true }), {
    contract: 'moonshadow.editor',
    version: '1.0',
    requestId: 'hq-fail',
    instruction: 'Add title',
    mode: 'execute',
    commands: [{ type: 'add_text', payload: { text: 'Moonshadow' } }],
  });
  assert.equal(response.ok, false);
  assert.equal(response.error?.code, 'EXECUTION_FAILED');
  assert.match(response.error?.message ?? '', /failed add_text/);
});
