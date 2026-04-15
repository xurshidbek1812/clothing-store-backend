import pkg from '@prisma/client';
import { prisma } from '../lib/prisma.js';

const { StockMovementType } = pkg;

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

    let totalAmount = 0;

    for (const item of items) {
      if (
        !item.productVariantId ||
        item.quantity == null ||
        item.costPrice == null ||
        item.sellPrice == null
      ) {
        return res.status(400).json({
          message:
            "Har bir item uchun productVariantId, quantity, costPrice, sellPrice majburiy",
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
            storeId: req.storeId,
            warehouseId,
            productVariantId: item.productVariantId,
            batchId: batch.id,
            createdById: req.user.id,
            type: StockMovementType.SUPPLIER_IN,
            quantity,
            note: note || "Taminotchidan kirim",
          },
        });

        createdBatches.push(batch);
      }

      const ledgerEntry = await tx.supplierLedgerEntry.create({
        data: {
          storeId: req.storeId,
          supplierId,
          totalAmount,
          paidAmount: parsedInitialPaidAmount,
          note: ledgerNote
            ? String(ledgerNote).trim()
            : note
            ? String(note).trim()
            : "Taminotchidan tovar kirimi",
        },
      });

      return {
        batches: createdBatches,
        ledgerEntry,
      };
    });

    return res.status(201).json({
      message: "Tovar kirimi bajarildi",
      totalAmount,
      paidAmount: parsedInitialPaidAmount,
      debtAmount: totalAmount - parsedInitialPaidAmount,
      batches: result.batches,
      ledgerEntry: result.ledgerEntry,
    });
  } catch (error) {
    console.error('stockInFromSupplier error:', error);
    return res.status(500).json({
      message: "Server xatosi",
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
      const key = batch.productVariantId;

      if (!grouped[key]) {
        grouped[key] = {
          productVariantId: key,
          productId: batch.productVariant.product.id,
          productName: batch.productVariant.product.name,
          brand: batch.productVariant.product.brand,
          size: batch.productVariant.size.name,
          barcode: batch.productVariant.barcode,
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
        sellPrice: batch.sellPrice,
        createdAt: batch.createdAt,
      });
    }

    return res.json(Object.values(grouped));
  } catch (error) {
    console.error('getStockBalances error:', error);
    return res.status(500).json({
      message: "Server xatosi",
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
      message: "Server xatosi",
    });
  }
};