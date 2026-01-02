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

export interface Detection {
  class_name: string;
  confidence: number;
  bbox: [number, number, number, number]; // [x1, y1, x2, y2]
  frame_index: number;
}

export interface VideoMetadata {
  videoKey: string;
  fileName: string;
  uploadedAt: number;
  size: number;
  camera: string;
  bucket: string;
  detectedObjects?: string[];
}

export interface PaginatedVideos {
  videos: VideoMetadata[];
  nextToken?: string;
  hasMore: boolean;
}

export async function listVideosFromDynamoDB(continuationToken?: string, camera?: string, startDate?: string, endDate?: string): Promise<PaginatedVideos> {
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

    // Build the query with optional camera filter and deleted filter
    const expressionAttributeNames: Record<string, string> = {
      '#partition': 'partition',
    };
    const expressionAttributeValues: Record<string, any> = {
      ':partitionValue': 'all',
    };

    const filterExpressions: string[] = [];

    // Filter out deleted videos
    filterExpressions.push('attribute_not_exists(deleted) OR deleted = :notDeleted');
    expressionAttributeValues[':notDeleted'] = false;

    // Add camera filter if specified
    if (camera) {
      expressionAttributeNames['#camera'] = 'camera';
      expressionAttributeValues[':camera'] = camera;
      filterExpressions.push('#camera = :camera');
    }

    const filterExpression = filterExpressions.length > 0
      ? filterExpressions.join(' AND ')
      : undefined;

    // Build KeyConditionExpression with date range if specified
    // uploadedAt is the sort key of the GSI, so we use it in KeyConditionExpression
    let keyConditionExpression = '#partition = :partitionValue';

    if (startDate && endDate) {
      // Both dates specified - use BETWEEN
      expressionAttributeNames['#uploadedAt'] = 'uploadedAt';
      const startTimestamp = Math.floor(new Date(startDate).getTime() / 1000);
      const endTimestamp = Math.floor(new Date(endDate).getTime() / 1000) + 86400;
      expressionAttributeValues[':startDate'] = startTimestamp;
      expressionAttributeValues[':endDate'] = endTimestamp;
      keyConditionExpression += ' AND #uploadedAt BETWEEN :startDate AND :endDate';
    } else if (startDate) {
      // Only start date - greater than or equal
      expressionAttributeNames['#uploadedAt'] = 'uploadedAt';
      const startTimestamp = Math.floor(new Date(startDate).getTime() / 1000);
      expressionAttributeValues[':startDate'] = startTimestamp;
      keyConditionExpression += ' AND #uploadedAt >= :startDate';
    } else if (endDate) {
      // Only end date - less than or equal
      expressionAttributeNames['#uploadedAt'] = 'uploadedAt';
      const endTimestamp = Math.floor(new Date(endDate).getTime() / 1000) + 86400;
      expressionAttributeValues[':endDate'] = endTimestamp;
      keyConditionExpression += ' AND #uploadedAt <= :endDate';
    }

    // Query the GSI sorted by uploadedAt (newest first)
    const command = new QueryCommand({
      TableName: VIDEOS_TABLE,
      IndexName: 'UploadTimeIndex',
      KeyConditionExpression: keyConditionExpression,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      FilterExpression: filterExpression,
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
      detectedObjects: item.detectedObjects as string[] | undefined,
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