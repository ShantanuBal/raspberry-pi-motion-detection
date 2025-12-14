import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";

const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-west-2",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

const docClient = DynamoDBDocumentClient.from(dynamoClient);

const VIDEOS_TABLE = process.env.VIDEOS_TABLE_NAME || "motion-detection-videos";
const PAGE_SIZE = 50;

export interface VideoMetadata {
  videoKey: string;
  fileName: string;
  uploadedAt: number;
  size: number;
  camera: string;
  bucket: string;
}

export interface PaginatedVideos {
  videos: VideoMetadata[];
  nextToken?: string;
  hasMore: boolean;
}

export async function listVideosFromDynamoDB(continuationToken?: string): Promise<PaginatedVideos> {
  try {
    // Parse continuation token (it's a base64 encoded lastEvaluatedKey)
    let exclusiveStartKey: any = undefined;
    if (continuationToken) {
      try {
        exclusiveStartKey = JSON.parse(Buffer.from(continuationToken, 'base64').toString('utf-8'));
      } catch (err) {
        console.error("Failed to parse continuation token:", err);
      }
    }

    // Query the GSI sorted by uploadedAt (newest first)
    const command = new QueryCommand({
      TableName: VIDEOS_TABLE,
      IndexName: 'UploadTimeIndex',
      KeyConditionExpression: '#partition = :partitionValue',
      ExpressionAttributeNames: {
        '#partition': 'partition',
      },
      ExpressionAttributeValues: {
        ':partitionValue': 'all',
      },
      ScanIndexForward: false, // Sort descending (newest first)
      Limit: PAGE_SIZE,
      ExclusiveStartKey: exclusiveStartKey,
    });

    const response = await docClient.send(command);

    const videos: VideoMetadata[] = (response.Items || []).map(item => ({
      videoKey: item.videoKey as string,
      fileName: item.fileName as string,
      uploadedAt: item.uploadedAt as number,
      size: item.size as number,
      camera: item.camera as string,
      bucket: item.bucket as string,
    }));

    // Encode the LastEvaluatedKey as continuation token
    const nextToken = response.LastEvaluatedKey
      ? Buffer.from(JSON.stringify(response.LastEvaluatedKey)).toString('base64')
      : undefined;

    return {
      videos,
      nextToken,
      hasMore: !!response.LastEvaluatedKey,
    };
  } catch (error) {
    console.error("Error querying DynamoDB:", error);
    throw error;
  }
}