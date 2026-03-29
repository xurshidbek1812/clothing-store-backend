import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log("⏳ Boshlang'ich ma'lumotlar kiritilmoqda...");

  // 1. Do'kon yaratish
  const store = await prisma.store.create({
    data: {
      name: 'Iphone House',
      address: 'Toshkent',
    },
  });
  console.log("✅ Do'kon yaratildi:", store.name);

  // 2. Kassa yaratish
  await prisma.cashbox.create({
    data: {
      name: 'Asosiy Kassa',
      balance: 0,
      storeId: store.id,
    },
  });
  console.log("✅ Kassa yaratildi");

  // 3. Admin foydalanuvchini yaratish (Username bilan)
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash('123456', salt); // Tayyor parol: 123456

  const user = await prisma.user.create({
    data: {
      name: 'Bosh Boshqaruvchi',
      username: 'admin',           // <--- Mana bizning username
      phone: '+998901234567',
      password: hashedPassword,
      storeId: store.id,
    },
  });
  
  console.log("✅ Admin muvaffaqiyatli yaratildi!");
  console.log("----------------------------------");
  console.log(`Foydalanuvchi nomi (Username): ${user.username}`);
  console.log(`Maxfiy parol: 123456`);
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