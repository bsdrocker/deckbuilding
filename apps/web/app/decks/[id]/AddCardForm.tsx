'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect } from 'react';
import { addCardsAction } from '../../actions';

export function AddCardForm({ deckId }: { deckId: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(addCardsAction.bind(null, deckId), {});

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  return (
    <form action={action} className="row wrap" style={{ gap: 8 }}>
      <input name="name" placeholder="Card name" style={{ flex: 2, minWidth: 160 }} required />
      <input name="quantity" type="number" min={1} defaultValue={1} style={{ width: 70 }} />
      <select name="board" defaultValue="mainboard">
        <option value="mainboard">Main</option>
        <option value="command">Command</option>
        <option value="sideboard">Side</option>
        <option value="maybeboard">Maybe</option>
      </select>
      <button type="submit" disabled={pending}>
        {pending ? 'Adding…' : 'Add'}
      </button>
      {state.error && <div className="error" style={{ flexBasis: '100%' }}>{state.error}</div>}
    </form>
  );
}
