import { Router } from 'express';
import { requireAuth } from '../../middlewares/requireAuth';
import { requirePerm } from '../../middlewares/requirePerm';
import { listUsers, createUser, updateUser, deleteUser, listRoles } from './users.controller';

const router = Router();

router.use(requireAuth);
router.use(requirePerm('system.users'));

router.get('/', listUsers);
router.get('/roles', listRoles);
router.post('/', createUser);
router.put('/:id', updateUser);
router.delete('/:id', deleteUser);

export default router;
