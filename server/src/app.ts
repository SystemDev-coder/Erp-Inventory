import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import morgan from 'morgan';
import { corsOptions } from './config/cors';
import { errorHandler } from './middlewares/errorHandler';
import authRoutes from './modules/auth/auth.routes';
import systemRoutes from './modules/system/system.routes';
import sessionRoutes from './modules/session/session.routes';
import dashboardRoutes from './modules/dashboard/dashboard.routes';
import productRoutes from './modules/products/products.routes';
import settingsRoutes from './modules/settings/settings.routes';
import { ensureSettingsSchema } from './migrations/ensureSettingsSchema';
import { config } from './config/env';

const app = express();

// Security middleware
app.use(helmet());
app.use(cors(corsOptions));

// Ensure settings-related tables/columns exist (idempotent)
ensureSettingsSchema().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to ensure settings schema', err);
});

// Request parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Logging
if (config.isDev) {
  app.use(morgan('dev'));
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is healthy',
    timestamp: new Date().toISOString(),
  });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/system', systemRoutes);
app.use('/api', sessionRoutes); // Session management & user endpoints
app.use('/api', dashboardRoutes); // Dashboard (role-based)
app.use('/api/products', productRoutes);
app.use('/api/settings', settingsRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

// Error handler (must be last)
app.use(errorHandler);

export default app;
