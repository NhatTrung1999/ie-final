import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { ControlSessionModule } from './control-session/control-session.module';
import { DeleteLogModule } from './delete-log/delete-log.module';
import { PrismaModule } from './prisma/prisma.module';
import { HistoryModule } from './history/history.module';
import { MachineTypeModule } from './machine-type/machine-type.module';
import { StageModule } from './stage/stage.module';
import { StageCategoryModule } from './stage-category/stage-category.module';
import { SyncModule } from './sync/sync.module';
import { TableCtModule } from './table-ct/table-ct.module';
import { UsersModule } from './users/users.module';
import { validate } from './config/env.validation';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: join(__dirname,'..', '..', 'frontend', 'dist'),
    }),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validate,
    }),
    PrismaModule,
    DeleteLogModule,
    UsersModule,
    AuthModule,
    ControlSessionModule,
    HistoryModule,
    MachineTypeModule,
    StageCategoryModule,
    StageModule,
    SyncModule,
    TableCtModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
