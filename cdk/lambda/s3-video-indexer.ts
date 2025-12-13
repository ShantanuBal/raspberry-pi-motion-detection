import { S3Event } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const s3Client = new S3Client({});

const VIDEOS_TABLE = process.env.VIDEOS_TABLE_NAME || '';

export const handler = async (event: S3Event): Promise<void> => {
  console.log('Received S3 event:', JSON.stringify(event, null, 2));

  for (const record of event.Records) {
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));

    // Only process .mp4 files in motion_detections/ folder
    if (!key.endsWith('.mp4') || !key.startsWith('motion_detections/')) {
      console.log(`Skipping non-video file: ${key}`);
      continue;
    }

    try {
      // Get object metadata
      const headCommand = new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      });
      const headResponse = await s3Client.send(headCommand);

      const fileName = key.split('/').pop() || '';
      const uploadedAt = Math.floor((headResponse.LastModified?.getTime() || Date.now()) / 1000);

      // Calculate TTL (90 days from upload, matching S3 lifecycle)
      const ttl = uploadedAt + (90 * 24 * 60 * 60);

      // Extract camera type from filename or metadata
      let cameraType = headResponse.Metadata?.camera || 'unknown';
      if (cameraType === 'unknown') {
        // Try to infer from filename
        if (fileName.includes('picamera')) {
          cameraType = 'picamera';
        } else if (fileName.includes('usb')) {
          cameraType = 'usb';
        }
      }

      // Store video metadata in DynamoDB
      const item = {
        videoKey: key,
        partition: 'all', // Single partition for GSI queries
        fileName: fileName,
        uploadedAt: uploadedAt,
        size: record.s3.object.size,
        camera: cameraType,
        bucket: bucket,
        ttl: ttl,
      };

      await docClient.send(new PutCommand({
        TableName: VIDEOS_TABLE,
        Item: item,
      }));

      console.log(`Successfully indexed video: ${key}`);
    } catch (error) {
      console.error(`Error processing ${key}:`, error);
      throw error; // Re-throw to trigger Lambda retry
    }
  }
};
