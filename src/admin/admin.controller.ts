import { Controller, Get, Post, Put, Delete, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';

@ApiTags('admin')
@Controller('admin')
export class AdminController {
  constructor(private adminService: AdminService) {}

  @Get('health')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get comprehensive system health status (Admin only)' })
  @ApiResponse({ status: 200, description: 'Health status retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  async getHealth() {
    const health = await this.adminService.getHealthStatus();
    
    return {
      success: true,
      health,
    };
  }

  @Post('reindex')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Trigger system reindexing (Admin only)' })
  @ApiResponse({ status: 200, description: 'Reindexing triggered successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  async triggerReindex(
    @Query('segment') segment: string = 'default',
    @Query('force') force: boolean = false,
  ) {
    const result = await this.adminService.triggerReindex(segment, force);
    
    return {
      success: true,
      ...result,
    };
  }

  @Get('flags')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all feature flags (Admin only)' })
  @ApiResponse({ status: 200, description: 'Feature flags retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  async getFeatureFlags() {
    const flags = await this.adminService.getFeatureFlags();
    
    return {
      success: true,
      flags,
    };
  }

  @Put('flags/:key')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update feature flag (Admin only)' })
  @ApiResponse({ status: 200, description: 'Feature flag updated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  async updateFeatureFlag(
    @Query('key') key: string,
    @Body() body: { enabled: boolean; payload?: any },
  ) {
    const { enabled, payload } = body;
    const result = await this.adminService.updateFeatureFlag(key, enabled, payload);
    
    return {
      success: true,
      ...result,
    };
  }

  @Delete('flags/:key')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete feature flag (Admin only)' })
  @ApiResponse({ status: 200, description: 'Feature flag deleted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  async deleteFeatureFlag(@Query('key') key: string) {
    const result = await this.adminService.deleteFeatureFlag(key);
    
    return {
      success: true,
      ...result,
    };
  }

  @Get('metrics')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get system metrics (Admin only)' })
  @ApiResponse({ status: 200, description: 'Metrics retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  async getSystemMetrics() {
    const metrics = await this.adminService.getSystemMetrics();
    
    return {
      success: true,
      metrics,
    };
  }

  @Post('cache/clear')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Clear system cache (Admin only)' })
  @ApiResponse({ status: 200, description: 'Cache cleared successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  async clearCache(@Query('type') type: 'feed' | 'market' | 'all' = 'all') {
    const result = await this.adminService.clearCache(type);
    
    return {
      success: true,
      ...result,
    };
  }
}
