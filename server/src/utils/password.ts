import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 10;

export const hashPassword = async (password: string): Promise<string> => {
  return bcrypt.hash(password, SALT_ROUNDS);
};

export const comparePassword = async (
  password: string,
  hash: string
): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};

export const generateResetCode = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

export const hashResetCode = async (code: string): Promise<string> => {
  return bcrypt.hash(code, 10);
};

export const compareResetCode = async (
  code: string,
  hash: string
): Promise<boolean> => {
  return bcrypt.compare(code, hash);
};
