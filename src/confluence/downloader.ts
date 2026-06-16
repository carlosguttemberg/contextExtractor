import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { config } from "../config.js";
import { getPage, getChildPages, type ConfluencePage } from "./client.js";
import { htmlToMarkdown } from "./converter.js";

export interface DownloadOptions {
  pageId: string;
  outputDir?: string;
  recursive?: boolean;
}

export interface DownloadResult {
  pageId: string;
  title: string;
  file: string;
  status: "ok" | "error";
  message?: string;
}

function sanitizeFilename(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9\s-_]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase()
    .slice(0, 100);
}

async function savePage(
  page: ConfluencePage,
  dir: string
): Promise<DownloadResult> {
  const filename = `${sanitizeFilename(page.title)}.md`;
  const file = join(dir, filename);

  try {
    const html = page.body.view.value;
    const md = `# ${page.title}\n\n${htmlToMarkdown(html)}`;
    await writeFile(file, md, "utf-8");
    return { pageId: page.id, title: page.title, file, status: "ok" };
  } catch (err) {
    return {
      pageId: page.id,
      title: page.title,
      file,
      status: "error",
      message: (err as Error).message,
    };
  }
}

async function downloadTree(
  pageId: string,
  dir: string,
  recursive: boolean,
  results: DownloadResult[]
): Promise<void> {
  const page = await getPage(pageId);
  const result = await savePage(page, dir);
  results.push(result);

  const icon = result.status === "ok" ? "✓" : "✗";
  console.log(`  ${icon} [${page.id}] ${page.title}`);

  if (!recursive) return;

  const children = await getChildPages(pageId);
  if (children.length === 0) return;

  const subDir = join(dir, sanitizeFilename(page.title));
  await mkdir(subDir, { recursive: true });

  for (const child of children) {
    await downloadTree(child.id, subDir, recursive, results);
  }
}

export async function downloadConfluence(opts: DownloadOptions): Promise<DownloadResult[]> {
  const outputDir = resolve(opts.outputDir ?? config.confluenceOutputDir);
  const recursive = opts.recursive ?? true;

  await mkdir(outputDir, { recursive: true });

  console.log(`\nBaixando página ${opts.pageId} do Confluence...`);
  if (recursive) console.log("  (incluindo páginas filhas recursivamente)");

  const results: DownloadResult[] = [];
  await downloadTree(opts.pageId, outputDir, recursive, results);

  const ok = results.filter((r) => r.status === "ok").length;
  const errors = results.filter((r) => r.status === "error").length;
  console.log(`\nResumo: ${ok} páginas salvas | ${errors} erros`);
  console.log(`Saída: ${outputDir}`);

  return results;
}
