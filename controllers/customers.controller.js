import { prisma } from '../lib/prisma.js';

const money = (value) => Number(value || 0).toLocaleString('uz-UZ');

const formatMoneyWithCurrency = (value, currency) => {
  if (!currency) return money(value);
  return `${money(value)} ${currency.code}`;
};

const summarizeSalesByCurrency = (sales = []) => {
  const map = new Map();

  for (const sale of sales) {
    const firstItem = sale.items?.[0];
    const currency = firstItem?.currency || null;
    const currencyId = firstItem?.currencyId || currency?.id;

    if (!currencyId) continue;

    const prev = map.get(currencyId) || {
      currency,
      totalCredit: 0,
      totalPaid: 0,
      totalDebt: 0,
    };

    map.set(currencyId, {
      currency: currency || prev.currency,
      totalCredit: prev.totalCredit + Number(sale.totalAmount || 0),
      totalPaid: prev.totalPaid + Number(sale.paidAmount || 0),
      totalDebt: prev.totalDebt + Number(sale.creditDueAmount || 0),
    });
  }

  return Array.from(map.values());
};

const summarizePaymentsByCurrency = (payments = []) => {
  const map = new Map();

  for (const payment of payments) {
    const currency = payment.cashbox?.currency || payment.currency || null;
    const currencyId = currency?.id || payment.currencyId;

    if (!currencyId) continue;

    const prev = map.get(currencyId) || {
      currency,
      amount: 0,
    };

    map.set(currencyId, {
      currency: currency || prev.currency,
      amount: prev.amount + Number(payment.amount || 0),
    });
  }

  return Array.from(map.values());
};

export const getCustomers = async (req, res) => {
  try {
    const search = String(req.query.search || '').trim();

    const customers = await prisma.customer.findMany({
      where: {
        storeId: req.storeId,
        ...(search
          ? {
              OR: [
                { fullName: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search, mode: 'insensitive' } },
                { address: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return res.json(customers);
  } catch (error) {
    console.error('getCustomers error:', error);
    return res.status(500).json({
      message: 'Server xatosi',
    });
  }
};

export const createCustomer = async (req, res) => {
  try {
    const { fullName, phone, address, note } = req.body;

    if (!fullName || !String(fullName).trim()) {
      return res.status(400).json({
        message: 'Mijoz nomi majburiy',
      });
    }

    const customer = await prisma.customer.create({
      data: {
        storeId: req.storeId,
        fullName: String(fullName).trim(),
        phone: phone ? String(phone).trim() : null,
        address: address ? String(address).trim() : null,
        note: note ? String(note).trim() : null,
      },
    });

    return res.status(201).json({
      message: 'Mijoz yaratildi',
      customer,
    });
  } catch (error) {
    console.error('createCustomer error:', error);
    return res.status(500).json({
      message: 'Server xatosi',
    });
  }
};

export const updateCustomer = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { fullName, phone, address, note, isActive } = req.body;

    const existing = await prisma.customer.findFirst({
      where: {
        id: customerId,
        storeId: req.storeId,
      },
    });

    if (!existing) {
      return res.status(404).json({
        message: 'Mijoz topilmadi',
      });
    }

    if (!fullName || !String(fullName).trim()) {
      return res.status(400).json({
        message: 'Mijoz nomi majburiy',
      });
    }

    const customer = await prisma.customer.update({
      where: { id: customerId },
      data: {
        fullName: String(fullName).trim(),
        phone: phone ? String(phone).trim() : null,
        address: address ? String(address).trim() : null,
        note: note ? String(note).trim() : null,
        isActive: Boolean(isActive),
      },
    });

    return res.json({
      message: 'Mijoz yangilandi',
      customer,
    });
  } catch (error) {
    console.error('updateCustomer error:', error);
    return res.status(500).json({
      message: 'Server xatosi',
    });
  }
};

export const getCustomerBalances = async (req, res) => {
  try {
    const customers = await prisma.customer.findMany({
      where: {
        storeId: req.storeId,
      },
      include: {
        sales: {
          where: {
            type: 'CREDIT',
          },
          include: {
            items: {
              include: {
                currency: true,
              },
            },
          },
        },
        creditPayments: {
          include: {
            cashbox: {
              include: {
                currency: true,
              },
            },
            currency: true,
          },
        },
      },
      orderBy: {
        fullName: 'asc',
      },
    });

    const result = customers.map((customer) => {
      const salesSummary = summarizeSalesByCurrency(customer.sales || []);
      const paymentsSummary = summarizePaymentsByCurrency(customer.creditPayments || []);

      const totalCredit = customer.sales.reduce(
        (sum, sale) => sum + Number(sale.totalAmount || 0),
        0
      );

      const totalPaidOnCreditSales = customer.sales.reduce(
        (sum, sale) => sum + Number(sale.paidAmount || 0),
        0
      );

      const totalExtraPayments = customer.creditPayments.reduce(
        (sum, payment) => sum + Number(payment.amount || 0),
        0
      );

      const totalDebt = customer.sales.reduce(
        (sum, sale) => sum + Number(sale.creditDueAmount || 0),
        0
      );

      return {
        id: customer.id,
        fullName: customer.fullName,
        phone: customer.phone,
        address: customer.address,
        isActive: customer.isActive,

        totalCredit,
        totalPaid: totalPaidOnCreditSales + totalExtraPayments,
        totalDebt,

        salesSummary,
        paymentsSummary,

        totalCreditFormatted:
          salesSummary.length > 0
            ? salesSummary
                .map((row) => formatMoneyWithCurrency(row.totalCredit, row.currency))
                .join(' • ')
            : money(totalCredit),

        totalPaidFormatted:
          paymentsSummary.length > 0
            ? paymentsSummary
                .map((row) => formatMoneyWithCurrency(row.amount, row.currency))
                .join(' • ')
            : money(totalPaidOnCreditSales + totalExtraPayments),

        totalDebtFormatted:
          salesSummary.length > 0
            ? salesSummary
                .map((row) => formatMoneyWithCurrency(row.totalDebt, row.currency))
                .join(' • ')
            : money(totalDebt),
      };
    });

    return res.json(result);
  } catch (error) {
    console.error('getCustomerBalances error:', error);
    return res.status(500).json({
      message: 'Server xatosi',
    });
  }
};

export const getCustomerCreditHistory = async (req, res) => {
  try {
    const { customerId } = req.params;

    const customer = await prisma.customer.findFirst({
      where: {
        id: customerId,
        storeId: req.storeId,
      },
      include: {
        sales: {
          where: {
            type: 'CREDIT',
          },
          include: {
            items: {
              include: {
                currency: true,
                productVariant: {
                  include: {
                    size: true,
                    product: true,
                  },
                },
              },
            },
            seller: {
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
        creditPayments: {
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
            sale: {
              select: {
                id: true,
                totalAmount: true,
                paidAmount: true,
                creditDueAmount: true,
                createdAt: true,
              },
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });

    if (!customer) {
      return res.status(404).json({
        message: 'Mijoz topilmadi',
      });
    }

    const totalCredit = customer.sales.reduce(
      (sum, sale) => sum + Number(sale.totalAmount || 0),
      0
    );

    const totalInitialPaid = customer.sales.reduce(
      (sum, sale) => sum + Number(sale.paidAmount || 0),
      0
    );

    const totalLaterPayments = customer.creditPayments.reduce(
      (sum, payment) => sum + Number(payment.amount || 0),
      0
    );

    const totalDebt = customer.sales.reduce(
      (sum, sale) => sum + Number(sale.creditDueAmount || 0),
      0
    );

    return res.json({
      customer: {
        id: customer.id,
        fullName: customer.fullName,
        phone: customer.phone,
        address: customer.address,
        note: customer.note,
        isActive: customer.isActive,
      },
      summary: {
        totalCredit,
        totalPaid: totalInitialPaid + totalLaterPayments,
        totalDebt,
      },
      salesSummary: summarizeSalesByCurrency(customer.sales || []),
      paymentsSummary: summarizePaymentsByCurrency(customer.creditPayments || []),
      sales: customer.sales,
      payments: customer.creditPayments,
    });
  } catch (error) {
    console.error('getCustomerCreditHistory error:', error);
    return res.status(500).json({
      message: 'Server xatosi',
    });
  }
};

export const createCreditPayment = async (req, res) => {
  try {
    const {
      customerId,
      saleId,
      cashboxId,
      amount,
      note,
    } = req.body;

    const parsedAmount = Number(amount);

    if (!customerId) {
      return res.status(400).json({
        message: 'customerId majburiy',
      });
    }

    if (!cashboxId) {
      return res.status(400).json({
        message: 'cashboxId majburiy',
      });
    }

    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({
        message: "To'lov summasi noto'g'ri",
      });
    }

    const customer = await prisma.customer.findFirst({
      where: {
        id: customerId,
        storeId: req.storeId,
        isActive: true,
      },
    });

    if (!customer) {
      return res.status(404).json({
        message: 'Mijoz topilmadi',
      });
    }

    const cashbox = await prisma.cashbox.findFirst({
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
        message: 'Kassa topilmadi',
      });
    }

    let sale = null;

    if (saleId) {
      sale = await prisma.sale.findFirst({
        where: {
          id: saleId,
          storeId: req.storeId,
          customerId,
          type: 'CREDIT',
        },
        include: {
          items: {
            include: {
              currency: true,
            },
          },
        },
      });

      if (!sale) {
        return res.status(404).json({
          message: 'Nasiya savdo topilmadi',
        });
      }

      if (Number(sale.creditDueAmount || 0) <= 0) {
        return res.status(400).json({
          message: "Bu savdoda qarz qolmagan",
        });
      }

      if (parsedAmount > Number(sale.creditDueAmount || 0)) {
        return res.status(400).json({
          message: "To'lov summasi qarzdan katta bo'lishi mumkin emas",
        });
      }
    } else {
      const oldestDebtSale = await prisma.sale.findFirst({
        where: {
          storeId: req.storeId,
          customerId,
          type: 'CREDIT',
          creditDueAmount: {
            gt: 0,
          },
        },
        include: {
          items: {
            include: {
              currency: true,
            },
          },
        },
        orderBy: {
          createdAt: 'asc',
        },
      });

      if (!oldestDebtSale) {
        return res.status(400).json({
          message: "Mijozda qarz yo'q",
        });
      }

      sale = oldestDebtSale;

      if (parsedAmount > Number(sale.creditDueAmount || 0)) {
        return res.status(400).json({
          message:
            "saleId yuborilmaganda to'lov summasi eng eski qarzdor savdo summasidan katta bo'lishi mumkin emas",
        });
      }
    }

    const saleCurrency = sale.items?.[0]?.currency || null;
    const saleCurrencyId = sale.items?.[0]?.currencyId || saleCurrency?.id;

    if (!saleCurrencyId) {
      return res.status(400).json({
        message: 'Savdo valyutasi aniqlanmadi',
      });
    }

    if (cashbox.currencyId !== saleCurrencyId) {
      return res.status(400).json({
        message: "Tanlangan kassa qarz savdosi valutasi bilan mos emas",
      });
    }

    const result = await prisma.$transaction(
      async (tx) => {
        const payment = await tx.creditPayment.create({
          data: {
            storeId: req.storeId,
            customerId,
            saleId: sale.id,
            cashboxId: cashbox.id,
            currencyId: cashbox.currencyId,
            createdById: req.user.id,
            amount: parsedAmount,
            note: note ? String(note).trim() : null,
          },
        });

        await tx.sale.update({
          where: { id: sale.id },
          data: {
            paidAmount: {
              increment: parsedAmount,
            },
            creditDueAmount: {
              decrement: parsedAmount,
            },
          },
        });

        await tx.cashbox.update({
          where: { id: cashbox.id },
          data: {
            balance: {
              increment: parsedAmount,
            },
          },
        });

        await tx.cashTransaction.create({
          data: {
            storeId: req.storeId,
            cashboxId: cashbox.id,
            currencyId: cashbox.currencyId,
            createdById: req.user.id,
            type: 'SALE_INCOME',
            amount: parsedAmount,
            note: note ? String(note).trim() : 'Nasiya to‘lovi',
            relatedSaleId: sale.id,
          },
        });

        return payment;
      },
      {
        timeout: 15000,
        maxWait: 10000,
      }
    );

    return res.status(201).json({
      message: "Nasiya to'lovi muvaffaqiyatli qabul qilindi",
      payment: result,
    });
  } catch (error) {
    console.error('createCreditPayment error:', error);
    return res.status(500).json({
      message: 'Server xatosi',
    });
  }
};