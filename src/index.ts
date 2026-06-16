import { Command } from "commander";
import { runPipeline } from "./pipeline/generate.js";
import { ingestCypher } from "./graph/ingest.js";
import { downloadConfluence } from "./confluence/downloader.js";
import { showMenu } from "./menu.js";

const program = new Command();

program
  .name("context-extractor")
  .description("Gerador de grafo de projeto via Gemini + downloader Confluence")
  .version("0.1.0")
  .action(async () => {
    // Sem subcomando — exibe menu interativo
    await showMenu();
  });

program
  .command("generate")
  .description("Extrai contexto de um projeto e grava JSONs via Gemini")
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
    await downloadConfluence({
      pageId: opts.page,
      outputDir: opts.output,
      recursive: opts.recursive,
    });
  });

program
  .command("push")
  .description("Executa os arquivos .cypher gerados contra um Neo4j")
  .option("--output <dir>", "Diretório que contém a pasta cypher/ (padrão: OUTPUT_DIR)")
  .option("--dry-run", "Imprime os statements sem executar", false)
  .action(async (opts: { output?: string; dryRun: boolean }) => {
    await ingestCypher({ outputDir: opts.output, dryRun: opts.dryRun });
  });

program.parse();
