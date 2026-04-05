const prisma = require('../prisma/index');

// Omborga yangi partiya kirim qilish
exports.createIncome = async (req, res) => {
  try {
    const { quantity, costPrice, sellPrice, sizeId, storeId } = req.body;

    // PRISMA TRANSACTION: Ikkita amalni bittada bajaramiz (Xavfsiz usul)
    // 1. Income (Kirim) tarixiga yozamiz
    // 2. Size (Razmer) dagi 'stock' ni oshiramiz
    const [newIncome, updatedSize] = await prisma.$transaction([
      prisma.income.create({
        data: {
          quantity: Number(quantity),
          costPrice: Number(costPrice),
          sellPrice: Number(sellPrice),
          sizeId,
          storeId
        }
      }),
      prisma.size.update({
        where: { id: sizeId },
        data: {
          stock: { increment: Number(quantity) } // Qoldiqni qo'shamiz
        }
      })
    ]);

    res.status(201).json({ 
      success: true, 
      message: "Kirim muvaffaqiyatli saqlandi va qoldiq yangilandi",
      data: { income: newIncome, newStock: updatedSize.stock } 
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};