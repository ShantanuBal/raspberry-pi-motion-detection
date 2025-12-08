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
  // Fetch only what we need for one page
  // With new filename format (timestamp_camera.mp4), S3 sorts chronologically by default
  // We reverse to show newest first
  const FETCH_SIZE = 50; // Fetch 50 items to have buffer for sorting
  const allVideos: VideoFile[] = [];

  const command = new ListObjectsV2Command({
    Bucket: BUCKET_NAME,
    Prefix: "motion_detections/",
    MaxKeys: FETCH_SIZE,
  });

  const response: ListObjectsV2CommandOutput = await s3Client.send(command);

  if (response.Contents) {
    const videoObjects = response.Contents.filter((obj: _Object) => obj.Key?.endsWith(".mp4"));

    // Create video objects without metadata first (faster)
    const videos = videoObjects.map((obj: _Object) => ({
      key: obj.Key || "",
      name: obj.Key?.split("/").pop() || "",
      lastModified: obj.LastModified || new Date(),
      size: obj.Size || 0,
      camera: undefined,
    }));

    allVideos.push(...videos);
  }

  // Sort by key name descending (newest first since filename starts with timestamp)
  allVideos.sort((a, b) => b.key.localeCompare(a.key));

  // Parse continuation token as page number (0-indexed)
  const page = continuationToken ? parseInt(continuationToken, 10) : 0;
  const startIndex = page * PAGE_SIZE;
  const endIndex = startIndex + PAGE_SIZE;

  const paginatedVideos = allVideos.slice(startIndex, endIndex);

  // Now fetch metadata ONLY for the current page (in parallel)
  const videosWithMetadata = await Promise.all(
    paginatedVideos.map(async (video) => {
      try {
        const headCommand = new HeadObjectCommand({
          Bucket: BUCKET_NAME,
          Key: video.key,
        });
        const headResponse = await s3Client.send(headCommand);
        return {
          ...video,
          camera: headResponse.Metadata?.camera || undefined,
        };
      } catch (error) {
        console.error(`Failed to fetch metadata for ${video.key}:`, error);
        return video;
      }
    })
  );

  const hasMore = endIndex < allVideos.length;

  return {
    videos: videosWithMetadata,
    nextContinuationToken: hasMore ? String(page + 1) : undefined,
    hasMore,
    total: allVideos.length,
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
