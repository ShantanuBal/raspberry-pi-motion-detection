import { S3Client, ListObjectsV2Command, ListObjectsV2CommandOutput, _Object, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

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
  camera?: string;
}

export interface PaginatedVideos {
  videos: VideoFile[];
  nextContinuationToken?: string;
  hasMore: boolean;
  total?: number;
}

const PAGE_SIZE = 10;

export async function listVideos(continuationToken?: string): Promise<PaginatedVideos> {
  // With timestamp-first filenames (YYYYMMDD_HHMMSS_camera_motion_clip.mp4),
  // S3 lists files in reverse chronological order when sorted descending
  // We can now fetch just one page at a time

  const command = new ListObjectsV2Command({
    Bucket: BUCKET_NAME,
    Prefix: "motion_detections/",
    MaxKeys: PAGE_SIZE,
    ContinuationToken: continuationToken,
  });

  const response: ListObjectsV2CommandOutput = await s3Client.send(command);

  const videos: VideoFile[] = [];

  if (response.Contents) {
    const videoObjects = response.Contents.filter((obj: _Object) => obj.Key?.endsWith(".mp4"));

    // Fetch metadata for videos in this page in parallel
    const videosWithMetadata = await Promise.all(
      videoObjects.map(async (obj: _Object) => {
        const video: VideoFile = {
          key: obj.Key || "",
          name: obj.Key?.split("/").pop() || "",
          lastModified: obj.LastModified || new Date(),
          size: obj.Size || 0,
        };

        // Fetch metadata for this video
        try {
          const headCommand = new HeadObjectCommand({
            Bucket: BUCKET_NAME,
            Key: video.key,
          });
          const headResponse = await s3Client.send(headCommand);
          video.camera = headResponse.Metadata?.camera || undefined;
        } catch (error) {
          console.error(`Failed to fetch metadata for ${video.key}:`, error);
        }

        return video;
      })
    );

    videos.push(...videosWithMetadata);
  }

  // Sort by filename descending (newest first) since filenames start with timestamp
  videos.sort((a, b) => b.name.localeCompare(a.name));

  return {
    videos,
    nextContinuationToken: response.NextContinuationToken,
    hasMore: !!response.IsTruncated,
  };
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
