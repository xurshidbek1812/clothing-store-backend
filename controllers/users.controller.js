import bcrypt from 'bcryptjs';
import pkg from '@prisma/client';
import { prisma } from '../lib/prisma.js';

const { Role } = pkg;

export const createUser = async (req, res) => {
  try {
    const {
      fullName,
      username,
      password,
      role = 'SELLER',
      storeIds = [],
    } = req.body;

    if (!fullName || !username || !password) {
      return res.status(400).json({
        message: "fullName, username va password majburiy",
      });
    }

    if (!['DIRECTOR', 'SELLER'].includes(role)) {
      return res.status(400).json({
        message: "role faqat DIRECTOR yoki SELLER bo'lishi mumkin",
      });
    }

    if (!Array.isArray(storeIds) || storeIds.length === 0) {
      return res.status(400).json({
        message: "Kamida bitta store biriktirilishi kerak",
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

    const stores = await prisma.store.findMany({
      where: {
        id: { in: storeIds.map(String) },
        isActive: true,
      },
      select: { id: true, name: true },
    });

    if (stores.length !== new Set(storeIds.map(String)).size) {
      return res.status(404).json({
        message: "Store lardan biri topilmadi",
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          fullName: String(fullName).trim(),
          username: String(username).trim(),
          passwordHash,
          role: role === 'DIRECTOR' ? Role.DIRECTOR : Role.SELLER,
        },
      });

      await tx.userStore.createMany({
        data: [...new Set(storeIds.map(String))].map((storeId) => ({
          userId: createdUser.id,
          storeId,
        })),
      });

      return tx.user.findUnique({
        where: { id: createdUser.id },
        include: {
          userStores: {
            include: {
              store: true,
            },
          },
        },
      });
    });

    return res.status(201).json({
      message: "Xodim muvaffaqiyatli yaratildi",
      user,
    });
  } catch (error) {
    console.error("createUser error:", error);
    return res.status(500).json({
      message: "Serverda xatolik yuz berdi",
    });
  }
};

export const getUsers = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      include: {
        userStores: {
          include: {
            store: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return res.json(users);
  } catch (error) {
    console.error("getUsers error:", error);
    return res.status(500).json({
      message: "Serverda xatolik yuz berdi",
    });
  }
};

export const getUserById = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        userStores: {
          include: {
            store: true,
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({
        message: "Xodim topilmadi",
      });
    }

    return res.json(user);
  } catch (error) {
    console.error("getUserById error:", error);
    return res.status(500).json({
      message: "Serverda xatolik yuz berdi",
    });
  }
};

export const updateUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const {
      fullName,
      username,
      password,
      role,
      isActive,
      storeIds,
    } = req.body;

    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        userStores: true,
      },
    });

    if (!existingUser) {
      return res.status(404).json({
        message: "Xodim topilmadi",
      });
    }

    if (username && String(username).trim() !== existingUser.username) {
      const duplicate = await prisma.user.findUnique({
        where: { username: String(username).trim() },
      });

      if (duplicate) {
        return res.status(400).json({
          message: "Bu username allaqachon mavjud",
        });
      }
    }

    if (role && !['DIRECTOR', 'SELLER'].includes(role)) {
      return res.status(400).json({
        message: "role faqat DIRECTOR yoki SELLER bo'lishi mumkin",
      });
    }

    if (storeIds !== undefined) {
      if (!Array.isArray(storeIds) || storeIds.length === 0) {
        return res.status(400).json({
          message: "Kamida bitta store biriktirilishi kerak",
        });
      }

      const stores = await prisma.store.findMany({
        where: {
          id: { in: storeIds.map(String) },
          isActive: true,
        },
        select: { id: true },
      });

      if (stores.length !== new Set(storeIds.map(String)).size) {
        return res.status(404).json({
          message: "Store lardan biri topilmadi",
        });
      }
    }

    const updatedUser = await prisma.$transaction(async (tx) => {
      const data = {};

      if (fullName !== undefined) data.fullName = String(fullName).trim();
      if (username !== undefined) data.username = String(username).trim();
      if (role !== undefined) data.role = role === 'DIRECTOR' ? Role.DIRECTOR : Role.SELLER;
      if (isActive !== undefined) data.isActive = Boolean(isActive);

      if (password) {
        data.passwordHash = await bcrypt.hash(password, 10);
      }

      await tx.user.update({
        where: { id: userId },
        data,
      });

      if (storeIds !== undefined) {
        await tx.userStore.deleteMany({
          where: { userId },
        });

        await tx.userStore.createMany({
          data: [...new Set(storeIds.map(String))].map((storeId) => ({
            userId,
            storeId,
          })),
        });
      }

      return tx.user.findUnique({
        where: { id: userId },
        include: {
          userStores: {
            include: {
              store: true,
            },
          },
        },
      });
    });

    return res.json({
      message: "Xodim muvaffaqiyatli yangilandi",
      user: updatedUser,
    });
  } catch (error) {
    console.error("updateUser error:", error);
    return res.status(500).json({
      message: "Serverda xatolik yuz berdi",
    });
  }
};