import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import { Construct } from 'constructs';

export class MotionDetectionStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // S3 Bucket for motion detection files
    const bucket = new s3.Bucket(this, 'MotionDetectionBucket', {
      bucketName: 'sbal-motion-detection-bucket',
      versioned: false,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.RETAIN, // Keep bucket when stack is deleted
      autoDeleteObjects: false, // Don't auto-delete objects
      lifecycleRules: [
        {
          id: 'DeleteOldFiles',
          expiration: cdk.Duration.days(90), // Delete files after 90 days
          enabled: true,
        },
      ],
      cors: [
        {
          allowedHeaders: ['*'],
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.HEAD],
          allowedOrigins: ['http://localhost:3000', 'https://raspberry-pi-motion-detection.vercel.app'],
          exposedHeaders: ['Content-Length', 'Content-Range', 'Accept-Ranges', 'ETag'],
        },
      ],
    });

    // DynamoDB Table for video metadata
    const videosTable = new dynamodb.Table(this, 'VideosTable', {
      tableName: 'motion-detection-videos',
      partitionKey: {
        name: 'videoKey',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      pointInTimeRecovery: true,
      timeToLiveAttribute: 'ttl', // Auto-delete records after video expires
    });

    // Add GSI to query videos sorted by upload time (newest first)
    videosTable.addGlobalSecondaryIndex({
      indexName: 'UploadTimeIndex',
      partitionKey: {
        name: 'partition',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'uploadedAt',
        type: dynamodb.AttributeType.NUMBER,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // DynamoDB Table for starred videos
    const starredVideosTable = new dynamodb.Table(this, 'StarredVideosTable', {
      tableName: 'motion-detection-starred-videos',
      partitionKey: {
        name: 'userId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'videoKey',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      pointInTimeRecovery: true,
    });

    // Add GSI to query all starred videos for a user sorted by timestamp
    starredVideosTable.addGlobalSecondaryIndex({
      indexName: 'UserTimestampIndex',
      partitionKey: {
        name: 'userId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'starredAt',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // IAM User for the Raspberry Pi
    // This user can assume the role to get temporary credentials
    const uploadUser = new iam.User(this, 'MotionDetectionUser', {
      userName: 'motion-detection-pi-user',
    });

    // IAM Role for the Raspberry Pi to assume
    // This role has permissions to upload to S3
    // The user can assume this role to get temporary credentials
    const uploadRole = new iam.Role(this, 'MotionDetectionUploadRole', {
      assumedBy: uploadUser, // Allow the user to assume this role
      description: 'Role for Raspberry Pi to upload motion detection files to S3',
    });

    // Allow the role to upload to the bucket and list objects
    bucket.grantWrite(uploadRole);
    bucket.grantRead(uploadRole); // Allows ListBucket for verification

    // Grant CloudWatch Logs permissions
    uploadRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents',
        'logs:DescribeLogStreams',
      ],
      resources: [
        `arn:aws:logs:${this.region}:${this.account}:log-group:/raspberry-pi/motion-detection`,
        `arn:aws:logs:${this.region}:${this.account}:log-group:/raspberry-pi/motion-detection:*`,
      ],
    }));

    // Grant CloudWatch Metrics permissions
    uploadRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'cloudwatch:PutMetricData',
      ],
      resources: ['*'], // CloudWatch metrics don't support resource-level permissions
      conditions: {
        StringEquals: {
          'cloudwatch:namespace': 'RaspberryPi/MotionDetection',
        },
      },
    }));

    // IAM User for Vercel webapp (read-only access)
    const vercelUser = new iam.User(this, 'MotionViewerVercelUser', {
      userName: 'motion-viewer-vercel-user',
    });

    // Grant read-only access to the bucket for the Vercel user
    bucket.grantRead(vercelUser);

    // Grant DynamoDB permissions to Vercel user for starred videos and video metadata
    starredVideosTable.grantReadWriteData(vercelUser);
    videosTable.grantReadData(vercelUser);

    // Lambda function to index videos when uploaded to S3
    const videoIndexerLambda = new lambda.Function(this, 'VideoIndexerFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 's3-video-indexer.handler',
      code: lambda.Code.fromAsset('lambda'),
      environment: {
        VIDEOS_TABLE_NAME: videosTable.tableName,
      },
      timeout: cdk.Duration.seconds(30),
    });

    // Grant Lambda permissions to read S3 and write to DynamoDB
    bucket.grantRead(videoIndexerLambda);
    videosTable.grantWriteData(videoIndexerLambda);

    // Configure S3 to trigger Lambda on new video uploads
    bucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(videoIndexerLambda),
      { prefix: 'motion_detections/', suffix: '.mp4' }
    );

    // Outputs
    new cdk.CfnOutput(this, 'BucketName', {
      value: bucket.bucketName,
      description: 'Name of the S3 bucket for motion detection files',
    });

    new cdk.CfnOutput(this, 'BucketArn', {
      value: bucket.bucketArn,
      description: 'ARN of the S3 bucket',
    });

    new cdk.CfnOutput(this, 'RoleArn', {
      value: uploadRole.roleArn,
      description: 'ARN of the IAM role to assume for S3 uploads',
    });

    new cdk.CfnOutput(this, 'UserName', {
      value: uploadUser.userName,
      description: 'IAM user name for accessing the role',
    });

    new cdk.CfnOutput(this, 'VercelUserName', {
      value: vercelUser.userName,
      description: 'IAM user name for Vercel webapp (read-only access)',
    });

    new cdk.CfnOutput(this, 'VideosTableName', {
      value: videosTable.tableName,
      description: 'Name of the DynamoDB table for video metadata',
    });

    new cdk.CfnOutput(this, 'StarredVideosTableName', {
      value: starredVideosTable.tableName,
      description: 'Name of the DynamoDB table for starred videos',
    });

    // CloudWatch Dashboard
    const dashboard = new cloudwatch.Dashboard(this, 'MotionDetectionDashboard', {
      dashboardName: 'MotionDetectionSystem',
      defaultInterval: cdk.Duration.days(7),
    });

    // Row 1: System Health & Activity
    dashboard.addWidgets(
      // Raspberry Pi Heartbeat
      new cloudwatch.GraphWidget({
        title: 'Raspberry Pi Heartbeat',
        width: 8,
        left: [
          new cloudwatch.Metric({
            namespace: 'RaspberryPi/MotionDetection',
            metricName: 'SystemHeartbeat',
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
        ],
      }),
      // Motion Detection Events
      new cloudwatch.GraphWidget({
        title: 'Motion Detected Events',
        width: 8,
        left: [
          new cloudwatch.Metric({
            namespace: 'RaspberryPi/MotionDetection',
            metricName: 'MotionDetected',
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
        ],
      }),
      // Video Uploads
      new cloudwatch.GraphWidget({
        title: 'Video Uploads',
        width: 8,
        left: [
          new cloudwatch.Metric({
            namespace: 'RaspberryPi/MotionDetection',
            metricName: 'VideoUploaded',
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
            color: cloudwatch.Color.GREEN,
          }),
          new cloudwatch.Metric({
            namespace: 'RaspberryPi/MotionDetection',
            metricName: 'UploadFailed',
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
            color: cloudwatch.Color.RED,
          }),
        ],
      }),
    );

    // Row 2: Video Metrics
    dashboard.addWidgets(
      // Motion Score
      new cloudwatch.GraphWidget({
        title: 'Motion Detection Score',
        width: 8,
        left: [
          new cloudwatch.Metric({
            namespace: 'RaspberryPi/MotionDetection',
            metricName: 'MotionScore',
            statistic: 'Average',
            period: cdk.Duration.minutes(5),
          }),
        ],
      }),
      // Video Size
      new cloudwatch.GraphWidget({
        title: 'Video Size (MB)',
        width: 8,
        left: [
          new cloudwatch.Metric({
            namespace: 'RaspberryPi/MotionDetection',
            metricName: 'VideoSize',
            statistic: 'Average',
            period: cdk.Duration.minutes(5),
          }),
        ],
      }),
      // Upload Duration
      new cloudwatch.GraphWidget({
        title: 'Upload Duration (seconds)',
        width: 8,
        left: [
          new cloudwatch.Metric({
            namespace: 'RaspberryPi/MotionDetection',
            metricName: 'UploadDuration',
            statistic: 'Average',
            period: cdk.Duration.minutes(5),
          }),
        ],
      }),
    );

    // Row 3: Lambda Metrics
    dashboard.addWidgets(
      // Lambda Invocations
      new cloudwatch.GraphWidget({
        title: 'Lambda Invocations',
        width: 8,
        left: [
          videoIndexerLambda.metricInvocations({
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
        ],
      }),
      // Lambda Errors
      new cloudwatch.GraphWidget({
        title: 'Lambda Errors',
        width: 8,
        left: [
          videoIndexerLambda.metricErrors({
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
            color: cloudwatch.Color.RED,
          }),
          videoIndexerLambda.metricThrottles({
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
            color: cloudwatch.Color.ORANGE,
          }),
        ],
      }),
      // Lambda Duration
      new cloudwatch.GraphWidget({
        title: 'Lambda Duration (ms)',
        width: 8,
        left: [
          videoIndexerLambda.metricDuration({
            statistic: 'Average',
            period: cdk.Duration.minutes(5),
          }),
        ],
      }),
    );

    // Row 4: DynamoDB Metrics
    dashboard.addWidgets(
      // DynamoDB Read/Write Capacity
      new cloudwatch.GraphWidget({
        title: 'DynamoDB Videos Table - Read/Write Units',
        width: 12,
        left: [
          videosTable.metricConsumedReadCapacityUnits({
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
        ],
        right: [
          videosTable.metricConsumedWriteCapacityUnits({
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
        ],
      }),
      // DynamoDB Errors
      new cloudwatch.GraphWidget({
        title: 'DynamoDB Errors',
        width: 12,
        left: [
          videosTable.metricUserErrors({
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
            color: cloudwatch.Color.RED,
          }),
          videosTable.metricSystemErrorsForOperations({
            operations: [dynamodb.Operation.GET_ITEM, dynamodb.Operation.PUT_ITEM, dynamodb.Operation.QUERY],
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
            color: cloudwatch.Color.ORANGE,
          }),
        ],
      }),
    );

    // Row 5: S3 Metrics
    dashboard.addWidgets(
      // S3 Bucket Size
      new cloudwatch.GraphWidget({
        title: 'S3 Bucket Size (Bytes)',
        width: 12,
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/S3',
            metricName: 'BucketSizeBytes',
            dimensionsMap: {
              BucketName: bucket.bucketName,
              StorageType: 'StandardStorage',
            },
            statistic: 'Average',
            period: cdk.Duration.hours(24),
          }),
        ],
      }),
      // S3 Object Count
      new cloudwatch.GraphWidget({
        title: 'S3 Object Count',
        width: 12,
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/S3',
            metricName: 'NumberOfObjects',
            dimensionsMap: {
              BucketName: bucket.bucketName,
              StorageType: 'AllStorageTypes',
            },
            statistic: 'Average',
            period: cdk.Duration.hours(24),
          }),
        ],
      }),
    );

    // Row 6: Alarms Summary
    const uptimeAlarm = new cloudwatch.Alarm(this, 'RaspberryPiDownAlarm', {
      metric: new cloudwatch.Metric({
        namespace: 'RaspberryPi/MotionDetection',
        metricName: 'SystemHeartbeat',
        statistic: 'Sum',
        period: cdk.Duration.minutes(10),
      }),
      threshold: 1,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.BREACHING,
      alarmDescription: 'Raspberry Pi has not sent a heartbeat in 20 minutes',
    });

    const uploadFailureAlarm = new cloudwatch.Alarm(this, 'UploadFailureAlarm', {
      metric: new cloudwatch.Metric({
        namespace: 'RaspberryPi/MotionDetection',
        metricName: 'UploadFailed',
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 3,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      alarmDescription: '3 or more upload failures in 5 minutes',
    });

    const lambdaErrorAlarm = new cloudwatch.Alarm(this, 'LambdaErrorAlarm', {
      metric: videoIndexerLambda.metricErrors({
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 5,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      alarmDescription: 'Lambda function has 5 or more errors in 5 minutes',
    });

    dashboard.addWidgets(
      new cloudwatch.AlarmStatusWidget({
        title: 'System Health Alarms',
        width: 24,
        alarms: [uptimeAlarm, uploadFailureAlarm, lambdaErrorAlarm],
      }),
    );

    // Note: Access keys need to be created manually via AWS Console or CLI
    // After deployment, run:
    // aws iam create-access-key --user-name motion-detection-pi-user
    // aws iam create-access-key --user-name motion-viewer-vercel-user
  }
}

