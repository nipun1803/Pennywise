import { Router } from 'express';
import * as settlements from '../controllers/settlements';

export function settlementRoutes() {
  const router = Router({ mergeParams: true });
  router.post('/', settlements.create);
  router.get('/', settlements.list);
  router.put('/:sid', settlements.edit);
  router.delete('/:sid', settlements.remove);
  return router;
}
