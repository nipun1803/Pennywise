import { computeBalances, equalSplit, simplifyDebts } from '../../src/shared/money';
import { CODE_ALPHABET, generateJoinCode } from '../../src/services/groups';

test('100 cents splits into 34,33,33 in stable ID order', () => {
  expect(equalSplit(100, ['c', 'a', 'b'])).toEqual([
    { userId: 'a', shareCents: 34 }, { userId: 'b', shareCents: 33 }, { userId: 'c', shareCents: 33 },
  ]);
});
test('tiny amounts allow zero-cent shares', () => {
  expect(equalSplit(1, ['a', 'b', 'c']).map(s => s.shareCents)).toEqual([1, 0, 0]);
});
test('splits remain exact at the maximum safe integer', () => {
  const shares = equalSplit(Number.MAX_SAFE_INTEGER, ['a', 'b', 'c', 'd']);
  expect(shares.reduce((s, v) => s + BigInt(v.shareCents), 0n)).toBe(BigInt(Number.MAX_SAFE_INTEGER));
});
test.each([0, -1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1])('rejects invalid cents %s', n => {
  expect(() => equalSplit(n, ['a'])).toThrow();
});
test('rejects empty or duplicate splits', () => {
  expect(() => equalSplit(10, [])).toThrow();
  expect(() => equalSplit(10, ['a', 'a'])).toThrow();
});
test('payer may be excluded and overpayments reverse debt', () => {
  const expenses = [{ paidBy: 'a', amountCents: 100, splits: equalSplit(100, ['b']) }];
  expect(computeBalances(['a', 'b'], expenses, [{ fromUser: 'b', toUser: 'a', amountCents: 130 }])).toEqual([
    { userId: 'a', balanceCents: -30 }, { userId: 'b', balanceCents: 30 },
  ]);
});
test('detects bad ledger data and unbalanced settlement input', () => {
  expect(() => computeBalances(['a'], [{ paidBy: 'a', amountCents: 5, splits: [{ userId: 'a', shareCents: 4 }] }], [])).toThrow();
  expect(() => computeBalances(['a'], [], [{ fromUser: 'a', toUser: 'x', amountCents: 1 }])).toThrow();
  expect(() => simplifyDebts([{ userId: 'a', balanceCents: 1 }])).toThrow();
  expect(() => simplifyDebts([{ userId: 'a', balanceCents: 0 }, { userId: 'a', balanceCents: 0 }])).toThrow();
});
test('detects aggregate overflow rather than rounding cents', () => {
  const expense = { paidBy: 'a', amountCents: Number.MAX_SAFE_INTEGER, splits: equalSplit(Number.MAX_SAFE_INTEGER, ['b']) };
  expect(() => computeBalances(['a', 'b'], [expense, expense], [])).toThrow(RangeError);
});
test('four people and ten expenses need at most three suggested payments', () => {
  const ids = ['a', 'b', 'c', 'd'];
  const expenses = Array.from({ length: 10 }, (_, i) => ({ paidBy: ids[i % 4]!, amountCents: 101 + i * 27, splits: equalSplit(101 + i * 27, ids) }));
  const payments = simplifyDebts(computeBalances(ids, expenses, []));
  expect(payments.length).toBeLessThanOrEqual(3);
  expect(computeBalances(ids, expenses, payments).every(b => b.balanceCents === 0)).toBe(true);
});
test('generated ledgers stay zero-sum and greedy payments settle them', () => {
  for (let n = 1; n <= 50; n++) {
    const ids = Array.from({ length: n }, (_, i) => `member-${i}`);
    const expenses = Array.from({ length: 20 }, (_, i) => ({ paidBy: ids[(i * 7) % n]!, amountCents: i * 127 + 1, splits: equalSplit(i * 127 + 1, ids) }));
    const balances = computeBalances(ids, expenses, []);
    expect(balances.reduce((sum, b) => sum + b.balanceCents, 0)).toBe(0);
    const payments = simplifyDebts(balances);
    expect(payments.length).toBeLessThanOrEqual(n - 1);
    expect(computeBalances(ids, expenses, payments).every(b => b.balanceCents === 0)).toBe(true);
    expect(simplifyDebts([...balances].reverse())).toEqual(payments);
  }
});
test('code generation uses only the approved alphabet', () => {
  expect(CODE_ALPHABET).not.toMatch(/[0O1IL]/);
  for (let i = 0; i < 100; i++) expect(generateJoinCode()).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
});
