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

The main components of the script are:

- `handleRequest`: The main function that processes incoming requests
- `verifySignature`: Verifies the Ghost webhook signature for security
- `cleanupPermaCacheFolders`: Clears old Perma-Cache folders in BunnyCDN storage

The script listens for POST requests to the `/purge-full-cache` endpoint. When a valid request is received, it:

1. Verifies the Ghost webhook signature
2. Purges the BunnyCDN pull zone cache
3. Cleans up old Perma-Cache folders

Detailed logs are provided at each step for easy monitoring and debugging.

## License

This project is licensed under the MIT License. 
