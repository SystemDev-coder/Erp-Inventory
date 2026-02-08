import { CookieOptions } from 'express';
import { config } from './env';

export const getCookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: config.cookie.secure,
  sameSite: config.cookie.sameSite,
  maxAge: config.jwt.refreshExpiresDays * 24 * 60 * 60 * 1000, // days to ms
  path: '/',
});
