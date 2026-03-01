import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import morgan from 'morgan';
import { corsOptions } from './config/cors';
import { errorHandler } from './middlewares/errorHandler';
import authRoutes from './modules/auth/auth.routes';
import sessionRoutes from './modules/session/session.routes';
import dashboardRoutes from './modules/dashboard/dashboard.routes';
import productRoutes from './modules/products/products.routes';
import settingsRoutes from './modules/settings/settings.routes';
import mediaRoutes from './modules/media/media.routes';
import customerRoutes from './modules/customers/customers.routes';
import purchaseRoutes from './modules/purchases/purchases.routes';
import salesRoutes from './modules/sales/sales.routes';
import supplierRoutes from './modules/suppliers/suppliers.routes';
import accountRoutes from './modules/accounts/accounts.routes';
import profileRoutes from './modules/profile/profile.routes';
import userRoutes from './modules/users/users.routes';
import inventoryRoutes from './modules/inventory/inventory.routes';
import financeRoutes from './modules/finance/finance.routes';
import notificationRoutes from './modules/notifications/notifications.routes';
import employeeRoutes from './modules/employees/employees.routes';
import storeRoutes from './modules/stores/stores.routes';
import shiftRoutes from './modules/shifts/shifts.routes';
import returnsRoutes from './modules/returns/returns.routes';
import systemRoutes from './modules/system/system.routes';
import reportsRoutes from './modules/reports/reports.routes';
import importRoutes from './modules/import/import.routes';
import assetsRoutes from './modules/assets/assets.routes';
// import scheduleRoutes from './modules/schedules/schedules.routes'; // TEMP: Disabled - has import errors
import { config } from './config/env';

const app = express();

// Security middleware
app.use(helmet());
app.use(cors(corsOptions));

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
app.use('/api', sessionRoutes); // Session management & user endpoints
app.use('/api', dashboardRoutes); // Dashboard (role-based)
app.use('/api/products', productRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/purchases', purchaseRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/users', userRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/stores', storeRoutes);
app.use('/api/shifts', shiftRoutes);
app.use('/api/returns', returnsRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/import', importRoutes);
app.use('/api/assets', assetsRoutes);
// app.use('/api/schedules', scheduleRoutes); // TEMP: Disabled - has import errors

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
