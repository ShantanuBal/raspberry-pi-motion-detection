"use client";

import { useSession } from "next-auth/react";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/Los_Angeles",
    timeZoneName: "short",
  });
}

export default function VideoPage() {
  const { data: session, status } = useSession();
  const params = useParams();
  const router = useRouter();
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [videoKey, setVideoKey] = useState<string>("");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }

    if (status === "authenticated" && params.key) {
      fetchVideo(params.key as string);
    }
  }, [status, params.key, router]);

  const fetchVideo = async (encodedKey: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/videos/${encodedKey}`);
      if (!response.ok) throw new Error("Failed to get video URL");
      const data = await response.json();
      setVideoUrl(data.url);

      // Decode the key to get the original filename
      const decodedKey = Buffer.from(encodedKey, "base64").toString("utf-8");
      setVideoKey(decodedKey);
    } catch (err) {
      setError("Failed to load video");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  // Extract date from filename if possible
  const getDateFromKey = (key: string) => {
    // Clean up any potential encoding issues
    const cleanKey = key.replace(/[^\x20-\x7E]/g, '').trim();

    // Try to parse date from filename like "20251128_155004.mp4"
    const match = cleanKey.match(/(\d{8})_(\d{6})/);
    if (match) {
      const dateStr = match[1]; // YYYYMMDD
      const timeStr = match[2]; // HHMMSS

      const year = dateStr.substring(0, 4);
      const month = dateStr.substring(4, 6);
      const day = dateStr.substring(6, 8);
      const hour = timeStr.substring(0, 2);
      const minute = timeStr.substring(2, 4);
      const second = timeStr.substring(4, 6);

      const isoDate = `${year}-${month}-${day}T${hour}:${minute}:${second}`;
      return formatDate(isoDate);
    }

    // Fallback: return cleaned filename without extension
    return cleanKey.replace(/\.mp4$/, '').replace(/motion_detections\//, '');
  };

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <button
            onClick={() => router.push("/")}
            className="text-gray-400 hover:text-white flex items-center gap-2"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 19l-7-7 7-7"
              />
            </svg>
            <span>Back to Videos</span>
          </button>
          <h1 className="text-xl font-bold text-white">
            {videoKey ? getDateFromKey(videoKey) : "Video"}
          </h1>
          <div className="w-32"></div> {/* Spacer for centering */}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center p-4">
        {error ? (
          <div className="text-red-400">{error}</div>
        ) : videoUrl ? (
          <div className="w-full max-w-5xl">
            <div className="bg-gray-800 rounded-lg overflow-hidden">
              <video
                src={videoUrl}
                controls
                autoPlay
                className="w-full"
                onError={(e) => {
                  const video = e.currentTarget;
                  console.error("[video] Error:", video.error?.message, video.error?.code);
                }}
              >
                Your browser does not support the video tag.
              </video>
            </div>
            <div className="mt-4 text-center">
              <p className="text-gray-400 text-sm">
                Share this URL to give others access to this video
              </p>
            </div>
          </div>
        ) : (
          <div className="text-gray-400">Loading video...</div>
        )}
      </main>
    </div>
  );
}
