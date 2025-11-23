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
    const decodedKey = Buffer.from(key, "base64").toString("utf-8");
    const url = await getPresignedUrl(decodedKey);
    return NextResponse.json({ url });
  } catch (error) {
    console.error("Error getting presigned URL:", error);
    return NextResponse.json(
      { error: "Failed to get video URL" },
      { status: 500 }
    );
  }
}
