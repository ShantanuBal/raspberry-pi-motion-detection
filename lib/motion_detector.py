"""
Motion Detection Module
Detects motion using frame differencing and records video clips
"""

import cv2
import time
import logging
from datetime import datetime
from pathlib import Path

logger = logging.getLogger(__name__)


class MotionDetector:
    """Motion detection using frame differencing"""

    def __init__(self, output_dir: Path, min_motion_area: int = 500, camera_index: int = 0):
        """
        Initialize motion detector

        Args:
            output_dir: Directory to save motion clips
            min_motion_area: Minimum contour area to trigger motion detection
            camera_index: Camera device index (default: 0)
        """
        self.output_dir = output_dir
        self.min_motion_area = min_motion_area

        self.camera = cv2.VideoCapture(camera_index)
        if not self.camera.isOpened():
            raise RuntimeError(f"Could not open camera {camera_index}")

        # Set camera resolution (720p for C270)
        self.camera.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
        self.camera.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)

        # Initialize background subtractor
        self.bg_subtractor = cv2.createBackgroundSubtractorMOG2(
            history=500, varThreshold=50, detectShadows=True
        )

        # Read first frame to initialize
        ret, self.prev_frame = self.camera.read()
        if not ret:
            raise RuntimeError("Could not read initial frame")

        self.prev_gray = cv2.cvtColor(self.prev_frame, cv2.COLOR_BGR2GRAY)
        self.prev_gray_blur = cv2.GaussianBlur(self.prev_gray, (21, 21), 0)
        self.motion_detected = False
        self.motion_start_time = None
        self.clip_writer = None
        self.clip_frames = []

        logger.info("Motion detector initialized")

    def detect_motion(self, frame):
        """
        Detect motion in current frame

        Args:
            frame: Current video frame

        Returns:
            Tuple of (motion_detected: bool, motion_score: float, max_area: float)
        """
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        gray_blur = cv2.GaussianBlur(gray, (21, 21), 0)

        # Calculate frame difference
        frame_diff = cv2.absdiff(self.prev_gray_blur, gray_blur)
        thresh = cv2.threshold(frame_diff, 25, 255, cv2.THRESH_BINARY)[1]
        thresh = cv2.dilate(thresh, None, iterations=2)

        # Find contours
        contours, _ = cv2.findContours(thresh.copy(), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        motion_detected = False
        motion_score = 0.0
        max_area = 0

        for contour in contours:
            area = cv2.contourArea(contour)
            if area > self.min_motion_area:
                motion_detected = True
                motion_score += area
                max_area = max(max_area, area)

        self.prev_gray_blur = gray_blur

        return motion_detected, motion_score, max_area

    def start_clip_recording(self, frame):
        """
        Start recording a video clip

        Args:
            frame: Initial frame to start recording

        Returns:
            Path to the clip file being recorded
        """
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = self.output_dir / f"motion_clip_{timestamp}.mp4"

        # Get frame dimensions
        height, width = frame.shape[:2]
        fps = 20  # Frames per second

        # Initialize video writer with mp4v codec (will be transcoded to H.264 later)
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        self.clip_writer = cv2.VideoWriter(
            str(filename), fourcc, fps, (width, height)
        )

        if not self.clip_writer.isOpened():
            logger.error("Failed to open video writer with mp4v codec!")
            self.clip_writer = None

        self.clip_frames = []
        self.motion_start_time = time.time()

        logger.info(f"Started recording clip: {filename}")
        return str(filename)

    def add_frame_to_clip(self, frame):
        """
        Add frame to current clip

        Args:
            frame: Video frame to add
        """
        if self.clip_writer is not None:
            self.clip_writer.write(frame)
            self.clip_frames.append(frame.copy())

    def stop_clip_recording(self):
        """
        Stop recording and return clip filename

        Returns:
            Tuple of (clip_path: str, duration: float)
        """
        if self.clip_writer is not None:
            self.clip_writer.release()
            self.clip_writer = None

            duration = time.time() - self.motion_start_time if self.motion_start_time else 0
            logger.info(f"Stopped recording clip (duration: {duration:.1f}s)")

            # Return the most recent clip file
            clip_files = sorted(self.output_dir.glob("motion_clip_*.mp4"))
            if clip_files:
                return str(clip_files[-1]), duration
        return None, 0

    def reset_background(self, frame):
        """
        Reset the background frame to avoid false positives after motion event

        Args:
            frame: New frame to use as baseline
        """
        self.prev_gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        self.prev_gray_blur = cv2.GaussianBlur(self.prev_gray, (21, 21), 0)

    def release(self):
        """Release camera resources"""
        if self.clip_writer is not None:
            self.clip_writer.release()
        self.camera.release()
        cv2.destroyAllWindows()
