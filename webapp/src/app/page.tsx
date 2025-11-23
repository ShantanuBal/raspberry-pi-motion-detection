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
            <div className="text-gray-400 text-sm mb-2">
              {videos.length} video{videos.length !== 1 ? "s" : ""} found
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
              <h2 className="text-white font-medium">{selectedVideo.name}</h2>
              <button
                onClick={closeVideo}
                className="text-gray-400 hover:text-white text-2xl leading-none"
              >
                &times;
              </button>
            </div>
            <div className="p-4">
              {loadingVideo ? (
                <div className="flex justify-center items-center h-64">
                  <div className="text-gray-400">Loading video...</div>
                </div>
              ) : videoUrl ? (
                <video
                  src={videoUrl}
                  controls
                  autoPlay
                  className="w-full rounded"
                >
                  Your browser does not support the video tag.
                </video>
              ) : (
                <div className="flex justify-center items-center h-64">
                  <div className="text-red-400">Failed to load video</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
