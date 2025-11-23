import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { GetObjectCommand } from "@aws-sdk/client-s3";

const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-west-2",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

const BUCKET_NAME = process.env.S3_BUCKET_NAME || "";

export interface VideoFile {
  key: string;
  name: string;
  lastModified: Date;
  size: number;
}

export async function listVideos(): Promise<VideoFile[]> {
  const command = new ListObjectsV2Command({
    Bucket: BUCKET_NAME,
    Prefix: "motion_detections/", // Matches the prefix used by s3_uploader.py
  });

  const response = await s3Client.send(command);

  if (!response.Contents) {
    return [];
  }

  const videos = response.Contents
    .filter((obj) => obj.Key?.endsWith(".mp4"))
    .map((obj) => ({
      key: obj.Key || "",
      name: obj.Key?.split("/").pop() || "",
      lastModified: obj.LastModified || new Date(),
      size: obj.Size || 0,
    }))
    .sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());

  return videos;
}

export async function getPresignedUrl(key: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  // URL expires in 1 hour
  const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
  return url;
}
