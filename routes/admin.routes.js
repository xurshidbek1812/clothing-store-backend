import express from 'express';
import { getStores, createStore, getEmployees, createEmployee } from '../controllers/admin.controller.js';
import { verifyToken, isAdmin } from '../middleware/auth.middleware.js';

const router = express.Router();

// Barcha yo'llar uchun avval token, keyin ADMIN ekanligini tekshiramiz
router.use(verifyToken, isAdmin);

// Do'konlar uchun yo'llar
router.route('/stores')
  .get(getStores)
  .post(createStore);

// Ishchilar uchun yo'llar
router.route('/employees')
  .get(getEmployees)
  .post(createEmployee);

export default router;