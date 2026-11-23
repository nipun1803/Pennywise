import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { openapi } from './openapi';
import mongoose from 'mongoose';
import type { AppConfig } from './config/env';
import { apiRoutes } from './routes';
import { ApiError, errorHandler } from './utils/errors';
import { createRateLimiters } from './middleware/rate-limit';

export function createApp(config: AppConfig) {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', config.trustProxy);
  const limiters = config.rateLimits ? createRateLimiters(config.rateLimits) : undefined;
  app.use(helmet());
  app.use(cors({ origin: (origin, callback) => {
    if (!origin || config.corsOrigins.includes(origin)) callback(null, true);
    else callback(new ApiError(403, 'CORS_FORBIDDEN', 'Origin is not allowed'));
  } }));
  if (limiters) app.use((req, res, next) => req.path === '/health' ? next() : limiters.global(req, res, next));
  app.use((req, res, next) => req.path === '/media/images' ? next() : express.json({ limit: '1mb' })(req, res, next));
  app.get('/openapi.json', (_req, res) => res.json(openapi));
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi, { swaggerOptions: { persistAuthorization: false }, customSiteTitle: 'Pennywise API' }));
  app.get('/health', (_req, res) => {
    const connected = mongoose.connection.readyState === 1;
    res.status(connected ? 200 : 503).json({ data: { status: connected ? 'ok' : 'unavailable' } });
  });
  if (limiters) {
    app.use(['/auth/signup', '/auth/login'], limiters.auth);
  }
  app.use(apiRoutes(config.jwtSecret, limiters?.join));
  app.use((_req, _res, next) => next(new ApiError(404, 'NOT_FOUND', 'Endpoint not found')));
  app.use(errorHandler);
  return app;
}
