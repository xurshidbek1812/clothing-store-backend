import fs from 'fs';
import path from 'path';
import { prisma } from '../lib/prisma.js';

const removeFileIfExists = (fileUrl) => {
  if (!fileUrl) return;

  const filePath = path.join(process.cwd(), fileUrl.replace(/^\//, ''));
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
};

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

  const base = 10000000;

  if (!lastVariant?.barcode) {
    return String(base);
  }

  const parsed = Number(lastVariant.barcode);

  if (Number.isNaN(parsed)) {
    return String(base);
  }

  return String(parsed + 1);
};

const getNextVariantSortOrder = async (tx, productId) => {
  const lastVariant = await tx.productVariant.findFirst({
    where: { productId },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });

  return (lastVariant?.sortOrder || 0) + 1;
};

const attachPrimaryImage = (product) => {
  const sortedImages = [...(product.images || [])].sort((a, b) => {
    if (a.isPrimary === b.isPrimary) return (a.sortOrder || 0) - (b.sortOrder || 0);
    return a.isPrimary ? -1 : 1;
  });

  return {
    ...product,
    images: sortedImages,
    primaryImage: sortedImages[0] || null,
    imageUrl: sortedImages[0]?.imageUrl || null,
  };
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
        message: 'name majburiy',
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
          message: 'Kategoriya topilmadi',
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
          message: 'Har bir variant uchun sizeId majburiy',
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
          const sortOrder = await getNextVariantSortOrder(tx, createdProduct.id);

          await tx.productVariant.create({
            data: {
              productId: createdProduct.id,
              sizeId: item.sizeId,
              barcode,
              sortOrder,
            },
          });
        }
      }

      const fullProduct = await tx.product.findUnique({
        where: { id: createdProduct.id },
        include: {
          category: true,
          images: {
            orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
          },
          variants: {
            include: {
              size: true,
            },
            orderBy: {
              sortOrder: 'asc',
            },
          },
        },
      });

      return attachPrimaryImage(fullProduct);
    });

    return res.status(201).json({
      message: 'Tovar yaratildi',
      product,
    });
  } catch (error) {
    console.error('createProduct error:', error);
    return res.status(500).json({
      message: 'Server xatosi',
    });
  }
};

export const getProducts = async (req, res) => {
  try {
    const search = String(req.query.search || '').trim();
    const warehouseId = req.query.warehouseId ? String(req.query.warehouseId) : null;

    const products = await prisma.product.findMany({
      where: {
        storeId: req.storeId,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { brand: { contains: search, mode: 'insensitive' } },
                {
                  variants: {
                    some: {
                      size: {
                        name: { contains: search, mode: 'insensitive' },
                      },
                    },
                  },
                },
              ],
            }
          : {}),
      },
      include: {
        category: true,
        images: {
          orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
        variants: {
          include: {
            size: true,
            stockBatches: {
              where: warehouseId
                ? {
                    warehouseId,
                    warehouse: {
                      storeId: req.storeId,
                      isActive: true,
                    },
                  }
                : {
                    warehouse: {
                      storeId: req.storeId,
                      isActive: true,
                    },
                  },
              select: {
                id: true,
                remainingQuantity: true,
                sellPrice: true,
                warehouseId: true,
              },
            },
          },
          orderBy: {
            sortOrder: 'asc',
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const mapped = products.map((product) => {
      const totalStock = product.variants.reduce((sum, variant) => {
        return (
          sum +
          variant.stockBatches.reduce(
            (batchSum, batch) => batchSum + Number(batch.remainingQuantity || 0),
            0
          )
        );
      }, 0);

      return attachPrimaryImage({
        ...product,
        totalStock,
      });
    });

    return res.json(mapped);
  } catch (error) {
    console.error('getProducts error:', error);
    return res.status(500).json({
      message: 'Server xatosi',
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
        images: {
          orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
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
          orderBy: {
            sortOrder: 'asc',
          },
        },
      },
    });

    if (!product) {
      return res.status(404).json({
        message: 'Tovar topilmadi',
      });
    }

    return res.json(attachPrimaryImage(product));
  } catch (error) {
    console.error('getProductById error:', error);
    return res.status(500).json({
      message: 'Server xatosi',
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
        message: 'Tovar topilmadi',
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
          message: 'Kategoriya topilmadi',
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
        images: {
          orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
        variants: {
          include: {
            size: true,
          },
          orderBy: {
            sortOrder: 'asc',
          },
        },
      },
    });

    return res.json({
      message: 'Tovar yangilandi',
      product: attachPrimaryImage(product),
    });
  } catch (error) {
    console.error('updateProduct error:', error);
    return res.status(500).json({
      message: 'Server xatosi',
    });
  }
};

export const addVariantToProduct = async (req, res) => {
  try {
    const { productId } = req.params;
    const { sizeId } = req.body;

    if (!sizeId) {
      return res.status(400).json({
        message: 'sizeId majburiy',
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
        message: 'Tovar topilmadi',
      });
    }

    const size = await prisma.size.findUnique({
      where: { id: sizeId },
    });

    if (!size) {
      return res.status(404).json({
        message: 'Size topilmadi',
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
      const sortOrder = await getNextVariantSortOrder(tx, productId);

      return tx.productVariant.create({
        data: {
          productId,
          sizeId,
          barcode,
          sortOrder,
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
      message: 'Server xatosi',
    });
  }
};

export const removeVariantFromProduct = async (req, res) => {
  try {
    const { productId, variantId } = req.params;

    const variant = await prisma.productVariant.findFirst({
      where: {
        id: variantId,
        productId,
        product: {
          storeId: req.storeId,
        },
      },
      include: {
        size: true,
        stockBatches: {
          select: {
            id: true,
            remainingQuantity: true,
          },
        },
        saleItems: {
          select: { id: true },
          take: 1,
        },
        supplierInItems: {
          select: { id: true },
          take: 1,
        },
        stockMovements: {
          select: { id: true },
          take: 1,
        },
        inventoryCountItems: {
          select: { id: true },
          take: 1,
        },
      },
    });

    if (!variant) {
      return res.status(404).json({
        message: 'Variant topilmadi',
      });
    }

    const hasRemainingStock = variant.stockBatches.some(
      (batch) => Number(batch.remainingQuantity || 0) > 0
    );

    const hasHistory =
      variant.saleItems.length > 0 ||
      variant.supplierInItems.length > 0 ||
      variant.stockMovements.length > 0 ||
      variant.inventoryCountItems.length > 0 ||
      variant.stockBatches.length > 0;

    if (hasRemainingStock || hasHistory) {
      return res.status(400).json({
        message: `${variant.size?.name || 'Bu razmer'} ni o‘chirib bo‘lmaydi. Unda qoldiq yoki tarix mavjud.`,
      });
    }

    await prisma.productVariant.delete({
      where: {
        id: variantId,
      },
    });

    return res.json({
      message: `${variant.size?.name || 'Razmer'} olib tashlandi`,
    });
  } catch (error) {
    console.error('removeVariantFromProduct error:', error);
    return res.status(500).json({
      message: 'Server xatosi',
    });
  }
};

export const reorderProductVariants = async (req, res) => {
  try {
    const { productId } = req.params;
    const { variantIds } = req.body;

    if (!Array.isArray(variantIds) || variantIds.length === 0) {
      return res.status(400).json({
        message: 'variantIds array majburiy',
      });
    }

    const product = await prisma.product.findFirst({
      where: {
        id: productId,
        storeId: req.storeId,
      },
      include: {
        variants: {
          select: { id: true },
        },
      },
    });

    if (!product) {
      return res.status(404).json({
        message: 'Tovar topilmadi',
      });
    }

    const existingIds = product.variants.map((v) => v.id).sort();
    const incomingIds = [...variantIds].sort();

    if (existingIds.length !== incomingIds.length || existingIds.join(',') !== incomingIds.join(',')) {
      return res.status(400).json({
        message: "variantIds to'liq va to'g'ri bo'lishi kerak",
      });
    }

    await prisma.$transaction(
      variantIds.map((variantId, index) =>
        prisma.productVariant.update({
          where: { id: variantId },
          data: { sortOrder: index + 1 },
        })
      )
    );

    return res.json({
      message: 'Razmerlar tartibi yangilandi',
    });
  } catch (error) {
    console.error('reorderProductVariants error:', error);
    return res.status(500).json({
      message: 'Server xatosi',
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
        message: 'productVariantId majburiy',
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
        product: {
          include: {
            images: {
              orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
            },
          },
        },
        size: true,
      },
    });

    if (!variant) {
      return res.status(404).json({
        message: 'Variant topilmadi',
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

    const productWithPrimary = attachPrimaryImage(variant.product);

    return res.json({
      productVariant: {
        id: variant.id,
        size: variant.size.name,
        product: {
          id: productWithPrimary.id,
          name: productWithPrimary.name,
          brand: productWithPrimary.brand,
          imageUrl: productWithPrimary.imageUrl,
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
      message: 'Server xatosi',
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
        images: {
          orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
        variants: {
          include: {
            size: true,
          },
          orderBy: {
            sortOrder: 'asc',
          },
        },
      },
      orderBy: [
        { name: 'asc' },
        { createdAt: 'desc' },
      ],
      take: limit,
    });

    return res.json(products.map(attachPrimaryImage));
  } catch (error) {
    console.error('searchProductsForSupplierIn error:', error);
    return res.status(500).json({
      message: 'Server xatosi',
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
      include: {
        images: true,
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

    const imageUrl = `/uploads/products/${req.file.filename}`;

    const lastImage = await prisma.productImage.findFirst({
      where: { productId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });

    const createdImage = await prisma.productImage.create({
      data: {
        productId,
        imageUrl,
        isPrimary: product.images.length === 0,
        sortOrder: (lastImage?.sortOrder || 0) + 1,
      },
    });

    return res.json({
      message: 'Tovar rasmi yuklandi',
      image: createdImage,
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
    const { imageId } = req.params;

    const image = await prisma.productImage.findFirst({
      where: {
        id: imageId,
        product: {
          storeId: req.storeId,
        },
      },
      include: {
        product: {
          include: {
            images: true,
          },
        },
      },
    });

    if (!image) {
      return res.status(404).json({
        message: 'Rasm topilmadi',
      });
    }

    await prisma.productImage.delete({
      where: { id: imageId },
    });

    removeFileIfExists(image.imageUrl);

    const remainingImages = image.product.images.filter((img) => img.id !== image.id);

    if (image.isPrimary && remainingImages.length > 0) {
      const nextPrimary = [...remainingImages].sort((a, b) => {
        if ((a.sortOrder || 0) === (b.sortOrder || 0)) {
          return new Date(a.createdAt) - new Date(b.createdAt);
        }
        return (a.sortOrder || 0) - (b.sortOrder || 0);
      })[0];

      await prisma.productImage.update({
        where: { id: nextPrimary.id },
        data: { isPrimary: true },
      });
    }

    return res.json({
      message: 'Tovar rasmi o‘chirildi',
    });
  } catch (error) {
    console.error('deleteProductImage error:', error);
    return res.status(500).json({
      message: 'Server xatosi',
    });
  }
};

export const setPrimaryProductImage = async (req, res) => {
  try {
    const { imageId } = req.params;

    const image = await prisma.productImage.findFirst({
      where: {
        id: imageId,
        product: {
          storeId: req.storeId,
        },
      },
      include: {
        product: true,
      },
    });

    if (!image) {
      return res.status(404).json({
        message: 'Rasm topilmadi',
      });
    }

    await prisma.$transaction([
      prisma.productImage.updateMany({
        where: {
          productId: image.productId,
        },
        data: {
          isPrimary: false,
        },
      }),
      prisma.productImage.update({
        where: { id: imageId },
        data: {
          isPrimary: true,
        },
      }),
    ]);

    return res.json({
      message: 'Asosiy rasm belgilandi',
    });
  } catch (error) {
    console.error('setPrimaryProductImage error:', error);
    return res.status(500).json({
      message: 'Server xatosi',
    });
  }
};