import {useCallback, useState} from 'react';

const STORAGE_KEY = 'magma:block-ritual';
const today = () => {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

type RitualState = {
  date: string;
  tally: number;
  aimSessionId: string;
  finishLine: string;
  rightNow: string[];
  decisions: Record<string, 'counted' | 'released'>;
};

const fresh = (decisions: RitualState['decisions'] = {}): RitualState => ({date: today(), tally: 0, aimSessionId: '', finishLine: '', rightNow: ['', '', ''], decisions});
const load = (): RitualState => {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '') as Partial<RitualState>;
    const decisions = value.decisions && typeof value.decisions === 'object' ? value.decisions : {};
    if (value.date !== today()) {
      const next = fresh(decisions);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    }
    return {
      date: today(),
      tally: Math.max(0, Number(value.tally) || 0),
      aimSessionId: String(value.aimSessionId ?? ''),
      finishLine: String(value.finishLine ?? '').slice(0, 160),
      rightNow: Array.isArray(value.rightNow) ? [...value.rightNow.slice(0, 3), '', '', ''].slice(0, 3).map((item) => String(item).slice(0, 100)) : ['', '', ''],
      decisions,
    };
  } catch {
    return fresh();
  }
};

export const useBlockRitual = () => {
  const [state, setStateValue] = useState<RitualState>(load);
  const setState = useCallback((next: RitualState | ((current: RitualState) => RitualState)) => {
    setStateValue((current) => {
      const currentDay = current.date === today() ? current : fresh();
      const value = typeof next === 'function' ? next(currentDay) : next;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
      return value;
    });
  }, []);
  const decide = useCallback((sessionId: string, decision: 'counted' | 'released') => {
    setState((current) => {
      if (current.decisions[sessionId]) return current;
      return {
        ...current,
        tally: current.tally + (decision === 'counted' ? 1 : 0),
        decisions: Object.fromEntries([...Object.entries(current.decisions), [sessionId, decision]].slice(-100)),
      };
    });
  }, [setState]);
  const beginSession = useCallback((aimSessionId: string) => {
    setState((current) => current.aimSessionId === aimSessionId ? current : {...current, aimSessionId});
  }, [setState]);
  const clearAim = useCallback(() => {
    setState((current) => ({...current, finishLine: '', rightNow: ['', '', '']}));
  }, [setState]);
  return {
    ...state,
    beginSession,
    setFinishLine: (finishLine: string) => setState((current) => ({...current, finishLine: finishLine.slice(0, 160)})),
    setRightNow: (index: number, value: string) => setState((current) => ({...current, rightNow: current.rightNow.map((item, itemIndex) => itemIndex === index ? value.slice(0, 100) : item)})),
    decide,
    clearAim,
  };
};
