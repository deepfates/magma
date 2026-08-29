import {useEffect} from 'react';
import {Target} from 'lucide-react';
import type {useBlockRitual} from './useBlockRitual';

export function BlockAim({ritual, sessionId}: {ritual: ReturnType<typeof useBlockRitual>; sessionId: string}) {
  useEffect(() => ritual.beginSession(sessionId), [ritual.beginSession, sessionId]);
  return (
    <section className="block-aim" aria-label="Aim this focus block">
      <div className="block-aim-line"><Target size={15} /><label><span>One outcome for this focus</span><input aria-label="What are you finishing?" value={ritual.finishLine} onChange={(event) => ritual.setFinishLine(event.target.value)} maxLength={160} placeholder="What will be done when the timer ends?" /></label></div>
    </section>
  );
}
