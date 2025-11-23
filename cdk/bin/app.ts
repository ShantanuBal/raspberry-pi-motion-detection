#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { MotionDetectionStack } from '../lib/motion-detection-stack';

const app = new cdk.App();

new MotionDetectionStack(app, 'MotionDetectionStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  description: 'S3 bucket and IAM role for Raspberry Pi motion detection system',
});

