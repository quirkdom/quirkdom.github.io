import { cp, mkdir, readFile, readdir, rm, writeFile } from "fs/promises";
import { existsSync, readFileSync, statSync } from "fs";
import path from "path";

export const ROOT = path.resolve(import.meta.dir, "..");
export const PAGES = path.join(ROOT, "pages");
export const DIST = path.join(ROOT, "dist");
export const PUBLIC = path.join(ROOT, "public");

export interface Writing {
    title: string;
    date: string;
    url: string;
}

export interface Page {
    dir: string;
    source: string;
    fullPath: string;
    body: string;
    data: Record<string, string>;
}

export interface BuildOptions {
    drafts?: boolean;
    outDir?: string;
}

export interface BuildResult {
    pages: number;
    writings: number;
    assets: number;
    bundles: number;
    writingsList: Writing[];
}

export function escapeHtml(s: string): string {
    return s
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
}

/** Recursively list files under `dir` relative to `base`, ignoring `_` prefixes and node_modules. */
export async function walk(dir: string, base = dir): Promise<string[]> {
    if (!existsSync(dir)) return [];
    const out: string[] = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        if (entry.name.startsWith("_") || entry.name === "node_modules" || entry.name === ".DS_Store") continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            out.push(...(await walk(full, base)));
        } else {
            out.push(path.relative(base, full).split(path.sep).join("/"));
        }
    }
    return out;
}

export function splitFrontmatter(raw: string, file: string): [Record<string, string>, string] {
    const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
    if (!match) return [{}, raw];

    const data: Record<string, string> = {};
    for (const line of match[1].split(/\r?\n/)) {
        if (!line.trim() || line.trimStart().startsWith("#")) continue;
        const colon = line.indexOf(":");
        if (colon === -1) {
            throw new Error(`${path.relative(ROOT, file)}: frontmatter must be "key: value" -> ${line}`);
        }
        let value = line.slice(colon + 1).trim();
        const quoted =
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"));
        if (quoted) value = value.slice(1, -1);
        data[line.slice(0, colon).trim()] = value;
    }

    if (data.date && !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
        throw new Error(`${path.relative(ROOT, file)}: date must be YYYY-MM-DD, got "${data.date}"`);
    }
    return [data, raw.slice(match[0].length)];
}

export function isDraft(data: Record<string, string>): boolean {
    if (data.draft === "true" || data.draft === "yes") return true;
    if (data.published === "false" || data.published === "no") return true;
    return false;
}

export function isUnderDraftDir(relPath: string, draftDirs: Set<string>): boolean {
    for (const draftDir of draftDirs) {
        if (draftDir === ".") continue;
        if (relPath === draftDir || relPath.startsWith(draftDir + "/")) {
            return true;
        }
    }
    return false;
}

/** Extract file paths referenced in HTML / Markdown text. */
export function extractReferences(text: string): string[] {
    const refs: string[] = [];
    const attrRegex = /\b(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
    let match: RegExpExecArray | null;
    while ((match = attrRegex.exec(text)) !== null) {
        const val = match[1] ?? match[2];
        if (val) refs.push(val.trim());
    }
    const mdRegex = /!?\[[^\]]*\]\(([^)]+)\)/g;
    while ((match = mdRegex.exec(text)) !== null) {
        const val = match[1].split(/\s+/)[0];
        if (val) refs.push(val.trim());
    }
    const embedRegex = /\{\{embed:\s*([^}]+)\}\}/g;
    while ((match = embedRegex.exec(text)) !== null) {
        if (match[1]) refs.push(match[1].trim());
    }
    return refs;
}

/** Resolve a reference string to a normalized relative path under PAGES, or null if outside PAGES. */
export function resolvePageAsset(ref: string, pageDir: string): string | null {
    if (
        !ref ||
        ref.startsWith("#") ||
        ref.startsWith("mailto:") ||
        ref.startsWith("tel:") ||
        ref.startsWith("javascript:") ||
        ref.startsWith("data:") ||
        /^https?:\/\//i.test(ref) ||
        ref.startsWith("//")
    ) {
        return null;
    }

    const clean = ref.split(/[?#]/)[0].trim();
    if (!clean) return null;

    let targetPath: string;
    if (clean.startsWith("/")) {
        targetPath = path.join(PAGES, clean.slice(1));
    } else {
        targetPath = path.resolve(pageDir, clean);
    }

    const rel = path.relative(PAGES, targetPath).split(path.sep).join("/");
    if (!rel.startsWith("..") && !path.isAbsolute(rel) && existsSync(targetPath)) {
        return rel;
    }
    return null;
}

/** Nearest ancestor layout.html, walking up to (and including) pages/. */
export function findLayout(dir: string): string | null {
    let cur = dir;
    for (;;) {
        const candidate = path.join(cur, "layout.html");
        if (existsSync(candidate)) return candidate;
        if (cur === PAGES) return null;
        const parent = path.dirname(cur);
        if (parent === cur) return null;
        cur = parent;
    }
}

/** Pre-process {{embed: ./file.html}} tags so raw HTML isn't mangled by Bun.markdown.html. */
function processEmbeds(body: string, dir: string): { markdown: string; embeds: string[] } {
    const embeds: string[] = [];
    const markdown = body.replaceAll(/\{\{embed:\s*([^\}]+)\}\}/g, (_, relPath) => {
        const fullPath = path.resolve(dir, relPath.trim());
        if (!existsSync(fullPath)) {
            throw new Error(`${path.relative(ROOT, dir)}: embed not found -> ${relPath.trim()}`);
        }
        const content = readFileSync(fullPath, "utf8");
        const idx = embeds.length;
        embeds.push(content);
        return `<!--EMBED_${idx}-->`;
    });
    return { markdown, embeds };
}

/** Restore embedded raw HTML, stripping any wrapping <p> tags added by markdown parsing. */
function restoreEmbeds(html: string, embeds: string[]): string {
    let result = html;
    for (let i = 0; i < embeds.length; i++) {
        const token = `<!--EMBED_${i}-->`;
        const regex = new RegExp(`<p>\\s*${token}\\s*<\\/p>|${token}`, "g");
        result = result.replace(regex, () => embeds[i]);
    }
    return result;
}

/**
 * Transform bare `<span class="sidenote">` / `<span class="marginnote">` spans.
 *
 * Sidenotes get an associated `<label for="sn-N" class="sidenote-number"></label>`
 * driving the footnote counter marker via `::after { content: counter(sidenote-counter) }`.
 * Marginnotes have no marker label; in folded mobile view they are prefixed with
 * an inline dagger (†) via `.marginnote:before`.
 */
export function transformSidenotes(html: string): string {
    let sidenotes = 0;

    return html.replace(
        /<span class="(sidenote|marginnote)">([\s\S]*?)<\/span>/g,
        (_, cls: string, content: string) => {
            if (cls === "sidenote") {
                sidenotes++;
                const id = `sn-${sidenotes}`;
                return (
                    `<label for="${id}" class="sidenote-number"></label>` +
                    `<span id="${id}" class="sidenote">${content}</span>`
                );
            } else {
                return `<span class="marginnote">${content}</span>`;
            }
        },
    );
}

/** Replace {{key}} placeholders from context. */
export function interpolate(template: string, context: Record<string, string>): string {
    return template.replaceAll(/\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g, (_, key) => {
        return context[key] ?? "";
    });
}

/** Writings newest-first, grouped under an <h3> year per run of equal years. */
export function renderWritings(writings: Writing[]): string {
    if (!writings.length) return "";
    const sorted = [...writings].sort((a, b) => b.date.localeCompare(a.date));
    let html = "";
    let openYear = "";
    for (const item of sorted) {
        const year = item.date.slice(0, 4);
        if (year !== openYear) {
            if (openYear) html += "</ul>\n";
            html += `<h3 id="y${year}">${year}</h3>\n<ul>\n`;
            openYear = year;
        }
        html +=
            `    <li>\n` +
            `        <time datetime="${item.date}">${item.date}</time>\n` +
            `        <a href="${item.url}">${escapeHtml(item.title)}</a>\n` +
            `    </li>\n`;
    }
    return html + "</ul>\n";
}

const NATIVE_IMPORTS = /^three(\/|$)/;

function escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Leave root-absolute URLs (fonts, images, `/formose.css`) and the CDN bare
 * imports the importmap resolves untouched. Only a page's own relative CSS/JS
 * is handed to Bun, so the verbatim `public/` contract is never disturbed.
 * The entry HTML paths are themselves absolute and must resolve normally.
 */
function externalAssets(entries: Set<string>): Bun.BunPlugin {
    return {
        name: "quirkdom-external",
        setup(build) {
            build.onResolve({ filter: /^\// }, (args) =>
                entries.has(args.path) ? undefined : { path: args.path, external: true },
            );
            build.onResolve({ filter: NATIVE_IMPORTS }, (args) => ({ path: args.path, external: true }));
        },
    };
}

interface BundleInputs {
    entries: string[];
    sources: Set<string>;
}

/**
 * A page opts into bundling by referencing its own CSS/JS with a relative URL
 * (`./index.css`). Pages that only use root-absolute assets — every `~abi/`
 * page, which loads `/formose.css` — are left byte-for-byte alone.
 */
async function findBundleInputs(outDir: string): Promise<BundleInputs> {
    const entries: string[] = [];
    const sources = new Set<string>();
    for (const rel of await walk(outDir)) {
        if (!rel.endsWith(".html")) continue;
        const htmlPath = path.join(outDir, rel);
        const dir = path.dirname(htmlPath);
        let bundles = false;
        for (const ref of extractReferences(await readFile(htmlPath, "utf8"))) {
            const clean = (ref.split(/[?#]/)[0] ?? "").trim();
            if (
                !clean ||
                clean.startsWith("/") ||
                clean.startsWith("//") ||
                /^[a-z][a-z0-9+.-]*:/i.test(clean)
            ) {
                continue;
            }
            if (![".css", ".js", ".mjs"].includes(path.extname(clean).toLowerCase())) continue;
            const resolved = path.resolve(dir, clean);
            if (!resolved.startsWith(outDir + path.sep) || !existsSync(resolved)) continue;
            bundles = true;
            sources.add(resolved);
        }
        if (bundles) entries.push(htmlPath);
    }
    return { entries, sources };
}

/**
 * Bundle and minify the relative CSS/JS each page references, hashing the
 * result into `assets/`. Runs after the copy pass: the HTML is rewritten in
 * place and the original unbundled sources are removed so only the hashed
 * copies ship.
 */
async function bundlePageAssets(outDir: string): Promise<number> {
    const { entries, sources } = await findBundleInputs(outDir);
    if (!entries.length) return 0;

    const result = await Bun.build({
        entrypoints: entries,
        outdir: outDir,
        minify: true,
        plugins: [externalAssets(new Set(entries))],
        naming: {
            entry: "[dir]/[name].[ext]",
            chunk: "assets/[name]-[hash].[ext]",
            asset: "assets/[name]-[hash].[ext]",
        },
    });

    if (!result.success) {
        throw new Error(
            `bundling failed:\n${result.logs.map((l) => String(l.message ?? l)).join("\n")}`,
        );
    }

    // A page with CSS but no JS makes Bun emit an empty script chunk and inject
    // a tag for it; drop both.
    for (const output of result.outputs) {
        if (output.kind !== "entry-point" || !output.path.endsWith(".js") || output.size !== 0) continue;
        await rm(output.path, { force: true });
        const pattern = new RegExp(
            `<script[^>]*src="[^"]*${escapeRegExp(path.basename(output.path))}"[^>]*></script>`,
            "g",
        );
        for (const entry of entries) {
            const html = await readFile(entry, "utf8");
            await writeFile(entry, html.replace(pattern, ""));
        }
    }

    for (const source of sources) await rm(source, { force: true });
    return entries.length;
}

export function parseArgs(args: string[]): BuildOptions {
    const drafts =
        args.includes("--drafts") ||
        process.env.DRAFTS === "true" ||
        process.env.DRAFTS === "1";
    return { drafts };
}

/** Full site build. */
export async function build(options: BuildOptions = {}): Promise<BuildResult> {
    const includeDrafts = options.drafts ?? false;
    const outDir = options.outDir ? path.resolve(options.outDir) : DIST;

    await rm(outDir, { recursive: true, force: true });
    await mkdir(outDir, { recursive: true });

    // 1. Copy public/ to outDir root
    await cp(PUBLIC, outDir, { recursive: true });

    // 2. Discover files under pages/
    const pageFiles = await walk(PAGES);

    // 3. Collect markdown pages & writings
    const mdPages: Page[] = [];
    const sourceByDir: Record<string, string> = {};
    const writings: Writing[] = [];
    const draftDirs = new Set<string>();

    interface ParsedMd {
        dir: string;
        relPath: string;
        fullPath: string;
        data: Record<string, string>;
        body: string;
        isPageDraft: boolean;
    }
    const parsedMds: ParsedMd[] = [];

    for (const relPath of pageFiles.filter((f) => f.endsWith(".md"))) {
        const fullPath = path.join(PAGES, relPath);
        const dir = path.dirname(relPath);
        if (sourceByDir[dir]) {
            throw new Error(`pages/${dir}: both ${sourceByDir[dir]} and ${relPath} render to the same index.html`);
        }
        sourceByDir[dir] = relPath;

        const raw = await readFile(fullPath, "utf8");
        const [data, body] = splitFrontmatter(raw, fullPath);
        const pageDraft = isDraft(data);
        if (pageDraft && dir !== ".") {
            draftDirs.add(dir);
        }
        parsedMds.push({ dir, relPath, fullPath, data, body, isPageDraft: pageDraft });
    }

    const draftPageAssetRefs = new Set<string>();
    const publishedPageAssetRefs = new Set<string>();

    for (const item of parsedMds) {
        const isDraftPage = item.isPageDraft || isUnderDraftDir(item.dir, draftDirs);
        const pageDir = path.dirname(item.fullPath);
        const refs = extractReferences(item.body);

        const layoutFile = findLayout(pageDir);
        if (layoutFile) {
            const layoutRaw = await readFile(layoutFile, "utf8");
            refs.push(...extractReferences(layoutRaw));
        }

        for (const ref of refs) {
            const assetRel = resolvePageAsset(ref, pageDir);
            if (assetRel) {
                if (isDraftPage) {
                    draftPageAssetRefs.add(assetRel);
                } else {
                    publishedPageAssetRefs.add(assetRel);
                }
            }
        }

        if (isDraftPage && !includeDrafts) {
            continue;
        }

        if (item.data.date) {
            if (item.dir === ".") throw new Error(`${item.relPath}: a dated page needs its own directory`);
            if (!item.data.title) throw new Error(`${item.relPath}: a dated page needs a title`);
            writings.push({ title: item.data.title, date: item.data.date, url: `/${item.dir}/` });
        }

        mdPages.push({
            dir: item.dir,
            source: item.relPath,
            fullPath: item.fullPath,
            body: item.body,
            data: item.data,
        });
    }

    for (const relPath of pageFiles) {
        if (!relPath.endsWith(".html") || path.posix.basename(relPath) === "layout.html") continue;
        const fullPath = path.join(PAGES, relPath);
        const htmlContent = await readFile(fullPath, "utf8");
        const pageDir = path.dirname(fullPath);
        const isDraftPage = isUnderDraftDir(relPath, draftDirs);
        for (const ref of extractReferences(htmlContent)) {
            const assetRel = resolvePageAsset(ref, pageDir);
            if (assetRel) {
                if (isDraftPage) {
                    draftPageAssetRefs.add(assetRel);
                } else {
                    publishedPageAssetRefs.add(assetRel);
                }
            }
        }
    }

    const writingsHtml = renderWritings(writings);

    // 4. Render markdown pages
    for (const page of mdPages) {
        const pageDir = path.dirname(page.fullPath);
        const { markdown, embeds } = processEmbeds(page.body, pageDir);
        let content = Bun.markdown.html(markdown);
        content = restoreEmbeds(content, embeds);
        content = transformSidenotes(content);
        content = content.replace(/<p>\s*\{\{writings\}\}\s*<\/p>/g, writingsHtml)
                         .replaceAll("{{writings}}", writingsHtml);

        const layoutFile = findLayout(pageDir);
        if (!layoutFile) {
            throw new Error(`${page.source}: no layout.html in this directory or any ancestor up to pages/`);
        }
        const layoutTemplate = await readFile(layoutFile, "utf8");

        const context: Record<string, string> = {
            ...page.data,
            title: escapeHtml(page.data.title ?? ""),
            description: escapeHtml(page.data.description ?? ""),
            descriptionMeta: page.data.description
                ? `<meta name="description" content="${escapeHtml(page.data.description)}" />`
                : "",
            dateline: page.data.date
                ? `<p><time datetime="${page.data.date}">${page.data.date}</time></p>\n`
                : "",
            writings: writingsHtml,
        };

        content = interpolate(content, context);
        context.content = content;

        const html = interpolate(layoutTemplate, context);
        const dest = path.join(outDir, page.dir, "index.html");
        await mkdir(path.dirname(dest), { recursive: true });
        await writeFile(dest, html);
    }

    // 5. Copy non-markdown, non-layout files from pages/
    let assets = (await walk(PUBLIC)).length;
    let htmlPages = 0;
    for (const relPath of pageFiles) {
        if (relPath.endsWith(".md") || path.posix.basename(relPath) === "layout.html") continue;

        if (!includeDrafts) {
            const underDraft = isUnderDraftDir(relPath, draftDirs);
            const refByDraft = draftPageAssetRefs.has(relPath);
            const refByPublished = publishedPageAssetRefs.has(relPath);

            // Exclude assets in draft directories unless also referenced by published pages
            if (underDraft && !refByPublished) continue;

            // Exclude assets referenced by draft pages unless also referenced by published pages
            if (refByDraft && !refByPublished) continue;
        }

        const src = path.join(PAGES, relPath);
        const dest = path.join(outDir, relPath);
        await mkdir(path.dirname(dest), { recursive: true });
        await cp(src, dest, { recursive: true });
        if (relPath.endsWith(".html")) {
            htmlPages += 1;
        } else {
            assets += 1;
        }
    }

    const bundles = await bundlePageAssets(outDir);

    await writeFile(path.join(outDir, ".nojekyll"), "");

    return {
        pages: mdPages.length + htmlPages,
        writings: writings.length,
        assets,
        bundles,
        writingsList: writings,
    };
}

async function main(): Promise<void> {
    const options = parseArgs(process.argv.slice(2));
    const result = await build(options);
    const targetDir = options.outDir ? path.relative(ROOT, path.resolve(options.outDir)) : "dist";
    console.log(
        `built ${result.pages} page(s), ${result.writings} writing(s), ` +
            `${result.assets} asset(s), ${result.bundles} bundled -> ${targetDir}/` +
            (options.drafts ? " (drafts enabled)" : ""),
    );
    for (const writing of result.writingsList.sort((a, b) => b.date.localeCompare(a.date))) {
        console.log(`  ${writing.date}  ${writing.url}`);
    }
}

if (import.meta.main) {
    await main();
}
