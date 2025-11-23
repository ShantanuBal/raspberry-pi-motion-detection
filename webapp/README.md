# Motion Viewer Webapp

A Next.js webapp to view motion detection video clips stored in AWS S3.

## Setup

### 1. Install dependencies

```bash
cd webapp
npm install
```

### 2. Create AWS IAM User for Vercel

Create an IAM policy with read-only S3 access:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::YOUR_BUCKET_NAME",
        "arn:aws:s3:::YOUR_BUCKET_NAME/*"
      ]
    }
  ]
}
```

Then create an IAM user:
1. Go to IAM Console → Users → Create User
2. Name it `motion-viewer-vercel`
3. Attach the policy above
4. Create access keys (for "Application running outside AWS")
5. Save the Access Key ID and Secret Access Key

### 3. Configure environment variables

Copy `.env.example` to `.env.local` and fill in the values:

```bash
cp .env.example .env.local
```

Generate a NextAuth secret:
```bash
openssl rand -base64 32
```

### 4. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Deploy to Vercel

### 1. Push to GitHub

Make sure your code is pushed to a GitHub repository.

### 2. Import to Vercel

1. Go to [vercel.com](https://vercel.com)
2. Click "Add New" → "Project"
3. Import your GitHub repository
4. Set the **Root Directory** to `webapp`

### 3. Configure Environment Variables

In Vercel project settings, add these environment variables:

| Variable | Description |
|----------|-------------|
| `NEXTAUTH_SECRET` | Generate with `openssl rand -base64 32` |
| `NEXTAUTH_URL` | Your Vercel URL (e.g., `https://your-app.vercel.app`) |
| `ADMIN_EMAIL` | Your admin email |
| `ADMIN_PASSWORD` | Your admin password |
| `AWS_REGION` | Your AWS region (e.g., `us-west-2`) |
| `AWS_ACCESS_KEY_ID` | IAM user access key |
| `AWS_SECRET_ACCESS_KEY` | IAM user secret key |
| `S3_BUCKET_NAME` | Your S3 bucket name |

### 4. Deploy

Vercel will automatically deploy when you push to the main branch.
