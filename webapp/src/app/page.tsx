"use client";

import { useSession, signOut } from "next-auth/react";
import { useState, useEffect } from "react";

interface Video {
  key: string;
  name: string;
  lastModified: string;
  size: number;
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
  return date.toLocaleString();
}

export default function HomePage() {
  const { data: session } = useSession();
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loadingVideo, setLoadingVideo] = useState(false);

  useEffect(() => {
    fetchVideos();
  }, []);

  const fetchVideos = async () => {
    try {
      const response = await fetch("/api/videos");
      if (!response.ok) throw new Error("Failed to fetch videos");
      const data = await response.json();
      setVideos(data.videos);
    } catch (err) {
      setError("Failed to load videos");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const playVideo = async (video: Video) => {
    console.log("[playVideo] Starting to load video:", video.name);
    console.log("[playVideo] Video key:", video.key);
    setSelectedVideo(video);
    setLoadingVideo(true);
    setVideoUrl(null);

    try {
      const encodedKey = Buffer.from(video.key).toString("base64");
      console.log("[playVideo] Encoded key:", encodedKey);
      const response = await fetch(`/api/videos/${encodedKey}`);
      console.log("[playVideo] API response status:", response.status);
      if (!response.ok) throw new Error("Failed to get video URL");
      const data = await response.json();
      console.log("[playVideo] Presigned URL received:", data.url);
      setVideoUrl(data.url);
    } catch (err) {
      setError("Failed to load video");
      console.error("[playVideo] Error:", err);
    } finally {
      setLoadingVideo(false);
    }
  };

  const closeVideo = () => {
    setSelectedVideo(null);
    setVideoUrl(null);
  };

  const getCurrentVideoIndex = () => {
    if (!selectedVideo) return -1;
    return videos.findIndex((v) => v.key === selectedVideo.key);
  };

  const playPreviousVideo = () => {
    const currentIndex = getCurrentVideoIndex();
    if (currentIndex > 0) {
      playVideo(videos[currentIndex - 1]);
    }
  };

  const playNextVideo = () => {
    const currentIndex = getCurrentVideoIndex();
    if (currentIndex < videos.length - 1) {
      playVideo(videos[currentIndex + 1]);
    }
  };

  if (!session) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold text-white">Motion Viewer</h1>
          <div className="flex items-center gap-4">
            <span className="text-gray-400 text-sm">{session.user?.email}</span>
            <button
              onClick={() => signOut()}
              className="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="text-gray-400">Loading videos...</div>
          </div>
        ) : error ? (
          <div className="flex justify-center items-center h-64">
            <div className="text-red-400">{error}</div>
          </div>
        ) : videos.length === 0 ? (
          <div className="flex justify-center items-center h-64">
            <div className="text-gray-400">No videos found</div>
          </div>
        ) : (
          <div className="grid gap-4">
            <div className="flex justify-between items-center mb-2">
              <div className="text-gray-400 text-sm">
                {videos.length} video{videos.length !== 1 ? "s" : ""} found
              </div>
              <button
                onClick={fetchVideos}
                className="p-2 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
                title="Refresh"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              </button>
            </div>
            {videos.map((video) => (
              <div
                key={video.key}
                onClick={() => playVideo(video)}
                className="bg-gray-800 hover:bg-gray-750 border border-gray-700 rounded-lg p-4 cursor-pointer transition-colors hover:border-gray-600"
              >
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-white font-medium">{video.name}</h3>
                    <p className="text-gray-400 text-sm mt-1">
                      {formatDate(video.lastModified)}
                    </p>
                  </div>
                  <div className="text-gray-500 text-sm">
                    {formatBytes(video.size)}
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
              <div className="flex items-center gap-2">
                <button
                  onClick={playPreviousVideo}
                  disabled={getCurrentVideoIndex() <= 0}
                  className="p-2 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Previous"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4"
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
                </button>
                <button
                  onClick={playNextVideo}
                  disabled={getCurrentVideoIndex() >= videos.length - 1}
                  className="p-2 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Next"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </button>
              </div>
              <h2 className="text-white font-medium flex-1 text-center">{selectedVideo.name}</h2>
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
                  onLoadStart={() => console.log("[video] Load started, S3 URL:", videoUrl)}
                  onLoadedData={() => console.log("[video] Data loaded")}
                  onCanPlay={() => console.log("[video] Can play")}
                  onError={(e) => {
                    const video = e.currentTarget;
                    console.error("[video] Error:", video.error?.message, video.error?.code);
                    console.error("[video] Network state:", video.networkState);
                    console.error("[video] Ready state:", video.readyState);
                  }}
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
    </div>
  );
}
