/**
 * API Health Check Utility
 * Quick utility to verify backend connectivity
 */

import { env } from '../config/env';

export interface HealthCheckResult {
  isHealthy: boolean;
  message: string;
  statusCode?: number;
  timestamp?: string;
  latency?: number;
}

/**
 * Check if the backend API is healthy and reachable
 */
export async function checkApiHealth(): Promise<HealthCheckResult> {
  const startTime = Date.now();
  
  try {
    const response = await fetch(`${env.API_URL}/api/health`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const latency = Date.now() - startTime;
    const data = await response.json();

    if (response.ok && data.success) {
      return {
        isHealthy: true,
        message: 'Backend API is healthy',
        statusCode: response.status,
        timestamp: data.timestamp,
        latency,
      };
    } else {
      return {
        isHealthy: false,
        message: 'Backend API returned error',
        statusCode: response.status,
        latency,
      };
    }
  } catch (error) {
    const latency = Date.now() - startTime;
    return {
      isHealthy: false,
      message: error instanceof Error ? error.message : 'Failed to connect to backend',
      latency,
    };
  }
}

/**
 * Log health check results to console
 */
export async function logHealthCheck(): Promise<void> {
  console.log('🔍 Checking backend API health...');
  const result = await checkApiHealth();
  
  if (result.isHealthy) {
    console.log('✅ Backend API is healthy');
    console.log(`   Status: ${result.statusCode}`);
    console.log(`   Latency: ${result.latency}ms`);
    console.log(`   Timestamp: ${result.timestamp}`);
  } else {
    console.error('❌ Backend API is not healthy');
    console.error(`   Message: ${result.message}`);
    if (result.statusCode) {
      console.error(`   Status: ${result.statusCode}`);
    }
    console.error(`   Latency: ${result.latency}ms`);
  }
}

// Export for use in browser console
if (typeof window !== 'undefined') {
  (window as any).checkApiHealth = checkApiHealth;
  (window as any).logHealthCheck = logHealthCheck;
}
