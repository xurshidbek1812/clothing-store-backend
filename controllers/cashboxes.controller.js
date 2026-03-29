import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 1. Yangi kassa yaratish (Masalan: "Asosiy naqd kassa", "Plastik kassa")
export const createCashbox = async (req, res) => {
  try {
    const { name, balance } = req.body;
    const storeId = req.user.storeId;

    // Kassa nomi shu do'konda avval ochilmaganiga ishonch hosil qilamiz
    const existingCashbox = await prisma.cashbox.findFirst({
      where: { name, storeId }
    });

    if (existingCashbox) {
      return res.status(400).json({ message: "Bu nomdagi kassa allaqachon mavjud!" });
    }

    const newCashbox = await prisma.cashbox.create({
      data: {
        name,
        balance: Number(balance) || 0, // Agar boshlang'ich summa kiritilmasa, 0 so'm bo'ladi
        storeId
      }
    });

    res.status(201).json({ message: "Kassa muvaffaqiyatli yaratildi!", cashbox: newCashbox });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

// 2. Do'kondagi barcha kassalarni va ulardagi pullarni ko'rish
export const getCashboxes = async (req, res) => {
  try {
    const storeId = req.user.storeId;

    const cashboxes = await prisma.cashbox.findMany({
      where: { storeId },
      orderBy: { id: 'asc' } // <--- XATO SHU YERDA EDI (createdAt o'rniga id yozamiz)
    });

    res.status(200).json(cashboxes);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};