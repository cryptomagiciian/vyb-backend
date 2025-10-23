import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PolymarketConnector } from './polymarket.connector';
import { KalshiConnector } from './kalshi.connector';
import { MockConnector } from './mock.connector';
import { ConnectorsService } from './connectors.service';
import { PrismaModule } from '../common/prisma/prisma.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
  ],
  providers: [
    PolymarketConnector,
    KalshiConnector,
    MockConnector,
    ConnectorsService,
  ],
  exports: [
    PolymarketConnector,
    KalshiConnector,
    MockConnector,
    ConnectorsService,
  ],
})
export class ConnectorsModule {}
