import pkg from '@prisma/client';
import { prisma } from '../lib/prisma.js';

const { Prisma } = pkg;

// ==================== CATEGORY ====================

export const getCategories = async (req, res) => {
  try {
    const categories = await prisma.category.findMany({
      where: {
        storeId: req.storeId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return res.json(categories);
  } catch (error) {
    console.error('getCategories error:', error);
    return res.status(500).json({ message: "Server xatosi" });
  }
};

export const createCategory = async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: "name majburiy" });
    }

    const category = await prisma.category.create({
      data: {
        storeId: req.storeId,
        name: String(name).trim(),
      },
    });

    return res.status(201).json({
      message: "Kategoriya yaratildi",
      category,
    });
  } catch (error) {
    console.error('createCategory error:', error);

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return res.status(400).json({
        message: "Bu kategoriya allaqachon mavjud",
      });
    }

    return res.status(500).json({ message: "Server xatosi" });
  }
};

export const updateCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { name } = req.body;

    const existing = await prisma.category.findFirst({
      where: {
        id: categoryId,
        storeId: req.storeId,
      },
    });

    if (!existing) {
      return res.status(404).json({ message: "Kategoriya topilmadi" });
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
    return res.status(500).json({ message: "Server xatosi" });
  }
};

// ==================== EXPENSE CATEGORY ====================

export const getExpenseCategories = async (req, res) => {
  try {
    const expenseCategories = await prisma.expenseCategory.findMany({
      where: {
        storeId: req.storeId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return res.json(expenseCategories);
  } catch (error) {
    console.error('getExpenseCategories error:', error);
    return res.status(500).json({ message: "Server xatosi" });
  }
};

export const createExpenseCategory = async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: "name majburiy" });
    }

    const expenseCategory = await prisma.expenseCategory.create({
      data: {
        storeId: req.storeId,
        name: String(name).trim(),
      },
    });

    return res.status(201).json({
      message: "Xarajat moddasi yaratildi",
      expenseCategory,
    });
  } catch (error) {
    console.error('createExpenseCategory error:', error);

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return res.status(400).json({
        message: "Bu xarajat moddasi allaqachon mavjud",
      });
    }

    return res.status(500).json({ message: "Server xatosi" });
  }
};

export const updateExpenseCategory = async (req, res) => {
  try {
    const { expenseCategoryId } = req.params;
    const { name } = req.body;

    const existing = await prisma.expenseCategory.findFirst({
      where: {
        id: expenseCategoryId,
        storeId: req.storeId,
      },
    });

    if (!existing) {
      return res.status(404).json({ message: "Xarajat moddasi topilmadi" });
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
    return res.status(500).json({ message: "Server xatosi" });
  }
};

// ==================== SIZE ====================

export const getSizes = async (req, res) => {
  try {
    const sizes = await prisma.size.findMany({
      orderBy: [
        { sortOrder: 'asc' },
        { createdAt: 'desc' },
      ],
    });

    return res.json(sizes);
  } catch (error) {
    console.error('getSizes error:', error);
    return res.status(500).json({ message: "Server xatosi" });
  }
};

export const createSize = async (req, res) => {
  try {
    const { name } = req.body;

    const trimmedName = String(name || '').trim();

    if (!trimmedName) {
      return res.status(400).json({
        message: 'Razmer nomi majburiy',
      });
    }

    const lastSize = await prisma.size.findFirst({
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });

    const item = await prisma.size.create({
      data: {
        name: trimmedName,
        sortOrder: (lastSize?.sortOrder || 0) + 1,
      },
    });

    return res.status(201).json({
      message: 'Razmer yaratildi',
      item,
    });
  } catch (error) {
    console.error('createSize error:', error);
    return res.status(500).json({
      message: 'Server xatosi',
    });
  }
};

export const updateSize = async (req, res) => {
  try {
    const { sizeId } = req.params;
    const { name } = req.body;

    const existing = await prisma.size.findUnique({
      where: { id: sizeId },
    });

    if (!existing) {
      return res.status(404).json({ message: "Razmer topilmadi" });
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
    return res.status(500).json({ message: "Server xatosi" });
  }
};

export const reorderSizes = async (req, res) => {
  try {
    const { sizeIds } = req.body;

    if (!Array.isArray(sizeIds) || sizeIds.length === 0) {
      return res.status(400).json({
        message: 'sizeIds array majburiy',
      });
    }

    const existingSizes = await prisma.size.findMany({
      select: { id: true },
      orderBy: { sortOrder: 'asc' },
    });

    const existingIds = existingSizes.map((item) => item.id).sort();
    const incomingIds = [...sizeIds].sort();

    if (
      existingIds.length !== incomingIds.length ||
      existingIds.join(',') !== incomingIds.join(',')
    ) {
      return res.status(400).json({
        message: "sizeIds to'liq va to'g'ri bo'lishi kerak",
      });
    }

    await prisma.$transaction(
      sizeIds.map((sizeId, index) =>
        prisma.size.update({
          where: { id: sizeId },
          data: {
            sortOrder: index + 1,
          },
        })
      )
    );

    return res.json({
      message: 'Razmerlar tartibi yangilandi',
    });
  } catch (error) {
    console.error('reorderSizes error:', error);
    return res.status(500).json({
      message: 'Server xatosi',
    });
  }
};

// ==================== CURRENCY ====================

export const getCurrencies = async (req, res) => {
  try {
    const currencies = await prisma.currency.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });

    return res.json(currencies);
  } catch (error) {
    console.error('getCurrencies error:', error);
    return res.status(500).json({ message: "Server xatosi" });
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
          data: { isDefault: false },
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
      message: "Valyuta yaratildi",
      currency,
    });
  } catch (error) {
    console.error('createCurrency error:', error);

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return res.status(400).json({
        message: "Bu code bilan valyuta mavjud",
      });
    }

    return res.status(500).json({ message: "Server xatosi" });
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
      return res.status(404).json({ message: "Valyuta topilmadi" });
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
          data: { isDefault: false },
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
    return res.status(500).json({ message: "Server xatosi" });
  }
};