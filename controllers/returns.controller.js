import pkg from '@prisma/client';
import { prisma } from '../lib/prisma.js';

const {
  CashTransactionType,
  StockMovementType,
} = pkg;

export const createSaleReturn = async (req, res) => {
  try {
    const {
      saleId,
      cashboxId,
      reason,
      items,
      refundAmount,
    } = req.body;

    if (!saleId || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        message: "saleId va items majburiy",
      });
    }

    const sale = await prisma.sale.findFirst({
      where: {
        id: saleId,
        storeId: req.storeId,
      },
      include: {
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
              },
            },
            productVariant: {
              include: {
                size: true,
                product: true,
              },
            },
            returnItems: true,
          },
        },
      },
    });

    if (!sale) {
      return res.status(404).json({
        message: "Savdo topilmadi",
      });
    }

    let selectedCashbox = null;

    if (cashboxId) {
      selectedCashbox = await prisma.cashbox.findFirst({
        where: {
          id: cashboxId,
          storeId: req.storeId,
          isActive: true,
        },
        include: {
          currency: true,
        },
      });

      if (!selectedCashbox) {
        return res.status(404).json({
          message: "Kassa topilmadi",
        });
      }
    }

    const normalizedItems = items.map((item) => ({
      saleItemId: item.saleItemId,
      quantity: Number(item.quantity),
    }));

    for (const item of normalizedItems) {
      if (!item.saleItemId || item.quantity == null) {
        return res.status(400).json({
          message: "Har bir item uchun saleItemId va quantity majburiy",
        });
      }

      if (Number.isNaN(item.quantity) || item.quantity <= 0) {
        return res.status(400).json({
          message: "quantity musbat son bo'lishi kerak",
        });
      }
    }

    const saleItemMap = new Map();
    for (const saleItem of sale.items) {
      saleItemMap.set(saleItem.id, saleItem);
    }

    let calculatedRefundAmount = 0;

    for (const item of normalizedItems) {
      const saleItem = saleItemMap.get(item.saleItemId);

      if (!saleItem) {
        return res.status(404).json({
          message: `Sale item topilmadi: ${item.saleItemId}`,
        });
      }

      const alreadyReturnedQty = saleItem.returnItems.reduce(
        (sum, r) => sum + r.quantity,
        0
      );

      const remainingReturnableQty = saleItem.quantity - alreadyReturnedQty;

      if (remainingReturnableQty <= 0) {
        return res.status(400).json({
          message: `${saleItem.productVariant.product.name} (${saleItem.productVariant.size.name}) allaqachon to'liq qaytarilgan`,
        });
      }

      if (item.quantity > remainingReturnableQty) {
        return res.status(400).json({
          message: `${saleItem.productVariant.product.name} (${saleItem.productVariant.size.name}) uchun qaytarish miqdori oshib ketdi`,
        });
      }

      calculatedRefundAmount += item.quantity * saleItem.price;
    }

    const finalRefundAmount =
      refundAmount == null ? calculatedRefundAmount : Number(refundAmount);

    if (Number.isNaN(finalRefundAmount) || finalRefundAmount < 0) {
      return res.status(400).json({
        message: "refundAmount noto'g'ri",
      });
    }

    if (finalRefundAmount > calculatedRefundAmount) {
      return res.status(400).json({
        message: "refundAmount maksimal summadan katta bo'lishi mumkin emas",
      });
    }

    if (finalRefundAmount > 0) {
      const refundCashbox = selectedCashbox || sale.cashbox;

      if (!refundCashbox) {
        return res.status(400).json({
          message: "Pul qaytarish uchun kassa topilmadi",
        });
      }

      if (refundCashbox.balance < finalRefundAmount) {
        return res.status(400).json({
          message: "Kassada qaytarish uchun mablag' yetarli emas",
        });
      }
    }

    const saleReturn = await prisma.$transaction(async (tx) => {
      const createdReturn = await tx.saleReturn.create({
        data: {
          saleId,
          storeId: req.storeId,
          cashboxId: finalRefundAmount > 0 ? (cashboxId || sale.cashboxId) : null,
          amount: finalRefundAmount,
          reason: reason ? String(reason).trim() : null,
        },
      });

      for (const item of normalizedItems) {
        const saleItem = saleItemMap.get(item.saleItemId);

        await tx.stockBatch.update({
          where: { id: saleItem.batchId },
          data: {
            remainingQuantity: {
              increment: item.quantity,
            },
          },
        });

        await tx.saleReturnItem.create({
          data: {
            saleReturnId: createdReturn.id,
            saleItemId: saleItem.id,
            quantity: item.quantity,
            amount: item.quantity * saleItem.price,
          },
        });

        await tx.stockMovement.create({
          data: {
            storeId: req.storeId,
            warehouseId: saleItem.batch.warehouseId,
            productVariantId: saleItem.productVariantId,
            batchId: saleItem.batchId,
            createdById: req.user.id,
            type: StockMovementType.CUSTOMER_RETURN,
            quantity: item.quantity,
            note: `Qaytarish #${createdReturn.id}`,
          },
        });
      }

      if (finalRefundAmount > 0) {
        const refundCashboxId = cashboxId || sale.cashboxId;
        const refundCashbox = selectedCashbox || sale.cashbox;

        await tx.cashbox.update({
          where: { id: refundCashboxId },
          data: {
            balance: {
              decrement: finalRefundAmount,
            },
          },
        });

        await tx.cashTransaction.create({
          data: {
            storeId: req.storeId,
            cashboxId: refundCashboxId,
            currencyId: refundCashbox.currencyId,
            createdById: req.user.id,
            type: CashTransactionType.SALE_RETURN_OUT,
            amount: finalRefundAmount,
            note: `Savdo qaytarishi #${createdReturn.id}`,
            relatedReturnId: createdReturn.id,
          },
        });
      }

      return tx.saleReturn.findUnique({
        where: { id: createdReturn.id },
        include: {
          cashbox: {
            include: {
              currency: true,
            },
          },
          sale: {
            include: {
              seller: {
                select: {
                  id: true,
                  fullName: true,
                  username: true,
                },
              },
            },
          },
          items: {
            include: {
              saleItem: {
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
          },
        },
      });
    });

    return res.status(201).json({
      message: "Qaytarish muvaffaqiyatli bajarildi",
      saleReturn,
    });
  } catch (error) {
    console.error('createSaleReturn error:', error);
    return res.status(500).json({
      message: "Server xatosi",
    });
  }
};

export const getSaleReturns = async (req, res) => {
  try {
    const returns = await prisma.saleReturn.findMany({
      where: {
        storeId: req.storeId,
      },
      include: {
        cashbox: {
          include: {
            currency: true,
          },
        },
        sale: {
          include: {
            seller: {
              select: {
                id: true,
                fullName: true,
                username: true,
              },
            },
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
    });

    return res.json(returns);
  } catch (error) {
    console.error('getSaleReturns error:', error);
    return res.status(500).json({
      message: "Server xatosi",
    });
  }
};

export const getSaleReturnById = async (req, res) => {
  try {
    const { returnId } = req.params;

    const saleReturn = await prisma.saleReturn.findFirst({
      where: {
        id: returnId,
        storeId: req.storeId,
      },
      include: {
        cashbox: {
          include: {
            currency: true,
          },
        },
        sale: {
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
          },
        },
        items: {
          include: {
            saleItem: {
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
          },
        },
      },
    });

    if (!saleReturn) {
      return res.status(404).json({
        message: "Qaytarish topilmadi",
      });
    }

    return res.json(saleReturn);
  } catch (error) {
    console.error('getSaleReturnById error:', error);
    return res.status(500).json({
      message: "Server xatosi",
    });
  }
};