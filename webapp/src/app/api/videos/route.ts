import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { listVideosFromDynamoDB } from "@/lib/videos";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const continuationToken = searchParams.get("continuationToken") || undefined;
    const camera = searchParams.get("camera") || undefined;

    const result = await listVideosFromDynamoDB(continuationToken, camera);

    // Transform the response to match the expected format
    const videos = result.videos.map(video => ({
      key: video.videoKey,
      name: video.fileName,
      lastModified: new Date(video.uploadedAt * 1000).toISOString(),
      size: video.size,
      camera: video.camera,
      detectedObjects: video.detectedObjects,
      detectionsBboxes: video.detectionsBboxes,
    }));

    return NextResponse.json({
      videos,
      nextContinuationToken: result.nextToken,
      hasMore: result.hasMore,
    });
  } catch (error) {
    console.error("Error listing videos:", error);
    return NextResponse.json(
      { error: "Failed to list videos" },
      { status: 500 }
    );
  }
}
