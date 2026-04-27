import pkg from '@prisma/client';
import { prisma } from '../lib/prisma.js';

const { SupplierInStatus, StockMovementType } = pkg;

const parsePagination = (req) => {
  const page = Math.max(Number(req.query.page || 1), 1);
  const pageSize = Math.min(Math.max(Number(req.query.pageSize || 20), 1), 100);
  const skip = (page - 1) * pageSize;

  return { page, pageSize, skip };
};

export const createSupplierIn = async (req, res) => {
  try {
    const {
      warehouseId,
      supplierId,
      note,
      items,
    } = req.body;

    if (!warehouseId || !supplierId || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        message: "warehouseId, supplierId va items majburiy",
      });
    }

    const warehouse = await prisma.warehouse.findFirst({
      where: {
        id: warehouseId,
        storeId: req.storeId,
        isActive: true,
      },
    });

    if (!warehouse) {
      return res.status(404).json({
        message: "Ombor topilmadi",
      });
    }

    const supplier = await prisma.supplier.findFirst({
      where: {
        id: supplierId,
        storeId: req.storeId,
        isActive: true,
      },
    });

    if (!supplier) {
      return res.status(404).json({
        message: "Taminotchi topilmadi",
      });
    }

    const normalizedItems = [];

    for (const item of items) {
      const quantity = Number(item.quantity);
      const costPrice = Number(item.costPrice);
      const sellPrice = Number(item.sellPrice);

      if (
        !item.productVariantId ||
        !item.costCurrencyId ||
        !item.sellCurrencyId ||
        Number.isNaN(quantity) ||
        Number.isNaN(costPrice) ||
        Number.isNaN(sellPrice) ||
        quantity <= 0 ||
        costPrice < 0 ||
        sellPrice < 0
      ) {
        return res.status(400).json({
          message:
            "Har bir item uchun productVariantId, quantity, costPrice, costCurrencyId, sellPrice, sellCurrencyId to'g'ri bo'lishi kerak",
        });
      }

      const variant = await prisma.productVariant.findFirst({
        where: {
          id: item.productVariantId,
          product: {
            storeId: req.storeId,
            isActive: true,
          },
        },
      });

      if (!variant) {
        return res.status(404).json({
          message: `Variant topilmadi: ${item.productVariantId}`,
        });
      }

      const [costCurrency, sellCurrency] = await Promise.all([
        prisma.currency.findUnique({
          where: { id: item.costCurrencyId },
          select: { id: true },
        }),
        prisma.currency.findUnique({
          where: { id: item.sellCurrencyId },
          select: { id: true },
        }),
      ]);

      if (!costCurrency || !sellCurrency) {
        return res.status(404).json({
          message: "Currency topilmadi",
        });
      }

      normalizedItems.push({
        productVariantId: item.productVariantId,
        quantity,
        costPrice,
        costCurrencyId: item.costCurrencyId,
        sellPrice,
        sellCurrencyId: item.sellCurrencyId,
      });
    }

    const created = await prisma.supplierIn.create({
      data: {
        storeId: req.storeId,
        warehouseId,
        supplierId,
        submittedById: req.user.id,
        note: note ? String(note).trim() : null,
        items: {
          create: normalizedItems,
        },
      },
      include: {
        warehouse: true,
        supplier: true,
        submittedBy: {
          select: {
            id: true,
            fullName: true,
            username: true,
          },
        },
        items: {
          include: {
            costCurrency: true,
            sellCurrency: true,
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

    return res.status(201).json({
      message: "Kirim hujjati yaratildi va tasdiqlashga yuborildi",
      supplierIn: created,
    });
  } catch (error) {
    console.error('createSupplierIn error:', error);
    return res.status(500).json({
      message: "Server xatosi",
    });
  }
};

export const getSupplierIns = async (req, res) => {
  try {
    const { page, pageSize, skip } = parsePagination(req);
    const status = req.query.status ? String(req.query.status) : null;
    const supplierId = req.query.supplierId ? String(req.query.supplierId) : null;

    const where = {
      storeId: req.storeId,
      ...(status && ['PENDING', 'APPROVED', 'REJECTED'].includes(status) ? { status } : {}),
      ...(supplierId ? { supplierId } : {}),
    };

    const [items, totalItems] = await Promise.all([
      prisma.supplierIn.findMany({
        where,
        skip,
        take: pageSize,
        include: {
          warehouse: true,
          supplier: true,
          submittedBy: {
            select: {
              id: true,
              fullName: true,
              username: true,
            },
          },
          approvedBy: {
            select: {
              id: true,
              fullName: true,
              username: true,
            },
          },
          items: {
            include: {
              costCurrency: true,
              sellCurrency: true,
              productVariant: {
                include: {
                  size: true,
                  product: true,
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      }),
      prisma.supplierIn.count({ where }),
    ]);

    return res.json({
      items,
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / pageSize),
      },
    });
  } catch (error) {
    console.error('getSupplierIns error:', error);
    return res.status(500).json({
      message: "Server xatosi",
    });
  }
};

export const getSupplierInById = async (req, res) => {
  try {
    const { supplierInId } = req.params;

    const supplierIn = await prisma.supplierIn.findFirst({
      where: {
        id: supplierInId,
        storeId: req.storeId,
      },
      include: {
        warehouse: true,
        supplier: true,
        submittedBy: {
          select: {
            id: true,
            fullName: true,
            username: true,
          },
        },
        approvedBy: {
          select: {
            id: true,
            fullName: true,
            username: true,
          },
        },
        items: {
          include: {
            costCurrency: true,
            sellCurrency: true,
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
    });

    if (!supplierIn) {
      return res.status(404).json({
        message: "Kirim hujjati topilmadi",
      });
    }

    return res.json(supplierIn);
  } catch (error) {
    console.error('getSupplierInById error:', error);
    return res.status(500).json({
      message: "Server xatosi",
    });
  }
};

export const approveSupplierIn = async (req, res) => {
  try {
    const { supplierInId } = req.params;

    const supplierIn = await prisma.supplierIn.findFirst({
      where: {
        id: supplierInId,
        storeId: req.storeId,
      },
      include: {
        items: {
          include: {
            costCurrency: true,
            sellCurrency: true,
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

    if (!supplierIn) {
      return res.status(404).json({
        message: "Kirim hujjati topilmadi",
      });
    }

    if (supplierIn.status !== SupplierInStatus.PENDING) {
      return res.status(400).json({
        message: "Faqat Jarayonda turgan hujjatni tasdiqlash mumkin",
      });
    }

    for (const item of supplierIn.items) {
      if (!item.costCurrencyId || !item.sellCurrencyId) {
        return res.status(400).json({
          message: "Kirim itemlarida currency to'liq tanlanmagan",
        });
      }
    }

    const groupedTotals = new Map();

    for (const item of supplierIn.items) {
      const lineTotal =
        Number(item.quantity || 0) * Number(item.costPrice || 0);
      const prev = groupedTotals.get(item.costCurrencyId) || 0;
      groupedTotals.set(item.costCurrencyId, prev + lineTotal);
    }

    const txResult = await prisma.$transaction(
      async (tx) => {
        for (const item of supplierIn.items) {
          const createdBatch = await tx.stockBatch.create({
            data: {
              warehouseId: supplierIn.warehouseId,
              productVariantId: item.productVariantId,
              supplierId: supplierIn.supplierId,
              quantity: item.quantity,
              remainingQuantity: item.quantity,
              costPrice: item.costPrice,
              costCurrencyId: item.costCurrencyId,
              sellPrice: item.sellPrice,
              sellCurrencyId: item.sellCurrencyId,
            },
            select: {
              id: true,
            },
          });

          await tx.stockMovement.create({
            data: {
              storeId: req.storeId,
              warehouseId: supplierIn.warehouseId,
              productVariantId: item.productVariantId,
              batchId: createdBatch.id,
              createdById: req.user.id,
              type: StockMovementType.SUPPLIER_IN,
              quantity: item.quantity,
              note: supplierIn.note || "Taminotchidan kirim",
            },
          });
        }

        const createdLedgerEntries = [];

        for (const [currencyId, totalAmount] of groupedTotals.entries()) {
          const ledgerEntry = await tx.supplierLedgerEntry.create({
            data: {
              storeId: req.storeId,
              supplierId: supplierIn.supplierId,
              currencyId,
              totalAmount,
              paidAmount: 0,
              note: supplierIn.note || "Taminotchidan tovar kirimi",
            },
            select: {
              id: true,
              currencyId: true,
              totalAmount: true,
            },
          });

          createdLedgerEntries.push(ledgerEntry);
        }

        await tx.supplierIn.update({
          where: { id: supplierInId },
          data: {
            status: SupplierInStatus.APPROVED,
            approvedById: req.user.id,
            approvedAt: new Date(),
          },
        });

        return {
          ledgerEntries: createdLedgerEntries,
        };
      },
      {
        timeout: 15000,
        maxWait: 10000,
      }
    );

    const approvedSupplierIn = await prisma.supplierIn.findFirst({
      where: {
        id: supplierInId,
        storeId: req.storeId,
      },
      include: {
        warehouse: true,
        supplier: true,
        submittedBy: {
          select: {
            id: true,
            fullName: true,
            username: true,
          },
        },
        approvedBy: {
          select: {
            id: true,
            fullName: true,
            username: true,
          },
        },
        items: {
          include: {
            costCurrency: true,
            sellCurrency: true,
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

    const ledgerEntries = await prisma.supplierLedgerEntry.findMany({
      where: {
        id: {
          in: txResult.ledgerEntries.map((item) => item.id),
        },
      },
      include: {
        currency: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return res.json({
      message: "Kirim hujjati tasdiqlandi",
      supplierIn: approvedSupplierIn,
      ledgerEntries,
    });
  } catch (error) {
    console.error('approveSupplierIn error:', error);
    return res.status(500).json({
      message: "Server xatosi",
    });
  }
};

export const rejectSupplierIn = async (req, res) => {
  try {
    const { supplierInId } = req.params;
    const { note } = req.body;

    const supplierIn = await prisma.supplierIn.findFirst({
      where: {
        id: supplierInId,
        storeId: req.storeId,
      },
    });

    if (!supplierIn) {
      return res.status(404).json({
        message: "Kirim hujjati topilmadi",
      });
    }

    if (supplierIn.status !== SupplierInStatus.PENDING) {
      return res.status(400).json({
        message: "Faqat PENDING hujjatni rad etish mumkin",
      });
    }

    const rejected = await prisma.supplierIn.update({
      where: { id: supplierInId },
      data: {
        status: SupplierInStatus.REJECTED,
        approvedById: req.user.id,
        approvedAt: new Date(),
        note: note ? String(note).trim() : supplierIn.note,
      },
      include: {
        warehouse: true,
        supplier: true,
        submittedBy: {
          select: {
            id: true,
            fullName: true,
            username: true,
          },
        },
        approvedBy: {
          select: {
            id: true,
            fullName: true,
            username: true,
          },
        },
        items: {
          include: {
            costCurrency: true,
            sellCurrency: true,
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

    return res.json({
      message: "Kirim hujjati rad etildi",
      supplierIn: rejected,
    });
  } catch (error) {
    console.error('rejectSupplierIn error:', error);
    return res.status(500).json({
      message: "Server xatosi",
    });
  }
};

export const updateSupplierIn = async (req, res) => {
  try {
    const { supplierInId } = req.params;
    const { warehouseId, supplierId, note, items } = req.body;

    if (!warehouseId || !supplierId || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        message: "warehouseId, supplierId va items majburiy",
      });
    }

    const existingSupplierIn = await prisma.supplierIn.findFirst({
      where: {
        id: supplierInId,
        storeId: req.storeId,
      },
      include: {
        items: true,
      },
    });

    if (!existingSupplierIn) {
      return res.status(404).json({
        message: "Kirim hujjati topilmadi",
      });
    }

    if (existingSupplierIn.status !== SupplierInStatus.PENDING) {
      return res.status(400).json({
        message: "Faqat Jarayonda turgan hujjatni tahrirlash mumkin",
      });
    }

    const warehouse = await prisma.warehouse.findFirst({
      where: {
        id: warehouseId,
        storeId: req.storeId,
        isActive: true,
      },
    });

    if (!warehouse) {
      return res.status(404).json({
        message: "Ombor topilmadi",
      });
    }

    const supplier = await prisma.supplier.findFirst({
      where: {
        id: supplierId,
        storeId: req.storeId,
        isActive: true,
      },
    });

    if (!supplier) {
      return res.status(404).json({
        message: "Taminotchi topilmadi",
      });
    }

    const normalizedItems = [];
    const seenVariantIds = new Set();

    for (const item of items) {
      const quantity = Number(item.quantity);
      const costPrice = Number(item.costPrice);
      const sellPrice = Number(item.sellPrice);

      if (
        !item.productVariantId ||
        !item.costCurrencyId ||
        !item.sellCurrencyId ||
        Number.isNaN(quantity) ||
        Number.isNaN(costPrice) ||
        Number.isNaN(sellPrice) ||
        quantity <= 0 ||
        costPrice < 0 ||
        sellPrice < 0
      ) {
        return res.status(400).json({
          message:
            "Har bir item uchun productVariantId, quantity, costPrice, costCurrencyId, sellPrice, sellCurrencyId to'g'ri bo'lishi kerak",
        });
      }

      if (seenVariantIds.has(item.productVariantId)) {
        return res.status(400).json({
          message: "Bir xil variantni ikki marta qo'shib bo'lmaydi",
        });
      }

      seenVariantIds.add(item.productVariantId);

      const variant = await prisma.productVariant.findFirst({
        where: {
          id: item.productVariantId,
          product: {
            storeId: req.storeId,
            isActive: true,
          },
        },
      });

      if (!variant) {
        return res.status(404).json({
          message: `Variant topilmadi: ${item.productVariantId}`,
        });
      }

      const [costCurrency, sellCurrency] = await Promise.all([
        prisma.currency.findUnique({
          where: { id: item.costCurrencyId },
          select: { id: true },
        }),
        prisma.currency.findUnique({
          where: { id: item.sellCurrencyId },
          select: { id: true },
        }),
      ]);

      if (!costCurrency || !sellCurrency) {
        return res.status(404).json({
          message: "Currency topilmadi",
        });
      }

      normalizedItems.push({
        productVariantId: item.productVariantId,
        quantity,
        costPrice,
        costCurrencyId: item.costCurrencyId,
        sellPrice,
        sellCurrencyId: item.sellCurrencyId,
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.supplierIn.update({
        where: { id: supplierInId },
        data: {
          warehouseId,
          supplierId,
          note: note ? String(note).trim() : null,
        },
      });

      await tx.supplierInItem.deleteMany({
        where: {
          supplierInId,
        },
      });

      await tx.supplierInItem.createMany({
        data: normalizedItems.map((item) => ({
          supplierInId,
          productVariantId: item.productVariantId,
          quantity: item.quantity,
          costPrice: item.costPrice,
          costCurrencyId: item.costCurrencyId,
          sellPrice: item.sellPrice,
          sellCurrencyId: item.sellCurrencyId,
        })),
      });

      return tx.supplierIn.findFirst({
        where: {
          id: supplierInId,
          storeId: req.storeId,
        },
        include: {
          warehouse: true,
          supplier: true,
          submittedBy: {
            select: {
              id: true,
              fullName: true,
              username: true,
            },
          },
          approvedBy: {
            select: {
              id: true,
              fullName: true,
              username: true,
            },
          },
          items: {
            include: {
              costCurrency: true,
              sellCurrency: true,
              productVariant: {
                include: {
                  size: true,
                  product: {
                    include: {
                      images: {
                        orderBy: [
                          { isPrimary: 'desc' },
                          { sortOrder: 'asc' },
                          { createdAt: 'asc' },
                        ],
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });
    });

    return res.json({
      message: "Kirim hujjati yangilandi",
      supplierIn: updated,
    });
  } catch (error) {
    console.error('updateSupplierIn error:', error);
    return res.status(500).json({
      message: "Server xatosi",
    });
  }
};