import { assetLibrary, Asset } from '../assets/library';
import { persistAsset } from '../assets/storageClient';

export interface ResearchReferenceInput {
  projectName: string;
  url: string;
  title?: string;
  note?: string;
  parentAssetIds?: string[];
}

export interface MarkupNoteInput {
  projectName: string;
  note: string;
  targetAssetId?: string;
  timeMs?: number;
  parentAssetIds?: string[];
}

export interface DurableToolArtifactResult {
  asset: Asset;
  confirmedAt: number;
}

function requireHttpUrl(value: string): string {
  const trimmed = value.trim();
  const parsed = new URL(trimmed);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Research references require an http(s) URL.');
  }
  return parsed.toString();
}

export async function saveResearchReference(input: ResearchReferenceInput): Promise<DurableToolArtifactResult> {
  const url = requireHttpUrl(input.url);
  const confirmation = await persistAsset({
    name: input.title?.trim() || `Research reference ${new Date().toISOString()}`,
    kind: 'project_state',
    projectName: input.projectName,
    parentAssetIds: input.parentAssetIds || [],
    metadata: {
      artifactType: 'research_reference',
      sourceUrl: url,
      title: input.title?.trim() || null,
      note: input.note?.trim() || null,
      capturedAt: Date.now(),
      captureSurface: 'studio_go_browser_tool',
    },
  });
  assetLibrary.registerDurableAsset(confirmation.asset);
  return confirmation;
}

export async function saveMarkupNote(input: MarkupNoteInput): Promise<DurableToolArtifactResult> {
  const note = input.note.trim();
  if (!note) throw new Error('Markup note is required.');
  if (input.timeMs != null && (!Number.isFinite(input.timeMs) || input.timeMs < 0)) {
    throw new Error('Markup time must be a non-negative finite number.');
  }

  const parents = Array.from(new Set([
    ...(input.parentAssetIds || []),
    ...(input.targetAssetId ? [input.targetAssetId] : []),
  ]));

  const confirmation = await persistAsset({
    name: `${input.projectName} markup`,
    kind: 'project_state',
    projectName: input.projectName,
    parentAssetIds: parents,
    metadata: {
      artifactType: 'markup_note',
      note,
      targetAssetId: input.targetAssetId || null,
      timeMs: input.timeMs ?? null,
      capturedAt: Date.now(),
      captureSurface: 'studio_go_markup_tool',
    },
  });
  assetLibrary.registerDurableAsset(confirmation.asset);
  return confirmation;
}
