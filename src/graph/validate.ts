import { Ajv } from "ajv";

const ajv = new Ajv({ allErrors: true });

const CODE_FENCE = /^```(?:\w+)?\s*\n([\s\S]*?)```\s*$/;
const JSON_SCHEMA_BLOCK = /```jsonschema[\s\S]*?```/gi;

function stripFences(raw: string): string {
  const trimmed = raw.trim();
  const match = CODE_FENCE.exec(trimmed);
  return match ? match[1].trim() : trimmed;
}

function stripJsonSchemaBlocks(raw: string): string {
  return raw.replace(JSON_SCHEMA_BLOCK, "").trim();
}

export interface ValidationResult {
  valid: boolean;
  parsed: unknown | null;
  errorMessage?: string;
}

export function validateOutput(
  raw: string,
  schema: Record<string, unknown> | null
): ValidationResult {
  const cleaned = stripFences(stripJsonSchemaBlocks(raw));

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    return {
      valid: false,
      parsed: null,
      errorMessage: `JSON inválido: ${(err as Error).message}`,
    };
  }

  if (!schema) return { valid: true, parsed };

  const validate = ajv.compile(schema);
  const ok = validate(parsed);
  if (!ok) {
    const msgs = (validate.errors ?? []).map((e: { instancePath: string; message?: string }) => `${e.instancePath} ${e.message}`).join("; ");
    return { valid: false, parsed: null, errorMessage: `Schema inválido: ${msgs}` };
  }

  return { valid: true, parsed };
}
