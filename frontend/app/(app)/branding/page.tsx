'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChangeEvent, CSSProperties, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/components/Auth';
import { IconCheck, IconChevronL, IconImage, IconUpload } from '@/components/Icons';
import { Notice, useToast } from '@/components/ui';
import { api } from '@/lib/api';
import { BrandLogo, DEFAULT_BRAND, useBrand } from '@/lib/brand';

const PRESETS = ['#1a56db', '#0b5fff', '#2563eb', '#0369a1', '#0ea5e9', '#4f46e5', '#0f766e', '#1e3a8a'];
const HEX = /^#[0-9a-fA-F]{6}$/;

/** Shrink any picture to a small square PNG so it loads instantly everywhere. */
async function toLogoData(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => bad(new Error('That file is not a picture we can read.'));
      i.src = url;
    });
    for (const size of [256, 192, 128]) {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const g = c.getContext('2d')!;
      const w = img.naturalWidth || size;
      const h = img.naturalHeight || size;
      const k = Math.min(size / w, size / h);
      g.drawImage(img, (size - w * k) / 2, (size - h * k) / 2, w * k, h * k);
      const data = c.toDataURL('image/png');
      if (data.length < 240_000) return data;
    }
    throw new Error('That picture is too detailed. Try a simpler logo.');
  } finally {
    URL.revokeObjectURL(url);
  }
}

function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255);
}

export default function BrandingPage() {
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const { brand, setBrand } = useBrand();
  const [name, setName] = useState(brand.name);
  const [color, setColor] = useState(brand.color);
  const [logo, setLogo] = useState<string | null>(brand.logo);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const loaded = useRef(false);

  useEffect(() => {
    if (user && user.role !== 'admin') router.replace('/');
  }, [user, router]);
  // Start from the saved values once they arrive from the server.
  useEffect(() => {
    if (!loaded.current && brand.name) {
      setName(brand.name);
      setColor(brand.color);
      setLogo(brand.logo);
      loaded.current = true;
    }
  }, [brand]);
  if (!user || user.role !== 'admin') return null;

  const validColor = HEX.test(color);
  const dirty = name !== brand.name || color.toLowerCase() !== brand.color.toLowerCase() || logo !== brand.logo;
  const light = validColor && luminance(color) > 0.45;

  async function pick(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setErr(null);
    try {
      setLogo(await toLogoData(f));
    } catch (x: any) {
      setErr(x.message);
    }
  }

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const b = await api<typeof DEFAULT_BRAND>('/api/branding', { method: 'PUT', body: { name: name.trim(), color: color.toLowerCase(), logo } });
      setBrand(b);
      toast('Branding saved. Everyone sees it now.');
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  const scope = { '--brand': validColor ? color : brand.color } as CSSProperties;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <Link href="/more" className="backlink">
            <IconChevronL width={18} height={18} /> More
          </Link>
          <h1 className="title">Branding</h1>
          <p className="subtitle">Your name, logo and color, everywhere in the app.</p>
        </div>
      </div>

      {err && <Notice kind="error">{err}</Notice>}

      <section className="sheet pad brand-scope" style={scope} aria-label="Preview">
        <p className="faint small" style={{ marginBottom: 10 }}>Preview</p>
        <div className="brand-preview">
          <div className="brand-preview-bar">
            <span className="brand">
              {logo ? (
                <span className="brand-logo" style={{ width: 32, height: 32, borderRadius: 10 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={logo} alt="" width={32} height={32} />
                </span>
              ) : (
                <BrandLogo size={32} />
              )}
              <span className="brand-name">{name.trim() || 'Your name'}</span>
            </span>
          </div>
          <div className="brand-preview-body">
            <button className="btn btn-primary" type="button" tabIndex={-1}>Sign in</button>
            <span className="pill pill-sales">Sales day</span>
            <button className="btn btn-soft btn-sm" type="button" tabIndex={-1}>Mark video edited</button>
          </div>
        </div>
      </section>

      <section className="sheet pad" style={{ marginTop: 16 }}>
        <label className="field">
          <span className="label">App name</span>
          <input className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="Your company or app name" />
          <p className="hint">Shown on the sign-in screen, the top bar and the installed app.</p>
        </label>

        <div className="field">
          <span className="label">Logo</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <span className="logo-box">
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo} alt="Your logo" />
              ) : (
                <IconImage />
              )}
            </span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-soft btn-sm" onClick={() => file.current?.click()}>
                <IconUpload /> {logo ? 'Change logo' : 'Upload logo'}
              </button>
              {logo && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLogo(null)}>
                  Remove
                </button>
              )}
            </div>
            <input ref={file} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={pick} hidden />
          </div>
          <p className="hint">A square picture works best (PNG with a transparent background looks great). It is resized automatically.</p>
        </div>

        <div className="field" style={{ marginBottom: 0 }}>
          <span className="label">Brand color</span>
          <div className="swatches" role="group" aria-label="Preset colors">
            {PRESETS.map((c) => (
              <button key={c} type="button" className="swatch" style={{ background: c }} aria-label={c} aria-pressed={color.toLowerCase() === c} onClick={() => setColor(c)}>
                {color.toLowerCase() === c && <IconCheck />}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 12, alignItems: 'center' }}>
            <input type="color" className="color-input" value={validColor ? color : '#1a56db'} onChange={(e) => setColor(e.target.value)} aria-label="Pick a color" />
            <input className="input" style={{ maxWidth: 150 }} value={color} onChange={(e) => setColor(e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`)} maxLength={7} spellCheck={false} aria-label="Color code" />
          </div>
          {!validColor && <p className="hint" style={{ color: 'var(--tally)' }}>Use a color code like #1a56db.</p>}
          {light && <p className="hint">This color is quite light. White text on buttons may be hard to read. A deeper shade is safer.</p>}
        </div>
      </section>

      <div className="savebar">
        <div className="btn-row">
          <button
            className="btn btn-ghost"
            disabled={busy}
            onClick={() => {
              setName(DEFAULT_BRAND.name);
              setColor(DEFAULT_BRAND.color);
              setLogo(null);
            }}
          >
            Reset
          </button>
          <button className="btn btn-primary" disabled={busy || !dirty || !validColor || !name.trim()} onClick={save}>
            {busy ? 'Saving…' : 'Save branding'}
          </button>
        </div>
      </div>
    </div>
  );
}
