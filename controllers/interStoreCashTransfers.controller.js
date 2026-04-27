import pkg from '@prisma/client';
import { prisma } from '../lib/prisma.js';

const { InterStoreCashTransferStatus, CashTransactionType } = pkg;

function roundPage(value, fallback = 1) {
  const num = Number(value);
  if (Number.isNaN(num) || num < 1) return fallback;
  return Math.floor(num);
}

function includeTransfer() {
  return {
    currency: true,
    fromStore: true,
    toStore: true,
    fromCashbox: {
      include: { currency: true },
    },
    toCashbox: {
      include: { currency: true },
    },
    createdBy: {
      select: { id: true, fullName: true, username: true },
    },
    sentBy: {
      select: { id: true, fullName: true, username: true },
    },
    receivedBy: {
      select: { id: true, fullName: true, username: true },
    },
  };
}

export const getInterStoreCashTransferOptions = async (req, res) => {
  try {
    const fromCashboxes = await prisma.cashbox.findMany({
      where: {
        storeId: req.storeId,
        isActive: true,
      },
      include: {
        currency: true,
      },
      orderBy: [{ currency: { code: 'asc' } }, { name: 'asc' }],
    });

    const userStores = await prisma.userStore.findMany({
      where: {
        userId: req.user.id,
      },
      select: {
        storeId: true,
      },
    });

    const accessibleStoreIds = userStores
      .map((item) => item.storeId)
      .filter((id) => id !== req.storeId);

    const targetCashboxes = await prisma.cashbox.findMany({
      where: {
        storeId: { in: accessibleStoreIds },
        isActive: true,
      },
      include: {
        store: true,
        currency: true,
      },
      orderBy: [
        { store: { name: 'asc' } },
        { currency: { code: 'asc' } },
        { name: 'asc' },
      ],
    });

    return res.json({
      fromCashboxes,
      targetCashboxes,
    });
  } catch (error) {
    console.error('getInterStoreCashTransferOptions error:', error);
    return res.status(500).json({
      message: 'Server xatosi',
    });
  }
};

export const getOutgoingInterStoreCashTransfers = async (req, res) => {
  try {
    const page = roundPage(req.query.page, 1);
    const pageSize = Math.min(roundPage(req.query.pageSize, 10), 100);
    const skip = (page - 1) * pageSize;

    const q = String(req.query.q || '').trim();
    const status = String(req.query.status || '').trim();

    const where = {
      fromStoreId: req.storeId,
      ...(status ? { status } : {}),
      ...(q
        ? {
            OR: [
              { note: { contains: q, mode: 'insensitive' } },
              { toStore: { name: { contains: q, mode: 'insensitive' } } },
              { fromCashbox: { name: { contains: q, mode: 'insensitive' } } },
              { toCashbox: { name: { contains: q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [totalItems, items] = await Promise.all([
      prisma.interStoreCashTransfer.count({ where }),
      prisma.interStoreCashTransfer.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: includeTransfer(),
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
    console.error('getOutgoingInterStoreCashTransfers error:', error);
    return res.status(500).json({
      message: 'Server xatosi',
    });
  }
};

export const getIncomingInterStoreCashTransfers = async (req, res) => {
  try {
    const page = roundPage(req.query.page, 1);
    const pageSize = Math.min(roundPage(req.query.pageSize, 10), 100);
    const skip = (page - 1) * pageSize;

    const q = String(req.query.q || '').trim();
    const status = String(req.query.status || '').trim();

    const where = {
      toStoreId: req.storeId,
      ...(status ? { status } : {}),
      ...(q
        ? {
            OR: [
              { note: { contains: q, mode: 'insensitive' } },
              { fromStore: { name: { contains: q, mode: 'insensitive' } } },
              { fromCashbox: { name: { contains: q, mode: 'insensitive' } } },
              { toCashbox: { name: { contains: q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [totalItems, items] = await Promise.all([
      prisma.interStoreCashTransfer.count({ where }),
      prisma.interStoreCashTransfer.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: includeTransfer(),
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
    console.error('getIncomingInterStoreCashTransfers error:', error);
    return res.status(500).json({
      message: 'Server xatosi',
    });
  }
};

export const createInterStoreCashTransfer = async (req, res) => {
  try {
    const { fromCashboxId, toCashboxId, amount, note } = req.body;

    if (!fromCashboxId || !toCashboxId || amount == null) {
      return res.status(400).json({
        message: 'fromCashboxId, toCashboxId va amount majburiy',
      });
    }

    if (fromCashboxId === toCashboxId) {
      return res.status(400).json({
        message: 'Bir xil kassani tanlab bo‘lmaydi',
      });
    }

    const parsedAmount = Number(amount);

    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({
        message: "amount musbat son bo'lishi kerak",
      });
    }

    const [fromCashbox, toCashbox] = await Promise.all([
      prisma.cashbox.findFirst({
        where: {
          id: fromCashboxId,
          storeId: req.storeId,
          isActive: true,
        },
        include: { currency: true, store: true },
      }),
      prisma.cashbox.findFirst({
        where: {
          id: toCashboxId,
          isActive: true,
        },
        include: { currency: true, store: true },
      }),
    ]);

    if (!fromCashbox || !toCashbox) {
      return res.status(404).json({
        message: 'Kassalardan biri topilmadi',
      });
    }

    if (toCashbox.storeId === req.storeId) {
      return res.status(400).json({
        message: "Bu page faqat boshqa do'kon kassasiga chiqim uchun",
      });
    }

    if (fromCashbox.currencyId !== toCashbox.currencyId) {
      return res.status(400).json({
        message: "Faqat bir xil valyutali kassalar orasida o'tkazma qilish mumkin",
      });
    }

    const hasAccessToTargetStore = await prisma.userStore.findFirst({
      where: {
        userId: req.user.id,
        storeId: toCashbox.storeId,
      },
    });

    if (!hasAccessToTargetStore) {
      return res.status(403).json({
        message: "Sizda qabul qiluvchi do'konga ruxsat yo'q",
      });
    }

    const transfer = await prisma.interStoreCashTransfer.create({
      data: {
        fromStoreId: req.storeId,
        toStoreId: toCashbox.storeId,
        fromCashboxId,
        toCashboxId,
        currencyId: fromCashbox.currencyId,
        amount: parsedAmount,
        note: note ? String(note).trim() : null,
        createdById: req.user.id,
        status: InterStoreCashTransferStatus.PENDING,
      },
      include: includeTransfer(),
    });

    return res.status(201).json({
      message: "Do'konlararo kassa o'tkazmasi yaratildi",
      transfer,
    });
  } catch (error) {
    console.error('createInterStoreCashTransfer error:', error);
    return res.status(500).json({
      message: 'Server xatosi',
    });
  }
};

export const updateInterStoreCashTransfer = async (req, res) => {
  try {
    const { transferId } = req.params;
    const { fromCashboxId, toCashboxId, amount, note } = req.body;

    const existing = await prisma.interStoreCashTransfer.findFirst({
      where: {
        id: transferId,
        fromStoreId: req.storeId,
      },
    });

    if (!existing) {
      return res.status(404).json({
        message: "O'tkazma topilmadi",
      });
    }

    if (existing.status !== InterStoreCashTransferStatus.PENDING) {
      return res.status(400).json({
        message: 'Faqat jarayondagi o‘tkazmani tahrirlash mumkin',
      });
    }

    if (!fromCashboxId || !toCashboxId || amount == null) {
      return res.status(400).json({
        message: 'fromCashboxId, toCashboxId va amount majburiy',
      });
    }

    if (fromCashboxId === toCashboxId) {
      return res.status(400).json({
        message: 'Bir xil kassani tanlab bo‘lmaydi',
      });
    }

    const parsedAmount = Number(amount);

    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({
        message: "amount musbat son bo'lishi kerak",
      });
    }

    const [fromCashbox, toCashbox] = await Promise.all([
      prisma.cashbox.findFirst({
        where: {
          id: fromCashboxId,
          storeId: req.storeId,
          isActive: true,
        },
      }),
      prisma.cashbox.findFirst({
        where: {
          id: toCashboxId,
          isActive: true,
        },
      }),
    ]);

    if (!fromCashbox || !toCashbox) {
      return res.status(404).json({
        message: 'Kassalardan biri topilmadi',
      });
    }

    if (toCashbox.storeId === req.storeId) {
      return res.status(400).json({
        message: "Bu page faqat boshqa do'kon kassasiga chiqim uchun",
      });
    }

    if (fromCashbox.currencyId !== toCashbox.currencyId) {
      return res.status(400).json({
        message: "Faqat bir xil valyutali kassalar orasida o'tkazma qilish mumkin",
      });
    }

    const transfer = await prisma.interStoreCashTransfer.update({
      where: { id: transferId },
      data: {
        toStoreId: toCashbox.storeId,
        fromCashboxId,
        toCashboxId,
        currencyId: fromCashbox.currencyId,
        amount: parsedAmount,
        note: note ? String(note).trim() : null,
      },
      include: includeTransfer(),
    });

    return res.json({
      message: "O'tkazma yangilandi",
      transfer,
    });
  } catch (error) {
    console.error('updateInterStoreCashTransfer error:', error);
    return res.status(500).json({
      message: 'Server xatosi',
    });
  }
};

export const sendInterStoreCashTransfer = async (req, res) => {
  try {
    const { transferId } = req.params;

    const transfer = await prisma.interStoreCashTransfer.findFirst({
      where: {
        id: transferId,
        fromStoreId: req.storeId,
      },
      include: includeTransfer(),
    });

    if (!transfer) {
      return res.status(404).json({
        message: "O'tkazma topilmadi",
      });
    }

    if (transfer.status !== InterStoreCashTransferStatus.PENDING) {
      return res.status(400).json({
        message: 'Faqat PENDING o‘tkazmani yuborish mumkin',
      });
    }

    if (Number(transfer.fromCashbox.balance || 0) < Number(transfer.amount || 0)) {
      return res.status(400).json({
        message: "Jo'natuvchi kassada mablag' yetarli emas",
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.cashbox.update({
        where: { id: transfer.fromCashboxId },
        data: {
          balance: {
            decrement: transfer.amount,
          },
        },
      });

      await tx.cashTransaction.create({
        data: {
          storeId: transfer.fromStoreId,
          cashboxId: transfer.fromCashboxId,
          currencyId: transfer.currencyId,
          createdById: req.user.id,
          type: CashTransactionType.TRANSFER_OUT,
          amount: transfer.amount,
          note: transfer.note,
          fromCashboxId: transfer.fromCashboxId,
          toCashboxId: transfer.toCashboxId,
        },
      });

      await tx.interStoreCashTransfer.update({
        where: { id: transfer.id },
        data: {
          status: InterStoreCashTransferStatus.IN_TRANSIT,
          sentById: req.user.id,
          sentAt: new Date(),
        },
      });

      return tx.interStoreCashTransfer.findUnique({
        where: { id: transfer.id },
        include: includeTransfer(),
      });
    });

    return res.json({
      message: "O'tkazma yuborildi",
      transfer: updated,
    });
  } catch (error) {
    console.error('sendInterStoreCashTransfer error:', error);
    return res.status(500).json({
      message: 'Server xatosi',
    });
  }
};

export const receiveInterStoreCashTransfer = async (req, res) => {
  try {
    const { transferId } = req.params;

    const transfer = await prisma.interStoreCashTransfer.findFirst({
      where: {
        id: transferId,
        toStoreId: req.storeId,
      },
      include: includeTransfer(),
    });

    if (!transfer) {
      return res.status(404).json({
        message: "O'tkazma topilmadi",
      });
    }

    if (transfer.status !== InterStoreCashTransferStatus.IN_TRANSIT) {
      return res.status(400).json({
        message: 'Faqat IN_TRANSIT o‘tkazmani qabul qilish mumkin',
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.cashbox.update({
        where: { id: transfer.toCashboxId },
        data: {
          balance: {
            increment: transfer.amount,
          },
        },
      });

      await tx.cashTransaction.create({
        data: {
          storeId: transfer.toStoreId,
          cashboxId: transfer.toCashboxId,
          currencyId: transfer.currencyId,
          createdById: req.user.id,
          type: CashTransactionType.TRANSFER_IN,
          amount: transfer.amount,
          note: transfer.note,
          fromCashboxId: transfer.fromCashboxId,
          toCashboxId: transfer.toCashboxId,
        },
      });

      await tx.interStoreCashTransfer.update({
        where: { id: transfer.id },
        data: {
          status: InterStoreCashTransferStatus.RECEIVED,
          receivedById: req.user.id,
          receivedAt: new Date(),
        },
      });

      return tx.interStoreCashTransfer.findUnique({
        where: { id: transfer.id },
        include: includeTransfer(),
      });
    });

    return res.json({
      message: "O'tkazma qabul qilindi",
      transfer: updated,
    });
  } catch (error) {
    console.error('receiveInterStoreCashTransfer error:', error);
    return res.status(500).json({
      message: 'Server xatosi',
    });
  }
};

export const rejectIncomingInterStoreCashTransfer = async (req, res) => {
  try {
    const { transferId } = req.params;

    const transfer = await prisma.interStoreCashTransfer.findFirst({
      where: {
        id: transferId,
        toStoreId: req.storeId,
      },
      include: includeTransfer(),
    });

    if (!transfer) {
      return res.status(404).json({
        message: "O'tkazma topilmadi",
      });
    }

    if (transfer.status !== InterStoreCashTransferStatus.IN_TRANSIT) {
      return res.status(400).json({
        message: 'Faqat IN_TRANSIT o‘tkazmani rad qilish mumkin',
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.cashbox.update({
        where: { id: transfer.fromCashboxId },
        data: {
          balance: {
            increment: transfer.amount,
          },
        },
      });

      await tx.interStoreCashTransfer.update({
        where: { id: transfer.id },
        data: {
          status: InterStoreCashTransferStatus.REJECTED,
          receivedById: req.user.id,
          receivedAt: new Date(),
        },
      });

      return tx.interStoreCashTransfer.findUnique({
        where: { id: transfer.id },
        include: includeTransfer(),
      });
    });

    return res.json({
      message: "O'tkazma rad etildi",
      transfer: updated,
    });
  } catch (error) {
    console.error('rejectIncomingInterStoreCashTransfer error:', error);
    return res.status(500).json({
      message: 'Server xatosi',
    });
  }
};