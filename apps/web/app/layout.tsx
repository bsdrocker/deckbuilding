import type { Metadata } from 'next';
import Link from 'next/link';
import { isAuthenticated } from '@/lib/api';
import { CardBackLogo } from '@/components/CardBackLogo';
import { logoutAction } from './actions';
import './globals.css';

export const metadata: Metadata = {
  title: 'Deckbuilding',
  description: 'API-first MTG deck building with inventory-aware AI optimization.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const authed = await isAuthenticated();
  return (
    <html lang="en">
      <body>
        <nav className="nav">
          <Link href="/" className="brand">
            <CardBackLogo size={20} /> Deckbuilding
          </Link>
          <Link href="/browse">Browse</Link>
          {authed && (
            <>
              <Link href="/decks">Decks</Link>
              <Link href="/cards">Cards</Link>
              <Link href="/inventory">Inventory</Link>
            </>
          )}
          <span className="spacer" />
          <a href="http://localhost:3001/docs" target="_blank" rel="noreferrer" className="muted">
            API docs
          </a>
          {authed ? (
            <form action={logoutAction}>
              <button className="secondary" type="submit">
                Log out
              </button>
            </form>
          ) : (
            <Link href="/login">Log in</Link>
          )}
        </nav>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
