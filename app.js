import express from 'express';
import cors from 'cors';
import path from 'path';

import authRoutes from './routes/auth.routes.js';
import storesRoutes from './routes/stores.routes.js';
import productRoutes from './routes/products.routes.js';
import incomeRoutes from './routes/incomes.routes.js';
import cashboxRoutes from './routes/cashboxes.routes.js';
import transferRoutes from './routes/transfers.routes.js';
import salesRoutes from './routes/sales.routes.js';
import analyticsRoutes from './routes/analytics.routes.js';
import settingsRoutes from './routes/settings.routes.js';
// import adminRoutes from './routes/admin.routes.js';
import warehousesRoutes from './routes/warehouses.routes.js';
import suppliersRoutes from './routes/suppliers.routes.js';
import stockRoutes from './routes/stock.routes.js';
import returnsRoutes from './routes/returns.routes.js';
import usersRoutes from './routes/users.routes.js';
import referenceRoutes from './routes/reference.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import supplierPaymentsRoutes from './routes/supplierPayments.routes.js';
import supplierInsRoutes from './routes/supplierIns.routes.js';

const app = express();

app.use(
  cors({
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

app.get('/', (_req, res) => {
  res.json({ message: "Kiyim do'koni API ishlayapti! 🚀" });
});

app.use('/api/auth', authRoutes);
app.use('/api/stores', storesRoutes);
app.use('/api/products', productRoutes);
app.use('/api/incomes', incomeRoutes);
app.use('/api/cashboxes', cashboxRoutes);
app.use('/api/transfers', transferRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/settings', settingsRoutes);
// app.use('/api/admin', adminRoutes);
app.use('/api/warehouses', warehousesRoutes);
app.use('/api/suppliers', suppliersRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/returns', returnsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/reference', referenceRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/supplier-payments', supplierPaymentsRoutes);
app.use('/api/supplier-ins', supplierInsRoutes);

export default app;