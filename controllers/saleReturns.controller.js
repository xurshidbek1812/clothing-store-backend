import pkg from '@prisma/client';
import { prisma } from '../lib/prisma.js';

const { StockMovementType, CashTransactionType } = pkg;

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function roundPage(value, fallback = 1) {
  const num = Number(value);
  if (Number.isNaN(num) || num < 1) return fallback;
  return Math.floor(num);
}

export const getSaleReturns = async (req, res) => {
  try {
    const page = roundPage(req.query.page, 1);
    const pageSize = Math.min(roundPage(req.query.pageSize, 10), 100);
    const skip = (page - 1) * pageSize;

    const q = String(req.query.q || '').trim();

    const where = {
      storeId: req.storeId,
      ...(q
        ? {
            OR: [
              { reason: { contains: q, mode: 'insensitive' } },
              {
                sale: {
                  seller: {
                    fullName: { contains: q, mode: 'insensitive' },
                  },
                },
              },
              {
                sale: {
                  items: {
                    some: {
                      productVariant: {
                        product: {
                          name: { contains: q, mode: 'insensitive' },
                        },
                      },
                    },
                  },
                },
              },
            ],
          }
        : {}),
    };

    const [totalItems, items] = await Promise.all([
      prisma.saleReturn.count({ where }),
      prisma.saleReturn.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
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
                  currency: true,
                  productVariant: {
                    include: {
                      size: true,
                      product: true,
                    },
                  },
                  batch: {
                    include: {
                      warehouse: true,
                    },
                  },
                },
              },
            },
          },
        },
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
    console.error('getSaleReturns error:', error);
    return res.status(500).json({
      message: 'Server xatosi',
    });
  }
};

export const createSaleReturn = async (req, res) => {
  try {
    const { saleId, cashboxId, reason, items } = req.body;

    if (!saleId) {
      return res.status(400).json({
        message: 'saleId majburiy',
      });
    }

    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({
        message: 'items majburiy',
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
            currency: true,
            productVariant: {
              include: {
                size: true,
                product: true,
              },
            },
            batch: {
              include: {
                warehouse: true,
              },
            },
            returnItems: true,
          },
        },
      },
    });

    if (!sale) {
      return res.status(404).json({
        message: 'Savdo topilmadi',
      });
    }

    const normalizedItems = [];

    for (const item of items) {
      const quantity = Number(item.quantity);
      const amount = roundMoney(Number(item.amount));

      if (
        !item.saleItemId ||
        Number.isNaN(quantity) ||
        quantity <= 0 ||
        Number.isNaN(amount) ||
        amount < 0
      ) {
        return res.status(400).json({
          message: "Har bir item uchun saleItemId, quantity va amount to'g'ri bo'lishi kerak",
        });
      }

      const saleItem = sale.items.find((row) => row.id === item.saleItemId);

      if (!saleItem) {
        return res.status(404).json({
          message: `Sale item topilmadi: ${item.saleItemId}`,
        });
      }

      const alreadyReturnedQty = saleItem.returnItems.reduce(
        (sum, row) => sum + Number(row.quantity || 0),
        0
      );

      const remainingReturnableQty = Number(saleItem.quantity || 0) - alreadyReturnedQty;

      if (quantity > remainingReturnableQty) {
        return res.status(400).json({
          message: `${saleItem.productVariant.product.name} (${saleItem.productVariant.size?.name || '-'}) uchun qaytarish miqdori oshib ketdi. Mavjud: ${remainingReturnableQty}`,
        });
      }

      normalizedItems.push({
        saleItemId: saleItem.id,
        quantity,
        amount,
        batchId: saleItem.batchId,
        warehouseId: saleItem.batch?.warehouseId || null,
        productVariantId: saleItem.productVariantId,
        currencyId: saleItem.currencyId,
      });
    }

    const distinctCurrencies = [...new Set(normalizedItems.map((item) => item.currencyId))];

    if (distinctCurrencies.length > 1) {
      return res.status(400).json({
        message: "Qaytarishda bitta valuta bo'lishi kerak",
      });
    }

    const returnCurrencyId = distinctCurrencies[0];
    let selectedCashbox = null;

    if (cashboxId) {
      selectedCashbox = await prisma.cashbox.findFirst({
        where: {
          id: cashboxId,
          storeId: req.storeId,
          isActive: true,
          currencyId: returnCurrencyId,
        },
        include: {
          currency: true,
        },
      });

      if (!selectedCashbox) {
        return res.status(404).json({
          message: 'Tanlangan kassa topilmadi yoki valuta mos emas',
        });
      }
    }

    const totalAmount = roundMoney(
      normalizedItems.reduce((sum, item) => sum + Number(item.amount || 0), 0)
    );

    const created = await prisma.$transaction(
      async (tx) => {
        const saleReturn = await tx.saleReturn.create({
          data: {
            saleId,
            storeId: req.storeId,
            cashboxId: selectedCashbox?.id || null,
            amount: totalAmount,
            reason: reason ? String(reason).trim() : null,
          },
          select: {
            id: true,
          },
        });

        for (const item of normalizedItems) {
          await tx.saleReturnItem.create({
            data: {
              saleReturnId: saleReturn.id,
              saleItemId: item.saleItemId,
              quantity: item.quantity,
              amount: item.amount,
            },
          });

          if (item.batchId) {
            await tx.stockBatch.update({
              where: { id: item.batchId },
              data: {
                remainingQuantity: {
                  increment: item.quantity,
                },
              },
            });
          }

          if (item.batchId && item.warehouseId) {
            await tx.stockMovement.create({
              data: {
                storeId: req.storeId,
                warehouseId: item.warehouseId,
                productVariantId: item.productVariantId,
                batchId: item.batchId,
                createdById: req.user.id,
                type: StockMovementType.CUSTOMER_RETURN,
                quantity: item.quantity,
                note: reason ? String(reason).trim() : 'Savdodan qaytarildi',
              },
            });
          }
        }

        if (selectedCashbox && totalAmount > 0) {
          await tx.cashbox.update({
            where: { id: selectedCashbox.id },
            data: {
              balance: {
                decrement: totalAmount,
              },
            },
          });

          await tx.cashTransaction.create({
            data: {
              storeId: req.storeId,
              cashboxId: selectedCashbox.id,
              currencyId: selectedCashbox.currencyId,
              createdById: req.user.id,
              type: CashTransactionType.SALE_RETURN_OUT,
              amount: totalAmount,
              note: reason ? String(reason).trim() : 'Savdodan qaytarish',
              relatedSaleId: saleId,
              relatedReturnId: saleReturn.id,
            },
          });
        }

        return saleReturn.id;
      },
      {
        timeout: 15000,
        maxWait: 10000,
      }
    );

    const saleReturn = await prisma.saleReturn.findUnique({
      where: { id: created },
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
                currency: true,
                productVariant: {
                  include: {
                    size: true,
                    product: true,
                  },
                },
                batch: {
                  include: {
                    warehouse: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    return res.status(201).json({
      message: 'Savdo qaytarilishi yaratildi',
      saleReturn,
    });
  } catch (error) {
    console.error('createSaleReturn error:', error);
    return res.status(500).json({
      message: 'Server xatosi',
    });
  }
};