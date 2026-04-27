import pkg from '@prisma/client';
import { prisma } from '../lib/prisma.js';

const { ExpenseStatus } = pkg;

function roundPage(value, fallback = 1) {
  const num = Number(value);
  if (Number.isNaN(num) || num < 1) return fallback;
  return Math.floor(num);
}

function includeExpense() {
  return {
    cashbox: {
      include: {
        currency: true,
      },
    },
    expenseCategory: true,
    createdBy: {
      select: {
        id: true,
        fullName: true,
        username: true,
      },
    },
    approvedBy: {
      select: {
        id: true,
        fullName: true,
        username: true,
      },
    },
    rejectedBy: {
      select: {
        id: true,
        fullName: true,
        username: true,
      },
    },
  };
}

export const getExpenseOptions = async (req, res) => {
  try {
    const [cashboxes, categories] = await Promise.all([
      prisma.cashbox.findMany({
        where: {
          storeId: req.storeId,
          isActive: true,
        },
        include: {
          currency: true,
        },
        orderBy: [
          { currency: { code: 'asc' } },
          { name: 'asc' },
        ],
      }),
      prisma.expenseCategory.findMany({
        where: {
          storeId: req.storeId,
        },
        orderBy: {
          name: 'asc',
        },
      }),
    ]);

    return res.json({
      cashboxes,
      categories,
    });
  } catch (error) {
    console.error('getExpenseOptions error:', error);
    return res.status(500).json({
      message: 'Server xatosi',
    });
  }
};

export const createExpense = async (req, res) => {
  try {
    const { cashboxId, expenseCategoryId, amount, note } = req.body;

    if (!cashboxId || amount == null) {
      return res.status(400).json({
        message: 'cashboxId va amount majburiy',
      });
    }

    const parsedAmount = Number(amount);

    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({
        message: "amount musbat son bo'lishi kerak",
      });
    }

    const cashbox = await prisma.cashbox.findFirst({
      where: {
        id: cashboxId,
        storeId: req.storeId,
        isActive: true,
      },
      include: {
        currency: true,
      },
    });

    if (!cashbox) {
      return res.status(404).json({
        message: 'Kassa topilmadi',
      });
    }

    if (expenseCategoryId) {
      const category = await prisma.expenseCategory.findFirst({
        where: {
          id: expenseCategoryId,
          storeId: req.storeId,
        },
      });

      if (!category) {
        return res.status(404).json({
          message: 'Harajat moddasi topilmadi',
        });
      }
    }

    const expense = await prisma.expense.create({
      data: {
        storeId: req.storeId,
        cashboxId,
        expenseCategoryId: expenseCategoryId || null,
        createdById: req.user.id,
        amount: parsedAmount,
        note: note ? String(note).trim() : null,
        status: ExpenseStatus.PENDING,
      },
      include: includeExpense(),
    });

    return res.status(201).json({
      message: 'Harajat yaratildi',
      expense,
    });
  } catch (error) {
    console.error('createExpense error:', error);
    return res.status(500).json({
      message: error.message || 'Server xatosi',
    });
  }
};

export const updateExpense = async (req, res) => {
  try {
    const { expenseId } = req.params;
    const { cashboxId, expenseCategoryId, amount, note } = req.body;

    const existing = await prisma.expense.findFirst({
      where: {
        id: expenseId,
        storeId: req.storeId,
      },
    });

    if (!existing) {
      return res.status(404).json({
        message: 'Harajat topilmadi',
      });
    }

    if (existing.status !== ExpenseStatus.PENDING) {
      return res.status(400).json({
        message: 'Faqat jarayondagi harajatni tahrirlash mumkin',
      });
    }

    const parsedAmount = Number(amount);

    if (!cashboxId || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({
        message: "Ma'lumotlar noto'g'ri",
      });
    }

    const cashbox = await prisma.cashbox.findFirst({
      where: {
        id: cashboxId,
        storeId: req.storeId,
        isActive: true,
      },
    });

    if (!cashbox) {
      return res.status(404).json({
        message: 'Kassa topilmadi',
      });
    }

    if (expenseCategoryId) {
      const category = await prisma.expenseCategory.findFirst({
        where: {
          id: expenseCategoryId,
          storeId: req.storeId,
        },
      });

      if (!category) {
        return res.status(404).json({
          message: 'Harajat moddasi topilmadi',
        });
      }
    }

    const expense = await prisma.expense.update({
      where: { id: expenseId },
      data: {
        cashboxId,
        expenseCategoryId: expenseCategoryId || null,
        amount: parsedAmount,
        note: note ? String(note).trim() : null,
      },
      include: includeExpense(),
    });

    return res.json({
      message: 'Harajat yangilandi',
      expense,
    });
  } catch (error) {
    console.error('updateExpense error:', error);
    return res.status(500).json({
      message: 'Server xatosi',
    });
  }
};

export const approveExpense = async (req, res) => {
  try {
    const { expenseId } = req.params;

    const expense = await prisma.expense.findFirst({
      where: {
        id: expenseId,
        storeId: req.storeId,
      },
      include: includeExpense(),
    });

    if (!expense) {
      return res.status(404).json({
        message: 'Harajat topilmadi',
      });
    }

    if (expense.status !== ExpenseStatus.PENDING) {
      return res.status(400).json({
        message: 'Faqat jarayondagi harajatni tasdiqlash mumkin',
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      const freshCashbox = await tx.cashbox.findFirst({
        where: {
          id: expense.cashboxId,
          storeId: req.storeId,
          isActive: true,
        },
      });

      if (!freshCashbox) {
        throw new Error('Kassa topilmadi');
      }

      if (Number(freshCashbox.balance || 0) < Number(expense.amount || 0)) {
        throw new Error("Kassada yetarli mablag' yo'q");
      }

      await tx.cashbox.update({
        where: { id: expense.cashboxId },
        data: {
          balance: {
            decrement: expense.amount,
          },
        },
      });

      await tx.cashTransaction.create({
        data: {
          storeId: req.storeId,
          cashboxId: expense.cashboxId,
          currencyId: expense.cashbox.currencyId,
          createdById: req.user.id,
          type: 'EXPENSE',
          amount: Number(expense.amount),
          note: expense.note,
          relatedExpenseId: expense.id,
        },
      });

      await tx.expense.update({
        where: { id: expense.id },
        data: {
          status: ExpenseStatus.APPROVED,
          approvedById: req.user.id,
          approvedAt: new Date(),
        },
      });

      return tx.expense.findUnique({
        where: { id: expense.id },
        include: includeExpense(),
      });
    });

    return res.json({
      message: 'Harajat tasdiqlandi',
      expense: result,
    });
  } catch (error) {
    console.error('approveExpense error:', error);
    return res.status(500).json({
      message: error.message || 'Server xatosi',
    });
  }
};

export const rejectExpense = async (req, res) => {
  try {
    const { expenseId } = req.params;

    const expense = await prisma.expense.findFirst({
      where: {
        id: expenseId,
        storeId: req.storeId,
      },
    });

    if (!expense) {
      return res.status(404).json({
        message: 'Harajat topilmadi',
      });
    }

    if (expense.status !== ExpenseStatus.PENDING) {
      return res.status(400).json({
        message: 'Faqat jarayondagi harajatni rad qilish mumkin',
      });
    }

    const updated = await prisma.expense.update({
      where: { id: expenseId },
      data: {
        status: ExpenseStatus.REJECTED,
        rejectedById: req.user.id,
        rejectedAt: new Date(),
      },
      include: includeExpense(),
    });

    return res.json({
      message: 'Harajat rad etildi',
      expense: updated,
    });
  } catch (error) {
    console.error('rejectExpense error:', error);
    return res.status(500).json({
      message: 'Server xatosi',
    });
  }
};

export const getExpenses = async (req, res) => {
  try {
    const page = roundPage(req.query.page, 1);
    const pageSize = Math.min(roundPage(req.query.pageSize, 10), 100);
    const skip = (page - 1) * pageSize;

    const q = String(req.query.q || '').trim();
    const cashboxId = String(req.query.cashboxId || '').trim();
    const expenseCategoryId = String(req.query.expenseCategoryId || '').trim();
    const status = String(req.query.status || '').trim();

    const where = {
      storeId: req.storeId,
      ...(cashboxId ? { cashboxId } : {}),
      ...(expenseCategoryId ? { expenseCategoryId } : {}),
      ...(status ? { status } : {}),
      ...(q
        ? {
            OR: [
              { note: { contains: q, mode: 'insensitive' } },
              { cashbox: { name: { contains: q, mode: 'insensitive' } } },
              { expenseCategory: { name: { contains: q, mode: 'insensitive' } } },
              { createdBy: { fullName: { contains: q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [totalItems, items] = await Promise.all([
      prisma.expense.count({ where }),
      prisma.expense.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: {
          createdAt: 'desc',
        },
        include: includeExpense(),
      }),
    ]);

    return res.json({
      items,
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages: Math.max(Math.ceil(totalItems / pageSize), 1),
      },
    });
  } catch (error) {
    console.error('getExpenses error:', error);
    return res.status(500).json({
      message: 'Server xatosi',
    });
  }
};