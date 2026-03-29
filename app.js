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

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/incomes', incomeRoutes);
app.use('/api/cashboxes', cashboxRoutes);
app.use('/api/transfers', transferRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/settings', settingsRoutes);

app.get('/', (req, res) => {
  res.json({ message: "Kiyim do'koni API ishlayapti! 🚀" });
});

export default app;