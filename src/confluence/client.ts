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
  const encoded = Buffer.from(`${confluenceEmail}:${confluenceApiKey}`).toString("base64");
  return `Basic ${encoded}`;
}

function baseUrl(): string {
  if (!config.confluenceBaseUrl) {
    throw new Error("CONFLUENCE_BASE_URL é obrigatório para acessar o Confluence.");
  }
  return `${config.confluenceBaseUrl.replace(/\/$/, "")}/wiki/rest/api`;
}

async function confluenceFetch<T>(path: string): Promise<T> {
  const url = `${baseUrl()}${path}`;
  const response = await fetch(url, {
    headers: {
      Authorization: getAuthHeader(),
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Confluence ${response.status} em ${url}: ${body}`);
  }

  return response.json() as Promise<T>;
}

export async function getPage(pageId: string): Promise<ConfluencePage> {
  return confluenceFetch<ConfluencePage>(
    `/content/${pageId}?expand=body.view,title`
  );
}

export async function getChildPages(pageId: string): Promise<ConfluencePage[]> {
  const all: ConfluencePage[] = [];
  let start = 0;
  const limit = 50;

  while (true) {
    const resp = await confluenceFetch<ChildrenResponse>(
      `/content/${pageId}/child/page?expand=body.view,title&limit=${limit}&start=${start}`
    );
    all.push(...resp.results);
    if (resp.results.length < limit) break;
    start += limit;
  }

  return all;
}
