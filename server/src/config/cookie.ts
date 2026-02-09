import { CookieOptions } from 'express';
import { config } from './env';

export const getCookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: config.cookie.secure,
  sameSite: config.cookie.sameSite,
  maxAge: config.jwt.refreshExpiresDays * 24 * 60 * 60 * 1000, // days to ms
  path: '/',
});

// Express 5 deprecates passing maxAge to clearCookie. Provide a safe variant.
export const getClearCookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: config.cookie.secure,
  sameSite: config.cookie.sameSite,
  path: '/',
});
