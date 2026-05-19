import { NestFactory } from '@nestjs/core';
import { HttpAdapterHost } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import express from 'express';
import { AppModule } from './app.module';
import { ClientAbortExceptionFilter } from './common/filters/client-abort-exception.filter';
import { getStageUploadDir } from './stage/stage-upload.util';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  app.enableCors({
    origin: true,
    credentials: true,
  });
  app.useGlobalFilters(
    new ClientAbortExceptionFilter(app.get(HttpAdapterHost)),
  );
  app.setGlobalPrefix('api');
  app.use('/uploads', express.static(getStageUploadDir()));

  await app.listen(configService.get<number>('PORT', 3000));
}
bootstrap();
