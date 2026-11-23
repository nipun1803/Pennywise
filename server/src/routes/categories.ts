import { Router } from 'express';
import * as categories from '../controllers/categories';

export function categoryRoutes() {
  const router = Router({ mergeParams: true });
  router.get('/', categories.list);
  router.post('/', categories.create);
  router.patch('/:cid', categories.edit);
  return router;
}
