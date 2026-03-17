import jwt, { SignOptions } from 'jsonwebtoken';
import { config } from '../config/env';
import crypto from 'crypto';

export interface TokenPayload {
  userId: number;
  username: string;
  roleId: number;
  branchId: number;
  sessionId?: string;
}

export const signAccessToken = (payload: TokenPayload): string => {
  const accessExpiresIn = config.jwt.accessExpiresIn as SignOptions['expiresIn'];
  return jwt.sign(payload, config.jwt.accessSecret, {
    expiresIn: accessExpiresIn,
  });
};

export const signRefreshToken = (payload: TokenPayload): string => {
  const refreshExpiresIn = `${config.jwt.refreshExpiresDays}d` as SignOptions['expiresIn'];
  return jwt.sign(payload, config.jwt.refreshSecret, {
    expiresIn: refreshExpiresIn,
  });
};

export const verifyAccessToken = (token: string): TokenPayload => {
  try {
    return jwt.verify(token, config.jwt.accessSecret) as TokenPayload;
  } catch (error) {
    throw new Error('Invalid or expired access token');
  }
};

export const verifyRefreshToken = (token: string): TokenPayload => {
  try {
    return jwt.verify(token, config.jwt.refreshSecret) as TokenPayload;
  } catch (error) {
    throw new Error('Invalid or expired refresh token');
  }
};

export const hashToken = (token: string): string => {
  return crypto.createHash('sha256').update(token).digest('hex');
};
