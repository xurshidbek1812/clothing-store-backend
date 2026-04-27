import pkg from '@prisma/client';
import { prisma } from '../lib/prisma.js';

const { InterStoreTransferStatus, StockMovementType } = pkg;

function roundPage(value, fallback = 1) {
  const num = Number(value);
  if (Number.isNaN(num) || num < 1) return fallback;
  return Math.floor(num);
}

function mapTransferInclude() {
  return {
    fromStore: true,
    toStore: true,
    fromWarehouse: true,
    toWarehouse: true,
    createdBy: {
      select: {
        id: true,
        fullName: true,
        username: true,
      },
    },
    sentBy: {
      select: {
        id: true,
        fullName: true,
        username: true,
      },
    },
    receivedBy: {
      select: {
        id: true,
        fullName: true,
        username: true,
      },
    },
    items: {
      include: {
        sourceBatch: {
          include: {
            supplier: true,
            costCurrency: true,
            sellCurrency: true,
          },
        },
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
      orderBy: {
        createdAt: 'asc',
      },
    },
  };
}

export const getInterStoreTransferOptions = async (req, res) => {
  try {
    const fromWarehouseId = String(req.query.fromWarehouseId || '').trim();
    const q = String(req.query.q || '').trim();

    const storeLinks = await prisma.userStore.findMany({
      where: {
        userId: req.user.id,
      },
      select: {
        storeId: true,
      },
    });

    const accessibleStoreIds = storeLinks.map((item) => item.storeId);

    const targetWarehouses = await prisma.warehouse.findMany({
      where: {
        isActive: true,
        storeId: {
          in: accessibleStoreIds.filter((id) => id !== req.storeId),
        },
      },
      include: {
        store: true,
      },
      orderBy: [{ store: { name: 'asc' } }, { name: 'asc' }],
    });

    let sourceProducts = [];

    if (fromWarehouseId) {
      const sourceWarehouse = await prisma.warehouse.findFirst({
        where: {
          id: fromWarehouseId,
          storeId: req.storeId,
          isActive: true,
        },
      });

      if (!sourceWarehouse) {
        return res.status(404).json({
          message: "Jo'natuvchi ombor topilmadi",
        });
      }

      const batches = await prisma.stockBatch.findMany({
        where: {
          warehouseId: fromWarehouseId,
          remainingQuantity: {
            gt: 0,
          },
          ...(q
            ? {
                productVariant: {
                  product: {
                    OR: [
                      { name: { contains: q, mode: 'insensitive' } },
                      { brand: { contains: q, mode: 'insensitive' } },
                    ],
                  },
                },
              }
            : {}),
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
          { createdAt: 'desc' },
        ],
      });

      sourceProducts = batches.map((batch) => ({
        batchId: batch.id,
        productVariantId: batch.productVariantId,
        productId: batch.productVariant.product.id,
        productName: batch.productVariant.product.name,
        brand: batch.productVariant.product.brand,
        size: batch.productVariant.size?.name || '',
        barcode: batch.productVariant.barcode,
        imageUrl:
          batch.productVariant.product.images?.find((img) => img.isPrimary)?.imageUrl ||
          batch.productVariant.product.images?.[0]?.imageUrl ||
          '',
        images: batch.productVariant.product.images || [],
        remainingQuantity: batch.remainingQuantity,
        supplierId: batch.supplierId,
        supplierName: batch.supplier?.name || null,
        createdAt: batch.createdAt,
        costPrice: batch.costPrice,
        sellPrice: batch.sellPrice,
        costCurrency: batch.costCurrency,
        sellCurrency: batch.sellCurrency,
      }));
    }

    return res.json({
      targetWarehouses,
      sourceProducts,
    });
  } catch (error) {
    console.error('getInterStoreTransferOptions error:', error);
    return res.status(500).json({
      message: 'Server xatosi',
    });
  }
};

export const createInterStoreTransfer = async (req, res) => {
  try {
    const { fromWarehouseId, toWarehouseId, note, items } = req.body;

    if (!fromWarehouseId || !toWarehouseId || !Array.isArray(items) || !items.length) {
      return res.status(400).json({
        message: 'fromWarehouseId, toWarehouseId va items majburiy',
      });
    }

    if (fromWarehouseId === toWarehouseId) {
      return res.status(400).json({
        message: "Bir xil ombor tanlab bo'lmaydi",
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

    if (toWarehouse.storeId === req.storeId) {
      return res.status(400).json({
        message: "Bu yerda faqat boshqa do'kon omboriga jo'natish mumkin",
      });
    }

    const userHasAccessToTargetStore = await prisma.userStore.findFirst({
      where: {
        userId: req.user.id,
        storeId: toWarehouse.storeId,
      },
    });

    if (!userHasAccessToTargetStore) {
      return res.status(403).json({
        message: "Sizda qabul qiluvchi do'konga ruxsat yo'q",
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

      const quantity = Number(item.quantity);

      if (Number.isNaN(quantity) || quantity <= 0) {
        return res.status(400).json({
          message: "quantity musbat son bo'lishi kerak",
        });
      }

      const duplicateKey = `${item.productVariantId}-${item.sourceBatchId}`;
      if (seenKeys.has(duplicateKey)) {
        return res.status(400).json({
          message: "Bir xil batchni ikki marta qo'shib bo'lmaydi",
        });
      }
      seenKeys.add(duplicateKey);

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
          message: "Tanlangan batch topilmadi yoki qoldiq yo'q",
        });
      }

      if (quantity > Number(batch.remainingQuantity || 0)) {
        return res.status(400).json({
          message: `Batch qoldig'i yetarli emas. Mavjud: ${batch.remainingQuantity}`,
        });
      }

      normalizedItems.push({
        productVariantId: item.productVariantId,
        sourceBatchId: item.sourceBatchId,
        quantity,
      });
    }

    const transfer = await prisma.$transaction(async (tx) => {
      const createdTransfer = await tx.interStoreTransfer.create({
        data: {
          fromStoreId: req.storeId,
          toStoreId: toWarehouse.storeId,
          fromWarehouseId,
          toWarehouseId,
          note: note ? String(note).trim() : null,
          createdById: req.user.id,
          status: InterStoreTransferStatus.PENDING,
        },
      });

      await tx.interStoreTransferItem.createMany({
        data: normalizedItems.map((item) => ({
          transferId: createdTransfer.id,
          productVariantId: item.productVariantId,
          sourceBatchId: item.sourceBatchId,
          quantity: item.quantity,
        })),
      });

      return tx.interStoreTransfer.findUnique({
        where: { id: createdTransfer.id },
        include: mapTransferInclude(),
      });
    });

    return res.status(201).json({
      message: "Do'konlararo jo'natma yaratildi",
      transfer,
    });
  } catch (error) {
    console.error('createInterStoreTransfer error:', error);
    return res.status(500).json({
      message: 'Server xatosi',
    });
  }
};

export const updateInterStoreTransfer = async (req, res) => {
  try {
    const { transferId } = req.params;
    const { fromWarehouseId, toWarehouseId, note, items } = req.body;

    const existing = await prisma.interStoreTransfer.findFirst({
      where: {
        id: transferId,
        fromStoreId: req.storeId,
      },
    });

    if (!existing) {
      return res.status(404).json({
        message: "Jo'natma topilmadi",
      });
    }

    if (existing.status !== InterStoreTransferStatus.PENDING) {
      return res.status(400).json({
        message: 'Faqat PENDING jo‘natmani tahrirlash mumkin',
      });
    }

    if (!fromWarehouseId || !toWarehouseId || !Array.isArray(items) || !items.length) {
      return res.status(400).json({
        message: 'fromWarehouseId, toWarehouseId va items majburiy',
      });
    }

    if (fromWarehouseId === toWarehouseId) {
      return res.status(400).json({
        message: "Bir xil ombor tanlab bo'lmaydi",
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
          isActive: true,
        },
      }),
    ]);

    if (!fromWarehouse || !toWarehouse) {
      return res.status(404).json({
        message: 'Omborlardan biri topilmadi',
      });
    }

    if (toWarehouse.storeId === req.storeId) {
      return res.status(400).json({
        message: "Bu yerda faqat boshqa do'kon omboriga jo'natish mumkin",
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

      const quantity = Number(item.quantity);

      if (Number.isNaN(quantity) || quantity <= 0) {
        return res.status(400).json({
          message: "quantity musbat son bo'lishi kerak",
        });
      }

      const duplicateKey = `${item.productVariantId}-${item.sourceBatchId}`;
      if (seenKeys.has(duplicateKey)) {
        return res.status(400).json({
          message: "Bir xil batchni ikki marta qo'shib bo'lmaydi",
        });
      }
      seenKeys.add(duplicateKey);

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
          message: "Tanlangan batch topilmadi yoki qoldiq yo'q",
        });
      }

      if (quantity > Number(batch.remainingQuantity || 0)) {
        return res.status(400).json({
          message: `Batch qoldig'i yetarli emas. Mavjud: ${batch.remainingQuantity}`,
        });
      }

      normalizedItems.push({
        productVariantId: item.productVariantId,
        sourceBatchId: item.sourceBatchId,
        quantity,
      });
    }

    const transfer = await prisma.$transaction(async (tx) => {
      await tx.interStoreTransfer.update({
        where: { id: transferId },
        data: {
          fromStoreId: req.storeId,
          toStoreId: toWarehouse.storeId,
          fromWarehouseId,
          toWarehouseId,
          note: note ? String(note).trim() : null,
        },
      });

      await tx.interStoreTransferItem.deleteMany({
        where: { transferId },
      });

      await tx.interStoreTransferItem.createMany({
        data: normalizedItems.map((item) => ({
          transferId,
          productVariantId: item.productVariantId,
          sourceBatchId: item.sourceBatchId,
          quantity: item.quantity,
        })),
      });

      return tx.interStoreTransfer.findUnique({
        where: { id: transferId },
        include: mapTransferInclude(),
      });
    });

    return res.json({
      message: "Do'konlararo jo'natma yangilandi",
      transfer,
    });
  } catch (error) {
    console.error('updateInterStoreTransfer error:', error);
    return res.status(500).json({
      message: 'Server xatosi',
    });
  }
};

export const getOutgoingInterStoreTransfers = async (req, res) => {
  try {
    const page = roundPage(req.query.page, 1);
    const pageSize = Math.min(roundPage(req.query.pageSize, 10), 100);
    const skip = (page - 1) * pageSize;

    const status = String(req.query.status || '').trim();
    const q = String(req.query.q || '').trim();

    const where = {
      fromStoreId: req.storeId,
      ...(status ? { status } : {}),
      ...(q
        ? {
            OR: [
              {
                toStore: {
                  name: { contains: q, mode: 'insensitive' },
                },
              },
              {
                toWarehouse: {
                  name: { contains: q, mode: 'insensitive' },
                },
              },
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
      prisma.interStoreTransfer.count({ where }),
      prisma.interStoreTransfer.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: mapTransferInclude(),
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
    console.error('getOutgoingInterStoreTransfers error:', error);
    return res.status(500).json({
      message: 'Server xatosi',
    });
  }
};

export const getIncomingInterStoreTransfers = async (req, res) => {
  try {
    const page = roundPage(req.query.page, 1);
    const pageSize = Math.min(roundPage(req.query.pageSize, 10), 100);
    const skip = (page - 1) * pageSize;

    const status = String(req.query.status || '').trim();
    const q = String(req.query.q || '').trim();

    const where = {
      toStoreId: req.storeId,
      ...(status ? { status } : {}),
      ...(q
        ? {
            OR: [
              {
                fromStore: {
                  name: { contains: q, mode: 'insensitive' },
                },
              },
              {
                fromWarehouse: {
                  name: { contains: q, mode: 'insensitive' },
                },
              },
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
      prisma.interStoreTransfer.count({ where }),
      prisma.interStoreTransfer.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: mapTransferInclude(),
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
    console.error('getIncomingInterStoreTransfers error:', error);
    return res.status(500).json({
      message: 'Server xatosi',
    });
  }
};

export const sendInterStoreTransfer = async (req, res) => {
  try {
    const { transferId } = req.params;

    const transfer = await prisma.interStoreTransfer.findFirst({
      where: {
        id: transferId,
        fromStoreId: req.storeId,
      },
      include: mapTransferInclude(),
    });

    if (!transfer) {
      return res.status(404).json({
        message: "Jo'natma topilmadi",
      });
    }

    if (transfer.status !== InterStoreTransferStatus.PENDING) {
      return res.status(400).json({
        message: 'Faqat PENDING jo‘natmani yuborish mumkin',
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
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

        await tx.stockMovement.create({
          data: {
            storeId: transfer.fromStoreId,
            warehouseId: transfer.fromWarehouseId,
            productVariantId: item.productVariantId,
            batchId: item.sourceBatchId,
            createdById: req.user.id,
            type: StockMovementType.TRANSFER_OUT,
            quantity: Number(item.quantity),
            note: transfer.note || `${transfer.toWarehouse.name} omborga jo'natildi`,
          },
        });
      }

      await tx.interStoreTransfer.update({
        where: { id: transfer.id },
        data: {
          status: InterStoreTransferStatus.IN_TRANSIT,
          sentById: req.user.id,
          sentAt: new Date(),
        },
      });

      return tx.interStoreTransfer.findUnique({
        where: { id: transfer.id },
        include: mapTransferInclude(),
      });
    });

    return res.json({
      message: "Jo'natma yuborildi",
      transfer: updated,
    });
  } catch (error) {
    console.error('sendInterStoreTransfer error:', error);
    return res.status(400).json({
      message: error.message || 'Jo‘natishda xatolik',
    });
  }
};

export const receiveInterStoreTransfer = async (req, res) => {
  try {
    const { transferId } = req.params;

    const transfer = await prisma.interStoreTransfer.findFirst({
      where: {
        id: transferId,
        toStoreId: req.storeId,
      },
      include: mapTransferInclude(),
    });

    if (!transfer) {
      return res.status(404).json({
        message: "Jo'natma topilmadi",
      });
    }

    if (transfer.status !== InterStoreTransferStatus.IN_TRANSIT) {
      return res.status(400).json({
        message: 'Faqat IN_TRANSIT jo‘natmani qabul qilish mumkin',
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      for (const item of transfer.items) {
        const sourceBatch = await tx.stockBatch.findUnique({
          where: { id: item.sourceBatchId },
        });

        if (!sourceBatch) {
          throw new Error('Source batch topilmadi');
        }

        const newBatch = await tx.stockBatch.create({
          data: {
            warehouseId: transfer.toWarehouseId,
            productVariantId: item.productVariantId,
            supplierId: sourceBatch.supplierId || null,
            quantity: Number(item.quantity),
            remainingQuantity: Number(item.quantity),
            costPrice: sourceBatch.costPrice,
            costCurrencyId: sourceBatch.costCurrencyId,
            sellPrice: sourceBatch.sellPrice,
            sellCurrencyId: sourceBatch.sellCurrencyId,
          },
        });

        await tx.stockMovement.create({
          data: {
            storeId: transfer.toStoreId,
            warehouseId: transfer.toWarehouseId,
            productVariantId: item.productVariantId,
            batchId: newBatch.id,
            createdById: req.user.id,
            type: StockMovementType.TRANSFER_IN,
            quantity: Number(item.quantity),
            note: transfer.note || `${transfer.fromWarehouse.name} omboridan qabul qilindi`,
          },
        });
      }

      await tx.interStoreTransfer.update({
        where: { id: transfer.id },
        data: {
          status: InterStoreTransferStatus.RECEIVED,
          receivedById: req.user.id,
          receivedAt: new Date(),
        },
      });

      return tx.interStoreTransfer.findUnique({
        where: { id: transfer.id },
        include: mapTransferInclude(),
      });
    });

    return res.json({
      message: 'Jo‘natma qabul qilindi',
      transfer: updated,
    });
  } catch (error) {
    console.error('receiveInterStoreTransfer error:', error);
    return res.status(400).json({
      message: error.message || 'Qabul qilishda xatolik',
    });
  }
};

export const rejectIncomingInterStoreTransfer = async (req, res) => {
  try {
    const { transferId } = req.params;

    const transfer = await prisma.interStoreTransfer.findFirst({
      where: {
        id: transferId,
        toStoreId: req.storeId,
      },
      include: mapTransferInclude(),
    });

    if (!transfer) {
      return res.status(404).json({
        message: "Jo'natma topilmadi",
      });
    }

    if (transfer.status !== InterStoreTransferStatus.IN_TRANSIT) {
      return res.status(400).json({
        message: 'Faqat IN_TRANSIT jo‘natmani rad qilish mumkin',
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      for (const item of transfer.items) {
        await tx.stockBatch.update({
          where: { id: item.sourceBatchId },
          data: {
            remainingQuantity: {
              increment: Number(item.quantity),
            },
          },
        });
      }

      await tx.interStoreTransfer.update({
        where: { id: transfer.id },
        data: {
          status: InterStoreTransferStatus.REJECTED,
          receivedById: req.user.id,
          receivedAt: new Date(),
        },
      });

      return tx.interStoreTransfer.findUnique({
        where: { id: transfer.id },
        include: mapTransferInclude(),
      });
    });

    return res.json({
      message: 'Jo‘natma rad etildi',
      transfer: updated,
    });
  } catch (error) {
    console.error('rejectIncomingInterStoreTransfer error:', error);
    return res.status(400).json({
      message: error.message || 'Rad etishda xatolik',
    });
  }
};