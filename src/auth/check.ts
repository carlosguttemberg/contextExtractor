import { config } from "../config.js";
import { getAccessToken } from "./gemini-auth.js";

try {
  await getAccessToken(config.googleApplicationCredentials);
  console.log("Autenticação OK.");
} catch (err) {
  console.error("Falha na autenticação:", (err as Error).message);
  process.exit(1);
}
