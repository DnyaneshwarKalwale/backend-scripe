# Setting Up Render Cron Job for Scheduled Post Publishing

This document explains how to set up a Render cron job to ensure your scheduled LinkedIn posts are published at the correct time, even when your local system is offline.

## Overview

The application has been configured with a special endpoint that can be triggered by Render's cron job service to process and publish any scheduled posts that are due. This ensures that your scheduled posts will be published reliably, even if your local development environment or server is offline.

## Step 1: Set Environment Variables

First, make sure you have the following environment variable set in your Render service:

```
CRON_JOB_SECRET=your-secure-random-string
```

This secret key protects your cron job endpoint from unauthorized access. Generate a random secure string and use it consistently.

## Step 2: Set Up the Render Cron Job

1. Log in to your Render dashboard: [https://dashboard.render.com/](https://dashboard.render.com/)

2. Click on "New" and select "Cron Job" from the dropdown menu.

3. Configure the cron job:
   - **Name**: `process-scheduled-posts`
   - **Schedule**: `* * * * *` (runs every minute) or choose a frequency that works for you
   - **Command**: `curl https://your-backend-url.onrender.com/api/cron/process-scheduled-posts?secret=your-secure-random-string`
   - Replace `your-backend-url` with your actual Render backend URL
   - Replace `your-secure-random-string` with the same value you used for `CRON_JOB_SECRET`

4. Click "Create Cron Job"

## Testing the Cron Job

To test that your cron job is working correctly:

1. Create a scheduled post in the application with a time set a few minutes in the future
2. Wait for the scheduled time to pass
3. Check the "Published" tab in your Post Library to see if the post was published
4. You can also check the Render logs for your cron job to see what happened

## Adjusting the Frequency

The default configuration checks for due posts every minute. If you want to check less frequently, you can adjust the cron schedule. For example:

- `*/5 * * * *` - Run every 5 minutes
- `0 * * * *` - Run at the beginning of every hour
- `0 */2 * * *` - Run every 2 hours

## Troubleshooting

If scheduled posts aren't being published automatically:

1. Check the environment variables in your Render service
2. Verify that the CRON_JOB_SECRET matches in both the environment variable and the cron job URL
3. Check the Render logs for your cron job for any errors
4. Try running the curl command manually to see if it works

## Security Note

The cron job endpoint is protected by the secret key, but it's still a good practice to keep this key secure and change it periodically. 