import { Command } from "commander";
import { runPipeline } from "./pipeline/generate.js";
import { ingestCypher } from "./graph/ingest.js";

const program = new Command();

program
  .name("context-extractor")
  .description("Gerador de grafo de projeto via Gemini")
  .version("0.1.0");

program
  .command("generate")
  .description("Executa a extração: lê prompts, analisa o projeto e grava saídas JSON")
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
  .command("push")
  .description("Executa os arquivos .cypher gerados contra um Neo4j")
  .option("--output <dir>", "Diretório que contém a pasta cypher/ (padrão: OUTPUT_DIR)")
  .option("--dry-run", "Imprime os statements sem executar", false)
  .action(async (opts: { output?: string; dryRun: boolean }) => {
    await ingestCypher({ outputDir: opts.output, dryRun: opts.dryRun });
  });

program.parse();
