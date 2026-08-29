export type BlockPlan = {
  memberId: string;
  name: string;
  emoji: string;
  task: string;
  finishLine: string;
  rightNow: string[];
  updatedAt: number;
};

export type SharedBlockState = {
  revision: number;
  plans: Record<string, BlockPlan>;
};

export type BlockPlanInput = Pick<BlockPlan, 'task' | 'finishLine' | 'rightNow'>;

const clean = (value: unknown, maximum: number) =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, maximum) : '';

export const createBlockState = (): SharedBlockState => ({revision: 0, plans: {}});

export const normalizeBlockState = (value: unknown): SharedBlockState => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return createBlockState();
  const candidate = value as Partial<SharedBlockState>;
  const plans: Record<string, BlockPlan> = {};
  if (candidate.plans && typeof candidate.plans === 'object' && !Array.isArray(candidate.plans)) {
    for (const [memberId, raw] of Object.entries(candidate.plans).slice(-64)) {
      if (!/^[A-Za-z0-9_-]{8,64}$/.test(memberId) || !raw || typeof raw !== 'object') continue;
      const plan = raw as Partial<BlockPlan>;
      const task = clean(plan.task, 120);
      const finishLine = clean(plan.finishLine, 160);
      const rightNow = Array.isArray(plan.rightNow)
        ? plan.rightNow.map((item) => clean(item, 120)).filter(Boolean).slice(0, 3)
        : [];
      if (!task && !finishLine && rightNow.length === 0) continue;
      plans[memberId] = {
        memberId,
        name: clean(plan.name, 32) || 'Someone',
        emoji: clean(plan.emoji, 8) || '🫧',
        task,
        finishLine,
        rightNow,
        updatedAt: typeof plan.updatedAt === 'number' && Number.isFinite(plan.updatedAt) ? Math.max(0, plan.updatedAt) : 0,
      };
    }
  }
  return {
    revision: typeof candidate.revision === 'number' && Number.isSafeInteger(candidate.revision) && candidate.revision >= 0 ? candidate.revision : 0,
    plans,
  };
};

export const updateBlockPlan = (
  current: SharedBlockState,
  member: Pick<BlockPlan, 'memberId' | 'name' | 'emoji'>,
  input: BlockPlanInput,
  now: number,
): SharedBlockState => {
  const next = normalizeBlockState(current);
  const task = clean(input.task, 120);
  const finishLine = clean(input.finishLine, 160);
  const rightNow = input.rightNow.map((item) => clean(item, 120)).filter(Boolean).slice(0, 3);
  const plans = {...next.plans};
  if (!task && !finishLine && rightNow.length === 0) delete plans[member.memberId];
  else plans[member.memberId] = {...member, task, finishLine, rightNow, updatedAt: now};
  return {revision: next.revision + 1, plans};
};
