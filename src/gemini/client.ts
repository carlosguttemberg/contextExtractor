import { config } from "../config.js";
import { getAccessToken } from "../auth/gemini-auth.js";

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
const TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS ?? 120_000);

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  error?: { code: number; message: string; status: string };
}

function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUS.has(status);
}

async function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

export async function generate(prompt: string): Promise<string> {
  const token = await getAccessToken(config.googleApplicationCredentials);
  const url = `${BASE_URL}/${config.geminiModel}:generateContent`;

  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
  });

  let attempt = 0;
  while (attempt <= MAX_RETRIES) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body,
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!response.ok) {
        if (attempt < MAX_RETRIES && isRetryableStatus(response.status)) {
          const delay = BASE_DELAY_MS * Math.pow(2, attempt);
          console.warn(`Gemini: tentativa ${attempt + 1} falhou (${response.status}). Aguardando ${delay}ms...`);
          await sleep(delay);
          attempt++;
          continue;
        }
        const errBody = await response.text();
        throw new Error(`Gemini API ${response.status}: ${errBody}`);
      }

      const data = (await response.json()) as GeminiResponse;
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error("Resposta vazia do modelo.");
      return text;
    } catch (err) {
      clearTimeout(timer);

      if (err instanceof Error && err.name === "AbortError") {
        throw new Error(`Gemini: timeout após ${TIMEOUT_MS}ms`);
      }

      if (attempt < MAX_RETRIES && err instanceof Error && err.message.includes("429")) {
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
