#!/usr/bin/env bun
/**
 * Dev server with hot reload for static site
 *
 * Features:
 * - Serves dist/ with SPA fallback
 * - Watches pages/ and public/ for changes
 * - Incremental rebuild on changes
 * - WebSocket live reload to connected browsers
 */

import { join, resolve, relative } from "path";
import { fileURLToPath } from "url";
import { watch } from "fs";
import { build } from "./build.ts";

const args = process.argv.slice(2);
let PORT = 8000;
for (let i = 0; i < args.length; i++) {
    if (args[i] === "--host" && args[i + 1] && !args[i + 1].startsWith("-")) {
        PORT = parseInt(args[i + 1], 10);
        if (isNaN(PORT)) PORT = 8000;
        i++;
    }
}
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const DIR = resolve(__dirname, "../dist");
const PAGES_DIR = resolve(__dirname, "../pages");
const PUBLIC_DIR = resolve(__dirname, "../public");

// WebSocket clients for live reload
const wsClients: Set<Bun.ServerWebSocket<unknown>> = new Set();

// Send reload message to all connected clients
function notifyReload(): void {
    const message = JSON.stringify({ type: "reload" });
    for (const client of wsClients) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    }
}

// Debounce rebuilds
let rebuildTimeout: ReturnType<typeof setTimeout> | null = null;
const pendingChanges: Set<string> = new Set();

function scheduleRebuild(changedFile: string): void {
    pendingChanges.add(changedFile);
    if (rebuildTimeout) return;
    rebuildTimeout = setTimeout(async () => {
        rebuildTimeout = null;
        const changes = [...pendingChanges];
        pendingChanges.clear();
        await rebuild(changes);
    }, 100);
}

let isBuilding = false;

async function rebuild(changedFiles: string[]): Promise<void> {
    if (isBuilding) return;
    isBuilding = true;

    try {
        console.log(`\n[dev] Changes detected: ${changedFiles.join(", ")}`);
        const start = performance.now();
        const result = await build();
        const elapsed = (performance.now() - start).toFixed(0);

        console.log(
            `[dev] Rebuilt ${result.pages} pages, ${result.writings} writings, ${result.assets} assets in ${elapsed}ms`,
        );
        for (const writing of result.writingsList.sort((a, b) => b.date.localeCompare(a.date))) {
            console.log(`  ${writing.date}  ${writing.url}`);
        }

        notifyReload();
    } catch (err) {
        console.error("[dev] Build failed:", err);
    } finally {
        isBuilding = false;
    }
}

// Watch pages/ and public/
function watchDir(dir: string): void {
    const watcher = watch(dir, { recursive: true }, (_event, filename) => {
        if (!filename) return;
        if (filename.startsWith("_")) return;
        if (filename === ".DS_Store") return;
        if (filename.endsWith("~")) return;

        const relPath = relative(dir, filename);
        scheduleRebuild(relPath);
    });

    watcher.on("error", (err) => {
        console.error(`[dev] Watch error for ${dir}:`, err);
    });
}

// Initial build
console.log("[dev] Initial build...");
const start = performance.now();
const result = await build();
console.log(
    `[dev] Built ${result.pages} pages, ${result.writings} writings, ${result.assets} assets in ${(performance.now() - start).toFixed(0)}ms`,
);

// Start watching
watchDir(PAGES_DIR);
watchDir(PUBLIC_DIR);
console.log("[dev] Watching for changes...");

// HTTP + WebSocket server
Bun.serve({
    port: PORT,
    fetch(req, server) {
        const url = new URL(req.url);

        // WebSocket upgrade for live reload
        if (url.pathname === "/__dev_ws") {
            server.upgrade(req, { data: undefined });
            return new Response(null, { status: 101 });
        }

        return handleRequest(req);
    },

    websocket: {
        open(ws: Bun.ServerWebSocket<unknown>) {
            wsClients.add(ws);
            console.log(`[dev] Client connected (${wsClients.size} total)`);
        },
        close(ws: Bun.ServerWebSocket<unknown>) {
            wsClients.delete(ws);
            console.log(`[dev] Client disconnected (${wsClients.size} total)`);
        },
        message(ws: Bun.ServerWebSocket<unknown>, message: string | Buffer) {
            // Client can send ping to keep alive
            if (message === "ping") ws.send("pong");
        },
    },
});

const LIVE_RELOAD_SCRIPT = `
<script>
(function() {
    const ws = new WebSocket("ws://" + location.host + "/__dev_ws");
    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === "reload") {
            location.reload();
        }
    };
    ws.onclose = () => {
        setTimeout(() => location.reload(), 1000);
    };
})();
</script>
`;

async function injectLiveReload(response: Response): Promise<Response> {
    const html = await response.text();
    // Inject before </body> or at end
    const injected = html.replace("</body>", LIVE_RELOAD_SCRIPT + "</body>");
    // Only fall back to </html> if there was no </body> (avoid double injection)
    const finalInjected = injected.includes(LIVE_RELOAD_SCRIPT)
        ? injected
        : injected.replace("</html>", LIVE_RELOAD_SCRIPT + "</html>");
    return new Response(finalInjected, {
        headers: response.headers,
        status: response.status,
    });
}

async function handleRequest(req: Request): Promise<Response> {
    const url = new URL(req.url);
    let path = url.pathname;

    // Default to index.html for directory requests
    if (path.endsWith("/")) path += "index.html";

    // Security: prevent directory traversal
    const fullPath = resolve(DIR, "." + path);
    if (!fullPath.startsWith(DIR)) {
        return new Response("Forbidden", { status: 403 });
    }

    const file = Bun.file(fullPath);
    if (await file.exists()) {
        const response = new Response(file);
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("text/html")) {
            return injectLiveReload(response);
        }
        return response;
    }

    // SPA fallback: serve index.html for non-asset paths
    if (!path.includes(".") || path.endsWith(".html")) {
        const indexFile = Bun.file(join(DIR, "index.html"));
        if (await indexFile.exists()) {
            return injectLiveReload(new Response(indexFile));
        }
    }

    return new Response("Not Found", { status: 404 });
}

console.log(`[dev] Serving ${DIR} at http://localhost:${PORT}`);
console.log(`[dev] Live reload WebSocket at ws://localhost:${PORT}/__dev_ws`);

process.on("SIGINT", () => {
    console.log("\n[dev] Shutting down...");
    process.exit(0);
});
