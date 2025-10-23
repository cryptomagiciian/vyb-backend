import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { FeedService } from './feed.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RateLimitService } from '../common/rate-limit/rate-limit.service';
import { FeedRequestDto } from '../common/schemas/feed.schemas';

@ApiTags('feed')
@Controller('feed')
export class FeedController {
  constructor(
    private feedService: FeedService,
    private rateLimitService: RateLimitService,
  ) {}

  @Get('next')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get next batch of markets for the feed' })
  @ApiResponse({ status: 200, description: 'Markets retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  @ApiQuery({ name: 'cursor', required: false, description: 'Pagination cursor' })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of markets to return (1-20)', type: Number })
  @ApiQuery({ name: 'segment', required: false, description: 'Feed segment (default, crypto, politics, etc.)' })
  async getNextMarkets(
    @Query() query: FeedRequestDto,
    @Request() req,
  ) {
    // Rate limiting
    const rateLimitKey = this.rateLimitService.generateKey(req, req.user?.sub);
    const isAllowed = await this.rateLimitService.checkRateLimit(
      rateLimitKey,
      RateLimitService.CONFIGS.FEED,
    );

    if (!isAllowed) {
      throw new Error('Rate limit exceeded');
    }

    const result = await this.feedService.getNextMarkets(query, req.user?.sub);
    
    return {
      success: true,
      ...result,
    };
  }

  @Get('market/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a specific market by ID' })
  @ApiResponse({ status: 200, description: 'Market retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Market not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getMarket(@Request() req, @Query('id') id: string) {
    const market = await this.feedService.getMarketById(id);
    
    if (!market) {
      throw new Error('Market not found');
    }

    return {
      success: true,
      market,
    };
  }

  @Get('stats')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get feed statistics' })
  @ApiResponse({ status: 200, description: 'Statistics retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiQuery({ name: 'segment', required: false, description: 'Feed segment' })
  async getFeedStats(@Query('segment') segment: string = 'default') {
    const stats = await this.feedService.getFeedStats(segment);
    
    return {
      success: true,
      segment,
      stats,
    };
  }
}
