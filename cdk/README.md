# CDK Stack for Motion Detection System

This CDK stack creates the AWS infrastructure needed for the motion detection system:
- S3 bucket for storing motion detection files
- IAM role with S3 upload permissions
- IAM user that can assume the role

## Prerequisites

1. Install Node.js (v18 or later)

2. Install AWS CDK:
   ```bash
   npm install -g aws-cdk
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. Bootstrap CDK (first time only):
   ```bash
   cdk bootstrap
   ```

## Deployment

1. Configure your AWS credentials:
   ```bash
   aws configure
   ```

2. (Optional) Set bucket name via context:
   ```bash
   cdk deploy --context bucketName=my-motion-detection-bucket
   ```

3. Deploy the stack:
   ```bash
   cdk deploy
   ```

4. After deployment, create access keys for the IAM user:
   ```bash
   aws iam create-access-key --user-name motion-detection-pi-user
   ```

   Save the `AccessKeyId` and `SecretAccessKey` - you'll need these for your Raspberry Pi.

5. Get the role ARN from the stack outputs:
   ```bash
   aws cloudformation describe-stacks --stack-name MotionDetectionStack --query "Stacks[0].Outputs"
   ```

## Configuration

After deployment, update your Raspberry Pi configuration with:
- `AWS_ACCESS_KEY_ID`: From the access key created above
- `AWS_SECRET_ACCESS_KEY`: From the access key created above
- `S3_BUCKET_NAME`: From the stack outputs
- `IAM_ROLE_ARN`: From the stack outputs (for role assumption)

## Stack Outputs

The stack outputs:
- `BucketName`: Name of the S3 bucket
- `BucketArn`: ARN of the S3 bucket
- `RoleArn`: ARN of the IAM role to assume
- `UserName`: IAM user name

## Cleanup

To delete the stack:
```bash
cdk destroy
```

Note: The S3 bucket is set to RETAIN, so it won't be deleted automatically. You'll need to manually empty and delete it if desired.

