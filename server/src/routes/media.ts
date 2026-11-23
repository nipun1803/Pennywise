import express, { Router } from 'express';
import * as media from '../controllers/media';

export function mediaRoutes() {
  const router = Router();
  // app.ts skips its 1mb JSON parser for this path so the larger limit applies.
  router.post('/images', express.json({ limit: '7mb' }), media.upload);
  return router;
}
