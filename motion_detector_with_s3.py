"""
Enhanced Motion Detection System with S3 Upload
Detects motion, saves clips/images, and uploads to AWS S3
"""

import cv2
import numpy as np
import time
from datetime import datetime
from pathlib import Path
from http.server import HTTPServer, BaseHTTPRequestHandler
import threading
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
LATEST_IMAGE_PATH = Path(LATEST_IMAGE_PATH).expanduser()


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
    
    def save_image(self, frame, motion_score):
        """Save motion-detected image"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = OUTPUT_DIR / f"motion_{timestamp}.jpg"
        
        cv2.imwrite(str(filename), frame)
        
        # Also save as latest_motion.jpg for web dashboard
        cv2.imwrite(str(LATEST_IMAGE_PATH), frame)
        
        logger.info(f"Saved motion image: {filename} (score: {motion_score:.0f})")
        return str(filename)
    
    def start_clip_recording(self, frame):
        """Start recording a video clip"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = OUTPUT_DIR / f"motion_clip_{timestamp}.mp4"
        
        # Get frame dimensions
        height, width = frame.shape[:2]
        fps = 20  # Frames per second
        
        # Initialize video writer
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
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


class WebServer(BaseHTTPRequestHandler):
    """Simple HTTP server to serve the latest motion image"""
    
    def do_GET(self):
        if self.path == '/' or self.path == '/index.html':
            self.send_response(200)
            self.send_header('Content-type', 'text/html')
            self.end_headers()
            
            html = f"""
            <!DOCTYPE html>
            <html>
            <head>
                <title>Motion Detection Dashboard</title>
                <meta http-equiv="refresh" content="{WEB_REFRESH_INTERVAL}">
                <style>
                    body {{
                        font-family: Arial, sans-serif;
                        background: #1a1a1a;
                        color: #fff;
                        margin: 0;
                        padding: 20px;
                        text-align: center;
                    }}
                    h1 {{
                        color: #4CAF50;
                    }}
                    img {{
                        max-width: 90%;
                        height: auto;
                        border: 3px solid #4CAF50;
                        border-radius: 10px;
                        box-shadow: 0 4px 8px rgba(0,0,0,0.3);
                    }}
                    .info {{
                        margin: 20px 0;
                        color: #aaa;
                    }}
                </style>
            </head>
            <body>
                <h1>🎥 Motion Detection Dashboard</h1>
                <div class="info">
                    <p>Last updated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</p>
                    <p>Auto-refreshing every {WEB_REFRESH_INTERVAL} second(s)</p>
                </div>
                <img src="/latest_motion.jpg" alt="Latest Motion Detection" 
                     onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\'%3E%3C/svg%3E';">
            </body>
            </html>
            """
            self.wfile.write(html.encode())
        
        elif self.path == '/latest_motion.jpg':
            if LATEST_IMAGE_PATH.exists():
                self.send_response(200)
                self.send_header('Content-type', 'image/jpeg')
                self.end_headers()
                with open(LATEST_IMAGE_PATH, 'rb') as f:
                    self.wfile.write(f.read())
            else:
                self.send_response(404)
                self.end_headers()
        
        else:
            self.send_response(404)
            self.end_headers()
    
    def log_message(self, format, *args):
        """Suppress default logging"""
        pass


def run_web_server():
    """Run the web server in a separate thread"""
    server = HTTPServer(('0.0.0.0', WEB_PORT), WebServer)
    logger.info(f"Web server started at http://0.0.0.0:{WEB_PORT}")
    server.serve_forever()


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
    
    # Start web server in background thread
    web_thread = threading.Thread(target=run_web_server, daemon=True)
    web_thread.start()
    
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
                
                # Save image
                if SAVE_IMAGES:
                    image_path = detector.save_image(frame, motion_score)
                    
                    # Upload to S3 if enabled
                    if s3_uploader and S3_UPLOAD_ON_MOTION:
                        if not s3_uploader.upload_motion_image(image_path, motion_score):
                            raise RuntimeError(f"Failed to upload motion image to S3: {image_path}")
                
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

