import {describe, expect, it} from 'vitest';
import {applyMediaCommand, createMediaState, mediaPositionAt, normalizeMediaState} from './media';

describe('shared media protocol', () => {
  it('derives playback position from the server epoch', () => {
    const media = applyMediaCommand(createMediaState(1_000), {type: 'play', positionSeconds: 12, playlistIndex: 0}, 2_000, 'host');
    expect(mediaPositionAt(media, 7_500)).toBe(17.5);
    expect(mediaPositionAt({...media, status: 'paused'}, 99_000)).toBe(12);
  });

  it('changes source as one revision and restarts playback', () => {
    const current = {...createMediaState(1_000), revision: 7, status: 'paused' as const, positionSeconds: 42};
    const source = {kind: 'playlist' as const, id: 'PL1234567890abc', label: 'Room playlist'};
    expect(applyMediaCommand(current, {type: 'source', source}, 2_000, 'member')).toMatchObject({source, status: 'playing', positionSeconds: 0, playlistIndex: 0, revision: 8, controllerId: 'member'});
  });

  it('normalizes corrupt persisted state to the default', () => {
    expect(normalizeMediaState(undefined, 123)).toMatchObject({source: {id: 'BSWhGNXxT9A'}, changedAt: 123, status: 'playing'});
  });
});
