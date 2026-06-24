import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { config } from "../config.js";
import { processCypherForFile, escapeCypherValue, type NodeKey } from "./cypher.js";

export interface IngestOptions {
  outputDir?: string;
  dryRun?: boolean;
}

async function buildCypherFiles(outputDir: string): Promise<{ files: string[]; nodeKeys: NodeKey[] }> {
  let jsonFiles: string[];
  try {
    jsonFiles = (await readdir(outputDir))
      .filter((f) => f.endsWith(".json"))
      .sort();
  } catch {
    return { files: [], nodeKeys: [] };
  }

  if (jsonFiles.length === 0) return { files: [], nodeKeys: [] };

  console.log(`\nGerando Cypher para ${jsonFiles.length} arquivo(s) JSON...`);
  const files: string[] = [];
  const nodeKeys: NodeKey[] = [];

  for (const file of jsonFiles) {
    const id = file.replace(/\.json$/, "");
    const result = await processCypherForFile(id, outputDir, config.graphSchemaDir);
    if (!result) continue;
    if (result.errors.length > 0) {
      console.warn(`  [aviso] ${id}: ${result.errors.join("; ")}`);
    }
    if (result.cypher.trim()) {
      files.push(`${id}.cypher`);
      nodeKeys.push(...result.nodeKeys);
      console.log(`  ✓ ${id}.cypher`);
    }
  }

  return { files, nodeKeys };
}

function requireDriverConfig(): void {
  if (!config.neo4jUri || !config.neo4jUser || !config.neo4jPassword) {
    throw new Error(
      "NEO4J_URI, NEO4J_USER e NEO4J_PASSWORD são obrigatórios para sincronizar."
    );
  }
}

async function openDriver() {
  const { default: neo4j } = await import("neo4j-driver");
  return neo4j.driver(
    config.neo4jUri!,
    neo4j.auth.basic(config.neo4jUser!, config.neo4jPassword!)
  );
}

async function detachRelationships(
  driver: import("neo4j-driver").Driver,
  nodeKeys: NodeKey[],
  dryRun: boolean
): Promise<void> {
  const unique = new Map<string, NodeKey>();
  for (const nk of nodeKeys) unique.set(`${nk.label}:${nk.keyProp}:${String(nk.keyValue)}`, nk);

  console.log(`\nLimpando relacionamentos antigos de ${unique.size} nó(s)...`);

  for (const nk of unique.values()) {
    const stmt = `MATCH (n:${nk.label} {${nk.keyProp}: ${escapeCypherValue(nk.keyValue)}})-[r]-() DELETE r`;

    if (dryRun) {
      console.log(`  [dry-run] ${stmt}`);
      continue;
    }

    const session = driver.session();
    try {
      await session.run(stmt);
      console.log(`  ✓ ${nk.label}.${nk.keyProp}=${String(nk.keyValue)}`);
    } catch (err) {
      console.error(`  ✗ ${nk.label}.${nk.keyProp}=${String(nk.keyValue)} — ${(err as Error).message}`);
    } finally {
      await session.close();
    }
  }
}

async function executeCypherFiles(
  driver: import("neo4j-driver").Driver,
  cypherDir: string,
  files: string[],
  dryRun: boolean
): Promise<void> {
  for (const file of files) {
    const content = await readFile(join(cypherDir, file), "utf-8");
    const statements = content
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);

    if (dryRun) {
      console.log(`\n[dry-run] ${file} — ${statements.length} statements`);
      for (const s of statements) console.log("  " + s.replace(/\n/g, " "));
      continue;
    }

    const session = driver.session();
    try {
      const tx = session.beginTransaction();
      for (const stmt of statements) {
        await tx.run(stmt);
      }
      await tx.commit();
      console.log(`  ✓ ${file} — ${statements.length} statements`);
    } catch (err) {
      console.error(`  ✗ ${file} — ${(err as Error).message}`);
    } finally {
      await session.close();
    }
  }
}

export async function ingestCypher(opts: IngestOptions = {}): Promise<void> {
  const outputDir = resolve(opts.outputDir ?? config.outputDir);
  const dryRun = opts.dryRun ?? false;

  requireDriverConfig();

  await buildCypherFiles(outputDir);

  const cypherDir = join(outputDir, "cypher");
  let files: string[];
  try {
    files = (await readdir(cypherDir)).filter((f) => f.endsWith(".cypher")).sort();
  } catch {
    console.error(`Nenhum arquivo .cypher encontrado. Execute "generate" primeiro.`);
    return;
  }

  if (files.length === 0) {
    console.log("Nenhum arquivo Cypher para executar.");
    return;
  }

  const driver = await openDriver();

  console.log(`\nSincronizando com Neo4j: ${files.length} arquivo(s)${dryRun ? " [dry-run]" : ""}...`);
  await executeCypherFiles(driver, cypherDir, files, dryRun);

  await driver.close();
  console.log("\nSincronização concluída.");
}

export async function syncApplication(opts: IngestOptions = {}): Promise<void> {
  const outputDir = resolve(opts.outputDir ?? config.outputDir);
  const dryRun = opts.dryRun ?? false;

  requireDriverConfig();

  const { files, nodeKeys } = await buildCypherFiles(outputDir);

  if (files.length === 0) {
    console.log("Nenhum arquivo Cypher gerado — nada para atualizar.");
    return;
  }

  const cypherDir = join(outputDir, "cypher");
  const driver = await openDriver();

  console.log(`\nAtualizando aplicação: ${nodeKeys.length} nó(s) tocado(s)${dryRun ? " [dry-run]" : ""}.`);

  await detachRelationships(driver, nodeKeys, dryRun);

  console.log(`\nReinserindo nós e relacionamentos atuais (${files.length} arquivo(s))...`);
  await executeCypherFiles(driver, cypherDir, files, dryRun);

  await driver.close();
  console.log("\nAtualização da aplicação concluída.");
}
