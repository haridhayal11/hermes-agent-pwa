import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const document = JSON.parse(fs.readFileSync(path.join(root, "docs/api/v1/openapi.json"), "utf8"));
const routeRoot = path.join(root, "src/app/api/v1");

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : entry.name === "route.ts" ? [target] : [];
  });
}

const documentedShapes = new Set(
  Object.keys(document.paths).map((route) => route.replace(/\{[^}]+\}/g, "{}")),
);
const missing = walk(routeRoot)
  .map((file) =>
    "/api/v1/" +
    path
      .relative(routeRoot, path.dirname(file))
      .split(path.sep)
      .map((part) => part.replace(/^\[(.+)\]$/, "{$1}"))
      .join("/"),
  )
  .filter((route) => !documentedShapes.has(route.replace(/\{[^}]+\}/g, "{}")));

if (missing.length) {
  console.error(`OpenAPI is missing versioned routes:\n${missing.join("\n")}`);
  process.exit(1);
}
console.log(`OpenAPI covers ${Object.keys(document.paths).length} paths.`);
