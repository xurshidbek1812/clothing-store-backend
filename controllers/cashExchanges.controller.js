import pkg from '@prisma/client';
import { prisma } from '../lib/prisma.js';

const { CashExchangeStatus, CashTransactionType, CashExchangeRateMode } = pkg;

function roundPage(value, fallback = 1) {
  const num = Number(value);
  if (Number.isNaN(num) || num < 1) return fallback;
  return Math.floor(num);
}

function includeExchange() {
  return {
    fromCashbox: {
      include: { currency: true },
    },
    toCashbox: {
      include: { currency: true },
    },
    fromCurrency: true,
    toCurrency: true,
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

function calculateToAmount(fromAmount, exchangeRate, rateMode) {
  const amount = Number(fromAmount);
  const rate = Number(exchangeRate);

  if (
    Number.isNaN(amount) ||
    Number.isNaN(rate) ||
    amount <= 0 ||
    rate <= 0
  ) {
    return NaN;
  }

  if (rateMode === CashExchangeRateMode.DIVIDE) {
    return Number((amount / rate).toFixed(2));
  }

  return Number((amount * rate).toFixed(2));
}

export const getCashExchangeOptions = async (req, res) => {
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
    console.error('getCashExchangeOptions error:', error);
    return res.status(500).json({
      message: 'Server xatosi',
    });
  }
};

export const getCashExchanges = async (req, res) => {
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
              { note: { contains: q, mode: 'insensitive' } },
              { fromCashbox: { name: { contains: q, mode: 'insensitive' } } },
              { toCashbox: { name: { contains: q, mode: 'insensitive' } } },
              { createdBy: { fullName: { contains: q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [totalItems, items] = await Promise.all([
      prisma.cashExchange.count({ where }),
      prisma.cashExchange.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: includeExchange(),
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
    console.error('getCashExchanges error:', error);
    return res.status(500).json({
      message: 'Server xatosi',
    });
  }
};

export const createCashExchange = async (req, res) => {
  try {
    const {
      fromCashboxId,
      toCashboxId,
      fromAmount,
      exchangeRate,
      rateMode,
      note,
    } = req.body;

    if (
      !fromCashboxId ||
      !toCashboxId ||
      fromAmount == null ||
      exchangeRate == null
    ) {
      return res.status(400).json({
        message: 'fromCashboxId, toCashboxId, fromAmount, exchangeRate majburiy',
      });
    }

    if (fromCashboxId === toCashboxId) {
      return res.status(400).json({
        message: 'Bir xil kassani tanlab bo‘lmaydi',
      });
    }

    const parsedFromAmount = Number(fromAmount);
    const parsedRate = Number(exchangeRate);
    const parsedRateMode =
      rateMode === CashExchangeRateMode.DIVIDE
        ? CashExchangeRateMode.DIVIDE
        : CashExchangeRateMode.MULTIPLY;

    const parsedToAmount = calculateToAmount(
      parsedFromAmount,
      parsedRate,
      parsedRateMode
    );

    if (
      Number.isNaN(parsedFromAmount) ||
      Number.isNaN(parsedRate) ||
      Number.isNaN(parsedToAmount) ||
      parsedFromAmount <= 0 ||
      parsedRate <= 0 ||
      parsedToAmount <= 0
    ) {
      return res.status(400).json({
        message: "Summa va kurs to'g'ri bo'lishi kerak",
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

    if (fromCashbox.currencyId === toCashbox.currencyId) {
      return res.status(400).json({
        message: 'Valyutasi bir xil kassalar uchun ayirboshlash kerak emas',
      });
    }

    const exchange = await prisma.cashExchange.create({
      data: {
        storeId: req.storeId,
        fromCashboxId,
        toCashboxId,
        fromCurrencyId: fromCashbox.currencyId,
        toCurrencyId: toCashbox.currencyId,
        fromAmount: parsedFromAmount,
        exchangeRate: parsedRate,
        toAmount: parsedToAmount,
        rateMode: parsedRateMode,
        note: note ? String(note).trim() : null,
        createdById: req.user.id,
        status: CashExchangeStatus.PENDING,
      },
      include: includeExchange(),
    });

    return res.status(201).json({
      message: 'Ayirboshlash yaratildi',
      exchange,
    });
  } catch (error) {
    console.error('createCashExchange error:', error);
    return res.status(500).json({
      message: 'Server xatosi',
    });
  }
};

export const updateCashExchange = async (req, res) => {
  try {
    const { exchangeId } = req.params;
    const {
      fromCashboxId,
      toCashboxId,
      fromAmount,
      exchangeRate,
      rateMode,
      note,
    } = req.body;

    const existing = await prisma.cashExchange.findFirst({
      where: {
        id: exchangeId,
        storeId: req.storeId,
      },
    });

    if (!existing) {
      return res.status(404).json({
        message: 'Ayirboshlash topilmadi',
      });
    }

    if (existing.status !== CashExchangeStatus.PENDING) {
      return res.status(400).json({
        message: 'Faqat jarayondagi ayirboshlashni tahrirlash mumkin',
      });
    }

    const parsedFromAmount = Number(fromAmount);
    const parsedRate = Number(exchangeRate);
    const parsedRateMode =
      rateMode === CashExchangeRateMode.DIVIDE
        ? CashExchangeRateMode.DIVIDE
        : CashExchangeRateMode.MULTIPLY;

    const parsedToAmount = calculateToAmount(
      parsedFromAmount,
      parsedRate,
      parsedRateMode
    );

    if (
      !fromCashboxId ||
      !toCashboxId ||
      Number.isNaN(parsedFromAmount) ||
      Number.isNaN(parsedRate) ||
      Number.isNaN(parsedToAmount) ||
      parsedFromAmount <= 0 ||
      parsedRate <= 0 ||
      parsedToAmount <= 0
    ) {
      return res.status(400).json({
        message: "Ma'lumotlar noto'g'ri",
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

    if (fromCashbox.currencyId === toCashbox.currencyId) {
      return res.status(400).json({
        message: 'Valyutasi bir xil kassalar uchun ayirboshlash kerak emas',
      });
    }

    const exchange = await prisma.cashExchange.update({
      where: { id: exchangeId },
      data: {
        fromCashboxId,
        toCashboxId,
        fromCurrencyId: fromCashbox.currencyId,
        toCurrencyId: toCashbox.currencyId,
        fromAmount: parsedFromAmount,
        exchangeRate: parsedRate,
        toAmount: parsedToAmount,
        rateMode: parsedRateMode,
        note: note ? String(note).trim() : null,
      },
      include: includeExchange(),
    });

    return res.json({
      message: 'Ayirboshlash yangilandi',
      exchange,
    });
  } catch (error) {
    console.error('updateCashExchange error:', error);
    return res.status(500).json({
      message: 'Server xatosi',
    });
  }
};

export const approveCashExchange = async (req, res) => {
  try {
    const { exchangeId } = req.params;

    const exchange = await prisma.cashExchange.findFirst({
      where: {
        id: exchangeId,
        storeId: req.storeId,
      },
      include: includeExchange(),
    });

    if (!exchange) {
      return res.status(404).json({
        message: 'Ayirboshlash topilmadi',
      });
    }

    if (exchange.status !== CashExchangeStatus.PENDING) {
      return res.status(400).json({
        message: 'Faqat jarayondagi ayirboshlashni tasdiqlash mumkin',
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      const freshFromCashbox = await tx.cashbox.findFirst({
        where: {
          id: exchange.fromCashboxId,
          storeId: req.storeId,
          isActive: true,
        },
      });

      if (!freshFromCashbox) {
        throw new Error("Jo'natuvchi kassa topilmadi");
      }

      const currentBalance = Number(freshFromCashbox.balance || 0);
      const requiredAmount = Number(exchange.fromAmount || 0);

      if (currentBalance < requiredAmount) {
        throw new Error(
          `Jo'natuvchi kassada mablag' yetarli emas. Mavjud: ${currentBalance}, kerak: ${requiredAmount}`
        );
      }

      await tx.cashbox.update({
        where: { id: exchange.fromCashboxId },
        data: {
          balance: {
            decrement: exchange.fromAmount,
          },
        },
      });

      await tx.cashbox.update({
        where: { id: exchange.toCashboxId },
        data: {
          balance: {
            increment: exchange.toAmount,
          },
        },
      });

      await tx.cashTransaction.create({
        data: {
          storeId: req.storeId,
          cashboxId: exchange.fromCashboxId,
          currencyId: exchange.fromCurrencyId,
          createdById: req.user.id,
          type: CashTransactionType.EXCHANGE_OUT,
          amount: Number(exchange.fromAmount),
          note: exchange.note,
        },
      });

      await tx.cashTransaction.create({
        data: {
          storeId: req.storeId,
          cashboxId: exchange.toCashboxId,
          currencyId: exchange.toCurrencyId,
          createdById: req.user.id,
          type: CashTransactionType.EXCHANGE_IN,
          amount: Number(exchange.toAmount),
          note: exchange.note,
        },
      });

      await tx.cashExchange.update({
        where: { id: exchange.id },
        data: {
          status: CashExchangeStatus.APPROVED,
          approvedById: req.user.id,
          approvedAt: new Date(),
        },
      });

      return tx.cashExchange.findUnique({
        where: { id: exchange.id },
        include: includeExchange(),
      });
    });

    return res.json({
      message: 'Ayirboshlash tasdiqlandi',
      exchange: result,
    });
  } catch (error) {
    console.error('approveCashExchange error:', error);
    return res.status(500).json({
      message: error.message || 'Server xatosi',
    });
  }
};

export const rejectCashExchange = async (req, res) => {
  try {
    const { exchangeId } = req.params;

    const exchange = await prisma.cashExchange.findFirst({
      where: {
        id: exchangeId,
        storeId: req.storeId,
      },
    });

    if (!exchange) {
      return res.status(404).json({
        message: 'Ayirboshlash topilmadi',
      });
    }

    if (exchange.status !== CashExchangeStatus.PENDING) {
      return res.status(400).json({
        message: 'Faqat jarayondagi ayirboshlashni rad qilish mumkin',
      });
    }

    const updated = await prisma.cashExchange.update({
      where: { id: exchangeId },
      data: {
        status: CashExchangeStatus.REJECTED,
        rejectedById: req.user.id,
        rejectedAt: new Date(),
      },
      include: includeExchange(),
    });

    return res.json({
      message: 'Ayirboshlash rad etildi',
      exchange: updated,
    });
  } catch (error) {
    console.error('rejectCashExchange error:', error);
    return res.status(500).json({
      message: 'Server xatosi',
    });
  }
};