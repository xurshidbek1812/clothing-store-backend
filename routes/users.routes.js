import express from 'express';
import {
  createUser,
  getUsers,
  getUserById,
  updateUser,
} from '../controllers/users.controller.js';
import { verifyToken } from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(verifyToken);

router.get('/', createSafeHandler(getUsers));
router.get('/:userId', createSafeHandler(getUserById));
router.post('/', createSafeHandler(createUser));
router.put('/:userId', createSafeHandler(updateUser));

function createSafeHandler(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

export default router;