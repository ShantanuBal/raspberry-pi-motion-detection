"use client";

import { useState } from "react";
import VideoPlayer from "./VideoPlayer";

interface Video {
  key: string;
  name: string;
  lastModified: string;
  size: number;
  starred?: boolean;
  camera?: string;
  detectedObjects?: string[];
}

interface VideoViewerProps {
  video: Video;
  videoUrl: string;
  videoBboxUrl: string | null;
  loadingVideo: boolean;
  onClose?: () => void;
  onNavigateNext?: () => void;
  onNavigatePrev?: () => void;
  onToggleStar?: (video: Video) => void;
  onDelete?: (video: Video) => void;
  isStarred?: boolean;
  hasNext?: boolean;
  hasPrev?: boolean;
  showNavigation?: boolean;
  showCloseButton?: boolean;
  showDeleteButton?: boolean;
}

export default function VideoViewer({
  video,
  videoUrl,
  videoBboxUrl,
  loadingVideo,
  onClose,
  onNavigateNext,
  onNavigatePrev,
  onToggleStar,
  onDelete,
  isStarred = false,
  hasNext = false,
  hasPrev = false,
  showNavigation = true,
  showCloseButton = true,
  showDeleteButton = true,
}: VideoViewerProps) {
  const [videoError, setVideoError] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleVideoError = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const videoEl = e.currentTarget;
    console.error("[video] Error:", videoEl.error?.message, videoEl.error?.code);
    setVideoError(true);
  };

  return (
    <div className="bg-gray-800 rounded-lg overflow-hidden">
      {/* Video Header */}
      <div className="bg-gray-900 px-4 py-3 flex items-center justify-between border-b border-gray-700">
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-medium truncate">{video.name}</h3>
          <p className="text-gray-400 text-sm">
            {new Date(video.lastModified).toLocaleString()}
          </p>
        </div>
        <div className="flex items-center gap-2 ml-4">
          {/* Navigation Controls */}
          {showNavigation && (
            <>
              <button
                onClick={onNavigatePrev}
                disabled={!hasPrev}
                className={`p-2 text-sm rounded transition-colors ${
                  hasPrev
                    ? "bg-gray-700 hover:bg-gray-600 text-white"
                    : "bg-gray-800 text-gray-600 cursor-not-allowed"
                }`}
                title="Previous video"
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
                onClick={onNavigateNext}
                disabled={!hasNext}
                className={`p-2 text-sm rounded transition-colors ${
                  hasNext
                    ? "bg-gray-700 hover:bg-gray-600 text-white"
                    : "bg-gray-800 text-gray-600 cursor-not-allowed"
                }`}
                title="Next video"
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
            </>
          )}

          {/* Star Button */}
          {onToggleStar && (
            <button
              onClick={() => onToggleStar(video)}
              className="p-2 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
              title={isStarred ? "Unstar" : "Star"}
            >
              {isStarred ? (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4 text-yellow-400"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
              ) : (
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
                    d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
                  />
                </svg>
              )}
            </button>
          )}

          {/* Delete Button */}
          {showDeleteButton && onDelete && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="p-2 text-sm bg-red-600 hover:bg-red-500 text-white rounded transition-colors"
              title="Delete video"
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
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
          )}

          {/* Open in New Tab */}
          <button
            onClick={() => {
              const encodedKey = Buffer.from(video.key).toString("base64");
              window.open(`/video/${encodedKey}`, "_blank");
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
          </button>

          {/* Close Button */}
          {showCloseButton && onClose && (
            <button
              onClick={onClose}
              className="p-2 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
              title="Close"
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
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Video Content */}
      <div className="bg-black">
        {loadingVideo ? (
          <div className="flex items-center justify-center h-96">
            <div className="text-gray-400">Loading video...</div>
          </div>
        ) : videoError ? (
          <div className="flex items-center justify-center h-96">
            <div className="text-red-400">Failed to load video</div>
          </div>
        ) : (
          <VideoPlayer
            videoUrl={videoUrl}
            bboxUrl={videoBboxUrl}
            onError={handleVideoError}
          />
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="absolute inset-0 bg-black bg-opacity-75 flex items-center justify-center z-10">
          <div className="bg-gray-800 rounded-lg p-6 max-w-md mx-4">
            <h3 className="text-white text-lg font-semibold mb-2">
              Delete Video?
            </h3>
            <p className="text-gray-300 text-sm mb-6">
              Are you sure you want to permanently delete this video? This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  if (onDelete) onDelete(video);
                }}
                className="px-4 py-2 text-sm bg-red-600 hover:bg-red-500 text-white rounded transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
