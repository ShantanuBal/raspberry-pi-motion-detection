# Raspberry Pi Motion Detection System

A real-time motion detection system with AWS S3 cloud storage integration.

## Features

- ✅ Real-time motion detection using OpenCV
- ✅ Live web dashboard (auto-refreshing)
- ✅ Image and video clip capture
- ✅ AWS S3 cloud storage upload
- ✅ Configurable sensitivity and settings

## Hardware Requirements

- Raspberry Pi 5 (4GB RAM)
- USB Webcam (tested with Logitech C270)
- 64GB+ microSD card
- Power supply

## Setup Instructions

### 1. Install Dependencies

```bash
pip3 install -r requirements.txt
```

### 2. Configure AWS Credentials

Create a `.env` file (or set environment variables):

```bash
cp .env.example .env
nano .env
```

Fill in your AWS credentials:
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `S3_BUCKET_NAME` (create bucket in AWS Console first)

### 3. Create S3 Bucket

In AWS Console:
1. Go to S3
2. Create a new bucket (e.g., `your-motion-detection-bucket`)
3. Note the bucket name and region

### 4. Run Motion Detection

```bash
python3 motion_detector_with_s3.py
```

The system will:
- Start detecting motion
- Save images/clips locally
- Upload to S3 (if enabled)
- Serve web dashboard at `http://YOUR_PI_IP:8000`

## Configuration

Edit `config.py` or set environment variables:

- `MOTION_THRESHOLD`: Motion sensitivity (default: 5000.0)
- `MIN_MOTION_AREA`: Minimum contour area (default: 500)
- `CLIP_DURATION`: Seconds to record after motion (default: 10)
- `UPLOAD_TO_S3`: Enable/disable S3 uploads (default: false)
- `WEB_PORT`: Web dashboard port (default: 8000)

## File Structure

```
raspberry_pi/
├── motion_detector_with_s3.py  # Main detection script
├── s3_uploader.py              # S3 upload module
├── config.py                   # Configuration
├── requirements.txt            # Python dependencies
├── .env.example                # Environment variables template
└── README.md                   # This file
```

## Next Steps

- [ ] Add AWS SNS notifications
- [ ] Implement lightweight ML anomaly detection
- [ ] Multi-camera support
- [ ] CloudWatch logging

## Troubleshooting

**Camera not found:**
- Check camera is connected: `lsusb`
- Try different camera index: `camera_index=1` in MotionDetector()

**S3 upload fails:**
- Verify AWS credentials
- Check bucket name and region
- Ensure bucket exists and you have write permissions

**High CPU usage:**
- Reduce frame rate or resolution
- Increase `MIN_MOTION_AREA` to reduce false positives

