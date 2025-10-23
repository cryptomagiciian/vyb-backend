import { Controller, Post, Get, Body, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { SwipesService } from './swipes.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RateLimitService } from '../common/rate-limit/rate-limit.service';
import { SwipeRequestDto } from '../common/schemas/feed.schemas';

@ApiTags('swipes')
@Controller('swipe')
export class SwipesController {
  constructor(
    private swipesService: SwipesService,
    private rateLimitService: RateLimitService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Record a user swipe on a market' })
  @ApiResponse({ status: 200, description: 'Swipe recorded successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request or market not found' })
  @ApiResponse({ status: 409, description: 'User already swiped on this market' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async recordSwipe(
    @Body() request: SwipeRequestDto,
    @Request() req,
  ) {
    // Rate limiting
    const rateLimitKey = this.rateLimitService.generateKey(req, req.user.sub);
    const isAllowed = await this.rateLimitService.checkRateLimit(
      rateLimitKey,
      RateLimitService.CONFIGS.SWIPE,
    );

    if (!isAllowed) {
      throw new Error('Rate limit exceeded');
    }

    const result = await this.swipesService.recordSwipe(request, req.user.sub);
    
    return {
      success: true,
      ...result,
    };
  }

  @Get('history')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get user swipe history' })
  @ApiResponse({ status: 200, description: 'Swipe history retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of swipes to return (1-100)', type: Number })
  @ApiQuery({ name: 'cursor', required: false, description: 'Pagination cursor' })
  async getSwipeHistory(
    @Request() req,
    @Query('limit') limit: number = 50,
    @Query('cursor') cursor?: string,
  ) {
    const result = await this.swipesService.getUserSwipeHistory(
      req.user.sub,
      { limit: Math.min(limit, 100), cursor },
    );
    
    return {
      success: true,
      ...result,
    };
  }

  @Get('streak')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get user current streak' })
  @ApiResponse({ status: 200, description: 'Streak retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getStreak(@Request() req) {
    const streak = await this.swipesService.getUserStreak(req.user.sub);
    
    return {
      success: true,
      streak,
    };
  }

  @Get('market/:id/stats')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get swipe statistics for a market' })
  @ApiResponse({ status: 200, description: 'Market stats retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getMarketStats(@Request() req, @Query('id') marketId: string) {
    const stats = await this.swipesService.getMarketSwipeStats(marketId);
    
    return {
      success: true,
      marketId,
      stats,
    };
  }

  @Get('accuracy')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get user prediction accuracy' })
  @ApiResponse({ status: 200, description: 'Accuracy retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getAccuracy(@Request() req) {
    const accuracy = await this.swipesService.getUserAccuracy(req.user.sub);
    
    return {
      success: true,
      accuracy,
    };
  }
}
