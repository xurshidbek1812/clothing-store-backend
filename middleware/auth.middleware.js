import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';

export const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        message: "Token topilmadi",
      });
    }

    const token = authHeader.split(' ')[1];

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      include: {
        userStores: {
          include: {
            store: true,
          },
        },
      },
    });

    if (!user) {
      return res.status(401).json({
        message: "Foydalanuvchi topilmadi",
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        message: "Foydalanuvchi nofaol",
      });
    }

    req.user = {
      id: user.id,
      fullName: user.fullName,
      username: user.username,
      role: user.role,
      stores: user.userStores.map((item) => item.store),
    };

    next();
  } catch (error) {
    console.error('verifyToken error:', error);
    return res.status(401).json({
      message: "Noto'g'ri yoki eskirgan token",
    });
  }
};

export const resolveStoreAccess = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        message: "Foydalanuvchi aniqlanmadi",
      });
    }

    const headerStoreId = req.headers['x-store-id'];

    if (!headerStoreId) {
      return res.status(400).json({
        message: "Store tanlanmagan",
      });
    }

    const storeId = String(headerStoreId);

    const hasAccess =
      req.user.role === 'DIRECTOR' ||
      (req.user.stores || []).some((store) => store.id === storeId);

    if (!hasAccess) {
      return res.status(403).json({
        message: "Sizda bu do'konga ruxsat yo'q",
      });
    }

    req.storeId = storeId;
    next();
  } catch (error) {
    console.error('resolveStoreAccess error:', error);
    return res.status(500).json({
      message: "Store access tekshirishda xatolik",
    });
  }
};

export const requireRole = (roles = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        message: "Foydalanuvchi aniqlanmadi",
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        message: "Sizda bu amal uchun ruxsat yo'q",
      });
    }

    next();
  };
};

export const isDirector = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      message: "Foydalanuvchi aniqlanmadi",
    });
  }

  if (req.user.role !== 'DIRECTOR') {
    return res.status(403).json({
      message: "Faqat direktor uchun",
    });
  }

  next();
};