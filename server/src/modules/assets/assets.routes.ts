import { Router } from 'express';
import { requireAuth } from '../../middlewares/requireAuth';
import { requireAnyPerm } from '../../middlewares/requirePerm';
import { createAsset, deleteAsset, listAssets, updateAsset } from './assets.controller';

const router = Router();

router.use(requireAuth);

// Phase 10 RBAC audit fix: was gated by 'accounts.view'/'reports.all' (read
// permissions), which let Viewer/Accountant/anyone with report-export
// create, edit, and delete fixed assets. Use the dedicated fixed_assets.*
// keys that already exist in the permission catalog (granted only to
// Administrator/Developer) instead.
router.get('/', requireAnyPerm(['fixed_assets.view', 'accounts.view', 'reports.all']), listAssets);
router.post('/', requireAnyPerm(['fixed_assets.create']), createAsset);
router.put('/:id', requireAnyPerm(['fixed_assets.update']), updateAsset);
router.delete('/:id', requireAnyPerm(['fixed_assets.delete']), deleteAsset);

export default router;

