import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export const makeTransfer = async (req, res) => {
  const { fromCashboxId, toCashboxId, amount, description } = req.body;
  const storeId = req.user.storeId;

  try {
    // 1. Transaction boshlaymiz (Hammasi bajarilishi yoki hammasi bekor bo'lishi shart)
    await prisma.$transaction(async (tx) => {
      // 1.1 Chiqim bo'layotgan kassadan pulni ayiramiz
      const fromBox = await tx.cashbox.update({
        where: { id: fromCashboxId },
        data: { balance: { decrement: Number(amount) } }
      });

      if (fromBox.balance < 0) {
        throw new Error("Kassada yetarli mablag' yo'q!");
      }

      // 1.2 Kirim bo'layotgan kassaga pulni qo'shamiz
      await tx.cashbox.update({
        where: { id: toCashboxId },
        data: { balance: { increment: Number(amount) } }
      });

      // 1.3 O'tkazma tarixini yaratamiz
      await tx.transfer.create({
        data: {
          amount: Number(amount),
          fromCashboxId,
          toCashboxId,
          description,
          storeId
        }
      });
    });

    res.status(200).json({ message: "O'tkazma muvaffaqiyatli bajarildi!" });
  } catch (error) {
    res.status(400).json({ message: error.message || "Xatolik yuz berdi" });
  }
};

export const getTransfers = async (req, res) => {
  const storeId = req.user.storeId;
  try {
    const transfers = await prisma.transfer.findMany({
      where: { storeId },
      include: {
        fromCashbox: { select: { name: true } },
        toCashbox: { select: { name: true } }
      },
      orderBy: { date: 'desc' }
    });
    res.json(transfers);
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik" });
  }
};