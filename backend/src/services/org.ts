import { Op } from 'sequelize';
import { HttpError } from '../http';
import { Manager, Supervisor, User } from '../models';

/** Lookup maps for the team hierarchy: supervisor id -> Supervisor, manager id -> Manager. */
export async function loadOrgMaps() {
  const [sups, mgrs] = await Promise.all([Supervisor.findAll(), Manager.findAll()]);
  return {
    supMap: new Map(sups.map((s) => [s.id, s])),
    mgrMap: new Map(mgrs.map((m) => [m.id, m])),
  };
}

export async function activeTeamSize(supervisorId: number, excludeUserId?: number): Promise<number> {
  return User.count({
    where: {
      role: 'sales',
      active: true,
      supervisorId,
      ...(excludeUserId ? { id: { [Op.ne]: excludeUserId } } : {}),
    },
  });
}

/** Throws if the supervisor is invalid or their team is already at the limit. */
export async function assertTeamRoom(supervisorId: number, max: number, excludeUserId?: number): Promise<void> {
  const sup = await Supervisor.findByPk(supervisorId);
  if (!sup || !sup.active) {
    throw new HttpError(422, 'Pick an active supervisor for this salesperson', 'BAD_PARENT');
  }
  const size = await activeTeamSize(supervisorId, excludeUserId);
  if (size >= max) {
    throw new HttpError(
      409,
      `${sup.name} already has ${size} salespeople (limit ${max}). Raise the limit in Settings or choose another supervisor.`,
      'TEAM_FULL'
    );
  }
}

/** Active and inactive salespeople on a supervisor account's team. */
export async function teamIds(sup: User): Promise<number[]> {
  if (!sup.supervisorId) return [];
  const rows = await User.findAll({ where: { role: 'sales', supervisorId: sup.supervisorId }, attributes: ['id'] });
  return rows.map((r) => r.id);
}

/** Salespeople a viewer may see. Admins and videographers see everyone, a salesperson sees only themselves. */
export async function visibleSalesIds(viewer: User): Promise<Set<number> | 'all'> {
  if (viewer.role === 'admin' || viewer.role === 'videographer') return 'all';
  if (viewer.role === 'supervisor') return new Set(await teamIds(viewer));
  return new Set([viewer.id]);
}

/** Can `viewer` manage availability for `targetId`? Admin, or the person themselves. */
export async function canManageUser(viewer: User, targetId: number): Promise<boolean> {
  if (viewer.role === 'admin' || viewer.id === targetId) return true;
  if (viewer.role === 'supervisor') return (await teamIds(viewer)).includes(targetId);
  return false;
}

export interface ActiveSales {
  user: User;
  supervisorId: number | null;
  managerId: number | null;
}

export async function loadActiveSales(): Promise<ActiveSales[]> {
  const sales = await User.findAll({ where: { role: 'sales', active: true }, order: [['id', 'ASC']] });
  const { supMap } = await loadOrgMaps();
  return sales.map((s) => ({
    user: s,
    supervisorId: s.supervisorId,
    managerId: s.supervisorId !== null ? supMap.get(s.supervisorId)?.managerId ?? null : null,
  }));
}
