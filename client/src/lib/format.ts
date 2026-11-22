// Use integer arithmetic so even the API's largest safe amounts keep their paise.
export function formatINR(cents: number): string {
  if (!Number.isSafeInteger(cents)) throw new RangeError('Money must be safe integer hundredths');
  const value = BigInt(cents);
  const absolute = value < 0n ? -value : value;
  const digits = (absolute / 100n).toString();
  const last = digits.slice(-3);
  const leading = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${value < 0n ? '−' : ''}₹${leading ? `${leading},` : ''}${last}.${(absolute % 100n).toString().padStart(2, '0')}`;
}
// Display form for summaries: whole rupees drop the ".00", paise are kept when present.
export const formatAmount = (cents: number) => formatINR(cents).replace(/\.00$/, '');
export function parseINR(text: string): number {
  const value = text.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(value)) throw new Error('Enter an amount with up to two decimal places.');
  const [whole, fraction = ''] = value.split('.');
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (cents < 1n || cents > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Enter a positive amount within the supported range.');
  return Number(cents);
}
export const greeting = (name: string) => `Hi, ${name.trim().split(/\s+/)[0] || 'there'}`;
// Two words give their first letters ("Priya Sharma" → "PS"); one word gives its first two ("Trip" → "TR").
export const initials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.length === 1 ? Array.from(parts[0]).slice(0, 2) : parts.slice(0, 2).map(part => Array.from(part)[0])).join('').toUpperCase();
};
// Compact list date: "15 Nov", with the year only when it isn't this year.
export const shortDate = (iso: string, now = new Date()) => { const date = new Date(iso); return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }) }); };
export const formatDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
export const isJoinCode = (code: string) => /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/.test(code.trim().toUpperCase());

// Reading exp is only a local expiry check. The API still verifies the signature.
export function tokenExpiry(token: string): number {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const payload = token.split('.')[1]?.replace(/-/g, '+').replace(/_/g, '/');
  if (!payload) throw new Error('Invalid session');
  let bits = 0; let buffer = 0; let json = '';
  for (const char of payload.replace(/=+$/, '')) {
    const digit = alphabet.indexOf(char);
    if (digit < 0) throw new Error('Invalid session');
    buffer = (buffer << 6) | digit; bits += 6;
    if (bits >= 8) { bits -= 8; json += String.fromCharCode((buffer >> bits) & 255); }
  }
  const exp: unknown = JSON.parse(json).exp;
  if (typeof exp !== 'number' || !Number.isFinite(exp)) throw new Error('Invalid session');
  return exp * 1000;
}
