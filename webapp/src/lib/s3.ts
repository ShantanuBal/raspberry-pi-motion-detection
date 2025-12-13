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
  // S3 doesn't support sorting, so we need to fetch all videos and sort client-side
  // For pagination with sorting by date, we fetch all keys first, then paginate
  const allVideos: VideoFile[] = [];
  let nextToken: string | undefined = undefined;

  // Fetch ALL objects from S3 (loop through all pages)
  do {
    const command = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: "motion_detections/",
      ContinuationToken: nextToken,
    });

    const response: ListObjectsV2CommandOutput = await s3Client.send(command);

    if (response.Contents) {
      const videoObjects = response.Contents.filter((obj: _Object) => obj.Key?.endsWith(".mp4"));

      // Fetch metadata for all videos in this batch in parallel
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

      allVideos.push(...videosWithMetadata);
    }

    nextToken = response.NextContinuationToken;
  } while (nextToken);

  // Sort by lastModified descending (newest first)
  allVideos.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());

  // Parse continuation token as page number (0-indexed)
  const page = continuationToken ? parseInt(continuationToken, 10) : 0;
  const startIndex = page * PAGE_SIZE;
  const endIndex = startIndex + PAGE_SIZE;

  const paginatedVideos = allVideos.slice(startIndex, endIndex);
  const hasMore = endIndex < allVideos.length;

  return {
    videos: paginatedVideos,
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
