import { Router } from 'express';
import { requireAnyPerm } from '../../middlewares/requirePerm';
import { listTrashRows, listTrashTables, restoreTrashRow } from './trash.controller';

const router = Router();

router.get('/tables', requireAnyPerm(['trash.view']), listTrashTables);
router.get('/rows', requireAnyPerm(['trash.view']), listTrashRows);
router.post('/:table/:id/restore', requireAnyPerm(['trash.restore']), restoreTrashRow);

export default router;
