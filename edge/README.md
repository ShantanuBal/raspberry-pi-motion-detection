# Edge Device Code

This directory contains all the code that runs on the Raspberry Pi edge device for motion detection and object recognition.

## Files

- **bacon_detector.py** - Main motion detection script with S3 upload and object detection
- **camera_stream.py** - Simple Flask-based camera streaming server
- **test_object_detection.py** - Test script to verify YOLOv8 installation
- **config.py** - Configuration settings (S3 bucket, AWS region, detection parameters)
- **requirements.txt** - Python dependencies for the edge device

## Modules (lib/)

- **motion_detector.py** - Motion detection using OpenCV background subtraction
- **object_detector.py** - YOLOv8-based object detection with bounding boxes
- **s3_uploader.py** - AWS S3 upload functionality with metadata
- **cloudwatch_client.py** - CloudWatch metrics and logging

## Setup

Install dependencies on your Raspberry Pi:

```bash
cd edge
pip install -r requirements.txt
```

## Usage

Run the motion detector:

```bash
cd edge
python bacon_detector.py --camera picamera  # For Pi Camera
python bacon_detector.py --camera usb       # For USB webcam
```

Run the camera stream server:

```bash
cd edge
python camera_stream.py
```

Test object detection:

```bash
cd edge
python test_object_detection.py
```
