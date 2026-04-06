import { prisma } from '../lib/prisma.js';

export const createProduct = async (req, res) => {
  try {
    const storeId = req.storeId;
    const {
      name,
      brand,
      categoryId,
      gender,
      season,
      variants = [],
    } = req.body;

    if (!name) {
      return res.status(400).json({
        message: "name majburiy",
      });
    }

    if (categoryId) {
      const category = await prisma.category.findFirst({
        where: {
          id: categoryId,
          storeId,
        },
      });

      if (!category) {
        return res.status(404).json({
          message: "Kategoriya topilmadi",
        });
      }
    }

    const normalizedVariants = Array.isArray(variants)
      ? variants.map((item) => ({
          sizeId: item.sizeId,
          barcode: item.barcode ? String(item.barcode).trim() : null,
        }))
      : [];

    for (const item of normalizedVariants) {
      if (!item.sizeId) {
        return res.status(400).json({
          message: "Variant uchun sizeId majburiy",
        });
      }

      const size = await prisma.size.findUnique({
        where: { id: item.sizeId },
      });

      if (!size) {
        return res.status(404).json({
          message: `Size topilmadi: ${item.sizeId}`,
        });
      }

      if (item.barcode) {
        const existingBarcode = await prisma.productVariant.findUnique({
          where: { barcode: item.barcode },
        });

        if (existingBarcode) {
          return res.status(400).json({
            message: `Bu barcode allaqachon mavjud: ${item.barcode}`,
          });
        }
      }
    }

    const product = await prisma.product.create({
      data: {
        storeId,
        name: name.trim(),
        brand: brand || null,
        categoryId: categoryId || null,
        gender: gender || null,
        season: season || null,
        variants: normalizedVariants.length
          ? {
              create: normalizedVariants,
            }
          : undefined,
      },
      include: {
        category: true,
        variants: {
          include: {
            size: true,
          },
        },
      },
    });

    return res.status(201).json({
      message: "Tovar muvaffaqiyatli yaratildi",
      product,
    });
  } catch (error) {
    console.error("createProduct error:", error);
    return res.status(500).json({
      message: "Serverda xatolik yuz berdi",
    });
  }
};

export const getProducts = async (req, res) => {
  try {
    const storeId = req.storeId;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const search = req.query.search ? String(req.query.search).trim() : '';
    const categoryId = req.query.categoryId ? String(req.query.categoryId) : null;

    const skip = (page - 1) * limit;

    const where = {
      storeId,
      isActive: true,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { brand: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(categoryId ? { categoryId } : {}),
    };

    const [products, totalItems] = await Promise.all([
      prisma.product.findMany({
        where,
        include: {
          category: true,
          variants: {
            include: {
              size: true,
              stockBatches: {
                select: {
                  id: true,
                  quantity: true,
                  remainingQuantity: true,
                  sellPrice: true,
                  warehouseId: true,
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limit,
      }),
      prisma.product.count({ where }),
    ]);

    const mapped = products.map((product) => ({
      ...product,
      totalStock: product.variants.reduce((sum, variant) => {
        const variantStock = variant.stockBatches.reduce(
          (batchSum, batch) => batchSum + batch.remainingQuantity,
          0
        );
        return sum + variantStock;
      }, 0),
    }));

    return res.json({
      products: mapped,
      totalPages: Math.ceil(totalItems / limit),
      currentPage: page,
      totalItems,
    });
  } catch (error) {
    console.error("getProducts error:", error);
    return res.status(500).json({
      message: "Serverda xatolik yuz berdi",
    });
  }
};

export const getProductById = async (req, res) => {
  try {
    const storeId = req.storeId;
    const { productId } = req.params;

    const product = await prisma.product.findFirst({
      where: {
        id: productId,
        storeId,
      },
      include: {
        category: true,
        variants: {
          include: {
            size: true,
            stockBatches: {
              include: {
                supplier: true,
                warehouse: true,
              },
              orderBy: {
                createdAt: 'desc',
              },
            },
          },
        },
      },
    });

    if (!product) {
      return res.status(404).json({
        message: "Tovar topilmadi",
      });
    }

    return res.json(product);
  } catch (error) {
    console.error("getProductById error:", error);
    return res.status(500).json({
      message: "Serverda xatolik yuz berdi",
    });
  }
};

export const addVariantToProduct = async (req, res) => {
  try {
    const storeId = req.storeId;
    const { productId } = req.params;
    const { sizeId, barcode } = req.body;

    if (!sizeId) {
      return res.status(400).json({
        message: "sizeId majburiy",
      });
    }

    const product = await prisma.product.findFirst({
      where: {
        id: productId,
        storeId,
      },
    });

    if (!product) {
      return res.status(404).json({
        message: "Tovar topilmadi",
      });
    }

    const size = await prisma.size.findUnique({
      where: { id: sizeId },
    });

    if (!size) {
      return res.status(404).json({
        message: "Size topilmadi",
      });
    }

    if (barcode) {
      const existingBarcode = await prisma.productVariant.findUnique({
        where: { barcode },
      });

      if (existingBarcode) {
        return res.status(400).json({
          message: "Bu barcode allaqachon mavjud",
        });
      }
    }

    const existingVariant = await prisma.productVariant.findFirst({
      where: {
        productId,
        sizeId,
      },
    });

    if (existingVariant) {
      return res.status(400).json({
        message: "Bu razmer allaqachon qo'shilgan",
      });
    }

    const variant = await prisma.productVariant.create({
      data: {
        productId,
        sizeId,
        barcode: barcode || null,
      },
      include: {
        size: true,
      },
    });

    return res.status(201).json({
      message: "Variant muvaffaqiyatli qo'shildi",
      variant,
    });
  } catch (error) {
    console.error("addVariantToProduct error:", error);
    return res.status(500).json({
      message: "Serverda xatolik yuz berdi",
    });
  }
};