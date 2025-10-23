import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { PolymarketConnector } from './polymarket.connector';
import { KalshiConnector } from './kalshi.connector';
import { Connector, NormalizedMarket, ConnectorHealth } from './types';

@Injectable()
export class ConnectorsService {
  private readonly logger = new Logger(ConnectorsService.name);
  private readonly connectors: Connector[];

  constructor(
    private prisma: PrismaService,
    private polymarketConnector: PolymarketConnector,
    private kalshiConnector: KalshiConnector,
  ) {
    this.connectors = [polymarketConnector, kalshiConnector];
  }

  /**
   * Fetch markets from all connectors and store in database
   */
  async fetchAndStoreMarkets(): Promise<{
    total: number;
    new: number;
    updated: number;
    errors: string[];
  }> {
    const results = {
      total: 0,
      new: 0,
      updated: 0,
      errors: [] as string[],
    };

    for (const connector of this.connectors) {
      try {
        this.logger.log(`Fetching markets from ${connector.name}`);
        
        const rawMarkets = await connector.fetchMarkets({
          since: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
        });

        this.logger.log(`Fetched ${rawMarkets.length} markets from ${connector.name}`);

        for (const rawMarket of rawMarkets) {
          try {
            const normalized = connector.normalize(rawMarket);
            const result = await this.storeMarket(normalized);
            
            results.total++;
            if (result.isNew) {
              results.new++;
            } else {
              results.updated++;
            }
          } catch (error) {
            this.logger.error(
              `Failed to store market ${rawMarket.id} from ${connector.name}:`,
              error,
            );
            results.errors.push(`${connector.name}:${rawMarket.id} - ${error.message}`);
          }
        }

        // Update connector health
        await this.updateConnectorHealth(connector);
      } catch (error) {
        this.logger.error(`Failed to fetch from ${connector.name}:`, error);
        results.errors.push(`${connector.name} - ${error.message}`);
        
        // Update connector health with error
        await this.updateConnectorHealth(connector, error.message);
      }
    }

    this.logger.log(`Market ingestion completed: ${results.total} total, ${results.new} new, ${results.updated} updated, ${results.errors.length} errors`);
    return results;
  }

  /**
   * Store a normalized market in the database
   */
  private async storeMarket(normalized: NormalizedMarket): Promise<{ isNew: boolean }> {
    return this.prisma.executeTransaction(async (prisma) => {
      const existing = await prisma.marketItem.findUnique({
        where: {
          source: normalized.source.toUpperCase() as any,
          externalId: normalized.externalId,
        },
      });

      if (existing) {
        // Update existing market
        await prisma.marketItem.update({
          where: { id: existing.id },
          data: {
            question: normalized.question,
            yesPrice: normalized.yesPrice,
            noPrice: normalized.noPrice,
            volume24h: normalized.volume,
            liquidity: normalized.liquidity,
            endDate: new Date(normalized.endDate),
            lastChange24h: normalized.lastChange24h,
            tags: normalized.tags,
            exchanges: normalized.exchanges as any,
            updatedAt: new Date(),
          },
        });
        return { isNew: false };
      } else {
        // Create new market
        await prisma.marketItem.create({
          data: {
            source: normalized.source.toUpperCase() as any,
            sourceId: normalized.externalId, // Use sourceId as the external ID
            question: normalized.question,
            yesPrice: normalized.yesPrice,
            noPrice: normalized.noPrice,
            volume24h: normalized.volume,
            liquidity: normalized.liquidity,
            endDate: new Date(normalized.endDate),
            lastChange24h: normalized.lastChange24h,
            tags: normalized.tags,
            exchanges: normalized.exchanges as any,
          },
        });
        return { isNew: true };
      }
    });
  }

  /**
   * Update connector health status
   */
  private async updateConnectorHealth(connector: Connector, error?: string): Promise<void> {
    try {
      const health = await connector.getHealth();
      
      await this.prisma.connectorHealth.upsert({
        where: { connector: connector.name },
        update: {
          status: error ? 'down' : health.status,
          lastSuccess: health.lastSuccess,
          lastError: error || health.lastError,
          errorCount: error ? { increment: 1 } : 0,
          updatedAt: new Date(),
        },
        create: {
          connector: connector.name,
          status: error ? 'down' : health.status,
          lastSuccess: health.lastSuccess,
          lastError: error || health.lastError,
          errorCount: error ? 1 : 0,
        },
      });
    } catch (error) {
      this.logger.error(`Failed to update health for ${connector.name}:`, error);
    }
  }

  /**
   * Get health status for all connectors
   */
  async getAllConnectorHealth(): Promise<ConnectorHealth[]> {
    const healthRecords = await this.prisma.connectorHealth.findMany();
    
    return this.connectors.map(connector => {
      const record = healthRecords.find(h => h.connector === connector.name);
      return {
        status: record?.status as any || 'unknown',
        lastSuccess: record?.lastSuccess,
        lastError: record?.lastError,
        errorCount: record?.errorCount || 0,
      };
    });
  }

  /**
   * Get all connectors
   */
  getConnectors(): Connector[] {
    return this.connectors;
  }

  /**
   * Get a specific connector by name
   */
  getConnector(name: 'polymarket' | 'kalshi'): Connector | undefined {
    return this.connectors.find(c => c.name === name);
  }
}
