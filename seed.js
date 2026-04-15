import bcrypt from 'bcryptjs';
import pkg from '@prisma/client';

const { PrismaClient, Role } = pkg;

const prisma = new PrismaClient();

async function main() {
  const username = 'admin';
  const password = '123456';
  const passwordHash = await bcrypt.hash(password, 10);

  // 1) Store
  const store = await prisma.store.upsert({
    where: {
      id: 'seed-main-store-id',
    },
    update: {},
    create: {
      id: 'seed-main-store-id',
      name: "Asosiy do'kon",
      address: 'Toshkent',
      isActive: true,
    },
  });

  // 2) Director user
  const existingUser = await prisma.user.findUnique({
    where: { username },
  });

  let user;

  if (existingUser) {
    user = await prisma.user.update({
      where: { username },
      data: {
        fullName: 'Super Admin',
        passwordHash,
        role: Role.DIRECTOR,
        isActive: true,
      },
    });
  } else {
    user = await prisma.user.create({
      data: {
        fullName: 'Super Admin',
        username,
        passwordHash,
        role: Role.DIRECTOR,
        isActive: true,
      },
    });
  }

  // 3) User -> Store biriktirish
  await prisma.userStore.upsert({
    where: {
      userId_storeId: {
        userId: user.id,
        storeId: store.id,
      },
    },
    update: {},
    create: {
      userId: user.id,
      storeId: store.id,
    },
  });

  // 4) Currencies
  const currencies = [
    {
      name: "O'zbek so'mi",
      code: 'UZS',
      symbol: "so'm",
      rate: 1,
      isDefault: true,
    },
    {
      name: 'US Dollar',
      code: 'USD',
      symbol: '$',
      rate: 12500,
      isDefault: false,
    },
  ];

  for (const currency of currencies) {
    await prisma.currency.upsert({
      where: { code: currency.code },
      update: {
        name: currency.name,
        symbol: currency.symbol,
        rate: currency.rate,
        isDefault: currency.isDefault,
      },
      create: currency,
    });
  }

  // 5) Sizes
  const sizes = ['S', 'M', 'L', 'XL', 'XXL', '36', '37', '38', '39', '40', '41', '42'];

  for (const sizeName of sizes) {
    await prisma.size.upsert({
      where: { name: sizeName },
      update: {},
      create: { name: sizeName },
    });
  }

  // 6) Categories
  const categories = ['Futbolka', 'Shim', 'Kurtka', 'Koylak', 'Oyoq kiyim'];

  for (const categoryName of categories) {
    await prisma.category.upsert({
      where: {
        storeId_name: {
          storeId: store.id,
          name: categoryName,
        },
      },
      update: {},
      create: {
        storeId: store.id,
        name: categoryName,
      },
    });
  }

  // 7) Expense categories
  const expenseCategories = ['Ijara', 'Oylik', 'Transport', 'Boshqa xarajat'];

  for (const item of expenseCategories) {
    await prisma.expenseCategory.upsert({
      where: {
        storeId_name: {
          storeId: store.id,
          name: item,
        },
      },
      update: {},
      create: {
        storeId: store.id,
        name: item,
      },
    });
  }

  // 8) Warehouse
  await prisma.warehouse.upsert({
    where: {
      storeId_name: {
        storeId: store.id,
        name: "Asosiy ombor",
      },
    },
    update: {},
    create: {
      storeId: store.id,
      name: "Asosiy ombor",
      isActive: true,
    },
  });

  // 9) Cashbox
  const uzs = await prisma.currency.findUnique({
    where: { code: 'UZS' },
  });

  await prisma.cashbox.upsert({
    where: {
      storeId_name: {
        storeId: store.id,
        name: "Asosiy kassa",
      },
    },
    update: {},
    create: {
      storeId: store.id,
      currencyId: uzs.id,
      name: "Asosiy kassa",
      balance: 0,
      isActive: true,
    },
  });

  console.log('Seed muvaffaqiyatli tugadi');
  console.log('Login:', username);
  console.log('Password:', password);
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });