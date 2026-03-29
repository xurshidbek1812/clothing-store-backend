import jwt from 'jsonwebtoken';

// 1. Tokenni tekshirish (Tizimga kirganligini tasdiqlash)
export const verifyToken = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: "Kirish taqiqlangan. Token topilmadi!" });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    req.user = decoded; 
    next(); 
  } catch (error) {
    return res.status(403).json({ message: "Yaroqsiz yoki muddati o'tgan token!" });
  }
};

// 2. Rolni tekshirish (Huquqlarni cheklash) - MANA SHU QISM YETISHMAYOTGAN EDI!
export const requireRole = (roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Bu amalni bajarish uchun huquqingiz yo'q!" });
    }
    next();
  };
};