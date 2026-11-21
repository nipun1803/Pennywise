import type { UserRecord, GroupRecord, ExpenseRecord, SettlementRecord } from '../models';

export const userView = (u: UserRecord) => ({ image: u.image ?? null, id: String(u._id), name: u.name, email: u.email, createdAt: u.createdAt.toISOString(), avatar: u.avatar ?? 'initials', avatarColor: u.avatarColor ?? 'emerald' });
export const groupView = (g: GroupRecord) => ({
  image: g.image ?? null,
  id: String(g._id), name: g.name, joinCode: g.joinCode, createdBy: String(g.createdBy),
  memberCount: g.members.length, createdAt: g.createdAt.toISOString(),
  description: g.description ?? '', icon: g.icon ?? 'people', color: g.color ?? 'emerald',
});
export const expenseView = (e: ExpenseRecord) => ({
  id: String(e._id), groupId: String(e.groupId), description: e.description, amountCents: e.amountCents,
  paidBy: String(e.paidBy), splits: e.splits.map(s => ({ userId: String(s.userId), shareCents: s.shareCents })),
  category: e.category ?? null,
  createdBy: String(e.createdBy), createdAt: e.createdAt.toISOString(), updatedAt: e.updatedAt.toISOString(),
});
export const settlementView = (s: SettlementRecord) => ({
  id: String(s._id), groupId: String(s.groupId), fromUser: String(s.fromUser), toUser: String(s.toUser),
  amountCents: s.amountCents, createdBy: String(s.createdBy), createdAt: s.createdAt.toISOString(),
  updatedAt: s.updatedAt.toISOString(), updatedBy: s.updatedBy ? String(s.updatedBy) : null,
  deletedAt: s.deletedAt?.toISOString() ?? null, deletedBy: s.deletedBy ? String(s.deletedBy) : null,
});
