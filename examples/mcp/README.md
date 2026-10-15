# Settlens MCP examples

Connect an AI agent to Settlens so it checks every x402 payment request before
paying. Full reference: [`docs/MCP.md`](../../docs/MCP.md).

Replace `/absolute/path/to/settlens` with the folder of your Settlens checkout
(pilot participants receive it; Node.js 20 or newer, `npm ci --ignore-scripts`).

## Claude Code

```bash
claude mcp add settlens -- node /absolute/path/to/settlens/src/cli.js mcp
```

Remote endpoint, offline tools only:

```bash
claude mcp add --transport http settlens https://settlens.com/mcp
```

Remote endpoint with the passive network tools (`scan_endpoint`,
`scan_facilitator`), which need a Settlens API token:

```bash
claude mcp add --transport http settlens https://settlens.com/mcp \
  --header "Authorization: Bearer ${SETTLENS_API_TOKEN}"
```

## Claude Desktop

Merge [`claude_desktop_config.json`](./claude_desktop_config.json) into your
Claude Desktop configuration and restart the app.

## Try it by hand

The server reads one JSON-RPC message per line on stdin and writes one per line
on stdout:

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"shell","version":"1"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  | node src/cli.js mcp
```

Ask the agent, for example: "Before paying for https://merchant.example/paid,
check it with Settlens. Only pay 0x209693Bc6afc0C5328bA36FaF03C514EF312287C, at
most 10000 atomic units on eip155:8453."
