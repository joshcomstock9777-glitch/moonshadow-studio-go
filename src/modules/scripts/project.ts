import type { PathResult } from '../../services/pathClient.ts';

export interface ScriptVersion {
  id: string;
  text: string;
  createdAt: number;
  change: string;
  sessionId?: string;
  correlationId?: string;
}

export interface ScriptJob {
  kind: 'generate' | 'revise';
  baseVersionId?: string;
  selectedText?: string;
  instruction?: string;
  sessionId: string;
  correlationId: string;
}

export interface ScriptProject {
  schema: 1;
  id: string;
  brief: string;
  versions: ScriptVersion[];
  // Persist before dispatch. An interrupted submit must never be retried automatically.
  submitting?: boolean;
  job?: ScriptJob;
  candidate?: { text: string; job: ScriptJob };
}

export const newScriptProject = (): ScriptProject => ({
  schema: 1, id: `script-${Date.now()}`, brief: '', versions: [],
});

export function currentVersion(project: ScriptProject): ScriptVersion | undefined {
  return project.versions.at(-1);
}

export function parseScriptProject(raw: string): ScriptProject {
  const value = JSON.parse(raw) as ScriptProject;
  if (value?.schema !== 1 || typeof value.id !== 'string' || typeof value.brief !== 'string' || !Array.isArray(value.versions)
    || value.versions.some(v => !v || typeof v.id !== 'string' || typeof v.text !== 'string' || !v.text.trim()
      || typeof v.createdAt !== 'number' || typeof v.change !== 'string')) {
    throw new Error('Saved script is unreadable. It has not been overwritten.');
  }
  if (value.job && (!['generate', 'revise'].includes(value.job.kind) || !value.job.sessionId || !value.job.correlationId)) {
    throw new Error('Saved script job is unreadable. It has not been overwritten.');
  }
  if (value.candidate && (typeof value.candidate.text !== 'string' || !value.candidate.job
    || value.candidate.job.kind !== 'revise' || typeof value.candidate.job.selectedText !== 'string'
    || typeof value.candidate.job.baseVersionId !== 'string' || !value.candidate.job.sessionId || !value.candidate.job.correlationId)) {
    throw new Error('Saved script revision is unreadable. It has not been overwritten.');
  }
  return value;
}

export interface ScriptStorage {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
}

export async function saveScriptProject(storage: ScriptStorage, project: ScriptProject): Promise<void> {
  const raw = JSON.stringify(project);
  await storage.write(raw);
  if (await storage.read() !== raw) throw new Error('Script save could not be verified. Keep this window open.');
}

export function replaceSelectedText(text: string, selected: string, replacement: string): string {
  if (!selected.trim() || !replacement.trim()) throw new Error('Select a passage and provide its replacement.');
  const start = text.indexOf(selected);
  if (start < 0 || text.indexOf(selected, start + selected.length) >= 0) {
    throw new Error('The selected passage must match exactly once in the chosen version.');
  }
  return text.slice(0, start) + replacement + text.slice(start + selected.length);
}

export function revisionPrompt(text: string, selected: string, instruction: string): string {
  replaceSelectedText(text, selected, selected);
  if (!instruction.trim()) throw new Error('Describe the change for this passage.');
  return 'Writing task: revise ONLY the selected passage. Final Allie response must be ONLY the replacement text, without preface, review, code fences, or the full script. Preserve facts outside the selection. Amber reviews; Allie returns replacement only.\n'
    + JSON.stringify({ scriptContext: text, selectedPassage: selected, requestedChange: instruction });
}

export function completeScriptJob(project: ScriptProject, result: PathResult): ScriptProject {
  const job = project.job;
  if (!job || result.sessionId !== job.sessionId || result.correlationId !== job.correlationId) {
    throw new Error('Path reply does not match this script request.');
  }
  if (!result.ok || result.status === 'error') throw new Error(result.error || 'Path did not finish the script.');
  if (result.status !== 'final') return project;
  const reply = result.transcript?.findLast(entry => entry.kind === 'final' && (entry.identity || entry.from) === 'allie');
  if (!reply?.body?.trim()) throw new Error('Path finished without a final writer reply.');
  const { job: _job, submitting: _submitting, ...rest } = project;
  if (job.kind === 'revise') {
    if (currentVersion(project)?.id !== job.baseVersionId) throw new Error('The script changed during this revision.');
    return { ...rest, candidate: { text: reply.body, job } };
  }
  return { ...rest, versions: [...rest.versions, {
    id: `version-${job.sessionId}`, text: reply.body, createdAt: Date.now(), change: 'Writer draft',
    sessionId: job.sessionId, correlationId: job.correlationId,
  }] };
}

export function acceptScriptRevision(project: ScriptProject, candidateText: string): ScriptProject {
  const candidate = project.candidate;
  const base = currentVersion(project);
  if (!candidate || !base || base.id !== candidate.job.baseVersionId) throw new Error('Revision no longer matches the current script.');
  const text = replaceSelectedText(base.text, candidate.job.selectedText || '', candidateText);
  const { candidate: _candidate, ...rest } = project;
  return { ...rest, versions: [...rest.versions, {
    id: `version-${candidate.job.sessionId}`, text, createdAt: Date.now(),
    change: candidate.job.instruction || 'Selected passage revision',
    sessionId: candidate.job.sessionId, correlationId: candidate.job.correlationId,
  }] };
}

export function exportScriptText(project: ScriptProject, version: ScriptVersion): string {
  if (!project.versions.some(v => v.id === version.id && v.text === version.text)) throw new Error('Choose a saved script version.');
  return `MOONSHADOW SCRIPT — ${version.id}\nBrief: ${project.brief}\nChange: ${version.change}\nTiming is estimated; this draft has not been approved for publishing.\n\n${version.text}\n`;
}
