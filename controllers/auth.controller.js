import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();

// 1. RO'YXATDAN O'TISH (Yangi do'kon va Admin yaratish)
export const register = async (req, res) => {
  try {
    const { userName, phone, password, storeName, storeAddress } = req.body;

    // Telefon raqam bazada bor-yo'qligini tekshiramiz
    const existingUser = await prisma.user.findUnique({ where: { phone } });
    if (existingUser) {
      return res.status(400).json({ message: "Bu telefon raqam allaqachon ro'yxatdan o'tgan!" });
    }

    // Parolni shifrlaymiz
    const hashedPassword = await bcrypt.hash(password, 10);

    // Prisma'ning ajoyib xususiyati: Bitta so'rovda ham Do'kon, ham User yaratamiz
    const newUser = await prisma.user.create({
      data: {
        name: userName,
        phone,
        password: hashedPassword,
        role: 'ADMIN', // Birinchi ochgan odam avtomat ADMIN bo'ladi
        store: {
          create: {
            name: storeName,
            address: storeAddress
          }
        }
      },
      include: { store: true } // Yaratilgan do'kon ma'lumotini ham qaytarish uchun
    });

    res.status(201).json({ 
      message: "Do'kon va Admin muvaffaqiyatli yaratildi!", 
      user: { id: newUser.id, name: newUser.name, role: newUser.role, store: newUser.store.name }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

// 2. TIZIMGA KIRISH (Login)
export const login = async (req, res) => {
  try {
    const { phone, password } = req.body;

    // Userni topamiz
    const user = await prisma.user.findUnique({ where: { phone } });
    if (!user) {
      return res.status(404).json({ message: "Foydalanuvchi topilmadi!" });
    }

    // Parolni tekshiramiz
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ message: "Parol noto'g'ri!" });
    }

    // Token yaratamiz (ichiga user ID va Store ID ni solib qo'yamiz)
    const token = jwt.sign(
      { id: user.id, role: user.role, storeId: user.storeId },
      process.env.JWT_SECRET,
      { expiresIn: '7d' } // Token 7 kun yashaydi
    );

    res.status(200).json({
      message: "Muvaffaqiyatli kirdingiz!",
      token,
      user: { id: user.id, name: user.name, role: user.role }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};