import pkg from '@prisma/client';
import { prisma } from '../lib/prisma.js';

const { SaleType, StockMovementType, CashTransactionType } = pkg;

const roundMoney = (value) => {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
};

const generateSaleCode = () => {
  const now = new Date();

  const year = String(now.getFullYear()).slice(-2);
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const random = String(Math.floor(Math.random() * 1000)).padStart(3, '0');

  return `S${year}${month}${day}${hours}${minutes}${seconds}${random}`;
};

const createSaleWithUniqueCode = async (tx, data) => {
  let lastError = null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await tx.sale.create({
        data: {
          ...data,
          saleCode: generateSaleCode(),
        },
        select: {
          id: true,
          saleCode: true,
        },
      });
    } catch (error) {
      lastError = error;

      const isUniqueError =
        error?.code === 'P2002' ||
        String(error?.message || '').includes('saleCode');

      if (!isUniqueError) {
        throw error;
      }
    }
  }

  throw lastError || new Error('Savdo kodi yaratilmadi');
};

export const searchSellableProducts = async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const warehouseId = String(req.query.warehouseId || '').trim();
    const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 50);

    if (!q || !warehouseId) {
      return res.json([]);
    }

    const products = await prisma.product.findMany({
      where: {
        storeId: req.storeId,
        isActive: true,
        OR: [
          {
            name: {
              contains: q,
              mode: 'insensitive',
            },
          },
          {
            brand: {
              contains: q,
              mode: 'insensitive',
            },
          },
          {
            variants: {
              some: {
                barcode: {
                  contains: q,
                  mode: 'insensitive',
                },
              },
            },
          },
          {
            variants: {
              some: {
                size: {
                  name: {
                    contains: q,
                    mode: 'insensitive',
                  },
                },
              },
            },
          },
        ],
      },
      select: {
        id: true,
        name: true,
        brand: true,
        images: {
          select: {
            id: true,
            imageUrl: true,
            isPrimary: true,
            sortOrder: true,
            createdAt: true,
          },
          orderBy: [
            { isPrimary: 'desc' },
            { sortOrder: 'asc' },
            { createdAt: 'asc' },
          ],
        },
        variants: {
          where: {
            stockBatches: {
              some: {
                remainingQuantity: { gt: 0 },
                warehouseId,
                warehouse: {
                  storeId: req.storeId,
                  isActive: true,
                },
              },
            },
          },
          select: {
            id: true,
            barcode: true,
            size: {
              select: {
                id: true,
                name: true,
              },
            },
            stockBatches: {
              where: {
                remainingQuantity: { gt: 0 },
                warehouseId,
                warehouse: {
                  storeId: req.storeId,
                  isActive: true,
                },
              },
              select: {
                id: true,
                sellPrice: true,
                sellCurrencyId: true,
                sellCurrency: {
                  select: {
                    id: true,
                    code: true,
                    symbol: true,
                  },
                },
                remainingQuantity: true,
                createdAt: true,
                warehouse: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
              orderBy: {
                createdAt: 'desc',
              },
            },
          },
        },
      },
      take: limit,
      orderBy: {
        name: 'asc',
      },
    });

    const result = products
      .map((product) => {
        const primaryImage =
          (product.images || []).find((img) => img.isPrimary) ||
          (product.images || [])[0] ||
          null;

        return {
          ...product,
          imageUrl: primaryImage?.imageUrl || '',
          primaryImage,
          variants: (product.variants || [])
            .map((variant) => ({
              ...variant,
              totalStock: (variant.stockBatches || []).reduce(
                (sum, batch) => sum + Number(batch.remainingQuantity || 0),
                0
              ),
            }))
            .filter((variant) => variant.totalStock > 0),
        };
      })
      .filter((product) => product.variants.length > 0);

    return res.json(result);
  } catch (error) {
    console.error('searchSellableProducts error:', error);
    return res.status(500).json({
      message: 'Server xatosi',
    });
  }
};

export const createCashSale = async (req, res) => {
  try {
    const {
      note,
      totalDiscount = 0,
      payments = [],
      items,
    } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        message: 'items majburiy',
      });
    }

    if (!Array.isArray(payments) || payments.length === 0) {
      return res.status(400).json({
        message: 'payments majburiy',
      });
    }

    const normalizedPayments = [];
    let paidAmount = 0;

    for (const payment of payments) {
      const amount = roundMoney(Number(payment.amount || 0));

      if (!payment.cashboxId || amount <= 0) {
        return res.status(400).json({
          message: "Har bir to'lov uchun cashboxId va amount to'g'ri bo'lishi kerak",
        });
      }

      const cashbox = await prisma.cashbox.findFirst({
        where: {
          id: payment.cashboxId,
          storeId: req.storeId,
          isActive: true,
        },
      });

      if (!cashbox) {
        return res.status(404).json({
          message: 'Tanlangan kassalardan biri topilmadi',
        });
      }

      normalizedPayments.push({
        cashboxId: cashbox.id,
        currencyId: cashbox.currencyId,
        amount,
      });

      paidAmount = roundMoney(paidAmount + amount);
    }

    const normalizedItems = [];

    for (const item of items) {
      const quantity = Number(item.quantity);
      const unitPrice = Number(item.unitPrice ?? item.price);
      const itemDiscount = Number(item.discountAmount || 0);

      if (
        !item.productVariantId ||
        !item.batchId ||
        Number.isNaN(quantity) ||
        Number.isNaN(unitPrice) ||
        Number.isNaN(itemDiscount) ||
        quantity <= 0 ||
        unitPrice < 0 ||
        itemDiscount < 0
      ) {
        return res.status(400).json({
          message:
            "Har bir item uchun productVariantId, batchId, quantity, unitPrice to'g'ri bo'lishi kerak",
        });
      }

      const batch = await prisma.stockBatch.findFirst({
        where: {
          id: item.batchId,
          productVariantId: item.productVariantId,
          remainingQuantity: { gt: 0 },
          warehouse: {
            storeId: req.storeId,
            isActive: true,
          },
        },
        include: {
          warehouse: true,
          sellCurrency: true,
          productVariant: {
            include: {
              size: true,
              product: true,
            },
          },
        },
      });

      if (!batch) {
        return res.status(404).json({
          message: `Batch topilmadi yoki qoldiq yo'q: ${item.batchId}`,
        });
      }

      if (batch.remainingQuantity < quantity) {
        return res.status(400).json({
          message: `${batch.productVariant.product.name} (${batch.productVariant.size?.name || '-'}) uchun yetarli qoldiq yo'q`,
        });
      }

      const lineSubtotal = roundMoney(quantity * unitPrice);

      if (itemDiscount > lineSubtotal) {
        return res.status(400).json({
          message: `${batch.productVariant.product.name} uchun chegirma item summasidan katta bo'lishi mumkin emas`,
        });
      }

      normalizedItems.push({
        productVariantId: item.productVariantId,
        batchId: item.batchId,
        quantity,
        unitPrice,
        itemDiscount,
        warehouseId: batch.warehouseId,
        sellCurrencyId: batch.sellCurrencyId,
      });
    }

    const distinctSellCurrencies = [...new Set(normalizedItems.map((item) => item.sellCurrencyId))];

    if (distinctSellCurrencies.length > 1) {
      return res.status(400).json({
        message: "Bitta savatda faqat bitta valuta bo'lishi mumkin",
      });
    }

    const saleCurrencyId = distinctSellCurrencies[0];

    for (const payment of normalizedPayments) {
      if (payment.currencyId !== saleCurrencyId) {
        return res.status(400).json({
          message: "Tanlangan kassa valutasi tovarlar valutasi bilan mos emas",
        });
      }
    }

    const parsedTotalDiscount = roundMoney(Number(totalDiscount || 0));
    if (Number.isNaN(parsedTotalDiscount) || parsedTotalDiscount < 0) {
      return res.status(400).json({
        message: "Umumiy chegirma noto'g'ri",
      });
    }

    const subtotalAmount = roundMoney(
      normalizedItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
    );

    const itemLevelDiscount = roundMoney(
      normalizedItems.reduce((sum, item) => sum + item.itemDiscount, 0)
    );

    const remainingDiscountBase = roundMoney(subtotalAmount - itemLevelDiscount);

    if (parsedTotalDiscount > remainingDiscountBase) {
      return res.status(400).json({
        message: "Umumiy chegirma qolgan summadan katta bo'lishi mumkin emas",
      });
    }

    const itemsWithDistributedDiscount = normalizedItems.map((item) => {
      const lineSubtotal = roundMoney(item.quantity * item.unitPrice);

      return {
        ...item,
        lineSubtotal,
        distributedTotalDiscount: 0,
        totalLineDiscount: item.itemDiscount,
        finalLineTotal: lineSubtotal,
      };
    });

    if (parsedTotalDiscount > 0) {
      let distributed = 0;

      itemsWithDistributedDiscount.forEach((item, index) => {
        if (index === itemsWithDistributedDiscount.length - 1) {
          const rest = roundMoney(parsedTotalDiscount - distributed);
          item.distributedTotalDiscount = rest;
          item.totalLineDiscount = roundMoney(item.itemDiscount + rest);
          item.finalLineTotal = roundMoney(item.lineSubtotal - item.totalLineDiscount);
          return;
        }

        const remainingLineBase = roundMoney(item.lineSubtotal - item.itemDiscount);
        const share =
          remainingDiscountBase > 0
            ? roundMoney((remainingLineBase / remainingDiscountBase) * parsedTotalDiscount)
            : 0;

        item.distributedTotalDiscount = share;
        item.totalLineDiscount = roundMoney(item.itemDiscount + share);
        item.finalLineTotal = roundMoney(item.lineSubtotal - item.totalLineDiscount);

        distributed = roundMoney(distributed + share);
      });
    } else {
      itemsWithDistributedDiscount.forEach((item) => {
        item.finalLineTotal = roundMoney(item.lineSubtotal - item.totalLineDiscount);
      });
    }

    const discountAmount = roundMoney(
      itemsWithDistributedDiscount.reduce((sum, item) => sum + item.totalLineDiscount, 0)
    );

    const totalAmount = roundMoney(
      itemsWithDistributedDiscount.reduce((sum, item) => sum + item.finalLineTotal, 0)
    );

    if (roundMoney(paidAmount) !== roundMoney(totalAmount)) {
      return res.status(400).json({
        message: "To'lov summasi yakuniy summaga teng bo'lishi kerak",
      });
    }

    const txResult = await prisma.$transaction(
      async (tx) => {
        const primaryCashboxId = normalizedPayments[0].cashboxId;

        const sale = await createSaleWithUniqueCode(tx, {
          storeId: req.storeId,
          cashboxId: primaryCashboxId,
          sellerId: req.user.id,
          type: SaleType.CASH,
          subtotalAmount,
          discountAmount,
          totalAmount,
          paidAmount,
          note: note ? String(note).trim() : null,
        });

        for (const item of itemsWithDistributedDiscount) {
          await tx.saleItem.create({
            data: {
              saleId: sale.id,
              productVariantId: item.productVariantId,
              batchId: item.batchId,
              currencyId: item.sellCurrencyId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              discountAmount: item.totalLineDiscount,
              totalPrice: item.finalLineTotal,
            },
          });

          await tx.stockBatch.update({
            where: { id: item.batchId },
            data: {
              remainingQuantity: {
                decrement: item.quantity,
              },
            },
          });

          await tx.stockMovement.create({
            data: {
              storeId: req.storeId,
              warehouseId: item.warehouseId,
              productVariantId: item.productVariantId,
              batchId: item.batchId,
              createdById: req.user.id,
              type: StockMovementType.SALE_OUT,
              quantity: item.quantity,
              note: 'Naqd savdo',
            },
          });
        }

        for (const payment of normalizedPayments) {
          await tx.cashbox.update({
            where: { id: payment.cashboxId },
            data: {
              balance: {
                increment: payment.amount,
              },
            },
          });

          await tx.cashTransaction.create({
            data: {
              storeId: req.storeId,
              cashboxId: payment.cashboxId,
              currencyId: payment.currencyId,
              createdById: req.user.id,
              type: CashTransactionType.SALE_INCOME,
              amount: payment.amount,
              note: note ? String(note).trim() : 'Naqd savdo',
              relatedSaleId: sale.id,
            },
          });
        }

        return {
          saleId: sale.id,
        };
      },
      {
        timeout: 15000,
        maxWait: 10000,
      }
    );

    const sale = await prisma.sale.findUnique({
      where: { id: txResult.saleId },
      include: {
        cashbox: {
          include: {
            currency: true,
          },
        },
        seller: {
          select: {
            id: true,
            fullName: true,
            username: true,
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
                sellCurrency: true,
              },
            },
          },
        },
      },
    });

    return res.status(201).json({
      message: 'Naqd savdo muvaffaqiyatli bajarildi',
      sale,
    });
  } catch (error) {
    console.error('createCashSale error:', error);
    return res.status(500).json({ message: 'Server xatosi' });
  }
};

export const createCreditSale = async (req, res) => {
  try {
    const {
      customerId,
      note,
      totalDiscount = 0,
      initialPayment = 0,
      cashboxId,
      items,
    } = req.body;

    if (!customerId) {
      return res.status(400).json({
        message: 'customerId majburiy',
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        message: 'items majburiy',
      });
    }

    const customer = await prisma.customer.findFirst({
      where: {
        id: customerId,
        storeId: req.storeId,
        isActive: true,
      },
    });

    if (!customer) {
      return res.status(404).json({
        message: 'Mijoz topilmadi',
      });
    }

    const parsedInitialPayment = roundMoney(Number(initialPayment || 0));
    if (Number.isNaN(parsedInitialPayment) || parsedInitialPayment < 0) {
      return res.status(400).json({
        message: "Boshlang'ich to'lov noto'g'ri",
      });
    }

    let selectedCashbox = null;

    if (parsedInitialPayment > 0) {
      if (!cashboxId) {
        return res.status(400).json({
          message: "Boshlang'ich to'lov uchun kassa tanlanishi kerak",
        });
      }

      selectedCashbox = await prisma.cashbox.findFirst({
        where: {
          id: cashboxId,
          storeId: req.storeId,
          isActive: true,
        },
      });

      if (!selectedCashbox) {
        return res.status(404).json({
          message: 'Kassa topilmadi',
        });
      }
    } else {
      selectedCashbox = await prisma.cashbox.findFirst({
        where: {
          storeId: req.storeId,
          isActive: true,
        },
        orderBy: {
          createdAt: 'asc',
        },
      });

      if (!selectedCashbox) {
        return res.status(400).json({
          message: "Kamida bitta faol kassa bo'lishi kerak",
        });
      }
    }

    const normalizedItems = [];

    for (const item of items) {
      const quantity = Number(item.quantity);
      const unitPrice = Number(item.unitPrice ?? item.price);
      const itemDiscount = Number(item.discountAmount || 0);

      if (
        !item.productVariantId ||
        !item.batchId ||
        Number.isNaN(quantity) ||
        Number.isNaN(unitPrice) ||
        Number.isNaN(itemDiscount) ||
        quantity <= 0 ||
        unitPrice < 0 ||
        itemDiscount < 0
      ) {
        return res.status(400).json({
          message:
            "Har bir item uchun productVariantId, batchId, quantity, unitPrice to'g'ri bo'lishi kerak",
        });
      }

      const batch = await prisma.stockBatch.findFirst({
        where: {
          id: item.batchId,
          productVariantId: item.productVariantId,
          remainingQuantity: { gt: 0 },
          warehouse: {
            storeId: req.storeId,
            isActive: true,
          },
        },
        include: {
          warehouse: true,
          sellCurrency: true,
          productVariant: {
            include: {
              size: true,
              product: true,
            },
          },
        },
      });

      if (!batch) {
        return res.status(404).json({
          message: `Batch topilmadi yoki qoldiq yo'q: ${item.batchId}`,
        });
      }

      if (batch.remainingQuantity < quantity) {
        return res.status(400).json({
          message: `${batch.productVariant.product.name} (${batch.productVariant.size?.name || '-'}) uchun yetarli qoldiq yo'q`,
        });
      }

      const lineSubtotal = roundMoney(quantity * unitPrice);

      if (itemDiscount > lineSubtotal) {
        return res.status(400).json({
          message: `${batch.productVariant.product.name} uchun chegirma item summasidan katta bo'lishi mumkin emas`,
        });
      }

      normalizedItems.push({
        productVariantId: item.productVariantId,
        batchId: item.batchId,
        quantity,
        unitPrice,
        itemDiscount,
        warehouseId: batch.warehouseId,
        sellCurrencyId: batch.sellCurrencyId,
      });
    }

    const distinctSellCurrencies = [...new Set(normalizedItems.map((item) => item.sellCurrencyId))];

    if (distinctSellCurrencies.length > 1) {
      return res.status(400).json({
        message: "Bitta savatda faqat bitta valuta bo'lishi mumkin",
      });
    }

    const saleCurrencyId = distinctSellCurrencies[0];

    if (parsedInitialPayment > 0 && selectedCashbox.currencyId !== saleCurrencyId) {
      return res.status(400).json({
        message: "Boshlang'ich to'lov kassasi valutasi tovarlar valutasi bilan mos emas",
      });
    }

    const parsedTotalDiscount = roundMoney(Number(totalDiscount || 0));
    if (Number.isNaN(parsedTotalDiscount) || parsedTotalDiscount < 0) {
      return res.status(400).json({
        message: "Umumiy chegirma noto'g'ri",
      });
    }

    const subtotalAmount = roundMoney(
      normalizedItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
    );

    const itemLevelDiscount = roundMoney(
      normalizedItems.reduce((sum, item) => sum + item.itemDiscount, 0)
    );

    const remainingDiscountBase = roundMoney(subtotalAmount - itemLevelDiscount);

    if (parsedTotalDiscount > remainingDiscountBase) {
      return res.status(400).json({
        message: "Umumiy chegirma qolgan summadan katta bo'lishi mumkin emas",
      });
    }

    const itemsWithDistributedDiscount = normalizedItems.map((item) => {
      const lineSubtotal = roundMoney(item.quantity * item.unitPrice);

      return {
        ...item,
        lineSubtotal,
        distributedTotalDiscount: 0,
        totalLineDiscount: item.itemDiscount,
        finalLineTotal: lineSubtotal,
      };
    });

    if (parsedTotalDiscount > 0) {
      let distributed = 0;

      itemsWithDistributedDiscount.forEach((item, index) => {
        if (index === itemsWithDistributedDiscount.length - 1) {
          const rest = roundMoney(parsedTotalDiscount - distributed);
          item.distributedTotalDiscount = rest;
          item.totalLineDiscount = roundMoney(item.itemDiscount + rest);
          item.finalLineTotal = roundMoney(item.lineSubtotal - item.totalLineDiscount);
          return;
        }

        const remainingLineBase = roundMoney(item.lineSubtotal - item.itemDiscount);
        const share =
          remainingDiscountBase > 0
            ? roundMoney((remainingLineBase / remainingDiscountBase) * parsedTotalDiscount)
            : 0;

        item.distributedTotalDiscount = share;
        item.totalLineDiscount = roundMoney(item.itemDiscount + share);
        item.finalLineTotal = roundMoney(item.lineSubtotal - item.totalLineDiscount);

        distributed = roundMoney(distributed + share);
      });
    } else {
      itemsWithDistributedDiscount.forEach((item) => {
        item.finalLineTotal = roundMoney(item.lineSubtotal - item.totalLineDiscount);
      });
    }

    const discountAmount = roundMoney(
      itemsWithDistributedDiscount.reduce((sum, item) => sum + item.totalLineDiscount, 0)
    );

    const totalAmount = roundMoney(
      itemsWithDistributedDiscount.reduce((sum, item) => sum + item.finalLineTotal, 0)
    );

    if (parsedInitialPayment > totalAmount) {
      return res.status(400).json({
        message: "Boshlang'ich to'lov yakuniy summadan katta bo'lishi mumkin emas",
      });
    }

    const creditDueAmount = roundMoney(totalAmount - parsedInitialPayment);

    const txResult = await prisma.$transaction(
      async (tx) => {
        const sale = await createSaleWithUniqueCode(tx, {
          storeId: req.storeId,
          cashboxId: selectedCashbox.id,
          sellerId: req.user.id,
          customerId: customer.id,
          customerName: customer.fullName,
          customerPhone: customer.phone,
          type: SaleType.CREDIT,
          subtotalAmount,
          discountAmount,
          totalAmount,
          paidAmount: parsedInitialPayment,
          creditDueAmount,
          note: note ? String(note).trim() : null,
        });

        for (const item of itemsWithDistributedDiscount) {
          await tx.saleItem.create({
            data: {
              saleId: sale.id,
              productVariantId: item.productVariantId,
              batchId: item.batchId,
              currencyId: item.sellCurrencyId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              discountAmount: item.totalLineDiscount,
              totalPrice: item.finalLineTotal,
            },
          });

          await tx.stockBatch.update({
            where: { id: item.batchId },
            data: {
              remainingQuantity: {
                decrement: item.quantity,
              },
            },
          });

          await tx.stockMovement.create({
            data: {
              storeId: req.storeId,
              warehouseId: item.warehouseId,
              productVariantId: item.productVariantId,
              batchId: item.batchId,
              createdById: req.user.id,
              type: StockMovementType.SALE_OUT,
              quantity: item.quantity,
              note: 'Nasiya savdo',
            },
          });
        }

        if (parsedInitialPayment > 0) {
          await tx.cashbox.update({
            where: { id: selectedCashbox.id },
            data: {
              balance: {
                increment: parsedInitialPayment,
              },
            },
          });

          await tx.cashTransaction.create({
            data: {
              storeId: req.storeId,
              cashboxId: selectedCashbox.id,
              currencyId: selectedCashbox.currencyId,
              createdById: req.user.id,
              type: CashTransactionType.SALE_INCOME,
              amount: parsedInitialPayment,
              note: note ? String(note).trim() : "Nasiya savdo uchun boshlang'ich to'lov",
              relatedSaleId: sale.id,
            },
          });
        }

        return {
          saleId: sale.id,
        };
      },
      {
        timeout: 15000,
        maxWait: 10000,
      }
    );

    const sale = await prisma.sale.findUnique({
      where: { id: txResult.saleId },
      include: {
        cashbox: {
          include: {
            currency: true,
          },
        },
        seller: {
          select: {
            id: true,
            fullName: true,
            username: true,
          },
        },
        customer: true,
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
                sellCurrency: true,
              },
            },
          },
        },
      },
    });

    return res.status(201).json({
      message: 'Nasiya savdo muvaffaqiyatli yaratildi',
      sale,
    });
  } catch (error) {
    console.error('createCreditSale error:', error);
    return res.status(500).json({ message: 'Server xatosi' });
  }
};