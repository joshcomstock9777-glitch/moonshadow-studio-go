import type { AssetKind, StudioAsset } from './library';

export type AssetStorageHealthState = 'unknown' | 'connected' | 'disconnected' | 'error';

export interface AssetStorageHealth {
  state: AssetStorageHealthState;
  checkedAt: number;
  backend?: string;
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
    };

    if (body.connected !== true) {
      return {
        state: 'disconnected',
        checkedAt: Date.now(),
        backend: typeof body.backend === 'string' ? body.backend : undefined,
        message: typeof body.message === 'string' ? body.message : 'Storage backend did not confirm connectivity.',
      };
    }

    return {
      state: 'connected',
      checkedAt: Date.now(),
      backend: typeof body.backend === 'string' ? body.backend : undefined,
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
  if (typeof body.externalStorageId !== 'string' || body.externalStorageId.length === 0) {
    throw new Error('Asset storage server omitted external storage evidence.');
  }
  if (typeof body.confirmedAt !== 'number' || !Number.isFinite(body.confirmedAt)) {
    throw new Error('Asset storage server omitted a valid confirmation timestamp.');
  }

  const asset = validateDurableAsset(body.asset, input);

  return {
    asset,
    externalStorageId: body.externalStorageId,
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
  if (candidate.kind !== input.kind) {
    throw new Error('Asset storage server returned a mismatched asset kind.');
  }
  if (candidate.storageState !== 'durable') {
    throw new Error('Asset storage server returned an asset without durable storage state.');
  }
  if (!candidate.provenance || !Array.isArray(candidate.provenance.parentAssetIds)) {
    throw new Error('Asset storage server returned incomplete provenance evidence.');
  }

  return candidate as StudioAsset;
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}
