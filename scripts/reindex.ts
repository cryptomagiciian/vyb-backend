import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

async function main() {
  console.log('🔄 Starting reindexing process...');

  try {
    // Clear existing caches
    console.log('Clearing existing caches...');
    const feedKeys = await redis.keys('feed:*');
    const marketKeys = await redis.keys('market:*');
    
    if (feedKeys.length > 0) {
      await redis.del(...feedKeys);
      console.log(`✅ Cleared ${feedKeys.length} feed cache keys`);
    }
    
    if (marketKeys.length > 0) {
      await redis.del(...marketKeys);
      console.log(`✅ Cleared ${marketKeys.length} market cache keys`);
    }

    // Get all eligible markets
    console.log('Fetching eligible markets...');
    const markets = await prisma.marketItem.findMany({
      where: {
        eligible: true,
        endDate: { gt: new Date() },
      },
      orderBy: { updatedAt: 'desc' },
    });

    console.log(`Found ${markets.length} eligible markets`);

    // Calculate scores and rebuild rankings
    console.log('Calculating scores and rebuilding rankings...');
    const scoredMarkets = markets.map(market => {
      const score = calculateScore(market);
      return { ...market, confidence: score };
    });

    // Update confidence scores in database
    console.log('Updating confidence scores in database...');
    for (const market of scoredMarkets) {
      await prisma.marketItem.update({
        where: { id: market.id },
        data: { confidence: market.confidence },
      });
    }

    // Build top-K cache
    console.log('Building top-K cache...');
    const topK = 1000;
    const topMarkets = scoredMarkets
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, topK);

    // Store in Redis sorted set
    const cacheKey = 'feed:top:default';
    for (const market of topMarkets) {
      await redis.zadd(cacheKey, market.confidence, market.id);
    }

    // Set cache expiry (1 hour)
    await redis.expire(cacheKey, 3600);

    console.log(`✅ Built top-K cache with ${topMarkets.length} markets`);

    // Apply diversity sampling
    console.log('Applying diversity sampling...');
    const sampledMarkets = applyDiversitySampling(topMarkets);
    
    // Store diversity cache
    const diversityKey = 'feed:diversity:default';
    for (let i = 0; i < sampledMarkets.length; i++) {
      await redis.zadd(diversityKey, i, sampledMarkets[i].id);
    }

    await redis.expire(diversityKey, 1800); // 30 minutes

    console.log(`✅ Applied diversity sampling: ${sampledMarkets.length} markets sampled`);

    // Cache market details
    console.log('Caching market details...');
    let cachedCount = 0;
    for (const market of topMarkets.slice(0, 100)) { // Cache top 100 markets
      const marketData = {
        id: market.id,
        source: market.source,
        externalId: market.externalId,
        question: market.question,
        yesPrice: market.yesPrice,
        noPrice: market.noPrice,
        volume: market.volume,
        liquidity: market.liquidity,
        endDate: market.endDate.toISOString(),
        lastChange24h: market.lastChange24h,
        trendScore: market.trendScore,
        confidence: market.confidence,
        insight: market.insight,
        tags: market.tags,
        exchanges: market.exchanges,
        outcome: market.outcome,
        eligible: market.eligible,
        createdAt: market.createdAt.toISOString(),
        updatedAt: market.updatedAt.toISOString(),
      };

      await redis.setex(`market:${market.id}`, 1800, JSON.stringify(marketData)); // 30 minutes
      cachedCount++;
    }

    console.log(`✅ Cached ${cachedCount} market details`);

    // Generate summary statistics
    const stats = {
      totalMarkets: markets.length,
      topMarkets: topMarkets.length,
      sampledMarkets: sampledMarkets.length,
      averageConfidence: topMarkets.reduce((sum, m) => sum + m.confidence, 0) / topMarkets.length,
      diversityScore: sampledMarkets.length / topMarkets.length,
    };

    console.log('📊 Reindexing Summary:');
    console.log(`   Total markets: ${stats.totalMarkets}`);
    console.log(`   Top markets: ${stats.topMarkets}`);
    console.log(`   Sampled markets: ${stats.sampledMarkets}`);
    console.log(`   Average confidence: ${stats.averageConfidence.toFixed(3)}`);
    console.log(`   Diversity score: ${stats.diversityScore.toFixed(3)}`);

    console.log('🎉 Reindexing completed successfully!');

  } catch (error) {
    console.error('❌ Reindexing failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await redis.disconnect();
  }
}

function calculateScore(market: any): number {
  const {
    volume,
    lastChange24h,
    endDate,
    liquidity,
    trendScore = 0,
  } = market;

  // Normalized volume (log scale, capped at 1)
  const normalizedVolume = Math.min(1, Math.log10(volume + 1) / 6);

  // Volatility score (price change in last 24h)
  const volatilityScore = Math.min(1, Math.abs(lastChange24h || 0) / 20);

  // Time urgency (exponential decay based on days to end)
  const daysToEnd = (new Date(endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  const timeUrgency = Math.exp(-daysToEnd / 30);

  // Liquidity score (sigmoid function)
  const liquidityScore = liquidity 
    ? 1 / (1 + Math.exp(-0.0005 * (liquidity - 10000)))
    : 0;

  // Raw score calculation
  const rawScore = 
    0.35 * normalizedVolume +
    0.25 * volatilityScore +
    0.20 * timeUrgency +
    0.15 * liquidityScore +
    0.05 * trendScore;

  return Math.max(0, Math.min(1, rawScore));
}

function applyDiversitySampling(markets: any[]): any[] {
  const sampled: any[] = [];
  const usedTags = new Set<string>();

  for (const market of markets) {
    const primaryTag = market.tags[0] || 'general';
    
    if (!usedTags.has(primaryTag) || sampled.length < 5) {
      sampled.push(market);
      usedTags.add(primaryTag);
      
      // Reset tag tracking every 5 markets
      if (sampled.length % 5 === 0) {
        usedTags.clear();
      }
    }
  }

  return sampled;
}

main();
