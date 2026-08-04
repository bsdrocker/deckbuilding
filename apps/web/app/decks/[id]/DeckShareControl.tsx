'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { updateDeckAction } from '../../actions';

type Visibility = 'private' | 'unlisted' | 'public';

const OPTIONS: { value: Visibility; label: string; hint: string }[] = [
  { value: 'private', label: '🔒 Private', hint: 'Only you can see this deck.' },
  { value: 'unlisted', label: '🔗 Unlisted', hint: 'Anyone with the link can view it.' },
  { value: 'public', label: '🌐 Public', hint: 'Listed in Browse for anyone to find.' },
];

/**
 * Visibility selector + share-link copy for a deck. Unlisted/public decks expose
 * a copyable `/d/<shareId>` link; private decks show no link.
 */
export function DeckShareControl({
  deckId,
  shareId,
  visibility,
}: {
  deckId: string;
  shareId: string;
  visibility: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);

  const current = (visibility as Visibility) ?? 'private';
  const shareUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/d/${shareId}` : `/d/${shareId}`;

  const setVisibility = (next: Visibility) => {
    if (next === current) return;
    startTransition(async () => {
      await updateDeckAction(deckId, { visibility: next });
      router.refresh();
    });
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked (e.g. insecure context) — select-and-copy fallback.
      window.prompt('Copy this share link:', shareUrl);
    }
  };

  return (
    <span className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
      <select
        className="board-select"
        value={current}
        onChange={(e) => setVisibility(e.target.value as Visibility)}
        disabled={pending}
        aria-label="Deck visibility"
        title={OPTIONS.find((o) => o.value === current)?.hint}
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {current !== 'private' && (
        <button type="button" className="btn secondary" onClick={copyLink} disabled={pending} title={shareUrl}>
          {copied ? '✓ Copied' : '🔗 Copy link'}
        </button>
      )}
    </span>
  );
}
