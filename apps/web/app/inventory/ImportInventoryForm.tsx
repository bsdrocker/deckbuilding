'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { importInventoryCsvAction } from '../actions';

interface ImportSummary {
  imported?: number;
  matchedCopies?: number;
  unresolved?: { row: number; reason: string; name?: string }[];
  error?: string;
}

export function ImportInventoryForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ImportSummary | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
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

  return (
    <div className="form-col" style={{ maxWidth: 520 }}>
      <p className="muted" style={{ margin: 0 }}>
        Upload a ManaBox / Moxfield / Deckbox CSV export. Rows resolve by Scryfall ID, then set + collector
        number, then card name.
      </p>
      <div className="row" style={{ gap: 8 }}>
        <input ref={inputRef} type="file" accept=".csv,text/csv" onChange={onFile} disabled={pending} />
        {pending && <span className="muted">Importing…</span>}
      </div>

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
