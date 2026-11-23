import { rateLimit } from 'express-rate-limit';

export interface RateLimitOptions { windowMs: number; globalMax: number; authMax: number; joinMax: number }
// Counters live in process memory. Running several API instances needs a shared store.
export const defaultRateLimits: RateLimitOptions = { windowMs: 15 * 60_000, globalMax: 1500, authMax: 20, joinMax: 15 };

const limiter = (limit: number, windowMs: number, code: string, message: string, key?: (res: { locals: Record<string, unknown> }) => string) => rateLimit({
  windowMs, limit, standardHeaders: 'draft-8', legacyHeaders: false,
  ...(key ? { keyGenerator: (_req, res) => key(res) } : {}),
  handler: (_req, res) => { res.status(429).json({ error: { code, message } }); },
});
export function createRateLimiters(options: RateLimitOptions) {
  const tooMany = 'Too many requests. Please wait a few minutes and try again.';
  return {
    // Per IP, applied to every route except /health.
    global: limiter(options.globalMax, options.windowMs, 'RATE_LIMITED', tooMany),
    // Per IP, signup and login share one budget so email guessing and account farming are both bounded.
    auth: limiter(options.authMax, options.windowMs, 'AUTH_RATE_LIMITED', 'Too many sign-in attempts. Please wait a few minutes and try again.'),
    // Per signed-in user. Invite codes are bearer secrets, so guessing them must be slow.
    join: limiter(options.joinMax, options.windowMs, 'JOIN_RATE_LIMITED', 'Too many join attempts. Please wait a few minutes and try again.', res => String(res.locals.userId)),
  };
}
export type RateLimiters = ReturnType<typeof createRateLimiters>;
