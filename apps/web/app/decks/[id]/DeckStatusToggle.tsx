'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import type { DeckStatus } from '@/lib/types';
import { updateDeckAction } from '../../actions';

export function DeckStatusToggle({ deckId, status }: { deckId: string; status: DeckStatus }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function setStatus(next: DeckStatus) {
    if (next === status) return;
    startTransition(async () => {
      await updateDeckAction(deckId, { status: next });
      router.refresh();
    });
  }

  return (
    <span className="status-toggle" title="Brewing = a list you're considering. Built = physically assembled (draws from inventory).">
      {(['brewing', 'built'] as const).map((s) => (
        <button
          key={s}
          type="button"
          className={`status-opt ${status === s ? 'active' : ''} ${s}`}
          onClick={() => setStatus(s)}
          disabled={pending}
        >
          {s === 'brewing' ? '🧪 Brewing' : '🔨 Built'}
        </button>
      ))}
    </span>
  );
}
