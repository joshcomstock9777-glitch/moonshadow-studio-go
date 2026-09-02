import { assetLibrary } from '../assets/library';
import {
  contentFactory,
  enforceDistinctYouTubeChannels,
  type FactoryLane,
  type PublishDestination,
} from './workflow';
import { publisherClient, type PublishRequest } from './publisherClient';
import { getRendererHealth, renderProject, type RendererHealth } from './rendererClient';

const DESTINATION_IDS = [
  'youtube-primary',
  'youtube-horror',
  'youtube-variety',
  'youtube-fixit',
] as const;

export type YouTubeDestinationId = (typeof DESTINATION_IDS)[number];

export interface FactoryRenderExecutionRequest {
  laneId: string;
  outputName: string;
  projectName?: string;
  mimeType?: string;
}

export interface FactoryRenderExecutionResult {
  lane: FactoryLane;
  renderer: RendererHealth;
}

export interface FactoryPublishExecutionRequest {
  laneId: string;
  destinationId: YouTubeDestinationId;
  title: string;
  description?: string;
  privacyStatus?: PublishRequest['privacyStatus'];
}

export interface FactoryPublishExecutionResult {
  lane: FactoryLane;
  destination: PublishDestination;
}

/**
 * Execute the render boundary for one factory lane.
 *
 * A lane only advances to approval after the renderer returns a durable
 * rendered-output asset whose provenance includes the linked editor project.
 * Missing configuration, unhealthy renderer state, or incomplete evidence
 * leaves the lane unchanged instead of manufacturing a render.
 */
export async function executeFactoryRender(
  request: FactoryRenderExecutionRequest,
): Promise<FactoryRenderExecutionResult> {
  const lane = getFactoryLane(request.laneId);
  if (!lane) throw new Error(`Unknown factory lane: ${request.laneId}`);
  if (!lane.projectAssetId) {
    throw new Error('Factory lane cannot render before an editor project asset is linked.');
  }

  const renderer = await getRendererHealth();
  if (renderer.state !== 'connected') {
    return { lane, renderer };
  }

  const confirmation = await renderProject({
    projectAssetId: lane.projectAssetId,
    outputName: request.outputName,
    projectName: request.projectName,
    mimeType: request.mimeType,
  });

  const durableAsset = assetLibrary.registerDurableAsset(confirmation.asset);
  const updatedLane = contentFactory.attachRenderedOutput(request.laneId, durableAsset.id);
  return { lane: updatedLane, renderer };
}

/**
 * Refresh all four YouTube destinations against the configured server-side
 * publisher. No destination is promoted to connected unless the publisher
 * health endpoint returns matching live channel evidence, and duplicate
 * channel assignments are rejected rather than counted as four destinations.
 */
export async function refreshYouTubeDestinationHealth(): Promise<PublishDestination[]> {
  const probed = await Promise.all(
    DESTINATION_IDS.map((destinationId) => publisherClient.checkDestination(destinationId)),
  );
  const destinations = enforceDistinctYouTubeChannels(probed);

  for (const destination of destinations) {
    contentFactory.registerDestination(destination);
  }

  return destinations;
}

/**
 * Execute the publish boundary for one approved factory lane.
 *
 * The lane only reaches `published` through ContentFactory.confirmPublished,
 * after PublisherClient returns external publication evidence. Any missing
 * health, server error, duplicate channel assignment, or incomplete evidence
 * leaves the lane blocked.
 */
export async function executeFactoryPublish(
  request: FactoryPublishExecutionRequest,
): Promise<FactoryPublishExecutionResult> {
  const probedDestination = await publisherClient.checkDestination(request.destinationId);
  const existingDestinations = contentFactory
    .snapshot()
    .destinations.filter((destination) => destination.id !== request.destinationId);
  const reconciled = enforceDistinctYouTubeChannels([...existingDestinations, probedDestination]);
  const destination = reconciled.find((candidate) => candidate.id === request.destinationId) ?? probedDestination;

  for (const candidate of reconciled) {
    contentFactory.registerDestination(candidate);
  }

  const publishingLane = contentFactory.beginPublish(request.laneId, request.destinationId);
  if (publishingLane.stage !== 'publishing') {
    return { lane: publishingLane, destination };
  }

  if (!publishingLane.renderedAssetId) {
    const lane = contentFactory.markPublishFailed(
      request.laneId,
      'Approved lane lost its rendered asset before publication.',
    );
    return { lane, destination };
  }

  try {
    const evidence = await publisherClient.publish({
      destinationId: request.destinationId,
      renderedAssetId: publishingLane.renderedAssetId,
      title: request.title,
      description: request.description,
      privacyStatus: request.privacyStatus,
    });

    const lane = contentFactory.confirmPublished(request.laneId, evidence);
    return { lane, destination };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'External publisher failed without evidence.';
    const lane = contentFactory.markPublishFailed(request.laneId, message);
    return { lane, destination };
  }
}

export function getFactoryLane(laneId: string): FactoryLane | undefined {
  return contentFactory.snapshot().lanes.find((lane) => lane.id === laneId);
}
