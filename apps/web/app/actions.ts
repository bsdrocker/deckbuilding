'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { API_COOKIE, apiFetch } from '@/lib/api';

const BASE = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

async function storeKey(apiKey: string) {
  (await cookies()).set(API_COOKIE, apiKey, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function loginAction(_prev: unknown, formData: FormData): Promise<{ error?: string }> {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');
  const res = await fetch(`${BASE}/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return { error: body.message ?? 'Login failed' };
  }
  const body = await res.json();
  await storeKey(body.apiKey);
  redirect('/decks');
}

export async function registerAction(_prev: unknown, formData: FormData): Promise<{ error?: string }> {
  const email = String(formData.get('email') ?? '');
  const handle = String(formData.get('handle') ?? '');
  const password = String(formData.get('password') ?? '');
  const res = await fetch(`${BASE}/v1/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, handle, password }),
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return { error: body.message ?? 'Registration failed' };
  }
  const body = await res.json();
  await storeKey(body.apiKey);
  redirect('/decks');
}

export async function logoutAction() {
  (await cookies()).delete(API_COOKIE);
  redirect('/login');
}

export async function createDeckAction(_prev: unknown, formData: FormData): Promise<{ error?: string }> {
  const name = String(formData.get('name') ?? '');
  const format = String(formData.get('format') ?? 'commander');
  const res = await apiFetch('/v1/decks', { method: 'POST', body: JSON.stringify({ name, format }) });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return { error: body.message ?? 'Could not create deck' };
  }
  const deck = await res.json();
  redirect(`/decks/${deck.id}`);
}

export async function importDeckAction(_prev: unknown, formData: FormData): Promise<{ error?: string }> {
  const name = String(formData.get('name') ?? '');
  const format = String(formData.get('format') ?? 'commander');
  const list = String(formData.get('list') ?? '');
  const res = await apiFetch('/v1/decks/import', {
    method: 'POST',
    body: JSON.stringify({ name, format, list }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return { error: body.message ?? 'Import failed' };
  }
  const result = await res.json();
  redirect(`/decks/${result.deckId}`);
}

export async function addInventoryByNameAction(
  _prev: unknown,
  formData: FormData,
): Promise<{ error?: string; ok?: boolean; message?: string }> {
  const name = String(formData.get('name') ?? '');
  const quantity = Number(formData.get('quantity') ?? 1);
  const finish = String(formData.get('finish') ?? 'nonfoil');
  if (!name.trim()) return { error: 'Enter a card name' };

  // Resolve the card to a representative printing (most recent), then add it.
  const cardRes = await apiFetch(`/v1/cards/named?name=${encodeURIComponent(name)}`);
  if (!cardRes.ok) return { error: `Card not found: ${name}` };
  const card = await cardRes.json();
  const printingId = card.printings?.[0]?.scryfallId;
  if (!printingId) return { error: `No printing found for ${card.name}` };

  const res = await apiFetch('/v1/inventory', {
    method: 'POST',
    body: JSON.stringify({ printingId, quantity, finish }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return { error: body.message ?? 'Could not add to inventory' };
  }
  return { ok: true, message: `Added ${quantity}× ${card.name}` };
}

export async function addCardsAction(deckId: string, _prev: unknown, formData: FormData): Promise<{ error?: string; ok?: boolean }> {
  const name = String(formData.get('name') ?? '');
  const quantity = Number(formData.get('quantity') ?? 1);
  const board = String(formData.get('board') ?? 'mainboard');
  if (!name.trim()) return { error: 'Enter a card name' };
  const res = await apiFetch(`/v1/decks/${deckId}/cards`, {
    method: 'POST',
    body: JSON.stringify({ cards: [{ name, quantity, board }] }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return { error: body.message ?? 'Could not add card' };
  }
  const result = await res.json();
  if (result.unresolved?.length) return { error: `Could not find: ${result.unresolved.join(', ')}` };
  return { ok: true };
}
