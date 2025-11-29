import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { starVideo, unstarVideo, getStarredVideos } from "@/lib/dynamodb";

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session || !session.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { videoKey, action } = await request.json();

    if (!videoKey || !action) {
      return NextResponse.json(
        { error: "Missing videoKey or action" },
        { status: 400 }
      );
    }

    if (action === "star") {
      await starVideo(session.user.email, videoKey);
      return NextResponse.json({ success: true, starred: true });
    } else if (action === "unstar") {
      await unstarVideo(session.user.email, videoKey);
      return NextResponse.json({ success: true, starred: false });
    } else {
      return NextResponse.json(
        { error: "Invalid action. Use 'star' or 'unstar'" },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("Error starring/unstarring video:", error);
    return NextResponse.json(
      { error: "Failed to star/unstar video" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session || !session.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const starredVideos = await getStarredVideos(session.user.email);
    return NextResponse.json({ videos: starredVideos });
  } catch (error) {
    console.error("Error getting starred videos:", error);
    return NextResponse.json(
      { error: "Failed to get starred videos" },
      { status: 500 }
    );
  }
}
