import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('5000'),
  
  // PostgreSQL
  PGHOST: z.string().min(1, 'PGHOST is required'),
  PGPORT: z.string().default('5432'),
  PGDATABASE: z.string().min(1, 'PGDATABASE is required'),
  PGUSER: z.string().min(1, 'PGUSER is required'),
  PGPASSWORD: z.string().min(1, 'PGPASSWORD is required'),
  PGSCHEMA: z.string().default('ims'),
  
  // Client
  CLIENT_ORIGIN: z.string().url().default('http://localhost:5173'),
  
  // JWT
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_EXPIRES_DAYS: z.string().default('7'),
  
  // Cookie
  COOKIE_NAME: z.string().default('rt'),
  COOKIE_SECURE: z.string().default('false'),
  COOKIE_SAMESITE: z.enum(['strict', 'lax', 'none']).default('lax'),
  
  // Reset Password
  RESET_CODE_EXPIRES_MIN: z.string().default('10'),
  DEV_RETURN_RESET_CODE: z.string().default('true'),
});

const parseEnv = () => {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ Invalid environment variables:');
      error.errors.forEach((err) => {
        console.error(`  - ${err.path.join('.')}: ${err.message}`);
      });
      process.exit(1);
    }
    throw error;
  }
};

export const env = parseEnv();

export const config = {
  nodeEnv: env.NODE_ENV,
  port: parseInt(env.PORT, 10),
  isDev: env.NODE_ENV === 'development',
  isProd: env.NODE_ENV === 'production',
  
  db: {
    host: env.PGHOST,
    port: parseInt(env.PGPORT, 10),
    database: env.PGDATABASE,
    user: env.PGUSER,
    password: env.PGPASSWORD,
    schema: env.PGSCHEMA,
  },
  
  client: {
    origin: env.CLIENT_ORIGIN,
  },
  
  jwt: {
    accessSecret: env.JWT_ACCESS_SECRET,
    refreshSecret: env.JWT_REFRESH_SECRET,
    accessExpiresIn: env.ACCESS_TOKEN_EXPIRES_IN,
    refreshExpiresDays: parseInt(env.REFRESH_TOKEN_EXPIRES_DAYS, 10),
  },
  
  cookie: {
    name: env.COOKIE_NAME,
    secure: env.COOKIE_SECURE === 'true',
    sameSite: env.COOKIE_SAMESITE as 'strict' | 'lax' | 'none',
  },
  
  resetPassword: {
    expiresMin: parseInt(env.RESET_CODE_EXPIRES_MIN, 10),
    devReturnCode: env.DEV_RETURN_RESET_CODE === 'true',
  },
};
