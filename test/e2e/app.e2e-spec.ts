import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect((res) => {
        expect(res.body.status).toBe('ok');
        expect(res.body.service).toBe('vyb-api');
      });
  });

  it('/meta (GET)', () => {
    return request(app.getHttpServer())
      .get('/meta')
      .expect(200)
      .expect((res) => {
        expect(res.body.name).toBe('VYB API');
        expect(res.body.version).toBe('1.0.0');
        expect(res.body.endpoints).toBeDefined();
      });
  });

  it('/docs (GET)', () => {
    return request(app.getHttpServer())
      .get('/docs')
      .expect(200);
  });
});
