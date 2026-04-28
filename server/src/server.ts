import app from './app';
import { config } from './config/env';
import { testConnection } from './db/pool';
import { ensureBaseSchema } from './utils/ensureBaseSchema';
import { ensureRuntimeFinanceSchema } from './utils/runtimeFinanceSchema';
import { syncSystemAccountBalances } from './utils/systemAccounts';
import { syncLedgerBalances } from './utils/ledgerBalanceSync';

const startServer = async () => {
  try {
    // Test database connection
    await testConnection();
    await ensureBaseSchema();
    await ensureRuntimeFinanceSchema();
    await syncSystemAccountBalances();
    await syncLedgerBalances();

    // Start server
    app.listen(config.port, () => {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`🚀 Server running on port ${config.port}`);
      console.log(`   Environment: ${config.nodeEnv}`);
      console.log(`   API: http://localhost:${config.port}/api`);
      console.log(`   Health: http://localhost:${config.port}/api/health`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
