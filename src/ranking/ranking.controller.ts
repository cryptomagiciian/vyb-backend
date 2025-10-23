import { Controller, Post, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { RankingService } from './ranking.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';

@ApiTags('ranking')
@Controller('ranking')
export class RankingController {
  constructor(private rankingService: RankingService) {}

  @Post('rebuild')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Trigger ranking rebuild (Admin only)' })
  @ApiResponse({ status: 200, description: 'Ranking rebuild triggered' })
  async rebuildRankings(
    @Query('segment') segment: string = 'default',
    @Query('force') force: boolean = false,
  ) {
    await this.rankingService.triggerRankingRebuild(segment, force);
    return {
      success: true,
      message: 'Ranking rebuild triggered',
      segment,
      force,
    };
  }

  @Get('stats')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get ranking statistics (Admin only)' })
  @ApiResponse({ status: 200, description: 'Ranking statistics' })
  async getRankingStats(@Query('segment') segment: string = 'default') {
    const stats = await this.rankingService.getRankingStats(segment);
    return {
      success: true,
      segment,
      stats,
    };
  }
}
