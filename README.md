# Ghost BunnyCDN Cache Purger

## Motivation

BunnyCDN's Perma-Cache feature retains files in a new directory structure after a full pull zone purge. While this can improve performance in some scenarios, it may lead to unnecessary storage costs over time. This webhook-based solution automates the clearing of old cache folders, preventing excessive space usage and associated expenses.

## Features

- Automatically purges BunnyCDN pull zone cache upon receiving a webhook from Ghost CMS
- Clears old Perma-Cache folders to prevent unnecessary storage usage
- Verifies webhook signatures for security
- Logs detailed information for easy debugging and monitoring
- Designed to run as a Cloudflare Worker for scalability and low latency

## Installation

1. Clone this repository:
   ```
   git clone https://github.com/yourusername/bunnycdn-cache-purger.git
   ```

2. Set up a Cloudflare Worker:
   - Log in to your Cloudflare account and navigate to the Workers section
   - Create a new Worker and paste the contents of `index.js` into the script editor

3. Set up environment variables in your Cloudflare Worker:
   - GHOST_WEBHOOK_SECRET: Your Ghost webhook secret
   - BUNNY_PULLZONE_ID: Your BunnyCDN pull zone ID
   - BUNNY_API_KEY: Your BunnyCDN account API key
   - BUNNY_STORAGE_ZONE_HOSTNAME: Your storage zone hostname (e.g., "ny.storage.bunnycdn.com")
   - BUNNY_STORAGE_ZONE_NAME: Your storage zone name
   - BUNNY_STORAGE_ZONE_PASSWORD: Your storage zone password

4. Configure your Ghost CMS to send webhooks to your Cloudflare Worker URL when content is published or updated

## Code Overview

### Main Request Handler

The `handleRequest` function is the main entry point for processing requests:

1. It first checks if all required environment variables are set.
2. It then examines the request path.
3. If the path is '/purge-full-cache', it proceeds with the cache purging process.

### Authentication

The code supports two types of authentication:

1. **Manual Trigger**: It checks for a 'manualtriggertoken' header. If this matches the `MANUAL_TRIGGER_TOKEN` environment variable, it bypasses further authentication.

2. **Ghost Webhook Verification**: If it's not a manual trigger, it verifies the request signature using the `verifySignature` function. This function:
   - Extracts the signature and timestamp from the 'X-Ghost-Signature' header.
   - Checks if the timestamp is within 5 minutes of the current time.
   - Computes a hash using the request body, timestamp, and the `GHOST_WEBHOOK_SECRET`.
   - Compares the computed hash with the provided signature.

### Cache Purging

If authentication is successful, the code proceeds to purge the BunnyCDN cache:

1. It sends a POST request to the BunnyCDN API to purge the entire pull zone cache.
2. The pull zone ID and API key are taken from environment variables.

### Perma-Cache Cleanup

After successfully purging the cache, it calls the `cleanupPermaCacheFolders` function:

1. This function first fetches a list of all folders in the '__bcdn_perma_cache__' directory of the BunnyCDN storage zone.
2. It then iterates through each folder and sends a DELETE request to remove it.
3. It keeps track of successful deletions and failures.

### Error Handling and Logging

Throughout the code, there are numerous `console.log` statements for debugging and error tracking. Each major function also has try-catch blocks to handle and log errors.

### Response

The worker responds with different HTTP status codes based on the outcome:
- 200: Successful cache purge and cleanup
- 403: Invalid signature
- 404: Invalid path
- 500: Any other errors

## License

This project is licensed under the MIT License. 
