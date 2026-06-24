import { Command } from "commander";
import { runPipeline } from "./pipeline/generate.js";
import { ingestCypher, syncApplication } from "./graph/ingest.js";

const program = new Command();

program
  .name("context-extractor")
  .description("Gerador de grafo de projeto via Gemini + downloader Confluence")
  .version("0.1.0")
  .action(async () => {
    const { showMenu } = await import("./menu.js");
    await showMenu();
  });

program
  .command("generate")
  .description("Extrai contexto de um projeto e grava arquivos via Gemini")
  .requiredOption("--project <dir>", "Diretório do projeto a analisar")
  .option("--prompts <dir>", "Diretório dos prompts .md (sobrescreve PROMPTS_DIR)")
  .option("--output <dir>", "Diretório de saída (sobrescreve OUTPUT_DIR)")
  .option("--force", "Regravar arquivos de saída existentes", false)
  .option("--dry-run", "Montar prompts e imprimir sem chamar o Gemini", false)
  .action(async (opts: { project: string; prompts?: string; output?: string; force: boolean; dryRun: boolean }) => {
    await runPipeline({
      projectDir: opts.project,
      promptsDir: opts.prompts,
      outputDir: opts.output,
      force: opts.force,
      dryRun: opts.dryRun,
    });
  });

program
  .command("confluence")
  .description("Baixa página(s) do Confluence como Markdown")
  .requiredOption("--page <id>", "ID da página do Confluence")
  .option("--output <dir>", "Diretório de saída (sobrescreve CONFLUENCE_OUTPUT_DIR)")
  .option("--no-recursive", "Não baixar páginas filhas")
  .action(async (opts: { page: string; output?: string; recursive: boolean }) => {
    const { downloadConfluence } = await import("./confluence/downloader.js");
    await downloadConfluence({
      pageId: opts.page,
      outputDir: opts.output,
      recursive: opts.recursive,
    });
  });

program
  .command("push")
  .description("Gera Cypher a partir dos JSONs e sincroniza com o Neo4j")
  .option("--output <dir>", "Diretório que contém os JSONs (padrão: OUTPUT_DIR)")
  .option("--dry-run", "Imprime os statements sem executar", false)
  .action(async (opts: { output?: string; dryRun: boolean }) => {
    await ingestCypher({ outputDir: opts.output, dryRun: opts.dryRun });
  });

program
  .command("update-app")
  .description("Atualiza uma aplicação: limpa relacionamentos antigos e reinsere os atuais")
  .option("--output <dir>", "Diretório que contém os JSONs (padrão: OUTPUT_DIR)")
  .option("--dry-run", "Imprime os statements sem executar", false)
  .action(async (opts: { output?: string; dryRun: boolean }) => {
    await syncApplication({ outputDir: opts.output, dryRun: opts.dryRun });
  });

program.parse();
