import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export const getDashboardStats = async (req, res) => {
  const storeId = req.user.storeId;

  try {
    // 1. Bugungi sanani hisoblaymiz (GMT+0 ni hisobga olib)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 2. Parallel ravishda barcha ma'lumotlarni yig'amiz
    const [sales, expenses, totalProducts, cashboxes] = await Promise.all([
      // Bugungi sotuvlar
      prisma.sale.findMany({
        where: { storeId, date: { gte: today } }
      }),
      // Bugungi xarajatlar
      prisma.expense.findMany({
        where: { storeId, date: { gte: today } }
      }),
      // Umumiy tovarlar soni (ombor qoldig'i)
      prisma.product.aggregate({
        where: { storeId },
        _sum: { stock: true }
      }),
      // Kassalardagi umumiy pul
      prisma.cashbox.findMany({
        where: { storeId }
      })
    ]);

    // Hisob-kitoblar
    const dailySales = sales.reduce((sum, s) => sum + s.totalAmount, 0);
    const dailyExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
    const totalCash = cashboxes.reduce((sum, c) => sum + c.balance, 0);
    const stockCount = totalProducts._sum.stock || 0;

    res.json({
      dailySales,
      dailyExpenses,
      totalCash,
      stockCount,
      // Grafik uchun oxirgi 7 kunlik savdolarni ham yuborsak bo'ladi (kelajakda)
    });
  } catch (error) {
    res.status(500).json({ message: "Statistikani yig'ishda xatolik" });
  }
};