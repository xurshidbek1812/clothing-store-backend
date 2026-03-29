import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export const createExpense = async (req, res) => {
  const { amount, description, cashboxId } = req.body;
  const storeId = req.user.storeId;

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Xarajatni yaratish
      const expense = await tx.expense.create({
        data: { amount: Number(amount), description, cashboxId, storeId }
      });

      // 2. Kassadan pulni ayirish
      const updatedCashbox = await tx.cashbox.update({
        where: { id: cashboxId },
        data: { balance: { decrement: Number(amount) } }
      });

      if (updatedCashbox.balance < 0) {
        throw new Error("Kassada yetarli mablag' yo'q!");
      }

      return expense;
    });

    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const getExpenses = async (req, res) => {
  const storeId = req.user.storeId;
  try {
    const expenses = await prisma.expense.findMany({
      where: { storeId },
      include: { cashbox: { select: { name: true } } },
      orderBy: { date: 'desc' }
    });
    res.json(expenses);
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik" });
  }
};