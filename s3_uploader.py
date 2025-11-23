"""
AWS S3 Upload Module for Motion Detection System
Uploads motion-detected clips/images to S3 bucket
"""

import boto3
import os
import logging
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional
from botocore.exceptions import ClientError

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class S3Uploader:
    """Handles uploading motion detection files to AWS S3"""
    
    def __init__(self, bucket_name: str, region: str = 'us-east-1', 
                 role_arn: Optional[str] = None):
        """
        Initialize S3 uploader
        
        Args:
            bucket_name: Name of S3 bucket
            region: AWS region (default: us-east-1)
            role_arn: Optional IAM role ARN to assume. If provided, assumes role
                     to get temporary credentials. Otherwise uses direct credentials.
        
        Note: Uses AWS credentials from environment variables:
            - AWS_ACCESS_KEY_ID
            - AWS_SECRET_ACCESS_KEY
        """
        self.bucket_name = bucket_name
        self.region = region
        self.role_arn = role_arn
        self.credentials_expiry = None  # Track when credentials expire
        
        # Initialize S3 client
        self._refresh_s3_client()
        
        # Try to verify bucket exists (non-fatal if we don't have ListBucket permission)
        try:
            self.s3_client.head_bucket(Bucket=bucket_name)
            logger.info(f"Connected to S3 bucket: {bucket_name}")
        except Exception as e:
            # Log warning but don't fail - we'll get an error on upload if bucket doesn't exist
            logger.warning(f"Could not verify bucket {bucket_name} (this is OK if role lacks ListBucket permission): {e}")
            logger.info(f"S3 uploader initialized for bucket: {bucket_name}")
    
    def _refresh_s3_client(self):
        """Refresh S3 client, assuming role if configured"""
        if self.role_arn:
            # Assume IAM role to get temporary credentials
            try:
                sts_client = boto3.client('sts', region_name=self.region)
                response = sts_client.assume_role(
                    RoleArn=self.role_arn,
                    RoleSessionName='motion-detection-pi-session'
                )
                credentials = response['Credentials']
                
                # Store expiration time (refresh 5 minutes before expiry)
                self.credentials_expiry = credentials['Expiration']
                refresh_time = self.credentials_expiry - timedelta(minutes=5)
                
                # Create S3 client with temporary credentials
                self.s3_client = boto3.client(
                    's3',
                    region_name=self.region,
                    aws_access_key_id=credentials['AccessKeyId'],
                    aws_secret_access_key=credentials['SecretAccessKey'],
                    aws_session_token=credentials['SessionToken']
                )
                logger.info(f"Assumed IAM role: {self.role_arn} (expires at {self.credentials_expiry})")
            except ClientError as e:
                logger.error(f"Failed to assume role {self.role_arn}: {e}")
                raise
        else:
            # Use direct credentials from environment (no expiration)
            self.s3_client = boto3.client('s3', region_name=self.region)
            self.credentials_expiry = None
    
    def _ensure_valid_credentials(self):
        """Refresh credentials if they're expired or about to expire"""
        if self.role_arn and self.credentials_expiry:
            # Refresh 5 minutes before expiry
            refresh_time = self.credentials_expiry - timedelta(minutes=5)
            if datetime.now(self.credentials_expiry.tzinfo) >= refresh_time:
                logger.info("Credentials expiring soon, refreshing...")
                self._refresh_s3_client()
    
    def upload_file(self, local_path: str, s3_key: Optional[str] = None, 
                   metadata: Optional[dict] = None) -> bool:
        """
        Upload a file to S3
        
        Args:
            local_path: Path to local file
            s3_key: S3 object key (path in bucket). If None, auto-generates based on timestamp
            metadata: Optional metadata to attach to the object
            
        Returns:
            True if successful
            
        Raises:
            RuntimeError: If upload fails
        """
        if not os.path.exists(local_path):
            raise FileNotFoundError(f"File not found: {local_path}")
        
        # Ensure credentials are valid before uploading
        self._ensure_valid_credentials()
        
        # Generate S3 key if not provided
        if s3_key is None:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = Path(local_path).name
            file_ext = Path(local_path).suffix
            s3_key = f"motion_detections/{timestamp}{file_ext}"
        
        # Prepare metadata
        extra_args = {}
        if metadata:
            extra_args['Metadata'] = {str(k): str(v) for k, v in metadata.items()}
        
        # Attempt upload with retry on token expiration
        max_retries = 2
        for attempt in range(max_retries):
            try:
                # Upload file
                self.s3_client.upload_file(
                    local_path,
                    self.bucket_name,
                    s3_key,
                    ExtraArgs=extra_args
                )
                
                s3_url = f"s3://{self.bucket_name}/{s3_key}"
                logger.info(f"Successfully uploaded {local_path} to {s3_url}")
                return True
                
            except ClientError as e:
                error_code = e.response.get('Error', {}).get('Code', '')
                # If token expired, refresh and retry once
                if error_code == 'ExpiredToken' and self.role_arn and attempt < max_retries - 1:
                    logger.warning("Token expired, refreshing credentials and retrying...")
                    self._refresh_s3_client()
                    continue  # Retry the upload
                else:
                    logger.error(f"Error uploading {local_path} to S3: {e}")
                    raise RuntimeError(f"S3 upload failed: {e}") from e
            except Exception as e:
                logger.error(f"Error uploading {local_path} to S3: {e}")
                raise RuntimeError(f"S3 upload failed: {e}") from e
        
        # Should never reach here, but just in case
        raise RuntimeError(f"S3 upload failed after {max_retries} attempts")
    
    def upload_motion_image(self, image_path: str, motion_score: Optional[float] = None) -> bool:
        """
        Upload a motion-detected image with metadata
        
        Args:
            image_path: Path to the image file
            motion_score: Optional motion detection score/confidence
            
        Returns:
            True if successful, False otherwise
        """
        metadata = {
            'type': 'motion_detection',
            'timestamp': datetime.now().isoformat(),
        }
        
        if motion_score is not None:
            metadata['motion_score'] = str(motion_score)
        
        return self.upload_file(image_path, metadata=metadata)
    
    def upload_motion_clip(self, video_path: str, duration: Optional[float] = None,
                          motion_score: Optional[float] = None) -> bool:
        """
        Upload a motion-detected video clip with metadata
        
        Args:
            video_path: Path to the video file
            duration: Optional clip duration in seconds
            motion_score: Optional motion detection score/confidence
            
        Returns:
            True if successful, False otherwise
        """
        metadata = {
            'type': 'motion_clip',
            'timestamp': datetime.now().isoformat(),
        }
        
        if duration is not None:
            metadata['duration'] = str(duration)
        if motion_score is not None:
            metadata['motion_score'] = str(motion_score)
        
        return self.upload_file(video_path, metadata=metadata)
    
    def list_recent_uploads(self, prefix: str = "motion_detections/", max_items: int = 10):
        """
        List recent uploads from S3
        
        Args:
            prefix: S3 key prefix to filter
            max_items: Maximum number of items to return
            
        Returns:
            List of S3 object keys
        """
        try:
            response = self.s3_client.list_objects_v2(
                Bucket=self.bucket_name,
                Prefix=prefix,
                MaxKeys=max_items
            )
            
            if 'Contents' in response:
                return [obj['Key'] for obj in sorted(response['Contents'], 
                                                     key=lambda x: x['LastModified'], 
                                                     reverse=True)]
            return []
        except Exception as e:
            logger.error(f"Error listing S3 objects: {e}")
            return []

