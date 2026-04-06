import pkg from '@prisma/client';

const { CashTransactionType } = pkg;

import { prisma } from '../lib/prisma.js';

export const createCashbox = async (req, res) => {
  try {
    const { name, currencyId, openingBalance } = req.body;
    const storeId = req.storeId;

    if (!name || !currencyId) {
      return res.status(400).json({
        message: "name va currencyId majburiy",
      });
    }

    const existing = await prisma.cashbox.findFirst({
      where: {
        storeId,
        name: name.trim(),
      },
    });

    if (existing) {
      return res.status(400).json({
        message: "Bu nomdagi kassa shu do'konda allaqachon mavjud",
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

    const result = await prisma.$transaction(async (tx) => {
      const cashbox = await tx.cashbox.create({
        data: {
          storeId,
          currencyId,
          name: name.trim(),
          balance,
        },
        include: {
          currency: true,
        },
      });

      if (balance > 0) {
        await tx.cashTransaction.create({
          data: {
            storeId,
            cashboxId: cashbox.id,
            currencyId,
            createdById: req.user.id,
            type: CashTransactionType.MANUAL_IN,
            amount: balance,
            note: "Boshlang'ich balans",
          },
        });
      }

      return cashbox;
    });

    return res.status(201).json({
      message: "Kassa muvaffaqiyatli yaratildi",
      cashbox: result,
    });
  } catch (error) {
    console.error("createCashbox error:", error);
    return res.status(500).json({
      message: "Serverda xatolik yuz berdi",
    });
  }
};

export const getCashboxes = async (req, res) => {
  try {
    const storeId = req.storeId;

    const cashboxes = await prisma.cashbox.findMany({
      where: {
        storeId,
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
    console.error("getCashboxes error:", error);
    return res.status(500).json({
      message: "Serverda xatolik yuz berdi",
    });
  }
};

export const getCashboxTransactions = async (req, res) => {
  try {
    const storeId = req.storeId;
    const { cashboxId } = req.params;

    const cashbox = await prisma.cashbox.findFirst({
      where: {
        id: cashboxId,
        storeId,
      },
    });

    if (!cashbox) {
      return res.status(404).json({
        message: "Kassa topilmadi",
      });
    }

    const transactions = await prisma.cashTransaction.findMany({
      where: {
        storeId,
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
    console.error("getCashboxTransactions error:", error);
    return res.status(500).json({
      message: "Serverda xatolik yuz berdi",
    });
  }
};

export const createExpenseFromCashbox = async (req, res) => {
  try {
    const storeId = req.storeId;
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
        storeId,
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
          storeId,
        },
      });

      if (!expenseCategory) {
        return res.status(404).json({
          message: "Xarajat moddasi topilmadi",
        });
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const expense = await tx.expense.create({
        data: {
          storeId,
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
          storeId,
          cashboxId,
          currencyId: cashbox.currencyId,
          createdById: req.user.id,
          type: CashTransactionType.EXPENSE,
          amount: parsedAmount,
          note: note || "Xarajat chiqimi",
          relatedExpenseId: expense.id,
        },
      });

      return expense;
    });

    return res.status(201).json({
      message: "Xarajat muvaffaqiyatli kiritildi",
      expense: result,
    });
  } catch (error) {
    console.error("createExpenseFromCashbox error:", error);
    return res.status(500).json({
      message: "Serverda xatolik yuz berdi",
    });
  }
};

export const transferBetweenCashboxes = async (req, res) => {
  try {
    const storeId = req.storeId;
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
        where: { id: fromCashboxId, storeId },
      }),
      prisma.cashbox.findFirst({
        where: { id: toCashboxId, storeId },
      }),
    ]);

    if (!fromCashbox || !toCashbox) {
      return res.status(404).json({
        message: "Kassalardan biri topilmadi",
      });
    }

    if (fromCashbox.currencyId !== toCashbox.currencyId) {
      return res.status(400).json({
        message: "Hozircha faqat bir xil valyutadagi kassalar o'rtasida o'tkazma mumkin",
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
          storeId,
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
          storeId,
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
      message: "Kassalar orasida o'tkazma muvaffaqiyatli bajarildi",
    });
  } catch (error) {
    console.error("transferBetweenCashboxes error:", error);
    return res.status(500).json({
      message: "Serverda xatolik yuz berdi",
    });
  }
};