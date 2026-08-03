'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect } from 'react';
import { addInventoryByNameAction } from '../actions';

export function AddInventoryForm() {
  const router = useRouter();
  const [state, action, pending] = useActionState(addInventoryByNameAction, {});

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  return (
    <form action={action} className="row wrap" style={{ gap: 8 }}>
      <input name="name" placeholder="Card name (adds latest printing)" style={{ flex: 2, minWidth: 180 }} required />
      <input name="quantity" type="number" min={1} defaultValue={1} style={{ width: 70 }} />
      <select name="finish" defaultValue="nonfoil">
        <option value="nonfoil">Nonfoil</option>
        <option value="foil">Foil</option>
        <option value="etched">Etched</option>
      </select>
      <button type="submit" disabled={pending}>
        {pending ? 'Adding…' : 'Add'}
      </button>
      {state.error && <div className="error" style={{ flexBasis: '100%' }}>{state.error}</div>}
      {state.ok && <div style={{ flexBasis: '100%', color: 'var(--accent-2)' }}>{state.message}</div>}
    </form>
  );
}
