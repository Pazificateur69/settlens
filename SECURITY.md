# Security policy

## Supported versions

| Version | Supported |
| --- | --- |
| 0.5.x | Yes |
| 0.4.x and older | No |

Security fixes are made on the latest release line only. The current version is
the one in `src/constants.js` and `package.json`.

## Scope

- the Settlens CLI (`src/cli.js`), its GitHub composite Action (`action.yml`)
  and its container image;
- the Settlens MCP server, both the local stdio server (`settlens mcp`) and the
  remote Streamable HTTP endpoint at `https://settlens.com/mcp`;
- the settlens.com website, including its pilot request form and scan API.

## Reporting a vulnerability

Write to **contact@settlens.com**. The same contact is published in
[`https://settlens.com/.well-known/security.txt`](https://settlens.com/.well-known/security.txt).
Do not open a public issue containing an exploit, credential, customer URL or
payment payload.

Include:

- the affected version or commit, or the URL for the website and remote endpoint;
- the smallest reproducible example;
- impact and preconditions;
- whether real funds, keys or customer systems were involved;
- safe contact details for coordinated follow-up.

Never include private keys, bearer tokens, real `PAYMENT-SIGNATURE` values or
unredacted customer data.

## Response targets

- acknowledgement: two business days;
- initial severity assessment: five business days;
- critical mitigation target: seven calendar days;
- coordinated disclosure date: agreed with the reporter.

These are operating targets, not contractual service levels.

## Safe testing

Only assess endpoints you own or have explicit written authorization to test.
Use testnet assets and synthetic data. Settlens active mode sends a deliberately
invalid authorization, but it still changes network traffic and therefore
requires an authorization reference. Settlens must never be used for denial of
service, credential testing, settlement, transaction replay or fund movement.
