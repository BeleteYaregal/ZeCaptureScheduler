import { z } from 'zod';
import { Setting } from './models';

export interface Settings {
  /** Max salespeople one supervisor can have. */
  max_team_size: number;
  /** Max sales days (days where salespeople are captured) per week. */
  sales_days_per_week: number;
  /** Max company days (company content, nobody booked) per week. */
  company_days_per_week: number;
  /** Max people per sales day. null = auto-balance across the sales days. */
  people_per_sales_day: number | null;
  /** Max people one supervisor may book (or request) on a single day. */
  supervisor_max_per_day: number;
  /** Minutes reserved for each person. */
  slot_minutes: number;
  /** First slot of the day, HH:MM. */
  day_start_time: string;
  /** A salesperson with no completed capture for this many days is "overdue". */
  overdue_days: number;
}

export const DEFAULT_SETTINGS: Settings = {
  max_team_size: 12,
  sales_days_per_week: 4,
  company_days_per_week: 2,
  people_per_sales_day: null,
  supervisor_max_per_day: 3,
  slot_minutes: 30,
  day_start_time: '09:00',
  overdue_days: 30,
};

export const SettingsSchema = z
  .object({
    max_team_size: z.number().int().min(1).max(100),
    sales_days_per_week: z.number().int().min(0).max(7),
    company_days_per_week: z.number().int().min(0).max(7),
    people_per_sales_day: z.number().int().min(1).max(200).nullable(),
    supervisor_max_per_day: z.number().int().min(1).max(50),
    slot_minutes: z.number().int().min(5).max(240),
    day_start_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM (24h)'),
    overdue_days: z.number().int().min(1).max(365),
  })
  .refine((s) => s.sales_days_per_week + s.company_days_per_week <= 7, {
    message: 'Sales days + company days cannot be more than 7',
    path: ['company_days_per_week'],
  });

export async function getSettings(): Promise<Settings> {
  const rows = await Setting.findAll();
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) {
    if (!(r.key in DEFAULT_SETTINGS)) continue;
    try {
      out[r.key] = JSON.parse(r.value);
    } catch {
      /* ignore corrupt row, keep default */
    }
  }
  return out as unknown as Settings;
}

export async function updateSettings(patch: unknown): Promise<{ before: Settings; after: Settings }> {
  const before = await getSettings();
  const merged = { ...before, ...(patch as object) };
  const after = SettingsSchema.parse(merged) as Settings;
  for (const [key, value] of Object.entries(after)) {
    await Setting.upsert({ key, value: JSON.stringify(value) });
  }
  return { before, after };
}
