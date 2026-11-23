import { z } from 'zod';
import type { RateLimitOptions } from '../middleware/rate-limit';

export interface AppConfig { jwtSecret: string; corsOrigins: string[]; trustProxy?: number; rateLimits?: RateLimitOptions }

export function readEnvironment() {
  const env = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    MONGODB_URI: z.string().min(1),
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must contain at least 32 characters'),
    CORS_ORIGINS: z.string().default(''),
    // Reverse-proxy hops in front of the API (Render, a load balancer). Leave 0 when clients connect directly.
    TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
  }).parse(process.env);
  return { ...env, jwtSecret: env.JWT_SECRET, trustProxy: env.TRUST_PROXY, corsOrigins: env.CORS_ORIGINS.split(',').map(s => s.trim()).filter(Boolean) };
}
