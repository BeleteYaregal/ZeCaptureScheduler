import type { BookingStatus, Role } from './types';

export const STATUS_LABEL: Record<BookingStatus, string> = {
  planned: 'Booked',
  done: 'Done',
  missed: 'Missed',
  rescheduled: 'Moved',
  requested: 'Requested',
};

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Marketing manager',
  sales: 'Salesperson',
  videographer: 'Videographer',
  supervisor: 'Supervisor',
};

const ACTION_LABEL: Record<string, string> = {
  'auth.login': 'Signed in',
  'auth.password': 'Changed password',
  'settings.update': 'Changed settings',
  'user.create': 'Registered an account',
  'user.update': 'Updated an account',
  'manager.create': 'Added a sales manager',
  'manager.update': 'Updated a sales manager',
  'supervisor.create': 'Added a supervisor',
  'supervisor.update': 'Updated a supervisor',
  'plan.auto': 'Applied the standard week',
  'plan.save': 'Saved the week plan',
  'schedule.generate': 'Generated a schedule',
  'schedule.publish': 'Published a schedule',
  'request.create': 'Supervisor requested slots',
  'request.approve': 'Approved a request',
  'request.decline': 'Declined a request',
  'request.withdraw': 'Withdrew a request',
  'booking.move': 'Moved a capture',
  'booking.add': 'Added a capture',
  'booking.remove': 'Removed a capture',
  'booking.swap': 'Swapped two captures',
  'booking.shift': 'Changed a time slot',
  'booking.done': 'Marked a capture done',
  'booking.missed': 'Marked a capture missed',
  'booking.planned': 'Set a capture back to booked',
  'booking.reschedule': 'Rebooked a capture',
  'booking.edit_done': 'Marked a video as edited',
  'booking.edit_undo': 'Set a video back to not edited',
  'branding.update': 'Changed the app name, logo or color',
  'report.export': 'Exported a report',
  'backup.download': 'Downloaded a backup',
  'day.cancel': 'Cancelled a day',
  'availability.add': 'Added a day off',
  'availability.remove': 'Removed a day off',
};

export const actionLabel = (a: string) => ACTION_LABEL[a] ?? a;

export function randomPassword(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let out = '';
  const buf = new Uint32Array(8);
  crypto.getRandomValues(buf);
  for (const n of buf) out += chars[n % chars.length];
  return out;
}
