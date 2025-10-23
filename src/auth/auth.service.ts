import { Injectable, Logger, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { MagicLinkRequestDto, MagicLinkVerifyDto, WalletVerifyDto } from '../common/dto/market.dto';
import * as crypto from 'crypto';
import { Resend } from 'resend';
import { ethers } from 'ethers';
import { SiweMessage } from 'siwe';

export interface JwtPayload {
  sub: string; // user ID
  email?: string;
  wallet?: string;
  role: string;
  iat?: number;
  exp?: number;
}

export interface AuthResult {
  user: {
    id: string;
    handle: string;
    email?: string;
    wallet?: string;
    role: string;
    avatarUrl?: string;
  };
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly resend: Resend;

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {
    // Initialize Resend email service
    const resendApiKey = this.configService.get('RESEND_API_KEY');
    if (resendApiKey) {
      this.resend = new Resend(resendApiKey);
    }
  }

  /**
   * Send magic link for email authentication
   */
  async sendMagicLink(data: MagicLinkRequestDto): Promise<{ success: boolean; message: string }> {
    const email = data.email;

    try {
      // Check rate limiting
      const rateLimitKey = `magic_link:${email}`;
      const isAllowed = await this.redis.checkRateLimit(rateLimitKey, {
        windowMs: 5 * 60 * 1000, // 5 minutes
        maxRequests: 3,
      });

      if (!isAllowed) {
        throw new BadRequestException('Too many magic link requests. Please try again later.');
      }

      // Generate secure token
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

      // Store token in Redis
      await this.redis.setJson(`magic_link:${token}`, {
        email,
        expiresAt: expiresAt.toISOString(),
      }, 15 * 60); // 15 minutes TTL

      // Send email via Resend
      const magicLink = `${this.configService.get('CORS_ORIGIN', 'http://localhost:3000')}/auth/verify?token=${token}`;
      
      await this.resend.emails.send({
        from: this.configService.get('EMAIL_FROM', 'noreply@vyb.app'),
        to: [email],
        subject: 'Sign in to VYB',
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #00ff88; font-size: 32px; margin: 0;">VYB</h1>
              <p style="color: #666; margin: 10px 0;">Swipe. Predict. Win.</p>
            </div>
            
            <div style="background: #1a1a1a; border-radius: 12px; padding: 30px; text-align: center;">
              <h2 style="color: #fff; margin-bottom: 20px;">Sign in to VYB</h2>
              <p style="color: #ccc; margin-bottom: 30px;">Click the button below to access your prediction market feed:</p>
              
              <a href="${magicLink}" style="display: inline-block; padding: 16px 32px; background: linear-gradient(135deg, #00ff88, #00cc6a); color: #000; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; transition: transform 0.2s;">
                🚀 Sign In to VYB
              </a>
              
              <p style="color: #888; font-size: 14px; margin-top: 30px;">This link expires in 15 minutes.</p>
              <p style="color: #888; font-size: 14px;">If you didn't request this, please ignore this email.</p>
            </div>
            
            <div style="text-align: center; margin-top: 30px; color: #666; font-size: 12px;">
              <p>VYB - Real-time prediction market discovery</p>
            </div>
          </div>
        `,
      });

      this.logger.log(`Magic link sent to ${email}`);
      return {
        success: true,
        message: 'Magic link sent to your email',
      };
    } catch (error) {
      this.logger.error(`Failed to send magic link to ${email}:`, error);
      throw error;
    }
  }

  /**
   * Verify magic link token
   */
  async verifyMagicLink(data: MagicLinkVerifyDto): Promise<AuthResult> {
    const token = data.token;

    try {
      // Get token data from Redis
      const tokenData = await this.redis.getJson<{ email: string; expiresAt: string }>(`magic_link:${token}`);
      
      if (!tokenData) {
        throw new UnauthorizedException('Invalid or expired magic link');
      }

      if (new Date(tokenData.expiresAt) < new Date()) {
        throw new UnauthorizedException('Magic link has expired');
      }

      const { email } = tokenData;

      // Find or create user
      let user = await this.prisma.user.findUnique({
        where: { email },
      });

      if (!user) {
        // Create new user with unique handle
        const handle = await this.generateUniqueHandle(email);
        user = await this.prisma.user.create({
          data: {
            email,
            handle,
            role: 'USER',
          },
        });

        // Create user stats
        await this.prisma.userStats.create({
          data: {
            userId: user.id,
          },
        });
      }

      // Delete used token
      await this.redis.del(`magic_link:${token}`);

      // Generate tokens
      const tokens = await this.generateTokens(user);

      this.logger.log(`User ${user.id} authenticated via magic link`);
      return tokens;
    } catch (error) {
      this.logger.error('Magic link verification failed:', error);
      throw error;
    }
  }

  /**
   * Generate wallet challenge for SIWS authentication
   */
  async generateWalletChallenge(wallet: string): Promise<{ message: string; nonce: string }> {
    try {
      const nonce = crypto.randomBytes(16).toString('hex');
      const domain = this.configService.get('DOMAIN', 'vyb.app');
      const origin = this.configService.get('FRONTEND_URL', 'http://localhost:3000');

      const message = new SiweMessage({
        domain,
        address: wallet,
        statement: 'Sign in to VYB',
        uri: origin,
        version: '1',
        nonce,
        chainId: 1, // Ethereum mainnet
      });

      const messageString = message.prepareMessage();

      // Store nonce for verification
      await this.redis.set(`wallet_challenge:${nonce}`, wallet, 300); // 5 minutes

      return {
        message: messageString,
        nonce,
      };
    } catch (error) {
      this.logger.error(`Failed to generate wallet challenge for ${wallet}:`, error);
      throw error;
    }
  }

  /**
   * Verify wallet signature
   */
  async verifyWalletSignature(data: WalletVerifyDto): Promise<AuthResult> {
    const wallet = data.wallet;
    const signature = data.signature;
    const message = data.message;

    try {
      // Verify signature
      const siweMessage = new SiweMessage(message);
      const fields = await siweMessage.validate(signature);

      if (fields.address.toLowerCase() !== wallet.toLowerCase()) {
        throw new UnauthorizedException('Invalid signature');
      }

      // Check nonce
      const storedWallet = await this.redis.get(`wallet_challenge:${fields.nonce}`);
      if (!storedWallet || storedWallet.toLowerCase() !== wallet.toLowerCase()) {
        throw new UnauthorizedException('Invalid or expired challenge');
      }

      // Clean up nonce
      await this.redis.del(`wallet_challenge:${fields.nonce}`);

      // Find or create user
      let user = await this.prisma.user.findUnique({
        where: { wallet },
      });

      if (!user) {
        // Create new user with unique handle
        const handle = await this.generateUniqueHandle(wallet);
        user = await this.prisma.user.create({
          data: {
            wallet,
            handle,
            role: 'USER',
          },
        });

        // Create user stats
        await this.prisma.userStats.create({
          data: {
            userId: user.id,
          },
        });
      }

      // Generate tokens
      const tokens = await this.generateTokens(user);

      this.logger.log(`User ${user.id} authenticated via wallet`);
      return tokens;
    } catch (error) {
      this.logger.error('Wallet signature verification failed:', error);
      throw error;
    }
  }

  /**
   * Generate JWT tokens
   */
  private async generateTokens(user: any): Promise<AuthResult> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      wallet: user.wallet,
      role: user.role,
    };

    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(payload, { expiresIn: '30d' });

    // Store refresh token in Redis
    await this.redis.set(`refresh_token:${user.id}`, refreshToken, 30 * 24 * 60 * 60); // 30 days

    return {
      user: {
        id: user.id,
        handle: user.handle,
        email: user.email,
        wallet: user.wallet,
        role: user.role,
        avatarUrl: user.avatarUrl,
      },
      accessToken,
      refreshToken,
    };
  }

  /**
   * Generate unique handle
   */
  private async generateUniqueHandle(identifier: string): Promise<string> {
    const base = identifier.split('@')[0] || identifier.slice(0, 8);
    let handle = base.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    if (handle.length < 3) {
      handle = `user${handle}`;
    }

    let counter = 1;
    let finalHandle = handle;

    while (await this.prisma.user.findUnique({ where: { handle: finalHandle } })) {
      finalHandle = `${handle}${counter}`;
      counter++;
    }

    return finalHandle;
  }

  /**
   * Validate JWT token
   */
  async validateToken(token: string): Promise<JwtPayload> {
    try {
      return this.jwtService.verify(token);
    } catch (error) {
      throw new UnauthorizedException('Invalid token');
    }
  }

  /**
   * Get user by ID
   */
  async getUserById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: { stats: true },
    });
  }

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken: string): Promise<{ accessToken: string }> {
    try {
      const payload = this.jwtService.verify(refreshToken);
      
      // Verify refresh token is stored in Redis
      const storedToken = await this.redis.get(`refresh_token:${payload.sub}`);
      if (storedToken !== refreshToken) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      // Generate new access token
      const newPayload: JwtPayload = {
        sub: payload.sub,
        email: payload.email,
        wallet: payload.wallet,
        role: payload.role,
      };

      const accessToken = this.jwtService.sign(newPayload);

      return { accessToken };
    } catch (error) {
      this.logger.error('Token refresh failed:', error);
      throw new UnauthorizedException('Invalid refresh token');
    }
  }
}
