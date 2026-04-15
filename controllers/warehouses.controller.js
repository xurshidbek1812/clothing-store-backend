import { prisma } from '../lib/prisma.js';

export const createWarehouse = async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({
        message: "name majburiy",
      });
    }

    const warehouse = await prisma.warehouse.create({
      data: {
        storeId: req.storeId,
        name: String(name).trim(),
      },
    });

    return res.status(201).json({
      message: "Ombor yaratildi",
      warehouse,
    });
  } catch (error) {
    console.error('createWarehouse error:', error);
    return res.status(500).json({
      message: "Server xatosi",
    });
  }
};

export const getWarehouses = async (req, res) => {
  try {
    const warehouses = await prisma.warehouse.findMany({
      where: {
        storeId: req.storeId,
        isActive: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return res.json(warehouses);
  } catch (error) {
    console.error('getWarehouses error:', error);
    return res.status(500).json({
      message: "Server xatosi",
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
        message: "Ombor topilmadi",
      });
    }

    const warehouse = await prisma.warehouse.update({
      where: { id: warehouseId },
      data: {
        ...(name !== undefined ? { name: String(name).trim() } : {}),
        ...(isActive !== undefined ? { isActive: Boolean(isActive) } : {}),
      },
    });

    return res.json({
      message: "Ombor yangilandi",
      warehouse,
    });
  } catch (error) {
    console.error('updateWarehouse error:', error);
    return res.status(500).json({
      message: "Server xatosi",
    });
  }
};