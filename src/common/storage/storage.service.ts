import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { createHash } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { dirname, extname, join } from 'path';

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
]);

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private s3Client: S3Client | null = null;

  constructor(private readonly configService: ConfigService) {
    if (this.provider === 's3') {
      const region = this.configService.get<string>('storage.s3.region');
      const accessKeyId = this.configService.get<string>(
        'storage.s3.accessKeyId',
      );
      const secretAccessKey = this.configService.get<string>(
        'storage.s3.secretAccessKey',
      );
      if (region && accessKeyId && secretAccessKey) {
        this.s3Client = new S3Client({
          region,
          credentials: { accessKeyId, secretAccessKey },
        });
      } else {
        this.logger.warn('S3 storage selected but credentials are incomplete');
      }
    }
  }

  get provider(): 'local' | 's3' {
    return this.configService.get<'local' | 's3'>('storage.provider', 'local');
  }

  async savePlatformPaymentQr(file: Express.Multer.File): Promise<string> {
    if (!file.mimetype.startsWith('image/')) {
      throw new InternalServerErrorException(
        'Payment QR must be a JPEG, PNG, WebP, or GIF image',
      );
    }

    const ext = extname(file.originalname) || this.extFromMime(file.mimetype);
    const hash = this.hashBuffer(file.buffer);
    const key = `platform/payment-qr-${hash}${ext}`;

    if (this.provider === 's3' && this.s3Client) {
      return this.uploadToS3(key, file);
    }

    return this.saveLocal(key, file.buffer);
  }

  async savePaymentProof(
    clinicId: string,
    requestId: string,
    file: Express.Multer.File,
  ): Promise<string> {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      throw new InternalServerErrorException(
        'Proof must be JPEG, PNG, WebP, GIF, or PDF',
      );
    }

    const ext = extname(file.originalname) || this.extFromMime(file.mimetype);
    const key = `payments/${clinicId}/${requestId}${ext}`;

    if (this.provider === 's3' && this.s3Client) {
      return this.uploadToS3(key, file);
    }

    return this.saveLocal(key, file.buffer);
  }

  private async saveLocal(key: string, buffer: Buffer): Promise<string> {
    const baseDir = this.configService.get<string>(
      'storage.localDir',
      'uploads',
    );
    const fullPath = join(process.cwd(), baseDir, key);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, buffer);

    const publicApi = this.configService
      .get<string>('app.publicApiUrl', 'http://localhost:4000')
      .replace(/\/$/, '');
    return `${publicApi}/uploads/${key}`;
  }

  private async uploadToS3(
    key: string,
    file: Express.Multer.File,
  ): Promise<string> {
    const bucket = this.configService.get<string>('storage.s3.bucket');
    if (!bucket || !this.s3Client) {
      throw new InternalServerErrorException('S3 storage is not configured');
    }

    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );

    const publicBase = this.configService.get<string>(
      'storage.s3.publicBaseUrl',
    );
    if (publicBase) {
      return `${publicBase.replace(/\/$/, '')}/${key}`;
    }

    const region = this.configService.get<string>('storage.s3.region');
    return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
  }

  private extFromMime(mime: string): string {
    const map: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/gif': '.gif',
      'application/pdf': '.pdf',
    };
    return map[mime] ?? '.bin';
  }

  /** Stable filename when original name is missing. */
  hashBuffer(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex').slice(0, 12);
  }
}
