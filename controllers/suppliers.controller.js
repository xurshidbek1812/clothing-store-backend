import { prisma } from '../lib/prisma.js';

export const createSupplier = async (req, res) => {
  try {
    const storeId = req.storeId;
    const { name, phone, address } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({
        message: "name majburiy",
      });
    }

    const supplier = await prisma.supplier.create({
      data: {
        storeId,
        name: String(name).trim(),
        phone: phone || null,
        address: address || null,
      },
    });

    return res.status(201).json({
      message: "Taminotchi muvaffaqiyatli yaratildi",
      supplier,
    });
  } catch (error) {
    console.error("createSupplier error:", error);
    return res.status(500).json({
      message: "Serverda xatolik yuz berdi",
    });
  }
};

export const getSuppliers = async (req, res) => {
  try {
    const storeId = req.storeId;

    const suppliers = await prisma.supplier.findMany({
      where: {
        storeId,
        isActive: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return res.json(suppliers);
  } catch (error) {
    console.error("getSuppliers error:", error);
    return res.status(500).json({
      message: "Serverda xatolik yuz berdi",
    });
  }
};