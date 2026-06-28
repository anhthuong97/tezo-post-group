import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import * as session from 'express-session';
import * as connectPgSimple from 'connect-pg-simple';
import { Pool } from 'pg';
import * as express from 'express';
import * as path from 'path';
import * as fs from 'fs';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './core/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const PgSession = connectPgSimple(session);
  const pool = new Pool({
    host:     process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME     || 'tezo',
    user:     process.env.DB_USER     || 'admin',
    password: process.env.DB_PASSWORD || '',
  });

  app.use(
    session({
      store: new PgSession({ pool, tableName: 'pg_sessions' }),
      secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 7 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        sameSite: 'lax',
      },
    }),
  );

  // Serve uploaded product images
  const uploadsDir = path.join(process.cwd(), 'uploads');
  fs.mkdirSync(uploadsDir, { recursive: true });
  app.use('/uploads', express.static(uploadsDir));

  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableShutdownHooks();

  const port = process.env.PORT || 3000;
  const server = await app.listen(port);
  server.setTimeout(3 * 60 * 1000);
  console.log(`API running at http://localhost:${port}`);
}

bootstrap();
