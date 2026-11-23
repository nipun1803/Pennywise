import { User, type GroupRecord, type NotificationKind } from '../models';

export interface PushMessage { to: string; title: string; body: string; data: Record<string, string>; sound: 'default'; channelId: 'default' }
export interface PushTicket { status: 'ok' | 'error'; details?: { error?: string } }
export type PushSender = (messages: PushMessage[]) => Promise<PushTicket[]>;
interface Notice { userId: string; title: string; body: string }
type Change = 'created' | 'updated' | 'deleted';
interface ExpenseSnapshot { id: string; description: string; amountCents: number; paidBy: string; splits: { userId: string; shareCents: number }[] }
interface PaymentSnapshot { id: string; fromUser: string; toUser: string; amountCents: number }

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const BATCH_SIZE = 100; // Expo accepts at most 100 messages per request.
const expoSender: PushSender = async messages => {
  const response = await fetch(EXPO_PUSH_URL, { method: 'POST', signal: AbortSignal.timeout(10000),
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}) },
    body: JSON.stringify(messages) });
  if (!response.ok) throw new Error(`Expo push service responded ${response.status}`);
  return ((await response.json()) as { data?: PushTicket[] }).data ?? [];
};
let send = expoSender;
export function setPushSender(sender: PushSender | null) { send = sender ?? expoSender; }

// Pushes are best-effort and never delay or fail the write that caused them.
// Tracking the work lets shutdown and tests wait for it to settle.
const inflight = new Set<Promise<void>>();
export const flushNotifications = async () => { await Promise.all([...inflight]); };
function run(task: () => Promise<void>) {
  const job: Promise<void> = task().catch(error => { console.error('Push notification failed:', error instanceof Error ? error.message : error); }).finally(() => { inflight.delete(job); });
  inflight.add(job);
}
async function deliver(kind: NotificationKind, notices: Notice[], data: Record<string, string>) {
  if (!notices.length) return;
  const users = await User.find({ _id: { $in: notices.map(n => n.userId) } }).select('+pushTokens notifications').lean();
  const messages = users.flatMap(user => {
    const notice = notices.find(n => n.userId === String(user._id));
    if (!notice || user.notifications?.[kind] === false) return [];
    return (user.pushTokens ?? []).map((to): PushMessage => ({ to, title: notice.title, body: notice.body, data, sound: 'default', channelId: 'default' }));
  });
  for (let start = 0; start < messages.length; start += BATCH_SIZE) {
    const batch = messages.slice(start, start + BATCH_SIZE);
    const tickets = await send(batch);
    // Uninstalled apps report DeviceNotRegistered; drop those tokens so they are not retried forever.
    const dead = batch.filter((_, i) => tickets[i]?.status === 'error' && tickets[i]?.details?.error === 'DeviceNotRegistered').map(m => m.to);
    if (dead.length) await User.updateMany({ pushTokens: { $in: dead } }, { $pull: { pushTokens: { $in: dead } } });
  }
}
const names = async (ids: string[]) => new Map((await User.find({ _id: { $in: ids } }).select('name').lean()).map(u => [String(u._id), u.name]));
const money = (cents: number) => `₹${(cents / 100).toLocaleString('en-IN', { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
const verb: Record<Change, string> = { created: 'added', updated: 'edited', deleted: 'deleted' };
const involved = (expense: ExpenseSnapshot) => [expense.paidBy, ...expense.splits.map(s => s.userId)];

// `previous` is the pre-edit expense, so members removed by an edit hear about it too.
export function notifyExpense(change: Change, group: GroupRecord, actorId: string, expense: ExpenseSnapshot, previous?: ExpenseSnapshot) {
  run(async () => {
    const actor = (await names([actorId])).get(actorId) ?? 'Someone';
    const recipients = [...new Set([...involved(expense), ...(previous ? involved(previous) : [])])].filter(id => id !== actorId);
    const notices = recipients.map((userId): Notice => {
      const share = expense.splits.filter(s => s.userId === userId).reduce((sum, s) => sum + s.shareCents, 0);
      const detail = change === 'deleted' ? `${money(expense.amountCents)} removed`
        : !involved(expense).includes(userId) ? 'You were removed from this expense'
        : userId === expense.paidBy ? `You paid ${money(expense.amountCents)}`
        : `Your share: ${money(share)}`;
      return { userId, title: `${actor} ${verb[change]} “${expense.description}”`, body: `${group.name} · ${detail}` };
    });
    await deliver('expenses', notices, { type: 'expense', groupId: String(group._id), expenseId: expense.id });
  });
}
export function notifyPayment(change: Change, group: GroupRecord, actorId: string, payment: PaymentSnapshot, previous?: PaymentSnapshot) {
  run(async () => {
    const parties = [payment.fromUser, payment.toUser, ...(previous ? [previous.fromUser, previous.toUser] : [])];
    const profiles = await names([actorId, ...parties]);
    const actor = profiles.get(actorId) ?? 'Someone';
    const amount = money(payment.amountCents);
    const notices = [...new Set(parties)].filter(id => id !== actorId).map((userId): Notice => ({ userId, body: group.name,
      title: change !== 'created' ? `${actor} ${change === 'updated' ? 'updated' : 'removed'} a ${amount} payment`
        : userId === payment.toUser ? `${profiles.get(payment.fromUser) ?? 'Someone'} paid you ${amount}`
        : `${actor} recorded your ${amount} payment to ${profiles.get(payment.toUser) ?? 'a member'}` }));
    await deliver('payments', notices, { type: 'payment', groupId: String(group._id), paymentId: payment.id });
  });
}
export function notifyMemberJoined(group: GroupRecord, memberId: string) {
  run(async () => {
    const joiner = (await names([memberId])).get(memberId) ?? 'Someone';
    const notices = group.members.map(String).filter(id => id !== memberId).map((userId): Notice => ({ userId, title: `${joiner} joined ${group.name}`, body: `${group.members.length} members` }));
    await deliver('members', notices, { type: 'member', groupId: String(group._id) });
  });
}
