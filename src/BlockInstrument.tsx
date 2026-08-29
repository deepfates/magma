import {Check, Minus, Play, Plus, RotateCcw, X} from 'lucide-react';
import {useEffect, useState} from 'react';
import type {BlockPlan, BlockPlanInput, SharedBlockState} from './domain/block';
import type {Profile, SessionArtifact} from './domain/protocol';
import type {TimerState} from './domain/timer';

type Props = {
  open: boolean;
  block: SharedBlockState;
  profile: Profile;
  timer: TimerState;
  completion: SessionArtifact | null;
  onClose: () => void;
  onSave: (plan: BlockPlanInput) => void;
  onStart: () => void;
  onAfter: (action: 'break' | 'repeat' | 'prepare') => void;
  onDismissCompletion: () => void;
};

const emptyPlan = (): BlockPlanInput => ({task: '', finishLine: '', rightNow: ['']});
const editable = (plan?: BlockPlan): BlockPlanInput => plan
  ? {task: plan.task, finishLine: plan.finishLine, rightNow: plan.rightNow.length ? plan.rightNow : ['']}
  : emptyPlan();

export function BlockInstrument({open, block, profile, timer, completion, onClose, onSave, onStart, onAfter, onDismissCompletion}: Props) {
  const ownPlan = block.plans[profile.memberId];
  const [draft, setDraft] = useState<BlockPlanInput>(() => editable(ownPlan));
  useEffect(() => { if (open) setDraft(editable(ownPlan)); }, [open, ownPlan?.updatedAt]);
  const setAction = (index: number, value: string) => setDraft((current) => ({
    ...current, rightNow: current.rightNow.map((item, itemIndex) => itemIndex === index ? value : item),
  }));
  const save = () => onSave({...draft, rightNow: draft.rightNow.filter((item) => item.trim())});
  const saveAndStart = () => { save(); onStart(); };

  if (completion) return <section className="block-completion" role="dialog" aria-labelledby="block-complete-title">
    <button className="block-close" aria-label="Dismiss completed Block" onClick={onDismissCompletion}><X size={17} /></button>
    <span className="block-stamp"><Check size={24} strokeWidth={2.4} /></span>
    <small>BLOCK COMPLETE</small>
    <h2 id="block-complete-title">You reached the bell.</h2>
    <p>{ownPlan?.finishLine || ownPlan?.task || 'The time is marked. Nothing else is required.'}</p>
    <div className="block-next-actions">
      <button onClick={() => { if (timer.mode === 'focus' || timer.status !== 'running') onAfter('break'); onDismissCompletion(); }}>Take a break</button>
      <button onClick={() => { onAfter('repeat'); onDismissCompletion(); }}><RotateCcw size={14} /> Repeat</button>
      <button onClick={() => { onAfter('prepare'); onDismissCompletion(); }}>Prepare next</button>
    </div>
  </section>;

  if (!open) return null;
  const others = Object.values(block.plans).filter((plan) => plan.memberId !== profile.memberId);
  return <aside className="block-instrument" aria-label="Prepare a shared Block">
    <div className="block-heading"><div><small>THE BLOCK</small><h2>What are you sitting down to do?</h2></div><button onClick={onClose} aria-label="Close Block"><X size={18} /></button></div>
    <label>One thing<input autoFocus value={draft.task} maxLength={120} onChange={(event) => setDraft({...draft, task: event.target.value})} placeholder="Draft the opening, fix the leak…" /></label>
    <label>Finish line<input value={draft.finishLine} maxLength={160} onChange={(event) => setDraft({...draft, finishLine: event.target.value})} placeholder="What would be enough for this Block?" /></label>
    <fieldset><legend>Right Now <span>up to three disposable next moves</span></legend>
      {draft.rightNow.map((item, index) => <div key={index}><input aria-label={`Right Now ${index + 1}`} value={item} maxLength={120} onChange={(event) => setAction(index, event.target.value)} placeholder={index === 0 ? 'The first physical action' : 'Another next move'} />{draft.rightNow.length > 1 && <button aria-label={`Remove Right Now ${index + 1}`} onClick={() => setDraft({...draft, rightNow: draft.rightNow.filter((_, itemIndex) => itemIndex !== index)})}><Minus size={14} /></button>}</div>)}
      {draft.rightNow.length < 3 && <button className="block-add" onClick={() => setDraft({...draft, rightNow: [...draft.rightNow, '']})}><Plus size={14} /> Add a move</button>}
    </fieldset>
    <div className="block-actions"><button onClick={save}>Set it here</button><button onClick={saveAndStart}><Play size={14} fill="currentColor" /> Start {Math.round(timer.durations.focus / 60_000)} minutes</button></div>
    {others.length > 0 && <section className="block-company"><small>SITTING WITH YOU</small>{others.map((plan) => <div key={plan.memberId}><span>{plan.emoji}</span><p><strong>{plan.name}</strong><small>{plan.task || plan.finishLine || plan.rightNow[0]}</small></p></div>)}</section>}
    <p className="block-note">This list belongs to this moment. Clear it, replace it, or leave it behind.</p>
  </aside>;
}
