"""
Enhanced Motion Detection System with S3 Upload
Detects motion, saves clips/images, and uploads to AWS S3
"""

import cv2
import numpy as np
import time
import subprocess
import os
from datetime import datetime
from pathlib import Path
import logging

# Import our modules
from config import *
from s3_uploader import S3Uploader

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Ensure output directory exists
OUTPUT_DIR = Path(OUTPUT_DIR).expanduser()
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


class MotionDetector:
    """Motion detection using frame differencing"""
    
    def __init__(self, camera_index=0):
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
        """Detect motion in current frame"""
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
            if area > MIN_MOTION_AREA:
                motion_detected = True
                motion_score += area
                max_area = max(max_area, area)
        
        self.prev_gray_blur = gray_blur
        
        return motion_detected, motion_score, max_area
    
    def start_clip_recording(self, frame):
        """Start recording a video clip"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = OUTPUT_DIR / f"motion_clip_{timestamp}.mp4"
        
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
        """Add frame to current clip"""
        if self.clip_writer is not None:
            self.clip_writer.write(frame)
            self.clip_frames.append(frame.copy())
    
    def stop_clip_recording(self):
        """Stop recording and return clip filename"""
        if self.clip_writer is not None:
            self.clip_writer.release()
            self.clip_writer = None
            
            duration = time.time() - self.motion_start_time if self.motion_start_time else 0
            logger.info(f"Stopped recording clip (duration: {duration:.1f}s)")
            
            # Return the most recent clip file
            clip_files = sorted(OUTPUT_DIR.glob("motion_clip_*.mp4"))
            if clip_files:
                return str(clip_files[-1]), duration
        return None, 0
    
    def release(self):
        """Release camera resources"""
        if self.clip_writer is not None:
            self.clip_writer.release()
        self.camera.release()
        cv2.destroyAllWindows()


def transcode_to_h264(input_path: str) -> str:
    """
    Transcode video to H.264 codec using FFmpeg for browser compatibility.
    Returns the path to the transcoded file, or None if transcoding failed.
    """
    input_file = Path(input_path)
    output_file = input_file.with_suffix('.h264.mp4')

    try:
        # FFmpeg command to transcode to H.264
        # -y: overwrite output file without asking
        # -i: input file
        # -c:v libx264: use H.264 codec
        # -preset fast: balance between encoding speed and compression
        # -crf 23: constant rate factor (quality), lower = better quality
        # -c:a copy: copy audio stream as-is (if any)
        # -movflags +faststart: optimize for web streaming
        cmd = [
            'ffmpeg',
            '-y',
            '-i', str(input_file),
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-crf', '23',
            '-movflags', '+faststart',
            str(output_file)
        ]

        logger.info(f"Transcoding {input_file.name} to H.264...")
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=300  # 5 minute timeout
        )

        if result.returncode != 0:
            logger.error(f"FFmpeg transcoding failed: {result.stderr}")
            return None

        # Verify output file exists and has content
        if not output_file.exists() or output_file.stat().st_size == 0:
            logger.error("Transcoded file is empty or doesn't exist")
            return None

        # Remove original file and rename transcoded file
        input_file.unlink()
        output_file.rename(input_file)

        logger.info(f"Transcoding complete: {input_file.name}")
        return str(input_file)

    except subprocess.TimeoutExpired:
        logger.error("FFmpeg transcoding timed out")
        if output_file.exists():
            output_file.unlink()
        return None
    except FileNotFoundError:
        logger.error("FFmpeg not found. Please install FFmpeg: sudo apt install ffmpeg")
        return None
    except Exception as e:
        logger.error(f"Transcoding error: {e}")
        if output_file.exists():
            output_file.unlink()
        return None


def main():
    """Main motion detection loop"""
    # Initialize S3 uploader if enabled
    s3_uploader = None
    if UPLOAD_TO_S3:
        logger.info("Initializing S3 uploader...")
        s3_uploader = S3Uploader(
            bucket_name=S3_BUCKET_NAME,
            region=AWS_REGION,
            role_arn=IAM_ROLE_ARN if IAM_ROLE_ARN else None
        )
        logger.info("S3 uploader initialized successfully")
    
    # Initialize motion detector
    detector = MotionDetector()

    try:
        logger.info("Starting motion detection...")
        while True:
            ret, frame = detector.camera.read()
            if not ret:
                logger.error("Failed to read frame")
                break

            motion_detected, motion_score, max_area = detector.detect_motion(frame)

            if motion_detected and SAVE_CLIPS:
                logger.info(f"Motion detected! Score: {motion_score:.0f}, Area: {max_area:.0f}")

                # Start recording
                detector.start_clip_recording(frame)
                detector.add_frame_to_clip(frame)

                # Record for CLIP_DURATION seconds
                record_start = time.time()
                while time.time() - record_start < CLIP_DURATION:
                    ret, frame = detector.camera.read()
                    if not ret:
                        logger.error("Failed to read frame during recording")
                        break
                    detector.add_frame_to_clip(frame)
                    time.sleep(0.05)

                # Stop recording
                clip_path, duration = detector.stop_clip_recording()

                if clip_path:
                    # Transcode to H.264 for browser compatibility
                    transcoded_path = transcode_to_h264(clip_path)
                    if transcoded_path:
                        clip_path = transcoded_path
                    else:
                        logger.warning(f"Transcoding failed, uploading original: {clip_path}")

                    # Upload to S3
                    if s3_uploader and S3_UPLOAD_ON_MOTION:
                        if not s3_uploader.upload_motion_clip(clip_path, duration, motion_score=motion_score):
                            raise RuntimeError(f"Failed to upload motion clip to S3: {clip_path}")

                # Reset prev_gray to avoid false positive on next detection
                ret, frame = detector.camera.read()
                if ret:
                    detector.prev_gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                    detector.prev_gray_blur = cv2.GaussianBlur(detector.prev_gray, (21, 21), 0)

            # Small delay to prevent CPU overload
            time.sleep(0.05)

    except KeyboardInterrupt:
        logger.info("Stopping motion detection...")
    except Exception as e:
        logger.error(f"Fatal error in motion detection: {e}")
        raise
    finally:
        detector.release()
        logger.info("Motion detection stopped")


if __name__ == "__main__":
    main()

