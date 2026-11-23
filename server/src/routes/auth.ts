import { Router } from 'express';
import * as auth from '../controllers/auth';

export function authRoutes(secret: string) {
  const router = Router();
  router.post('/signup', auth.signup(secret));
  router.post('/login', auth.login(secret));
  return router;
}
