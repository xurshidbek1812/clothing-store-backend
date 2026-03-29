import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const createProduct = async (req, res) => {
  try {
    const { name, sku, price, color, size } = req.body;
    const storeId = req.user.storeId;

    const existingProduct = await prisma.product.findUnique({ where: { sku } });
    if (existingProduct) {
      return res.status(400).json({ message: "Bu shtrix kodli tovar allaqachon mavjud!" });
    }

    const newProduct = await prisma.product.create({
      data: { name, sku, price, color, size, storeId }
    });

    res.status(201).json({ message: "Mahsulot muvaffaqiyatli qo'shildi!", product: newProduct });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

// 2. Do'kondagi tovarlarni sahifalab (Pagination) ko'rish
export const getProducts = async (req, res) => {
  try {
    const storeId = req.user.storeId;
    
    // URL'dan sahifa raqami va limitni (bitta sahifada nechta ko'rinishi) olamiz
    // Agar berilmagan bo'lsa, avtomat 1-sahifa va 10 ta tovar deb olamiz
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    
    // Nechta ma'lumotni tashlab o'tish kerakligini hisoblaymiz
    const skip = (page - 1) * limit;

    // 1. Faqat kerakli sahifadagi tovarlarni olamiz (skip va take yordamida)
    const products = await prisma.product.findMany({
      where: { storeId },
      orderBy: { id: 'desc' }, // Eng oxirgi qo'shilganlar birinchi chiqadi
      skip: skip,
      take: limit
    });

    // 2. Jami nechta tovar borligini hisoblaymiz (Frontendda sahifalar sonini chiqarish uchun)
    const totalItems = await prisma.product.count({
      where: { storeId }
    });

    // Javobni chiroyli qilib paketlab jo'natamiz
    res.status(200).json({
      products,
      totalPages: Math.ceil(totalItems / limit),
      currentPage: page,
      totalItems
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};