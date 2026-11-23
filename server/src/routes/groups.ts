import { Router } from 'express';
import * as groups from '../controllers/groups';

export function groupRoutes() {
  const router = Router();
  router.post('/', groups.create);
  router.get('/', groups.list);
  router.post('/join', groups.join);
  return router;
}

export function groupMemberRoutes() {
  const router = Router({ mergeParams: true });
  router.get('/', groups.detail);
  router.patch('/', groups.rename);
  router.post('/join-code', groups.rotate);
  router.get('/members', groups.members);
  router.get('/balances', groups.balances);
  router.get('/settle-up', groups.settleUp);
  return router;
}
