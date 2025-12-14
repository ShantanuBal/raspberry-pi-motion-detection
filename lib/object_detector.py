"""
Object Detection Module using YOLOv8
Detects objects in video frames for motion detection tagging
"""

import logging
from typing import List, Dict, Set
import numpy as np
from pathlib import Path

logger = logging.getLogger(__name__)


class ObjectDetector:
    """Object detection using YOLOv8 Nano model"""

    def __init__(self, confidence_threshold: float = 0.25, model_name: str = 'yolov8n.pt'):
        """
        Initialize object detector

        Args:
            confidence_threshold: Minimum confidence score for detections (0.0-1.0)
            model_name: YOLOv8 model to use (yolov8n.pt is fastest for Pi)
        """
        self.confidence_threshold = confidence_threshold
        self.model_name = model_name
        self.model = None

        # Try to load YOLO model
        try:
            from ultralytics import YOLO
            logger.info(f"Loading YOLOv8 model: {model_name}...")
            self.model = YOLO(model_name)
            logger.info(f"✓ YOLOv8 model loaded successfully")
        except ImportError:
            logger.error("Ultralytics package not installed. Run: pip install ultralytics")
            raise
        except Exception as e:
            logger.error(f"Failed to load YOLO model: {e}")
            raise

    def detect_objects_in_frame(self, frame: np.ndarray) -> List[Dict]:
        """
        Detect objects in a single frame

        Args:
            frame: Video frame (BGR format from OpenCV)

        Returns:
            List of detections, each containing:
            - class_name: Object class name (e.g., 'person', 'cat')
            - confidence: Detection confidence (0.0-1.0)
            - bbox: Bounding box coordinates [x1, y1, x2, y2]
        """
        if self.model is None:
            logger.warning("YOLO model not loaded, skipping detection")
            return []

        try:
            # Run inference (verbose=False to suppress output)
            results = self.model(frame, verbose=False, conf=self.confidence_threshold)

            detections = []
            for result in results:
                # Extract boxes and classes
                boxes = result.boxes
                for box in boxes:
                    # Get class name and confidence
                    class_id = int(box.cls[0])
                    class_name = result.names[class_id]
                    confidence = float(box.conf[0])

                    # Get bounding box coordinates
                    x1, y1, x2, y2 = box.xyxy[0].tolist()

                    detections.append({
                        'class_name': class_name,
                        'confidence': confidence,
                        'bbox': [x1, y1, x2, y2]
                    })

            return detections

        except Exception as e:
            logger.error(f"Error during object detection: {e}")
            return []

    def detect_objects_in_frames(self, frames: List[np.ndarray],
                                 sample_rate: int = 10) -> Dict[str, float]:
        """
        Detect objects across multiple frames and aggregate results

        Args:
            frames: List of video frames
            sample_rate: Only process every Nth frame (default: 10)

        Returns:
            Dictionary mapping object class names to max confidence scores
            Example: {'person': 0.95, 'cat': 0.87, 'car': 0.72}
        """
        if not frames:
            return {}

        # Aggregate detections across sampled frames
        detections_aggregate: Dict[str, float] = {}

        # Sample frames to reduce processing time
        sampled_frames = frames[::sample_rate]
        logger.info(f"Running object detection on {len(sampled_frames)} sampled frames (every {sample_rate}th frame)...")

        for i, frame in enumerate(sampled_frames):
            detections = self.detect_objects_in_frame(frame)

            # Update max confidence for each detected class
            for detection in detections:
                class_name = detection['class_name']
                confidence = detection['confidence']

                # Keep the highest confidence score for each class
                if class_name not in detections_aggregate:
                    detections_aggregate[class_name] = confidence
                else:
                    detections_aggregate[class_name] = max(
                        detections_aggregate[class_name],
                        confidence
                    )

        # Log detected objects
        if detections_aggregate:
            detected_summary = ', '.join([
                f"{obj} ({conf:.2f})"
                for obj, conf in sorted(detections_aggregate.items(), key=lambda x: -x[1])
            ])
            logger.info(f"🔍 Detected objects: {detected_summary}")
        else:
            logger.info("No objects detected in frames")

        return detections_aggregate

    def get_detected_classes(self, detections: Dict[str, float],
                            min_confidence: float = None) -> List[str]:
        """
        Get list of detected object class names

        Args:
            detections: Dictionary from detect_objects_in_frames()
            min_confidence: Optional minimum confidence filter (overrides default)

        Returns:
            Sorted list of unique object class names
        """
        threshold = min_confidence if min_confidence is not None else self.confidence_threshold

        # Filter by confidence and return sorted list
        detected_classes = [
            class_name for class_name, conf in detections.items()
            if conf >= threshold
        ]

        return sorted(detected_classes)
