import { PrismaClient } from '@prisma/client';
import { faker } from '@faker-js/faker';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // Create test users
  console.log('Creating test users...');
  const users = [];
  for (let i = 0; i < 50; i++) {
    const user = await prisma.user.create({
      data: {
        handle: faker.internet.userName(),
        email: faker.internet.email(),
        role: i === 0 ? 'ADMIN' : 'USER',
        avatarUrl: faker.image.avatar(),
        region: faker.location.countryCode(),
      },
    });
    users.push(user);

    // Create user stats
    await prisma.userStats.create({
      data: {
        userId: user.id,
        xp: faker.number.int({ min: 0, max: 10000 }),
        streak: faker.number.int({ min: 0, max: 30 }),
        bestStreak: faker.number.int({ min: 0, max: 100 }),
        accuracy: faker.number.float({ min: 0, max: 1, fractionDigits: 2 }),
        lastActiveAt: faker.date.recent({ days: 7 }),
      },
    });
  }

  console.log(`✅ Created ${users.length} users`);

  // Create mock markets
  console.log('Creating mock markets...');
  const markets = [];
  const sources = ['POLYMARKET', 'KALSHI'];
  const outcomes = ['YES', 'NO', 'UNKNOWN'];
  const tags = [
    'crypto', 'politics', 'sports', 'economics', 'technology',
    'entertainment', 'weather', 'science', 'health', 'social'
  ];

  for (let i = 0; i < 300; i++) {
    const source = faker.helpers.arrayElement(sources);
    const endDate = faker.date.future({ years: 1 });
    const yesPrice = faker.number.float({ min: 0.1, max: 0.9, fractionDigits: 3 });
    const noPrice = 1 - yesPrice;
    
    const market = await prisma.marketItem.create({
      data: {
        source: source as any,
        externalId: faker.string.alphanumeric(10),
        question: generateMarketQuestion(),
        yesPrice,
        noPrice,
        volume: faker.number.float({ min: 1000, max: 1000000, fractionDigits: 2 }),
        liquidity: faker.number.float({ min: 5000, max: 500000, fractionDigits: 2 }),
        endDate,
        lastChange24h: faker.number.float({ min: -20, max: 20, fractionDigits: 1 }),
        trendScore: faker.number.float({ min: 0, max: 1, fractionDigits: 2 }),
        confidence: faker.number.float({ min: 0, max: 1, fractionDigits: 2 }),
        insight: i % 3 === 0 ? generateInsight() : null,
        tags: faker.helpers.arrayElements(tags, { min: 1, max: 3 }),
        exchanges: [
          {
            name: source === 'POLYMARKET' ? 'Polymarket' : 'Kalshi',
            url: `https://${source.toLowerCase()}.com/market/${faker.string.alphanumeric(10)}`,
            oddsYes: yesPrice,
            oddsNo: noPrice,
            icon: `https://${source.toLowerCase()}.com/favicon.ico`,
          },
        ],
        outcome: faker.helpers.arrayElement(outcomes) as any,
        eligible: faker.datatype.boolean({ probability: 0.8 }),
      },
    });
    markets.push(market);
  }

  console.log(`✅ Created ${markets.length} markets`);

  // Create swipes
  console.log('Creating swipes...');
  let swipeCount = 0;
  for (const user of users) {
    const userSwipeCount = faker.number.int({ min: 10, max: 100 });
    const userMarkets = faker.helpers.arrayElements(markets, userSwipeCount);
    
    for (const market of userMarkets) {
      try {
        await prisma.swipe.create({
          data: {
            userId: user.id,
            marketId: market.id,
            direction: faker.helpers.arrayElement(['LEFT', 'RIGHT']) as any,
          },
        });
        swipeCount++;
      } catch (error) {
        // Skip if swipe already exists (unique constraint)
      }
    }
  }

  console.log(`✅ Created ${swipeCount} swipes`);

  // Create feature flags
  console.log('Creating feature flags...');
  const featureFlags = [
    { key: 'enable_insights', enabled: true },
    { key: 'enable_realtime', enabled: true },
    { key: 'enable_analytics', enabled: true },
    { key: 'beta_features', enabled: false },
    { key: 'maintenance_mode', enabled: false },
  ];

  for (const flag of featureFlags) {
    await prisma.featureFlag.upsert({
      where: { key: flag.key },
      update: flag,
      create: flag,
    });
  }

  console.log(`✅ Created ${featureFlags.length} feature flags`);

  // Create connector health records
  console.log('Creating connector health records...');
  const connectors = ['polymarket', 'kalshi'];
  
  for (const connector of connectors) {
    await prisma.connectorHealth.upsert({
      where: { connector },
      update: {
        status: 'healthy',
        lastSuccess: new Date(),
        errorCount: 0,
      },
      create: {
        connector,
        status: 'healthy',
        lastSuccess: new Date(),
        errorCount: 0,
      },
    });
  }

  console.log(`✅ Created ${connectors.length} connector health records`);

  console.log('🎉 Database seeding completed successfully!');
}

function generateMarketQuestion(): string {
  const templates = [
    'Will {crypto} reach ${price} by {date}?',
    'Will {person} win the {election} in {year}?',
    'Will {team} win the {championship} in {year}?',
    'Will {event} happen before {date}?',
    'Will {metric} exceed {value} by {date}?',
    'Will {company} stock reach ${price} by {date}?',
    'Will {technology} be adopted by {percentage}% of {group} by {date}?',
  ];

  const template = faker.helpers.arrayElement(templates);
  
  return template
    .replace('{crypto}', faker.helpers.arrayElement(['Bitcoin', 'Ethereum', 'Solana', 'Cardano']))
    .replace('{price}', faker.number.int({ min: 1000, max: 100000 }).toString())
    .replace('{person}', faker.person.fullName())
    .replace('{election}', faker.helpers.arrayElement(['presidential', 'senate', 'governor']))
    .replace('{year}', faker.date.future({ years: 2 }).getFullYear().toString())
    .replace('{team}', faker.helpers.arrayElement(['Lakers', 'Warriors', 'Celtics', 'Heat']))
    .replace('{championship}', faker.helpers.arrayElement(['NBA', 'NFL', 'MLB', 'NHL']))
    .replace('{event}', faker.helpers.arrayElement(['AI breakthrough', 'space mission', 'climate agreement']))
    .replace('{date}', faker.date.future({ years: 1 }).toLocaleDateString())
    .replace('{metric}', faker.helpers.arrayElement(['GDP growth', 'inflation rate', 'unemployment rate']))
    .replace('{value}', faker.number.float({ min: 1, max: 10, fractionDigits: 1 }).toString())
    .replace('{company}', faker.company.name())
    .replace('{technology}', faker.helpers.arrayElement(['AI', 'blockchain', 'quantum computing']))
    .replace('{percentage}', faker.number.int({ min: 10, max: 90 }).toString())
    .replace('{group}', faker.helpers.arrayElement(['companies', 'consumers', 'developers']));
}

function generateInsight(): string {
  const insights = [
    'High volatility suggests significant uncertainty in this market.',
    'Recent news events have driven increased interest in this prediction.',
    'Market sentiment appears bullish based on recent price movements.',
    'Low liquidity may indicate limited market participation.',
    'This market has attracted attention from institutional investors.',
    'Technical indicators suggest a potential trend reversal.',
    'Social media sentiment is mixed on this topic.',
    'Historical data shows similar patterns in past markets.',
  ];

  return faker.helpers.arrayElement(insights);
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
