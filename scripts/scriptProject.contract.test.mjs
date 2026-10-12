import assert from 'node:assert/strict';
import test from 'node:test';
import { acceptScriptRevision, completeScriptJob, currentVersion, exportScriptText, parseScriptProject,
  replaceSelectedText, revisionPrompt, saveScriptProject } from '../src/modules/scripts/project.ts';

const original = 'OPENING\nShe gets mean when she is hungry.\nKEEP THE ENDING';
const base = { schema: 1, id: 'script-1', brief: 'Horror scene', versions: [{ id: 'v1', text: original, createdAt: 1, change: 'Original' }] };
const job = { kind: 'revise', baseVersionId: 'v1', selectedText: 'She gets mean when she is hungry.', instruction: 'Make this ominous.', sessionId: 'run-2', correlationId: 'corr-2' };
const result = { ok: true, sessionId: 'run-2', correlationId: 'corr-2', status: 'final', transcript: [{ identity: 'allie', kind: 'final', body: 'She knows when you are afraid.' }] };

test('writer reply becomes a candidate; only explicit acceptance changes the selected passage', () => {
  const candidate = completeScriptJob({ ...base, job }, result);
  assert.equal(currentVersion(candidate).text, original);
  const revised = acceptScriptRevision(candidate, candidate.candidate.text);
  assert.equal(revised.versions[0].text, original);
  assert.equal(currentVersion(revised).text, 'OPENING\nShe knows when you are afraid.\nKEEP THE ENDING');
  assert.equal(revised.versions.length, 2);
  assert.equal(base.versions.length, 1);
});

test('wrong-session and stale-version replies cannot alter a script', () => {
  assert.throws(() => completeScriptJob({ ...base, job }, { ...result, correlationId: 'wrong' }), /does not match/);
  assert.throws(() => completeScriptJob({ ...base, job: { ...job, baseVersionId: 'old' } }, result), /changed/);
  assert.throws(() => acceptScriptRevision({ ...base, candidate: { text: 'replacement', job: { ...job, baseVersionId: 'old' } } }, 'replacement'), /no longer matches/);
});

test('missing final reply, failed job and ambiguous selections fail closed', () => {
  assert.throws(() => completeScriptJob({ ...base, job }, { ...result, transcript: [] }), /without a final/);
  assert.throws(() => completeScriptJob({ ...base, job }, { ...result, status: 'error', error: 'model unavailable' }), /model unavailable/);
  assert.throws(() => replaceSelectedText('same same', 'same', 'new'), /exactly once/);
  assert.throws(() => replaceSelectedText(original, 'missing', 'new'), /exactly once/);
  assert.throws(() => revisionPrompt(original, job.selectedText, ''), /Describe the change/);
});

test('save, reopen and export retain original, revision and line breaks', async () => {
  let disk = null;
  const storage = { async read() { return disk; }, async write(value) { disk = value; } };
  const candidate = completeScriptJob({ ...base, job }, result);
  const revised = acceptScriptRevision(candidate, candidate.candidate.text);
  await saveScriptProject(storage, revised);
  const reopened = parseScriptProject(await storage.read());
  assert.deepEqual(reopened, revised);
  assert.equal(reopened.versions[0].text, original);
  assert.ok(exportScriptText(reopened, currentVersion(reopened)).includes('OPENING\nShe knows when you are afraid.\nKEEP THE ENDING'));
  assert.throws(() => exportScriptText(reopened, { ...currentVersion(reopened), text: 'unsaved' }), /saved script/);
});

test('corrupt storage and unconfirmed writes do not report save success', async () => {
  assert.throws(() => parseScriptProject('{bad json'));
  assert.throws(() => parseScriptProject(JSON.stringify({ ...base, versions: [{}] })), /unreadable/);
  await assert.rejects(saveScriptProject({ async read() { return 'wrong'; }, async write() {} }, base), /could not be verified/);
});

test('a saved pending job can be recovered without starting a new request', () => {
  const reopened = parseScriptProject(JSON.stringify({ ...base, job }));
  assert.equal(reopened.job.sessionId, 'run-2');
  assert.equal(completeScriptJob(reopened, { ...result, status: 'open' }), reopened);
  assert.equal(completeScriptJob(reopened, result).candidate.text, result.transcript[0].body);
});
