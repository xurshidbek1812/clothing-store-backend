import { prisma } from '../lib/prisma.js';

const getTodayRange = () => {
  const now = new Date();

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  return { start, end };
};

export const getDashboardSummary = async (req, res) => {
  try {
    const storeId = req.storeId;
    const { start, end } = getTodayRange();

    const [
      todaySalesAgg,
      todayReturnsAgg,
      allCashboxes,
      stockBatchesAgg,
      creditSalesAgg,
      recentSalesCount,
    ] = await Promise.all([
      prisma.sale.aggregate({
        where: {
          storeId,
          createdAt: {
            gte: start,
            lte: end,
          },
        },
        _sum: {
          totalAmount: true,
          paidAmount: true,
        },
        _count: {
          id: true,
        },
      }),

      prisma.saleReturn.aggregate({
        where: {
          storeId,
          createdAt: {
            gte: start,
            lte: end,
          },
        },
        _sum: {
          amount: true,
        },
        _count: {
          id: true,
        },
      }),

      prisma.cashbox.findMany({
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
      }),

      prisma.stockBatch.aggregate({
        where: {
          warehouse: {
            storeId,
            isActive: true,
          },
        },
        _sum: {
          remainingQuantity: true,
        },
      }),

      prisma.sale.aggregate({
        where: {
          storeId,
          type: 'CREDIT',
        },
        _sum: {
          totalAmount: true,
          paidAmount: true,
        },
      }),

      prisma.sale.count({
        where: {
          storeId,
          createdAt: {
            gte: start,
            lte: end,
          },
        },
      }),
    ]);

    const todaySalesTotal = todaySalesAgg._sum.totalAmount || 0;
    const todayPaidTotal = todaySalesAgg._sum.paidAmount || 0;
    const todaySalesCount = todaySalesAgg._count.id || 0;

    const todayReturnsTotal = todayReturnsAgg._sum.amount || 0;
    const todayReturnsCount = todayReturnsAgg._count.id || 0;

    const totalCashBalance = allCashboxes.reduce(
      (sum, cashbox) => sum + cashbox.balance,
      0
    );

    const totalStockUnits = stockBatchesAgg._sum.remainingQuantity || 0;

    const totalCreditAmount = creditSalesAgg._sum.totalAmount || 0;
    const totalCreditPaid = creditSalesAgg._sum.paidAmount || 0;
    const totalCreditDebt = totalCreditAmount - totalCreditPaid;

    return res.json({
      today: {
        salesTotal: todaySalesTotal,
        paidTotal: todayPaidTotal,
        salesCount: todaySalesCount,
        returnsTotal: todayReturnsTotal,
        returnsCount: todayReturnsCount,
        netCashflow: todayPaidTotal - todayReturnsTotal,
      },
      balances: {
        cashboxesTotal: totalCashBalance,
        stockUnitsTotal: totalStockUnits,
        creditDebtTotal: totalCreditDebt,
      },
      cashboxes: allCashboxes.map((cashbox) => ({
        id: cashbox.id,
        name: cashbox.name,
        balance: cashbox.balance,
        currency: {
          id: cashbox.currency.id,
          code: cashbox.currency.code,
          symbol: cashbox.currency.symbol,
          name: cashbox.currency.name,
        },
      })),
      extra: {
        todaySalesCount: recentSalesCount,
      },
    });
  } catch (error) {
    console.error('getDashboardSummary error:', error);
    return res.status(500).json({
      message: "Serverda xatolik yuz berdi",
    });
  }
};

export const getTopSellingProducts = async (req, res) => {
  try {
    const storeId = req.storeId;
    const limit = Number(req.query.limit) || 10;
    const days = Number(req.query.days) || 30;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const items = await prisma.saleItem.findMany({
      where: {
        sale: {
          storeId,
          createdAt: {
            gte: startDate,
          },
        },
      },
      include: {
        productVariant: {
          include: {
            size: true,
            product: {
              include: {
                category: true,
              },
            },
          },
        },
      },
    });

    const grouped = new Map();

    for (const item of items) {
      const key = item.productVariantId;
      const existing = grouped.get(key);

      if (existing) {
        existing.quantity += item.quantity;
        existing.amount += item.quantity * item.price;
      } else {
        grouped.set(key, {
          productVariantId: item.productVariantId,
          productId: item.productVariant.product.id,
          productName: item.productVariant.product.name,
          brand: item.productVariant.product.brand,
          size: item.productVariant.size.name,
          barcode: item.productVariant.barcode,
          category: item.productVariant.product.category?.name || null,
          quantity: item.quantity,
          amount: item.quantity * item.price,
        });
      }
    }

    const result = [...grouped.values()]
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, limit);

    return res.json(result);
  } catch (error) {
    console.error('getTopSellingProducts error:', error);
    return res.status(500).json({
      message: "Serverda xatolik yuz berdi",
    });
  }
};

export const getRecentSales = async (req, res) => {
  try {
    const storeId = req.storeId;
    const limit = Number(req.query.limit) || 10;

    const sales = await prisma.sale.findMany({
      where: {
        storeId,
      },
      include: {
        seller: {
          select: {
            id: true,
            fullName: true,
            username: true,
          },
        },
        cashbox: {
          include: {
            currency: true,
          },
        },
        _count: {
          select: {
            items: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    });

    return res.json(sales);
  } catch (error) {
    console.error('getRecentSales error:', error);
    return res.status(500).json({
      message: "Serverda xatolik yuz berdi",
    });
  }
};