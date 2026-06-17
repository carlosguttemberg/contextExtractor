import { request as httpsRequest } from "node:https";
import { readFileSync, existsSync } from "node:fs";
import { config } from "../config.js";

export interface ConfluencePage {
  id: string;
  title: string;
  body: {
    view: { value: string };
  };
}

interface ChildrenResponse {
  results: ConfluencePage[];
  size: number;
  start: number;
  limit: number;
}

function getAuthHeader(): string {
  const { confluenceEmail, confluenceApiKey } = config;
  if (!confluenceEmail || !confluenceApiKey) {
    throw new Error(
      "CONFLUENCE_EMAIL e CONFLUENCE_API_KEY são obrigatórios para acessar o Confluence."
    );
  }
  return `Basic ${Buffer.from(`${confluenceEmail}:${confluenceApiKey}`).toString("base64")}`;
}

function baseUrl(): string {
  if (!config.confluenceBaseUrl) {
    throw new Error("CONFLUENCE_BASE_URL é obrigatório para acessar o Confluence.");
  }
  return `${config.confluenceBaseUrl.replace(/\/$/, "")}/rest/api`;
}

function buildTlsOptions(): { rejectUnauthorized: boolean; ca?: Buffer } {
  if (config.confluenceTlsSkipVerify) {
    console.warn(
      "  [aviso] CONFLUENCE_TLS_SKIP_VERIFY=true — verificação de certificado desabilitada."
    );
    return { rejectUnauthorized: false };
  }

  const caPath = process.env.NODE_EXTRA_CA_CERTS;
  if (caPath && existsSync(caPath)) {
    return { rejectUnauthorized: true, ca: readFileSync(caPath) };
  }

  return { rejectUnauthorized: true };
}

function httpsGet<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const tls = buildTlsOptions();

    const req = httpsRequest(
      {
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: parsed.pathname + parsed.search,
        method: "GET",
        headers: {
          Authorization: getAuthHeader(),
          Accept: "application/json",
        },
        ...tls,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf-8");
          if ((res.statusCode ?? 0) >= 400) {
            reject(new Error(`Confluence ${res.statusCode} em ${url}: ${body}`));
            return;
          }
          try {
            resolve(JSON.parse(body) as T);
          } catch {
            reject(new Error(`Resposta inválida do Confluence: ${body.slice(0, 200)}`));
          }
        });
      }
    );

    req.on("error", reject);
    req.end();
  });
}

export async function getPage(pageId: string): Promise<ConfluencePage> {
  return httpsGet<ConfluencePage>(
    `${baseUrl()}/content/${pageId}?expand=body.view,title`
  );
}

export async function getChildPages(pageId: string): Promise<ConfluencePage[]> {
  const all: ConfluencePage[] = [];
  let start = 0;
  const limit = 50;

  while (true) {
    const resp = await httpsGet<ChildrenResponse>(
      `${baseUrl()}/content/${pageId}/child/page?expand=body.view,title&limit=${limit}&start=${start}`
    );
    all.push(...resp.results);
    if (resp.results.length < limit) break;
    start += limit;
  }

  return all;
}
