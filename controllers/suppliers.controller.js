import { prisma } from '../lib/prisma.js';

export const createSupplier = async (req, res) => {
  try {
    const { name, phone, address } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({
        message: "name majburiy",
      });
    }

    const supplier = await prisma.supplier.create({
      data: {
        storeId: req.storeId,
        name: String(name).trim(),
        phone: phone ? String(phone).trim() : null,
        address: address ? String(address).trim() : null,
      },
    });

    return res.status(201).json({
      message: "Taminotchi yaratildi",
      supplier,
    });
  } catch (error) {
    console.error('createSupplier error:', error);
    return res.status(500).json({
      message: "Server xatosi",
    });
  }
};

export const getSuppliers = async (req, res) => {
  try {
    const suppliers = await prisma.supplier.findMany({
      where: {
        storeId: req.storeId,
        isActive: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return res.json(suppliers);
  } catch (error) {
    console.error('getSuppliers error:', error);
    return res.status(500).json({
      message: "Server xatosi",
    });
  }
};

export const updateSupplier = async (req, res) => {
  try {
    const { supplierId } = req.params;
    const { name, phone, address, isActive } = req.body;

    const existing = await prisma.supplier.findFirst({
      where: {
        id: supplierId,
        storeId: req.storeId,
      },
    });

    if (!existing) {
      return res.status(404).json({
        message: "Taminotchi topilmadi",
      });
    }

    const supplier = await prisma.supplier.update({
      where: { id: supplierId },
      data: {
        ...(name !== undefined ? { name: String(name).trim() } : {}),
        ...(phone !== undefined ? { phone: phone ? String(phone).trim() : null } : {}),
        ...(address !== undefined ? { address: address ? String(address).trim() : null } : {}),
        ...(isActive !== undefined ? { isActive: Boolean(isActive) } : {}),
      },
    });

    return res.json({
      message: "Taminotchi yangilandi",
      supplier,
    });
  } catch (error) {
    console.error('updateSupplier error:', error);
    return res.status(500).json({
      message: "Server xatosi",
    });
  }
};