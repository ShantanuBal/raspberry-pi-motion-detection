#!/usr/bin/env python3
"""
Simple camera streaming server
Access from browser at http://<pi-ip>:8080
"""

from flask import Flask, Response
from picamera2 import Picamera2
import cv2

app = Flask(__name__)

# Initialize camera
picam2 = Picamera2()
config = picam2.create_video_configuration(main={"size": (1280, 720), "format": "RGB888"})
picam2.configure(config)

# Set camera controls for better brightness
picam2.set_controls({
    "Brightness": 0.1,      # -1.0 to 1.0 (increase for brighter)
    "Contrast": 1.2,        # 0.0 to 2.0 (increase for more contrast)
    "ExposureValue": 1.0    # -8.0 to 8.0 (increase for brighter exposure)
})

picam2.start()

def generate_frames():
    """Generate frames for MJPEG stream"""
    while True:
        # Capture frame
        frame = picam2.capture_array()
        # Convert RGB to BGR for OpenCV
        frame = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)
        # Rotate 180 degrees
        frame = cv2.rotate(frame, cv2.ROTATE_180)

        # Encode as JPEG
        ret, buffer = cv2.imencode('.jpg', frame)
        frame_bytes = buffer.tobytes()

        # Yield frame in MJPEG format
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')

@app.route('/')
def index():
    """Simple HTML page with video stream"""
    return """
    <html>
        <head>
            <title>Pi Camera Stream</title>
            <style>
                body { margin: 0; padding: 20px; background: #000; text-align: center; }
                h1 { color: #fff; font-family: Arial; }
                img { max-width: 100%; height: auto; border: 2px solid #333; }
            </style>
        </head>
        <body>
            <h1>Pi Camera Live Stream</h1>
            <img src="/video_feed" />
        </body>
    </html>
    """

@app.route('/video_feed')
def video_feed():
    """Video streaming route"""
    return Response(generate_frames(),
                    mimetype='multipart/x-mixed-replace; boundary=frame')

if __name__ == '__main__':
    try:
        print("Starting camera stream server...")
        print("Access stream at: http://<your-pi-ip>:8080")
        app.run(host='0.0.0.0', port=8080, threaded=True)
    finally:
        picam2.stop()
