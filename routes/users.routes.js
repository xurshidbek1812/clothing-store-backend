import express from 'express';
import {
  createUser,
  getUsers,
  getUserById,
  updateUser,
} from '../controllers/users.controller.js';
import {
  verifyToken,
  isDirector,
} from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(verifyToken);
router.use(isDirector);

router.get('/', getUsers);
router.get('/:userId', getUserById);
router.post('/', createUser);
router.put('/:userId', updateUser);

export default router;