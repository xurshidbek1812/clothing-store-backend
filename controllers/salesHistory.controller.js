import { prisma } from '../lib/prisma.js';

function roundPage(value, fallback = 1) {
  const num = Number(value);
  if (Number.isNaN(num) || num < 1) return fallback;
  return Math.floor(num);
}

export const getSalesHistory = async (req, res) => {
  try {
    const page = roundPage(req.query.page, 1);
    const pageSize = Math.min(roundPage(req.query.pageSize, 10), 100);
    const skip = (page - 1) * pageSize;

    const q = String(req.query.q || '').trim();
    const type = String(req.query.type || '').trim();
    const dateFrom = String(req.query.dateFrom || '').trim();
    const dateTo = String(req.query.dateTo || '').trim();

    const where = {
      storeId: req.storeId,
      ...(type ? { type } : {}),
    };

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) {
        where.createdAt.gte = new Date(`${dateFrom}T00:00:00`);
      }
      if (dateTo) {
        where.createdAt.lte = new Date(`${dateTo}T23:59:59.999`);
      }
    }

    if (q) {
      where.OR = [
        { note: { contains: q, mode: 'insensitive' } },
        { seller: { fullName: { contains: q, mode: 'insensitive' } } },
        { seller: { username: { contains: q, mode: 'insensitive' } } },
        {
          items: {
            some: {
              productVariant: {
                product: {
                  name: { contains: q, mode: 'insensitive' },
                },
              },
            },
          },
        },
      ];
    }

    const [totalItems, items] = await Promise.all([
      prisma.sale.count({ where }),
      prisma.sale.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: {
          seller: {
            select: {
              id: true,
              fullName: true,
              username: true,
            },
          },
          cashbox: {
            include: {
              currency: true,
            },
          },
          _count: {
            select: {
              items: true,
            },
          },
        },
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
    console.error('getSalesHistory error:', error);
    return res.status(500).json({
      message: 'Server xatosi',
    });
  }
};

export const getSaleById = async (req, res) => {
  try {
    const { saleId } = req.params;

    const sale = await prisma.sale.findFirst({
      where: {
        id: saleId,
        storeId: req.storeId,
      },
      include: {
        seller: {
          select: {
            id: true,
            fullName: true,
            username: true,
          },
        },
        cashbox: {
          include: {
            currency: true,
          },
        },
        items: {
          include: {
            productVariant: {
              include: {
                size: true,
                product: true,
              },
            },
            batch: {
              include: {
                warehouse: true,
              },
            },
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
        CashTransaction: {
          orderBy: {
            createdAt: 'asc',
          },
          include: {
            cashbox: {
              include: {
                currency: true,
              },
            },
          },
        },
      },
    });

    if (!sale) {
      return res.status(404).json({
        message: 'Savdo topilmadi',
      });
    }

    return res.json(sale);
  } catch (error) {
    console.error('getSaleById error:', error);
    return res.status(500).json({
      message: 'Server xatosi',
    });
  }
};