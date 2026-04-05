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
  const { username, password } = req.body; 

  try {
    // 1. "store" emas, "stores" deb yozamiz (Prisma shuni talab qildi)
    const user = await prisma.user.findUnique({ 
      where: { username },
      include: { stores: true } // <--- MANA SHU YER TO'G'IRLANDI
    });
    
    if (!user) {
      return res.status(400).json({ message: "Foydalanuvchi topilmadi!" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Parol noto'g'ri!" });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role }, 
      process.env.JWT_SECRET, 
      { expiresIn: '1d' }
    );

    // 2. "user.stores" allaqachon Array bo'lib keladi, uni to'g'ridan-to'g'ri beramiz
    res.json({ 
      token, 
      user: { 
        id: user.id, 
        name: user.name, 
        username: user.username, 
        role: user.role,
        stores: user.stores // <--- MANA SHU YER TO'G'IRLANDI
      } 
    });
  } catch (error) {
    console.error(error); 
    res.status(500).json({ message: "Server xatosi!" });
  }
};