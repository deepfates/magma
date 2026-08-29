import {describe, expect, it} from 'vitest';
import {CanvasPresenceIndex, parseCanvasPresenceClientMessage, parseCanvasPresenceServerMessage} from './canvasPresence';

const update = {
  type: 'presence.update' as const,
  pointer: {x: 42, y: 84},
  button: 'up' as const,
  selectedElementIds: ['note-1'],
  viewport: {scrollX: 10, scrollY: -20, zoom: 1.2},
  posture: 'selecting' as const,
};

describe('canvas presence', () => {
  it('bounds the ephemeral wire shape', () => {
    expect(parseCanvasPresenceClientMessage(update)).toEqual(update);
    expect(parseCanvasPresenceClientMessage({...update, selectedElementIds: Array(65).fill('x')})).toBeNull();
    expect(parseCanvasPresenceClientMessage({...update, viewport: {...update.viewport, zoom: 40}})).toBeNull();
    expect(parseCanvasPresenceClientMessage({...update, posture: 'broadcasting'})).toBeNull();
    expect(parseCanvasPresenceServerMessage({
      type: 'presence.state',
      presence: {...update, memberId: 'member_server_1', name: 'Ada', color: '#65d9c4', updatedAt: 100},
    })).toEqual({
      type: 'presence.state',
      presence: {
        pointer: update.pointer, button: update.button, selectedElementIds: update.selectedElementIds,
        viewport: update.viewport, posture: update.posture,
        memberId: 'member_server_1', name: 'Ada', color: '#65d9c4', updatedAt: 100,
      },
    });
  });

  it('binds identity on the server and ignores forged update fields', () => {
    const index = new CanvasPresenceIndex();
    index.identify('socket-a', {memberId: 'forged-member', name: 'Ada', color: '#65d9c4'}, 'member_server_1');
    const presence = index.update('socket-a', {
      ...update,
      memberId: 'member_victim', name: 'Mallory', color: '#000000',
    } as typeof update, 100);
    expect(presence).toMatchObject({memberId: 'member_server_1', name: 'Ada', color: '#65d9c4', updatedAt: 100});
  });

  it('keeps one active pointer per member and removes only ephemeral state', () => {
    const index = new CanvasPresenceIndex();
    const profile = {memberId: 'member_server_1', name: 'Ada', color: '#65d9c4'};
    index.identify('tab-a', profile, profile.memberId);
    index.identify('tab-b', profile, profile.memberId);
    index.update('tab-a', update, 100);
    index.update('tab-b', {...update, pointer: {x: 200, y: 300}}, 101);
    expect(index.snapshot()).toEqual([expect.objectContaining({memberId: profile.memberId, pointer: {x: 200, y: 300}})]);
    expect(index.leave('tab-a')).toBeNull();
    expect(index.snapshot()).toHaveLength(1);
    expect(index.leave('tab-b')).toBe(profile.memberId);
    expect(index.snapshot()).toEqual([]);
  });
});
