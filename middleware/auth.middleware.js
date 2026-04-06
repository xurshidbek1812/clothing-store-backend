import jwt from 'jsonwebtoken';
import { PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();

export const verifyToken = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        message: "Token topilmadi",
      });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({
      message: "Yaroqsiz yoki muddati o'tgan token",
    });
  }
};

export const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        message: "Bu amalni bajarish uchun ruxsat yo'q",
      });
    }
    next();
  };
};

export const isDirector = (req, res, next) => {
  if (!req.user || req.user.role !== Role.DIRECTOR) {
    return res.status(403).json({
      message: "Bu amalni faqat direktor bajara oladi",
    });
  }
  next();
};

export const resolveStoreAccess = async (req, res, next) => {
  try {
    const storeId = req.headers['x-store-id'] || req.params.storeId || req.body.storeId;

    if (!storeId) {
      return res.status(400).json({
        message: "storeId yuborilishi kerak",
      });
    }

    const link = await prisma.userStore.findFirst({
      where: {
        userId: req.user.id,
        storeId: String(storeId),
      },
    });

    if (!link) {
      return res.status(403).json({
        message: "Sizda bu do'kon bilan ishlash huquqi yo'q",
      });
    }

    req.storeId = String(storeId);
    next();
  } catch (error) {
    console.error("resolveStoreAccess error:", error);
    return res.status(500).json({
      message: "Store access tekshirishda xatolik",
    });
  }
};