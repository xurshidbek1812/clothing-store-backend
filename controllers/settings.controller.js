import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';

export const getProfile = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
    });

    if (!user) {
      return res.status(404).json({
        message: 'Foydalanuvchi topilmadi',
      });
    }

    return res.json({
      id: user.id,
      username: user.username,
      fullName: user.fullName || '',
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  } catch (error) {
    console.error('getProfile error:', error);
    return res.status(500).json({
      message: 'Xatolik yuz berdi',
    });
  }
};

export const updateProfile = async (req, res) => {
  try {
    const { fullName, username, currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(404).json({
        message: 'Foydalanuvchi topilmadi',
      });
    }

    const updateData = {};

    if (fullName !== undefined) {
      const normalizedFullName = String(fullName || '').trim();

      if (!normalizedFullName) {
        return res.status(400).json({
          message: 'Ism majburiy',
        });
      }

      updateData.fullName = normalizedFullName;
    }

    if (username !== undefined) {
      const normalizedUsername = String(username || '').trim();

      if (!normalizedUsername) {
        return res.status(400).json({
          message: 'Login majburiy',
        });
      }

      const existingUsername = await prisma.user.findFirst({
        where: {
          username: normalizedUsername,
          NOT: {
            id: userId,
          },
        },
      });

      if (existingUsername) {
        return res.status(400).json({
          message: 'Bu login band',
        });
      }

      updateData.username = normalizedUsername;
    }

    const wantsPasswordChange =
      String(currentPassword || '').trim() || String(newPassword || '').trim();

    if (wantsPasswordChange) {
      if (!String(currentPassword || '').trim()) {
        return res.status(400).json({
          message: 'Hozirgi parolni kiriting',
        });
      }

      if (!String(newPassword || '').trim()) {
        return res.status(400).json({
          message: 'Yangi parolni kiriting',
        });
      }

      if (String(newPassword).length < 4) {
        return res.status(400).json({
          message: "Yangi parol kamida 4 ta belgidan iborat bo'lishi kerak",
        });
      }

      const isMatch = await bcrypt.compare(currentPassword, user.password);

      if (!isMatch) {
        return res.status(400).json({
          message: "Hozirgi parol noto'g'ri",
        });
      }

      const salt = await bcrypt.genSalt(10);
      updateData.password = await bcrypt.hash(String(newPassword), salt);
    }

    if (!Object.keys(updateData).length) {
      return res.status(400).json({
        message: "Yangilanadigan ma'lumot yuborilmadi",
      });
    }

    await prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    return res.json({
      message: "Ma'lumotlar muvaffaqiyatli yangilandi!",
    });
  } catch (error) {
    console.error('updateProfile error:', error);
    return res.status(500).json({
      message: "Yangilashda xatolik",
    });
  }
};