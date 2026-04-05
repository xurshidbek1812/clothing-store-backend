import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.routes.js';
import productRoutes from './routes/products.routes.js';
import incomeRoutes from './routes/incomes.routes.js';
import cashboxRoutes from './routes/cashboxes.routes.js';
import transferRoutes from './routes/transfers.routes.js';
import salesRoutes from './routes/sales.routes.js';
import analyticsRoutes from './routes/analytics.routes.js';
import settingsRoutes from './routes/settings.routes.js';
import adminRoutes from './routes/admin.routes.js';

const app = express();

app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173'], // React ishlayotgan aniq port
  credentials: true, // Ehtimoliy tokenlar o'tishi uchun ruxsat
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  res.send("Backend 100% ishlayapti va eshiklar ochiq! 🎉");
});

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/incomes', incomeRoutes);
app.use('/api/cashboxes', cashboxRoutes);
app.use('/api/transfers', transferRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/admin', adminRoutes);

app.get('/', (req, res) => {
  res.json({ message: "Kiyim do'koni API ishlayapti! 🚀" });
});

export default app;