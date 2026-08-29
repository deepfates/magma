import {describe, expect, it} from 'vitest';
import {
  canArrangeQueue, createMediaQueue, enqueueMedia, moveMedia, normalizeMediaQueue,
  releaseHeldMedia, removeMedia, selectMedia, setDeckPolicy,
} from './mediaQueue';
import {TREASURE_ISLAND} from './youtube';

const source = (id: string) => ({kind: 'video' as const, id, label: `Source ${id}`});
const item = (id: string, addedAt = 1) => ({
  id: `mq_${id}`, source: source(id.padEnd(11, 'x')), addedById: 'member-one', addedByName: 'Ada',
  addedByEmoji: '🫧', addedAt, sequence: addedAt, origin: 'member' as const, heldForSessionId: null,
});

describe('server-authoritative listening queue', () => {
  it('serializes independent enqueues in accepted server order', () => {
    const initial = createMediaQueue(TREASURE_ISLAND, 0);
    const first = enqueueMedia(initial, item('firstitem'), false, false)!;
    const second = enqueueMedia(first, item('secondit', 2), false, false)!;
    expect(second.items.map(({id}) => id)).toEqual(['mq_room_default', 'mq_firstitem', 'mq_secondit']);
    expect(second.revision).toBe(2);
  });

  it('stages disruptive selection on the Floor and activates it exactly at the boundary', () => {
    const queued = enqueueMedia(createMediaQueue(TREASURE_ISLAND, 0), item('nextitem'), false, false)!;
    const staged = selectMedia(queued, 'mq_nextitem', true)!;
    expect(staged).toMatchObject({activeItemId: 'mq_room_default', stagedItemId: 'mq_nextitem'});
    const active = releaseHeldMedia(staged, 'focus-one');
    expect(active).toMatchObject({activeItemId: 'mq_nextitem', stagedItemId: null});
    expect(releaseHeldMedia(active, 'focus-one')).toBe(active);
  });

  it('moves deterministically and refuses active or staged removal', () => {
    let queue = enqueueMedia(createMediaQueue(TREASURE_ISLAND, 0), item('secondit'), false, false)!;
    queue = enqueueMedia(queue, item('thirditem', 2), false, false)!;
    expect(moveMedia(queue, 'mq_thirditem', 'mq_secondit')!.items.map(({id}) => id))
      .toEqual(['mq_room_default', 'mq_thirditem', 'mq_secondit']);
    expect(removeMedia(queue, queue.activeItemId)).toBeNull();
    const staged = selectMedia(queue, 'mq_secondit', true)!;
    expect(removeMedia(staged, 'mq_secondit')).toBeNull();
  });

  it('lets every person arrange the shared background', () => {
    expect(canArrangeQueue('member', 'open')).toBe(true);
    expect(canArrangeQueue('member', 'stewarded')).toBe(true);
    expect(canArrangeQueue('steward', 'stewarded')).toBe(true);
    expect(canArrangeQueue('guest', 'stewarded')).toBe(true);
    expect(setDeckPolicy(createMediaQueue(TREASURE_ISLAND), 'stewarded').policy).toBe('stewarded');
  });

  it('normalizes malformed persistence without losing a usable active item', () => {
    expect(normalizeMediaQueue({version: 1, items: [], activeItemId: 'missing', stagedItemId: null, policy: 'open', revision: 9}, TREASURE_ISLAND, 4))
      .toMatchObject({activeItemId: 'mq_room_default', revision: 0});
  });
});
