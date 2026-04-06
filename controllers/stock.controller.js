import pkg from '@prisma/client';

const { StockMovementType} = pkg;

import { prisma } from '../lib/prisma.js';

export const stockInFromSupplier = async (req, res) => {
  try {
    const storeId = req.storeId;
    const {
      warehouseId,
      supplierId,
      items,
      note,
    } = req.body;

    if (!warehouseId || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        message: "warehouseId va items majburiy",
      });
    }

    const warehouse = await prisma.warehouse.findFirst({
      where: {
        id: warehouseId,
        storeId,
      },
    });

    if (!warehouse) {
      return res.status(404).json({
        message: "Ombor topilmadi",
      });
    }

    if (supplierId) {
      const supplier = await prisma.supplier.findFirst({
        where: {
          id: supplierId,
          storeId,
        },
      });

      if (!supplier) {
        return res.status(404).json({
          message: "Taminotchi topilmadi",
        });
      }
    }

    for (const item of items) {
      if (!item.productVariantId || !item.quantity || item.costPrice == null || item.sellPrice == null) {
        return res.status(400).json({
          message: "Har bir item uchun productVariantId, quantity, costPrice, sellPrice majburiy",
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
          message: "quantity musbat, costPrice va sellPrice esa to'g'ri son bo'lishi kerak",
        });
      }

      const variant = await prisma.productVariant.findFirst({
        where: {
          id: item.productVariantId,
          product: {
            storeId,
          },
        },
        include: {
          product: true,
          size: true,
        },
      });

      if (!variant) {
        return res.status(404).json({
          message: `Variant topilmadi: ${item.productVariantId}`,
        });
      }
    }

    const createdBatches = await prisma.$transaction(async (tx) => {
      const batchResults = [];

      for (const item of items) {
        const quantity = Number(item.quantity);
        const costPrice = Number(item.costPrice);
        const sellPrice = Number(item.sellPrice);

        const batch = await tx.stockBatch.create({
          data: {
            warehouseId,
            productVariantId: item.productVariantId,
            supplierId: supplierId || null,
            quantity,
            remainingQuantity: quantity,
            costPrice,
            sellPrice,
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

        await tx.stockMovement.create({
          data: {
            storeId,
            warehouseId,
            productVariantId: item.productVariantId,
            batchId: batch.id,
            createdById: req.user.id,
            type: StockMovementType.SUPPLIER_IN,
            quantity,
            note: note || "Taminotchidan tovar kirimi",
          },
        });

        batchResults.push(batch);
      }

      return batchResults;
    });

    return res.status(201).json({
      message: "Tovar kirimi muvaffaqiyatli bajarildi",
      batches: createdBatches,
    });
  } catch (error) {
    console.error("stockInFromSupplier error:", error);
    return res.status(500).json({
      message: "Serverda xatolik yuz berdi",
    });
  }
};

export const getStockBalances = async (req, res) => {
  try {
    const storeId = req.storeId;
    const warehouseId = req.query.warehouseId ? String(req.query.warehouseId) : null;
    const search = req.query.search ? String(req.query.search).trim() : '';

    const where = {
      remainingQuantity: {
        gt: 0,
      },
      warehouse: {
        storeId,
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
    };

    const batches = await prisma.stockBatch.findMany({
      where,
      include: {
        warehouse: true,
        supplier: true,
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
      orderBy: {
        createdAt: 'desc',
      },
    });

    const grouped = {};

    for (const batch of batches) {
      const variantId = batch.productVariantId;

      if (!grouped[variantId]) {
        grouped[variantId] = {
          productVariantId: variantId,
          productId: batch.productVariant.product.id,
          productName: batch.productVariant.product.name,
          brand: batch.productVariant.product.brand,
          size: batch.productVariant.size.name,
          barcode: batch.productVariant.barcode,
          totalQuantity: 0,
          batches: [],
        };
      }

      grouped[variantId].totalQuantity += batch.remainingQuantity;
      grouped[variantId].batches.push({
        id: batch.id,
        warehouseId: batch.warehouseId,
        warehouseName: batch.warehouse.name,
        supplierName: batch.supplier?.name || null,
        remainingQuantity: batch.remainingQuantity,
        costPrice: batch.costPrice,
        sellPrice: batch.sellPrice,
        createdAt: batch.createdAt,
      });
    }

    return res.json(Object.values(grouped));
  } catch (error) {
    console.error("getStockBalances error:", error);
    return res.status(500).json({
      message: "Serverda xatolik yuz berdi",
    });
  }
};

export const getStockMovements = async (req, res) => {
  try {
    const storeId = req.storeId;
    const warehouseId = req.query.warehouseId ? String(req.query.warehouseId) : null;

    const movements = await prisma.stockMovement.findMany({
      where: {
        storeId,
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
    console.error("getStockMovements error:", error);
    return res.status(500).json({
      message: "Serverda xatolik yuz berdi",
    });
  }
};

export const getAvailableBatches = async (req, res) => {
  try {
    const storeId = req.storeId;
    const productVariantId = req.query.productVariantId
      ? String(req.query.productVariantId)
      : null;

    if (!productVariantId) {
      return res.status(400).json({
        message: "productVariantId majburiy",
      });
    }

    const variant = await prisma.productVariant.findFirst({
      where: {
        id: productVariantId,
        product: {
          storeId,
          isActive: true,
        },
      },
      include: {
        product: true,
        size: true,
      },
    });

    if (!variant) {
      return res.status(404).json({
        message: "Variant topilmadi",
      });
    }

    const batches = await prisma.stockBatch.findMany({
      where: {
        productVariantId,
        remainingQuantity: {
          gt: 0,
        },
        warehouse: {
          storeId,
          isActive: true,
        },
      },
      include: {
        warehouse: true,
        supplier: true,
      },
      orderBy: [
        {
          createdAt: 'desc',
        },
      ],
    });

    const result = batches.map((batch) => ({
      batchId: batch.id,
      warehouseId: batch.warehouseId,
      warehouseName: batch.warehouse.name,
      supplierId: batch.supplierId,
      supplierName: batch.supplier?.name || null,
      remainingQuantity: batch.remainingQuantity,
      costPrice: batch.costPrice,
      sellPrice: batch.sellPrice,
      createdAt: batch.createdAt,
    }));

    return res.json({
      productVariant: {
        id: variant.id,
        barcode: variant.barcode,
        size: variant.size.name,
        product: {
          id: variant.product.id,
          name: variant.product.name,
          brand: variant.product.brand,
        },
      },
      batches: result,
    });
  } catch (error) {
    console.error("getAvailableBatches error:", error);
    return res.status(500).json({
      message: "Serverda xatolik yuz berdi",
    });
  }
};