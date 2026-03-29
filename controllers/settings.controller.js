import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Foydalanuvchi va do'kon ma'lumotlarini olish
export const getProfile = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { store: true }
    });
    // Parolni frontendga yubormaymiz (xavfsizlik)
    delete user.password;
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: "Xatolik yuz berdi" });
  }
};

// Parol yoki ma'lumotlarni yangilash
export const updateProfile = async (req, res) => {
  const { name, storeName, currentPassword, newPassword } = req.body;
  const userId = req.user.id;
  const storeId = req.user.storeId;

  try {
    // 1. Do'kon nomini yangilash
    if (storeName) {
      await prisma.store.update({
        where: { id: storeId },
        data: { name: storeName }
      });
    }

    // 2. Foydalanuvchi ma'lumotlarini yangilash
    const updateData = { name };

    if (newPassword && currentPassword) {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      const isMatch = await bcrypt.compare(currentPassword, user.password);
      
      if (!isMatch) {
        return res.status(400).json({ message: "Hozirgi parol noto'g'ri!" });
      }
      
      const salt = await bcrypt.genSalt(10);
      updateData.password = await bcrypt.hash(newPassword, salt);
    }

    await prisma.user.update({
      where: { id: userId },
      data: updateData
    });

    res.json({ message: "Ma'lumotlar muvaffaqiyatli yangilandi!" });
  } catch (error) {
    res.status(500).json({ message: "Yangilashda xatolik" });
  }
};