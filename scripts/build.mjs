import { access, cp, mkdir, rm, writeFile } from "node:fs/promises";
import { build as esbuild } from "esbuild";

await rm("dist", { force: true, recursive: true });

// The manifest is authored as TypeScript (src/manifest.ts) and stays the
// single source of truth; bundle it and evaluate the IIFE to emit its JSON.
const manifestBundle = await esbuild({
  entryPoints: ["src/manifest.ts"],
  bundle: true,
  write: false,
  format: "iife",
  globalName: "__ytdlpManifest",
  platform: "browser",
  target: "es2022",
  logLevel: "silent"
});
const manifestModule = new Function(
  `${new TextDecoder().decode(manifestBundle.outputFiles[0].contents)}; return __ytdlpManifest;`
)();
await mkdir("dist", { recursive: true });
await writeFile("dist/manifest.json", `${JSON.stringify(manifestModule.manifest, null, 2)}\n`);

// Static assets (extension icons) ship from public/.
await access("public")
  .then(() => cp("public", "dist", { recursive: true }))
  .catch(() => {});

await esbuild({
  entryPoints: ["src/background/index.ts"],
  outfile: "dist/assets/background.js",
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  sourcemap: true,
  logLevel: "info"
});

await esbuild({
  entryPoints: ["src/content/page-reader.ts"],
  outfile: "dist/assets/page-reader.js",
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2022",
  sourcemap: true,
  logLevel: "info"
});

await esbuild({
  entryPoints: ["src/content/index.ts"],
  outfile: "dist/assets/content.js",
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2022",
  sourcemap: true,
  logLevel: "info"
});
