"""
Enhanced Motion Detection System with S3 Upload
Detects motion, saves clips/images, and uploads to AWS S3
"""

import cv2
import numpy as np
import time
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
        self.motion_detected = False
        self.motion_start_time = None
        self.clip_writer = None
        self.clip_frames = []
        
        logger.info("Motion detector initialized")
    
    def detect_motion(self, frame):
        """Detect motion in current frame"""
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        
        # Apply Gaussian blur to reduce noise
        gray = cv2.GaussianBlur(gray, (21, 21), 0)
        
        # Calculate frame difference
        frame_diff = cv2.absdiff(self.prev_gray, gray)
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
        
        self.prev_gray = gray
        
        return motion_detected, motion_score, max_area
    
    def start_clip_recording(self, frame):
        """Start recording a video clip"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = OUTPUT_DIR / f"motion_clip_{timestamp}.mp4"
        
        # Get frame dimensions
        height, width = frame.shape[:2]
        fps = 20  # Frames per second
        
        # Initialize video writer with H.264 codec for browser compatibility
        fourcc = cv2.VideoWriter_fourcc(*'avc1')
        self.clip_writer = cv2.VideoWriter(
            str(filename), fourcc, fps, (width, height)
        )
        
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
    
    # Main detection loop
    clip_recording = False
    clip_filename = None
    last_motion_time = 0
    
    try:
        logger.info("Starting motion detection...")
        while True:
            ret, frame = detector.camera.read()
            if not ret:
                logger.error("Failed to read frame")
                break
            
            motion_detected, motion_score, max_area = detector.detect_motion(frame)
            
            if motion_detected:
                current_time = time.time()
                last_motion_time = current_time
                
                # Start recording clip if not already recording
                if SAVE_CLIPS and not clip_recording:
                    clip_filename = detector.start_clip_recording(frame)
                    clip_recording = True
                
                # Add frame to clip
                if clip_recording:
                    detector.add_frame_to_clip(frame)
                
                logger.info(f"Motion detected! Score: {motion_score:.0f}, Area: {max_area:.0f}")
            
            # Continue recording for CLIP_DURATION seconds after last motion
            elif clip_recording:
                if time.time() - last_motion_time < CLIP_DURATION:
                    detector.add_frame_to_clip(frame)
                else:
                    # Stop recording and upload clip
                    clip_path, duration = detector.stop_clip_recording()
                    clip_recording = False
                    
                    if clip_path and s3_uploader and S3_UPLOAD_ON_MOTION:
                        if not s3_uploader.upload_motion_clip(clip_path, duration, motion_score=0):
                            raise RuntimeError(f"Failed to upload motion clip to S3: {clip_path}")
            
            # Small delay to prevent CPU overload
            time.sleep(0.05)
    
    except KeyboardInterrupt:
        logger.info("Stopping motion detection...")
    except Exception as e:
        logger.error(f"Fatal error in motion detection: {e}")
        raise
    finally:
        if clip_recording:
            detector.stop_clip_recording()
        detector.release()
        logger.info("Motion detection stopped")


if __name__ == "__main__":
    main()

