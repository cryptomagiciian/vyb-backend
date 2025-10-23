import { describe, it, expect, beforeEach } from 'vitest';
import { RankingService } from '../../src/ranking/ranking.service';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { RedisService } from '../../src/common/redis/redis.service';

// Mock dependencies
const mockPrisma = {
  executeTransaction: vi.fn(),
  marketItem: {
    findMany: vi.fn(),
    update: vi.fn(),
  },
} as any;

const mockRedis = {
  del: vi.fn(),
  zadd: vi.fn(),
  expire: vi.fn(),
  zrevrange: vi.fn(),
  zrange: vi.fn(),
  exists: vi.fn(),
  zcard: vi.fn(),
} as any;

const mockQueue = {
  add: vi.fn(),
} as any;

describe('RankingService', () => {
  let rankingService: RankingService;

  beforeEach(() => {
    vi.clearAllMocks();
    rankingService = new RankingService(mockPrisma, mockRedis, mockQueue);
  });

  describe('calculateScore', () => {
    it('should calculate score correctly for a high-volume market', () => {
      const market = {
        volume: 1000000,
        lastChange24h: 10,
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
        liquidity: 50000,
        trendScore: 0.8,
      };

      const score = rankingService.calculateScore(market);
      
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('should handle markets with missing optional fields', () => {
      const market = {
        volume: 1000,
        lastChange24h: null,
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
        liquidity: null,
        trendScore: 0,
      };

      const score = rankingService.calculateScore(market);
      
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('should give higher scores to markets ending soon', () => {
      const marketSoon = {
        volume: 1000,
        lastChange24h: 0,
        endDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000), // 1 day from now
        liquidity: 10000,
        trendScore: 0,
      };

      const marketLater = {
        volume: 1000,
        lastChange24h: 0,
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
        liquidity: 10000,
        trendScore: 0,
      };

      const scoreSoon = rankingService.calculateScore(marketSoon);
      const scoreLater = rankingService.calculateScore(marketLater);
      
      expect(scoreSoon).toBeGreaterThan(scoreLater);
    });
  });

  describe('getTopMarkets', () => {
    it('should return markets from diversity cache if available', async () => {
      const mockMarketIds = ['market1', 'market2', 'market3'];
      mockRedis.exists.mockResolvedValue(1);
      mockRedis.zrange.mockResolvedValue(mockMarketIds);

      const result = await rankingService.getTopMarkets('default', 5);
      
      expect(result).toEqual(mockMarketIds);
      expect(mockRedis.exists).toHaveBeenCalledWith('feed:diversity:default');
      expect(mockRedis.zrange).toHaveBeenCalledWith('feed:diversity:default', 0, 4);
    });

    it('should fallback to top markets if diversity cache is empty', async () => {
      const mockMarketIds = ['market1', 'market2'];
      mockRedis.exists.mockResolvedValue(0);
      mockRedis.zrevrange.mockResolvedValue(mockMarketIds);

      const result = await rankingService.getTopMarkets('default', 5);
      
      expect(result).toEqual(mockMarketIds);
      expect(mockRedis.zrevrange).toHaveBeenCalledWith('feed:top:default', 0, 4);
    });

    it('should return empty array on error', async () => {
      mockRedis.exists.mockRejectedValue(new Error('Redis error'));

      const result = await rankingService.getTopMarkets('default', 5);
      
      expect(result).toEqual([]);
    });
  });

  describe('triggerRankingRebuild', () => {
    it('should add ranking job to queue', async () => {
      await rankingService.triggerRankingRebuild('default', false);
      
      expect(mockQueue.add).toHaveBeenCalledWith('score', {
        segment: 'default',
        force: false,
      }, {
        delay: 1000,
        removeOnComplete: 10,
        removeOnFail: 5,
      });
    });
  });
});
