'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { loginAction } from '../actions';

export default function LoginPage() {
  const [state, action, pending] = useActionState(loginAction, {});
  return (
    <div className="panel" style={{ maxWidth: 420, margin: '40px auto' }}>
      <h1>Log in</h1>
      <p className="muted">Use your Deckbuilding account, or the seeded demo user.</p>
      <form action={action} className="form-col">
        <input name="email" type="email" placeholder="Email" defaultValue="demo@deckbuilding.local" required />
        <input name="password" type="password" placeholder="Password" required />
        <button type="submit" disabled={pending}>
          {pending ? 'Signing in…' : 'Log in'}
        </button>
        {state.error && <div className="error">{state.error}</div>}
      </form>
      <p className="muted" style={{ marginTop: 16 }}>
        No account? <Link href="/register">Register</Link>
      </p>
    </div>
  );
}
