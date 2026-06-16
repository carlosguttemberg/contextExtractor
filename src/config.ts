import { z } from "zod";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv(): void {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env"), "utf-8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // .env opcional — variáveis podem vir do ambiente
  }
}

function readProjectIdFromJson(credPath: string): string | undefined {
  try {
    const raw = readFileSync(resolve(credPath), "utf-8");
    const json = JSON.parse(raw) as { project_id?: string };
    return json.project_id;
  } catch {
    return undefined;
  }
}

loadEnv();

const ConfigSchema = z.object({
  googleApplicationCredentials: z.string().min(1, "GOOGLE_APPLICATION_CREDENTIALS é obrigatório"),
  gcpProjectId: z.string().min(1, "project_id não encontrado — defina GCP_PROJECT_ID ou verifique o JSON da service account"),
  gcpLocation: z.string().default("us-central1"),
  geminiModel: z.string().default("gemini-2.5-pro"),
  promptsDir: z.string().default("./prompts"),
  graphSchemaDir: z.string().default("./graph-schema"),
  outputDir: z.string().default("./output"),
  neo4jUri: z.string().optional(),
  neo4jUser: z.string().optional(),
  neo4jPassword: z.string().optional(),
  confluenceBaseUrl: z.string().optional(),
  confluenceEmail: z.string().optional(),
  confluenceApiKey: z.string().optional(),
  confluenceOutputDir: z.string().default("./output/confluence"),
});

export type Config = z.infer<typeof ConfigSchema>;

function buildConfig(): Config {
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS ?? "";
  const projectIdFromJson = credPath ? readProjectIdFromJson(credPath) : undefined;

  const result = ConfigSchema.safeParse({
    googleApplicationCredentials: credPath,
    gcpProjectId: process.env.GCP_PROJECT_ID ?? projectIdFromJson,
    gcpLocation: process.env.GCP_LOCATION,
    geminiModel: process.env.GEMINI_MODEL,
    promptsDir: process.env.PROMPTS_DIR,
    graphSchemaDir: process.env.GRAPH_SCHEMA_DIR,
    outputDir: process.env.OUTPUT_DIR,
    neo4jUri: process.env.NEO4J_URI,
    neo4jUser: process.env.NEO4J_USER,
    neo4jPassword: process.env.NEO4J_PASSWORD,
    confluenceBaseUrl: process.env.CONFLUENCE_BASE_URL,
    confluenceEmail: process.env.CONFLUENCE_EMAIL,
    confluenceApiKey: process.env.CONFLUENCE_API_KEY,
    confluenceOutputDir: process.env.CONFLUENCE_OUTPUT_DIR,
  });

  if (!result.success) {
    const msgs = result.error.issues.map((i) => `  • ${i.path.join(".")}: ${i.message}`).join("\n");
    console.error(`\nErro de configuração:\n${msgs}\n`);
    console.error("Copie .env.example para .env e preencha os valores obrigatórios.\n");
    process.exit(1);
  }

  return result.data;
}

export const config = buildConfig();

export function printConfig(cfg: Config): void {
  const safe = { ...cfg, neo4jPassword: cfg.neo4jPassword ? "***" : undefined };
  console.log("Config carregada:", JSON.stringify(safe, null, 2));
}
