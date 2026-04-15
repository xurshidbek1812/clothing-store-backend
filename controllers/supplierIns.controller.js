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
        Number.isNaN(quantity) ||
        Number.isNaN(costPrice) ||
        Number.isNaN(sellPrice) ||
        quantity <= 0 ||
        costPrice < 0 ||
        sellPrice < 0
      ) {
        return res.status(400).json({
          message: "Har bir item uchun productVariantId, quantity, costPrice, sellPrice to'g'ri bo'lishi kerak",
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

      normalizedItems.push({
        productVariantId: item.productVariantId,
        quantity,
        costPrice,
        sellPrice,
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
        items: true,
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

    const totalAmount = supplierIn.items.reduce(
      (sum, item) => sum + Number(item.quantity || 0) * Number(item.costPrice || 0),
      0
    );

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
              sellPrice: item.sellPrice,
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

        const ledgerEntry = await tx.supplierLedgerEntry.create({
          data: {
            storeId: req.storeId,
            supplierId: supplierIn.supplierId,
            totalAmount,
            paidAmount: 0,
            note: supplierIn.note || "Taminotchidan tovar kirimi",
          },
          select: {
            id: true,
          },
        });

        await tx.supplierIn.update({
          where: { id: supplierInId },
          data: {
            status: SupplierInStatus.APPROVED,
            approvedById: req.user.id,
            approvedAt: new Date(),
          },
        });

        return {
          ledgerEntryId: ledgerEntry.id,
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

    const ledgerEntry = await prisma.supplierLedgerEntry.findUnique({
      where: {
        id: txResult.ledgerEntryId,
      },
    });

    return res.json({
      message: "Kirim hujjati tasdiqlandi",
      supplierIn: approvedSupplierIn,
      ledgerEntry,
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