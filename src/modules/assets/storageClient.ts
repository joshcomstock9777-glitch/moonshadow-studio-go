import type { AssetKind, StudioAsset } from './library';

export type AssetStorageHealthState = 'unknown' | 'connected' | 'disconnected' | 'error';

export interface AssetStorageHealth {
  state: AssetStorageHealthState;
  checkedAt: number;
  backend?: string;
  verificationId?: string;
  message?: string;
}

export interface DurableAssetConfirmation {
  asset: StudioAsset;
  externalStorageId: string;
  confirmedAt: number;
}

export interface PersistAssetInput {
  name: string;
  kind: AssetKind;
  uri?: string;
  mimeType?: string;
  projectName?: string;
  parentAssetIds: string[];
  metadata?: Record<string, string | number | boolean | null>;
}

const STORAGE_API_URL = process.env.EXPO_PUBLIC_ASSET_STORAGE_API_URL?.trim();

export async function getAssetStorageHealth(): Promise<AssetStorageHealth> {
  if (!STORAGE_API_URL) {
    return {
      state: 'unknown',
      checkedAt: Date.now(),
      message: 'EXPO_PUBLIC_ASSET_STORAGE_API_URL is not configured.',
    };
  }

  try {
    const response = await fetch(`${trimTrailingSlash(STORAGE_API_URL)}/health`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      return {
        state: 'disconnected',
        checkedAt: Date.now(),
        message: `Asset storage health returned HTTP ${response.status}.`,
      };
    }

    const body = (await response.json()) as {
      connected?: unknown;
      backend?: unknown;
      message?: unknown;
      writeReadVerified?: unknown;
      verificationId?: unknown;
    };

    const backend = typeof body.backend === 'string' ? body.backend : undefined;
    const verificationId = typeof body.verificationId === 'string' && body.verificationId.trim()
      ? body.verificationId.trim()
      : undefined;

    if (body.connected !== true) {
      return {
        state: 'disconnected',
        checkedAt: Date.now(),
        backend,
        message: typeof body.message === 'string' ? body.message : 'Storage backend did not confirm connectivity.',
      };
    }

    if (body.writeReadVerified !== true || !verificationId) {
      return {
        state: 'disconnected',
        checkedAt: Date.now(),
        backend,
        message: 'Storage backend is reachable but has not supplied live write/read verification evidence.',
      };
    }

    return {
      state: 'connected',
      checkedAt: Date.now(),
      backend,
      verificationId,
      message: typeof body.message === 'string' ? body.message : undefined,
    };
  } catch (error) {
    return {
      state: 'error',
      checkedAt: Date.now(),
      message: error instanceof Error ? error.message : 'Asset storage health request failed.',
    };
  }
}

export async function persistAsset(input: PersistAssetInput): Promise<DurableAssetConfirmation> {
  if (!STORAGE_API_URL) {
    throw new Error('Durable asset storage is unavailable because EXPO_PUBLIC_ASSET_STORAGE_API_URL is not configured.');
  }

  const response = await fetch(`${trimTrailingSlash(STORAGE_API_URL)}/assets`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(`Asset storage request failed with HTTP ${response.status}.`);
  }

  const body = (await response.json()) as {
    durable?: unknown;
    externalStorageId?: unknown;
    confirmedAt?: unknown;
    asset?: unknown;
  };

  if (body.durable !== true) {
    throw new Error('Asset storage server did not confirm durable persistence.');
  }
  if (typeof body.externalStorageId !== 'string' || body.externalStorageId.trim().length === 0) {
    throw new Error('Asset storage server omitted external storage evidence.');
  }
  if (
    typeof body.confirmedAt !== 'number' ||
    !Number.isFinite(body.confirmedAt) ||
    body.confirmedAt <= 0
  ) {
    throw new Error('Asset storage server omitted a valid confirmation timestamp.');
  }

  const asset = validateDurableAsset(body.asset, input);

  return {
    asset,
    externalStorageId: body.externalStorageId.trim(),
    confirmedAt: body.confirmedAt,
  };
}

function validateDurableAsset(value: unknown, input: PersistAssetInput): StudioAsset {
  if (!value || typeof value !== 'object') {
    throw new Error('Asset storage server returned no asset record.');
  }

  const candidate = value as Partial<StudioAsset>;
  if (typeof candidate.id !== 'string' || candidate.id.length === 0) {
    throw new Error('Asset storage server returned an asset without an ID.');
  }
  if (candidate.name !== input.name) {
    throw new Error('Asset storage server returned an asset that did not match the requested name.');
  }
  if (candidate.kind !== input.kind) {
    throw new Error('Asset storage server returned a mismatched asset kind.');
  }
  if (candidate.storageState !== 'durable') {
    throw new Error('Asset storage server returned an asset without durable storage state.');
  }
  if (input.uri && candidate.uri !== input.uri) {
    throw new Error('Asset storage server returned a durable asset for a different URI.');
  }
  if (input.mimeType && candidate.mimeType !== input.mimeType) {
    throw new Error('Asset storage server returned a mismatched MIME type.');
  }
  if (!candidate.provenance || !Array.isArray(candidate.provenance.parentAssetIds)) {
    throw new Error('Asset storage server returned incomplete provenance evidence.');
  }
  if (input.projectName && candidate.provenance.projectName !== input.projectName) {
    throw new Error('Asset storage server returned provenance for a different project.');
  }
  if (input.kind === 'source_media' && input.uri && candidate.provenance.sourceUri !== input.uri) {
    throw new Error('Asset storage server returned source-media provenance for a different URI.');
  }
  if (!sameAssetIds(candidate.provenance.parentAssetIds, input.parentAssetIds)) {
    throw new Error('Asset storage server returned provenance with mismatched parent assets.');
  }
  if (!candidate.metadata || typeof candidate.metadata !== 'object') {
    throw new Error('Asset storage server returned an asset without metadata evidence.');
  }

  for (const [key, expected] of Object.entries(input.metadata ?? {})) {
    if (candidate.metadata[key] !== expected) {
      throw new Error(`Asset storage server did not echo required metadata evidence: ${key}.`);
    }
  }

  return candidate as StudioAsset;
}

function sameAssetIds(actual: string[], expected: string[]): boolean {
  if (actual.length !== expected.length) return false;
  const actualSorted = [...actual].sort();
  const expectedSorted = [...expected].sort();
  return actualSorted.every((value, index) => value === expectedSorted[index]);
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}
