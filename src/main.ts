import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import * as compression from 'compression';
import { AppModule } from './app.module';
import { setupTracing } from './common/tracing';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { ErrorInterceptor } from './common/interceptors/error.interceptor';
import { RateLimitInterceptor } from './common/interceptors/rate-limit.interceptor';

async function bootstrap() {
  // Setup OpenTelemetry tracing if enabled
  const configService = new ConfigService();
  if (configService.get('ENABLE_OTEL') === 'true') {
    setupTracing();
  }

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  const config = app.get(ConfigService);
  const port = config.get('PORT', 8080);

  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
  }));
  app.use(compression());

  // CORS configuration
  const corsOrigin = config.get('CORS_ORIGIN');
  app.enableCors({
    origin: process.env.NODE_ENV === 'production' 
      ? [corsOrigin]
      : [
          'http://localhost:3000',
          'http://localhost:3001', 
          'https://lovable.dev',
          'https://*.lovable.dev',
          'https://*.lovable.app'
        ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'Idempotency-Key', 'X-Device-Fingerprint'],
  });

  // Global validation pipe
  app.useGlobalPipes(new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    transformOptions: {
      enableImplicitConversion: true,
    },
  }));

  // Global interceptors
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new ErrorInterceptor(),
    // RateLimitInterceptor will be added as a global interceptor in app.module.ts
  );

  // Swagger documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('VYB API')
    .setDescription('Real-time, swipe-driven discovery feed for Polymarket & Kalshi markets')
    .setVersion('2.0')
    .addBearerAuth()
    .addTag('auth', 'Authentication endpoints')
    .addTag('feed', 'Market feed endpoints')
    .addTag('swipes', 'User swipe actions')
    .addTag('users', 'User management')
    .addTag('admin', 'Admin operations')
    .addTag('realtime', 'Real-time updates')
    .addTag('vendors', 'Market data vendors')
    .addTag('insights', 'AI-powered market insights')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  // OpenAPI JSON endpoint for SDK generation
  app.getHttpAdapter().get('/docs-json', (req, res) => {
    res.json(document);
  });

  // Health check endpoint
  app.getHttpAdapter().get('/healthz', async (req, res) => {
    try {
      // Check database connection
      const prisma = app.get('PrismaService');
      await prisma.$queryRaw`SELECT 1`;
      
      // Check Redis connection
      const redis = app.get('RedisService');
      await redis.ping();
      
      res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        service: 'vyb-api',
        version: '2.0.0',
        checks: {
          database: 'ok',
          redis: 'ok'
        }
      });
    } catch (error) {
      res.status(503).json({
        status: 'error',
        timestamp: new Date().toISOString(),
        service: 'vyb-api',
        version: '2.0.0',
        error: error.message
      });
    }
  });

  // API metadata endpoint
  app.getHttpAdapter().get('/meta', (req, res) => {
    res.json({
      name: 'VYB API',
      version: '2.0.0',
      description: 'Real-time, swipe-driven discovery feed for Polymarket & Kalshi markets',
      disclaimer: 'This service provides market discovery and linking only. We do not execute trades or provide financial advice.',
      endpoints: {
        docs: '/docs',
        docsJson: '/docs-json',
        health: '/healthz',
        feed: '/feed/next',
        swipes: '/swipe',
        realtime: '/ws'
      }
    });
  });

  await app.listen(port);
  
  const logger = new Logger('Bootstrap');
  logger.log(`🚀 VYB API v2.0 is running on: http://localhost:${port}`);
  logger.log(`📚 API Documentation: http://localhost:${port}/docs`);
  logger.log(`📋 OpenAPI JSON: http://localhost:${port}/docs-json`);
  logger.log(`🏥 Health Check: http://localhost:${port}/healthz`);
}

bootstrap().catch((error) => {
  console.error('Failed to start application:', error);
  process.exit(1);
});
