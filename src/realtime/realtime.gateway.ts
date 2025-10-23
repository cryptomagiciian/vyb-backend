import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger, UseGuards } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { RealtimeService } from './realtime.service';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  user?: any;
}

@WebSocketGateway({
  cors: {
    origin: process.env.NODE_ENV === 'production' 
      ? ['https://vyb.app', 'https://www.vyb.app']
      : [
          'http://localhost:3000',
          'http://localhost:3001',
          'https://lovable.dev',
          'https://*.lovable.dev',
          'https://*.lovable.app'
        ],
    credentials: true,
    methods: ['GET', 'POST'],
  },
  namespace: '/ws',
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RealtimeGateway.name);
  private connectedClients = new Map<string, AuthenticatedSocket>();

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    private realtimeService: RealtimeService,
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    try {
      // Authenticate the client
      const token = client.handshake.auth?.token || client.handshake.headers?.authorization?.replace('Bearer ', '');
      
      if (token) {
        try {
          const payload = this.jwtService.verify(token);
          client.userId = payload.sub;
          client.user = payload;
          
          this.connectedClients.set(client.id, client);
          
          // Join user-specific room
          await client.join(`user:${client.userId}`);
          
          this.logger.log(`Client connected: ${client.id}, user: ${client.userId}`);
          
          // Send connection confirmation
          client.emit('connected', {
            success: true,
            userId: client.userId,
            timestamp: new Date().toISOString(),
          });
        } catch (error) {
          this.logger.warn(`Authentication failed for client ${client.id}:`, error.message);
          client.emit('error', { message: 'Authentication failed' });
          client.disconnect();
        }
      } else {
        this.logger.warn(`No token provided for client ${client.id}`);
        client.emit('error', { message: 'Authentication token required' });
        client.disconnect();
      }
    } catch (error) {
      this.logger.error(`Connection error for client ${client.id}:`, error);
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    this.connectedClients.delete(client.id);
    this.logger.log(`Client disconnected: ${client.id}, user: ${client.userId}`);
  }

  @SubscribeMessage('join_segment')
  async handleJoinSegment(
    @MessageBody() data: { segment: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    try {
      if (!client.userId) {
        client.emit('error', { message: 'Not authenticated' });
        return;
      }

      const { segment } = data;
      await client.join(`segment:${segment}`);
      
      this.logger.log(`User ${client.userId} joined segment: ${segment}`);
      
      client.emit('joined_segment', {
        segment,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error(`Failed to join segment for user ${client.userId}:`, error);
      client.emit('error', { message: 'Failed to join segment' });
    }
  }

  @SubscribeMessage('leave_segment')
  async handleLeaveSegment(
    @MessageBody() data: { segment: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    try {
      if (!client.userId) {
        client.emit('error', { message: 'Not authenticated' });
        return;
      }

      const { segment } = data;
      await client.leave(`segment:${segment}`);
      
      this.logger.log(`User ${client.userId} left segment: ${segment}`);
      
      client.emit('left_segment', {
        segment,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error(`Failed to leave segment for user ${client.userId}:`, error);
      client.emit('error', { message: 'Failed to leave segment' });
    }
  }

  @SubscribeMessage('ping')
  async handlePing(@ConnectedSocket() client: AuthenticatedSocket) {
    client.emit('pong', {
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Broadcast new market to all connected clients
   */
  async broadcastNewMarket(market: any, segment: string = 'default') {
    try {
      this.server.to(`segment:${segment}`).emit('market:new', {
        market,
        segment,
        timestamp: new Date().toISOString(),
      });
      
      this.logger.log(`Broadcasted new market to segment ${segment}: ${market.id}`);
    } catch (error) {
      this.logger.error(`Failed to broadcast new market:`, error);
    }
  }

  /**
   * Broadcast market update to all connected clients
   */
  async broadcastMarketUpdate(market: any, segment: string = 'default') {
    try {
      this.server.to(`segment:${segment}`).emit('market:update', {
        market,
        segment,
        timestamp: new Date().toISOString(),
      });
      
      this.logger.log(`Broadcasted market update to segment ${segment}: ${market.id}`);
    } catch (error) {
      this.logger.error(`Failed to broadcast market update:`, error);
    }
  }

  /**
   * Send notification to specific user
   */
  async sendUserNotification(userId: string, notification: any) {
    try {
      this.server.to(`user:${userId}`).emit('notification', {
        ...notification,
        timestamp: new Date().toISOString(),
      });
      
      this.logger.log(`Sent notification to user ${userId}`);
    } catch (error) {
      this.logger.error(`Failed to send notification to user ${userId}:`, error);
    }
  }

  /**
   * Get connection statistics
   */
  getConnectionStats(): {
    totalConnections: number;
    authenticatedConnections: number;
    segments: Map<string, number>;
  } {
    const stats = {
      totalConnections: this.connectedClients.size,
      authenticatedConnections: Array.from(this.connectedClients.values()).filter(c => c.userId).length,
      segments: new Map<string, number>(),
    };

    // Count connections per segment (this would need to be tracked separately in a real implementation)
    return stats;
  }
}
