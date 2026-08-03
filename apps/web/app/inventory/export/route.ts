import { apiFetch } from '@/lib/api';

/**
 * Proxy the API's CSV export through the web app so the browser download
 * carries the session cookie (the API itself expects a Bearer token).
 */
export async function GET() {
  const res = await apiFetch('/v1/inventory/export.csv');
  if (!res.ok) {
    return new Response('Export failed. Are you logged in?', { status: res.status });
  }
  const csv = await res.text();
  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="collection.csv"',
    },
  });
}
