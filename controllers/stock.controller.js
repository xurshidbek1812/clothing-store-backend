import pkg from '@prisma/client';
import { prisma } from '../lib/prisma.js';

const { StockMovementType, WarehouseTransferStatus, SupplierReturnStatus } = pkg;

export const stockInFromSupplier = async (req, res) => {
  try {
    const {
      warehouseId,
      supplierId,
      note,
      ledgerNote,
      initialPaidAmount = 0,
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
        message: 'Ombor topilmadi',
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
        message: 'Taminotchi topilmadi',
      });
    }

    let totalAmount = 0;

    for (const item of items) {
      if (
        !item.productVariantId ||
        item.quantity == null ||
        item.costPrice == null ||
        item.sellPrice == null ||
        !item.costCurrencyId ||
        !item.sellCurrencyId
      ) {
        return res.status(400).json({
          message:
            'Har bir item uchun productVariantId, quantity, costPrice, sellPrice, costCurrencyId, sellCurrencyId majburiy',
        });
      }

      const quantity = Number(item.quantity);
      const costPrice = Number(item.costPrice);
      const sellPrice = Number(item.sellPrice);

      if (
        Number.isNaN(quantity) ||
        Number.isNaN(costPrice) ||
        Number.isNaN(sellPrice) ||
        quantity <= 0 ||
        costPrice < 0 ||
        sellPrice < 0
      ) {
        return res.status(400).json({
          message:
            "quantity musbat son bo'lishi kerak, narxlar esa to'g'ri son bo'lishi kerak",
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

      totalAmount += quantity * costPrice;
    }

    const parsedInitialPaidAmount = Number(initialPaidAmount || 0);

    if (
      Number.isNaN(parsedInitialPaidAmount) ||
      parsedInitialPaidAmount < 0 ||
      parsedInitialPaidAmount > totalAmount
    ) {
      return res.status(400).json({
        message: "initialPaidAmount noto'g'ri",
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      const createdBatches = [];

      for (const item of items) {
        const quantity = Number(item.quantity);
        const costPrice = Number(item.costPrice);
        const sellPrice = Number(item.sellPrice);

        const batch = await tx.stockBatch.create({
          data: {
            warehouseId,
            productVariantId: item.productVariantId,
            supplierId,
            quantity,
            remainingQuantity: quantity,
            costPrice,
            costCurrencyId: item.costCurrencyId,
            sellPrice,
            sellCurrencyId: item.sellCurrencyId,
          },
          include: {
            warehouse: true,
            supplier: true,
            costCurrency: true,
            sellCurrency: true,
            productVariant: {
              include: {
                size: true,
                product: {
                  include: {
                    images: {
                      orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
                      take: 1,
                    },
                  },
                },
              },
            },
          },
        });

        await tx.stockMovement.create({
          data: {
            storeId: req.storeId,
            warehouseId,
            productVariantId: item.productVariantId,
            batchId: batch.id,
            createdById: req.user.id,
            type: StockMovementType.SUPPLIER_IN,
            quantity,
            note: note || 'Taminotchidan kirim',
          },
        });

        createdBatches.push(batch);
      }

      const ledgerEntry = await tx.supplierLedgerEntry.create({
        data: {
          storeId: req.storeId,
          supplierId,
          currencyId: items[0].costCurrencyId,
          totalAmount,
          paidAmount: parsedInitialPaidAmount,
          note: ledgerNote
            ? String(ledgerNote).trim()
            : note
            ? String(note).trim()
            : 'Taminotchidan tovar kirimi',
        },
      });

      return {
        batches: createdBatches,
        ledgerEntry,
      };
    });

    return res.status(201).json({
      message: 'Tovar kirimi bajarildi',
      totalAmount,
      paidAmount: parsedInitialPaidAmount,
      debtAmount: totalAmount - parsedInitialPaidAmount,
      batches: result.batches,
      ledgerEntry: result.ledgerEntry,
    });
  } catch (error) {
    console.error('stockInFromSupplier error:', error);
    return res.status(500).json({
      message: 'Server xatosi',
    });
  }
};

export const getStockBalances = async (req, res) => {
  try {
    const warehouseId = req.query.warehouseId ? String(req.query.warehouseId) : null;
    const search = req.query.search ? String(req.query.search).trim() : '';

    const batches = await prisma.stockBatch.findMany({
      where: {
        remainingQuantity: { gt: 0 },
        warehouse: {
          storeId: req.storeId,
          ...(warehouseId ? { id: warehouseId } : {}),
        },
        ...(search
          ? {
              productVariant: {
                product: {
                  OR: [
                    { name: { contains: search, mode: 'insensitive' } },
                    { brand: { contains: search, mode: 'insensitive' } },
                  ],
                },
              },
            }
          : {}),
      },
      include: {
        warehouse: true,
        supplier: true,
        costCurrency: true,
        sellCurrency: true,
        productVariant: {
          include: {
            size: true,
            product: {
              include: {
                category: true,
                images: {
                  orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
                  take: 1,
                },
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const grouped = {};

    for (const batch of batches) {
      const key = batch.productVariantId;

      if (!grouped[key]) {
        grouped[key] = {
          productVariantId: key,
          productId: batch.productVariant.product.id,
          productName: batch.productVariant.product.name,
          brand: batch.productVariant.product.brand,
          size: batch.productVariant.size.name,
          barcode: batch.productVariant.barcode,
          imageUrl: batch.productVariant.product.images?.[0]?.imageUrl || '',
          totalQuantity: 0,
          batches: [],
        };
      }

      grouped[key].totalQuantity += batch.remainingQuantity;
      grouped[key].batches.push({
        batchId: batch.id,
        warehouseId: batch.warehouseId,
        warehouseName: batch.warehouse.name,
        supplierName: batch.supplier?.name || null,
        remainingQuantity: batch.remainingQuantity,
        costPrice: batch.costPrice,
        costCurrencyId: batch.costCurrencyId,
        costCurrencyCode: batch.costCurrency?.code || null,
        sellPrice: batch.sellPrice,
        sellCurrencyId: batch.sellCurrencyId,
        sellCurrencyCode: batch.sellCurrency?.code || null,
        createdAt: batch.createdAt,
      });
    }

    return res.json(Object.values(grouped));
  } catch (error) {
    console.error('getStockBalances error:', error);
    return res.status(500).json({
      message: 'Server xatosi',
    });
  }
};

export const getStockMovements = async (req, res) => {
  try {
    const warehouseId = req.query.warehouseId ? String(req.query.warehouseId) : null;

    const movements = await prisma.stockMovement.findMany({
      where: {
        storeId: req.storeId,
        ...(warehouseId ? { warehouseId } : {}),
      },
      include: {
        warehouse: true,
        batch: true,
        createdBy: {
          select: {
            id: true,
            fullName: true,
            username: true,
          },
        },
        productVariant: {
          include: {
            size: true,
            product: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return res.json(movements);
  } catch (error) {
    console.error('getStockMovements error:', error);
    return res.status(500).json({
      message: 'Server xatosi',
    });
  }
};

export const getWarehouseTransferOptions = async (req, res) => {
  try {
    const fromWarehouseId = req.query.fromWarehouseId
      ? String(req.query.fromWarehouseId).trim()
      : '';

    if (!fromWarehouseId) {
      return res.status(400).json({
        message: 'fromWarehouseId majburiy',
      });
    }

    const warehouse = await prisma.warehouse.findFirst({
      where: {
        id: fromWarehouseId,
        storeId: req.storeId,
        isActive: true,
      },
    });

    if (!warehouse) {
      return res.status(404).json({
        message: 'Ombor topilmadi',
      });
    }

    const batches = await prisma.stockBatch.findMany({
      where: {
        warehouseId: fromWarehouseId,
        remainingQuantity: { gt: 0 },
        productVariant: {
          product: {
            storeId: req.storeId,
            isActive: true,
          },
        },
      },
      include: {
        supplier: true,
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
      orderBy: [
        { productVariant: { product: { name: 'asc' } } },
        { createdAt: 'asc' },
      ],
    });

    const grouped = {};

    for (const batch of batches) {
      const variantId = batch.productVariantId;
      const product = batch.productVariant.product;

      if (!grouped[variantId]) {
        grouped[variantId] = {
          productVariantId: variantId,
          productId: product.id,
          productName: product.name,
          brand: product.brand || '',
          barcode: batch.productVariant.barcode || '',
          size: batch.productVariant.size?.name || '-',
          totalQuantity: 0,
          imageUrl: product.images?.[0]?.imageUrl || '',
          images: (product.images || []).map((image) => ({
            id: image.id,
            imageUrl: image.imageUrl,
            isPrimary: image.isPrimary,
            sortOrder: image.sortOrder,
          })),
          batches: [],
        };
      }

      grouped[variantId].totalQuantity += Number(batch.remainingQuantity || 0);

      grouped[variantId].batches.push({
        batchId: batch.id,
        remainingQuantity: batch.remainingQuantity,
        supplierName: batch.supplier?.name || '',
        costPrice: batch.costPrice,
        costCurrencyId: batch.costCurrencyId,
        costCurrencyCode: batch.costCurrency?.code || '',
        sellPrice: batch.sellPrice,
        sellCurrencyId: batch.sellCurrencyId,
        sellCurrencyCode: batch.sellCurrency?.code || '',
        createdAt: batch.createdAt,
      });
    }

    return res.json(Object.values(grouped));
  } catch (error) {
    console.error('getWarehouseTransferOptions error:', error);
    return res.status(500).json({
      message: 'Server xatosi',
    });
  }
};

export const createWarehouseTransfer = async (req, res) => {
  try {
    const { fromWarehouseId, toWarehouseId, note, items } = req.body;

    if (!fromWarehouseId || !toWarehouseId || !Array.isArray(items) || !items.length) {
      return res.status(400).json({
        message: 'fromWarehouseId, toWarehouseId va items majburiy',
      });
    }

    if (fromWarehouseId === toWarehouseId) {
      return res.status(400).json({
        message: "Jo'natuvchi va qabul qiluvchi ombor bir xil bo'lishi mumkin emas",
      });
    }

    const [fromWarehouse, toWarehouse] = await Promise.all([
      prisma.warehouse.findFirst({
        where: {
          id: fromWarehouseId,
          storeId: req.storeId,
          isActive: true,
        },
      }),
      prisma.warehouse.findFirst({
        where: {
          id: toWarehouseId,
          storeId: req.storeId,
          isActive: true,
        },
      }),
    ]);

    if (!fromWarehouse) {
      return res.status(404).json({
        message: "Jo'natuvchi ombor topilmadi",
      });
    }

    if (!toWarehouse) {
      return res.status(404).json({
        message: 'Qabul qiluvchi ombor topilmadi',
      });
    }

    for (const item of items) {
      if (!item.productVariantId || !item.sourceBatchId || item.quantity == null) {
        return res.status(400).json({
          message: 'Har bir item uchun productVariantId, sourceBatchId va quantity majburiy',
        });
      }

      const parsedQuantity = Number(item.quantity);

      if (Number.isNaN(parsedQuantity) || parsedQuantity <= 0) {
        return res.status(400).json({
          message: "quantity musbat son bo'lishi kerak",
        });
      }

      const batch = await prisma.stockBatch.findFirst({
        where: {
          id: item.sourceBatchId,
          warehouseId: fromWarehouseId,
          productVariantId: item.productVariantId,
          remainingQuantity: { gt: 0 },
          warehouse: {
            storeId: req.storeId,
          },
        },
      });

      if (!batch) {
        return res.status(404).json({
          message: "Tanlangan kirim topilmadi yoki qoldiq yo'q",
        });
      }

      if (parsedQuantity > Number(batch.remainingQuantity || 0)) {
        return res.status(400).json({
          message: `Kirimdagi qoldiq yetarli emas. Mavjud: ${batch.remainingQuantity}`,
        });
      }
    }

    const transfer = await prisma.$transaction(async (tx) => {
      const createdTransfer = await tx.warehouseTransfer.create({
        data: {
          storeId: req.storeId,
          fromWarehouseId,
          toWarehouseId,
          note: note ? String(note).trim() : null,
          createdById: req.user.id,
          status: WarehouseTransferStatus.PENDING,
        },
      });

      for (const item of items) {
        await tx.warehouseTransferItem.create({
          data: {
            transferId: createdTransfer.id,
            productVariantId: item.productVariantId,
            sourceBatchId: item.sourceBatchId,
            quantity: Number(item.quantity),
          },
        });
      }

      return tx.warehouseTransfer.findUnique({
        where: { id: createdTransfer.id },
        include: {
          fromWarehouse: true,
          toWarehouse: true,
          createdBy: {
            select: {
              id: true,
              fullName: true,
              username: true,
            },
          },
          items: {
            include: {
              sourceBatch: true,
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
    });

    return res.status(201).json({
      message: "O'tkazma yaratildi va tasdiq kutmoqda",
      transfer,
    });
  } catch (error) {
    console.error('createWarehouseTransfer error:', error);
    return res.status(500).json({
      message: 'Server xatosi',
    });
  }
};

export const getWarehouseTransfers = async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page || 1), 1);
    const pageSize = Math.min(Math.max(Number(req.query.pageSize || 10), 1), 100);
    const skip = (page - 1) * pageSize;

    const q = req.query.q ? String(req.query.q).trim() : '';
    const status = req.query.status ? String(req.query.status).trim() : '';
    const warehouseId = req.query.warehouseId ? String(req.query.warehouseId) : null;

    const where = {
      storeId: req.storeId,
      ...(status ? { status } : {}),
      ...(warehouseId
        ? {
            OR: [{ fromWarehouseId: warehouseId }, { toWarehouseId: warehouseId }],
          }
        : {}),
      ...(q
        ? {
            OR: [
              {
                note: {
                  contains: q,
                  mode: 'insensitive',
                },
              },
              {
                fromWarehouse: {
                  name: {
                    contains: q,
                    mode: 'insensitive',
                  },
                },
              },
              {
                toWarehouse: {
                  name: {
                    contains: q,
                    mode: 'insensitive',
                  },
                },
              },
              {
                items: {
                  some: {
                    productVariant: {
                      product: {
                        name: {
                          contains: q,
                          mode: 'insensitive',
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
      prisma.warehouseTransfer.count({ where }),
      prisma.warehouseTransfer.findMany({
        where,
        skip,
        take: pageSize,
        include: {
          fromWarehouse: true,
          toWarehouse: true,
          createdBy: {
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
              sourceBatch: true,
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
    console.error('getWarehouseTransfers error:', error);
    return res.status(500).json({
      message: 'Server xatosi',
    });
  }
};

export const approveWarehouseTransfer = async (req, res) => {
  try {
    const { transferId } = req.params;

    const transfer = await prisma.warehouseTransfer.findFirst({
      where: {
        id: transferId,
        storeId: req.storeId,
      },
      include: {
        fromWarehouse: true,
        toWarehouse: true,
        items: {
          include: {
            sourceBatch: true,
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

    if (!transfer) {
      return res.status(404).json({
        message: "O'tkazma topilmadi",
      });
    }

    if (transfer.status !== WarehouseTransferStatus.PENDING) {
      return res.status(400).json({
        message: "Faqat PENDING o'tkazmani tasdiqlash mumkin",
      });
    }

    const approvedTransfer = await prisma.$transaction(async (tx) => {
      for (const item of transfer.items) {
        const freshBatch = await tx.stockBatch.findUnique({
          where: { id: item.sourceBatchId },
        });

        if (!freshBatch) {
          throw new Error('Source batch topilmadi');
        }

        if (Number(freshBatch.remainingQuantity || 0) < Number(item.quantity || 0)) {
          throw new Error(
            `${item.productVariant.product.name} / ${item.productVariant.size?.name || '-'} uchun qoldiq yetarli emas`
          );
        }

        await tx.stockBatch.update({
          where: { id: freshBatch.id },
          data: {
            remainingQuantity: {
              decrement: Number(item.quantity),
            },
          },
        });

        const targetBatch = await tx.stockBatch.create({
          data: {
            warehouseId: transfer.toWarehouseId,
            productVariantId: item.productVariantId,
            supplierId: freshBatch.supplierId || null,
            quantity: Number(item.quantity),
            remainingQuantity: Number(item.quantity),
            costPrice: freshBatch.costPrice,
            costCurrencyId: freshBatch.costCurrencyId,
            sellPrice: freshBatch.sellPrice,
            sellCurrencyId: freshBatch.sellCurrencyId,
          },
        });

        await tx.stockMovement.create({
          data: {
            storeId: req.storeId,
            warehouseId: transfer.fromWarehouseId,
            productVariantId: item.productVariantId,
            batchId: freshBatch.id,
            createdById: req.user.id,
            type: StockMovementType.TRANSFER_OUT,
            quantity: Number(item.quantity),
            note: transfer.note || `${transfer.toWarehouse.name} omborga o'tkazildi`,
          },
        });

        await tx.stockMovement.create({
          data: {
            storeId: req.storeId,
            warehouseId: transfer.toWarehouseId,
            productVariantId: item.productVariantId,
            batchId: targetBatch.id,
            createdById: req.user.id,
            type: StockMovementType.TRANSFER_IN,
            quantity: Number(item.quantity),
            note: transfer.note || `${transfer.fromWarehouse.name} omboridan qabul qilindi`,
          },
        });
      }

      await tx.warehouseTransfer.update({
        where: { id: transfer.id },
        data: {
          status: WarehouseTransferStatus.APPROVED,
          approvedById: req.user.id,
          approvedAt: new Date(),
        },
      });

      return tx.warehouseTransfer.findUnique({
        where: { id: transfer.id },
        include: {
          fromWarehouse: true,
          toWarehouse: true,
          createdBy: {
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
              sourceBatch: true,
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
    });

    return res.json({
      message: "O'tkazma tasdiqlandi",
      transfer: approvedTransfer,
    });
  } catch (error) {
    console.error('approveWarehouseTransfer error:', error);
    return res.status(400).json({
      message: error.message || "O'tkazmani tasdiqlashda xatolik",
    });
  }
};

export const rejectWarehouseTransfer = async (req, res) => {
  try {
    const { transferId } = req.params;
    const { note } = req.body;

    const transfer = await prisma.warehouseTransfer.findFirst({
      where: {
        id: transferId,
        storeId: req.storeId,
      },
    });

    if (!transfer) {
      return res.status(404).json({
        message: "O'tkazma topilmadi",
      });
    }

    if (transfer.status !== WarehouseTransferStatus.PENDING) {
      return res.status(400).json({
        message: "Faqat PENDING o'tkazmani bekor qilish mumkin",
      });
    }

    const updated = await prisma.warehouseTransfer.update({
      where: { id: transferId },
      data: {
        status: WarehouseTransferStatus.REJECTED,
        approvedById: req.user.id,
        approvedAt: new Date(),
        note: note ? String(note).trim() : transfer.note,
      },
      include: {
        fromWarehouse: true,
        toWarehouse: true,
        createdBy: {
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
            sourceBatch: true,
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
      message: "O'tkazma bekor qilindi",
      transfer: updated,
    });
  } catch (error) {
    console.error('rejectWarehouseTransfer error:', error);
    return res.status(500).json({
      message: 'Server xatosi',
    });
  }
};

export const getSupplierReturnOptions = async (req, res) => {
  try {
    const warehouseId = req.query.warehouseId ? String(req.query.warehouseId).trim() : '';
    const supplierId = req.query.supplierId ? String(req.query.supplierId).trim() : '';

    if (!warehouseId || !supplierId) {
      return res.status(400).json({
        message: 'warehouseId va supplierId majburiy',
      });
    }

    const [warehouse, supplier] = await Promise.all([
      prisma.warehouse.findFirst({
        where: {
          id: warehouseId,
          storeId: req.storeId,
          isActive: true,
        },
      }),
      prisma.supplier.findFirst({
        where: {
          id: supplierId,
          storeId: req.storeId,
          isActive: true,
        },
      }),
    ]);

    if (!warehouse) {
      return res.status(404).json({
        message: 'Ombor topilmadi',
      });
    }

    if (!supplier) {
      return res.status(404).json({
        message: 'Taminotchi topilmadi',
      });
    }

    const batches = await prisma.stockBatch.findMany({
      where: {
        warehouseId,
        supplierId,
        remainingQuantity: { gt: 0 },
        productVariant: {
          product: {
            storeId: req.storeId,
            isActive: true,
          },
        },
      },
      include: {
        supplier: true,
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
      orderBy: [
        { productVariant: { product: { name: 'asc' } } },
        { createdAt: 'asc' },
      ],
    });

    const grouped = {};

    for (const batch of batches) {
      const variantId = batch.productVariantId;
      const product = batch.productVariant.product;

      if (!grouped[variantId]) {
        grouped[variantId] = {
          productVariantId: variantId,
          productId: product.id,
          productName: product.name,
          brand: product.brand || '',
          barcode: batch.productVariant.barcode || '',
          size: batch.productVariant.size?.name || '-',
          totalQuantity: 0,
          imageUrl: product.images?.[0]?.imageUrl || '',
          images: (product.images || []).map((image) => ({
            id: image.id,
            imageUrl: image.imageUrl,
            isPrimary: image.isPrimary,
            sortOrder: image.sortOrder,
          })),
          batches: [],
        };
      }

      grouped[variantId].totalQuantity += Number(batch.remainingQuantity || 0);

      grouped[variantId].batches.push({
        batchId: batch.id,
        remainingQuantity: batch.remainingQuantity,
        supplierName: batch.supplier?.name || '',
        costPrice: batch.costPrice,
        costCurrencyId: batch.costCurrencyId,
        costCurrencyCode: batch.costCurrency?.code || '',
        sellPrice: batch.sellPrice,
        sellCurrencyId: batch.sellCurrencyId,
        sellCurrencyCode: batch.sellCurrency?.code || '',
        createdAt: batch.createdAt,
      });
    }

    return res.json(Object.values(grouped));
  } catch (error) {
    console.error('getSupplierReturnOptions error:', error);
    return res.status(500).json({
      message: 'Server xatosi',
    });
  }
};

export const createSupplierReturn = async (req, res) => {
  try {
    const { warehouseId, supplierId, note, items } = req.body;

    if (!warehouseId || !supplierId || !Array.isArray(items) || !items.length) {
      return res.status(400).json({
        message: 'warehouseId, supplierId va items majburiy',
      });
    }

    const [warehouse, supplier] = await Promise.all([
      prisma.warehouse.findFirst({
        where: {
          id: warehouseId,
          storeId: req.storeId,
          isActive: true,
        },
      }),
      prisma.supplier.findFirst({
        where: {
          id: supplierId,
          storeId: req.storeId,
          isActive: true,
        },
      }),
    ]);

    if (!warehouse) {
      return res.status(404).json({
        message: 'Ombor topilmadi',
      });
    }

    if (!supplier) {
      return res.status(404).json({
        message: 'Taminotchi topilmadi',
      });
    }

    for (const item of items) {
      if (!item.productVariantId || !item.sourceBatchId || item.quantity == null) {
        return res.status(400).json({
          message: 'Har bir item uchun productVariantId, sourceBatchId va quantity majburiy',
        });
      }

      const parsedQuantity = Number(item.quantity);

      if (Number.isNaN(parsedQuantity) || parsedQuantity <= 0) {
        return res.status(400).json({
          message: "quantity musbat son bo'lishi kerak",
        });
      }

      const batch = await prisma.stockBatch.findFirst({
        where: {
          id: item.sourceBatchId,
          warehouseId,
          supplierId,
          productVariantId: item.productVariantId,
          remainingQuantity: { gt: 0 },
          warehouse: { storeId: req.storeId },
        },
      });

      if (!batch) {
        return res.status(404).json({
          message: "Tanlangan batch topilmadi yoki qoldiq yo'q",
        });
      }

      if (parsedQuantity > Number(batch.remainingQuantity || 0)) {
        return res.status(400).json({
          message: `Batchdagi qoldiq yetarli emas. Mavjud: ${batch.remainingQuantity}`,
        });
      }
    }

    const supplierReturn = await prisma.$transaction(async (tx) => {
      const created = await tx.supplierReturn.create({
        data: {
          storeId: req.storeId,
          warehouseId,
          supplierId,
          submittedById: req.user.id,
          note: note ? String(note).trim() : null,
          status: SupplierReturnStatus.PENDING,
        },
      });

      for (const item of items) {
        await tx.supplierReturnItem.create({
          data: {
            supplierReturnId: created.id,
            productVariantId: item.productVariantId,
            sourceBatchId: item.sourceBatchId,
            quantity: Number(item.quantity),
          },
        });
      }

      return tx.supplierReturn.findUnique({
        where: { id: created.id },
        include: {
          warehouse: true,
          supplier: true,
          submittedBy: {
            select: { id: true, fullName: true, username: true },
          },
          items: {
            include: {
              sourceBatch: true,
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
    });

    return res.status(201).json({
      message: 'Qaytarish hujjati yaratildi va tasdiq kutmoqda',
      supplierReturn,
    });
  } catch (error) {
    console.error('createSupplierReturn error:', error);
    return res.status(500).json({
      message: 'Server xatosi',
    });
  }
};

export const getSupplierReturns = async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page || 1), 1);
    const pageSize = Math.min(Math.max(Number(req.query.pageSize || 10), 1), 100);
    const skip = (page - 1) * pageSize;

    const status = req.query.status ? String(req.query.status).trim() : '';
    const supplierId = req.query.supplierId ? String(req.query.supplierId).trim() : '';
    const warehouseId = req.query.warehouseId ? String(req.query.warehouseId).trim() : '';
    const q = req.query.q ? String(req.query.q).trim() : '';

    const where = {
      storeId: req.storeId,
      ...(status ? { status } : {}),
      ...(supplierId ? { supplierId } : {}),
      ...(warehouseId ? { warehouseId } : {}),
      ...(q
        ? {
            OR: [
              { note: { contains: q, mode: 'insensitive' } },
              { supplier: { name: { contains: q, mode: 'insensitive' } } },
              { warehouse: { name: { contains: q, mode: 'insensitive' } } },
              {
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
            ],
          }
        : {}),
    };

    const [totalItems, items] = await Promise.all([
      prisma.supplierReturn.count({ where }),
      prisma.supplierReturn.findMany({
        where,
        skip,
        take: pageSize,
        include: {
          warehouse: true,
          supplier: true,
          submittedBy: {
            select: { id: true, fullName: true, username: true },
          },
          approvedBy: {
            select: { id: true, fullName: true, username: true },
          },
          items: {
            include: {
              sourceBatch: true,
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
    console.error('getSupplierReturns error:', error);
    return res.status(500).json({
      message: 'Server xatosi',
    });
  }
};

export const approveSupplierReturn = async (req, res) => {
  try {
    const { supplierReturnId } = req.params;

    const supplierReturn = await prisma.supplierReturn.findFirst({
      where: {
        id: supplierReturnId,
        storeId: req.storeId,
      },
      include: {
        warehouse: true,
        supplier: true,
        items: {
          include: {
            sourceBatch: true,
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

    if (!supplierReturn) {
      return res.status(404).json({
        message: 'Qaytarish hujjati topilmadi',
      });
    }

    if (supplierReturn.status !== SupplierReturnStatus.PENDING) {
      return res.status(400).json({
        message: 'Faqat PENDING hujjatni tasdiqlash mumkin',
      });
    }

    const approved = await prisma.$transaction(async (tx) => {
      for (const item of supplierReturn.items) {
        const freshBatch = await tx.stockBatch.findUnique({
          where: { id: item.sourceBatchId },
        });

        if (!freshBatch) {
          throw new Error('Source batch topilmadi');
        }

        if (freshBatch.supplierId !== supplierReturn.supplierId) {
          throw new Error('Batch bu taminotchiga tegishli emas');
        }

        if (Number(freshBatch.remainingQuantity || 0) < Number(item.quantity || 0)) {
          throw new Error(
            `${item.productVariant.product.name} / ${item.productVariant.size?.name || '-'} uchun qoldiq yetarli emas`
          );
        }

        await tx.stockBatch.update({
          where: { id: freshBatch.id },
          data: {
            remainingQuantity: {
              decrement: Number(item.quantity),
            },
          },
        });

        await tx.stockMovement.create({
          data: {
            storeId: req.storeId,
            warehouseId: supplierReturn.warehouseId,
            productVariantId: item.productVariantId,
            batchId: freshBatch.id,
            createdById: req.user.id,
            type: StockMovementType.SUPPLIER_RETURN,
            quantity: Number(item.quantity),
            note:
              supplierReturn.note ||
              `${supplierReturn.supplier.name} taminotchiga qaytarildi`,
          },
        });
      }

      await tx.supplierReturn.update({
        where: { id: supplierReturn.id },
        data: {
          status: SupplierReturnStatus.APPROVED,
          approvedById: req.user.id,
          approvedAt: new Date(),
        },
      });

      return tx.supplierReturn.findUnique({
        where: { id: supplierReturn.id },
        include: {
          warehouse: true,
          supplier: true,
          submittedBy: {
            select: { id: true, fullName: true, username: true },
          },
          approvedBy: {
            select: { id: true, fullName: true, username: true },
          },
          items: {
            include: {
              sourceBatch: true,
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
    });

    return res.json({
      message: 'Qaytarish tasdiqlandi',
      supplierReturn: approved,
    });
  } catch (error) {
    console.error('approveSupplierReturn error:', error);
    return res.status(400).json({
      message: error.message || 'Qaytarishni tasdiqlashda xatolik',
    });
  }
};

export const rejectSupplierReturn = async (req, res) => {
  try {
    const { supplierReturnId } = req.params;
    const { note } = req.body;

    const supplierReturn = await prisma.supplierReturn.findFirst({
      where: {
        id: supplierReturnId,
        storeId: req.storeId,
      },
    });

    if (!supplierReturn) {
      return res.status(404).json({
        message: 'Qaytarish hujjati topilmadi',
      });
    }

    if (supplierReturn.status !== SupplierReturnStatus.PENDING) {
      return res.status(400).json({
        message: 'Faqat PENDING hujjatni rad etish mumkin',
      });
    }

    const rejected = await prisma.supplierReturn.update({
      where: { id: supplierReturnId },
      data: {
        status: SupplierReturnStatus.REJECTED,
        approvedById: req.user.id,
        approvedAt: new Date(),
        note: note ? String(note).trim() : supplierReturn.note,
      },
      include: {
        warehouse: true,
        supplier: true,
        submittedBy: {
          select: { id: true, fullName: true, username: true },
        },
        approvedBy: {
          select: { id: true, fullName: true, username: true },
        },
        items: {
          include: {
            sourceBatch: true,
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
      message: 'Qaytarish rad etildi',
      supplierReturn: rejected,
    });
  } catch (error) {
    console.error('rejectSupplierReturn error:', error);
    return res.status(500).json({
      message: 'Server xatosi',
    });
  }
};

export const updateSupplierReturn = async (req, res) => {
  try {
    const { supplierReturnId } = req.params;
    const { warehouseId, supplierId, note, items } = req.body;

    if (!warehouseId || !supplierId || !Array.isArray(items) || !items.length) {
      return res.status(400).json({
        message: 'warehouseId, supplierId va items majburiy',
      });
    }

    const existingReturn = await prisma.supplierReturn.findFirst({
      where: {
        id: supplierReturnId,
        storeId: req.storeId,
      },
      include: {
        items: true,
      },
    });

    if (!existingReturn) {
      return res.status(404).json({
        message: 'Qaytarish hujjati topilmadi',
      });
    }

    if (existingReturn.status !== SupplierReturnStatus.PENDING) {
      return res.status(400).json({
        message: 'Faqat PENDING qaytarishni tahrirlash mumkin',
      });
    }

    const [warehouse, supplier] = await Promise.all([
      prisma.warehouse.findFirst({
        where: {
          id: warehouseId,
          storeId: req.storeId,
          isActive: true,
        },
      }),
      prisma.supplier.findFirst({
        where: {
          id: supplierId,
          storeId: req.storeId,
          isActive: true,
        },
      }),
    ]);

    if (!warehouse) {
      return res.status(404).json({
        message: 'Ombor topilmadi',
      });
    }

    if (!supplier) {
      return res.status(404).json({
        message: 'Taminotchi topilmadi',
      });
    }

    const normalizedItems = [];
    const seenKeys = new Set();

    for (const item of items) {
      if (!item.productVariantId || !item.sourceBatchId || item.quantity == null) {
        return res.status(400).json({
          message: 'Har bir item uchun productVariantId, sourceBatchId va quantity majburiy',
        });
      }

      const parsedQuantity = Number(item.quantity);

      if (Number.isNaN(parsedQuantity) || parsedQuantity <= 0) {
        return res.status(400).json({
          message: "quantity musbat son bo'lishi kerak",
        });
      }

      const duplicateKey = `${item.productVariantId}-${item.sourceBatchId}`;
      if (seenKeys.has(duplicateKey)) {
        return res.status(400).json({
          message: "Bir xil variant va batch ikki marta qo'shilmasin",
        });
      }
      seenKeys.add(duplicateKey);

      const batch = await prisma.stockBatch.findFirst({
        where: {
          id: item.sourceBatchId,
          warehouseId,
          supplierId,
          productVariantId: item.productVariantId,
          remainingQuantity: { gt: 0 },
          warehouse: { storeId: req.storeId },
        },
      });

      if (!batch) {
        return res.status(404).json({
          message: "Tanlangan batch topilmadi yoki qoldiq yo'q",
        });
      }

      if (parsedQuantity > Number(batch.remainingQuantity || 0)) {
        return res.status(400).json({
          message: `Batchdagi qoldiq yetarli emas. Mavjud: ${batch.remainingQuantity}`,
        });
      }

      normalizedItems.push({
        productVariantId: item.productVariantId,
        sourceBatchId: item.sourceBatchId,
        quantity: parsedQuantity,
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.supplierReturn.update({
        where: { id: supplierReturnId },
        data: {
          warehouseId,
          supplierId,
          note: note ? String(note).trim() : null,
        },
      });

      await tx.supplierReturnItem.deleteMany({
        where: {
          supplierReturnId,
        },
      });

      await tx.supplierReturnItem.createMany({
        data: normalizedItems.map((item) => ({
          supplierReturnId,
          productVariantId: item.productVariantId,
          sourceBatchId: item.sourceBatchId,
          quantity: item.quantity,
        })),
      });

      return tx.supplierReturn.findUnique({
        where: { id: supplierReturnId },
        include: {
          warehouse: true,
          supplier: true,
          submittedBy: {
            select: { id: true, fullName: true, username: true },
          },
          approvedBy: {
            select: { id: true, fullName: true, username: true },
          },
          items: {
            include: {
              sourceBatch: true,
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
      message: 'Qaytarish hujjati yangilandi',
      supplierReturn: updated,
    });
  } catch (error) {
    console.error('updateSupplierReturn error:', error);
    return res.status(500).json({
      message: 'Server xatosi',
    });
  }
};