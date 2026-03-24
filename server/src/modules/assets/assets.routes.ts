import { Router } from 'express';
import { requireAuth } from '../../middlewares/requireAuth';
import { requireAnyPerm } from '../../middlewares/requirePerm';
import { createAsset, deleteAsset, listAssets, updateAsset } from './assets.controller';

const router = Router();

router.use(requireAuth);

router.get('/', requireAnyPerm(['accounts.view', 'reports.all']), listAssets);
router.post('/', requireAnyPerm(['accounts.view', 'reports.all']), createAsset);
router.put('/:id', requireAnyPerm(['accounts.view', 'reports.all']), updateAsset);
router.delete('/:id', requireAnyPerm(['accounts.view', 'reports.all']), deleteAsset);

export default router;

