import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { loadGraphSchema } from "./schema-loader.js";

export interface GraphNode {
  label: string;
  key: string;
  properties: Record<string, unknown>;
}

export interface GraphRelationship {
  type: string;
  from: string;
  to: string;
  properties?: Record<string, unknown>;
}

export interface GraphEnvelope {
  nodes?: GraphNode[];
  relationships?: GraphRelationship[];
}

const CONSTRAINT_PATTERN = /CREATE CONSTRAINT[^;]*UNIQUE\s*\{[^}]*n\.(\w+)\s*\}[^;]*;\s*\/\/\s*label:\s*(\w+)/gi;
const LABEL_KEY_PATTERN = /\/\/\s*key:\s*(\w+)\s+for\s+:(\w+)/gi;

function extractKeyMap(schemaText: string): Map<string, string> {
  const map = new Map<string, string>();
  let m: RegExpExecArray | null;

  CONSTRAINT_PATTERN.lastIndex = 0;
  while ((m = CONSTRAINT_PATTERN.exec(schemaText)) !== null) {
    map.set(m[2], m[1]);
  }

  LABEL_KEY_PATTERN.lastIndex = 0;
  while ((m = LABEL_KEY_PATTERN.exec(schemaText)) !== null) {
    map.set(m[2], m[1]);
  }

  return map;
}

function extractLabels(schemaText: string): Set<string> {
  const labels = new Set<string>();
  const nodePattern = /\(:(\w+)\)/g;
  const createPattern = /(?:Node|Label)[^(]*\((\w+)\)/g;
  const mergePattern = /MERGE\s+\([^:]*:(\w+)/gi;

  for (const pattern of [nodePattern, createPattern, mergePattern]) {
    let m: RegExpExecArray | null;
    pattern.lastIndex = 0;
    while ((m = pattern.exec(schemaText)) !== null) {
      if (m[1]) labels.add(m[1]);
    }
  }
  return labels;
}

function extractRelTypes(schemaText: string): Set<string> {
  const types = new Set<string>();
  const pattern = /\[:(\w+)\]/g;
  const mergePattern = /MERGE\s+\([^)]*\)-\[:(\w+)\]/gi;

  for (const p of [pattern, mergePattern]) {
    let m: RegExpExecArray | null;
    p.lastIndex = 0;
    while ((m = p.exec(schemaText)) !== null) {
      if (m[1]) types.add(m[1]);
    }
  }
  return types;
}

export function escapeCypherValue(val: unknown): string {
  if (typeof val === "string") return `"${val.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  if (val === null || val === undefined) return "null";
  return `"${JSON.stringify(val).replace(/"/g, '\\"')}"`;
}

function propsToMap(props: Record<string, unknown>): string {
  const pairs = Object.entries(props)
    .map(([k, v]) => `${k}: ${escapeCypherValue(v)}`)
    .join(", ");
  return `{${pairs}}`;
}

export interface NodeKey {
  label: string;
  keyProp: string;
  keyValue: unknown;
}

export interface CypherResult {
  id: string;
  cypher: string;
  errors: string[];
  nodeKeys: NodeKey[];
}

export async function generateCypher(
  id: string,
  envelope: GraphEnvelope,
  schemaDir: string,
  outputDir: string
): Promise<CypherResult> {
  const schemaText = await loadGraphSchema(schemaDir);
  const keyMap = extractKeyMap(schemaText);
  const validLabels = extractLabels(schemaText);
  const validRelTypes = extractRelTypes(schemaText);
  const schemaLoaded = schemaText.length > 0;

  const lines: string[] = [];
  const errors: string[] = [];
  const nodeKeys: NodeKey[] = [];

  for (const node of envelope.nodes ?? []) {
    if (schemaLoaded && validLabels.size > 0 && !validLabels.has(node.label)) {
      errors.push(`Label "${node.label}" não existe no schema — nó ignorado.`);
      continue;
    }

    const keyProp = keyMap.get(node.label) ?? "id";
    const keyValue = (node.properties[keyProp] ?? node.key) as unknown;
    const allProps = { ...node.properties, [keyProp]: keyValue };

    nodeKeys.push({ label: node.label, keyProp, keyValue });

    lines.push(
      `MERGE (n:${node.label} {${keyProp}: ${escapeCypherValue(keyValue)}})`,
      `SET n += ${propsToMap(allProps)};`
    );
  }

  for (const rel of envelope.relationships ?? []) {
    if (schemaLoaded && validRelTypes.size > 0 && !validRelTypes.has(rel.type)) {
      errors.push(`Tipo de relacionamento "${rel.type}" não existe no schema — ignorado.`);
      continue;
    }

    const propClause = rel.properties && Object.keys(rel.properties).length > 0
      ? ` SET r += ${propsToMap(rel.properties)}`
      : "";

    lines.push(
      `MATCH (a {id: ${escapeCypherValue(rel.from)}}), (b {id: ${escapeCypherValue(rel.to)}})`,
      `MERGE (a)-[r:${rel.type}]->(b)${propClause};`
    );
  }

  const cypher = lines.join("\n");
  const cypherDir = join(outputDir, "cypher");
  await mkdir(cypherDir, { recursive: true });
  await writeFile(join(cypherDir, `${id}.cypher`), cypher);

  return { id, cypher, errors, nodeKeys };
}

export async function processCypherForFile(
  id: string,
  outputDir: string,
  schemaDir: string
): Promise<CypherResult | null> {
  const jsonPath = join(resolve(outputDir), `${id}.json`);
  let raw: string;
  try {
    raw = await readFile(jsonPath, "utf-8");
  } catch {
    return null;
  }

  let envelope: GraphEnvelope;
  try {
    envelope = JSON.parse(raw) as GraphEnvelope;
  } catch {
    return { id, cypher: "", errors: [`JSON inválido em ${id}.json`], nodeKeys: [] };
  }

  return generateCypher(id, envelope, schemaDir, outputDir);
}
