import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPresignedUrl } from "@/lib/s3";

export async function GET(
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

    // Get presigned URL for video
    const videoUrl = await getPresignedUrl(videoKey);

    // Try to get presigned URL for bboxes (may not exist for old videos)
    let bboxUrl = null;
    const bboxKey = videoKey.replace('.mp4', '_bboxes.json');
    try {
      bboxUrl = await getPresignedUrl(bboxKey);
    } catch (err) {
      // Bbox file doesn't exist, that's okay
      console.log('No bbox file found for video:', videoKey);
    }

    return NextResponse.json({
      url: videoUrl,
      bboxUrl: bboxUrl
    });
  } catch (error) {
    console.error("Error getting presigned URL:", error);
    return NextResponse.json(
      { error: "Failed to get video URL" },
      { status: 500 }
    );
  }
}
