import { prisma } from '../lib/prisma.js';

export const getWarehouses = async (req, res) => {
  try {
    const search = String(req.query.search || '').trim();

    const warehouses = await prisma.warehouse.findMany({
      where: {
        storeId: req.storeId,
        ...(search
          ? {
              name: {
                contains: search,
                mode: 'insensitive',
              },
            }
          : {}),
      },
      include: {
        _count: {
          select: {
            stockBatches: true,
            supplierIns: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return res.json(warehouses);
  } catch (error) {
    console.error('getWarehouses error:', error);
    return res.status(500).json({
      message: 'Server xatosi',
    });
  }
};

export const createWarehouse = async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({
        message: 'Ombor nomi majburiy',
      });
    }

    const normalizedName = String(name).trim();

    const existing = await prisma.warehouse.findFirst({
      where: {
        storeId: req.storeId,
        name: normalizedName,
      },
    });

    if (existing) {
      return res.status(400).json({
        message: 'Bu nomdagi ombor allaqachon mavjud',
      });
    }

    const warehouse = await prisma.warehouse.create({
      data: {
        storeId: req.storeId,
        name: normalizedName,
      },
    });

    return res.status(201).json({
      message: 'Ombor yaratildi',
      warehouse,
    });
  } catch (error) {
    console.error('createWarehouse error:', error);
    return res.status(500).json({
      message: 'Server xatosi',
    });
  }
};

export const updateWarehouse = async (req, res) => {
  try {
    const { warehouseId } = req.params;
    const { name, isActive } = req.body;

    const existing = await prisma.warehouse.findFirst({
      where: {
        id: warehouseId,
        storeId: req.storeId,
      },
    });

    if (!existing) {
      return res.status(404).json({
        message: 'Ombor topilmadi',
      });
    }

    if (!name || !String(name).trim()) {
      return res.status(400).json({
        message: 'Ombor nomi majburiy',
      });
    }

    const normalizedName = String(name).trim();

    const duplicate = await prisma.warehouse.findFirst({
      where: {
        storeId: req.storeId,
        name: normalizedName,
        NOT: {
          id: warehouseId,
        },
      },
    });

    if (duplicate) {
      return res.status(400).json({
        message: 'Bu nomdagi ombor allaqachon mavjud',
      });
    }

    const warehouse = await prisma.warehouse.update({
      where: {
        id: warehouseId,
      },
      data: {
        name: normalizedName,
        isActive: Boolean(isActive),
      },
    });

    return res.json({
      message: 'Ombor yangilandi',
      warehouse,
    });
  } catch (error) {
    console.error('updateWarehouse error:', error);
    return res.status(500).json({
      message: 'Server xatosi',
    });
  }
};