#!/usr/bin/env bun
/**
 * Preview server for production build
 *
 * Features:
 * - Builds prod dist/ first (drafts excluded)
 * - Serves static pages from dist/
 * - Exact production behavior without live reload script injection
 */

import { join, resolve } from "path";
import { fileURLToPath } from "url";
import { build } from "./build.ts";

const args = process.argv.slice(2);
let PORT = 8000;
for (let i = 0; i < args.length; i++) {
    if ((args[i] === "--host" || args[i] === "--port") && args[i + 1] && !args[i + 1].startsWith("-")) {
        PORT = parseInt(args[i + 1], 10);
        if (isNaN(PORT)) PORT = 8000;
        i++;
    }
}

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const DIR = resolve(__dirname, "../dist");

console.log("[preview] Building production distribution...");
const start = performance.now();
const result = await build({ drafts: false });
const elapsed = (performance.now() - start).toFixed(0);
console.log(
    `[preview] Built ${result.pages} pages, ${result.writings} writings, ${result.assets} assets in ${elapsed}ms`,
);

Bun.serve({
    port: PORT,
    async fetch(req) {
        const url = new URL(req.url);
        let path = url.pathname;

        if (path.endsWith("/")) path += "index.html";

        const fullPath = resolve(DIR, "." + path);
        if (!fullPath.startsWith(DIR)) {
            return new Response("Forbidden", { status: 403 });
        }

        const file = Bun.file(fullPath);
        if (await file.exists()) {
            return new Response(file);
        }

        const dirIndex = Bun.file(join(fullPath, "index.html"));
        if (await dirIndex.exists()) {
            return Response.redirect(url.pathname + "/", 301);
        }

        return new Response("Not Found", { status: 404 });
    },
});

console.log(`[preview] Serving production build at http://localhost:${PORT}`);

process.on("SIGINT", () => {
    console.log("\n[preview] Shutting down...");
    process.exit(0);
});
