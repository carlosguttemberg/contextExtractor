import { GoogleAuth } from "google-auth-library";

const DEFAULT_SCOPES = [
  "https://www.googleapis.com/auth/cloud-platform",
  "https://www.googleapis.com/auth/generative-language",
];

export function resolveScopes(): string[] {
  const env = process.env.GOOGLE_TOKEN_SCOPES;
  if (env) return env.split(",").map((s) => s.trim()).filter(Boolean);
  return DEFAULT_SCOPES;
}

let authInstance: GoogleAuth | null = null;

function getAuth(keyFile: string): GoogleAuth {
  if (!authInstance) {
    authInstance = new GoogleAuth({ keyFile, scopes: resolveScopes() });
  }
  return authInstance;
}

export async function getAccessToken(keyFile: string): Promise<string> {
  const auth = getAuth(keyFile);
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();

  if (!tokenResponse.token) {
    throw new Error("Não foi possível obter o access token da service account.");
  }

  const token = tokenResponse.token;
  const preview = token.slice(0, 10);

  // expires_in vem na resposta HTTP (segundos a partir de agora)
  const expiresIn =
    (tokenResponse.res?.data as { expires_in?: number } | undefined)?.expires_in ??
    (() => {
      // fallback: expiry_date nas credenciais cacheadas do cliente (ms epoch)
      const expiryDate = (client as { credentials?: { expiry_date?: number } })
        .credentials?.expiry_date;
      return expiryDate ? Math.round((expiryDate - Date.now()) / 1000) : null;
    })();

  console.log(`Token gerado: ${preview}... | expira em ${expiresIn ?? "?"} segundos`);
  console.log(`Scopes: ${resolveScopes().join(", ")}`);
  return token;
}
