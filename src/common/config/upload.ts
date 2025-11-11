import { v2 } from 'cloudinary';
import { Request } from 'express';
import { FileFilterCallback } from 'multer';
import { CloudinaryStorage } from '@fluidjs/multer-cloudinary';
import { randomUUID } from 'crypto';
import { Secrets } from '../secrets';

class UploadConfig {
  private readonly context: string = UploadConfig.name;

  constructor() {
    v2.config({
      cloud_name: Secrets.CLOUD_NAME,
      api_key: Secrets.CLOUD_API_KEY,
      api_secret: Secrets.CLOUD_API_SECRET,
      secure: true,
    });
  }

  storage(
    folder: string,
    resource_type: 'image' | 'raw' | 'video' | 'auto',
  ): CloudinaryStorage {
    const public_id =
      new Date().toISOString().replace(/:/g, '-') +
      '-' +
      randomUUID().replace(/-/g, '');

    const storage = new CloudinaryStorage({
      cloudinary: v2,
      params: { folder, public_id, resource_type },
    });

    return storage;
  }

  fileFilter = (
    req: Request,
    file: Express.Multer.File,
    callback: FileFilterCallback,
  ): void => {
    const allowedMimetypes: string[] = [
      'image/png',
      'image/heic',
      'image/jpeg',
      'image/webp',
      'image/heif',
    ];

    if (allowedMimetypes.includes(file.mimetype)) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  };
}

export const UploadService = new UploadConfig();
