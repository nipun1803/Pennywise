import { Router } from 'express';
import * as records from '../controllers/records';

export function recordRoutes() {
  const router = Router({ mergeParams: true });
  router.get('/activity', records.activity);
  router.get('/statements', records.statement);
  return router;
}
