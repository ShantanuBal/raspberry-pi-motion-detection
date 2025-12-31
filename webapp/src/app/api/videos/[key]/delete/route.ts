import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-west-2",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-west-2",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const docClient = DynamoDBDocumentClient.from(dynamoClient);

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { key } = await params;
    // Decode the key (it's base64 encoded to handle slashes in S3 keys)
    const videoKey = Buffer.from(key, "base64").toString("utf-8");

    // Delete video file from S3
    const videoDeleteCommand = new DeleteObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME!,
      Key: videoKey,
    });
    await s3Client.send(videoDeleteCommand);

    // Try to delete bounding box JSON file from S3 (if exists)
    const bboxKey = videoKey.replace('.mp4', '_bboxes.json');
    try {
      const bboxDeleteCommand = new DeleteObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME!,
        Key: bboxKey,
      });
      await s3Client.send(bboxDeleteCommand);
    } catch (err) {
      // Bbox file doesn't exist, that's okay
      console.log('No bbox file found to delete for video:', videoKey);
    }

    // Mark video as deleted in DynamoDB
    const updateCommand = new UpdateCommand({
      TableName: process.env.DYNAMODB_VIDEOS_TABLE!,
      Key: {
        videoKey: videoKey,
      },
      UpdateExpression: "SET deleted = :deleted, deletedAt = :deletedAt",
      ExpressionAttributeValues: {
        ":deleted": true,
        ":deletedAt": Math.floor(Date.now() / 1000), // Unix timestamp
      },
    });

    await docClient.send(updateCommand);

    return NextResponse.json({
      success: true,
      message: "Video deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting video:", error);
    return NextResponse.json(
      { error: "Failed to delete video" },
      { status: 500 }
    );
  }
}
