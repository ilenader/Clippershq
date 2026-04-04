# Cron Job Setup — External Backup

The Vercel cron runs every hour. As a backup, you can set up an external cron service.

## Using cron-job.org (Free)

1. Go to https://cron-job.org and create a free account
2. Click "Create Cronjob"
3. Configure:
   - **Title**: Clippers HQ Tracking
   - **URL**: `https://clipershq.com/api/cron/tracking`
   - **Schedule**: Every 1 hour (select "Every hour" from dropdown)
   - **HTTP Method**: GET
   - **Headers**: Add header `Authorization` with value `Bearer YOUR_CRON_SECRET_HERE`
     (Replace YOUR_CRON_SECRET_HERE with the actual CRON_SECRET from your Vercel env vars)
4. Save and enable the cron job

## What it does

The tracking cron fetches real-time view counts for all active clips from TikTok and Instagram via Apify, recalculates earnings, and updates fraud scores.

## Verifying it works

Visit `https://clipershq.com/api/cron/tracking` with the correct Authorization header. It should return a JSON response with `processed` and `errors` counts.
