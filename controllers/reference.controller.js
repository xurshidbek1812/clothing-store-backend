import pkg from '@prisma/client';
import { prisma } from '../lib/prisma.js';

const { Prisma } = pkg;

// ==================== CATEGORIES ====================

export const getCategories = async (req, res) => {
  try {
    const storeId = req.storeId;

    const categories = await prisma.category.findMany({
      where: { storeId },
      orderBy: { createdAt: 'desc' },
    });

    return res.json(categories);
  } catch (error) {
    console.error('getCategories error:', error);
    return res.status(500).json({
      message: "Serverda xatolik yuz berdi",
    });
  }
};

export const createCategory = async (req, res) => {
  try {
    const storeId = req.storeId;
    const { name } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({
        message: "name majburiy",
      });
    }

    const category = await prisma.category.create({
      data: {
        storeId,
        name: String(name).trim(),
      },
    });

    return res.status(201).json({
      message: "Kategoriya muvaffaqiyatli yaratildi",
      category,
    });
  } catch (error) {
    console.error('createCategory error:', error);

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return res.status(400).json({
        message: "Bu nomdagi kategoriya shu do'konda allaqachon mavjud",
      });
    }

    return res.status(500).json({
      message: "Serverda xatolik yuz berdi",
    });
  }
};

export const updateCategory = async (req, res) => {
  try {
    const storeId = req.storeId;
    const { categoryId } = req.params;
    const { name } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({
        message: "name majburiy",
      });
    }

    const existing = await prisma.category.findFirst({
      where: {
        id: categoryId,
        storeId,
      },
    });

    if (!existing) {
      return res.status(404).json({
        message: "Kategoriya topilmadi",
      });
    }

    const category = await prisma.category.update({
      where: { id: categoryId },
      data: {
        name: String(name).trim(),
      },
    });

    return res.json({
      message: "Kategoriya yangilandi",
      category,
    });
  } catch (error) {
    console.error('updateCategory error:', error);

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return res.status(400).json({
        message: "Bu nomdagi kategoriya shu do'konda allaqachon mavjud",
      });
    }

    return res.status(500).json({
      message: "Serverda xatolik yuz berdi",
    });
  }
};

// ==================== EXPENSE CATEGORIES ====================

export const getExpenseCategories = async (req, res) => {
  try {
    const storeId = req.storeId;

    const categories = await prisma.expenseCategory.findMany({
      where: { storeId },
      orderBy: { createdAt: 'desc' },
    });

    return res.json(categories);
  } catch (error) {
    console.error('getExpenseCategories error:', error);
    return res.status(500).json({
      message: "Serverda xatolik yuz berdi",
    });
  }
};

export const createExpenseCategory = async (req, res) => {
  try {
    const storeId = req.storeId;
    const { name } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({
        message: "name majburiy",
      });
    }

    const expenseCategory = await prisma.expenseCategory.create({
      data: {
        storeId,
        name: String(name).trim(),
      },
    });

    return res.status(201).json({
      message: "Xarajat moddasi muvaffaqiyatli yaratildi",
      expenseCategory,
    });
  } catch (error) {
    console.error('createExpenseCategory error:', error);

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return res.status(400).json({
        message: "Bu nomdagi xarajat moddasi shu do'konda allaqachon mavjud",
      });
    }

    return res.status(500).json({
      message: "Serverda xatolik yuz berdi",
    });
  }
};

export const updateExpenseCategory = async (req, res) => {
  try {
    const storeId = req.storeId;
    const { expenseCategoryId } = req.params;
    const { name } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({
        message: "name majburiy",
      });
    }

    const existing = await prisma.expenseCategory.findFirst({
      where: {
        id: expenseCategoryId,
        storeId,
      },
    });

    if (!existing) {
      return res.status(404).json({
        message: "Xarajat moddasi topilmadi",
      });
    }

    const expenseCategory = await prisma.expenseCategory.update({
      where: { id: expenseCategoryId },
      data: {
        name: String(name).trim(),
      },
    });

    return res.json({
      message: "Xarajat moddasi yangilandi",
      expenseCategory,
    });
  } catch (error) {
    console.error('updateExpenseCategory error:', error);

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return res.status(400).json({
        message: "Bu nomdagi xarajat moddasi shu do'konda allaqachon mavjud",
      });
    }

    return res.status(500).json({
      message: "Serverda xatolik yuz berdi",
    });
  }
};

// ==================== SIZES ====================

export const getSizes = async (req, res) => {
  try {
    const sizes = await prisma.size.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return res.json(sizes);
  } catch (error) {
    console.error('getSizes error:', error);
    return res.status(500).json({
      message: "Serverda xatolik yuz berdi",
    });
  }
};

export const createSize = async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({
        message: "name majburiy",
      });
    }

    const size = await prisma.size.create({
      data: {
        name: String(name).trim(),
      },
    });

    return res.status(201).json({
      message: "Razmer muvaffaqiyatli yaratildi",
      size,
    });
  } catch (error) {
    console.error('createSize error:', error);

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return res.status(400).json({
        message: "Bu razmer allaqachon mavjud",
      });
    }

    return res.status(500).json({
      message: "Serverda xatolik yuz berdi",
    });
  }
};

export const updateSize = async (req, res) => {
  try {
    const { sizeId } = req.params;
    const { name } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({
        message: "name majburiy",
      });
    }

    const existing = await prisma.size.findUnique({
      where: { id: sizeId },
    });

    if (!existing) {
      return res.status(404).json({
        message: "Razmer topilmadi",
      });
    }

    const size = await prisma.size.update({
      where: { id: sizeId },
      data: {
        name: String(name).trim(),
      },
    });

    return res.json({
      message: "Razmer yangilandi",
      size,
    });
  } catch (error) {
    console.error('updateSize error:', error);

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return res.status(400).json({
        message: "Bu razmer allaqachon mavjud",
      });
    }

    return res.status(500).json({
      message: "Serverda xatolik yuz berdi",
    });
  }
};

// ==================== CURRENCIES ====================

export const getCurrencies = async (req, res) => {
  try {
    const currencies = await prisma.currency.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return res.json(currencies);
  } catch (error) {
    console.error('getCurrencies error:', error);
    return res.status(500).json({
      message: "Serverda xatolik yuz berdi",
    });
  }
};

export const createCurrency = async (req, res) => {
  try {
    const { name, code, symbol, rate = 1, isDefault = false } = req.body;

    if (!name || !code || !symbol) {
      return res.status(400).json({
        message: "name, code va symbol majburiy",
      });
    }

    const parsedRate = Number(rate);

    if (Number.isNaN(parsedRate) || parsedRate <= 0) {
      return res.status(400).json({
        message: "rate musbat son bo'lishi kerak",
      });
    }

    const currency = await prisma.$transaction(async (tx) => {
      if (Boolean(isDefault)) {
        await tx.currency.updateMany({
          data: {
            isDefault: false,
          },
        });
      }

      return tx.currency.create({
        data: {
          name: String(name).trim(),
          code: String(code).trim().toUpperCase(),
          symbol: String(symbol).trim(),
          rate: parsedRate,
          isDefault: Boolean(isDefault),
        },
      });
    });

    return res.status(201).json({
      message: "Valyuta muvaffaqiyatli yaratildi",
      currency,
    });
  } catch (error) {
    console.error('createCurrency error:', error);

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return res.status(400).json({
        message: "Bu code bilan valyuta allaqachon mavjud",
      });
    }

    return res.status(500).json({
      message: "Serverda xatolik yuz berdi",
    });
  }
};

export const updateCurrency = async (req, res) => {
  try {
    const { currencyId } = req.params;
    const { name, code, symbol, rate, isDefault } = req.body;

    const existing = await prisma.currency.findUnique({
      where: { id: currencyId },
    });

    if (!existing) {
      return res.status(404).json({
        message: "Valyuta topilmadi",
      });
    }

    const data = {};

    if (name !== undefined) data.name = String(name).trim();
    if (code !== undefined) data.code = String(code).trim().toUpperCase();
    if (symbol !== undefined) data.symbol = String(symbol).trim();

    if (rate !== undefined) {
      const parsedRate = Number(rate);

      if (Number.isNaN(parsedRate) || parsedRate <= 0) {
        return res.status(400).json({
          message: "rate musbat son bo'lishi kerak",
        });
      }

      data.rate = parsedRate;
    }

    const currency = await prisma.$transaction(async (tx) => {
      if (isDefault !== undefined && Boolean(isDefault)) {
        await tx.currency.updateMany({
          data: {
            isDefault: false,
          },
        });
      }

      return tx.currency.update({
        where: { id: currencyId },
        data: {
          ...data,
          ...(isDefault !== undefined ? { isDefault: Boolean(isDefault) } : {}),
        },
      });
    });

    return res.json({
      message: "Valyuta yangilandi",
      currency,
    });
  } catch (error) {
    console.error('updateCurrency error:', error);

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return res.status(400).json({
        message: "Bu code bilan valyuta allaqachon mavjud",
      });
    }

    return res.status(500).json({
      message: "Serverda xatolik yuz berdi",
    });
  }
};