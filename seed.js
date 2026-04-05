import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log("⏳ Boshlang'ich ma'lumotlar kiritilmoqda...");

  // Baza tozalanishi kerak bo'lsa (opsional, lekin xato bermasligi uchun eski ma'lumotlarni o'chiramiz)
  await prisma.user.deleteMany();
  await prisma.cashbox.deleteMany();
  await prisma.store.deleteMany();
  await prisma.currency.deleteMany();

  // 1. Asosiy valyutani yaratamiz (YANGI QO'SHILGAN QISM)
  const currency = await prisma.currency.create({
    data: {
      name: "O'zbek so'mi",
      code: "UZS",
      symbol: "so'm",
      rate: 1, // Asosiy valyuta kursi doim 1 bo'ladi
      isDefault: true
    }
  });
  console.log("✅ Valyuta yaratildi: UZS");

  // 2. Do'kon yaratamiz
  const store = await prisma.store.create({
    data: {
      name: "Iphone House",
      address: "Toshkent shahri"
    }
  });
  console.log(`✅ Do'kon yaratildi: ${store.name}`);

  // 3. Kassa yaratamiz (Endi unga valyutani ham bog'laymiz!)
  const cashbox = await prisma.cashbox.create({
    data: {
      name: "Asosiy Kassa",
      balance: 0,
      storeId: store.id,
      currencyId: currency.id // <--- PRISMA SO'RAGAN NARSA SHU EDI
    }
  });
  console.log("✅ Kassa yaratildi");

  // 4. Admin yaratamiz
  const hashedPassword = await bcrypt.hash('123456', 10);
  const admin = await prisma.user.create({
    data: {
      name: "Boshqaruvchi",
      username: "admin",
      password: hashedPassword,
      role: "ADMIN",
      stores: {
        connect: { id: store.id }
      }
    }
  });
  
  console.log("✅ Admin muvaffaqiyatli yaratildi!");
  console.log("----------------------------------");
  console.log("Foydalanuvchi nomi: admin");
  console.log("Maxfiy parol: 123456");
  console.log("----------------------------------");
}

main()
  .catch((e) => {
    console.error("❌ Xatolik yuz berdi:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });