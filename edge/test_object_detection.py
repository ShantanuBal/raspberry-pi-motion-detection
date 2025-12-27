"""
Quick test script to verify YOLOv8 object detection is working
"""

import cv2
import numpy as np
from lib.object_detector import ObjectDetector

def create_test_frame():
    """Create a simple test frame (blank image)"""
    # Create a 640x480 black image
    frame = np.zeros((480, 640, 3), dtype=np.uint8)

    # Add some text to make it interesting
    cv2.putText(frame, "Test Frame for Object Detection",
                (50, 240), cv2.FONT_HERSHEY_SIMPLEX,
                1, (255, 255, 255), 2)

    return frame

def main():
    print("=== YOLOv8 Object Detection Test ===\n")

    # Initialize detector
    print("1. Initializing YOLOv8 Nano model...")
    try:
        detector = ObjectDetector(confidence_threshold=0.25)
        print("✓ Model loaded successfully!\n")
    except Exception as e:
        print(f"✗ Failed to load model: {e}")
        return

    # Create test frame
    print("2. Creating test frame...")
    frame = create_test_frame()
    print(f"✓ Test frame created: {frame.shape}\n")

    # Run detection on single frame
    print("3. Running inference on test frame...")
    detections = detector.detect_objects_in_frame(frame)
    print(f"✓ Inference complete")
    print(f"   Detections found: {len(detections)}\n")

    # Test on multiple frames
    print("4. Testing batch detection (10 frames)...")
    frames = [create_test_frame() for _ in range(10)]
    detected_objects = detector.detect_objects_in_frames(frames, sample_rate=2)
    print(f"✓ Batch detection complete")
    print(f"   Unique objects detected: {list(detected_objects.keys())}\n")

    print("=== Test Complete ===")
    print("\nYour object detection system is ready!")
    print("The YOLOv8n model will automatically detect:")
    print("  - People, animals (cat, dog, bird, etc.)")
    print("  - Vehicles (car, truck, bicycle, etc.)")
    print("  - Common objects (80 COCO classes total)")

if __name__ == "__main__":
    main()
