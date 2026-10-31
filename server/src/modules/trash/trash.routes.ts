import { Router } from 'express';
import { requireAuth } from '../../middlewares/requireAuth';
import { requireAnyPerm } from '../../middlewares/requirePerm';
import { listTrashRows, listTrashTables, previewDeleteRow, restoreTrashRow } from './trash.controller';

const router = Router();

router.use(requireAuth);

router.get('/tables', requireAnyPerm(['trash.view']), listTrashTables);
router.get('/rows', requireAnyPerm(['trash.view']), listTrashRows);
router.post('/:table/:id/restore', requireAnyPerm(['trash.restore']), restoreTrashRow);

// Impact Preview (Central Delete Architecture, Phase 2): read-only dependency
// counts for a not-yet-deleted record. It is intentionally NOT gated behind
// trash.view/trash.restore permissions above - this is meant
// for any user about to delete a record they already have permission to
// delete; the real gate stays on that module's own DELETE endpoint.
router.get('/preview/:module/:id', previewDeleteRow);

export default router;
