import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { SerializedBuffer } from '../types';
import { Secrets } from '../secrets';
import logger from '../logger';

export const uploadFileToS3 = async (
  file: Express.Multer.File,
  folder: string,
): Promise<string> => {
  const context: string = uploadFileToS3.name;

  try {
    const key = `${folder}/${Date.now()}-${file.originalname}`;
    const bucketName = Secrets.AWS_S3_BUCKET_NAME;
    const fileUrl = `https://${bucketName}.s3.amazonaws.com/${key}`;
    const buffer = Buffer.from(
      (file.buffer as unknown as SerializedBuffer).data,
    );

    // Initialize AWS S3 client
    const s3 = new S3Client({
      region: Secrets.AWS_REGION,
      credentials: {
        accessKeyId: Secrets.AWS_ACCESS_KEY_ID,
        secretAccessKey: Secrets.AWS_SECRET_ACCESS_KEY,
      },
    });

    // Upload file to S3 bucket
    await s3.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: Readable.from(buffer),
        ContentLength: buffer.length,
      }),
    );

    logger.info(`[${context}] File uploaded successfully.\n`);

    return fileUrl;
  } catch (error) {
    logger.error(`[${context}] File upload unsuccessful.\n`);
    throw error;
  }
};
