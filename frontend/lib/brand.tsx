'use client';
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { BrandMark } from '@/components/Icons';

export interface Brand {
  name: string;
  color: string;
  logo: string | null;
}
export const DEFAULT_BRAND: Brand = { name: 'Callsheet', color: '#1a56db', logo: null };
const KEY = 'callsheet.brand';

interface BrandState {
  brand: Brand;
  setBrand: (b: Brand) => void;
}
const Ctx = createContext<BrandState>({ brand: DEFAULT_BRAND, setBrand: () => {} });
export const useBrand = () => useContext(Ctx);

function cached(): Brand {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (v && typeof v.name === 'string' && typeof v.color === 'string') return { name: v.name, color: v.color, logo: v.logo ?? null };
  } catch {
    /* ignore */
  }
  return DEFAULT_BRAND;
}

export function BrandProvider({ children }: { children: ReactNode }) {
  const [brand, setBrandState] = useState<Brand>(DEFAULT_BRAND);

  const apply = useCallback((b: Brand) => {
    document.documentElement.style.setProperty('--brand', b.color);
    document.title = b.name;
    try {
      localStorage.setItem(KEY, JSON.stringify(b));
    } catch {
      /* ignore */
    }
  }, []);

  const setBrand = useCallback(
    (b: Brand) => {
      setBrandState(b);
      apply(b);
    },
    [apply]
  );

  useEffect(() => {
    // Instant: what we saw last time. Then the truth from the server (public, works on the sign-in screen).
    const c = cached();
    setBrandState(c);
    apply(c);
    fetch('/api/branding', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => {
        if (b && typeof b.name === 'string') setBrand({ name: b.name, color: b.color || DEFAULT_BRAND.color, logo: b.logo ?? null });
      })
      .catch(() => {});
  }, [apply, setBrand]);

  return <Ctx.Provider value={{ brand, setBrand }}>{children}</Ctx.Provider>;
}

/** The company logo if the admin uploaded one, otherwise the built-in mark. */
export function BrandLogo({ size = 30, radius }: { size?: number; radius?: number }) {
  const { brand } = useBrand();
  const r = radius ?? Math.round(size * 0.3);
  if (brand.logo) {
    return (
      <span className="brand-logo" style={{ width: size, height: size, borderRadius: r }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={brand.logo} alt="" width={size} height={size} />
      </span>
    );
  }
  return (
    <span className="brand-mark" style={{ width: size, height: size, borderRadius: r }} aria-hidden="true">
      <BrandMark style={{ width: size * 0.6, height: size * 0.6 }} />
    </span>
  );
}
