"""
AWS CloudWatch Client Module for Motion Detection System
Handles CloudWatch Logs and Metrics with assumed role credentials
"""

import boto3
import logging
from datetime import datetime
from typing import Optional

# Configure logging
logger = logging.getLogger(__name__)


class CloudWatchClient:
    """Handles CloudWatch Logs and Metrics with assumed role credentials"""

    def __init__(self, region: str = 'us-east-1', role_arn: Optional[str] = None):
        """
        Initialize CloudWatch client

        Args:
            region: AWS region
            role_arn: Optional IAM role ARN to assume for CloudWatch access
        """
        self.region = region
        self.role_arn = role_arn
        self.logs_client = None
        self.metrics_client = None
        self.log_handler = None

        # Initialize clients
        self._init_clients()

    def _init_clients(self):
        """Initialize CloudWatch Logs and Metrics clients"""
        try:
            if self.role_arn:
                # Assume IAM role to get temporary credentials
                sts_client = boto3.client('sts', region_name=self.region)
                response = sts_client.assume_role(
                    RoleArn=self.role_arn,
                    RoleSessionName='motion-detection-cloudwatch-session'
                )
                credentials = response['Credentials']

                # Create CloudWatch clients with temporary credentials
                self.logs_client = boto3.client(
                    'logs',
                    region_name=self.region,
                    aws_access_key_id=credentials['AccessKeyId'],
                    aws_secret_access_key=credentials['SecretAccessKey'],
                    aws_session_token=credentials['SessionToken']
                )

                self.metrics_client = boto3.client(
                    'cloudwatch',
                    region_name=self.region,
                    aws_access_key_id=credentials['AccessKeyId'],
                    aws_secret_access_key=credentials['SecretAccessKey'],
                    aws_session_token=credentials['SessionToken']
                )
                logger.info(f"CloudWatch clients initialized with assumed role: {self.role_arn}")
            else:
                # Use default credentials
                self.logs_client = boto3.client('logs', region_name=self.region)
                self.metrics_client = boto3.client('cloudwatch', region_name=self.region)
                logger.info("CloudWatch clients initialized with default credentials")

        except Exception as e:
            logger.warning(f"Failed to initialize CloudWatch clients: {e}")
            self.logs_client = None
            self.metrics_client = None

    def get_log_handler(self, log_group: str, stream_name: str):
        """
        Get a CloudWatch Logs handler for Python logging

        Args:
            log_group: CloudWatch log group name
            stream_name: CloudWatch log stream name

        Returns:
            CloudWatch log handler or None if watchtower is not available
        """
        if not self.logs_client:
            logger.warning("CloudWatch Logs client not initialized")
            return None

        try:
            from watchtower import CloudWatchLogHandler

            handler = CloudWatchLogHandler(
                log_group=log_group,
                stream_name=stream_name,
                boto3_client=self.logs_client,
                send_interval=5,  # Send logs every 5 seconds
                create_log_group=True  # Auto-create log group
            )
            handler.setFormatter(
                logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
            )
            self.log_handler = handler
            logger.info(f"CloudWatch log handler created: {log_group}/{stream_name}")
            return handler

        except ImportError:
            logger.warning("watchtower not installed - CloudWatch logging disabled")
            return None
        except Exception as e:
            logger.warning(f"Failed to create CloudWatch log handler: {e}")
            return None

    def send_metric(self, metric_name: str, value: float = 1.0,
                   unit: str = 'Count', namespace: str = 'RaspberryPi/MotionDetection',
                   dimensions: Optional[list] = None):
        """
        Send a custom metric to CloudWatch

        Args:
            metric_name: Name of the metric
            value: Metric value
            unit: Metric unit (Count, Seconds, Bytes, etc.)
            namespace: CloudWatch namespace
            dimensions: Optional list of dimension dicts [{'Name': 'foo', 'Value': 'bar'}]
        """
        if not self.metrics_client:
            return

        try:
            metric_data = {
                'MetricName': metric_name,
                'Value': value,
                'Unit': unit,
                'Timestamp': datetime.utcnow()
            }

            if dimensions:
                metric_data['Dimensions'] = dimensions

            self.metrics_client.put_metric_data(
                Namespace=namespace,
                MetricData=[metric_data]
            )
            logger.debug(f"Sent CloudWatch metric: {metric_name}={value} {unit}")

        except Exception as e:
            logger.warning(f"Failed to send CloudWatch metric {metric_name}: {e}")
