import { GoogleAuth } from "google-auth-library";

const SCOPES = ["https://www.googleapis.com/auth/cloud-platform"];

let authInstance: GoogleAuth | null = null;

function getAuth(keyFile: string): GoogleAuth {
  if (!authInstance) {
    authInstance = new GoogleAuth({ keyFile, scopes: SCOPES });
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
  const expiry = (tokenResponse as { res?: { data?: { expiry_date?: number } } })
    ?.res?.data?.expiry_date;
  const expiresIn = expiry ? Math.round((expiry - Date.now()) / 1000) : null;

  console.log(`Token gerado: ${preview}... | expira em ${expiresIn ?? "?"} segundos`);
  return token;
}
