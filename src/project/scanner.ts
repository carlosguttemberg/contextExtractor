import fg from "fast-glob";
import { resolve } from "node:path";

const IGNORED_DIRS = [
  "**/node_modules/**",
  "**/dist/**",
  "**/.git/**",
  "**/build/**",
  "**/.next/**",
  "**/.nuxt/**",
  "**/coverage/**",
];

const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".webp",
  ".pdf", ".zip", ".tar", ".gz", ".exe", ".dll", ".so",
  ".woff", ".woff2", ".ttf", ".eot",
  ".mp4", ".mp3", ".wav", ".avi",
  ".lock",
]);

const MAX_FILE_SIZE_BYTES = 200_000;

export interface ScannedFile {
  path: string;
  relativePath: string;
}

export async function scanProject(projectDir: string): Promise<ScannedFile[]> {
  const root = resolve(projectDir);
  const files = await fg("**/*", {
    cwd: root,
    onlyFiles: true,
    ignore: IGNORED_DIRS,
    dot: false,
    followSymbolicLinks: false,
  });

  return files
    .filter((f) => {
      const ext = "." + f.split(".").pop()!.toLowerCase();
      return !BINARY_EXTENSIONS.has(ext);
    })
    .sort()
    .map((f) => ({ path: `${root}/${f}`, relativePath: f }));
}
