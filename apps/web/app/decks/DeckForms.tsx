'use client';

import { useActionState, useState } from 'react';
import { createDeckAction, importDeckAction } from '../actions';

const FORMATS = ['commander', 'standard', 'modern', 'pioneer', 'pauper', 'legacy', 'vintage', 'brawl', 'casual'];

export function DeckForms() {
  const [tab, setTab] = useState<'new' | 'import'>('new');
  const [createState, createFormAction, creating] = useActionState(createDeckAction, {});
  const [importState, importFormAction, importing] = useActionState(importDeckAction, {});

  return (
    <div className="panel">
      <div className="row" style={{ gap: 8, marginBottom: 12 }}>
        <button className={tab === 'new' ? '' : 'secondary'} onClick={() => setTab('new')} type="button">
          New deck
        </button>
        <button className={tab === 'import' ? '' : 'secondary'} onClick={() => setTab('import')} type="button">
          Import list
        </button>
      </div>

      {tab === 'new' ? (
        <form action={createFormAction} className="form-col">
          <input name="name" placeholder="Deck name" required />
          <select name="format" defaultValue="commander">
            {FORMATS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <button type="submit" disabled={creating}>
            {creating ? 'Creating…' : 'Create deck'}
          </button>
          {createState.error && <div className="error">{createState.error}</div>}
        </form>
      ) : (
        <form action={importFormAction} className="form-col" style={{ maxWidth: 520 }}>
          <input name="name" placeholder="Deck name" required />
          <select name="format" defaultValue="commander">
            {FORMATS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <textarea
            name="list"
            placeholder={'Commander\n1 Krenko, Mob Boss\n\nDeck\n1 Sol Ring\n30 Mountain'}
            required
          />
          <button type="submit" disabled={importing}>
            {importing ? 'Importing…' : 'Import'}
          </button>
          {importState.error && <div className="error">{importState.error}</div>}
        </form>
      )}
    </div>
  );
}
