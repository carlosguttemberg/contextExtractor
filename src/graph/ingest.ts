import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { config } from "../config.js";
import { processCypherForFile } from "./cypher.js";

export interface IngestOptions {
  outputDir?: string;
  dryRun?: boolean;
}

async function buildCypherFiles(outputDir: string): Promise<string[]> {
  let jsonFiles: string[];
  try {
    jsonFiles = (await readdir(outputDir))
      .filter((f) => f.endsWith(".json"))
      .sort();
  } catch {
    return [];
  }

  if (jsonFiles.length === 0) return [];

  console.log(`\nGerando Cypher para ${jsonFiles.length} arquivo(s) JSON...`);
  const generated: string[] = [];

  for (const file of jsonFiles) {
    const id = file.replace(/\.json$/, "");
    const result = await processCypherForFile(id, outputDir, config.graphSchemaDir);
    if (!result) continue;
    if (result.errors.length > 0) {
      console.warn(`  [aviso] ${id}: ${result.errors.join("; ")}`);
    }
    if (result.cypher.trim()) {
      generated.push(`${id}.cypher`);
      console.log(`  ✓ ${id}.cypher`);
    }
  }

  return generated;
}

export async function ingestCypher(opts: IngestOptions = {}): Promise<void> {
  const outputDir = resolve(opts.outputDir ?? config.outputDir);
  const dryRun = opts.dryRun ?? false;

  if (!config.neo4jUri || !config.neo4jUser || !config.neo4jPassword) {
    throw new Error(
      "NEO4J_URI, NEO4J_USER e NEO4J_PASSWORD são obrigatórios para sincronizar."
    );
  }

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

  const { default: neo4j } = await import("neo4j-driver");
  const driver = neo4j.driver(
    config.neo4jUri,
    neo4j.auth.basic(config.neo4jUser, config.neo4jPassword)
  );

  console.log(`\nSincronizando com Neo4j: ${files.length} arquivo(s)${dryRun ? " [dry-run]" : ""}...`);

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

  await driver.close();
  console.log("\nSincronização concluída.");
}
