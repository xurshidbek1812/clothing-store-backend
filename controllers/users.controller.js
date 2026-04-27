import bcrypt from 'bcryptjs';
import pkg from '@prisma/client';
import { prisma } from '../lib/prisma.js';

const { Role } = pkg;

function isOwner(user) {
  return user?.role === 'OWNER';
}

function isDirector(user) {
  return user?.role === 'DIRECTOR';
}

function canManageUsers(user) {
  return isOwner(user) || isDirector(user);
}

function normalizeStoreIds(storeIds = []) {
  return [...new Set((storeIds || []).map(String).filter(Boolean))];
}

async function validateStores(storeIds) {
  const normalizedStoreIds = normalizeStoreIds(storeIds);

  if (!normalizedStoreIds.length) {
    return {
      ok: false,
      message: "Kamida bitta do'kon biriktirilishi kerak",
    };
  }

  const stores = await prisma.store.findMany({
    where: {
      id: { in: normalizedStoreIds },
      isActive: true,
    },
    select: { id: true },
  });

  if (stores.length !== normalizedStoreIds.length) {
    return {
      ok: false,
      message: "Store lardan biri topilmadi",
    };
  }

  return {
    ok: true,
    storeIds: normalizedStoreIds,
  };
}

function sanitizeUser(user) {
  if (!user) return user;

  const { passwordHash, ...rest } = user;
  return rest;
}

async function getOwnerCount(tx = prisma) {
  return tx.user.count({
    where: {
      role: Role.OWNER,
    },
  });
}

function canDirectorTouchTarget(currentUser, targetUser) {
  if (!isDirector(currentUser)) return false;
  return targetUser.role === Role.SELLER;
}

export const createUser = async (req, res) => {
  try {
    if (!canManageUsers(req.user)) {
      return res.status(403).json({
        message: "Sizda bu amal uchun ruxsat yo'q",
      });
    }

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

    if (!['OWNER', 'DIRECTOR', 'SELLER'].includes(role)) {
      return res.status(400).json({
        message: "role faqat OWNER, DIRECTOR yoki SELLER bo'lishi mumkin",
      });
    }

    if (isDirector(req.user) && role !== 'SELLER') {
      return res.status(403).json({
        message: 'Director faqat seller yarata oladi',
      });
    }

    const existingUser = await prisma.user.findUnique({
      where: { username: String(username).trim() },
    });

    if (existingUser) {
      return res.status(400).json({
        message: 'Bu username allaqachon mavjud',
      });
    }

    const storesValidation = await validateStores(storeIds);
    if (!storesValidation.ok) {
      return res.status(400).json({
        message: storesValidation.message,
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.$transaction(async (tx) => {
      if (role === 'OWNER' && !isOwner(req.user)) {
        throw new Error("Faqat owner owner yaratishi mumkin");
      }

      const createdUser = await tx.user.create({
        data: {
          fullName: String(fullName).trim(),
          username: String(username).trim(),
          passwordHash,
          role:
            role === 'OWNER'
              ? Role.OWNER
              : role === 'DIRECTOR'
              ? Role.DIRECTOR
              : Role.SELLER,
        },
      });

      await tx.userStore.createMany({
        data: storesValidation.storeIds.map((storeId) => ({
          userId: createdUser.id,
          storeId,
        })),
      });

      const created = await tx.user.findUnique({
        where: { id: createdUser.id },
        include: {
          userStores: {
            include: {
              store: true,
            },
          },
        },
      });

      return sanitizeUser(created);
    });

    return res.status(201).json({
      message: 'Xodim yaratildi',
      user,
    });
  } catch (error) {
    console.error('createUser error:', error);
    return res.status(500).json({
      message: error.message || 'Server xatosi',
    });
  }
};

export const getUsers = async (req, res) => {
  try {
    if (!canManageUsers(req.user)) {
      return res.status(403).json({
        message: "Sizda bu amal uchun ruxsat yo'q",
      });
    }

    const allUsers = await prisma.user.findMany({
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

    let users = allUsers;

    if (isDirector(req.user)) {
      users = allUsers.filter((user) => user.role === 'SELLER');
    }

    users = users.map(sanitizeUser);

    return res.json(users);
  } catch (error) {
    console.error('getUsers error:', error);
    return res.status(500).json({
      message: 'Server xatosi',
    });
  }
};

export const getUserById = async (req, res) => {
  try {
    if (!canManageUsers(req.user)) {
      return res.status(403).json({
        message: "Sizda bu amal uchun ruxsat yo'q",
      });
    }

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
        message: 'Xodim topilmadi',
      });
    }

    if (isDirector(req.user)) {
      if (!canDirectorTouchTarget(req.user, user)) {
        return res.status(403).json({
          message: "Director bu foydalanuvchini ko'ra olmaydi",
        });
      }
    }

    return res.json(sanitizeUser(user));
  } catch (error) {
    console.error('getUserById error:', error);
    return res.status(500).json({
      message: 'Server xatosi',
    });
  }
};

export const updateUser = async (req, res) => {
  try {
    if (!canManageUsers(req.user)) {
      return res.status(403).json({
        message: "Sizda bu amal uchun ruxsat yo'q",
      });
    }

    const { userId } = req.params;
    const {
      fullName,
      username,
      password,
      role,
      isActive,
      storeIds,
      makeOwner,
    } = req.body;

    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        userStores: true,
      },
    });

    if (!existingUser) {
      return res.status(404).json({
        message: 'Xodim topilmadi',
      });
    }

    if (req.user.id === userId && !isOwner(req.user)) {
      return res.status(403).json({
        message: "O'zingizni bu page orqali tahrirlay olmaysiz",
      });
    }

    if (isDirector(req.user)) {
      if (!canDirectorTouchTarget(req.user, existingUser)) {
        return res.status(403).json({
          message: 'Director faqat sellerlarni tahrirlay oladi',
        });
      }
    }

    if (username && String(username).trim() !== existingUser.username) {
      const duplicate = await prisma.user.findUnique({
        where: { username: String(username).trim() },
      });

      if (duplicate) {
        return res.status(400).json({
          message: 'Bu username allaqachon mavjud',
        });
      }
    }

    if (role && !['OWNER', 'DIRECTOR', 'SELLER'].includes(role)) {
      return res.status(400).json({
        message: "role faqat OWNER, DIRECTOR yoki SELLER bo'lishi mumkin",
      });
    }

    if (isDirector(req.user) && role && role !== 'SELLER') {
      return res.status(403).json({
        message: 'Director role o‘zgartira olmaydi',
      });
    }

    let validatedStoreIds = null;

    if (storeIds !== undefined) {
      const storesValidation = await validateStores(storeIds);

      if (!storesValidation.ok) {
        return res.status(400).json({
          message: storesValidation.message,
        });
      }

      validatedStoreIds = storesValidation.storeIds;
    }

    const updatedUser = await prisma.$transaction(async (tx) => {
      const data = {};

      if (fullName !== undefined) {
        const normalized = String(fullName).trim();
        if (!normalized) {
          throw new Error("To'liq ism majburiy");
        }
        data.fullName = normalized;
      }

      if (username !== undefined) {
        const normalized = String(username).trim();
        if (!normalized) {
          throw new Error('Username majburiy');
        }
        data.username = normalized;
      }

      if (password) {
        data.passwordHash = await bcrypt.hash(password, 10);
      }

      if (isActive !== undefined) {
        data.isActive = Boolean(isActive);
      }

      if (role !== undefined) {
        if (role === 'OWNER' && !isOwner(req.user)) {
          throw new Error("Faqat owner owner qila oladi");
        }

        data.role =
          role === 'OWNER'
            ? Role.OWNER
            : role === 'DIRECTOR'
            ? Role.DIRECTOR
            : Role.SELLER;
      }

      if (makeOwner === true) {
        if (!isOwner(req.user)) {
          throw new Error("Faqat owner ownerlikni o'tkaza oladi");
        }

        if (existingUser.role !== Role.DIRECTOR) {
          throw new Error("Faqat directorni owner qilish mumkin");
        }

        await tx.user.update({
          where: { id: req.user.id },
          data: {
            role: Role.DIRECTOR,
          },
        });

        data.role = Role.OWNER;
      }

      if (existingUser.role === Role.OWNER && role && role !== 'OWNER') {
        if (!isOwner(req.user)) {
          throw new Error("Faqat owner owner rolini o'zgartira oladi");
        }

        const ownerCount = await getOwnerCount(tx);
        if (ownerCount <= 1 && makeOwner !== true) {
          throw new Error("Kamida bitta owner qolishi kerak");
        }
      }

      await tx.user.update({
        where: { id: userId },
        data,
      });

      if (validatedStoreIds) {
        await tx.userStore.deleteMany({
          where: { userId },
        });

        await tx.userStore.createMany({
          data: validatedStoreIds.map((storeId) => ({
            userId,
            storeId,
          })),
        });
      }

      const finalUser = await tx.user.findUnique({
        where: { id: userId },
        include: {
          userStores: {
            include: {
              store: true,
            },
          },
        },
      });

      return sanitizeUser(finalUser);
    });

    return res.json({
      message: 'Xodim yangilandi',
      user: updatedUser,
    });
  } catch (error) {
    console.error('updateUser error:', error);
    return res.status(500).json({
      message: error.message || 'Server xatosi',
    });
  }
};