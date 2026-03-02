import { Router } from 'express';
import { requireAuth } from '../../middlewares/requireAuth';
import { requireAnyPerm } from '../../middlewares/requirePerm';
import { createFixedAsset, deleteFixedAsset, listFixedAssets, updateFixedAsset } from './assets.controller';

const router = Router();

router.use(requireAuth);

router.get('/', requireAnyPerm(['accounts.view', 'reports.all']), listFixedAssets);
router.post('/', requireAnyPerm(['accounts.view', 'reports.all']), createFixedAsset);
router.put('/:id', requireAnyPerm(['accounts.view', 'reports.all']), updateFixedAsset);
router.delete('/:id', requireAnyPerm(['accounts.view', 'reports.all']), deleteFixedAsset);

export default router;

