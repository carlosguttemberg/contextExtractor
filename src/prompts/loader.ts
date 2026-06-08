import { readdir, readFile } from "node:fs/promises";
import { join, resolve, basename, extname } from "node:path";

export interface PromptEntry {
  id: string;
  template: string;
  schema: Record<string, unknown> | null;
}

const JSON_SCHEMA_BLOCK = /```jsonschema\s*([\s\S]*?)```/i;

function extractSchema(content: string): Record<string, unknown> | null {
  const match = JSON_SCHEMA_BLOCK.exec(content);
  if (!match) return null;
  try {
    return JSON.parse(match[1].trim()) as Record<string, unknown>;
  } catch {
    console.warn("Aviso: bloco ```jsonschema encontrado mas JSON inválido.");
    return null;
  }
}

export async function loadPrompts(promptsDir: string): Promise<PromptEntry[]> {
  const dir = resolve(promptsDir);
  const files = (await readdir(dir))
    .filter((f) => f.endsWith(".md"))
    .sort();

  const entries: PromptEntry[] = [];
  for (const file of files) {
    const content = await readFile(join(dir, file), "utf-8");
    entries.push({
      id: basename(file, extname(file)),
      template: content,
      schema: extractSchema(content),
    });
  }

  return entries;
}

export function applyPlaceholders(
  template: string,
  vars: Record<string, string>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? `{{${key}}}`);
}
