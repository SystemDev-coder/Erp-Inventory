import { Router } from 'express';
import { requireAnyPerm, requireRoleName } from '../../middlewares/requirePerm';
import { listTrashRows, listTrashTables, restoreTrashRow } from './trash.controller';

const router = Router();

router.get('/tables', requireRoleName('developer'), requireAnyPerm(['trash.view']), listTrashTables);
router.get('/rows', requireRoleName('developer'), requireAnyPerm(['trash.view']), listTrashRows);
router.post('/:table/:id/restore', requireRoleName('developer'), requireAnyPerm(['trash.restore']), restoreTrashRow);

export default router;
