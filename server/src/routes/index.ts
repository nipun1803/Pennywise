import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireMembership } from '../middleware/membership';
import * as auth from '../controllers/auth';
import * as users from '../controllers/users';
import * as groups from '../controllers/groups';
import * as expenses from '../controllers/expenses';
import * as settlements from '../controllers/settlements';

export function apiRoutes(secret: string) {
  const router = Router();
  router.post('/auth/signup', auth.signup(secret));
  router.post('/auth/login', auth.login(secret));
  router.use(authenticate(secret));
  router.get('/me', users.me);
  router.patch('/me', users.updateName);
  router.post('/groups', groups.create);
  router.get('/groups', groups.list);
  router.post('/groups/join', groups.join);
  const member = Router({ mergeParams: true });
  router.use('/groups/:id', requireMembership, member);
  member.get('/', groups.detail);
  member.patch('/', groups.rename);
  member.post('/join-code', groups.rotate);
  member.get('/members', groups.members);
  member.get('/balances', groups.balances);
  member.get('/settle-up', groups.settleUp);
  member.post('/expenses', expenses.create);
  member.get('/expenses', expenses.list);
  member.put('/expenses/:eid', expenses.edit);
  member.delete('/expenses/:eid', expenses.remove);
  member.post('/settlements', settlements.create);
  member.get('/settlements', settlements.list);
  member.put('/settlements/:sid', settlements.edit);
  member.delete('/settlements/:sid', settlements.remove);
  return router;
}
