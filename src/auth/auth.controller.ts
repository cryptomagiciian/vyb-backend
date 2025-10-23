import { Controller, Post, Body, Get, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { MagicLinkRequestDto, MagicLinkVerifyDto, WalletChallengeDto, WalletVerifyDto, RefreshTokenDto } from '../common/schemas/auth.schemas';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('magic-link')
  @ApiOperation({ summary: 'Request magic link for email authentication' })
  @ApiResponse({ status: 200, description: 'Magic link sent successfully' })
  @ApiResponse({ status: 400, description: 'Invalid email or rate limited' })
  async sendMagicLink(@Body() data: MagicLinkRequestDto) {
    return this.authService.sendMagicLink(data);
  }

  @Post('magic-link/verify')
  @ApiOperation({ summary: 'Verify magic link token' })
  @ApiResponse({ status: 200, description: 'Authentication successful' })
  @ApiResponse({ status: 401, description: 'Invalid or expired token' })
  async verifyMagicLink(@Body() data: MagicLinkVerifyDto) {
    return this.authService.verifyMagicLink(data);
  }

  @Post('wallet/challenge')
  @ApiOperation({ summary: 'Generate wallet challenge for SIWS authentication' })
  @ApiResponse({ status: 200, description: 'Challenge generated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid wallet address' })
  async generateWalletChallenge(@Body() data: WalletChallengeDto) {
    return this.authService.generateWalletChallenge(data.wallet);
  }

  @Post('wallet/verify')
  @ApiOperation({ summary: 'Verify wallet signature' })
  @ApiResponse({ status: 200, description: 'Authentication successful' })
  @ApiResponse({ status: 401, description: 'Invalid signature' })
  async verifyWalletSignature(@Body() data: WalletVerifyDto) {
    return this.authService.verifyWalletSignature(data);
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({ status: 200, description: 'Token refreshed successfully' })
  @ApiResponse({ status: 401, description: 'Invalid refresh token' })
  async refreshToken(@Body() data: RefreshTokenDto) {
    return this.authService.refreshToken(data.refreshToken);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'User profile retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getMe(@Request() req) {
    const user = await this.authService.getUserById(req.user.sub);
    return {
      success: true,
      user: {
        id: user.id,
        handle: user.handle,
        email: user.email,
        wallet: user.wallet,
        role: user.role,
        avatarUrl: user.avatarUrl,
        region: user.region,
        createdAt: user.createdAt,
        stats: user.stats,
      },
    };
  }
}
