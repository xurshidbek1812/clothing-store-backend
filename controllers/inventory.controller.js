import pkg from '@prisma/client';
import { prisma } from '../lib/prisma.js';

const { StockMovementType } = pkg;

function roundPage(value, fallback = 1) {
  const num = Number(value);
  if (Number.isNaN(num) || num < 1) return fallback;
  return Math.floor(num);
}

function mapProductImage(product) {
  const images = Array.isArray(product?.images) ? product.images : [];
  const primary = images.find((img) => img.isPrimary);
  return {
    ...product,
    imageUrl: primary?.imageUrl || images[0]?.imageUrl || '',
  };
}

export const getInventoryCountOptions = async (req, res) => {
  try {
    const warehouseId = String(req.query.warehouseId || '').trim();
    const q = String(req.query.q || '').trim();

    if (!warehouseId) {
      return res.status(400).json({
        message: 'warehouseId majburiy',
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

    const batches = await prisma.stockBatch.findMany({
      where: {
        warehouseId,
        remainingQuantity: { gt: 0 },
        productVariant: {
          product: {
            storeId: req.storeId,
            isActive: true,
            ...(q
              ? {
                  OR: [
                    { name: { contains: q, mode: 'insensitive' } },
                    { brand: { contains: q, mode: 'insensitive' } },
                  ],
                }
              : {}),
          },
        },
      },
      include: {
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
      const product = mapProductImage(batch.productVariant.product);

      if (!grouped[variantId]) {
        grouped[variantId] = {
          productVariantId: variantId,
          productId: product.id,
          productName: product.name,
          brand: product.brand || '',
          barcode: batch.productVariant.barcode || '',
          size: batch.productVariant.size?.name || '-',
          imageUrl: product.imageUrl || '',
          systemQuantity: 0,
          batches: [],
        };
      }

      grouped[variantId].systemQuantity += Number(batch.remainingQuantity || 0);

      grouped[variantId].batches.push({
        batchId: batch.id,
        remainingQuantity: batch.remainingQuantity,
        createdAt: batch.createdAt,
      });
    }

    return res.json(Object.values(grouped));
  } catch (error) {
    console.error('getInventoryCountOptions error:', error);
    return res.status(500).json({
      message: 'Server xatosi',
    });
  }
};

export const createInventoryCount = async (req, res) => {
  try {
    const {
      warehouseId,
      note,
      applyChanges = false,
      items,
    } = req.body;

    if (!warehouseId || !Array.isArray(items) || !items.length) {
      return res.status(400).json({
        message: 'warehouseId va items majburiy',
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

    const normalizedItems = [];
    const seenVariantIds = new Set();

    for (const item of items) {
      if (!item.productVariantId || item.countedQuantity == null) {
        return res.status(400).json({
          message: 'Har bir item uchun productVariantId va countedQuantity majburiy',
        });
      }

      const countedQuantity = Number(item.countedQuantity);

      if (Number.isNaN(countedQuantity) || countedQuantity < 0) {
        return res.status(400).json({
          message: "countedQuantity 0 yoki undan katta bo'lishi kerak",
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

      const batches = await prisma.stockBatch.findMany({
        where: {
          warehouseId,
          productVariantId: item.productVariantId,
          remainingQuantity: { gt: 0 },
        },
        orderBy: {
          createdAt: 'asc',
        },
      });

      const systemQuantity = batches.reduce(
        (sum, batch) => sum + Number(batch.remainingQuantity || 0),
        0
      );

      normalizedItems.push({
        productVariantId: item.productVariantId,
        countedQuantity,
        systemQuantity,
        batches,
      });
    }

    const inventoryCount = await prisma.$transaction(async (tx) => {
      const createdCount = await tx.inventoryCount.create({
        data: {
          storeId: req.storeId,
          warehouseId,
          createdById: req.user.id,
          note: note ? String(note).trim() : null,
        },
      });

      for (const item of normalizedItems) {
        await tx.inventoryCountItem.create({
          data: {
            inventoryCountId: createdCount.id,
            productVariantId: item.productVariantId,
            systemQuantity: item.systemQuantity,
            countedQuantity: item.countedQuantity,
          },
        });

        if (applyChanges) {
          let diff = item.countedQuantity - item.systemQuantity;

          if (diff < 0) {
            let remainingToRemove = Math.abs(diff);

            for (const batch of item.batches) {
              if (remainingToRemove <= 0) break;

              const batchQty = Number(batch.remainingQuantity || 0);
              const takeQty = Math.min(batchQty, remainingToRemove);

              if (takeQty > 0) {
                await tx.stockBatch.update({
                  where: { id: batch.id },
                  data: {
                    remainingQuantity: {
                      decrement: takeQty,
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
                    type: StockMovementType.INVENTORY_ADJUSTMENT,
                    quantity: -takeQty,
                    note: note
                      ? `Sanoq farqi: ${note}`
                      : 'Sanoq bo‘yicha kamaytirildi',
                  },
                });

                remainingToRemove -= takeQty;
              }
            }
          }

          if (diff > 0) {
            const latestBatch = item.batches[item.batches.length - 1];

            if (latestBatch) {
              await tx.stockBatch.update({
                where: { id: latestBatch.id },
                data: {
                  remainingQuantity: {
                    increment: diff,
                  },
                  quantity: {
                    increment: diff,
                  },
                },
              });

              await tx.stockMovement.create({
                data: {
                  storeId: req.storeId,
                  warehouseId,
                  productVariantId: item.productVariantId,
                  batchId: latestBatch.id,
                  createdById: req.user.id,
                  type: StockMovementType.INVENTORY_ADJUSTMENT,
                  quantity: diff,
                  note: note
                    ? `Sanoq farqi: ${note}`
                    : 'Sanoq bo‘yicha ko‘paytirildi',
                },
              });
            } else {
              throw new Error(
                "Qoldiqni oshirish uchun hech bo'lmasa bitta batch bo'lishi kerak"
              );
            }
          }
        }
      }

      return tx.inventoryCount.findUnique({
        where: { id: createdCount.id },
        include: {
          warehouse: true,
          createdBy: {
            select: {
              id: true,
              fullName: true,
              username: true,
            },
          },
          items: {
            include: {
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
              id: 'asc',
            },
          },
        },
      });
    });

    return res.status(201).json({
      message: applyChanges
        ? 'Sanoq saqlandi va ombor qoldig‘i yangilandi'
        : 'Sanoq faqat tarix uchun saqlandi',
      inventoryCount,
    });
  } catch (error) {
    console.error('createInventoryCount error:', error);
    return res.status(400).json({
      message: error.message || 'Server xatosi',
    });
  }
};

export const getInventoryCounts = async (req, res) => {
  try {
    const page = roundPage(req.query.page, 1);
    const pageSize = Math.min(roundPage(req.query.pageSize, 10), 100);
    const skip = (page - 1) * pageSize;

    const warehouseId = String(req.query.warehouseId || '').trim();
    const q = String(req.query.q || '').trim();

    const where = {
      storeId: req.storeId,
      ...(warehouseId ? { warehouseId } : {}),
      ...(q
        ? {
            OR: [
              { note: { contains: q, mode: 'insensitive' } },
              {
                warehouse: {
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
      prisma.inventoryCount.count({ where }),
      prisma.inventoryCount.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          warehouse: true,
          createdBy: {
            select: {
              id: true,
              fullName: true,
              username: true,
            },
          },
          items: {
            include: {
              productVariant: {
                include: {
                  size: true,
                  product: true,
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
    console.error('getInventoryCounts error:', error);
    return res.status(500).json({
      message: 'Server xatosi',
    });
  }
};

export const getInventoryCountById = async (req, res) => {
  try {
    const { inventoryCountId } = req.params;

    const inventoryCount = await prisma.inventoryCount.findFirst({
      where: {
        id: inventoryCountId,
        storeId: req.storeId,
      },
      include: {
        warehouse: true,
        createdBy: {
          select: {
            id: true,
            fullName: true,
            username: true,
          },
        },
        items: {
          include: {
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
            id: 'asc',
          },
        },
      },
    });

    if (!inventoryCount) {
      return res.status(404).json({
        message: 'Sanoq topilmadi',
      });
    }

    return res.json(inventoryCount);
  } catch (error) {
    console.error('getInventoryCountById error:', error);
    return res.status(500).json({
      message: 'Server xatosi',
    });
  }
};