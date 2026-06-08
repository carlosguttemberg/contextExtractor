import { GoogleGenAI } from "@google/genai";
import { config } from "../config.js";
import { resolveScopes } from "../auth/gemini-auth.js";

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
const TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS ?? 120_000);

let genaiInstance: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!genaiInstance) {
    genaiInstance = new GoogleGenAI({
      vertexai: true,
      project: config.gcpProjectId,
      location: config.gcpLocation,
      googleAuthOptions: {
        keyFile: config.googleApplicationCredentials,
        scopes: resolveScopes(),
      },
    });
  }
  return genaiInstance;
}

function isRetryableError(err: unknown): boolean {
  if (err instanceof Error) {
    const status = (err as Error & { status?: number }).status;
    if (status && RETRYABLE_STATUS.has(status)) return true;
    if (err.message.includes("429") || err.message.includes("quota")) return true;
  }
  return false;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

export async function generate(prompt: string): Promise<string> {
  const ai = getClient();
  let attempt = 0;

  while (attempt <= MAX_RETRIES) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await ai.models.generateContent({
        model: config.geminiModel,
        contents: prompt,
      });

      clearTimeout(timer);
      const text = response.text;
      if (!text) throw new Error("Resposta vazia do modelo.");
      return text;
    } catch (err) {
      clearTimeout(timer);

      if (attempt < MAX_RETRIES && isRetryableError(err)) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        console.warn(`Gemini: tentativa ${attempt + 1} falhou. Aguardando ${delay}ms...`);
        await sleep(delay);
        attempt++;
        continue;
      }

      throw err;
    }
  }

  throw new Error("Número máximo de tentativas atingido.");
}
