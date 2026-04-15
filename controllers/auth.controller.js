import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pkg from '@prisma/client';
import { prisma } from '../lib/prisma.js';

const { Role } = pkg;

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

export const register = async (req, res) => {
  try {
    const { fullName, username, password, storeName, storeAddress } = req.body;

    if (!fullName || !username || !password || !storeName) {
      return res.status(400).json({
        message: "fullName, username, password va storeName majburiy",
      });
    }

    const existingUser = await prisma.user.findUnique({
      where: { username: String(username).trim() },
    });

    if (existingUser) {
      return res.status(400).json({
        message: "Bu username allaqachon mavjud",
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await prisma.$transaction(async (tx) => {
      const store = await tx.store.create({
        data: {
          name: String(storeName).trim(),
          address: storeAddress ? String(storeAddress).trim() : null,
        },
      });

      const user = await tx.user.create({
        data: {
          fullName: String(fullName).trim(),
          username: String(username).trim(),
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
      message: "Direktor va do'kon yaratildi",
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
            isActive: result.store.isActive,
          },
        ],
      },
    });
  } catch (error) {
    console.error('register error:', error);
    return res.status(500).json({
      message: "Server xatosi",
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
      where: {
        username: String(username).trim(),
      },
      include: {
        userStores: {
          include: {
            store: true,
          },
        },
      },
    });

    if (!user) {
      return res.status(400).json({
        message: "Foydalanuvchi topilmadi",
      });
    }

    if (!user.isActive) {
      return res.status(400).json({
        message: "Foydalanuvchi nofaol",
      });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);

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
        fullName: user.fullName,
        username: user.username,
        role: user.role,
        stores: user.userStores.map((item) => ({
          id: item.store.id,
          name: item.store.name,
          address: item.store.address,
          isActive: item.store.isActive,
        })),
      },
    });
  } catch (error) {
    console.error('login error:', error);
    return res.status(500).json({
      message: "Server xatosi",
    });
  }
};