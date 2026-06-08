import { readFile, stat } from "node:fs/promises";
import { ScannedFile } from "./scanner.js";

const MAX_BUDGET_CHARS = Number(process.env.CONTEXT_BUDGET_CHARS ?? 400_000);
const MAX_FILE_CHARS = 20_000;

const PRIORITY_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mts", ".mjs",
  ".py", ".java", ".go", ".rs", ".cs", ".rb",
  ".json", ".yaml", ".yml", ".toml",
  ".md", ".txt", ".sql", ".graphql",
  ".env.example",
]);

function buildTree(files: ScannedFile[]): string {
  const tree: Record<string, string[]> = {};
  for (const f of files) {
    const parts = f.relativePath.split("/");
    const dir = parts.length > 1 ? parts.slice(0, -1).join("/") : ".";
    (tree[dir] ??= []).push(parts[parts.length - 1]);
  }

  const lines: string[] = [];
  for (const [dir, names] of Object.entries(tree).sort()) {
    lines.push(dir === "." ? "." : dir + "/");
    for (const name of names) lines.push(`  ${name}`);
  }
  return lines.join("\n");
}

function isPriority(file: ScannedFile): boolean {
  const ext = "." + file.relativePath.split(".").pop()!.toLowerCase();
  return PRIORITY_EXTENSIONS.has(ext);
}

export interface ProjectContext {
  tree: string;
  filesContent: string;
  estimatedChars: number;
}

export async function buildContext(files: ScannedFile[]): Promise<ProjectContext> {
  const tree = buildTree(files);
  const sorted = [...files].sort((a, b) => {
    const pa = isPriority(a) ? 0 : 1;
    const pb = isPriority(b) ? 0 : 1;
    return pa - pb || a.relativePath.localeCompare(b.relativePath);
  });

  let budget = MAX_BUDGET_CHARS;
  const parts: string[] = [];

  for (const file of sorted) {
    if (budget <= 0) break;
    try {
      const info = await stat(file.path);
      if (info.size > 200_000) continue;

      let content = await readFile(file.path, "utf-8");
      if (content.length > MAX_FILE_CHARS) {
        content = content.slice(0, MAX_FILE_CHARS) + "\n... [truncado]";
      }

      const block = `### ${file.relativePath}\n\`\`\`\n${content}\n\`\`\``;
      if (block.length > budget) break;

      parts.push(block);
      budget -= block.length;
    } catch {
      // arquivo inacessível — pular
    }
  }

  const filesContent = parts.join("\n\n");
  return {
    tree,
    filesContent,
    estimatedChars: tree.length + filesContent.length,
  };
}
