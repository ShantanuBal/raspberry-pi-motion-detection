"""
Configuration file for motion detection system
Store AWS credentials and settings here
"""

import os
from pathlib import Path

# Load .env file if it exists
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # python-dotenv not installed, skip

# AWS S3 Configuration
AWS_REGION = os.getenv('AWS_REGION', 'us-east-1')
AWS_ACCESS_KEY_ID = os.getenv('AWS_ACCESS_KEY_ID', '')
AWS_SECRET_ACCESS_KEY = os.getenv('AWS_SECRET_ACCESS_KEY', '')
S3_BUCKET_NAME = os.getenv('S3_BUCKET_NAME', 'your-motion-detection-bucket')
IAM_ROLE_ARN = os.getenv('IAM_ROLE_ARN', '')  # Optional: ARN of IAM role to assume

# Motion Detection Settings
MOTION_THRESHOLD = float(os.getenv('MOTION_THRESHOLD', '5000.0'))  # Adjust based on sensitivity
MIN_MOTION_AREA = int(os.getenv('MIN_MOTION_AREA', '500'))  # Minimum area to consider as motion
SAVE_IMAGES = os.getenv('SAVE_IMAGES', 'true').lower() == 'true'
SAVE_CLIPS = os.getenv('SAVE_CLIPS', 'true').lower() == 'true'
CLIP_DURATION = int(os.getenv('CLIP_DURATION', '30'))  # Seconds to record after motion

# File Paths
OUTPUT_DIR = Path(os.getenv('OUTPUT_DIR', '~/motion_detections'))
LATEST_IMAGE_PATH = Path(os.getenv('LATEST_IMAGE_PATH', '~/latest_motion.jpg'))

# Web Server Settings
WEB_PORT = int(os.getenv('WEB_PORT', '8000'))
WEB_REFRESH_INTERVAL = int(os.getenv('WEB_REFRESH_INTERVAL', '1'))  # seconds

# S3 Upload Settings
UPLOAD_TO_S3 = os.getenv('UPLOAD_TO_S3', 'false').lower() == 'true'
S3_UPLOAD_ON_MOTION = os.getenv('S3_UPLOAD_ON_MOTION', 'true').lower() == 'true'

# Optional: AWS SNS for notifications
SNS_TOPIC_ARN = os.getenv('SNS_TOPIC_ARN', '')  # Leave empty to disable notifications

