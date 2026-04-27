import pkg from '@prisma/client';
import { prisma } from '../lib/prisma.js';

const { CashboxTransferStatus, CashTransactionType } = pkg;

function roundPage(value, fallback = 1) {
  const num = Number(value);
  if (Number.isNaN(num) || num < 1) return fallback;
  return Math.floor(num);
}

function transferInclude() {
  return {
    currency: true,
    fromCashbox: {
      include: {
        currency: true,
      },
    },
    toCashbox: {
      include: {
        currency: true,
      },
    },
    createdBy: {
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
    rejectedBy: {
      select: {
        id: true,
        fullName: true,
        username: true,
      },
    },
  };
}

export const getCashboxTransferOptions = async (req, res) => {
  try {
    const cashboxes = await prisma.cashbox.findMany({
      where: {
        storeId: req.storeId,
        isActive: true,
      },
      include: {
        currency: true,
      },
      orderBy: [
        { currency: { code: 'asc' } },
        { name: 'asc' },
      ],
    });

    return res.json(cashboxes);
  } catch (error) {
    console.error('getCashboxTransferOptions error:', error);
    return res.status(500).json({
      message: 'Server xatosi',
    });
  }
};

export const getCashboxTransfers = async (req, res) => {
  try {
    const page = roundPage(req.query.page, 1);
    const pageSize = Math.min(roundPage(req.query.pageSize, 10), 100);
    const skip = (page - 1) * pageSize;

    const q = String(req.query.q || '').trim();
    const status = String(req.query.status || '').trim();

    const where = {
      storeId: req.storeId,
      ...(status ? { status } : {}),
      ...(q
        ? {
            OR: [
              {
                note: { contains: q, mode: 'insensitive' },
              },
              {
                fromCashbox: {
                  name: { contains: q, mode: 'insensitive' },
                },
              },
              {
                toCashbox: {
                  name: { contains: q, mode: 'insensitive' },
                },
              },
              {
                createdBy: {
                  fullName: { contains: q, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };

    const [totalItems, items] = await Promise.all([
      prisma.cashboxTransfer.count({ where }),
      prisma.cashboxTransfer.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: transferInclude(),
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
    console.error('getCashboxTransfers error:', error);
    return res.status(500).json({
      message: 'Server xatosi',
    });
  }
};

export const createCashboxTransfer = async (req, res) => {
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
        include: { currency: true },
      }),
      prisma.cashbox.findFirst({
        where: {
          id: toCashboxId,
          storeId: req.storeId,
          isActive: true,
        },
        include: { currency: true },
      }),
    ]);

    if (!fromCashbox || !toCashbox) {
      return res.status(404).json({
        message: 'Kassalardan biri topilmadi',
      });
    }

    if (fromCashbox.currencyId !== toCashbox.currencyId) {
      return res.status(400).json({
        message: "Faqat bir xil valyutali kassalar orasida o'tkazma qilish mumkin",
      });
    }

    const transfer = await prisma.cashboxTransfer.create({
      data: {
        storeId: req.storeId,
        fromCashboxId,
        toCashboxId,
        currencyId: fromCashbox.currencyId,
        amount: parsedAmount,
        note: note ? String(note).trim() : null,
        createdById: req.user.id,
        status: CashboxTransferStatus.PENDING,
      },
      include: transferInclude(),
    });

    return res.status(201).json({
      message: "O'tkazma yaratildi",
      transfer,
    });
  } catch (error) {
    console.error('createCashboxTransfer error:', error);
    return res.status(500).json({
      message: 'Server xatosi',
    });
  }
};

export const updateCashboxTransfer = async (req, res) => {
  try {
    const { transferId } = req.params;
    const { fromCashboxId, toCashboxId, amount, note } = req.body;

    const existing = await prisma.cashboxTransfer.findFirst({
      where: {
        id: transferId,
        storeId: req.storeId,
      },
    });

    if (!existing) {
      return res.status(404).json({
        message: "O'tkazma topilmadi",
      });
    }

    if (existing.status !== CashboxTransferStatus.PENDING) {
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
          storeId: req.storeId,
          isActive: true,
        },
      }),
    ]);

    if (!fromCashbox || !toCashbox) {
      return res.status(404).json({
        message: 'Kassalardan biri topilmadi',
      });
    }

    if (fromCashbox.currencyId !== toCashbox.currencyId) {
      return res.status(400).json({
        message: "Faqat bir xil valyutali kassalar orasida o'tkazma qilish mumkin",
      });
    }

    const transfer = await prisma.cashboxTransfer.update({
      where: { id: transferId },
      data: {
        fromCashboxId,
        toCashboxId,
        currencyId: fromCashbox.currencyId,
        amount: parsedAmount,
        note: note ? String(note).trim() : null,
      },
      include: transferInclude(),
    });

    return res.json({
      message: "O'tkazma yangilandi",
      transfer,
    });
  } catch (error) {
    console.error('updateCashboxTransfer error:', error);
    return res.status(500).json({
      message: 'Server xatosi',
    });
  }
};

export const approveCashboxTransfer = async (req, res) => {
  try {
    const { transferId } = req.params;

    const transfer = await prisma.cashboxTransfer.findFirst({
      where: {
        id: transferId,
        storeId: req.storeId,
      },
      include: transferInclude(),
    });

    if (!transfer) {
      return res.status(404).json({
        message: "O'tkazma topilmadi",
      });
    }

    if (transfer.status !== CashboxTransferStatus.PENDING) {
      return res.status(400).json({
        message: 'Faqat jarayondagi o‘tkazmani tasdiqlash mumkin',
      });
    }

    if (Number(transfer.fromCashbox.balance || 0) < Number(transfer.amount || 0)) {
      return res.status(400).json({
        message: "Jo'natuvchi kassada mablag' yetarli emas",
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      await tx.cashbox.update({
        where: { id: transfer.fromCashboxId },
        data: {
          balance: {
            decrement: transfer.amount,
          },
        },
      });

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
          storeId: req.storeId,
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

      await tx.cashTransaction.create({
        data: {
          storeId: req.storeId,
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

      await tx.cashboxTransfer.update({
        where: { id: transfer.id },
        data: {
          status: CashboxTransferStatus.APPROVED,
          approvedById: req.user.id,
          approvedAt: new Date(),
        },
      });

      return tx.cashboxTransfer.findUnique({
        where: { id: transfer.id },
        include: transferInclude(),
      });
    });

    return res.json({
      message: "O'tkazma tasdiqlandi",
      transfer: result,
    });
  } catch (error) {
    console.error('approveCashboxTransfer error:', error);
    return res.status(500).json({
      message: 'Server xatosi',
    });
  }
};

export const rejectCashboxTransfer = async (req, res) => {
  try {
    const { transferId } = req.params;

    const transfer = await prisma.cashboxTransfer.findFirst({
      where: {
        id: transferId,
        storeId: req.storeId,
      },
    });

    if (!transfer) {
      return res.status(404).json({
        message: "O'tkazma topilmadi",
      });
    }

    if (transfer.status !== CashboxTransferStatus.PENDING) {
      return res.status(400).json({
        message: 'Faqat jarayondagi o‘tkazmani rad qilish mumkin',
      });
    }

    const updated = await prisma.cashboxTransfer.update({
      where: { id: transferId },
      data: {
        status: CashboxTransferStatus.REJECTED,
        rejectedById: req.user.id,
        rejectedAt: new Date(),
      },
      include: transferInclude(),
    });

    return res.json({
      message: "O'tkazma rad etildi",
      transfer: updated,
    });
  } catch (error) {
    console.error('rejectCashboxTransfer error:', error);
    return res.status(500).json({
      message: 'Server xatosi',
    });
  }
};