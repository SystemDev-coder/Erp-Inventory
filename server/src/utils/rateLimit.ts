import rateLimit from 'express-rate-limit';

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 requests per window
  message: 'Too many attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

export const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 requests per hour
  message: 'Too many password reset requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

// HIGH-01 fix: reset codes are 6 digits (900,000 possibilities) and this
// endpoint previously had no rate limiting at all, unlike every other
// credential-related route in this file - making the code brute-forceable
// well within its 10-minute expiry (RESET_CODE_EXPIRES_MIN). Capping
// attempts per IP to a small number per window makes that infeasible while
// still allowing a real user a few mistaken attempts.
export const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per window
  message: 'Too many password reset attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});
