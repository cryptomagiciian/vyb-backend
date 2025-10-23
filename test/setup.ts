import { beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.TEST_DATABASE_URL || 'postgresql://test:test@localhost:5432/vyb_test',
    },
  },
});

beforeAll(async () => {
  // Setup test database
  await prisma.$connect();
});

beforeEach(async () => {
  // Clean database before each test
  await prisma.swipe.deleteMany();
  await prisma.userStats.deleteMany();
  await prisma.user.deleteMany();
  await prisma.marketItem.deleteMany();
  await prisma.featureFlag.deleteMany();
  await prisma.connectorHealth.deleteMany();
  await prisma.idempotencyKey.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});
