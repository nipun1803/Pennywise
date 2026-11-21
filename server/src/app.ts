import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { openapi } from './openapi';
import mongoose from 'mongoose';
import type { AppConfig } from './config/env';
import { apiRoutes } from './routes';
import { ApiError, errorHandler } from './utils/errors';

export function createApp(config: AppConfig) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: (origin, callback) => {
    if (!origin || config.corsOrigins.includes(origin)) callback(null, true);
    else callback(new ApiError(403, 'CORS_FORBIDDEN', 'Origin is not allowed'));
  } }));
  app.use((req, res, next) => req.path === '/media/images' ? next() : express.json({ limit: '1mb' })(req, res, next));
  app.get('/openapi.json', (_req, res) => res.json(openapi));
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi, { swaggerOptions: { persistAuthorization: false }, customSiteTitle: 'Pennywise API' }));
  app.get('/health', (_req, res) => {
    const connected = mongoose.connection.readyState === 1;
    res.status(connected ? 200 : 503).json({ data: { status: connected ? 'ok' : 'unavailable' } });
  });
  app.use(apiRoutes(config.jwtSecret));
  app.use((_req, _res, next) => next(new ApiError(404, 'NOT_FOUND', 'Endpoint not found')));
  app.use(errorHandler);
  return app;
}
