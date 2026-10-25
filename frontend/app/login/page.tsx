'use client';
import { FormEvent, useState } from 'react';
import { useAuth } from '@/components/Auth';
import { IconLock, IconUser } from '@/components/Icons';
import { Notice } from '@/components/ui';
import { BrandLogo, useBrand } from '@/lib/brand';
import { ThemeToggle } from '@/lib/theme';

export default function LoginPage() {
  const { signIn } = useAuth();
  const { brand } = useBrand();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Enter your username and password.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signIn(username, password);
    } catch (err: any) {
      setError(err.message || 'Could not sign in');
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <div className="login-theme">
        <ThemeToggle />
      </div>

      <div className="login-card">
        <div className="login-logo">
          <BrandLogo size={68} radius={20} />
        </div>
        <h1>{brand.name}</h1>
        <p className="muted">Sign in to see your schedule.</p>

        <form onSubmit={onSubmit} noValidate>
          {error && <Notice kind="error">{error}</Notice>}
          <label className="field">
            <span className="label">Username</span>
            <span className="input-icon">
              <IconUser />
              <input
                className="input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="Your username"
              />
            </span>
          </label>
          <label className="field">
            <span className="label">Password</span>
            <span className="input-icon">
              <IconLock />
              <input
                className="input"
                type={show ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="Your password"
                style={{ paddingRight: 72 }}
              />
              <button type="button" className="input-toggle" onClick={() => setShow((s) => !s)}>
                {show ? 'Hide' : 'Show'}
              </button>
            </span>
          </label>
          <button className="btn btn-primary btn-block btn-lg" disabled={busy} type="submit">
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="faint small login-foot">Your admin creates your account. Forgot your password? Ask your admin to reset it.</p>
      </div>

      <p className="faint small login-copy">
        © {new Date().getFullYear()} {brand.name}
      </p>
    </main>
  );
}
