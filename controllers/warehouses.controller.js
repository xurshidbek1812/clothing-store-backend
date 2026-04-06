import { prisma } from '../lib/prisma.js';

export const createWarehouse = async (req, res) => {
  try {
    const storeId = req.storeId;
    const { name } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({
        message: "name majburiy",
      });
    }

    const existing = await prisma.warehouse.findFirst({
      where: {
        storeId,
        name: String(name).trim(),
      },
    });

    if (existing) {
      return res.status(400).json({
        message: "Bu nomdagi ombor shu do'konda allaqachon mavjud",
      });
    }

    const warehouse = await prisma.warehouse.create({
      data: {
        storeId,
        name: String(name).trim(),
      },
    });

    return res.status(201).json({
      message: "Ombor muvaffaqiyatli yaratildi",
      warehouse,
    });
  } catch (error) {
    console.error("createWarehouse error:", error);
    return res.status(500).json({
      message: "Serverda xatolik yuz berdi",
    });
  }
};

export const getWarehouses = async (req, res) => {
  try {
    const storeId = req.storeId;

    const warehouses = await prisma.warehouse.findMany({
      where: {
        storeId,
        isActive: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return res.json(warehouses);
  } catch (error) {
    console.error("getWarehouses error:", error);
    return res.status(500).json({
      message: "Serverda xatolik yuz berdi",
    });
  }
};