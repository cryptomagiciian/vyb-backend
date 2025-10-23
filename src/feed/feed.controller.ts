import { Controller, Get, Post, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { FeedService } from './feed.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RateLimitService } from '../common/rate-limit/rate-limit.service';
import { ConnectorsService } from '../connectors/connectors.service';
import { FeedRequestDto } from '../common/schemas/feed.schemas';

@ApiTags('feed')
@Controller('feed')
export class FeedController {
  constructor(
    private feedService: FeedService,
    private rateLimitService: RateLimitService,
    private connectorsService: ConnectorsService,
  ) {}

  @Get('next')
  @ApiOperation({ summary: 'Get next batch of markets for the feed (public)' })
  @ApiResponse({ status: 200, description: 'Markets retrieved successfully' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  @ApiQuery({ name: 'cursor', required: false, description: 'Pagination cursor' })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of markets to return (1-20)', type: Number })
  @ApiQuery({ name: 'tags', required: false, description: 'Filter by tags' })
  async getNextMarkets(
    @Query() query: FeedRequestDto,
    @Request() req,
  ) {
    // Rate limiting (less strict for public access)
    const rateLimitKey = this.rateLimitService.generateKey(req, 'anonymous');
    const isAllowed = await this.rateLimitService.checkRateLimit(
      rateLimitKey,
      { ...RateLimitService.CONFIGS.FEED, maxRequests: 200 }, // More lenient for public
    );

    if (!isAllowed) {
      throw new Error('Rate limit exceeded');
    }

    // Allow unauthenticated access to feed
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
  @ApiOperation({ summary: 'Get feed statistics (public)' })
  @ApiResponse({ status: 200, description: 'Statistics retrieved successfully' })
  async getFeedStats() {
    const stats = await this.feedService.getFeedStats();
    
    return {
      success: true,
      stats,
    };
  }

  @Post('test-ingest')
  @ApiOperation({ summary: 'Test market data ingestion (public - for testing)' })
  @ApiResponse({ status: 200, description: 'Ingestion test completed' })
  async testIngestion() {
    try {
      const results = await this.connectorsService.fetchAndStoreMarkets();
      
      return {
        success: true,
        message: 'Test ingestion completed',
        results,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Test ingestion failed',
        error: error.message,
      };
    }
  }

}
