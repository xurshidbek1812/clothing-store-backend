import pkg from '@prisma/client';
import { prisma } from '../lib/prisma.js';

const { CashTransactionType, SupplierPaymentSource } = pkg;

function money(value) {
  return Number(value || 0).toLocaleString('uz-UZ');
}

function formatMoneyWithCurrency(value, currency) {
  if (!currency) return money(value);
  return `${money(value)} ${currency.code}`;
}

function summarizeLedgerByCurrency(entries = []) {
  const map = new Map();

  for (const entry of entries) {
    const currencyId = entry.currencyId || entry.currency?.id;
    if (!currencyId) continue;

    const prev = map.get(currencyId) || {
      currency: entry.currency || null,
      totalAmount: 0,
      paidAmount: 0,
      dueAmount: 0,
    };

    map.set(currencyId, {
      currency: entry.currency || prev.currency,
      totalAmount: prev.totalAmount + Number(entry.totalAmount || 0),
      paidAmount: prev.paidAmount + Number(entry.paidAmount || 0),
      dueAmount:
        prev.dueAmount +
        (Number(entry.totalAmount || 0) - Number(entry.paidAmount || 0)),
    });
  }

  return Array.from(map.values());
}

export const getSupplierBalances = async (req, res) => {
  try {
    const suppliers = await prisma.supplier.findMany({
      where: {
        storeId: req.storeId,
        isActive: true,
      },
      include: {
        ledgerEntries: {
          include: {
            currency: true,
          },
        },
        payments: {
          include: {
            currency: true,
            cashbox: {
              include: {
                currency: true,
              },
            },
          },
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
      const summary = summarizeLedgerByCurrency(supplier.ledgerEntries || []);

      const totalPaidFormatted =
        (supplier.payments || []).length > 0
          ? (() => {
              const paymentMap = new Map();

              for (const payment of supplier.payments) {
                const currency = payment.currency || payment.cashbox?.currency || null;
                const currencyId = payment.currencyId || currency?.id;
                if (!currencyId) continue;

                const prev = paymentMap.get(currencyId) || {
                  currency,
                  amount: 0,
                };

                paymentMap.set(currencyId, {
                  currency: currency || prev.currency,
                  amount: prev.amount + Number(payment.amount || 0),
                });
              }

              return Array.from(paymentMap.values())
                .map((row) => formatMoneyWithCurrency(row.amount, row.currency))
                .join(' • ');
            })()
          : '0';

      return {
        id: supplier.id,
        name: supplier.name,
        phone: supplier.phone,
        address: supplier.address,
        summary,
        totalDebtFormatted:
          summary.length > 0
            ? summary
                .map((row) => formatMoneyWithCurrency(row.totalAmount, row.currency))
                .join(' • ')
            : '0',
        totalPaidFormatted,
        remainingDebtFormatted:
          summary.length > 0
            ? summary
                .map((row) => formatMoneyWithCurrency(row.dueAmount, row.currency))
                .join(' • ')
            : '0',
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

export const getSupplierLedgerHistory = async (req, res) => {
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
          currency: true,
          payments: {
            include: {
              currency: true,
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
            },
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
          currency: true,
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
          ledgerEntry: {
            include: {
              currency: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      }),
    ]);

    const summary = summarizeLedgerByCurrency(ledgerEntries || []);

    return res.json({
      supplier,
      summary,
      ledgerEntries: ledgerEntries.map((entry) => ({
        ...entry,
        dueAmount: Number(entry.totalAmount || 0) - Number(entry.paidAmount || 0),
      })),
      payments,
    });
  } catch (error) {
    console.error('getSupplierLedgerHistory error:', error);
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
        include: {
          currency: true,
        },
      });

      if (!ledgerEntry) {
        return res.status(404).json({
          message: "Qarz yozuvi topilmadi",
        });
      }

      const remainingForThisLedger =
        Number(ledgerEntry.totalAmount || 0) - Number(ledgerEntry.paidAmount || 0);

      if (parsedAmount > remainingForThisLedger) {
        return res.status(400).json({
          message: "To'lov qarz yozuvidagi qolgan summadan oshib ketdi",
        });
      }
    } else {
      return res.status(400).json({
        message: "Hozircha to'lov uchun aniq ledgerEntry tanlanishi kerak",
      });
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

      if (cashbox.currencyId !== ledgerEntry.currencyId) {
        return res.status(400).json({
          message: "Tanlangan kassa valutasi ta'minotchi qarzi valutasi bilan mos emas",
        });
      }

      if (cashbox.balance < parsedAmount) {
        return res.status(400).json({
          message: "Kassada mablag' yetarli emas",
        });
      }
    }

    const result = await prisma.$transaction(
      async (tx) => {
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
            currencyId: ledgerEntry.currencyId,
            amount: parsedAmount,
            note: note ? String(note).trim() : null,
          },
          include: {
            currency: true,
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
            ledgerEntry: {
              include: {
                currency: true,
              },
            },
          },
        });

        await tx.supplierLedgerEntry.update({
          where: { id: ledgerEntryId },
          data: {
            paidAmount: {
              increment: parsedAmount,
            },
          },
        });

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
      },
      {
        timeout: 15000,
        maxWait: 10000,
      }
    );

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