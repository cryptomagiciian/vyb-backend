import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PolymarketConnector } from './polymarket.connector';
import { KalshiConnector } from './kalshi.connector';
import { ConnectorsService } from './connectors.service';

@Module({
  imports: [ConfigModule],
  providers: [
    PolymarketConnector,
    KalshiConnector,
    ConnectorsService,
  ],
  exports: [
    PolymarketConnector,
    KalshiConnector,
    ConnectorsService,
  ],
})
export class ConnectorsModule {}
