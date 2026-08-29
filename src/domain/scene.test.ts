import {describe, expect, it} from 'vitest';
import {applySceneCommand, createScene, DAYLIGHT_OVERLAY, KEXP_RADIO, normalizeScene, visualSource, withVisual} from './scene';
import {TREASURE_ISLAND} from './youtube';

describe('compositional Porch scene', () => {
  it('migrates the current visual without inventing radio or overlays', () => {
    expect(normalizeScene(undefined, TREASURE_ISLAND, 123)).toEqual(createScene(TREASURE_ISLAND, 123));
  });

  it('changes each layer without disturbing the others', () => {
    const withRadio = applySceneCommand(createScene(TREASURE_ISLAND, 1), {type: 'radio', radio: KEXP_RADIO}, 2, 'ada');
    const withOverlay = applySceneCommand(withRadio, {type: 'overlays', overlays: [DAYLIGHT_OVERLAY]}, 3, 'lin');
    const nextVisual = {kind: 'video' as const, id: 'abcdefghijk', label: 'Next view'};
    const changed = withVisual(withOverlay, nextVisual, 4, 'grace');
    expect(changed).toMatchObject({radio: KEXP_RADIO, overlays: [DAYLIGHT_OVERLAY], visual: visualSource(nextVisual), revision: 3});
  });

  it('normalizes adapter declarations and rejects untrusted radio or overlays', () => {
    const corrupt = {
      ...createScene(TREASURE_ISLAND, 1),
      radio: {...KEXP_RADIO, streamUrl: 'http://insecure.example/radio'},
      overlays: [{...DAYLIGHT_OVERLAY, id: 'breaking-news'}],
    } as never;
    expect(normalizeScene(corrupt, TREASURE_ISLAND, 2)).toMatchObject({radio: null, overlays: []});
    expect(KEXP_RADIO).toMatchObject({attribution: {label: 'KEXP 90.3 FM'}, capabilities: {audio: true, live: true}, health: {state: 'unknown'}, fallback: null});
    expect(DAYLIGHT_OVERLAY).toMatchObject({attribution: {label: 'Porch'}, capabilities: {overlay: true}, health: {state: 'ready'}, fallback: null});
  });
});
