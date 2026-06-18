import { select, input, confirm } from "@inquirer/prompts";
import { runPipeline } from "./pipeline/generate.js";
import { downloadConfluence } from "./confluence/downloader.js";
import { enrichConfluence } from "./confluence/enricher.js";
import { ingestCypher } from "./graph/ingest.js";

async function menuGemini(): Promise<void> {
  const projectDir = await input({
    message: "Diretório do projeto a analisar:",
    required: true,
  });

  const dryRun = await confirm({
    message: "Dry-run? (monta os prompts sem chamar o Gemini)",
    default: false,
  });

  const force = dryRun
    ? false
    : await confirm({
        message: "Regravar arquivos de saída que já existem?",
        default: false,
      });

  await runPipeline({ projectDir, force, dryRun });
}

async function menuConfluence(): Promise<void> {
  const pageId = await input({
    message: "ID da página do Confluence:",
    required: true,
  });

  const recursive = await confirm({
    message: "Incluir páginas filhas (recursivo)?",
    default: true,
  });

  const { results, outputDir } = await downloadConfluence({ pageId, recursive });

  const enrich = await confirm({
    message: "Enriquecer páginas com Gemini? (gera versão mais detalhada de cada MD)",
    default: false,
  });

  if (enrich) {
    await enrichConfluence(results, outputDir);
  }
}

async function menuNeo4j(): Promise<void> {
  const dryRun = await confirm({
    message: "Dry-run? (imprime os statements sem executar no Neo4j)",
    default: false,
  });

  await ingestCypher({ dryRun });
}

export async function showMenu(): Promise<void> {
  console.log("\n=== Context Extractor ===\n");

  const action = await select({
    message: "O que você gostaria de fazer?",
    choices: [
      {
        name: "Extrair contexto de projeto (Gemini)",
        value: "gemini",
        description: "Analisa um diretório e gera JSONs via Gemini API",
      },
      {
        name: "Baixar documentação do Confluence",
        value: "confluence",
        description: "Baixa uma página (e filhas) como arquivos Markdown",
      },
      {
        name: "Sincronizar com Neo4j",
        value: "neo4j",
        description: "Executa os arquivos .cypher gerados contra o Neo4j",
      },
      {
        name: "Sair",
        value: "exit",
      },
    ],
  });

  if (action === "exit") {
    console.log("Até mais!");
    process.exit(0);
  }

  if (action === "gemini") await menuGemini();
  if (action === "confluence") await menuConfluence();
  if (action === "neo4j") await menuNeo4j();
}
