import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// The `run: |` block of the composite step with the given id.
async function stepScript(id) {
  const lines = (await readFile(join(projectRoot, "action.yml"), "utf8")).split("\n");
  const start = lines.findIndex((line) => line.trim() === `id: ${id}`);
  const run = lines.findIndex((line, index) => index > start && line.trim() === "run: |");
  const body = [];
  for (const line of lines.slice(run + 1)) {
    if (line.trim() !== "" && !line.startsWith("        ")) {
      break;
    }
    body.push(line.slice(8));
  }
  return body.join("\n");
}

function runBash(scriptPath, env, cwd) {
  return new Promise((resolvePromise, reject) => {
    // GitHub runs `shell: bash` steps as: bash --noprofile --norc -eo pipefail {0}
    const child = spawn("bash", ["--noprofile", "--norc", "-eo", "pipefail", scriptPath], {
      cwd,
      env: { ...process.env, NO_COLOR: "1", ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.stdout.resume();
    child.once("error", reject);
    child.once("close", (code) => resolvePromise({ code, stderr }));
  });
}

test("the action sets report-directory even when the gate fails", async () => {
  const directory = await mkdtemp(join(tmpdir(), "settlens-action-"));
  try {
    const scriptPath = join(directory, "assess.sh");
    await writeFile(scriptPath, await stepScript("assess"));
    await writeFile(
      join(directory, "settlens.config.json"),
      JSON.stringify({
        version: 1,
        failOn: "high",
        output: "reports",
        defaults: { method: "GET", timeoutMs: 2000, repeat: 1 },
        // Port 9 (discard) refuses connections: a high-severity failure.
        targets: [{ name: "down", url: "http://127.0.0.1:9/paid" }],
      }),
    );
    const env = {
      GITHUB_ACTION_PATH: projectRoot,
      SETTLENS_ACTION_CONFIG: "settlens.config.json",
      SETTLENS_ACTION_OUTPUT: "evidence",
      SETTLENS_ACTION_FORMATS: "json",
      SETTLENS_ACTION_FAIL_ON: "high",
      SETTLENS_ALLOWED_HOSTS: "",
    };

    const gateOutput = join(directory, "gate-output");
    const gate = await runBash(scriptPath, { ...env, GITHUB_OUTPUT: gateOutput }, directory);
    assert.equal(gate.code, 1, gate.stderr);
    assert.equal(await readFile(gateOutput, "utf8"), "report-directory=evidence\n");

    const errorOutput = join(directory, "error-output");
    const error = await runBash(
      scriptPath,
      { ...env, GITHUB_OUTPUT: errorOutput, SETTLENS_ACTION_CONFIG: "missing.json" },
      directory,
    );
    assert.equal(error.code, 2, error.stderr);
    assert.equal(await readFile(errorOutput, "utf8"), "report-directory=evidence\n");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("the example workflow pins every action to a full commit SHA", async () => {
  const example = await readFile(join(projectRoot, "examples/github-workflow.yml"), "utf8");
  const ci = await readFile(join(projectRoot, ".github/workflows/ci.yml"), "utf8");
  const pins = [...example.matchAll(/uses:\s*([^\s@]+)@(\S+)/g)];
  assert.ok(pins.length >= 3);
  for (const [, action, ref] of pins) {
    assert.match(ref, /^[0-9a-f]{40}$/, `${action}@${ref}`);
  }
  const upload = /actions\/upload-artifact@([0-9a-f]+)/;
  assert.equal(example.match(upload)[1], ci.match(upload)[1]);
});
