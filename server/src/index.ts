import app from './app';
import { env } from './utils/env';
import pool from './db/pool';

const PORT = env.PORT || 5000;

// Test database connection
async function testDbConnection() {
  try {
    const result = await pool.query('SELECT NOW()');
    console.log('✓ Database connected successfully');
    console.log(`  Time: ${result.rows[0].now}`);
  } catch (error) {
    console.error('✗ Database connection failed:', error);
    process.exit(1);
  }
}

// Start server
async function startServer() {
  await testDbConnection();

  app.listen(PORT, () => {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`   Environment: ${env.NODE_ENV}`);
    console.log(`   API: http://localhost:${PORT}/api`);
    console.log(`   Health: http://localhost:${PORT}/health`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  });
}

startServer();
