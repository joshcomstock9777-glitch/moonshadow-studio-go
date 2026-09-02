import type { StudioAsset } from '../assets/library';

export type RendererHealthState = 'unknown' | 'connected' | 'disconnected' | 'error';

export interface RendererHealth {
  state: RendererHealthState;
  checkedAt: number;
  backend?: string;
  message?: string;
  verificationId?: string;
}

export interface RenderRequest {
  projectAssetId: string;
  outputName: string;
  projectName?: string;
  mimeType?: string;
}

export interface RenderConfirmation {
  asset: StudioAsset;
  externalRenderId: string;
  confirmedAt: number;
}

const RENDERER_API_URL = process.env.EXPO_PUBLIC_RENDERER_API_URL?.trim();

export async function getRendererHealth(): Promise<RendererHealth> {
  if (!RENDERER_API_URL) {
    return {
      state: 'unknown',
      checkedAt: Date.now(),
      message: 'EXPO_PUBLIC_RENDERER_API_URL is not configured.',
    };
  }

  try {
    const response = await fetch(`${trimTrailingSlash(RENDERER_API_URL)}/health`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      return {
        state: 'disconnected',
        checkedAt: Date.now(),
        message: `Renderer health returned HTTP ${response.status}.`,
      };
    }

    const body = (await response.json()) as {
      connected?: unknown;
      renderVerified?: unknown;
      verificationId?: unknown;
      backend?: unknown;
      message?: unknown;
    };

    const backend = typeof body.backend === 'string' ? body.backend : undefined;
    const message = typeof body.message === 'string' ? body.message : undefined;
    const verificationId =
      typeof body.verificationId === 'string' && body.verificationId.trim().length > 0
        ? body.verificationId.trim()
        : undefined;

    if (body.connected !== true || body.renderVerified !== true || !verificationId) {
      return {
        state: 'disconnected',
        checkedAt: Date.now(),
        backend,
        message: message ?? 'Renderer has not proven a completed durable render.',
      };
    }

    return {
      state: 'connected',
      checkedAt: Date.now(),
      backend,
      verificationId,
      message,
    };
  } catch (error) {
    return {
      state: 'error',
      checkedAt: Date.now(),
      message: error instanceof Error ? error.message : 'Renderer health request failed.',
    };
  }
}

export async function renderProject(input: RenderRequest): Promise<RenderConfirmation> {
  if (!RENDERER_API_URL) {
    throw new Error('Renderer is unavailable because EXPO_PUBLIC_RENDERER_API_URL is not configured.');
  }

  const response = await fetch(`${trimTrailingSlash(RENDERER_API_URL)}/renders`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(`Renderer request failed with HTTP ${response.status}.`);
  }

  const body = (await response.json()) as {
    rendered?: unknown;
    externalRenderId?: unknown;
    confirmedAt?: unknown;
    asset?: unknown;
  };

  if (body.rendered !== true) {
    throw new Error('Renderer did not confirm a completed render.');
  }
  if (typeof body.externalRenderId !== 'string' || body.externalRenderId.trim().length === 0) {
    throw new Error('Renderer omitted external render evidence.');
  }
  if (typeof body.confirmedAt !== 'number' || !Number.isFinite(body.confirmedAt) || body.confirmedAt <= 0) {
    throw new Error('Renderer omitted a valid confirmation timestamp.');
  }

  const asset = validateRenderedAsset(body.asset, input.projectAssetId);
  return {
    asset,
    externalRenderId: body.externalRenderId.trim(),
    confirmedAt: body.confirmedAt,
  };
}

function validateRenderedAsset(value: unknown, projectAssetId: string): StudioAsset {
  if (!value || typeof value !== 'object') {
    throw new Error('Renderer returned no rendered asset record.');
  }

  const candidate = value as Partial<StudioAsset>;
  if (typeof candidate.id !== 'string' || candidate.id.length === 0) {
    throw new Error('Renderer returned an asset without an ID.');
  }
  if (candidate.kind !== 'rendered_output') {
    throw new Error('Renderer returned an asset with the wrong kind.');
  }
  if (candidate.storageState !== 'durable') {
    throw new Error('Renderer returned an output without durable storage evidence.');
  }
  if (!candidate.uri) {
    throw new Error('Renderer returned a durable output without a URI.');
  }
  if (!candidate.provenance || !Array.isArray(candidate.provenance.parentAssetIds)) {
    throw new Error('Renderer returned incomplete provenance evidence.');
  }
  if (!candidate.provenance.parentAssetIds.includes(projectAssetId)) {
    throw new Error('Renderer output provenance does not include the requested project asset.');
  }

  return candidate as StudioAsset;
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}
