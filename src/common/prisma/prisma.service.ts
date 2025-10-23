import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'info' },
        { emit: 'event', level: 'warn' },
      ],
    });

    // Log database queries in development
    if (process.env.NODE_ENV === 'development') {
      this.$on('query', (e) => {
        this.logger.debug(`Query: ${e.query}`);
        this.logger.debug(`Params: ${e.params}`);
        this.logger.debug(`Duration: ${e.duration}ms`);
      });
    }

    this.$on('error', (e) => {
      this.logger.error('Database error:', e);
    });

    this.$on('info', (e) => {
      this.logger.log('Database info:', e.message);
    });

    this.$on('warn', (e) => {
      this.logger.warn('Database warning:', e.message);
    });
  }

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('Database connected successfully');
    } catch (error) {
      this.logger.error('Failed to connect to database:', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Database disconnected');
  }

  /**
   * Execute a transaction with automatic retry on deadlock
   */
  async executeTransaction<T>(
    fn: (prisma: PrismaClient) => Promise<T>,
    maxRetries = 3,
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.$transaction(fn, {
          maxWait: 10000, // 10 seconds
          timeout: 30000, // 30 seconds
        });
      } catch (error) {
        lastError = error as Error;
        
        // Retry on deadlock or serialization failure
        if (
          error.code === 'P2034' || // Transaction conflict
          error.code === 'P2002' || // Unique constraint violation
          error.message.includes('deadlock') ||
          error.message.includes('serialization')
        ) {
          if (attempt < maxRetries) {
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
            this.logger.warn(
              `Transaction failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms:`,
              error.message,
            );
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
        }
        
        throw error;
      }
    }

    throw lastError;
  }

  /**
   * Create a test database transaction snapshot for testing
   */
  async createTestSnapshot(): Promise<string> {
    const snapshot = await this.$queryRaw`SELECT pg_export_snapshot() as snapshot_id`;
    return (snapshot as any)[0].snapshot_id;
  }

  /**
   * Restore from a test database transaction snapshot
   */
  async restoreFromSnapshot(snapshotId: string): Promise<void> {
    await this.$queryRaw`SELECT pg_restore_snapshot(${snapshotId})`;
  }
}
