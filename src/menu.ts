import { select, input, confirm } from "@inquirer/prompts";
import { runPipeline } from "./pipeline/generate.js";
import { downloadConfluence } from "./confluence/downloader.js";

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

  await downloadConfluence({ pageId, recursive });
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
}
