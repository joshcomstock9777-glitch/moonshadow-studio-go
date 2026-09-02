import type {
  ExternalPublishEvidence,
  PublishDestination,
  PublishHealth,
} from './workflow';

export interface PublisherClientConfig {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface PublishRequest {
  destinationId: string;
  renderedAssetId: string;
  title: string;
  description?: string;
  privacyStatus?: 'private' | 'unlisted' | 'public';
}

interface HealthResponse {
  destinationId?: unknown;
  connected?: unknown;
  channelId?: unknown;
  reason?: unknown;
}

interface PublishResponse {
  destinationId?: unknown;
  platform?: unknown;
  verified?: unknown;
  channelId?: unknown;
  externalId?: unknown;
  externalUrl?: unknown;
  confirmedAt?: unknown;
}

const DEFAULT_DESTINATIONS = new Set([
  'youtube-primary',
  'youtube-horror',
  'youtube-variety',
  'youtube-fixit',
]);

export class PublisherClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: PublisherClientConfig = {}) {
    const configuredBaseUrl = config.baseUrl ?? process.env.EXPO_PUBLIC_PUBLISHER_API_URL ?? '';
    this.baseUrl = configuredBaseUrl.replace(/\/$/, '');
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  isConfigured(): boolean {
    return this.baseUrl.length > 0;
  }

  async checkDestination(destinationId: string): Promise<PublishDestination> {
    this.assertKnownDestination(destinationId);

    if (!this.isConfigured()) {
      return this.disconnected(destinationId, 'Publisher server is not configured.');
    }

    try {
      const response = await this.fetchImpl(
        `${this.baseUrl}/v1/youtube/destinations/${encodeURIComponent(destinationId)}/health`,
        {
          method: 'GET',
          headers: { Accept: 'application/json' },
        },
      );

      const body = (await response.json().catch(() => ({}))) as HealthResponse;
      if (!response.ok) {
        return this.disconnected(destinationId, healthReason(body.reason, response.status));
      }

      if (body.destinationId !== destinationId || body.connected !== true || typeof body.channelId !== 'string' || !body.channelId) {
        return this.disconnected(destinationId, healthReason(body.reason));
      }

      return {
        id: destinationId,
        label: destinationLabel(destinationId),
        health: 'connected',
        externalChannelId: body.channelId,
      };
    } catch {
      return this.disconnected(destinationId, 'Publisher health check could not reach the server.');
    }
  }

  async publish(request: PublishRequest): Promise<ExternalPublishEvidence> {
    this.assertKnownDestination(request.destinationId);
    if (!this.isConfigured()) {
      throw new Error('Publisher server is not configured.');
    }
    if (!request.renderedAssetId) {
      throw new Error('A rendered asset ID is required before publish.');
    }
    if (!request.title.trim()) {
      throw new Error('A publish title is required.');
    }

    const response = await this.fetchImpl(`${this.baseUrl}/v1/youtube/publish`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        destinationId: request.destinationId,
        renderedAssetId: request.renderedAssetId,
        title: request.title,
        description: request.description ?? '',
        privacyStatus: request.privacyStatus ?? 'private',
      }),
    });

    if (!response.ok) {
      throw new Error(`Publisher server rejected the request (${response.status}).`);
    }

    const body = (await response.json()) as PublishResponse;
    if (
      body.destinationId !== request.destinationId ||
      body.platform !== 'youtube' ||
      body.verified !== true ||
      typeof body.channelId !== 'string' ||
      !body.channelId ||
      typeof body.externalId !== 'string' ||
      !body.externalId ||
      typeof body.confirmedAt !== 'number' ||
      !Number.isFinite(body.confirmedAt) ||
      body.confirmedAt <= 0
    ) {
      throw new Error('Publisher response did not contain verified YouTube publication evidence.');
    }

    const externalUrl = typeof body.externalUrl === 'string' && body.externalUrl ? body.externalUrl : undefined;
    if (externalUrl && !isMatchingYouTubeVideoUrl(externalUrl, body.externalId)) {
      throw new Error('Publisher response contained a YouTube URL that did not match the confirmed external video ID.');
    }

    return {
      destinationId: request.destinationId,
      externalChannelId: body.channelId,
      externalId: body.externalId,
      externalUrl,
      confirmedAt: body.confirmedAt,
    };
  }

  private disconnected(destinationId: string, healthReason?: string): PublishDestination {
    return {
      id: destinationId,
      label: destinationLabel(destinationId),
      health: 'disconnected',
      healthReason,
    };
  }

  private assertKnownDestination(destinationId: string) {
    if (!DEFAULT_DESTINATIONS.has(destinationId)) {
      throw new Error(`Unknown publishing destination: ${destinationId}`);
    }
  }
}

function healthReason(reason: unknown, status?: number): string {
  switch (reason) {
    case 'not_configured':
      return 'YouTube OAuth is not configured for this destination.';
    case 'oauth_failed':
      return 'YouTube OAuth refresh failed for this destination.';
    case 'channel_probe_failed':
      return 'YouTube channel verification failed for this destination.';
    default:
      return status ? `Publisher health check failed (${status}).` : 'Publisher did not provide live connection evidence.';
  }
}

function isMatchingYouTubeVideoUrl(value: string, externalId: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (host === 'youtu.be') return url.pathname.slice(1) === externalId;
    if (host === 'youtube.com' || host === 'www.youtube.com' || host === 'm.youtube.com') {
      return url.pathname === '/watch' && url.searchParams.get('v') === externalId;
    }
    return false;
  } catch {
    return false;
  }
}

function destinationLabel(destinationId: string): string {
  switch (destinationId) {
    case 'youtube-primary':
      return 'YouTube Primary';
    case 'youtube-horror':
      return 'YouTube Horror';
    case 'youtube-variety':
      return 'YouTube Variety';
    case 'youtube-fixit':
      return 'YouTube Fix-It';
    default:
      return destinationId;
  }
}

export function publishHealthIsLive(health: PublishHealth): boolean {
  return health === 'connected';
}

export const publisherClient = new PublisherClient();
