import express from 'express';
import { getProfile, updateProfile } from '../controllers/settings.controller.js';
import { verifyToken } from '../middleware/auth.middleware.js';

const router = express.Router();
router.use(verifyToken);

router.get('/profile', getProfile);
router.put('/profile', updateProfile);

export default router;