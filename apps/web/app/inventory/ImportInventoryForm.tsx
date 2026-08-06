'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { importInventoryCsvAction, importInventoryListAction } from '../actions';

interface ImportSummary {
  imported?: number;
  matchedCopies?: number;
  unresolved?: { row: number; reason: string; name?: string }[];
  error?: string;
}

export function ImportInventoryForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<'csv' | 'list'>('csv');
  const [result, setResult] = useState<ImportSummary | null>(null);
  const [list, setList] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setResult(null);
    const reader = new FileReader();
    reader.onload = () => {
      const csv = String(reader.result ?? '');
      startTransition(async () => {
        const res = await importInventoryCsvAction(csv);
        setResult(res);
        if (!res.error) router.refresh();
      });
    };
    reader.readAsText(file);
  }

  function importList() {
    setResult(null);
    startTransition(async () => {
      const res = await importInventoryListAction(list);
      setResult(res);
      if (!res.error) {
        setList('');
        router.refresh();
      }
    });
  }

  return (
    <div className="form-col" style={{ maxWidth: 520 }}>
      <div className="seg" role="tablist">
        <button type="button" className={`seg-opt ${mode === 'csv' ? 'active' : ''}`} onClick={() => setMode('csv')}>
          CSV file
        </button>
        <button type="button" className={`seg-opt ${mode === 'list' ? 'active' : ''}`} onClick={() => setMode('list')}>
          Paste list
        </button>
      </div>

      {mode === 'csv' ? (
        <>
          <p className="muted" style={{ margin: 0 }}>
            Upload a ManaBox / Moxfield / Deckbox CSV export. Rows resolve by Scryfall ID, then set + collector
            number, then card name.
          </p>
          <div className="row" style={{ gap: 8 }}>
            <input ref={inputRef} type="file" accept=".csv,text/csv" onChange={onFile} disabled={pending} />
            {pending && <span className="muted">Importing…</span>}
          </div>
        </>
      ) : (
        <>
          <p className="muted" style={{ margin: 0 }}>
            Paste a plain-text list, one card per line — e.g. <code>1 Sol Ring (C21) 263 *F*</code>. Set +
            collector number pin an exact printing; <code>*F*</code>/<code>*E*</code> mark foil/etched.
          </p>
          <textarea
            value={list}
            onChange={(e) => setList(e.target.value)}
            placeholder={'1 Sol Ring (C21) 263\n4 Llanowar Elves\n1 Arcane Signet (MOC) 288 *F*'}
            style={{ minHeight: 140 }}
            disabled={pending}
          />
          <button type="button" onClick={importList} disabled={pending || !list.trim()}>
            {pending ? 'Importing…' : 'Import list'}
          </button>
        </>
      )}

      {result && !result.error && (
        <div className="panel" style={{ background: 'var(--panel-2)' }}>
          <div className="stat">
            <span className="muted">Copies matched</span>
            <b>{result.matchedCopies ?? 0}</b>
          </div>
          <div className="stat">
            <span className="muted">Unresolved rows</span>
            <b>{result.unresolved?.length ?? 0}</b>
          </div>
          {result.unresolved && result.unresolved.length > 0 && (
            <details style={{ marginTop: 8 }}>
              <summary className="muted">Show unresolved ({result.unresolved.length})</summary>
              <ul className="card-list" style={{ marginTop: 6 }}>
                {result.unresolved.slice(0, 50).map((u) => (
                  <li key={u.row}>
                    <span>
                      Row {u.row}
                      {u.name ? ` — ${u.name}` : ''}
                    </span>
                    <span className="muted">{u.reason}</span>
                  </li>
                ))}
              </ul>
              {result.unresolved.length > 50 && (
                <p className="muted">…and {result.unresolved.length - 50} more.</p>
              )}
            </details>
          )}
        </div>
      )}
      {result?.error && <div className="error">{result.error}</div>}
    </div>
  );
}
