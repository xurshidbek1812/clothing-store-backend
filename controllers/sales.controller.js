import pkg from '@prisma/client';

const { SaleType, CashTransactionType, StockMovementType} = pkg;

import { prisma } from '../lib/prisma.js';

export const createSale = async (req, res) => {
  try {
    const storeId = req.storeId;
    const {
      cashboxId,
      type = 'CASH',
      customerName,
      customerPhone,
      note,
      items,
      paidAmount,
    } = req.body;

    if (!cashboxId || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        message: "cashboxId va items majburiy",
      });
    }

    if (!['CASH', 'CREDIT'].includes(type)) {
      return res.status(400).json({
        message: "type faqat CASH yoki CREDIT bo'lishi mumkin",
      });
    }

    const cashbox = await prisma.cashbox.findFirst({
      where: {
        id: cashboxId,
        storeId,
        isActive: true,
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

    const normalizedItems = items.map((item) => ({
      productVariantId: item.productVariantId,
      batchId: item.batchId,
      quantity: Number(item.quantity),
      price: Number(item.price),
    }));

    for (const item of normalizedItems) {
      if (!item.productVariantId || !item.batchId || !item.quantity || item.price == null) {
        return res.status(400).json({
          message: "Har bir item uchun productVariantId, batchId, quantity va price majburiy",
        });
      }

      if (
        Number.isNaN(item.quantity) ||
        Number.isNaN(item.price) ||
        item.quantity <= 0 ||
        item.price < 0
      ) {
        return res.status(400).json({
          message: "quantity musbat son bo'lishi, price esa to'g'ri son bo'lishi kerak",
        });
      }
    }

    const batchIds = [...new Set(normalizedItems.map((item) => item.batchId))];

    const batches = await prisma.stockBatch.findMany({
      where: {
        id: { in: batchIds },
        remainingQuantity: { gt: 0 },
        warehouse: {
          storeId,
          isActive: true,
        },
      },
      include: {
        warehouse: true,
        supplier: true,
        productVariant: {
          include: {
            size: true,
            product: true,
          },
        },
      },
    });

    const batchMap = new Map();
    for (const batch of batches) {
      batchMap.set(batch.id, batch);
    }

    for (const item of normalizedItems) {
      const batch = batchMap.get(item.batchId);

      if (!batch) {
        return res.status(404).json({
          message: `Batch topilmadi yoki qoldig'i tugagan: ${item.batchId}`,
        });
      }

      if (batch.productVariantId !== item.productVariantId) {
        return res.status(400).json({
          message: "batchId va productVariantId bir-biriga mos emas",
        });
      }

      if (batch.remainingQuantity < item.quantity) {
        return res.status(400).json({
          message: `${batch.productVariant.product.name} (${batch.productVariant.size.name}) uchun tanlangan batchda qoldiq yetarli emas`,
        });
      }
    }

    const totalAmount = normalizedItems.reduce(
      (sum, item) => sum + item.quantity * item.price,
      0
    );

    let finalPaidAmount = 0;

    if (type === 'CASH') {
      finalPaidAmount = totalAmount;
    } else {
      finalPaidAmount = paidAmount == null ? 0 : Number(paidAmount);

      if (Number.isNaN(finalPaidAmount) || finalPaidAmount < 0) {
        return res.status(400).json({
          message: "paidAmount noto'g'ri",
        });
      }

      if (finalPaidAmount > totalAmount) {
        return res.status(400).json({
          message: "paidAmount totalAmount dan katta bo'lishi mumkin emas",
        });
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.create({
        data: {
          storeId,
          cashboxId,
          sellerId: req.user.id,
          type: type === 'CASH' ? SaleType.CASH : SaleType.CREDIT,
          totalAmount,
          paidAmount: finalPaidAmount,
          customerName: type === 'CREDIT' ? customerName || null : null,
          customerPhone: type === 'CREDIT' ? customerPhone || null : null,
          note: note || null,
        },
      });

      for (const item of normalizedItems) {
        const batch = batchMap.get(item.batchId);

        await tx.stockBatch.update({
          where: { id: item.batchId },
          data: {
            remainingQuantity: {
              decrement: item.quantity,
            },
          },
        });

        await tx.saleItem.create({
          data: {
            saleId: sale.id,
            productVariantId: item.productVariantId,
            batchId: item.batchId,
            quantity: item.quantity,
            price: item.price,
          },
        });

        await tx.stockMovement.create({
          data: {
            storeId,
            warehouseId: batch.warehouseId,
            productVariantId: item.productVariantId,
            batchId: item.batchId,
            createdById: req.user.id,
            type: StockMovementType.SALE_OUT,
            quantity: item.quantity,
            note: `Savdo #${sale.id}`,
          },
        });
      }

      if (finalPaidAmount > 0) {
        await tx.cashbox.update({
          where: { id: cashboxId },
          data: {
            balance: {
              increment: finalPaidAmount,
            },
          },
        });

        await tx.cashTransaction.create({
          data: {
            storeId,
            cashboxId,
            currencyId: cashbox.currencyId,
            createdById: req.user.id,
            type: CashTransactionType.SALE_INCOME,
            amount: finalPaidAmount,
            note:
              type === 'CREDIT'
                ? `Nasiya savdodan to'lov #${sale.id}`
                : `Naqd savdo #${sale.id}`,
            relatedSaleId: sale.id,
          },
        });
      }

      const fullSale = await tx.sale.findUnique({
        where: { id: sale.id },
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
          items: {
            include: {
              batch: {
                include: {
                  warehouse: true,
                  supplier: true,
                },
              },
              productVariant: {
                include: {
                  size: true,
                  product: true,
                },
              },
            },
          },
        },
      });

      return fullSale;
    });

    return res.status(201).json({
      message: "Savdo muvaffaqiyatli bajarildi",
      sale: result,
    });
  } catch (error) {
    console.error("createSale error:", error);
    return res.status(500).json({
      message: "Serverda xatolik yuz berdi",
    });
  }
};

export const getSales = async (req, res) => {
  try {
    const storeId = req.storeId;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const type = req.query.type ? String(req.query.type) : null;
    const skip = (page - 1) * limit;

    const where = {
      storeId,
      ...(type && ['CASH', 'CREDIT'].includes(type) ? { type } : {}),
    };

    const [sales, totalItems] = await Promise.all([
      prisma.sale.findMany({
        where,
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
        skip,
        take: limit,
      }),
      prisma.sale.count({ where }),
    ]);

    return res.json({
      sales,
      totalPages: Math.ceil(totalItems / limit),
      currentPage: page,
      totalItems,
    });
  } catch (error) {
    console.error("getSales error:", error);
    return res.status(500).json({
      message: "Serverda xatolik yuz berdi",
    });
  }
};

export const getSaleById = async (req, res) => {
  try {
    const storeId = req.storeId;
    const { saleId } = req.params;

    const sale = await prisma.sale.findFirst({
      where: {
        id: saleId,
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
        items: {
          include: {
            batch: {
              include: {
                warehouse: true,
                supplier: true,
              },
            },
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
        },
        returns: true,
      },
    });

    if (!sale) {
      return res.status(404).json({
        message: "Savdo topilmadi",
      });
    }

    return res.json(sale);
  } catch (error) {
    console.error("getSaleById error:", error);
    return res.status(500).json({
      message: "Serverda xatolik yuz berdi",
    });
  }
};