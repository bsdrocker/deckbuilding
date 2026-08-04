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

export interface DeckCardPatch {
  quantity?: number;
  board?: string;
  printingId?: string | null;
  categories?: string[];
}

export async function updateDeckCardAction(
  deckId: string,
  cardId: string,
  patch: DeckCardPatch,
): Promise<{ error?: string; ok?: boolean }> {
  const res = await apiFetch(`/v1/decks/${deckId}/cards/${cardId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return { error: body.message ?? 'Update failed' };
  }
  return { ok: true };
}

export async function removeDeckCardAction(
  deckId: string,
  cardId: string,
): Promise<{ error?: string; ok?: boolean }> {
  const res = await apiFetch(`/v1/decks/${deckId}/cards/${cardId}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 204) {
    const body = await res.json().catch(() => ({}));
    return { error: body.message ?? 'Remove failed' };
  }
  return { ok: true };
}

export interface PrintingOption {
  scryfallId: string;
  setCode: string;
  setName: string;
  collectorNumber: string;
  rarity: string;
  finishes: string[];
  imageUris: { normal?: string; small?: string } | null;
}

/** Look up printings for a card by name (exact then fuzzy). */
export async function findPrintingsByNameAction(
  name: string,
): Promise<{ error?: string; oracleId?: string; name?: string; printings?: PrintingOption[] }> {
  if (!name.trim()) return { error: 'Enter a card name' };
  const res = await apiFetch(`/v1/cards/named?name=${encodeURIComponent(name)}`);
  if (!res.ok) return { error: `Card not found: ${name}` };
  const card = await res.json();
  return { oracleId: card.oracleId, name: card.name, printings: card.printings ?? [] };
}

/** Look up printings for a card by oracle id (for the deck preferred-art picker). */
export async function findPrintingsForOracleAction(
  oracleId: string,
): Promise<{ error?: string; printings?: PrintingOption[] }> {
  const res = await apiFetch(`/v1/cards/${oracleId}`);
  if (!res.ok) return { error: 'Could not load printings' };
  const card = await res.json();
  return { printings: card.printings ?? [] };
}

export async function addInventoryDetailedAction(input: {
  printingId: string;
  quantity: number;
  finish: string;
  condition: string;
  language: string;
}): Promise<{ error?: string; ok?: boolean }> {
  const res = await apiFetch('/v1/inventory', { method: 'POST', body: JSON.stringify(input) });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return { error: body.message ?? 'Could not add to inventory' };
  }
  return { ok: true };
}

export async function updateInventoryAction(
  id: string,
  patch: { quantity?: number; finish?: string; condition?: string; language?: string; printingId?: string },
): Promise<{ error?: string; ok?: boolean }> {
  const res = await apiFetch(`/v1/inventory/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return { error: body.message ?? 'Update failed' };
  }
  return { ok: true };
}

export async function deleteInventoryAction(id: string): Promise<{ error?: string; ok?: boolean }> {
  const res = await apiFetch(`/v1/inventory/${id}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 204) {
    const body = await res.json().catch(() => ({}));
    return { error: body.message ?? 'Delete failed' };
  }
  return { ok: true };
}

export async function importInventoryCsvAction(
  csv: string,
): Promise<{ error?: string; imported?: number; matchedCopies?: number; unresolved?: { row: number; reason: string }[] }> {
  if (!csv.trim()) return { error: 'Empty file' };
  const res = await apiFetch('/v1/inventory/import', { method: 'POST', body: JSON.stringify({ csv }) });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return { error: body.message ?? 'Import failed' };
  }
  return res.json();
}
