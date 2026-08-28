import {useEffect, useState} from 'react';
import {ChevronDown, ChevronUp, Target} from 'lucide-react';
import type {useBlockRitual} from './useBlockRitual';

export function BlockAim({ritual, sessionId}: {ritual: ReturnType<typeof useBlockRitual>; sessionId: string}) {
  const [expanded, setExpanded] = useState(false);
  useEffect(() => ritual.beginSession(sessionId), [ritual.beginSession, sessionId]);
  return (
    <section className="block-aim glass" aria-label="Aim this focus block">
      <div className="block-aim-line"><Target size={15} /><label><span>Picture the finish line</span><input value={ritual.finishLine} onChange={(event) => ritual.setFinishLine(event.target.value)} maxLength={160} placeholder="What will be visibly done?" /></label><button className="icon-button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded} aria-label="Edit right now list">{expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button></div>
      {expanded && <div className="right-now-list"><strong>Right now</strong><small>Up to three physical next actions. Local and disposable.</small>{ritual.rightNow.map((item, index) => <label key={index}><span>{index + 1}</span><input value={item} onChange={(event) => ritual.setRightNow(index, event.target.value)} placeholder={index === 0 ? 'Open the file…' : 'Then…'} /></label>)}</div>}
      <div className="daily-blocks" aria-label={`${ritual.tally} blocks counted today`}><span>Today</span>{Array.from({length: Math.max(ritual.tally, 1)}, (_, index) => <i className={index < ritual.tally ? 'made' : ''} key={index} />)}<small>{ritual.tally || 'no'} {ritual.tally === 1 ? 'Block' : 'Blocks'} · resets daily</small></div>
    </section>
  );
}
