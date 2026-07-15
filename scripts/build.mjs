import { copyFile, mkdir } from "node:fs/promises";

await mkdir("dist", { recursive: true });
await Promise.all([
  copyFile("src/index.js", "dist/index.js"),
  copyFile("src/fotmob.js", "dist/fotmob.js"),
]);
