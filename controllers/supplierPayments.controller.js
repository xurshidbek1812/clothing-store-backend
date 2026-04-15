import pkg from '@prisma/client';
import { prisma } from '../lib/prisma.js';

const { CashTransactionType, SupplierPaymentSource } = pkg;

export const getSupplierBalances = async (req, res) => {
  try {
    const suppliers = await prisma.supplier.findMany({
      where: {
        storeId: req.storeId,
        isActive: true,
      },
      include: {
        ledgerEntries: true,
        payments: {
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const result = suppliers.map((supplier) => {
      const totalDebt = supplier.ledgerEntries.reduce(
        (sum, entry) => sum + entry.totalAmount,
        0
      );

      const totalPaid = supplier.payments.reduce(
        (sum, payment) => sum + payment.amount,
        0
      );

      return {
        id: supplier.id,
        name: supplier.name,
        phone: supplier.phone,
        address: supplier.address,
        totalDebt,
        totalPaid,
        remainingDebt: totalDebt - totalPaid,
      };
    });

    return res.json(result);
  } catch (error) {
    console.error('getSupplierBalances error:', error);
    return res.status(500).json({
      message: "Server xatosi",
    });
  }
};

export const getSupplierLedger = async (req, res) => {
  try {
    const { supplierId } = req.params;

    const supplier = await prisma.supplier.findFirst({
      where: {
        id: supplierId,
        storeId: req.storeId,
      },
    });

    if (!supplier) {
      return res.status(404).json({
        message: "Taminotchi topilmadi",
      });
    }

    const [ledgerEntries, payments] = await Promise.all([
      prisma.supplierLedgerEntry.findMany({
        where: {
          storeId: req.storeId,
          supplierId,
        },
        include: {
          payments: {
            orderBy: {
              createdAt: 'desc',
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      }),
      prisma.supplierPayment.findMany({
        where: {
          storeId: req.storeId,
          supplierId,
        },
        include: {
          cashbox: {
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
          ledgerEntry: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      }),
    ]);

    const totalDebt = ledgerEntries.reduce((sum, item) => sum + item.totalAmount, 0);
    const totalPaid = payments.reduce((sum, item) => sum + item.amount, 0);

    return res.json({
      supplier,
      summary: {
        totalDebt,
        totalPaid,
        remainingDebt: totalDebt - totalPaid,
      },
      ledgerEntries,
      payments,
    });
  } catch (error) {
    console.error('getSupplierLedger error:', error);
    return res.status(500).json({
      message: "Server xatosi",
    });
  }
};

export const createSupplierPayment = async (req, res) => {
  try {
    const {
      supplierId,
      ledgerEntryId,
      source,
      cashboxId,
      amount,
      note,
    } = req.body;

    if (!supplierId || !source || amount == null) {
      return res.status(400).json({
        message: "supplierId, source va amount majburiy",
      });
    }

    if (!['CASHBOX', 'OTHER'].includes(source)) {
      return res.status(400).json({
        message: "source faqat CASHBOX yoki OTHER bo'lishi mumkin",
      });
    }

    const parsedAmount = Number(amount);

    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({
        message: "amount musbat son bo'lishi kerak",
      });
    }

    const supplier = await prisma.supplier.findFirst({
      where: {
        id: supplierId,
        storeId: req.storeId,
        isActive: true,
      },
      include: {
        ledgerEntries: true,
        payments: true,
      },
    });

    if (!supplier) {
      return res.status(404).json({
        message: "Taminotchi topilmadi",
      });
    }

    let ledgerEntry = null;

    if (ledgerEntryId) {
      ledgerEntry = await prisma.supplierLedgerEntry.findFirst({
        where: {
          id: ledgerEntryId,
          storeId: req.storeId,
          supplierId,
        },
      });

      if (!ledgerEntry) {
        return res.status(404).json({
          message: "Qarz yozuvi topilmadi",
        });
      }

      const paidForThisLedger = await prisma.supplierPayment.aggregate({
        where: {
          storeId: req.storeId,
          supplierId,
          ledgerEntryId,
        },
        _sum: {
          amount: true,
        },
      });

      const alreadyPaid = paidForThisLedger._sum.amount || 0;
      const remainingForThisLedger = ledgerEntry.totalAmount - alreadyPaid;

      if (parsedAmount > remainingForThisLedger) {
        return res.status(400).json({
          message: "To'lov qarz yozuvidagi qolgan summadan oshib ketdi",
        });
      }
    } else {
      const totalDebt = supplier.ledgerEntries.reduce(
        (sum, entry) => sum + entry.totalAmount,
        0
      );

      const totalPaid = supplier.payments.reduce(
        (sum, payment) => sum + payment.amount,
        0
      );

      const remainingDebt = totalDebt - totalPaid;

      if (parsedAmount > remainingDebt) {
        return res.status(400).json({
          message: "To'lov umumiy qarzdan oshib ketdi",
        });
      }
    }

    let cashbox = null;

    if (source === 'CASHBOX') {
      if (!cashboxId) {
        return res.status(400).json({
          message: "CASHBOX source uchun cashboxId majburiy",
        });
      }

      cashbox = await prisma.cashbox.findFirst({
        where: {
          id: cashboxId,
          storeId: req.storeId,
          isActive: true,
        },
        include: {
          currency: true,
        },
      });

      if (!cashbox) {
        return res.status(404).json({
          message: "Kassa topilmadi",
        });
      }

      if (cashbox.balance < parsedAmount) {
        return res.status(400).json({
          message: "Kassada mablag' yetarli emas",
        });
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const payment = await tx.supplierPayment.create({
        data: {
          storeId: req.storeId,
          supplierId,
          ledgerEntryId: ledgerEntryId || null,
          cashboxId: source === 'CASHBOX' ? cashboxId : null,
          createdById: req.user.id,
          source:
            source === 'CASHBOX'
              ? SupplierPaymentSource.CASHBOX
              : SupplierPaymentSource.OTHER,
          amount: parsedAmount,
          note: note ? String(note).trim() : null,
        },
        include: {
          cashbox: {
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
          ledgerEntry: true,
        },
      });

      if (ledgerEntryId) {
        const paidForThisLedger = await tx.supplierPayment.aggregate({
          where: {
            storeId: req.storeId,
            supplierId,
            ledgerEntryId,
          },
          _sum: {
            amount: true,
          },
        });

        await tx.supplierLedgerEntry.update({
          where: { id: ledgerEntryId },
          data: {
            paidAmount: paidForThisLedger._sum.amount || 0,
          },
        });
      }

      if (source === 'CASHBOX') {
        await tx.cashbox.update({
          where: { id: cashboxId },
          data: {
            balance: {
              decrement: parsedAmount,
            },
          },
        });

        await tx.cashTransaction.create({
          data: {
            storeId: req.storeId,
            cashboxId,
            currencyId: cashbox.currencyId,
            createdById: req.user.id,
            type: CashTransactionType.MANUAL_OUT,
            amount: parsedAmount,
            note:
              note?.trim() ||
              `Taminotchiga to'lov: ${supplier.name}`,
          },
        });
      }

      return payment;
    });

    return res.status(201).json({
      message: "Taminotchiga to'lov muvaffaqiyatli yozildi",
      payment: result,
    });
  } catch (error) {
    console.error('createSupplierPayment error:', error);
    return res.status(500).json({
      message: "Server xatosi",
    });
  }
};