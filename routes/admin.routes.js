import express from 'express';
import { verifyToken, isDirector } from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(verifyToken);
router.use(isDirector);

// admin route'lar shu yerda
router.get('/dashboard', (req, res) => {
  res.json({ message: 'Director panel' });
});

export default router;