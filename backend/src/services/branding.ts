import { z } from 'zod';
import { Setting } from '../models';

export interface Branding {
  name: string;
  color: string;
  logo: string | null;
}

export const DEFAULT_BRANDING: Branding = { name: 'CaptureSheet', color: '#1a56db', logo: null };

const KEYS = { name: 'brand_name', color: 'brand_color', logo: 'brand_logo' } as const;

export const BrandingSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(40, 'Keep the name under 40 characters'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a color like #1a56db'),
  // A small image sent as a data URL. The app shrinks it before upload; this is the safety limit.
  logo: z
    .string()
    .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, 'The logo must be a PNG, JPG or WebP image')
    .max(300_000, 'The logo is too large')
    .nullable(),
});

export async function getBranding(): Promise<Branding> {
  const rows = await Setting.findAll({ where: { key: Object.values(KEYS) } });
  const out: Branding = { ...DEFAULT_BRANDING };
  for (const r of rows) {
    try {
      const v = JSON.parse(r.value);
      if (r.key === KEYS.name && typeof v === 'string') out.name = v;
      if (r.key === KEYS.color && typeof v === 'string') out.color = v;
      if (r.key === KEYS.logo && (typeof v === 'string' || v === null)) out.logo = v;
    } catch {
      /* keep default */
    }
  }
  return out;
}

export async function saveBranding(input: unknown): Promise<Branding> {
  const b = BrandingSchema.parse(input);
  await Setting.upsert({ key: KEYS.name, value: JSON.stringify(b.name) });
  await Setting.upsert({ key: KEYS.color, value: JSON.stringify(b.color.toLowerCase()) });
  await Setting.upsert({ key: KEYS.logo, value: JSON.stringify(b.logo) });
  return { ...b, color: b.color.toLowerCase() };
}
