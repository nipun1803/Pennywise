import { z } from 'zod';

export interface AppConfig { jwtSecret: string; corsOrigins: string[] }

export function readEnvironment() {
  const env = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    MONGODB_URI: z.string().min(1),
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must contain at least 32 characters'),
    CORS_ORIGINS: z.string().default(''),
  }).parse(process.env);
  return { ...env, jwtSecret: env.JWT_SECRET, corsOrigins: env.CORS_ORIGINS.split(',').map(s => s.trim()).filter(Boolean) };
}
