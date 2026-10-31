import app from './app';
import { config } from './config/env';
import { testConnection } from './db/pool';
import { ensureBaseSchema } from './utils/ensureBaseSchema';
import { ensureRuntimeFinanceSchema } from './utils/runtimeFinanceSchema';
import { syncSystemAccountBalances } from './utils/systemAccounts';
import { syncLedgerBalances } from './utils/ledgerBalanceSync';
import { ensurePerformanceIndexes } from './utils/ensurePerformanceIndexes';
import { syncCreditDueNotifications } from './utils/creditDueNotifications';

const LEDGER_SYNC_INTERVAL_MS = 60 * 60 * 1000;
const CREDIT_DUE_NOTIFICATION_INTERVAL_MS = 5 * 1000;

const startLedgerSyncSchedule = () => {
  setInterval(() => {
    void syncLedgerBalances().catch((error) => {
      console.error('Scheduled ledger balance sync failed:', error);
    });
  }, LEDGER_SYNC_INTERVAL_MS);
};

const startCreditDueNotificationSchedule = () => {
  let syncing = false;
  const sync = async () => {
    // A slow database call must not overlap with the next five-second tick.
    if (syncing) return;
    syncing = true;
    try {
      await syncCreditDueNotifications();
    } catch (error) {
      console.error('Scheduled credit due notification sync failed:', error);
    } finally {
      syncing = false;
    }
  };

  void sync();
  setInterval(() => void sync(), CREDIT_DUE_NOTIFICATION_INTERVAL_MS);
};

const startServer = async () => {
  try {
    // Test database connection
    await testConnection();
    await ensureBaseSchema();
    await ensureRuntimeFinanceSchema();
    await ensurePerformanceIndexes();
    await syncSystemAccountBalances();
    await syncLedgerBalances();
    startLedgerSyncSchedule();
    startCreditDueNotificationSchedule();

    // Start server
    app.listen(config.port, config.host, () => {
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
