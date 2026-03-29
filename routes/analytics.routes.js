import express from 'express';
import { getDashboardStats } from '../controllers/analytics.controller.js';
import { verifyToken } from '../middleware/auth.middleware.js';

const router = express.Router();
router.get('/stats', verifyToken, getDashboardStats);

export default router;