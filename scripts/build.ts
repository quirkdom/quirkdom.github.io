import { cp, mkdir, readFile, readdir, rm, writeFile } from "fs/promises";
import { existsSync, readFileSync } from "fs";
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

export interface BuildResult {
    pages: number;
    writings: number;
    assets: number;
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

/** Full site build. */
export async function build(): Promise<BuildResult> {
    await rm(DIST, { recursive: true, force: true });
    await mkdir(DIST, { recursive: true });

    // 1. Copy public/ to dist/ root
    await cp(PUBLIC, DIST, { recursive: true });

    // 2. Discover files under pages/
    const pageFiles = await walk(PAGES);

    // 3. Collect markdown pages & writings
    const mdPages: Page[] = [];
    const sourceByDir: Record<string, string> = {};
    const writings: Writing[] = [];

    for (const relPath of pageFiles.filter((f) => f.endsWith(".md"))) {
        const fullPath = path.join(PAGES, relPath);
        const dir = path.dirname(relPath);
        if (sourceByDir[dir]) {
            throw new Error(`pages/${dir}: both ${sourceByDir[dir]} and ${relPath} render to the same index.html`);
        }
        sourceByDir[dir] = relPath;

        const raw = await readFile(fullPath, "utf8");
        const [data, body] = splitFrontmatter(raw, fullPath);

        if (data.date) {
            if (dir === ".") throw new Error(`${relPath}: a dated page needs its own directory`);
            if (!data.title) throw new Error(`${relPath}: a dated page needs a title`);
            writings.push({ title: data.title, date: data.date, url: `/${dir}/` });
        }

        mdPages.push({ dir, source: relPath, fullPath, body, data });
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
        const dest = path.join(DIST, page.dir, "index.html");
        await mkdir(path.dirname(dest), { recursive: true });
        await writeFile(dest, html);
    }

    // 5. Copy non-markdown, non-layout files from pages/
    let assets = (await walk(PUBLIC)).length;
    for (const relPath of pageFiles) {
        if (relPath.endsWith(".md") || path.posix.basename(relPath) === "layout.html") continue;
        const src = path.join(PAGES, relPath);
        const dest = path.join(DIST, relPath);
        await mkdir(path.dirname(dest), { recursive: true });
        await cp(src, dest, { recursive: true });
        assets += 1;
    }

    await writeFile(path.join(DIST, ".nojekyll"), "");

    return {
        pages: mdPages.length,
        writings: writings.length,
        assets,
        writingsList: writings,
    };
}

async function main(): Promise<void> {
    const result = await build();
    console.log(
        `built ${result.pages} page(s), ${result.writings} writing(s), ` +
            `${result.assets} asset(s) -> dist/`,
    );
    for (const writing of result.writingsList.sort((a, b) => b.date.localeCompare(a.date))) {
        console.log(`  ${writing.date}  ${writing.url}`);
    }
}

if (import.meta.main) {
    await main();
}
