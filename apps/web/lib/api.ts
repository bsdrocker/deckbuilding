import { cookies } from 'next/headers';

const BASE = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
export const API_COOKIE = 'deck_api_key';

/** Server-side fetch to the REST API, attaching the session API key cookie. */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const key = (await cookies()).get(API_COOKIE)?.value;
  return fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(key ? { authorization: `Bearer ${key}` } : {}),
      ...(init.headers ?? {}),
    },
    cache: 'no-store',
  });
}

/** GET helper that returns parsed JSON or throws with the API error message. */
export async function apiGet<T>(path: string): Promise<T> {
  const res = await apiFetch(path);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(body.message ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export async function isAuthenticated(): Promise<boolean> {
  return Boolean((await cookies()).get(API_COOKIE)?.value);
}
