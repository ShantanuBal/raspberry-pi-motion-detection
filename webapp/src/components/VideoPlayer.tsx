"use client";

import { useRef, useEffect, useState } from "react";

interface Detection {
  class_name: string;
  confidence: number;
  bbox: [number, number, number, number]; // [x1, y1, x2, y2]
  frame_index: number;
}

interface VideoPlayerProps {
  videoUrl: string;
  bboxUrl?: string | null;
  onLoadStart?: () => void;
  onLoadedData?: () => void;
  onCanPlay?: () => void;
  onError?: (e: React.SyntheticEvent<HTMLVideoElement>) => void;
}

// Color map for different object classes
const CLASS_COLORS: Record<string, string> = {
  person: "#00FF00", // Green
  cat: "#0088FF", // Blue
  dog: "#FF8800", // Orange
  car: "#FF0088", // Pink
  // Add more as needed
};

const DEFAULT_COLOR = "#FFFF00"; // Yellow

export default function VideoPlayer({
  videoUrl,
  bboxUrl,
  onLoadStart,
  onLoadedData,
  onCanPlay,
  onError,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showBboxes, setShowBboxes] = useState(true);
  const [detections, setDetections] = useState<Detection[] | null>(null);
  const [loadingBboxes, setLoadingBboxes] = useState(false);

  // Draw bounding boxes on canvas
  const drawBoundingBoxes = () => {
    const canvas = canvasRef.current;
    const video = videoRef.current;

    if (!canvas || !video || !detections || !showBboxes) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Get video dimensions
    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;

    if (videoWidth === 0 || videoHeight === 0) return;

    // Calculate scale factors for the canvas
    const scaleX = canvas.width / videoWidth;
    const scaleY = canvas.height / videoHeight;

    // Calculate current frame index based on video time
    // Must match VIDEO_FPS constant in edge/lib/motion_detector.py:21
    const fps = 20;
    const currentFrameIndex = Math.floor(video.currentTime * fps);

    // Find the closest sampled frame
    // Object detection runs every 10 frames (0, 10, 20, 30, ...)
    // Show only detections from the nearest sampled frame
    const sampleRate = 10;
    const closestSampledFrame = Math.round(currentFrameIndex / sampleRate) * sampleRate;

    // Filter to show only detections from the closest sampled frame
    const visibleDetections = detections.filter((detection) => {
      return detection.frame_index === closestSampledFrame;
    });

    // Draw each visible detection
    visibleDetections.forEach((detection) => {
      const [x1, y1, x2, y2] = detection.bbox;
      const className = detection.class_name;
      const confidence = detection.confidence;

      // Scale bbox coordinates to canvas size
      const scaledX = x1 * scaleX;
      const scaledY = y1 * scaleY;
      const scaledWidth = (x2 - x1) * scaleX;
      const scaledHeight = (y2 - y1) * scaleY;

      // Get color for this class
      const color = CLASS_COLORS[className.toLowerCase()] || DEFAULT_COLOR;

      // Draw bounding box
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.strokeRect(scaledX, scaledY, scaledWidth, scaledHeight);

      // Draw label background
      const label = `${className} ${(confidence * 100).toFixed(0)}%`;
      ctx.font = "16px Arial";
      const textMetrics = ctx.measureText(label);
      const textHeight = 20;
      const padding = 4;

      ctx.fillStyle = color;
      ctx.fillRect(
        scaledX,
        scaledY - textHeight - padding,
        textMetrics.width + padding * 2,
        textHeight + padding
      );

      // Draw label text
      ctx.fillStyle = "#000000";
      ctx.fillText(label, scaledX + padding, scaledY - padding);
    });
  };

  // Update canvas size to match video display size
  const updateCanvasSize = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const container = containerRef.current;

    if (!video || !canvas || !container) return;

    // Get the displayed size of the video element
    const rect = video.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    // Redraw bboxes with new dimensions
    drawBoundingBoxes();
  };

  // Handle video metadata loaded
  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    if (!video) return;

    updateCanvasSize();
    if (onLoadedData) onLoadedData();
  };

  // Fetch bbox data when bboxUrl changes
  useEffect(() => {
    if (bboxUrl) {
      setLoadingBboxes(true);
      fetch(bboxUrl)
        .then(res => res.json())
        .then(data => setDetections(data))
        .catch(err => {
          console.error('Failed to fetch bounding boxes:', err);
          setDetections(null);
        })
        .finally(() => setLoadingBboxes(false));
    } else {
      setDetections(null);
    }
  }, [bboxUrl]);

  // Redraw bboxes on video timeupdate (in case video is paused)
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      drawBoundingBoxes();
    };

    const handleResize = () => {
      updateCanvasSize();
    };

    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("play", drawBoundingBoxes);
    video.addEventListener("pause", drawBoundingBoxes);
    video.addEventListener("seeked", drawBoundingBoxes);
    window.addEventListener("resize", handleResize);

    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("play", drawBoundingBoxes);
      video.removeEventListener("pause", drawBoundingBoxes);
      video.removeEventListener("seeked", drawBoundingBoxes);
      window.removeEventListener("resize", handleResize);
    };
  }, [detections, showBboxes]);

  // Draw bboxes whenever showBboxes changes
  useEffect(() => {
    if (showBboxes) {
      drawBoundingBoxes();
    } else {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      }
    }
  }, [showBboxes]);

  return (
    <div className="relative" ref={containerRef}>
      <video
        ref={videoRef}
        src={videoUrl}
        controls
        autoPlay
        className="w-full h-full rounded"
        onLoadStart={onLoadStart}
        onLoadedMetadata={handleLoadedMetadata}
        onCanPlay={onCanPlay}
        onError={onError}
      >
        Your browser does not support the video tag.
      </video>
      {detections && detections.length > 0 && (
        <>
          <canvas
            ref={canvasRef}
            className="absolute top-0 left-0 pointer-events-none rounded"
            style={{ width: "100%", height: "100%" }}
          />
          <button
            onClick={() => setShowBboxes(!showBboxes)}
            className={`absolute top-2 right-2 px-3 py-1 text-xs rounded transition-colors ${
              showBboxes
                ? "bg-blue-600 text-white"
                : "bg-gray-700 text-gray-300 hover:bg-gray-600"
            }`}
            title={showBboxes ? "Hide bounding boxes" : "Show bounding boxes"}
          >
            {showBboxes ? "Hide Boxes" : "Show Boxes"}
          </button>
        </>
      )}
    </div>
  );
}
