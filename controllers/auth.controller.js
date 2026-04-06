import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';

const signToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      role: user.role,
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
};

// Direktor + birinchi store yaratish
export const register = async (req, res) => {
  try {
    const { fullName, username, password, storeName, storeAddress } = req.body;

    if (!fullName || !username || !password || !storeName) {
      return res.status(400).json({
        message: "fullName, username, password va storeName majburiy",
      });
    }

    const existingUser = await prisma.user.findUnique({
      where: { username },
    });

    if (existingUser) {
      return res.status(400).json({
        message: "Bu username allaqachon band",
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await prisma.$transaction(async (tx) => {
      const store = await tx.store.create({
        data: {
          name: storeName,
          address: storeAddress || null,
        },
      });

      const user = await tx.user.create({
        data: {
          fullName,
          username,
          passwordHash,
          role: Role.DIRECTOR,
        },
      });

      await tx.userStore.create({
        data: {
          userId: user.id,
          storeId: store.id,
        },
      });

      return { user, store };
    });

    const token = signToken(result.user);

    return res.status(201).json({
      message: "Direktor va do'kon muvaffaqiyatli yaratildi",
      token,
      user: {
        id: result.user.id,
        fullName: result.user.fullName,
        username: result.user.username,
        role: result.user.role,
        stores: [
          {
            id: result.store.id,
            name: result.store.name,
            address: result.store.address,
          },
        ],
      },
    });
  } catch (error) {
    console.error("register error:", error);
    return res.status(500).json({
      message: "Serverda xatolik yuz berdi",
    });
  }
};

export const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        message: "username va password majburiy",
      });
    }

    const user = await prisma.user.findUnique({
      where: { username },
      include: {
        stores: true,
      },
    });

    if (!user) {
      return res.status(400).json({
        message: "Foydalanuvchi topilmadi",
      });
    }

    if (user.isActive === false) {
      return res.status(400).json({
        message: "Foydalanuvchi nofaol",
      });
    }

    const hashedPassword = user.passwordHash || user.password;

    if (!hashedPassword) {
      console.error('User password field topilmadi:', user);
      return res.status(500).json({
        message: "User parol maydoni topilmadi",
      });
    }

    const isMatch = await bcrypt.compare(password, hashedPassword);

    if (!isMatch) {
      return res.status(400).json({
        message: "Parol noto'g'ri",
      });
    }

    const token = signToken(user);

    return res.json({
      token,
      user: {
        id: user.id,
        fullName: user.fullName || user.name || '',
        username: user.username,
        role: user.role,
        stores: (user.stores || []).map((store) => ({
          id: store.id,
          name: store.name,
          address: store.address || null,
          isActive: store.isActive ?? true,
        })),
      },
    });
  } catch (error) {
    console.error("login error:", error);
    return res.status(500).json({
      message: "Server xatosi",
    });
  }
};