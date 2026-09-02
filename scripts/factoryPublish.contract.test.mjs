import assert from 'node:assert/strict';
import test from 'node:test';
import { ContentFactory } from '../src/modules/factory/workflow.ts';

function readyFactory() {
  const factory = new ContentFactory([
    {
      id: 'youtube-primary',
      label: 'YouTube Primary',
      health: 'connected',
      externalChannelId: 'channel-primary',
    },
  ]);

  const lane = factory.createLane('Channel-bound publish test');
  factory.attachProject(lane.id, 'project-1');
  factory.attachRenderedOutput(lane.id, 'render-1');
  factory.approve(lane.id);
  factory.beginPublish(lane.id, 'youtube-primary');
  return { factory, laneId: lane.id };
}

test('rejects publication evidence from a different YouTube channel', () => {
  const { factory, laneId } = readyFactory();

  assert.throws(
    () =>
      factory.confirmPublished(laneId, {
        destinationId: 'youtube-primary',
        externalChannelId: 'channel-other',
        externalId: 'video-123',
        confirmedAt: Date.now(),
      }),
    /channel does not match the verified destination channel/,
  );

  assert.equal(factory.snapshot().lanes[0].stage, 'publishing');
});

test('accepts publication evidence only for the health-verified destination channel', () => {
  const { factory, laneId } = readyFactory();

  const published = factory.confirmPublished(laneId, {
    destinationId: 'youtube-primary',
    externalChannelId: 'channel-primary',
    externalId: 'video-123',
    externalUrl: 'https://www.youtube.com/watch?v=video-123',
    confirmedAt: Date.now(),
  });

  assert.equal(published.stage, 'published');
  assert.equal(published.publishEvidence?.externalChannelId, 'channel-primary');
});

test('will not begin publish when connected health lacks concrete channel identity', () => {
  const factory = new ContentFactory([
    { id: 'youtube-primary', label: 'YouTube Primary', health: 'connected' },
  ]);
  const lane = factory.createLane('Incomplete destination identity');
  factory.attachProject(lane.id, 'project-1');
  factory.attachRenderedOutput(lane.id, 'render-1');
  factory.approve(lane.id);

  const blocked = factory.beginPublish(lane.id, 'youtube-primary');
  assert.equal(blocked.stage, 'blocked');
  assert.match(blocked.blocker ?? '', /verified channel identity/);
});
