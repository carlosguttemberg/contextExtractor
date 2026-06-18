import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { generate as geminiGenerate } from "../gemini/client.js";
import { loadPrompts, applyPlaceholders, type PromptEntry } from "../prompts/loader.js";
import { scanProject } from "../project/scanner.js";
import { buildContext } from "../project/context.js";
import { loadGraphSchema } from "../graph/schema-loader.js";
import { validateOutput } from "../graph/validate.js";
import { config } from "../config.js";

const CONCURRENCY = 2;

export interface GenerateOptions {
  projectDir: string;
  promptsDir?: string;
  outputDir?: string;
  force?: boolean;
  dryRun?: boolean;
}

export interface PromptResult {
  id: string;
  status: "ok" | "skipped" | "error";
  message?: string;
}

async function processPrompt(
  entry: PromptEntry,
  vars: Record<string, string>,
  outputDir: string,
  force: boolean,
  dryRun: boolean
): Promise<PromptResult> {
  const outFile = join(outputDir, `${entry.id}.json`);
  const outFileTxt = join(outputDir, `${entry.id}.txt`);

  if (!force && (existsSync(outFile) || existsSync(outFileTxt))) {
    const existing = existsSync(outFile) ? outFile : outFileTxt;
    return { id: entry.id, status: "skipped", message: `já existe: ${existing}` };
  }

  const prompt = applyPlaceholders(entry.template, vars);

  if (dryRun) {
    console.log(`\n[dry-run] ${entry.id} — prompt montado (${prompt.length} chars)`);
    return { id: entry.id, status: "ok", message: "dry-run" };
  }

  try {
    const raw = await geminiGenerate(prompt);

    if (!entry.schema) {
      // Sem schema declarado no prompt — salva a resposta bruta como texto
      await writeFile(outFile.replace(/\.json$/, ".txt"), raw);
      return { id: entry.id, status: "ok", message: `${raw.length} chars` };
    }

    // Com schema — valida e salva JSON
    const { valid, parsed, errorMessage } = validateOutput(raw, entry.schema);

    if (!valid || parsed === null) {
      const errDir = join(outputDir, "_errors");
      await mkdir(errDir, { recursive: true });
      await writeFile(join(errDir, `${entry.id}.txt`), `${errorMessage}\n\n---\n\n${raw}`);
      return { id: entry.id, status: "error", message: errorMessage };
    }

    await writeFile(outFile, JSON.stringify(parsed, null, 2));

    return { id: entry.id, status: "ok", message: "JSON válido" };
  } catch (err) {
    const msg = (err as Error).message;
    const errDir = join(outputDir, "_errors");
    await mkdir(errDir, { recursive: true });
    await writeFile(join(errDir, `${entry.id}.txt`), msg);
    return { id: entry.id, status: "error", message: msg };
  }
}

async function runBatch(
  items: PromptEntry[],
  vars: Record<string, string>,
  outputDir: string,
  force: boolean,
  dryRun: boolean
): Promise<PromptResult[]> {
  const results: PromptResult[] = [];
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    const batch = items.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map((e) => processPrompt(e, vars, outputDir, force, dryRun))
    );
    results.push(...batchResults);
    for (const r of batchResults) {
      const icon = r.status === "ok" ? "✓" : r.status === "skipped" ? "–" : "✗";
      console.log(`  ${icon} ${r.id}${r.message ? ` — ${r.message}` : ""}`);
    }
  }
  return results;
}

export async function runPipeline(opts: GenerateOptions): Promise<void> {
  const promptsDir = opts.promptsDir ?? config.promptsDir;
  const outputDir = resolve(opts.outputDir ?? config.outputDir);
  const force = opts.force ?? false;
  const dryRun = opts.dryRun ?? false;

  console.log(`\nEscaneando projeto: ${opts.projectDir}`);
  const files = await scanProject(opts.projectDir);
  console.log(`  ${files.length} arquivos encontrados`);

  const ctx = await buildContext(files);
  console.log(`  Contexto estimado: ${ctx.estimatedChars.toLocaleString()} chars`);

  const graphSchema = await loadGraphSchema(config.graphSchemaDir);
  const prompts = await loadPrompts(promptsDir);
  console.log(`  ${prompts.length} prompts carregados`);

  if (!dryRun) await mkdir(outputDir, { recursive: true });

  const vars: Record<string, string> = {
    PROJECT_TREE: ctx.tree,
    PROJECT_FILES: ctx.filesContent,
    GRAPH_SCHEMA: graphSchema,
  };

  console.log(`\nProcessando prompts...`);
  const results = await runBatch(prompts, vars, outputDir, force, dryRun);

  const ok = results.filter((r) => r.status === "ok").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const errors = results.filter((r) => r.status === "error").length;

  console.log(`\nResumo: ${ok} ok | ${skipped} pulados | ${errors} erros`);
  if (errors > 0) console.log(`  Detalhes em: ${outputDir}/_errors/`);
}
