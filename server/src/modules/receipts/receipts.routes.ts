import { Router } from 'express';
import { requireAuth } from '../../middlewares/requireAuth';
import { requirePerm } from '../../middlewares/requirePerm';
import { listReceipts, createReceipt, updateReceipt, deleteReceipt } from './receipts.controller';

const router = Router();

router.use(requireAuth);

router.get('/', requirePerm('receipts.view'), listReceipts);
router.post('/', requirePerm('receipts.create'), createReceipt);
router.put('/:id', requirePerm('receipts.update'), updateReceipt);
router.delete('/:id', requirePerm('receipts.delete'), deleteReceipt);

export default router;
