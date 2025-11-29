"use client";

import { useSession } from "next-auth/react";
import { useState, useEffect } from "react";
import Footer from "@/components/Footer";
import Header from "@/components/Header";

interface Video {
  key: string;
  name: string;
  lastModified: string;
  size: number;
}

interface StarredVideo {
  userId: string;
  videoKey: string;
  starredAt: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

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

export default function StarredPage() {
  const { data: session } = useSession();
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loadingVideo, setLoadingVideo] = useState(false);

  useEffect(() => {
    if (session) {
      fetchStarredVideos();
    }
  }, [session]);

  const fetchStarredVideos = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/starred");
      if (!response.ok) throw new Error("Failed to fetch starred videos");
      const data = await response.json();

      // Fetch video details for each starred video
      const videoPromises = data.videos.map(async (starredVideo: StarredVideo) => {
        try {
          const encodedKey = Buffer.from(starredVideo.videoKey).toString("base64");
          const videoResponse = await fetch(`/api/videos/${encodedKey}`);
          if (videoResponse.ok) {
            // We need to get the video metadata from S3
            // For now, we'll create a placeholder with the key
            return {
              key: starredVideo.videoKey,
              name: starredVideo.videoKey.split("/").pop() || "",
              lastModified: starredVideo.starredAt,
              size: 0,
            };
          }
        } catch (err) {
          console.error("Failed to fetch video details:", err);
        }
        return null;
      });

      const videoDetails = (await Promise.all(videoPromises)).filter(Boolean) as Video[];
      setVideos(videoDetails);
    } catch (err) {
      setError("Failed to load starred videos");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const playVideo = async (video: Video) => {
    setSelectedVideo(video);
    setLoadingVideo(true);
    setVideoUrl(null);

    try {
      const encodedKey = Buffer.from(video.key).toString("base64");
      const response = await fetch(`/api/videos/${encodedKey}`);
      if (!response.ok) throw new Error("Failed to get video URL");
      const data = await response.json();
      setVideoUrl(data.url);
    } catch (err) {
      setError("Failed to load video");
      console.error(err);
    } finally {
      setLoadingVideo(false);
    }
  };

  const closeVideo = () => {
    setSelectedVideo(null);
    setVideoUrl(null);
  };

  const unstarVideo = async (video: Video, e: React.MouseEvent) => {
    e.stopPropagation();

    try {
      const response = await fetch("/api/starred", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          videoKey: video.key,
          action: "unstar",
        }),
      });

      if (response.ok) {
        // Remove from list
        setVideos(videos.filter((v) => v.key !== video.key));
      }
    } catch (err) {
      console.error("Failed to unstar video:", err);
    }
  };

  if (!session) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-900">
      <Header session={session} />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="text-gray-400">Loading starred videos...</div>
          </div>
        ) : error ? (
          <div className="flex justify-center items-center h-64">
            <div className="text-red-400">{error}</div>
          </div>
        ) : videos.length === 0 ? (
          <div className="flex flex-col justify-center items-center h-64">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-16 w-16 text-gray-600 mb-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
              />
            </svg>
            <div className="text-gray-400 text-lg">No starred videos yet</div>
            <div className="text-gray-500 text-sm mt-2">Star videos to see them here</div>
          </div>
        ) : (
          <div className="grid gap-4">
            <div className="text-gray-400 text-sm mb-2">
              {videos.length} starred video{videos.length !== 1 ? "s" : ""}
            </div>
            {videos.map((video) => (
              <div
                key={video.key}
                onClick={() => playVideo(video)}
                className="bg-gray-800 hover:bg-gray-750 border border-gray-700 rounded-lg p-4 cursor-pointer transition-colors hover:border-gray-600"
              >
                <div className="flex justify-between items-center">
                  <h3 className="text-white font-medium">
                    {formatDate(video.lastModified)}
                  </h3>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={(e) => unstarVideo(video, e)}
                      className="text-yellow-400 hover:text-gray-400 transition-colors"
                      title="Unstar"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-5 w-5"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                      </svg>
                    </button>
                    {video.size > 0 && (
                      <div className="text-gray-500 text-sm">
                        {formatBytes(video.size)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Video Modal */}
      {selectedVideo && (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg max-w-4xl w-full mx-4 overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b border-gray-700">
              <h2 className="text-white font-medium">{formatDate(selectedVideo.lastModified)}</h2>
              <button
                onClick={closeVideo}
                className="text-gray-400 hover:text-white text-2xl leading-none"
              >
                &times;
              </button>
            </div>
            <div className="p-4">
              <div className="aspect-video bg-black rounded flex items-center justify-center">
                {loadingVideo ? (
                  <div className="text-gray-400">Loading video...</div>
                ) : videoUrl ? (
                  <video
                    src={videoUrl}
                    controls
                    autoPlay
                    className="w-full h-full rounded"
                  >
                    Your browser does not support the video tag.
                  </video>
                ) : (
                  <div className="text-red-400">Failed to load video</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}
