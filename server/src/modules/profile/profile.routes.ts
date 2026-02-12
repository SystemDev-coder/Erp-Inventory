import { Router } from 'express';
import { requireAuth } from '../../middlewares/requireAuth';
import { getProfile, updateProfile, updatePassword } from './profile.controller';

const router = Router();

router.use(requireAuth);
router.get('/', getProfile);
router.put('/', updateProfile);
router.put('/password', updatePassword);

export default router;
