import { Router, type RequestHandler } from 'express';
import { authenticate } from '../middleware/auth';
import { requireMembership } from '../middleware/membership';
import { authRoutes } from './auth';
import { userRoutes } from './users';
import { mediaRoutes } from './media';
import { dashboardRoutes } from './dashboard';
import { groupRoutes, groupMemberRoutes } from './groups';
import { recordRoutes } from './records';
import { categoryRoutes } from './categories';
import { expenseRoutes } from './expenses';
import { settlementRoutes } from './settlements';

export function apiRoutes(secret: string, joinLimiter?: RequestHandler) {
  const router = Router();
  router.use('/auth', authRoutes(secret));
  // Everything below requires a valid bearer token.
  router.use(authenticate(secret));
  router.use('/media', mediaRoutes());
  router.use('/me', userRoutes());
  router.use(dashboardRoutes());
  // Mounted before '/groups/:id' so POST /groups/join is not read as a group id.
  if (joinLimiter) router.use('/groups/join', (req, res, next) => req.method === 'POST' ? joinLimiter(req, res, next) : next());
  router.use('/groups', groupRoutes());
  const member = Router({ mergeParams: true });
  router.use('/groups/:id', requireMembership, member);
  member.use(groupMemberRoutes());
  member.use(recordRoutes());
  member.use('/categories', categoryRoutes());
  member.use('/expenses', expenseRoutes());
  member.use('/settlements', settlementRoutes());
  return router;
}
