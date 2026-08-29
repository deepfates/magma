import {describe, expect, it} from 'vitest';
import {createBlockState, normalizeBlockState, updateBlockPlan} from './block';

describe('shared Block', () => {
  it('keeps one disposable plan per person and only three Right Now actions', () => {
    const next = updateBlockPlan(createBlockState(), {memberId: 'member-123', name: 'Ada', emoji: '🌉'}, {
      task: '  Draft   the note ', finishLine: 'A readable first pass', rightNow: ['Open draft', 'Write lead', 'Read once', 'Publish'],
    }, 2_000);
    expect(next).toEqual({revision: 1, plans: {'member-123': {
      memberId: 'member-123', name: 'Ada', emoji: '🌉', task: 'Draft the note', finishLine: 'A readable first pass',
      rightNow: ['Open draft', 'Write lead', 'Read once'], updatedAt: 2_000,
    }}});
  });

  it('clears a plan instead of retaining an empty task record', () => {
    const current = updateBlockPlan(createBlockState(), {memberId: 'member-123', name: 'Ada', emoji: '🌉'}, {
      task: 'Draft', finishLine: '', rightNow: [],
    }, 1_000);
    expect(updateBlockPlan(current, {memberId: 'member-123', name: 'Ada', emoji: '🌉'}, {
      task: '', finishLine: '', rightNow: [],
    }, 2_000)).toEqual({revision: 2, plans: {}});
  });

  it('normalizes malformed persisted plans without inventing required work', () => {
    expect(normalizeBlockState({revision: -1, plans: {'bad id': {task: 'x'}, 'member-123': {
      name: 'Ada', emoji: '🌉', task: '', finishLine: '', rightNow: [], updatedAt: 3,
    }}})).toEqual({revision: 0, plans: {}});
  });
});
