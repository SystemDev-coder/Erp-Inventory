import { Router } from 'express';
import { requireAuth } from '../../middlewares/requireAuth';
import { requirePerm } from '../../middlewares/requirePerm';
import {
  listCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  deleteCustomer,
} from './customers.controller';

const router = Router();

router.use(requireAuth);

router.get('/', requirePerm('customers.view'), listCustomers);
router.get('/:id', requirePerm('customers.view'), getCustomer);
router.post('/', requirePerm('customers.create'), createCustomer);
router.put('/:id', requirePerm('customers.update'), updateCustomer);
router.delete('/:id', requirePerm('customers.delete'), deleteCustomer);

export default router;
