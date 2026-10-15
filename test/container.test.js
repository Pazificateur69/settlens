import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("container policy pins the base image and runs without root", async () => {
  const dockerfile = await readFile(
    new URL("../Dockerfile", import.meta.url),
    "utf8",
  );

  const baseStages = dockerfile
    .split("\n")
    .filter((line) => line.startsWith("FROM "));
  assert.equal(baseStages.length, 2);
  assert.ok(
    baseStages.every((line) =>
      /^FROM node:24-alpine@sha256:[a-f0-9]{64} AS [a-z]+$/.test(line),
    ),
  );
  assert.match(dockerfile, /npm ci --omit=dev --ignore-scripts/);
  assert.match(dockerfile, /AS dependencies/);
  assert.match(dockerfile, /AS runtime/);
  assert.match(dockerfile, /rm -rf \/usr\/local\/lib\/node_modules\/npm/);
  assert.match(
    dockerfile,
    /COPY --from=dependencies --chown=node:node \/opt\/settlens\/node_modules \.\/node_modules/,
  );
  assert.match(dockerfile, /^USER node$/m);
  assert.match(
    dockerfile,
    /^ENTRYPOINT \["node", "\/opt\/settlens\/src\/cli\.js"\]$/m,
  );
  assert.doesNotMatch(dockerfile, /:latest(?:\s|$)/);
});

test("Plesk runtime profile is read-only, bounded and exposes no port", async () => {
  const compose = await readFile(
    new URL("../compose.plesk.yml", import.meta.url),
    "utf8",
  );

  assert.match(compose, /user: "1000:1000"/);
  assert.match(compose, /read_only: true/);
  assert.match(compose, /cap_drop:\n    - ALL/);
  assert.match(compose, /no-new-privileges:true/);
  assert.match(compose, /pids_limit: 64/);
  assert.match(compose, /mem_limit: 256m/);
  assert.match(compose, /network_mode: none/);
  assert.match(compose, /network_mode: bridge/);
  assert.doesNotMatch(compose, /^\s*ports:/m);
  assert.doesNotMatch(compose, /docker\.sock/);
});
