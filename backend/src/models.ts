import { Sequelize, DataTypes, Model } from 'sequelize';
import fs from 'fs';
import path from 'path';
import { config } from './config';

function makeSequelize(): Sequelize {
  if (config.databaseUrl) {
    // Hosted databases (Render, Neon, Supabase...) need SSL. Set DATABASE_SSL=false for a local one.
    const local = /@(localhost|127\.0\.0\.1)[:/]/.test(config.databaseUrl);
    const ssl = process.env.DATABASE_SSL ? process.env.DATABASE_SSL !== 'false' : !local;
    return new Sequelize(config.databaseUrl, {
      logging: false,
      ...(ssl && /^postgres/.test(config.databaseUrl) ? { dialectOptions: { ssl: { require: true, rejectUnauthorized: false } } } : {}),
    });
  }
  if (config.sqlitePath !== ':memory:') fs.mkdirSync(path.dirname(config.sqlitePath), { recursive: true });
  return new Sequelize({ dialect: 'sqlite', storage: config.sqlitePath, logging: false });
}

export const sequelize = makeSequelize();

/** Only these three can sign in. Managers and supervisors are team records, not accounts. */
export type Role = 'admin' | 'sales' | 'videographer' | 'supervisor';
export const ROLES: Role[] = ['admin', 'sales', 'videographer', 'supervisor'];
export type BookingStatus = 'planned' | 'done' | 'missed' | 'rescheduled' | 'requested';
export type DayType = 'sales' | 'company';

export class User extends Model {
  declare id: number;
  declare name: string;
  declare username: string;
  declare passwordHash: string;
  declare role: Role;
  declare supervisorId: number | null; // salespeople and supervisor logins
  declare phone: string | null;
  declare active: boolean;
  declare telegramChatId: string | null;
  declare telegramLinkCode: string | null;
}
User.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING, allowNull: false },
    username: { type: DataTypes.STRING, allowNull: false, unique: true },
    passwordHash: { type: DataTypes.STRING, allowNull: false },
    role: { type: DataTypes.STRING(20), allowNull: false },
    supervisorId: { type: DataTypes.INTEGER, allowNull: true },
    phone: { type: DataTypes.STRING(30), allowNull: true },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    telegramChatId: { type: DataTypes.STRING(30), allowNull: true },
    telegramLinkCode: { type: DataTypes.STRING(40), allowNull: true },
  },
  { sequelize, modelName: 'User', tableName: 'users' }
);

/** A sales manager. A group the admin manages; has no login. */
export class Manager extends Model {
  declare id: number;
  declare name: string;
  declare phone: string | null;
  declare active: boolean;
}
Manager.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING, allowNull: false },
    phone: { type: DataTypes.STRING(30), allowNull: true },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  { sequelize, modelName: 'Manager', tableName: 'managers' }
);

/** A sales supervisor under one manager. Leads a team of salespeople; has no login. */
export class Supervisor extends Model {
  declare id: number;
  declare name: string;
  declare phone: string | null;
  declare managerId: number;
  declare active: boolean;
}
Supervisor.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING, allowNull: false },
    phone: { type: DataTypes.STRING(30), allowNull: true },
    managerId: { type: DataTypes.INTEGER, allowNull: false },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  { sequelize, modelName: 'Supervisor', tableName: 'supervisors', indexes: [{ fields: ['managerId'] }] }
);

export class Setting extends Model {
  declare key: string;
  declare value: string; // JSON encoded
}
Setting.init(
  {
    key: { type: DataTypes.STRING(60), primaryKey: true },
    value: { type: DataTypes.TEXT, allowNull: false },
  },
  { sequelize, modelName: 'Setting', tableName: 'settings' }
);

export class Week extends Model {
  declare id: number;
  declare weekStart: string; // Monday, YYYY-MM-DD
  declare status: 'draft' | 'published';
  declare videographerId: number | null;
  declare publishedAt: Date | null;
  declare warnings: string; // JSON array of strings from the last generation
}
Week.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    weekStart: { type: DataTypes.STRING(10), allowNull: false, unique: true },
    status: { type: DataTypes.STRING(12), allowNull: false, defaultValue: 'draft' },
    videographerId: { type: DataTypes.INTEGER, allowNull: true },
    publishedAt: { type: DataTypes.DATE, allowNull: true },
    warnings: { type: DataTypes.TEXT, allowNull: false, defaultValue: '[]' },
  },
  { sequelize, modelName: 'Week', tableName: 'weeks' }
);

export class CaptureDay extends Model {
  declare id: number;
  declare weekStart: string;
  declare date: string;
  declare type: DayType;
  declare startTime: string;
  declare videographerId: number | null;
  declare note: string | null;
  declare status: 'active' | 'cancelled';
}
CaptureDay.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    weekStart: { type: DataTypes.STRING(10), allowNull: false },
    date: { type: DataTypes.STRING(10), allowNull: false, unique: true },
    type: { type: DataTypes.STRING(10), allowNull: false },
    startTime: { type: DataTypes.STRING(5), allowNull: false, defaultValue: '09:00' },
    videographerId: { type: DataTypes.INTEGER, allowNull: true },
    note: { type: DataTypes.STRING(200), allowNull: true },
    status: { type: DataTypes.STRING(12), allowNull: false, defaultValue: 'active' },
  },
  { sequelize, modelName: 'CaptureDay', tableName: 'capture_days', indexes: [{ fields: ['weekStart'] }] }
);

export class Booking extends Model {
  declare id: number;
  declare captureDayId: number;
  declare salesId: number;
  declare slotOrder: number;
  declare startTime: string;
  declare status: BookingStatus;
  declare note: string | null;
  declare editDone: boolean;
  declare editedAt: Date | null;
  declare requestedById: number | null; // supervisor account that asked for this slot
  declare day?: CaptureDay;
}
Booking.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    captureDayId: { type: DataTypes.INTEGER, allowNull: false },
    salesId: { type: DataTypes.INTEGER, allowNull: false },
    slotOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    startTime: { type: DataTypes.STRING(5), allowNull: false, defaultValue: '09:00' },
    status: { type: DataTypes.STRING(12), allowNull: false, defaultValue: 'planned' },
    note: { type: DataTypes.STRING(200), allowNull: true },
    editDone: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    editedAt: { type: DataTypes.DATE, allowNull: true },
    requestedById: { type: DataTypes.INTEGER, allowNull: true },
  },
  {
    sequelize,
    modelName: 'Booking',
    tableName: 'bookings',
    indexes: [{ fields: ['captureDayId'] }, { fields: ['salesId'] }],
  }
);

export class Unavailability extends Model {
  declare id: number;
  declare userId: number;
  declare date: string;
  declare reason: string | null;
}
Unavailability.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    date: { type: DataTypes.STRING(10), allowNull: false },
    reason: { type: DataTypes.STRING(200), allowNull: true },
  },
  { sequelize, modelName: 'Unavailability', tableName: 'unavailability', indexes: [{ unique: true, fields: ['userId', 'date'] }] }
);

export class AuditLog extends Model {
  declare id: number;
  declare userId: number | null;
  declare action: string;
  declare entity: string;
  declare entityId: string | null;
  declare detail: string;
  declare createdAt: Date;
}
AuditLog.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER, allowNull: true },
    action: { type: DataTypes.STRING(60), allowNull: false },
    entity: { type: DataTypes.STRING(40), allowNull: false },
    entityId: { type: DataTypes.STRING(40), allowNull: true },
    detail: { type: DataTypes.TEXT, allowNull: false, defaultValue: '{}' },
  },
  { sequelize, modelName: 'AuditLog', tableName: 'audit_logs' }
);

export class Notification extends Model {
  declare id: number;
  declare userId: number;
  declare title: string;
  declare body: string;
  declare read: boolean;
  declare createdAt: Date;
}
Notification.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    title: { type: DataTypes.STRING(120), allowNull: false },
    body: { type: DataTypes.STRING(400), allowNull: false },
    read: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  { sequelize, modelName: 'Notification', tableName: 'notifications', indexes: [{ fields: ['userId'] }] }
);

Booking.belongsTo(CaptureDay, { foreignKey: 'captureDayId', as: 'day' });
CaptureDay.hasMany(Booking, { foreignKey: 'captureDayId', as: 'bookings' });

export async function initDb(): Promise<void> {
  await sequelize.authenticate();
  await sequelize.sync();
  // Existing databases: add columns safely (handles PostgreSQL lowercase keys)
  const qi = sequelize.getQueryInterface();
  try {
    await sequelize.query("UPDATE weeks SET status = 'published' WHERE status = 'draft'");
  } catch {}
  try {
    const userCols = await qi.describeTable('users');
    const hasCol = (cols: any, name: string) => {
      const lower = name.toLowerCase();
      return Object.keys(cols).some((k) => k.toLowerCase() === lower);
    };
    if (!hasCol(userCols, 'telegramChatId')) await qi.addColumn('users', 'telegramChatId', { type: DataTypes.STRING(30), allowNull: true }).catch(() => {});
    if (!hasCol(userCols, 'telegramLinkCode')) await qi.addColumn('users', 'telegramLinkCode', { type: DataTypes.STRING(40), allowNull: true }).catch(() => {});
    const cols = await qi.describeTable('bookings');
    if (!hasCol(cols, 'editDone')) await qi.addColumn('bookings', 'editDone', { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }).catch(() => {});
    if (!hasCol(cols, 'requestedById')) await qi.addColumn('bookings', 'requestedById', { type: DataTypes.INTEGER, allowNull: true }).catch(() => {});
    if (!hasCol(cols, 'editedAt')) await qi.addColumn('bookings', 'editedAt', { type: DataTypes.DATE, allowNull: true }).catch(() => {});
  } catch {}
}
