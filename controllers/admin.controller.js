import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ==========================================
// 1. DO'KONLAR BOSHQARUVI
// ==========================================

// Barcha do'konlarni ko'rish
export const getStores = async (req, res) => {
  try {
    const stores = await prisma.store.findMany({
      include: { _count: { select: { users: true } } } // Do'konda nechta ishchi borligini ham sanab beradi
    });
    res.json(stores);
  } catch (error) {
    res.status(500).json({ message: "Do'konlarni olishda xatolik!" });
  }
};

// Yangi do'kon yaratish
export const createStore = async (req, res) => {
  const { name, address } = req.body;
  try {
    const store = await prisma.store.create({
      data: { name, address }
    });
    res.status(201).json({ message: "Yangi do'kon muvaffaqiyatli yaratildi!", store });
  } catch (error) {
    res.status(500).json({ message: "Do'kon yaratishda xatolik!" });
  }
};

// ==========================================
// 2. XODIMLAR (ISHCHILAR) BOSHQARUVI
// ==========================================

// Barcha ishchilarni ko'rish
export const getEmployees = async (req, res) => {
  try {
    const employees = await prisma.user.findMany({
      where: { role: 'SELLER' }, // Faqat oddiy ishchilarni ko'rsatamiz (Bosh admin o'zini ko'rishi shart emas bu yerda)
      include: { stores: true }, // Qaysi do'konlarga ulanganini ham ko'rsatamiz
      orderBy: { createdAt: 'desc' }
    });
    // Parollarni xavfsizlik uchun yashiramiz
    const safeEmployees = employees.map(emp => {
      const { password, ...rest } = emp;
      return rest;
    });
    res.json(safeEmployees);
  } catch (error) {
    res.status(500).json({ message: "Ishchilarni olishda xatolik!" });
  }
};

// Yangi ishchi yaratish va unga do'konlarni biriktirish
export const createEmployee = async (req, res) => {
  const { name, username, password, storeIds } = req.body; // storeIds - bu do'konlar ID lari arrayi ['id1', 'id2']

  try {
    // Username band emasligini tekshiramiz
    const existingUser = await prisma.user.findUnique({ where: { username } });
    if (existingUser) {
      return res.status(400).json({ message: "Bu foydalanuvchi nomi (username) band!" });
    }

    // Parolni shifrlaymiz
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Prisma 'connect' orqali ishchini ro'yxatdagi do'konlarga ulaymiz
    const storeConnections = storeIds.map(id => ({ id }));

    const newEmployee = await prisma.user.create({
      data: {
        name,
        username,
        password: hashedPassword,
        role: 'SELLER',
        stores: {
          connect: storeConnections // <--- Sehr aynan shu yerda!
        }
      }
    });

    res.status(201).json({ message: "Yangi ishchi muvaffaqiyatli qo'shildi!" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Ishchi yaratishda xatolik yuz berdi!" });
  }
};