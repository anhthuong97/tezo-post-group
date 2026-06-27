import {
  Controller, Get, Post, Body, UseGuards,
  UseInterceptors, UploadedFiles, HttpCode,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { SessionGuard } from '../../../../../core/guards/session.guard';
import { CurrentUser, CurrentUserData } from '../../../../../core/decorators/current-user.decorator';
import { PostService } from '../service/post.service';
import { CreatePostDto } from '../dto/create-post.dto';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const ALLOWED_EXTS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.heic', '.heif',
  '.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v', '.wmv',
]);

@Controller('post-group/post')
@UseGuards(SessionGuard)
export class PostController {
  constructor(private readonly post: PostService) {}

  @Post()
  @HttpCode(200)
  async startPost(@CurrentUser() u: CurrentUserData, @Body() dto: CreatePostDto) {
    await this.post.startPost(u.userId, dto);
    return { success: true };
  }

  @Get('status')
  status(@CurrentUser() u: CurrentUserData) {
    return { success: true, status: this.post.getStatus(u.userId) };
  }

  @Get('log')
  log(@CurrentUser() u: CurrentUserData) {
    return { success: true, log: this.post.getLog(u.userId) };
  }

  @Post('cancel')
  cancel(@CurrentUser() u: CurrentUserData, @Body('url') url: string) {
    this.post.cancelGroup(u.userId, url);
    return { success: true };
  }

  @Post('cancel-all')
  cancelAll(@CurrentUser() u: CurrentUserData) {
    this.post.cancelAllPending(u.userId);
    return { success: true };
  }

  @Post('upload')
  @UseInterceptors(
    FilesInterceptor('files', 20, {
      storage: diskStorage({
        destination: UPLOADS_DIR,
        filename: (_req, file, cb) => {
          const ext  = path.extname(file.originalname).toLowerCase();
          const safe = Date.now() + '_' + Math.random().toString(36).slice(2) + ext;
          cb(null, safe);
        },
      }),
      fileFilter: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (ALLOWED_EXTS.has(ext)) return cb(null, true);
        cb(new Error(`Định dạng không hỗ trợ: ${ext}`), false);
      },
      limits: { fileSize: 100 * 1024 * 1024 },
    }),
  )
  uploadFiles(@UploadedFiles() files: Express.Multer.File[]) {
    return { success: true, files: files.map((f) => ({ name: f.filename, original: f.originalname, size: f.size })) };
  }
}
