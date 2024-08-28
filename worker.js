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

const HTTP_OK = 200;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_SERVER_ERROR = 500;

const REQUIRED_ENV_VARS = [
    "GHOST_WEBHOOK_SECRET",
    "BUNNY_PULLZONE_ID",
    "BUNNY_API_KEY",
    "BUNNY_STORAGE_ZONE_HOSTNAME",
    "BUNNY_STORAGE_ZONE_NAME",
    "BUNNY_STORAGE_ZONE_PASSWORD",
    "MANUAL_TRIGGER_TOKEN",
];

addEventListener("fetch", (event) => {
    event.respondWith(handleRequest(event));
});

async function handleRequest(event) {
    try {
        log("info", "Worker started");
        const { request } = event;

        validateEnvironmentVariables();

        const { pathname } = new URL(request.url);
        log("info", "Request path:", { pathname });

        if (pathname === "/purge-full-cache") {
            return handlePurgeFullCache(request);
        } else {
            return new Response("Not Found", { status: HTTP_NOT_FOUND });
        }
    } catch (error) {
        return handleError(error, "Error in handleRequest:");
    }
}

function validateEnvironmentVariables() {
    log("info", "Checking environment variables");
    for (const varName of REQUIRED_ENV_VARS) {
        if (!(varName in self)) {
            throw new Error(
                `Missing required environment variable: ${varName}`
            );
        }
    }
    log("info", "All required environment variables are set");
}

async function handlePurgeFullCache(request) {
    const manualTriggerToken = request.headers.get("manualtriggertoken");
    log("info", "Received token:", { manualTriggerToken });

    if (manualTriggerToken !== self.MANUAL_TRIGGER_TOKEN) {
        log("info", "Verifying Ghost webhook signature");
        const isValid = await verifySignature(request);
        if (!isValid) {
            log("warn", "Invalid signature");
            return new Response("Invalid signature", {
                status: HTTP_FORBIDDEN,
            });
        }
        log("info", "Signature verified successfully");
    } else {
        log(
            "info",
            "Manual trigger token matched, skipping signature verification"
        );
    }

    await purgeBunnyCDNCache();
    const cleanupResult = await cleanupPermaCacheFolders();
    return new Response(
        `Full cache purge initiated successfully. Cleanup result: ${cleanupResult}`
    );
}

async function verifySignature(request) {
    try {
        const signatureHeader = request.headers.get("X-Ghost-Signature");
        if (!signatureHeader) return false;

        const [sigHash, timeStamp] = signatureHeader.split(", ");
        const [, hash] = sigHash.split("=");
        const [, ts] = timeStamp.split("=");

        if (Math.abs(Date.now() - parseInt(ts)) > 5 * 60 * 1000) return false;

        const secret = self.GHOST_WEBHOOK_SECRET;
        if (!secret) return false;

        const body = await request.text();
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
        return handleError(error, "Error in verifySignature:");
    }
}

async function purgeBunnyCDNCache() {
    log("info", "Purging BunnyCDN pull zone cache");
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

    if (!purgeResponse.ok) {
        throw new Error(
            `Failed to purge cache. Status: ${purgeResponse.status}`
        );
    }

    log(
        "info",
        `Pull zone cache cleared for zone ID: ${self.BUNNY_PULLZONE_ID}`
    );
}

async function cleanupPermaCacheFolders() {
    try {
        log("info", "Starting Perma-Cache folder cleanup");
        const folders = await listPermaCacheFolders();
        log("info", "Number of folders found:", { count: folders.length });

        const deletePromises = folders.map(deleteFolder);
        const results = await Promise.all(deletePromises);

        const deletedCount = results.filter(Boolean).length;
        const failedCount = results.length - deletedCount;

        log("info", "Cleanup completed", { deletedCount, failedCount });
        return `Cleanup completed. Total folders: ${folders.length}, Deleted: ${deletedCount}, Failed: ${failedCount}`;
    } catch (error) {
        return handleError(error, "Error in cleanupPermaCacheFolders:");
    }
}

async function listPermaCacheFolders() {
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

    return listResponse.json();
}

async function deleteFolder(folder) {
    log("info", `Attempting to delete folder: ${folder.ObjectName}`);
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
        log("info", `Deleted folder: ${folder.ObjectName}`);
        return true;
    } else {
        log("error", `Failed to delete folder: ${folder.ObjectName}`, {
            status: deleteResponse.status,
        });
        return false;
    }
}

function handleError(error, customMessage = "") {
    log("error", `${customMessage} ${error.message}`);
    return new Response(`An error occurred: ${error.message}`, {
        status: HTTP_SERVER_ERROR,
    });
}

function log(level, message, data = {}) {
    console[level](`[${level.toUpperCase()}] ${message}`, JSON.stringify(data));
}
