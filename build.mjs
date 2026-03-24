import esbuild from "esbuild";
import { readFileSync, writeFileSync } from "fs";
import { argv } from "process";

const isWatch = argv.includes("--watch");
const isProd = process.env.NODE_ENV === "production";

const define = {
  "process.env.NODE_ENV": isProd ? '"production"' : '"development"',
};

// ── Build 1: Main thread (code.ts → code.js) ──────────────────────────────
/** @type {import("esbuild").BuildOptions} */
const codeOptions = {
  entryPoints: ["src/code.ts"],
  bundle: true,
  outfile: "code.js",
  platform: "browser",
  target: "es2017",
  define,
  logLevel: "info",
};

// ── Build 2: UI bundle (React → inlined into ui.html) ──────────────────────
/** @type {import("esbuild").BuildOptions} */
const uiOptions = {
  entryPoints: ["src/ui/index.tsx"],
  bundle: true,
  write: false,
  platform: "browser",
  target: "es2017",
  define,
  minify: isProd,
  jsx: "automatic",
  logLevel: "info",
};

async function buildAll() {
  const [, uiResult] = await Promise.all([
    esbuild.build(codeOptions),
    esbuild.build(uiOptions),
  ]);

  const uiJs = uiResult.outputFiles[0].text;
  const template = readFileSync("src/ui/template.html", "utf-8");
  const html = template.replace("__UI_BUNDLE__", () => uiJs);
  writeFileSync("ui.html", html);
  console.log(`  ui.html  ${(Buffer.byteLength(html) / 1024).toFixed(1)}kb`);
}

if (isWatch) {
  // For watch mode, rebuild both on any change
  const ctxCode = await esbuild.context(codeOptions);
  const ctxUi = await esbuild.context({
    ...uiOptions,
    write: true,
    outfile: ".ui-bundle.js",
    plugins: [
      {
        name: "inline-html",
        setup(build) {
          build.onEnd((result) => {
            if (result.errors.length > 0) return;
            try {
              const uiJs = readFileSync(".ui-bundle.js", "utf-8");
              const template = readFileSync("src/ui/template.html", "utf-8");
              const html = template.replace("__UI_BUNDLE__", () => uiJs);
              writeFileSync("ui.html", html);
              console.log(`  ui.html  ${(Buffer.byteLength(html) / 1024).toFixed(1)}kb`);
            } catch (e) {
              console.error("Failed to inline UI bundle:", e);
            }
          });
        },
      },
    ],
  });
  await Promise.all([ctxCode.watch(), ctxUi.watch()]);
  console.log("Watching for changes...");
} else {
  await buildAll();
}

