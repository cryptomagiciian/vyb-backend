import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ExchangesService } from './exchanges.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('exchanges')
@Controller('exchanges')
export class ExchangesController {
  constructor(private exchangesService: ExchangesService) {}

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get exchanges for a market' })
  @ApiResponse({ status: 200, description: 'Exchanges retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Market not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getMarketExchanges(
    @Query('id') marketId: string,
    @Request() req,
  ) {
    const result = await this.exchangesService.getMarketExchanges(
      marketId,
      req.user?.sub,
    );
    
    return {
      success: true,
      ...result,
    };
  }

  @Get('stats')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get exchange statistics' })
  @ApiResponse({ status: 200, description: 'Statistics retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getExchangeStats() {
    const stats = await this.exchangesService.getExchangeStats();
    
    return {
      success: true,
      stats,
    };
  }
}
