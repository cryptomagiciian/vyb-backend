import { Controller, Get, Put, Body, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserUpdateDto, UserHistoryRequestDto } from '../common/schemas/user.schemas';

@ApiTags('users')
@Controller('user')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'Profile retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getProfile(@Request() req) {
    const profile = await this.usersService.getUserProfile(req.user.sub);
    
    return {
      success: true,
      profile,
    };
  }

  @Put('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update user profile' })
  @ApiResponse({ status: 200, description: 'Profile updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid update data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async updateProfile(
    @Body() updateData: UserUpdateDto,
    @Request() req,
  ) {
    const profile = await this.usersService.updateUserProfile(req.user.sub, updateData);
    
    return {
      success: true,
      profile,
    };
  }

  @Get('stats')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get user statistics' })
  @ApiResponse({ status: 200, description: 'Stats retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getStats(@Request() req) {
    const stats = await this.usersService.getUserStats(req.user.sub);
    
    return {
      success: true,
      stats,
    };
  }

  @Get('history')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get user swipe history' })
  @ApiResponse({ status: 200, description: 'History retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getHistory(
    @Query() query: UserHistoryRequestDto,
    @Request() req,
  ) {
    const history = await this.usersService.getUserSwipeHistory(req.user.sub, query);
    
    return {
      success: true,
      ...history,
    };
  }

  @Get('leaderboard')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get user leaderboard position' })
  @ApiResponse({ status: 200, description: 'Leaderboard position retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getLeaderboardPosition(@Request() req) {
    const position = await this.usersService.getUserLeaderboardPosition(req.user.sub);
    
    return {
      success: true,
      position,
    };
  }

  @Get('activity')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get user activity summary' })
  @ApiResponse({ status: 200, description: 'Activity summary retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getActivitySummary(
    @Query('days') days: number = 30,
    @Request() req,
  ) {
    const activity = await this.usersService.getUserActivitySummary(req.user.sub, days);
    
    return {
      success: true,
      activity,
    };
  }

  @Get('leaderboard/global')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get global leaderboard' })
  @ApiResponse({ status: 200, description: 'Leaderboard retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getGlobalLeaderboard(
    @Query('type') type: 'xp' | 'streak' | 'accuracy' = 'xp',
    @Query('limit') limit: number = 100,
  ) {
    const leaderboard = await this.usersService.getLeaderboard(type, limit);
    
    return {
      success: true,
      type,
      leaderboard,
    };
  }
}
