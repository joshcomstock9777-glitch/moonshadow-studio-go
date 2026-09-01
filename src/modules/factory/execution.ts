import { contentFactory, type FactoryLane, type PublishDestination } from './workflow';
import { publisherClient, type PublishRequest } from './publisherClient';

const DESTINATION_IDS = [
  'youtube-primary',
  'youtube-horror',
  'youtube-variety',
  'youtube-fixit',
] as const;

export type YouTubeDestinationId = (typeof DESTINATION_IDS)[number];

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
 * Refresh all four YouTube destinations against the configured server-side
 * publisher. No destination is promoted to connected unless the publisher
 * health endpoint returns matching live channel evidence.
 */
export async function refreshYouTubeDestinationHealth(): Promise<PublishDestination[]> {
  const destinations = await Promise.all(
    DESTINATION_IDS.map((destinationId) => publisherClient.checkDestination(destinationId)),
  );

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
 * health, server error, or incomplete evidence leaves the lane blocked.
 */
export async function executeFactoryPublish(
  request: FactoryPublishExecutionRequest,
): Promise<FactoryPublishExecutionResult> {
  const destination = await publisherClient.checkDestination(request.destinationId);
  contentFactory.registerDestination(destination);

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
