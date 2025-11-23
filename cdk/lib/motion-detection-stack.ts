import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
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

    // Allow the role to upload to the bucket
    bucket.grantWrite(uploadRole);

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

    // Note: Access keys need to be created manually via AWS Console or CLI
    // After deployment, run:
    // aws iam create-access-key --user-name motion-detection-pi-user
  }
}

