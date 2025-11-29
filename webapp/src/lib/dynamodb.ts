import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  DeleteCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-west-2",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || "motion-detection-starred-videos";

export interface StarredVideo {
  userId: string;
  videoKey: string;
  starredAt: string;
}

export async function starVideo(userId: string, videoKey: string): Promise<void> {
  const command = new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      userId,
      videoKey,
      starredAt: new Date().toISOString(),
    },
  });

  await docClient.send(command);
}

export async function unstarVideo(userId: string, videoKey: string): Promise<void> {
  const command = new DeleteCommand({
    TableName: TABLE_NAME,
    Key: {
      userId,
      videoKey,
    },
  });

  await docClient.send(command);
}

export async function getStarredVideos(userId: string): Promise<StarredVideo[]> {
  const command = new QueryCommand({
    TableName: TABLE_NAME,
    IndexName: "UserTimestampIndex",
    KeyConditionExpression: "userId = :userId",
    ExpressionAttributeValues: {
      ":userId": userId,
    },
    ScanIndexForward: false, // Sort descending (newest first)
  });

  const response = await docClient.send(command);
  return (response.Items || []) as StarredVideo[];
}

export async function isVideoStarred(userId: string, videoKey: string): Promise<boolean> {
  const command = new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: "userId = :userId AND videoKey = :videoKey",
    ExpressionAttributeValues: {
      ":userId": userId,
      ":videoKey": videoKey,
    },
  });

  const response = await docClient.send(command);
  return (response.Items?.length || 0) > 0;
}
