'use client';
import { FormEvent, useState } from 'react';
import { useAuth } from '@/components/Auth';
import { IconCheck, IconLock, IconPhone, IconSmartphone, IconUser } from '@/components/Icons';
import { InstallSheet } from '@/components/InstallPrompt';
import { Notice } from '@/components/ui';
import { BrandLogo, useBrand } from '@/lib/brand';
import { ThemeToggle } from '@/lib/theme';

export default function LoginPage() {
  const { signIn, signUp } = useAuth();
  const { brand } = useBrand();
  const isCardMode = brand.app_mode === 'card';
  const appTitle = isCardMode ? (brand.card_name || 'ZeCard Info') : brand.name;

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [position, setPosition] = useState('');

  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [install, setInstall] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (mode === 'login') {
      if (!username.trim() || !password) {
        setError('Please enter your username and password.');
        return;
      }
      setBusy(true);
      try {
        await signIn(username.trim(), password);
      } catch (err: any) {
        setError(err.message || 'Wrong username or password');
        setBusy(false);
      }
    } else {
      if (!fullName.trim()) {
        setError('Please enter your full name as it should appear on your business card.');
        return;
      }
      if (!email.trim() || !email.includes('@')) {
        setError('Please enter a valid work email address.');
        return;
      }
      if (!username.trim() || username.trim().length < 3) {
        setError('Username must be at least 3 characters.');
        return;
      }
      if (!password || password.length < 6) {
        setError('Password must be at least 6 characters.');
        return;
      }
      setBusy(true);
      try {
        await signUp({
          name: fullName.trim(),
          username: username.trim(),
          password,
          email: email.trim(),
          phone: phone.trim() || undefined,
          positions: position.trim() ? [position.trim()] : ['Staff Member'],
        });
      } catch (err: any) {
        setError(err.message || 'Could not register');
        setBusy(false);
      }
    }
  }

  return (
    <main className="login">
      <div className="login-theme">
        <ThemeToggle />
      </div>

      <div className="login-card" style={{ maxWidth: 450 }}>
        <div className="login-logo">
          <BrandLogo size={68} radius={20} />
        </div>
        <h1>{appTitle}</h1>
        <p className="muted" style={{ fontSize: '0.95rem', marginTop: 4 }}>
          {isCardMode
            ? mode === 'register'
              ? 'Register your profile to submit your business card & ID information.'
              : 'Sign in to review and approve your business card design.'
            : 'Sign in to see your schedule.'}
        </p>

        {/* Tab switch between Sign In and Register */}
        <div
          style={{
            display: 'flex',
            gap: 6,
            margin: '18px 0 16px',
            background: 'var(--bg-subtle, rgba(0,0,0,0.05))',
            padding: 4,
            borderRadius: 12,
          }}
        >
          <button
            type="button"
            className={`btn btn-block ${mode === 'login' ? 'btn-primary' : 'btn-ghost'}`}
            style={{
              flex: 1,
              padding: '9px 14px',
              fontSize: '0.92rem',
              fontWeight: mode === 'login' ? 600 : 500,
              borderRadius: 9,
            }}
            onClick={() => {
              setMode('login');
              setError(null);
            }}
          >
            Sign in
          </button>
          <button
            type="button"
            className={`btn btn-block ${mode === 'register' ? 'btn-primary' : 'btn-ghost'}`}
            style={{
              flex: 1,
              padding: '9px 14px',
              fontSize: '0.92rem',
              fontWeight: mode === 'register' ? 600 : 500,
              borderRadius: 9,
            }}
            onClick={() => {
              setMode('register');
              setError(null);
            }}
          >
            Register Staff
          </button>
        </div>

        <form onSubmit={onSubmit} noValidate>
          {error && <Notice kind="error">{error}</Notice>}

          {mode === 'register' && (
            <>
              <label className="field">
                <span className="label">Full Name *</span>
                <span className="input-icon">
                  <IconUser />
                  <input
                    className="input"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Full name (printed on card)"
                    required
                  />
                </span>
              </label>

              <label className="field">
                <span className="label">Work Email *</span>
                <input
                  className="input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  required
                />
              </label>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <label className="field">
                  <span className="label">Phone Number</span>
                  <input
                    className="input"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+251 91 123 4567"
                  />
                </label>
                <label className="field">
                  <span className="label">Job Title / Role</span>
                  <input
                    className="input"
                    value={position}
                    onChange={(e) => setPosition(e.target.value)}
                    placeholder="e.g. Sales Consultant"
                  />
                </label>
              </div>
            </>
          )}

          <label className="field">
            <span className="label">Username *</span>
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
                placeholder="Choose your username"
                required
              />
            </span>
          </label>

          <label className="field">
            <span className="label">Password *</span>
            <span className="input-icon">
              <IconLock />
              <input
                className="input"
                type={show ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                placeholder={mode === 'login' ? 'Your password' : 'At least 6 characters'}
                style={{ paddingRight: 72 }}
                required
              />
              <button type="button" className="input-toggle" onClick={() => setShow((s) => !s)}>
                {show ? 'Hide' : 'Show'}
              </button>
            </span>
          </label>

          <button className="btn btn-primary btn-block btn-lg" disabled={busy} type="submit" style={{ marginTop: 12 }}>
            {busy
              ? mode === 'login'
                ? 'Signing in…'
                : 'Creating account…'
              : mode === 'login'
              ? 'Sign in'
              : 'Create Account & Start Card'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 14 }}>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, opacity: 0.85 }}
            onClick={() => setInstall(true)}
          >
            <IconSmartphone style={{ width: 16, height: 16 }} />
            <span>Install on iPhone or Android</span>
          </button>
        </div>

        <p className="faint small login-foot" style={{ marginTop: 16 }}>
          {isCardMode
            ? mode === 'login'
              ? 'New staff member? Click "Register Staff" above to submit your details.'
              : 'Already have an account? Click "Sign in" above.'
            : mode === 'login'
            ? 'Need an account? Contact your administrator.'
            : 'Already registered? Switch to "Sign in" above.'}
        </p>
      </div>

      <p className="faint small login-copy">
        © {new Date().getFullYear()} {appTitle}
      </p>

      {install && <InstallSheet onClose={() => setInstall(false)} />}
    </main>
  );
}
