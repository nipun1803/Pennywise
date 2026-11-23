import { Router } from 'express';
import * as users from '../controllers/users';

export function userRoutes() {
  const router = Router();
  router.get('/', users.me);
  router.patch('/', users.updateName);
  router.patch('/notifications', users.updateNotifications);
  router.put('/push-token', users.registerPushToken);
  router.delete('/push-token', users.removePushToken);
  return router;
}
