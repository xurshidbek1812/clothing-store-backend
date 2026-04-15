import fs from 'fs';
import path from 'path';
import { prisma } from '../lib/prisma.js';

const generateNextBarcode = async (tx) => {
  const lastVariant = await tx.productVariant.findFirst({
    where: {
      barcode: {
        not: null,
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
    select: {
      barcode: true,
    },
  });

  const base = 2000000000000;

  if (!lastVariant?.barcode) {
    return String(base);
  }

  const parsed = Number(lastVariant.barcode);

  if (Number.isNaN(parsed)) {
    return String(base);
  }

  return String(parsed + 1);
};

export const createProduct = async (req, res) => {
  try {
    const {
      name,
      brand,
      categoryId,
      gender,
      season,
      variants = [],
    } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({
        message: "name majburiy",
      });
    }

    if (categoryId) {
      const category = await prisma.category.findFirst({
        where: {
          id: categoryId,
          storeId: req.storeId,
        },
      });

      if (!category) {
        return res.status(404).json({
          message: "Kategoriya topilmadi",
        });
      }
    }

    if (!Array.isArray(variants)) {
      return res.status(400).json({
        message: "variants array bo'lishi kerak",
      });
    }

    for (const item of variants) {
      if (!item.sizeId) {
        return res.status(400).json({
          message: "Har bir variant uchun sizeId majburiy",
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
    }

    const product = await prisma.$transaction(async (tx) => {
      const createdProduct = await tx.product.create({
        data: {
          storeId: req.storeId,
          name: String(name).trim(),
          brand: brand ? String(brand).trim() : null,
          categoryId: categoryId || null,
          gender: gender ? String(gender).trim() : null,
          season: season ? String(season).trim() : null,
        },
      });

      if (variants.length) {
        for (const item of variants) {
          const barcode = await generateNextBarcode(tx);

          await tx.productVariant.create({
            data: {
              productId: createdProduct.id,
              sizeId: item.sizeId,
              barcode,
            },
          });
        }
      }

      return tx.product.findUnique({
        where: { id: createdProduct.id },
        include: {
          category: true,
          variants: {
            include: {
              size: true,
            },
          },
        },
      });
    });

    return res.status(201).json({
      message: "Tovar yaratildi",
      product,
    });
  } catch (error) {
    console.error('createProduct error:', error);
    return res.status(500).json({
      message: "Server xatosi",
    });
  }
};

export const getProducts = async (req, res) => {
  try {
    const search = req.query.search ? String(req.query.search).trim() : '';
    const categoryId = req.query.categoryId ? String(req.query.categoryId) : null;

    const where = {
      storeId: req.storeId,
      isActive: true,
      ...(categoryId ? { categoryId } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { brand: { contains: search, mode: 'insensitive' } },
              {
                variants: {
                  some: {
                    barcode: { contains: search, mode: 'insensitive' },
                  },
                },
              },
            ],
          }
        : {}),
    };

    const products = await prisma.product.findMany({
      where,
      include: {
        category: true,
        variants: {
          include: {
            size: true,
            stockBatches: {
              select: {
                id: true,
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
    });

    const mapped = products.map((product) => ({
      ...product,
      totalStock: product.variants.reduce((sum, variant) => {
        return (
          sum +
          variant.stockBatches.reduce(
            (batchSum, batch) => batchSum + batch.remainingQuantity,
            0
          )
        );
      }, 0),
    }));

    return res.json(mapped);
  } catch (error) {
    console.error('getProducts error:', error);
    return res.status(500).json({
      message: "Server xatosi",
    });
  }
};

export const getProductById = async (req, res) => {
  try {
    const { productId } = req.params;

    const product = await prisma.product.findFirst({
      where: {
        id: productId,
        storeId: req.storeId,
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
    console.error('getProductById error:', error);
    return res.status(500).json({
      message: "Server xatosi",
    });
  }
};

export const updateProduct = async (req, res) => {
  try {
    const { productId } = req.params;
    const { name, brand, categoryId, gender, season, isActive } = req.body;

    const existing = await prisma.product.findFirst({
      where: {
        id: productId,
        storeId: req.storeId,
      },
    });

    if (!existing) {
      return res.status(404).json({
        message: "Tovar topilmadi",
      });
    }

    if (categoryId) {
      const category = await prisma.category.findFirst({
        where: {
          id: categoryId,
          storeId: req.storeId,
        },
      });

      if (!category) {
        return res.status(404).json({
          message: "Kategoriya topilmadi",
        });
      }
    }

    const product = await prisma.product.update({
      where: { id: productId },
      data: {
        ...(name !== undefined ? { name: String(name).trim() } : {}),
        ...(brand !== undefined ? { brand: brand ? String(brand).trim() : null } : {}),
        ...(categoryId !== undefined ? { categoryId: categoryId || null } : {}),
        ...(gender !== undefined ? { gender: gender ? String(gender).trim() : null } : {}),
        ...(season !== undefined ? { season: season ? String(season).trim() : null } : {}),
        ...(isActive !== undefined ? { isActive: Boolean(isActive) } : {}),
      },
      include: {
        category: true,
      },
    });

    return res.json({
      message: "Tovar yangilandi",
      product,
    });
  } catch (error) {
    console.error('updateProduct error:', error);
    return res.status(500).json({
      message: "Server xatosi",
    });
  }
};

export const addVariantToProduct = async (req, res) => {
  try {
    const { productId } = req.params;
    const { sizeId } = req.body;

    if (!sizeId) {
      return res.status(400).json({
        message: "sizeId majburiy",
      });
    }

    const product = await prisma.product.findFirst({
      where: {
        id: productId,
        storeId: req.storeId,
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

    const variant = await prisma.$transaction(async (tx) => {
      const barcode = await generateNextBarcode(tx);

      return tx.productVariant.create({
        data: {
          productId,
          sizeId,
          barcode,
        },
        include: {
          size: true,
        },
      });
    });

    return res.status(201).json({
      message: "Variant qo'shildi",
      variant,
    });
  } catch (error) {
    console.error('addVariantToProduct error:', error);
    return res.status(500).json({
      message: "Server xatosi",
    });
  }
};

export const getAvailableBatches = async (req, res) => {
  try {
    const productVariantId = req.query.productVariantId
      ? String(req.query.productVariantId)
      : null;

    if (!productVariantId) {
      return res.status(400).json({
        message: "productVariantId majburiy",
      });
    }

    const variant = await prisma.productVariant.findFirst({
      where: {
        id: productVariantId,
        product: {
          storeId: req.storeId,
          isActive: true,
        },
      },
      include: {
        product: true,
        size: true,
      },
    });

    if (!variant) {
      return res.status(404).json({
        message: "Variant topilmadi",
      });
    }

    const batches = await prisma.stockBatch.findMany({
      where: {
        productVariantId,
        remainingQuantity: {
          gt: 0,
        },
        warehouse: {
          storeId: req.storeId,
          isActive: true,
        },
      },
      include: {
        warehouse: true,
        supplier: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return res.json({
      productVariant: {
        id: variant.id,
        barcode: variant.barcode,
        size: variant.size.name,
        product: {
          id: variant.product.id,
          name: variant.product.name,
          brand: variant.product.brand,
        },
      },
      batches: batches.map((batch) => ({
        batchId: batch.id,
        warehouseId: batch.warehouseId,
        warehouseName: batch.warehouse.name,
        supplierId: batch.supplierId,
        supplierName: batch.supplier?.name || null,
        remainingQuantity: batch.remainingQuantity,
        costPrice: batch.costPrice,
        sellPrice: batch.sellPrice,
        createdAt: batch.createdAt,
      })),
    });
  } catch (error) {
    console.error('getAvailableBatches error:', error);
    return res.status(500).json({
      message: "Server xatosi",
    });
  }
};

export const searchProductsForSupplierIn = async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 50);

    if (!q) {
      return res.json([]);
    }

    const sizeOrder = [
      'XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL',
      '34', '35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46',
    ];

    const getSizeSortValue = (sizeName = '') => {
      const normalized = String(sizeName).trim().toUpperCase();
      const fixedIndex = sizeOrder.indexOf(normalized);
      if (fixedIndex !== -1) return fixedIndex;

      const asNumber = Number(normalized);
      if (!Number.isNaN(asNumber)) return 1000 + asNumber;

      return 2000 + normalized.charCodeAt(0);
    };

    const products = await prisma.product.findMany({
      where: {
        storeId: req.storeId,
        isActive: true,
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { brand: { contains: q, mode: 'insensitive' } },
          {
            category: {
              name: { contains: q, mode: 'insensitive' },
            },
          },
          {
            variants: {
              some: {
                size: {
                  name: { contains: q, mode: 'insensitive' },
                },
              },
            },
          },
        ],
      },
      include: {
        category: true,
        variants: {
          include: {
            size: true,
          },
        },
      },
      orderBy: [
        { name: 'asc' },
        { createdAt: 'desc' },
      ],
      take: limit,
    });

    const result = products.map((product) => ({
      ...product,
      variants: [...(product.variants || [])].sort(
        (a, b) =>
          getSizeSortValue(a.size?.name || '') - getSizeSortValue(b.size?.name || '')
      ),
    }));

    return res.json(result);
  } catch (error) {
    console.error('searchProductsForSupplierIn error:', error);
    return res.status(500).json({
      message: "Server xatosi",
    });
  }
};

export const uploadProductImage = async (req, res) => {
  try {
    const { productId } = req.params;

    const product = await prisma.product.findFirst({
      where: {
        id: productId,
        storeId: req.storeId,
      },
    });

    if (!product) {
      return res.status(404).json({
        message: 'Tovar topilmadi',
      });
    }

    if (!req.file) {
      return res.status(400).json({
        message: 'Rasm fayli topilmadi',
      });
    }

    if (product.imageUrl) {
      const oldPath = path.join(process.cwd(), product.imageUrl.replace(/^\//, ''));
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }

    const imageUrl = `/uploads/products/${req.file.filename}`;

    const updated = await prisma.product.update({
      where: { id: productId },
      data: { imageUrl },
    });

    return res.json({
      message: 'Tovar rasmi yuklandi',
      product: updated,
    });
  } catch (error) {
    console.error('uploadProductImage error:', error);
    return res.status(500).json({
      message: 'Server xatosi',
    });
  }
};

export const deleteProductImage = async (req, res) => {
  try {
    const { productId } = req.params;

    const product = await prisma.product.findFirst({
      where: {
        id: productId,
        storeId: req.storeId,
      },
    });

    if (!product) {
      return res.status(404).json({
        message: 'Tovar topilmadi',
      });
    }

    if (product.imageUrl) {
      const filePath = path.join(process.cwd(), product.imageUrl.replace(/^\//, ''));
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    const updated = await prisma.product.update({
      where: { id: productId },
      data: { imageUrl: null },
    });

    return res.json({
      message: 'Tovar rasmi o‘chirildi',
      product: updated,
    });
  } catch (error) {
    console.error('deleteProductImage error:', error);
    return res.status(500).json({
      message: 'Server xatosi',
    });
  }
};