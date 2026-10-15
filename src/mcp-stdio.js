/* MCP stdio transport: newline-delimited JSON-RPC on stdin/stdout.
 * Only protocol messages are written to `output`; diagnostics go to `error`.
 */
import { createInterface } from "node:readline";

// ponytail: lines are not length-bounded; the stdio peer is the local MCP client
// that spawned this process. Remote callers go through the bounded HTTP transport.
export function runStdioServer({
  input = process.stdin,
  output = process.stdout,
  error = process.stderr,
  server,
}) {
  return new Promise((resolve) => {
    const pending = new Set();
    const lines = createInterface({ input, crlfDelay: Infinity });
    const send = (message) => output.write(`${JSON.stringify(message)}\n`);
    output.on("error", (writeError) => {
      error.write(`settlens mcp: output closed (${writeError.message})\n`);
      lines.close();
    });

    lines.on("line", (line) => {
      if (!line.trim()) {
        return;
      }
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
        return;
      }
      const task = Promise.resolve()
        .then(() => server.handle(message))
        .then((response) => {
          if (response) {
            send(response);
          }
        })
        .catch((handleError) => {
          error.write(`settlens mcp: ${handleError.message}\n`);
        })
        .finally(() => pending.delete(task));
      pending.add(task);
    });

    lines.once("close", async () => {
      await Promise.allSettled([...pending]);
      resolve();
    });
  });
}
