import { User } from './user';
import { Group } from './group';
import { Expense } from './expense';
import { Settlement } from './settlement';
import { Category } from './category';

export type { AuditEvent, CreationRecord } from './shared';
export * from './user';
export * from './group';
export * from './expense';
export * from './settlement';
export * from './category';

export async function ensureIndexes() {
  await Promise.all([User.init(), Group.init(), Expense.init(), Settlement.init(), Category.init()]);
}
