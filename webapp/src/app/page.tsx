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
  starred?: boolean;
  camera?: string;
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

export default function HomePage() {
  const { data: session } = useSession();
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loadingVideo, setLoadingVideo] = useState(false);
  const [continuationToken, setContinuationToken] = useState<string | undefined>();
  const [previousTokens, setPreviousTokens] = useState<(string | undefined)[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [starredVideoKeys, setStarredVideoKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchVideos();
    fetchStarredVideos();
  }, []);

  const fetchStarredVideos = async () => {
    try {
      const response = await fetch("/api/starred");
      if (response.ok) {
        const data = await response.json();
        const starredKeys = new Set<string>(data.videos.map((v: any) => v.videoKey as string));
        setStarredVideoKeys(starredKeys);
      }
    } catch (err) {
      console.error("Failed to fetch starred videos:", err);
    }
  };

  const toggleStar = async (video: Video, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent video from playing when clicking star

    const isStarred = starredVideoKeys.has(video.key);
    const action = isStarred ? "unstar" : "star";

    try {
      const response = await fetch("/api/starred", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          videoKey: video.key,
          action,
        }),
      });

      if (response.ok) {
        // Update local state
        const newStarredKeys = new Set(starredVideoKeys);
        if (isStarred) {
          newStarredKeys.delete(video.key);
        } else {
          newStarredKeys.add(video.key);
        }
        setStarredVideoKeys(newStarredKeys);
      }
    } catch (err) {
      console.error("Failed to toggle star:", err);
    }
  };

  const fetchVideos = async (token?: string, navigatingBack: boolean = false) => {
    setLoading(true);
    try {
      const url = token
        ? `/api/videos?continuationToken=${encodeURIComponent(token)}`
        : '/api/videos';
      const response = await fetch(url);
      if (!response.ok) throw new Error("Failed to fetch videos");
      const data = await response.json();
      setVideos(data.videos);
      setHasMore(data.hasMore);

      // Only update continuation token if not navigating back
      if (!navigatingBack) {
        setContinuationToken(data.nextContinuationToken);
      }
    } catch (err) {
      setError("Failed to load videos");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const refreshVideos = () => {
    setPreviousTokens([]);
    setCurrentPage(0);
    setContinuationToken(undefined);
    fetchVideos();
  };

  const goToNextPage = () => {
    if (continuationToken && hasMore) {
      setPreviousTokens([...previousTokens, continuationToken]);
      setCurrentPage(currentPage + 1);
      fetchVideos(continuationToken, false);
    }
  };

  const goToPreviousPage = () => {
    if (currentPage > 0) {
      const newPreviousTokens = [...previousTokens];
      const currentToken = newPreviousTokens.pop();
      const previousToken = newPreviousTokens[newPreviousTokens.length - 1];
      setPreviousTokens(newPreviousTokens);
      setCurrentPage(currentPage - 1);
      setContinuationToken(currentToken); // Restore the token for this page
      fetchVideos(previousToken, true);
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
      <Header session={session} />

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
                Page {currentPage + 1} • Showing {videos.length} video{videos.length !== 1 ? "s" : ""}
              </div>
              <button
                onClick={refreshVideos}
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
                  <h3 className="text-white font-medium">
                    {formatDate(video.lastModified)}
                  </h3>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={(e) => toggleStar(video, e)}
                      className="text-gray-400 hover:text-yellow-400 transition-colors"
                      title={starredVideoKeys.has(video.key) ? "Unstar" : "Star"}
                    >
                      {starredVideoKeys.has(video.key) ? (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-5 w-5"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                        >
                          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                        </svg>
                      ) : (
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
                            d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
                          />
                        </svg>
                      )}
                    </button>
                    {video.camera && (
                      <div className="text-gray-400 text-sm px-2 py-1 bg-gray-700 rounded">
                        {video.camera === 'picamera' ? '📷 Pi Cam' : '🎥 USB'}
                      </div>
                    )}
                    <div className="text-gray-500 text-sm">
                      {formatBytes(video.size)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {/* Pagination */}
            <div className="flex justify-center items-center gap-4 mt-4">
              <button
                onClick={goToPreviousPage}
                disabled={currentPage === 0}
                className="p-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Previous Page"
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
              <span className="text-gray-400 text-sm">
                Page {currentPage + 1}
              </span>
              <button
                onClick={goToNextPage}
                disabled={!hasMore}
                className="p-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Next Page"
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
                <button
                  onClick={() => {
                    const encodedKey = Buffer.from(selectedVideo.key).toString("base64");
                    window.open(`/video/${encodedKey}`, '_blank');
                  }}
                  className="p-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors flex items-center gap-2"
                  title="Open in New Tab"
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
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
                  <span className="text-xs">Open in New Tab</span>
                </button>
              </div>
              <h2 className="text-white font-medium flex-1 text-center">{formatDate(selectedVideo.lastModified)}</h2>
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

      <Footer />
    </div>
  );
}
