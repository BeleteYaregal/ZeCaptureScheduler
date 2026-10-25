import { AuditLog, Notification } from '../models';

export async function audit(
  userId: number | null,
  action: string,
  entity: string,
  entityId: string | number | null,
  detail: object = {}
): Promise<void> {
  await AuditLog.create({
    userId,
    action,
    entity,
    entityId: entityId === null ? null : String(entityId),
    detail: JSON.stringify(detail),
  });
}

/**
 * In-app notifications. This is the single place to plug in SMS / email / Telegram:
 * after the rows are created, forward them to the channel you prefer.
 */
export async function notify(userIds: number[], title: string, body: string): Promise<void> {
  const ids = [...new Set(userIds)];
  if (!ids.length) return;
  await Notification.bulkCreate(ids.map((userId) => ({ userId, title, body })));
}
