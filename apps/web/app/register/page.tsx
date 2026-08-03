'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { registerAction } from '../actions';

export default function RegisterPage() {
  const [state, action, pending] = useActionState(registerAction, {});
  return (
    <div className="panel" style={{ maxWidth: 420, margin: '40px auto' }}>
      <h1>Register</h1>
      <form action={action} className="form-col">
        <input name="email" type="email" placeholder="Email" required />
        <input name="handle" type="text" placeholder="Handle" required minLength={2} />
        <input name="password" type="password" placeholder="Password (min 8 chars)" required minLength={8} />
        <button type="submit" disabled={pending}>
          {pending ? 'Creating…' : 'Create account'}
        </button>
        {state.error && <div className="error">{state.error}</div>}
      </form>
      <p className="muted" style={{ marginTop: 16 }}>
        Have an account? <Link href="/login">Log in</Link>
      </p>
    </div>
  );
}
