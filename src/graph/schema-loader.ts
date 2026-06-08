import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { existsSync } from "node:fs";

export async function loadGraphSchema(schemaDir: string): Promise<string> {
  const dir = resolve(schemaDir);
  if (!existsSync(dir)) return "";

  const files = (await readdir(dir)).sort();
  if (files.length === 0) return "";

  const parts: string[] = [];
  for (const file of files) {
    const content = await readFile(join(dir, file), "utf-8");
    parts.push(`## ${file}\n\n${content.trim()}`);
  }

  return parts.join("\n\n---\n\n");
}
