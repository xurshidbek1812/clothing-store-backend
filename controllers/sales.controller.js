import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export const createSale = async (req, res) => {
  const { items, paymentType, cashboxId, totalAmount } = req.body;
  const storeId = req.user.storeId;

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Sotuvni yaratish
      const sale = await tx.sale.create({
        data: {
          totalAmount,
          paymentType,
          cashboxId,
          storeId,
          items: {
            create: items.map(item => ({
              productId: item.productId,
              quantity: item.quantity,
              price: item.price
            }))
          }
        }
      });

      // 2. Har bir tovarning qoldig'ini (stock) kamaytirish
      for (const item of items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: item.quantity } }
        });
      }

      // 3. Kassadagi pulni ko'paytirish
      await tx.cashbox.update({
        where: { id: cashboxId },
        data: { balance: { increment: totalAmount } }
      });

      return sale;
    });

    res.status(201).json({ message: "Savdo muvaffaqiyatli yakunlandi!", sale: result });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Savdo jarayonida xatolik yuz berdi" });
  }
};

// Sotuvlar tarixini olish
export const getSales = async (req, res) => {
  const storeId = req.user.storeId;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  try {
    const [sales, totalItems] = await Promise.all([
      prisma.sale.findMany({
        where: { storeId },
        include: {
          cashbox: { select: { name: true } }, // Qaysi kassaga tushgani
          items: {
            include: {
              product: { select: { name: true, size: true } } // Nima sotilgani
            }
          }
        },
        orderBy: { date: 'desc' },
        skip,
        take: limit
      }),
      prisma.sale.count({ where: { storeId } })
    ]);

    res.json({
      sales,
      totalPages: Math.ceil(totalItems / limit),
      currentPage: page,
      totalItems
    });
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};