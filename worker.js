/**
 * Cloudflare Service Worker for BunnyCDN Cache Purging with Ghost Webhook Verification and Full Perma-Cache Cleanup
 *
 * Required Environment Variables:
 * - GHOST_WEBHOOK_SECRET: Your Ghost webhook secret
 * - BUNNY_PULLZONE_ID: Your BunnyCDN pull zone ID
 * - BUNNY_API_KEY: Your BunnyCDN account API key
 * - BUNNY_STORAGE_ZONE_HOSTNAME: Your storage zone hostname (e.g., "ny.storage.bunnycdn.com")
 * - BUNNY_STORAGE_ZONE_NAME: Your storage zone name
 * - BUNNY_STORAGE_ZONE_PASSWORD: Your storage zone password
 */

addEventListener("fetch", (event) => {
  event.respondWith(
    handleRequest(event).catch((error) => {
      console.error("Unhandled error in fetch event:", error);
      return new Response(`An unhandled error occurred: ${error.message}`, {
        status: 500,
      });
    })
  );
});

async function handleRequest(event) {
  try {
    console.log("Worker started");
    const { request } = event;

    console.log("Checking environment variables");
    console.log("Available environment variables:", Object.keys(self));

    // Check if required environment variables are set
    const requiredEnvVars = [
      "GHOST_WEBHOOK_SECRET",
      "BUNNY_PULLZONE_ID",
      "BUNNY_API_KEY",
      "BUNNY_STORAGE_ZONE_HOSTNAME",
      "BUNNY_STORAGE_ZONE_NAME",
      "BUNNY_STORAGE_ZONE_PASSWORD",
    ];
    for (const varName of requiredEnvVars) {
      if (!(varName in self)) {
        throw new Error(`Missing required environment variable: ${varName}`);
      }
    }
    console.log("All required environment variables are set");

    const { pathname } = new URL(request.url);
    console.log("Request path:", pathname);

    // Check if the request is to trigger full cache purge
    if (pathname === "/purge-full-cache") {
      console.log("Verifying Ghost webhook signature");
      // Verify the Ghost webhook signature
      const isValid = await verifySignature(request);
      if (!isValid) {
        console.log("Invalid signature");
        return new Response("Invalid signature", { status: 403 });
      }
      console.log("Signature verified successfully");

      console.log("Purging BunnyCDN pull zone cache");
      // Purge the entire BunnyCDN pull zone cache
      const purgeResponse = await fetch(
        `https://api.bunny.net/pullzone/${self.BUNNY_PULLZONE_ID}/purgeCache`,
        {
          method: "POST",
          headers: {
            AccessKey: self.BUNNY_API_KEY,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
        }
      );

      if (purgeResponse.ok) {
        console.log("Cache purge successful");
        console.log(
          `Pull zone cache cleared for zone ID: ${self.BUNNY_PULLZONE_ID}`
        );
        // If purge was successful, clean up all Perma-Cache folders
        console.log("Cleaning up Perma-Cache folders");
        const cleanupResult = await cleanupPermaCacheFolders();
        console.log("Cleanup completed");
        return new Response(
          `Full cache purge initiated successfully. Cleanup result: ${cleanupResult}`
        );
      } else {
        console.log("Cache purge failed");
        throw new Error(
          `Failed to purge cache. Status: ${purgeResponse.status}`
        );
      }
    } else {
      console.log("Invalid path");
      return new Response("Not Found", { status: 404 });
    }
  } catch (error) {
    console.error("Error in handleRequest:", error);
    return new Response(`An error occurred: ${error.message}`, { status: 500 });
  }
}

async function verifySignature(request) {
  try {
    const signatureHeader = request.headers.get("X-Ghost-Signature");
    if (!signatureHeader) {
      return false;
    }

    // Extract the hash and timestamp from the X-Ghost-Signature header
    const [sigHash, timeStamp] = signatureHeader.split(", ");
    const [, hash] = sigHash.split("=");
    const [, ts] = timeStamp.split("=");

    const currentTime = Date.now();
    // Check if the timestamp is within 5 minutes of the current time
    if (Math.abs(currentTime - parseInt(ts)) > 5 * 60 * 1000) {
      return false;
    }

    const secret = self.GHOST_WEBHOOK_SECRET;
    if (!secret) {
      return false;
    }

    const body = await request.text();

    // Create the message by concatenating the body and timestamp
    const message = `${body}${ts}`;

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signature = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(message)
    );
    const computedHash = Array.from(new Uint8Array(signature))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return computedHash === hash;
  } catch (error) {
    console.error("Error in verifySignature");
    return false;
  }
}

async function cleanupPermaCacheFolders() {
  try {
    console.log("Starting Perma-Cache folder cleanup");
    // Get list of Perma-Cache folders
    const listResponse = await fetch(
      `https://${self.BUNNY_STORAGE_ZONE_HOSTNAME}/${self.BUNNY_STORAGE_ZONE_NAME}/__bcdn_perma_cache__/`,
      {
        method: "GET",
        headers: {
          AccessKey: self.BUNNY_STORAGE_ZONE_PASSWORD,
          Accept: "application/json",
        },
      }
    );

    if (!listResponse.ok) {
      throw new Error(
        `Failed to list Perma-Cache folders. Status: ${listResponse.status}`
      );
    }

    const folders = await listResponse.json();
    console.log("Number of folders found:", folders.length);

    let deletedCount = 0;
    let failedCount = 0;

    // Delete all folders
    for (const folder of folders) {
      console.log(`Attempting to delete folder: ${folder.ObjectName}`);
      const deleteResponse = await fetch(
        `https://${self.BUNNY_STORAGE_ZONE_HOSTNAME}/${self.BUNNY_STORAGE_ZONE_NAME}/__bcdn_perma_cache__/${folder.ObjectName}/`,
        {
          method: "DELETE",
          headers: {
            AccessKey: self.BUNNY_STORAGE_ZONE_PASSWORD,
            Accept: "application/json",
          },
        }
      );

      if (deleteResponse.ok) {
        console.log(`Deleted folder: ${folder.ObjectName}`);
        deletedCount++;
      } else {
        console.error(
          `Failed to delete folder: ${folder.ObjectName}. Status: ${deleteResponse.status}`
        );
        failedCount++;
      }
    }

    console.log(
      `Cleanup completed. Deleted: ${deletedCount}, Failed: ${failedCount}`
    );
    return `Cleanup completed. Total folders: ${folders.length}, Deleted: ${deletedCount}, Failed: ${failedCount}`;
  } catch (error) {
    console.error("Error in cleanupPermaCacheFolders:", error);
    return `Error during cleanup: ${error.message}`;
  }
}
