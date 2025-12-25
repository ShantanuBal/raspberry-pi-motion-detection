const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { S3Client, HeadObjectCommand } = require('@aws-sdk/client-s3');

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const s3Client = new S3Client({});

const VIDEOS_TABLE = process.env.VIDEOS_TABLE_NAME || '';

exports.handler = async (event) => {
  console.log('Received S3 event:', JSON.stringify(event, null, 2));

  for (const record of event.Records) {
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));

    // Only process .mp4 files in motion_detections/ folder
    if (!key.endsWith('.mp4') || !key.startsWith('motion_detections/')) {
      console.log(`Skipping non-video file: ${key}`);
      continue;
    }

    try {
      // Get object metadata
      const headCommand = new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      });
      const headResponse = await s3Client.send(headCommand);

      // Log the entire metadata object for debugging
      console.log(`Raw S3 metadata for ${key}:`, JSON.stringify(headResponse.Metadata, null, 2));

      const fileName = key.split('/').pop() || '';
      const uploadedAt = Math.floor((headResponse.LastModified?.getTime() || Date.now()) / 1000);

      // Calculate TTL (90 days from upload, matching S3 lifecycle)
      const ttl = uploadedAt + (90 * 24 * 60 * 60);

      // Extract camera type from filename or metadata
      let cameraType = headResponse.Metadata?.camera || 'unknown';
      console.log(`Camera type from metadata: ${cameraType}`);
      if (cameraType === 'unknown') {
        // Try to infer from filename
        if (fileName.includes('picamera')) {
          cameraType = 'picamera';
        } else if (fileName.includes('usb')) {
          cameraType = 'usb';
        }
        console.log(`Camera type inferred from filename: ${cameraType}`);
      }

      // Extract detected objects from metadata
      let detectedObjects = [];
      console.log(`Checking for detected_objects in metadata...`);
      console.log(`headResponse.Metadata?.detected_objects = ${headResponse.Metadata?.detected_objects}`);

      if (headResponse.Metadata?.detected_objects) {
        // Parse comma-separated list of objects
        detectedObjects = headResponse.Metadata.detected_objects
          .split(',')
          .map(obj => obj.trim())
          .filter(obj => obj.length > 0);
        console.log(`✓ Detected objects parsed: ${detectedObjects.join(', ')}`);
      } else {
        console.log(`✗ No detected_objects found in metadata`);
      }

      // Extract bounding box data from metadata
      let detectionsBboxes = null;
      console.log(`Checking for detections_bboxes in metadata...`);
      console.log(`headResponse.Metadata?.detections_bboxes = ${headResponse.Metadata?.detections_bboxes ? 'present' : 'missing'}`);

      if (headResponse.Metadata?.detections_bboxes) {
        try {
          detectionsBboxes = JSON.parse(headResponse.Metadata.detections_bboxes);
          console.log(`✓ Bounding boxes parsed: ${detectionsBboxes.length} detections`);
        } catch (err) {
          console.error(`✗ Failed to parse detections_bboxes JSON: ${err.message}`);
        }
      } else {
        console.log(`✗ No detections_bboxes found in metadata`);
      }

      // Store video metadata in DynamoDB
      const item = {
        videoKey: key,
        partition: 'all', // Single partition for GSI queries
        fileName: fileName,
        uploadedAt: uploadedAt,
        size: record.s3.object.size,
        camera: cameraType,
        bucket: bucket,
        ttl: ttl,
      };

      // Add detected objects if any were found
      if (detectedObjects.length > 0) {
        item.detectedObjects = detectedObjects;
      }

      // Add bounding box data if available
      if (detectionsBboxes && detectionsBboxes.length > 0) {
        item.detectionsBboxes = detectionsBboxes;
      }

      await docClient.send(new PutCommand({
        TableName: VIDEOS_TABLE,
        Item: item,
      }));

      console.log(`Successfully indexed video: ${key}`);
    } catch (error) {
      console.error(`Error processing ${key}:`, error);
      throw error; // Re-throw to trigger Lambda retry
    }
  }
};
