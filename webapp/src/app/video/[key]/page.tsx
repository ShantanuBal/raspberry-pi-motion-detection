"use client";

import { useSession } from "next-auth/react";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import VideoViewer from "@/components/VideoViewer";

interface Video {
  key: string;
  name: string;
  lastModified: string;
  size: number;
  starred?: boolean;
  camera?: string;
  detectedObjects?: string[];
}

export default function VideoPage() {
  const { data: session, status } = useSession();
  const params = useParams();
  const router = useRouter();
  const [video, setVideo] = useState<Video | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoBboxUrl, setVideoBboxUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isStarred, setIsStarred] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }

    if (status === "authenticated" && params.key) {
      fetchVideo(params.key as string);
      checkIfStarred(params.key as string);
    }
  }, [status, params.key, router]);

  const checkIfStarred = async (encodedKey: string) => {
    try {
      const response = await fetch("/api/starred");
      if (response.ok) {
        const data = await response.json();
        const videoKey = Buffer.from(encodedKey, "base64").toString("utf-8");
        const starred = data.videos.some((v: any) => v.videoKey === videoKey);
        setIsStarred(starred);
      }
    } catch (err) {
      console.error("Failed to check starred status:", err);
    }
  };

  const fetchVideo = async (encodedKey: string) => {
    setLoading(true);
    try {
      // Fetch video URL
      const urlResponse = await fetch(`/api/videos/${encodedKey}`);
      if (!urlResponse.ok) throw new Error("Failed to get video URL");
      const urlData = await urlResponse.json();
      setVideoUrl(urlData.url);
      setVideoBboxUrl(urlData.bboxUrl || null);

      // Decode key to get video metadata
      const videoKey = Buffer.from(encodedKey, "base64").toString("utf-8");
      const fileName = videoKey.split("/").pop() || videoKey;

      // Create a basic video object
      setVideo({
        key: videoKey,
        name: fileName,
        lastModified: new Date().toISOString(),
        size: 0,
      });
    } catch (err) {
      setError("Failed to load video");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const toggleStar = async (video: Video) => {
    try {
      const method = isStarred ? "DELETE" : "POST";
      const response = await fetch("/api/starred", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoKey: video.key }),
      });

      if (response.ok) {
        setIsStarred(!isStarred);
      }
    } catch (err) {
      console.error("Failed to toggle star:", err);
    }
  };

  const deleteVideo = async (video: Video) => {
    try {
      const encodedKey = Buffer.from(video.key).toString("base64");
      const response = await fetch(`/api/videos/${encodedKey}/delete`, {
        method: "DELETE",
      });

      if (response.ok) {
        // Redirect to home page after successful deletion
        router.push("/");
      } else {
        setError("Failed to delete video");
      }
    } catch (err) {
      console.error("Failed to delete video:", err);
      setError("Failed to delete video");
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

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      <Header session={session} showHomeButton={true} />

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center p-4">
        {error ? (
          <div className="text-red-400">{error}</div>
        ) : video && videoUrl ? (
          <div className="w-full max-w-5xl">
            <VideoViewer
              video={video}
              videoUrl={videoUrl}
              videoBboxUrl={videoBboxUrl}
              loadingVideo={false}
              onToggleStar={toggleStar}
              onDelete={deleteVideo}
              isStarred={isStarred}
              showNavigation={false}
              showCloseButton={false}
              showDeleteButton={true}
            />
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

      <Footer />
    </div>
  );
}
