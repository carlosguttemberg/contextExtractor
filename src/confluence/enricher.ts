import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { generate } from "../gemini/client.js";
import type { DownloadResult } from "./downloader.js";

function buildPrompt(content: string): string {
  return `Você é um especialista em documentação técnica.

Abaixo está uma página exportada do Confluence em Markdown. Reescreva-a em uma versão **mais detalhada e completa**, mantendo:
- A estrutura de títulos e seções originais
- O idioma original do documento
- Todos os fatos e informações presentes
- Blocos de código e exemplos (expanda com mais exemplos quando fizer sentido)

Enriqueça com:
- Explicações aprofundadas de cada seção
- Contexto adicional relevante
- Exemplos práticos onde aplicável

Retorne APENAS o Markdown enriquecido, sem comentários ou texto fora do documento.

---

${content}`;
}

export interface EnrichResult {
  file: string;
  enrichedFile: string;
  status: "ok" | "error";
  message?: string;
}

export async function enrichConfluence(
  results: DownloadResult[],
  downloadOutputDir: string
): Promise<EnrichResult[]> {
  const baseDir = resolve(downloadOutputDir);
  const enrichedDir = `${baseDir}-enriched`;

  const toProcess = results.filter((r) => r.status === "ok");

  if (toProcess.length === 0) {
    console.log("\nNenhuma página para enriquecer.");
    return [];
  }

  console.log(`\nEnriquecendo ${toProcess.length} página(s) com Gemini...`);
  console.log(`Saída: ${enrichedDir}\n`);

  const enrichResults: EnrichResult[] = [];

  for (const result of toProcess) {
    const rel = relative(baseDir, result.file);
    const enrichedFile = join(enrichedDir, rel);

    process.stdout.write(`  ⟳ ${result.title}...`);

    try {
      const content = await readFile(result.file, "utf-8");
      const enriched = await generate(buildPrompt(content));

      await mkdir(dirname(enrichedFile), { recursive: true });
      await writeFile(enrichedFile, enriched, "utf-8");

      process.stdout.write(" ✓\n");
      enrichResults.push({ file: result.file, enrichedFile, status: "ok" });
    } catch (err) {
      process.stdout.write(" ✗\n");
      console.error(`    Erro: ${(err as Error).message}`);
      enrichResults.push({
        file: result.file,
        enrichedFile,
        status: "error",
        message: (err as Error).message,
      });
    }
  }

  const ok = enrichResults.filter((r) => r.status === "ok").length;
  const errors = enrichResults.filter((r) => r.status === "error").length;
  console.log(`\nEnriquecimento: ${ok} ok | ${errors} erro(s)`);
  console.log(`Saída: ${enrichedDir}`);

  return enrichResults;
}
