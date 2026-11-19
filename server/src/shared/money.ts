export interface Share { userId: string; shareCents: number }
export interface MoneyExpense { paidBy: string; amountCents: number; splits: Share[] }
export interface Payment { fromUser: string; toUser: string; amountCents: number }
export interface Balance { userId: string; balanceCents: number }

function cents(n: number, allowZero = false) {
  if (!Number.isSafeInteger(n) || n < (allowZero ? 0 : 1)) throw new Error('Invalid integer cents');
}
function safeNumber(n: bigint): number {
  if (n > BigInt(Number.MAX_SAFE_INTEGER) || n < BigInt(Number.MIN_SAFE_INTEGER)) throw new RangeError('Balance exceeds safe integer cents');
  return Number(n);
}
export function equalSplit(amountCents: number, userIds: readonly string[]): Share[] {
  cents(amountCents);
  if (!userIds.length || new Set(userIds).size !== userIds.length) throw new Error('Split members must be non-empty and unique');
  const ids = [...userIds].sort();
  const count = BigInt(ids.length);
  const base = BigInt(amountCents) / count;
  const remainder = Number(BigInt(amountCents) % count);
  return ids.map((userId, index) => ({ userId, shareCents: Number(base) + (index < remainder ? 1 : 0) }));
}
export function computeBalances(memberIds: readonly string[], expenses: readonly MoneyExpense[], settlements: readonly Payment[]): Balance[] {
  if (new Set(memberIds).size !== memberIds.length) throw new Error('Duplicate member');
  const values = new Map(memberIds.map(userId => [userId, 0n]));
  const add = (userId: string, amount: bigint) => {
    const current = values.get(userId);
    if (current === undefined) throw new Error('Ledger references a non-member');
    values.set(userId, current + amount);
  };
  for (const expense of expenses) {
    cents(expense.amountCents);
    if (!expense.splits.length || new Set(expense.splits.map(s => s.userId)).size !== expense.splits.length) throw new Error('Invalid expense splits');
    let sum = 0n;
    for (const split of expense.splits) { cents(split.shareCents, true); sum += BigInt(split.shareCents); add(split.userId, -BigInt(split.shareCents)); }
    if (sum !== BigInt(expense.amountCents)) throw new Error('Shares must sum to amountCents');
    add(expense.paidBy, BigInt(expense.amountCents));
  }
  for (const payment of settlements) {
    cents(payment.amountCents);
    if (payment.fromUser === payment.toUser) throw new Error('Cannot pay yourself');
    add(payment.fromUser, BigInt(payment.amountCents));
    add(payment.toUser, -BigInt(payment.amountCents));
  }
  if ([...values.values()].reduce((a, b) => a + b, 0n) !== 0n) throw new Error('Balances do not sum to zero');
  return [...values].sort(([a], [b]) => a.localeCompare(b)).map(([userId, value]) => ({ userId, balanceCents: safeNumber(value) }));
}
export function simplifyDebts(balances: readonly Balance[]): Payment[] {
  if (new Set(balances.map(b => b.userId)).size !== balances.length) throw new Error('Duplicate member');
  for (const b of balances) if (!Number.isSafeInteger(b.balanceCents)) throw new Error('Invalid balance');
  if (balances.reduce((sum, b) => sum + BigInt(b.balanceCents), 0n) !== 0n) throw new Error('Balances do not sum to zero');
  const debtors = balances.filter(b => b.balanceCents < 0).map(b => ({ userId: b.userId, remaining: -b.balanceCents }));
  const creditors = balances.filter(b => b.balanceCents > 0).map(b => ({ userId: b.userId, remaining: b.balanceCents }));
  const order = (a: { userId: string; remaining: number }, b: { userId: string; remaining: number }) => b.remaining - a.remaining || a.userId.localeCompare(b.userId);
  debtors.sort(order); creditors.sort(order);
  const payments: Payment[] = [];
  let d = 0; let c = 0;
  while (d < debtors.length && c < creditors.length) {
    const debtor = debtors[d]!; const creditor = creditors[c]!;
    const amountCents = Math.min(debtor.remaining, creditor.remaining);
    payments.push({ fromUser: debtor.userId, toUser: creditor.userId, amountCents });
    debtor.remaining -= amountCents; creditor.remaining -= amountCents;
    if (!debtor.remaining) d++;
    if (!creditor.remaining) c++;
  }
  return payments;
}
