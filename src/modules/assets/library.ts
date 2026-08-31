export type AssetKind = 'source_media' | 'project_state' | 'rendered_output';
export type AssetStorageState = 'reference_only' | 'memory_snapshot' | 'durable';

export interface AssetProvenance {
  source: 'user_uri' | 'editor_project' | 'renderer';
  sourceUri?: string;
  projectName?: string;
  createdAt: number;
  parentAssetIds: string[];
}

export interface StudioAsset {
  id: string;
  name: string;
  kind: AssetKind;
  storageState: AssetStorageState;
  uri?: string;
  mimeType?: string;
  provenance: AssetProvenance;
  metadata: Record<string, string | number | boolean | null>;
}

export interface ProjectSnapshotInput {
  projectName: string;
  mediaAssetIds: string[];
  mediaCount: number;
  textCount: number;
  duration: number;
  savedAt: number;
}

class AssetLibrary {
  private assets = new Map<string, StudioAsset>();

  list(): StudioAsset[] {
    return Array.from(this.assets.values()).sort((a, b) => b.provenance.createdAt - a.provenance.createdAt);
  }

  get(id: string): StudioAsset | null {
    return this.assets.get(id) ?? null;
  }

  registerSourceUri(uri: string, name: string): StudioAsset {
    const existing = this.list().find(
      (asset) => asset.kind === 'source_media' && asset.uri === uri,
    );
    if (existing) return existing;

    const asset: StudioAsset = {
      id: makeId('source'),
      name,
      kind: 'source_media',
      storageState: 'reference_only',
      uri,
      provenance: {
        source: 'user_uri',
        sourceUri: uri,
        createdAt: Date.now(),
        parentAssetIds: [],
      },
      metadata: {
        durable: false,
        note: 'URI reference only; bytes have not been copied to durable Studio storage.',
      },
    };
    this.assets.set(asset.id, asset);
    return asset;
  }

  recordProjectSnapshot(input: ProjectSnapshotInput): StudioAsset {
    const asset: StudioAsset = {
      id: makeId('project'),
      name: `${input.projectName} state`,
      kind: 'project_state',
      storageState: 'memory_snapshot',
      provenance: {
        source: 'editor_project',
        projectName: input.projectName,
        createdAt: input.savedAt,
        parentAssetIds: [...input.mediaAssetIds],
      },
      metadata: {
        mediaCount: input.mediaCount,
        textCount: input.textCount,
        duration: input.duration,
        savedAt: input.savedAt,
        durable: false,
        note: 'Editor state snapshot only; persistent Asset Library backend is not connected yet.',
      },
    };
    this.assets.set(asset.id, asset);
    return asset;
  }

  recordRenderedOutput(params: {
    name: string;
    uri: string;
    projectName: string;
    parentAssetIds: string[];
    mimeType?: string;
    durableConfirmed: boolean;
  }): StudioAsset {
    if (!params.durableConfirmed) {
      throw new Error('Rendered output cannot be registered as durable without storage confirmation.');
    }

    const asset: StudioAsset = {
      id: makeId('render'),
      name: params.name,
      kind: 'rendered_output',
      storageState: 'durable',
      uri: params.uri,
      mimeType: params.mimeType,
      provenance: {
        source: 'renderer',
        projectName: params.projectName,
        createdAt: Date.now(),
        parentAssetIds: [...params.parentAssetIds],
      },
      metadata: {
        durable: true,
      },
    };
    this.assets.set(asset.id, asset);
    return asset;
  }
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const assetLibrary = new AssetLibrary();
