import { prisma } from '../lib/prisma.js';

// 1. Yangi tovar va uning razmerlarini qo'shish
exports.createProduct = async (req, res) => {
  try {
    const { name, brand, gender, season, categoryId, storeId, sizes } = req.body;

    const newProduct = await prisma.product.create({
      data: {
        name,
        brand,
        gender,
        season,
        categoryId,
        storeId,
        // Razmerlarni tovar bilan birga qo'shamiz
        sizes: {
          create: sizes // [{ sizeLabel: "M", barcode: "111" }, ...]
        }
      },
      include: {
        sizes: true,
        category: true // Javobda kategoriya nomini ham ko'rish uchun
      }
    });

    res.status(201).json({ success: true, data: newProduct });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 2. Barcha tovarlarni ro'yxatini olish (Frontend jadvali uchun)
exports.getAllProducts = async (req, res) => {
  try {
    const { storeId } = req.query; // Qaysi do'konga tegishli tovarlar?

    const products = await prisma.product.findMany({
      where: {
        storeId: storeId,
        isActive: true
      },
      include: {
        category: true,
        sizes: true // Razmerlar va ulardagi 'stock' (qoldiq) avtomat keladi
      },
      orderBy: { createdAt: 'desc' }
    });

    res.status(200).json({ success: true, data: products });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Kategoriyalarni olish
exports.getCategories = async (req, res) => {
  try {
    const { storeId } = req.query;
    const categories = await prisma.category.findMany({
      where: { storeId: storeId }
    });
    res.status(200).json({ success: true, data: categories });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};