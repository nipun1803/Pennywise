import { Router } from 'express';
import * as dashboard from '../controllers/dashboard';

export function dashboardRoutes() {
  const router = Router();
  router.get('/dashboard', dashboard.summary);
  router.get('/activity', dashboard.activity);
  return router;
}
