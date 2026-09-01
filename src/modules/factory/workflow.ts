export type FactoryStage =
  | 'idea'
  | 'editing'
  | 'approval'
  | 'ready_to_publish'
  | 'publishing'
  | 'published'
  | 'blocked';

export type PublishHealth = 'unknown' | 'disconnected' | 'connected';

export interface PublishDestination {
  id: string;
  label: string;
  health: PublishHealth;
  externalChannelId?: string;
  healthReason?: string;
}

export interface ExternalPublishEvidence {
  destinationId: string;
  externalId: string;
  externalUrl?: string;
  confirmedAt: number;
}

export interface FactoryLane {
  id: string;
  title: string;
  stage: FactoryStage;
  projectAssetId?: string;
  renderedAssetId?: string;
  approvedAt?: number;
  destinationId?: string;
  publishAttempts?: number;
  lastPublishAttemptAt?: number;
  publishEvidence?: ExternalPublishEvidence;
  blocker?: string;
  updatedAt: number;
}

export interface FactorySnapshot {
  lanes: FactoryLane[];
  destinations: PublishDestination[];
}

export class ContentFactory {
  private lanes = new Map<string, FactoryLane>();
  private destinations = new Map<string, PublishDestination>();

  constructor(destinations: PublishDestination[] = []) {
    for (const destination of destinations) {
      this.destinations.set(destination.id, { ...destination });
    }
  }

  snapshot(): FactorySnapshot {
    return {
      lanes: Array.from(this.lanes.values()).map((lane) => ({ ...lane })),
      destinations: Array.from(this.destinations.values()).map((destination) => ({ ...destination })),
    };
  }

  registerDestination(destination: PublishDestination) {
    this.destinations.set(destination.id, { ...destination });
  }

  createLane(title: string): FactoryLane {
    const now = Date.now();
    const lane: FactoryLane = {
      id: `lane-${now}-${Math.random().toString(36).slice(2, 8)}`,
      title,
      stage: 'idea',
      updatedAt: now,
    };
    this.lanes.set(lane.id, lane);
    return { ...lane };
  }

  attachProject(laneId: string, projectAssetId: string): FactoryLane {
    return this.update(laneId, (lane) => ({
      ...lane,
      projectAssetId,
      stage: 'editing',
      blocker: undefined,
    }));
  }

  attachRenderedOutput(laneId: string, renderedAssetId: string): FactoryLane {
    return this.update(laneId, (lane) => {
      if (!lane.projectAssetId) {
        throw new Error('Cannot attach rendered output before an editor project is linked.');
      }
      return {
        ...lane,
        renderedAssetId,
        stage: 'approval',
        blocker: undefined,
      };
    });
  }

  approve(laneId: string): FactoryLane {
    return this.update(laneId, (lane) => {
      if (!lane.renderedAssetId) {
        throw new Error('Cannot approve before a rendered output asset exists.');
      }
      return {
        ...lane,
        approvedAt: Date.now(),
        stage: 'ready_to_publish',
        blocker: undefined,
      };
    });
  }

  beginPublish(laneId: string, destinationId: string): FactoryLane {
    return this.update(laneId, (lane) => {
      const retryingBlockedPublish = lane.stage === 'blocked';
      if (
        (lane.stage !== 'ready_to_publish' && !retryingBlockedPublish) ||
        !lane.approvedAt ||
        !lane.renderedAssetId ||
        lane.publishEvidence
      ) {
        throw new Error('Lane is not approved and ready to publish.');
      }

      const destination = this.destinations.get(destinationId);
      if (!destination || destination.health !== 'connected') {
        return {
          ...lane,
          destinationId,
          stage: 'blocked',
          blocker: destination?.healthReason || 'Publish destination is not live-connected.',
        };
      }

      return {
        ...lane,
        destinationId,
        stage: 'publishing',
        publishAttempts: (lane.publishAttempts ?? 0) + 1,
        lastPublishAttemptAt: Date.now(),
        blocker: undefined,
      };
    });
  }

  confirmPublished(laneId: string, evidence: ExternalPublishEvidence): FactoryLane {
    return this.update(laneId, (lane) => {
      if (lane.stage !== 'publishing') {
        throw new Error('Cannot confirm publication unless the lane is actively publishing.');
      }
      if (!lane.destinationId || lane.destinationId !== evidence.destinationId) {
        throw new Error('Publication evidence does not match the selected destination.');
      }
      if (!evidence.externalId || !evidence.confirmedAt) {
        throw new Error('External publication confirmation evidence is incomplete.');
      }
      return {
        ...lane,
        stage: 'published',
        publishEvidence: { ...evidence },
        blocker: undefined,
      };
    });
  }

  markPublishFailed(laneId: string, reason: string): FactoryLane {
    return this.update(laneId, (lane) => ({
      ...lane,
      stage: 'blocked',
      blocker: reason || 'External publisher failed without evidence.',
    }));
  }

  private update(laneId: string, updater: (lane: FactoryLane) => FactoryLane): FactoryLane {
    const existing = this.lanes.get(laneId);
    if (!existing) throw new Error(`Unknown factory lane: ${laneId}`);
    const updated = { ...updater({ ...existing }), updatedAt: Date.now() };
    this.lanes.set(laneId, updated);
    return { ...updated };
  }
}

export const contentFactory = new ContentFactory([
  { id: 'youtube-primary', label: 'YouTube Primary', health: 'unknown' },
  { id: 'youtube-horror', label: 'YouTube Horror', health: 'unknown' },
  { id: 'youtube-variety', label: 'YouTube Variety', health: 'unknown' },
  { id: 'youtube-fixit', label: 'YouTube Fix-It', health: 'unknown' },
]);
