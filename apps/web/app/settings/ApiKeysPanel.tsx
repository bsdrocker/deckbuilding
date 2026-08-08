'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { ApiKeyInfo } from '@/lib/types';
import { createApiKeyAction, revokeApiKeyAction } from '../actions';

function fmtDate(s: string | null): string {
  return s ? new Date(s).toLocaleDateString() : '—';
}

export function ApiKeysPanel({ keys }: { keys: ApiKeyInfo[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  // The full key is shown only once, right after creation.
  const [created, setCreated] = useState<{ raw: string; name: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const create = () => {
    setError(null);
    setCreated(null);
    startTransition(async () => {
      const res = await createApiKeyAction(name);
      if (res.error || !res.raw) {
        setError(res.error ?? 'Could not create key');
        return;
      }
      setCreated({ raw: res.raw, name: name.trim() });
      setName('');
      router.refresh();
    });
  };

  const revoke = (id: string) => {
    setError(null);
    startTransition(async () => {
      const res = await revokeApiKeyAction(id);
      if (res.error) setError(res.error);
      else {
        setConfirmId(null);
        router.refresh();
      }
    });
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt('Copy this API key:', text);
    }
  };

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="row wrap" style={{ gap: 8, alignItems: 'flex-end' }}>
        <label className="field-label">
          New key name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && create()}
            placeholder="e.g. laptop-mcp"
            maxLength={60}
            style={{ minWidth: 220 }}
          />
        </label>
        <button type="button" onClick={create} disabled={pending || !name.trim()}>
          {pending ? 'Creating…' : 'Create key'}
        </button>
      </div>

      {created && (
        <div className="panel key-reveal">
          <b>New key “{created.name}” — copy it now; it won’t be shown again.</b>
          <div className="row" style={{ gap: 8, marginTop: 8 }}>
            <code className="key-value">{created.raw}</code>
            <button type="button" className="secondary" onClick={() => copy(created.raw)}>
              {copied ? '✓ Copied' : 'Copy'}
            </button>
            <button type="button" className="secondary" onClick={() => setCreated(null)}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      {error && <div className="error">{error}</div>}

      {keys.length === 0 ? (
        <p className="muted">No API keys yet.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Key</th>
              <th>Scopes</th>
              <th>Last used</th>
              <th>Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k.id} style={{ opacity: pending ? 0.6 : 1 }}>
                <td>{k.name}</td>
                <td className="muted"><code>{k.prefix}…</code></td>
                <td className="muted">{k.scopes.join(', ')}</td>
                <td className="muted">{fmtDate(k.lastUsedAt)}</td>
                <td className="muted">{fmtDate(k.createdAt)}</td>
                <td style={{ textAlign: 'right' }}>
                  {confirmId === k.id ? (
                    <span className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                      <span className="muted" style={{ fontSize: 12 }}>Revoke?</span>
                      <button type="button" className="btn danger" onClick={() => revoke(k.id)} disabled={pending}>
                        Yes
                      </button>
                      <button type="button" className="btn secondary" onClick={() => setConfirmId(null)} disabled={pending}>
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button type="button" className="btn danger" onClick={() => setConfirmId(k.id)} disabled={pending}>
                      Revoke
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
