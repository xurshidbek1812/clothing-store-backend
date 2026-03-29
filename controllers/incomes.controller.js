import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 1. Yangi kirim qilish (Omborga tovar qo'shish)
export const addIncome = async (req, res) => {
  try {
    const { productId, quantity, costPrice } = req.body;
    const storeId = req.user.storeId;

    // Bazaga yangi kirimni saqlaymiz
    const newIncome = await prisma.income.create({
      data: {
        quantity: Number(quantity),
        costPrice: Number(costPrice),
        productId,
        storeId
      },
      // Qaysi tovar ekanligini ham qo'shib qaytarib yuboramiz (Frontedda ismini ko'rsatish uchun)
      include: { product: true } 
    });

    // Kirim yaratilgandan keyin product qoldig'ini yangilaymiz
    await prisma.product.update({
      where: { id: productId },
      data: { stock: { increment: Number(quantity) } }
    });

    res.status(201).json({ message: "Omborga tovar muvaffaqiyatli kiritildi!", income: newIncome });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

// 2. Barcha kirimlarni ko'rish
export const getIncomes = async (req, res) => {
  try {
    const storeId = req.user.storeId;

    const incomes = await prisma.income.findMany({
      where: { storeId },
      include: { 
        product: { select: { name: true, sku: true, size: true } } // Tovar nomini ham qo'shib olib kelamiz
      },
      orderBy: { date: 'desc' } // Eng oxirgi kirimlar birinchi chiqadi
    });

    res.status(200).json(incomes);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};