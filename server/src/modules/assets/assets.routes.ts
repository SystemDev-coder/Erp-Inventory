import { Router } from 'express';
import { requireAuth } from '../../middlewares/requireAuth';
import { requireAnyPerm } from '../../middlewares/requirePerm';
import { createFixedAsset, listFixedAssets } from './assets.controller';

const router = Router();

router.use(requireAuth);

router.get('/', requireAnyPerm(['accounts.view', 'reports.all']), listFixedAssets);
router.post('/', requireAnyPerm(['accounts.view', 'reports.all']), createFixedAsset);

export default router;

