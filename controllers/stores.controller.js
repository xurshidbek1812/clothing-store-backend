import { prisma } from '../lib/prisma.js';

export const createStore = async (req, res) => {
  try {
    const { name, address } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({
        message: "name majburiy",
      });
    }

    const store = await prisma.$transaction(async (tx) => {
      const createdStore = await tx.store.create({
        data: {
          name: String(name).trim(),
          address: address ? String(address).trim() : null,
        },
      });

      await tx.userStore.create({
        data: {
          userId: req.user.id,
          storeId: createdStore.id,
        },
      });

      return createdStore;
    });

    return res.status(201).json({
      message: "Do'kon yaratildi",
      store,
    });
  } catch (error) {
    console.error('createStore error:', error);
    return res.status(500).json({
      message: "Server xatosi",
    });
  }
};

export const getStores = async (req, res) => {
  try {
    const stores = await prisma.store.findMany({
      where: {
        isActive: true,
        userStores: {
          some: {
            userId: req.user.id,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return res.json(stores);
  } catch (error) {
    console.error('getStores error:', error);
    return res.status(500).json({
      message: "Server xatosi",
    });
  }
};

export const getStoreById = async (req, res) => {
  try {
    const { storeId } = req.params;

    const store = await prisma.store.findFirst({
      where: {
        id: storeId,
        userStores: {
          some: {
            userId: req.user.id,
          },
        },
      },
    });

    if (!store) {
      return res.status(404).json({
        message: "Do'kon topilmadi",
      });
    }

    return res.json(store);
  } catch (error) {
    console.error('getStoreById error:', error);
    return res.status(500).json({
      message: "Server xatosi",
    });
  }
};

export const updateStore = async (req, res) => {
  try {
    const { storeId } = req.params;
    const { name, address, isActive } = req.body;

    const existing = await prisma.store.findFirst({
      where: {
        id: storeId,
        userStores: {
          some: {
            userId: req.user.id,
          },
        },
      },
    });

    if (!existing) {
      return res.status(404).json({
        message: "Do'kon topilmadi",
      });
    }

    const store = await prisma.store.update({
      where: { id: storeId },
      data: {
        ...(name !== undefined ? { name: String(name).trim() } : {}),
        ...(address !== undefined ? { address: address ? String(address).trim() : null } : {}),
        ...(isActive !== undefined ? { isActive: Boolean(isActive) } : {}),
      },
    });

    return res.json({
      message: "Do'kon yangilandi",
      store,
    });
  } catch (error) {
    console.error('updateStore error:', error);
    return res.status(500).json({
      message: "Server xatosi",
    });
  }
};