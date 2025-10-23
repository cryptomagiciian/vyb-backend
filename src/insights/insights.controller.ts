import { Controller, Post, Get, Body, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { InsightsService } from './insights.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';

@ApiTags('insights')
@Controller('insights')
export class InsightsController {
  constructor(private insightsService: InsightsService) {}

  @Post('generate')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Generate insight for a market (Admin only)' })
  @ApiResponse({ status: 200, description: 'Insight generated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  async generateInsight(
    @Body() body: { marketId: string; language?: string; force?: boolean },
  ) {
    const { marketId, language = 'en', force = false } = body;
    
    const insight = await this.insightsService.generateInsight(marketId, language, force);
    
    return {
      success: true,
      marketId,
      insight,
    };
  }

  @Post('batch')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Generate insights for multiple markets (Admin only)' })
  @ApiResponse({ status: 200, description: 'Batch insight generation started' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  async generateBatchInsights(
    @Body() body: { marketIds: string[]; language?: string },
  ) {
    const { marketIds, language = 'en' } = body;
    
    await this.insightsService.queueBatchInsightGeneration(marketIds, language);
    
    return {
      success: true,
      message: 'Batch insight generation queued',
      marketCount: marketIds.length,
    };
  }

  @Get('stats')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get insight generation statistics (Admin only)' })
  @ApiResponse({ status: 200, description: 'Statistics retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  async getInsightStats() {
    const stats = await this.insightsService.getInsightStats();
    
    return {
      success: true,
      stats,
    };
  }
}
