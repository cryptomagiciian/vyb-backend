import { Controller, Post, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ResolutionService } from './resolution.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';

@ApiTags('resolution')
@Controller('resolution')
export class ResolutionController {
  constructor(private resolutionService: ResolutionService) {}

  @Post('check-outcomes')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Check outcomes for markets (Admin only)' })
  @ApiResponse({ status: 200, description: 'Outcome check completed' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  async checkOutcomes(
    @Query('marketId') marketId?: string,
    @Query('source') source?: 'polymarket' | 'kalshi',
    @Query('force') force: boolean = false,
  ) {
    const results = await this.resolutionService.checkOutcomes(marketId, source, force);
    
    return {
      success: true,
      results,
    };
  }

  @Post('process-payouts')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Process payouts for resolved markets (Admin only)' })
  @ApiResponse({ status: 200, description: 'Payout processing completed' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  async processPayouts(
    @Query('userId') userId?: string,
    @Query('marketId') marketId?: string,
  ) {
    const results = await this.resolutionService.processPayouts(userId, marketId);
    
    return {
      success: true,
      results,
    };
  }

  @Get('stats')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get resolution statistics (Admin only)' })
  @ApiResponse({ status: 200, description: 'Statistics retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  async getResolutionStats() {
    const stats = await this.resolutionService.getResolutionStats();
    
    return {
      success: true,
      stats,
    };
  }
}
