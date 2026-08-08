import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import type { ApiKeyInfo } from '@/lib/types';
import { ApiKeysPanel } from './ApiKeysPanel';

export default async function SettingsPage() {
  const res = await apiFetch('/v1/keys');
  if (res.status === 401) redirect('/login');
  const { keys } = (await res.json()) as { keys: ApiKeyInfo[] };

  return (
    <div className="grid" style={{ gap: 24 }}>
      <div>
        <h1>Settings</h1>
        <p className="muted">Manage the API keys that authenticate the REST API and the MCP server.</p>
      </div>

      <div className="panel">
        <h2>API keys</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Use a key as a Bearer token, or as <code>DECKBUILDER_API_KEY</code> for the MCP server. A key is shown
          in full only once, when you create it.
        </p>
        <ApiKeysPanel keys={keys} />
      </div>
    </div>
  );
}
