'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useState } from 'react';
import { addCardsAction } from '../../actions';
import { CardAutocomplete } from './CardAutocomplete';

export function AddCardForm({ deckId }: { deckId: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(addCardsAction.bind(null, deckId), {});
  // Bumped on each successful add so the name field clears and refocuses.
  const [clearToken, setClearToken] = useState(0);

  useEffect(() => {
    if (state.ok) {
      router.refresh();
      setClearToken((n) => n + 1);
    }
  }, [state, router]);

  return (
    <form action={action} className="row wrap" style={{ gap: 8 }}>
      <CardAutocomplete name="name" placeholder="Card name" style={{ flex: 2, minWidth: 160 }} clearToken={clearToken} />
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
