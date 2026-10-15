# First pilot protocol

Status: preparation only. No client endpoint, approval or paid result is implied.
The owner workspace is private and single-owner; client credentials are never
shared through it. Use a separate local journal/configuration for each client.

## Required scope before execution

Record the integration owner's identity, the exact public HTTPS endpoint, request
method, x402 V2 HTTP profile, supported network/asset, advertised recipient and
atomic-unit spending ceiling. Record written authorization, its date/reference,
the environments and passive requests permitted, expected rate and retention.
Confirm that Settlens' supported static checks match that profile. Do not invent
an endpoint from a company name or reuse another prospect's authorization.
Avoid query credentials; arrange an appropriate approved test resource if needed.

The default pilot is passive. Active invalid-signature probes require separate
explicit authorization and the CLI's `--active --authorized --authorization-ref`
gate. No pilot step pays, signs a payment, calls `/settle`, checks balances or
establishes on-chain replay protection or settlement.

## Acceptance sequence

1. Run the approved passive scan and preserve its report. Review every failure,
   warning and unsupported check with the engineering owner.
2. Set explicit recipient, asset, network and atomic amount limits. Document token
   decimals from the integration's source; never infer them from a display symbol.
3. Review and explicitly approve an observable baseline; a scan alone is not an
   approval. Export the private CLI journal when transferring that baseline.
4. In fixtures or separately authorized staging, demonstrate a price/recipient
   change, a blocking CLI/CI result and a notification. Prove an outage does not
   establish recovery, and a valid restored observation resolves the incident.
5. Run a data-only backup/restoration drill without replaying notifications.
6. Deliver config, baseline, reports and the tested command/workflow, with scope,
   tool version, unsupported effects and findings requiring owner action.

The automatic HTTP workflow test reproduces these integration steps with synthetic
transactions and an injected mail transport. It is not evidence about a prospect's
production endpoint or email inbox. Signed evidence, when requested, uses the
existing evidence CLI and an independently protected owner signing key.

## Outcome record

Ask whether a concrete finding changed an integration decision, how long setup
took, which checks duplicated existing tooling and whether the team wants a paid
continuation. Record the actual response and reasons for declining. Proposed
validation targets remain three scoped pilots and one explicit paid continuation;
neither is currently a confirmed result. Do not promise a price, response time,
certification or detection rate that has not been established.
