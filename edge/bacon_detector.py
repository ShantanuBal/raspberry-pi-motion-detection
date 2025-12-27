"""
Enhanced Motion Detection System with S3 Upload
Detects motion, saves clips/images, and uploads to AWS S3
"""

import time
import subprocess
import argparse
from datetime import datetime
from pathlib import Path
import logging
import threading

# Import our modules
from config import *
from lib.cloudwatch_client import CloudWatchClient
from lib.motion_detector import MotionDetector
from lib.s3_uploader import S3Uploader

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# CloudWatch client (will be initialized in main())
cloudwatch = None

# Ensure output directory exists
OUTPUT_DIR = Path(OUTPUT_DIR).expanduser()
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def heartbeat_thread():
    """Background thread that sends a heartbeat metric every 5 minutes"""
    while True:
        try:
            time.sleep(300)  # 5 minutes
            cloudwatch.send_metric('SystemHeartbeat', value=1.0, unit='Count')
            logger.debug("Heartbeat metric sent")
        except Exception as e:
            logger.error(f"Error in heartbeat thread: {e}")


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

        # Remove original file and rename transcoded file to .mp4
        input_file.unlink()
        final_file = input_file.with_suffix('.mp4')
        output_file.rename(final_file)

        logger.info(f"Transcoding complete: {final_file.name}")
        return str(final_file)

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
    global cloudwatch

    # Parse command line arguments
    parser = argparse.ArgumentParser(description='Motion Detection System with S3 Upload')
    parser.add_argument('--camera', type=str, choices=['picamera', 'usb'], default='picamera',
                        help='Camera type to use: picamera (Raspberry Pi Camera Module) or usb (USB webcam)')
    parser.add_argument('--camera-index', type=int, default=0,
                        help='Camera device index for USB webcams (default: 0)')
    args = parser.parse_args()

    # Determine camera type
    use_picamera = args.camera == 'picamera'

    logger.info("=== Motion Detection System Starting ===")
    logger.info(f"Camera: {'Raspberry Pi Camera Module' if use_picamera else f'USB Webcam (device {args.camera_index})'}")
    logger.info(f"Configuration: S3={UPLOAD_TO_S3}, Bucket={S3_BUCKET_NAME}, Region={AWS_REGION}")
    logger.info(f"Settings: Clip Duration={CLIP_DURATION}s, Min Motion Area={MIN_MOTION_AREA}px")

    # Initialize CloudWatch client
    logger.info("Initializing CloudWatch client...")
    cloudwatch = CloudWatchClient(
        region=AWS_REGION,
        role_arn=IAM_ROLE_ARN if IAM_ROLE_ARN else None
    )

    # Add CloudWatch log handler to logger
    log_handler = cloudwatch.get_log_handler(
        log_group='/raspberry-pi/motion-detection',
        stream_name=f'motion-detector-{datetime.now().strftime("%Y%m%d")}'
    )
    if log_handler:
        logger.addHandler(log_handler)

    # Start heartbeat thread
    heartbeat = threading.Thread(target=heartbeat_thread, daemon=True)
    heartbeat.start()
    logger.info("Heartbeat thread started (5-minute interval)")

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
    detector = MotionDetector(
        output_dir=OUTPUT_DIR,
        min_motion_area=MIN_MOTION_AREA,
        camera_index=args.camera_index,
        use_picamera=use_picamera
    )

    try:
        logger.info("Starting motion detection loop - waiting for motion...")
        cloudwatch.send_metric('SystemStartup', value=1.0, unit='Count')

        while True:
            ret, frame = detector.read()
            if not ret:
                logger.error("Failed to read frame from camera")
                break

            motion_detected, motion_score, max_area = detector.detect_motion(frame)

            if motion_detected and SAVE_CLIPS:
                logger.info(f"🎬 Motion detected! Score: {motion_score:.0f}, Max Area: {max_area:.0f}px")
                cloudwatch.send_metric('MotionDetected', value=1.0, unit='Count')

                # Start recording
                clip_filename = detector.start_clip_recording(frame)
                logger.info(f"Recording started: {Path(clip_filename).name}")
                detector.add_frame_to_clip(frame)

                # Record for CLIP_DURATION seconds
                record_start = time.time()
                frames_recorded = 1
                while time.time() - record_start < CLIP_DURATION:
                    ret, frame = detector.read()
                    if not ret:
                        logger.error("Failed to read frame during recording")
                        break
                    detector.add_frame_to_clip(frame)
                    frames_recorded += 1
                    time.sleep(0.05)

                # Stop recording
                clip_path, duration, detected_objects, detections_with_bboxes = detector.stop_clip_recording()
                logger.info(f"Recording complete: {frames_recorded} frames, {duration:.1f}s")

                if clip_path:
                    clip_size_mb = Path(clip_path).stat().st_size / (1024 * 1024)
                    logger.info(f"Clip saved: {Path(clip_path).name} ({clip_size_mb:.2f} MB)")

                    # Transcode to H.264 for browser compatibility
                    logger.info("Starting H.264 transcoding...")
                    transcode_start = time.time()
                    transcoded_path = transcode_to_h264(clip_path)
                    if transcoded_path:
                        transcode_time = time.time() - transcode_start
                        final_size_mb = Path(transcoded_path).stat().st_size / (1024 * 1024)
                        logger.info(f"Transcoding complete in {transcode_time:.1f}s ({final_size_mb:.2f} MB)")
                        clip_path = transcoded_path
                    else:
                        logger.warning(f"Transcoding failed, will upload original file")
                        final_size_mb = clip_size_mb

                    # Upload to S3
                    if s3_uploader and S3_UPLOAD_ON_MOTION:
                        logger.info(f"Uploading to S3: s3://{S3_BUCKET_NAME}/motion_detections/{Path(clip_path).name}")
                        upload_start = time.time()

                        # Determine camera type string
                        camera_type_str = 'picamera' if use_picamera else 'usb'

                        # Get list of detected object classes
                        detected_classes = []
                        if detected_objects:
                            detected_classes = sorted(detected_objects.keys())

                        if s3_uploader.upload_motion_clip(clip_path, duration, motion_score=motion_score, camera_type=camera_type_str, detected_objects=detected_classes, detections_with_bboxes=detections_with_bboxes):
                            upload_time = time.time() - upload_start
                            logger.info(f"✅ Upload successful in {upload_time:.1f}s")

                            # Send CloudWatch metrics
                            cloudwatch.send_metric('VideoUploaded', value=1.0, unit='Count')
                            cloudwatch.send_metric('UploadDuration', value=upload_time, unit='Seconds')
                            cloudwatch.send_metric('VideoSize', value=final_size_mb, unit='Megabytes')
                            cloudwatch.send_metric('MotionScore', value=motion_score, unit='None')

                            # Delete local file after successful upload
                            try:
                                Path(clip_path).unlink()
                                logger.info(f"🗑️  Deleted local file: {Path(clip_path).name}")
                            except Exception as e:
                                logger.warning(f"Failed to delete local file {clip_path}: {e}")
                        else:
                            logger.error(f"❌ Upload failed: {clip_path}")
                            cloudwatch.send_metric('UploadFailed', value=1.0, unit='Count')
                            raise RuntimeError(f"Failed to upload motion clip to S3: {clip_path}")

                    logger.info("Motion event processing complete - resuming detection")

                # Reset background to avoid false positive on next detection
                ret, frame = detector.read()
                if ret:
                    detector.reset_background(frame)

            # Small delay to prevent CPU overload
            time.sleep(0.05)

    except KeyboardInterrupt:
        logger.info("Keyboard interrupt received - shutting down gracefully")
    except Exception as e:
        logger.error(f"💥 Fatal error in motion detection: {e}", exc_info=True)
        raise
    finally:
        detector.release()
        logger.info("=== Motion Detection System Stopped ===")


if __name__ == "__main__":
    main()

