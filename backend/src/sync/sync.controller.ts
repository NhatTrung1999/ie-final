import {
  Body,
  BadRequestException,
  Controller,
  Post,
  Req,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { memoryStorage } from 'multer';

import type { JwtUserPayload } from '../auth/auth.types';
import { SyncService } from './sync.service';

@Controller('sync')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Post('snapshot')
  @UseInterceptors(
    FilesInterceptor('videos', 100, {
      storage: memoryStorage(),
      fileFilter: (_req, file, callback) => {
        if (!file.mimetype?.startsWith('video/')) {
          callback(
            new BadRequestException(`Unsupported file type "${file.mimetype}".`),
            false,
          );
          return;
        }

        callback(null, true);
      },
      limits: {
        files: 100,
        // Default fieldSize is 1MB which can be exceeded by large snapshot JSON.
        // Increase to 50MB to safely handle large offline databases.
        fieldSize: 50 * 1024 * 1024,
        // Allow video files up to 2GB each.
        fileSize: 2 * 1024 * 1024 * 1024,
      },
    }),
  )
  syncSnapshot(
    @Body('snapshot') snapshotJson: string,
    @Body('videoRefs') videoRefsJson: string,
    @UploadedFiles() videos: Express.Multer.File[] = [],
    @Req()
    request: Request & {
      user: JwtUserPayload;
    },
  ) {
    return this.syncService.syncSnapshot(
      {
        snapshotJson,
        videoRefsJson,
      },
      videos,
      request.user,
    );
  }
}
