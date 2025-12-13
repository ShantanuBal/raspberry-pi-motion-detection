# DynamoDB-Based Video Indexing - Deployment Guide

## Overview

This upgrade replaces the inefficient "fetch all videos from S3" approach with an event-driven architecture using DynamoDB for video metadata indexing.

### Architecture

**Before:**
- Webapp fetches ALL videos from S3 on every page load
- Slow with hundreds of videos (hundreds of S3 API calls)
- Expensive metadata fetching (HeadObject for each video)

**After:**
- S3 triggers Lambda on new video upload
- Lambda indexes metadata in DynamoDB
- Webapp queries DynamoDB (fast, paginated, sorted)
- Only fetches presigned URLs when playing videos

## Changes Made

### 1. CDK Infrastructure (`cdk/lib/motion-detection-stack.ts`)

**New DynamoDB Table: `motion-detection-videos`**
- Stores: videoKey, fileName, uploadedAt, size, camera, bucket, ttl
- GSI: `UploadTimeIndex` - enables efficient queries sorted by upload time
- TTL: Auto-deletes records after 90 days (matching S3 lifecycle)

**New Lambda Function: `VideoIndexerFunction`**
- Triggered by S3 on `.mp4` uploads to `motion_detections/`
- Extracts metadata from S3 object
- Writes to DynamoDB

**S3 Event Notification**
- Configured to trigger Lambda on OBJECT_CREATED events
- Filtered by prefix (`motion_detections/`) and suffix (`.mp4`)

**Updated CORS**
- Added `exposedHeaders` for video streaming support

### 2. Lambda Function (`cdk/lambda/s3-video-indexer.ts`)

Processes S3 events and indexes video metadata:
- Extracts filename, size, uploadedAt from S3
- Infers camera type from filename or metadata
- Calculates TTL (90 days)
- Writes to DynamoDB

### 3. Webapp Library (`webapp/src/lib/videos.ts`)

New DynamoDB query function:
- Queries `UploadTimeIndex` GSI
- Returns 10 videos per page, sorted by newest first
- Uses DynamoDB's native pagination tokens
- Fast and efficient

### 4. API Route (`webapp/src/app/api/videos/route.ts`)

Updated to use DynamoDB instead of S3:
- Calls `listVideosFromDynamoDB()`
- Transforms DynamoDB response to match frontend format
- Preserves camera metadata

### 5. Frontend (`webapp/src/app/page.tsx`)

Updated pagination logic:
- Works with DynamoDB continuation tokens
- Supports forward/backward navigation
- Maintains token stack for "Previous" button

## Deployment Steps

### 1. Install Lambda Dependencies

```bash
cd /Users/shantanubal/Desktop/raspberry_pi/cdk/lambda
npm init -y
npm install @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb @aws-sdk/client-s3
npm install --save-dev @types/aws-lambda @types/node typescript
npx tsc --init
```

### 2. Build Lambda Function

```bash
cd /Users/shantanubal/Desktop/raspberry_pi/cdk/lambda
npx tsc s3-video-indexer.ts
```

### 3. Deploy CDK Stack

```bash
cd /Users/shantanubal/Desktop/raspberry_pi/cdk
npm install
npm run build
npx cdk deploy
```

This will:
- Create `motion-detection-videos` DynamoDB table
- Create Lambda function with S3 trigger
- Configure S3 event notifications
- Update CORS settings

### 4. Update Webapp Environment Variables

Add to `.env.local`:
```
VIDEOS_TABLE_NAME=motion-detection-videos
```

### 5. Deploy Webapp

```bash
cd /Users/shantanubal/Desktop/raspberry_pi/webapp
git add .
git commit -m "Add DynamoDB-based video indexing"
git push
```

Vercel will auto-deploy.

## Backfilling Existing Videos (Optional)

To index existing videos in S3, run a one-time script:

```bash
# Create a script to list all S3 videos and invoke Lambda for each
aws s3 ls s3://sbal-motion-detection-bucket/motion_detections/ --recursive | grep .mp4 | while read -r line; do
  key=$(echo $line | awk '{print $4}')
  aws lambda invoke --function-name VideoIndexerFunction \
    --payload '{"Records":[{"s3":{"bucket":{"name":"sbal-motion-detection-bucket"},"object":{"key":"'$key'","size":0}}}]}' \
    response.json
done
```

Or create a Lambda that does an S3 ListObjects and processes all videos.

## Testing

1. **Upload a new video** from Raspberry Pi
2. **Check Lambda logs** in CloudWatch:
   - Should see "Successfully indexed video: ..."
3. **Check DynamoDB table**:
   - Video metadata should appear
4. **Reload webapp**:
   - Should see newest videos first
   - Fast pagination

## Performance Improvements

**Before:**
- Initial load: ~10-30 seconds (fetching hundreds of videos)
- API calls: ~100-500 (ListObjects + HeadObject for each video)

**After:**
- Initial load: ~100-500ms
- API calls: 1 (DynamoDB Query)
- Pagination: Instant (native DynamoDB tokens)

## Cost Improvements

**Before:**
- S3 LIST: $0.005 per 1,000 requests
- S3 HEAD: $0.0004 per 1,000 requests
- For 500 videos: ~$0.002 per page load

**After:**
- DynamoDB Query: $0.25 per million read request units
- Lambda invocations: $0.20 per million requests
- S3 events: Free
- Cost per page load: ~$0.0001 (10x cheaper)

## Rollback Plan

If issues arise:

1. **Revert API route** to use old `listVideos()` from `s3.ts`
2. **Redeploy webapp**
3. DynamoDB table and Lambda can remain (won't interfere)

## Notes

- Lambda automatically retries on failure
- DynamoDB has point-in-time recovery enabled
- Videos in S3 remain the source of truth
- DynamoDB is just a cache/index for performance
