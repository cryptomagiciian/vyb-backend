import { z } from 'zod';

export const MagicLinkRequestSchema = z.object({
  email: z.string().email('Invalid email address'),
});

export const MagicLinkVerifySchema = z.object({
  token: z.string().min(1, 'Token is required'),
});

export const WalletChallengeSchema = z.object({
  wallet: z.string().min(1, 'Wallet address is required'),
});

export const WalletVerifySchema = z.object({
  wallet: z.string().min(1, 'Wallet address is required'),
  signature: z.string().min(1, 'Signature is required'),
  message: z.string().min(1, 'Message is required'),
});

export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export type MagicLinkRequestDto = z.infer<typeof MagicLinkRequestSchema>;
export type MagicLinkVerifyDto = z.infer<typeof MagicLinkVerifySchema>;
export type WalletChallengeDto = z.infer<typeof WalletChallengeSchema>;
export type WalletVerifyDto = z.infer<typeof WalletVerifySchema>;
export type RefreshTokenDto = z.infer<typeof RefreshTokenSchema>;
