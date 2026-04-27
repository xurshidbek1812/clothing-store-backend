import pkg from '@prisma/client';
import { prisma } from '../lib/prisma.js';

const { CashTransactionType } = pkg;

export const createCashbox = async (req, res) => {
  try {
    const { name, currencyId, openingBalance } = req.body;

    if (!name || !currencyId) {
      return res.status(400).json({
        message: "name va currencyId majburiy",
      });
    }

    const currency = await prisma.currency.findUnique({
      where: { id: currencyId },
    });

    if (!currency) {
      return res.status(404).json({
        message: "Valyuta topilmadi",
      });
    }

    const balance = Number(openingBalance) || 0;

    const cashbox = await prisma.$transaction(async (tx) => {
      const created = await tx.cashbox.create({
        data: {
          storeId: req.storeId,
          currencyId,
          name: String(name).trim(),
          balance,
        },
        include: {
          currency: true,
        },
      });

      if (balance > 0) {
        await tx.cashTransaction.create({
          data: {
            storeId: req.storeId,
            cashboxId: created.id,
            currencyId: created.currencyId,
            createdById: req.user.id,
            type: CashTransactionType.MANUAL_IN,
            amount: balance,
            note: "Boshlang'ich balans",
          },
        });
      }

      return created;
    });

    return res.status(201).json({
      message: "Kassa yaratildi",
      cashbox,
    });
  } catch (error) {
    console.error('createCashbox error:', error);
    return res.status(500).json({
      message: "Server xatosi",
    });
  }
};

export const updateCashbox = async (req, res) => {
  try {
    const { cashboxId } = req.params;
    const { name, currencyId, isActive } = req.body;

    const existing = await prisma.cashbox.findFirst({
      where: {
        id: cashboxId,
        storeId: req.storeId,
      },
    });

    if (!existing) {
      return res.status(404).json({
        message: 'Kassa topilmadi',
      });
    }

    if (!name || !String(name).trim()) {
      return res.status(400).json({
        message: 'Kassa nomi majburiy',
      });
    }

    if (!currencyId) {
      return res.status(400).json({
        message: 'Valuta tanlanishi kerak',
      });
    }

    const currency = await prisma.currency.findUnique({
      where: { id: currencyId },
    });

    if (!currency) {
      return res.status(404).json({
        message: 'Valuta topilmadi',
      });
    }

    const normalizedName = String(name).trim();

    const duplicate = await prisma.cashbox.findFirst({
      where: {
        storeId: req.storeId,
        name: normalizedName,
        NOT: {
          id: cashboxId,
        },
      },
    });

    if (duplicate) {
      return res.status(400).json({
        message: 'Bu nomdagi kassa allaqachon mavjud',
      });
    }

    const cashbox = await prisma.cashbox.update({
      where: { id: cashboxId },
      data: {
        name: normalizedName,
        currencyId,
        isActive: Boolean(isActive),
      },
      include: {
        currency: true,
      },
    });

    return res.json({
      message: 'Kassa yangilandi',
      cashbox,
    });
  } catch (error) {
    console.error('updateCashbox error:', error);
    return res.status(500).json({
      message: 'Server xatosi',
    });
  }
};

export const getCurrencies = async (_req, res) => {
  try {
    const currencies = await prisma.currency.findMany({
      orderBy: [
        { isDefault: 'desc' },
        { code: 'asc' },
      ],
    });

    return res.json(currencies);
  } catch (error) {
    console.error('getCurrencies error:', error);
    return res.status(500).json({
      message: 'Server xatosi',
    });
  }
};

export const getCashboxes = async (req, res) => {
  try {
    const cashboxes = await prisma.cashbox.findMany({
      where: {
        storeId: req.storeId,
        isActive: true,
      },
      include: {
        currency: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return res.json(cashboxes);
  } catch (error) {
    console.error('getCashboxes error:', error);
    return res.status(500).json({
      message: "Server xatosi",
    });
  }
};

export const getCashboxTransactions = async (req, res) => {
  try {
    const { cashboxId } = req.params;

    const cashbox = await prisma.cashbox.findFirst({
      where: {
        id: cashboxId,
        storeId: req.storeId,
      },
    });

    if (!cashbox) {
      return res.status(404).json({
        message: "Kassa topilmadi",
      });
    }

    const transactions = await prisma.cashTransaction.findMany({
      where: {
        storeId: req.storeId,
        cashboxId,
      },
      include: {
        currency: true,
        createdBy: {
          select: {
            id: true,
            fullName: true,
            username: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return res.json(transactions);
  } catch (error) {
    console.error('getCashboxTransactions error:', error);
    return res.status(500).json({
      message: "Server xatosi",
    });
  }
};

export const createExpenseFromCashbox = async (req, res) => {
  try {
    const { cashboxId, expenseCategoryId, amount, note } = req.body;

    if (!cashboxId || !amount) {
      return res.status(400).json({
        message: "cashboxId va amount majburiy",
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
      },
      include: {
        currency: true,
      },
    });

    if (!cashbox) {
      return res.status(404).json({
        message: "Kassa topilmadi",
      });
    }

    if (cashbox.balance < parsedAmount) {
      return res.status(400).json({
        message: "Kassada mablag' yetarli emas",
      });
    }

    if (expenseCategoryId) {
      const expenseCategory = await prisma.expenseCategory.findFirst({
        where: {
          id: expenseCategoryId,
          storeId: req.storeId,
        },
      });

      if (!expenseCategory) {
        return res.status(404).json({
          message: "Xarajat moddasi topilmadi",
        });
      }
    }

    const expense = await prisma.$transaction(async (tx) => {
      const createdExpense = await tx.expense.create({
        data: {
          storeId: req.storeId,
          cashboxId,
          expenseCategoryId: expenseCategoryId || null,
          createdById: req.user.id,
          amount: parsedAmount,
          note: note || null,
        },
      });

      await tx.cashbox.update({
        where: { id: cashboxId },
        data: {
          balance: {
            decrement: parsedAmount,
          },
        },
      });

      await tx.cashTransaction.create({
        data: {
          storeId: req.storeId,
          cashboxId,
          currencyId: cashbox.currencyId,
          createdById: req.user.id,
          type: CashTransactionType.EXPENSE,
          amount: parsedAmount,
          note: note || "Xarajat chiqimi",
          relatedExpenseId: createdExpense.id,
        },
      });

      return createdExpense;
    });

    return res.status(201).json({
      message: "Xarajat yaratildi",
      expense,
    });
  } catch (error) {
    console.error('createExpenseFromCashbox error:', error);
    return res.status(500).json({
      message: "Server xatosi",
    });
  }
};

export const transferBetweenCashboxes = async (req, res) => {
  try {
    const { fromCashboxId, toCashboxId, amount, note } = req.body;

    if (!fromCashboxId || !toCashboxId || !amount) {
      return res.status(400).json({
        message: "fromCashboxId, toCashboxId va amount majburiy",
      });
    }

    if (fromCashboxId === toCashboxId) {
      return res.status(400).json({
        message: "Bir xil kassaga o'tkazma qilib bo'lmaydi",
      });
    }

    const parsedAmount = Number(amount);

    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({
        message: "amount musbat son bo'lishi kerak",
      });
    }

    const [fromCashbox, toCashbox] = await Promise.all([
      prisma.cashbox.findFirst({
        where: {
          id: fromCashboxId,
          storeId: req.storeId,
        },
      }),
      prisma.cashbox.findFirst({
        where: {
          id: toCashboxId,
          storeId: req.storeId,
        },
      }),
    ]);

    if (!fromCashbox || !toCashbox) {
      return res.status(404).json({
        message: "Kassalardan biri topilmadi",
      });
    }

    if (fromCashbox.currencyId !== toCashbox.currencyId) {
      return res.status(400).json({
        message: "Faqat bir xil valyutada o'tkazma mumkin",
      });
    }

    if (fromCashbox.balance < parsedAmount) {
      return res.status(400).json({
        message: "Jo'natuvchi kassada mablag' yetarli emas",
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.cashbox.update({
        where: { id: fromCashboxId },
        data: {
          balance: {
            decrement: parsedAmount,
          },
        },
      });

      await tx.cashbox.update({
        where: { id: toCashboxId },
        data: {
          balance: {
            increment: parsedAmount,
          },
        },
      });

      await tx.cashTransaction.create({
        data: {
          storeId: req.storeId,
          cashboxId: fromCashboxId,
          currencyId: fromCashbox.currencyId,
          createdById: req.user.id,
          type: CashTransactionType.TRANSFER_OUT,
          amount: parsedAmount,
          note: note || "Boshqa kassaga chiqim",
          fromCashboxId,
          toCashboxId,
        },
      });

      await tx.cashTransaction.create({
        data: {
          storeId: req.storeId,
          cashboxId: toCashboxId,
          currencyId: toCashbox.currencyId,
          createdById: req.user.id,
          type: CashTransactionType.TRANSFER_IN,
          amount: parsedAmount,
          note: note || "Boshqa kassadan kirim",
          fromCashboxId,
          toCashboxId,
        },
      });
    });

    return res.json({
      message: "Kassalar orasida o'tkazma bajarildi",
    });
  } catch (error) {
    console.error('transferBetweenCashboxes error:', error);
    return res.status(500).json({
      message: "Server xatosi",
    });
  }
};