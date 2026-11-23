import { Router } from 'express';
import * as expenses from '../controllers/expenses';

export function expenseRoutes() {
  const router = Router({ mergeParams: true });
  router.post('/', expenses.create);
  router.get('/', expenses.list);
  router.get('/:eid', expenses.detail);
  router.put('/:eid', expenses.edit);
  router.delete('/:eid', expenses.remove);
  return router;
}
