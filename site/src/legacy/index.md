<!-- Legacy source: site/index.html (removed). Old canonical: https://settlens.com/ -->
<!-- Old <title>: Settlens — Security & Conformance for x402 Agentic Payments -->
<!-- Old meta description: Settlens is the independent security and conformance platform for x402 agentic payments. Test implementations for protocol drift, replay, payment-binding and settlement failures — in CI and before production. -->

** AGENTIC PAYMENT ASSURANCE

# Ship machine payments without blind spots.

Test x402 payment flows for configuration, protocol and settlement failures before they reach production. [Request a private assessment](#pilot)[Try the demo](#scanner)

Built for x402 facilitators, AI agent platforms and payment infrastructure teams.  `settlens scan — demo mode`**x402 v2**

*$* settlens scan facilitator.example.com

▸ discovering payment surface … 3 routes found

**✓** Facilitator reachable 142 ms

**✓** Payment requirements valid x402 v2

**✓** Settlement verification complete tx confirmed

**✓** Replay protection enforced nonce · expiry

---

Scan statusPASS 8 checks passed · **0 critical issues**

evidence sha256:9f2c…a41d  BUILT FOR**x402 FACILITATORS****AI AGENT INFRASTRUCTURE****WEB3 APIs****PAYMENT GATEWAYS**

THE PROBLEM

## Machine payments fail silently.

When a payment flow is misconfigured, the request does not always crash. It simply stops settling. Settlens turns that uncertainty into evidence.01

### Protocol drift

Detect requirements and schema changes before an integration quietly breaks.02

### Settlement gaps

Verify that a successful response corresponds to a real, bound transaction.03

### Production blind spots

Catch replay, timeout and transport weaknesses in CI and controlled pilots.

ONE REPRODUCIBLE FLOW

## From request to verified settlement.**01**

### Discover

Map routes, schemes, networks and facilitator dependencies.**02**

### Validate

Check requirements against the protocol and hardening rules.**03**

### Verify

Exercise settlement and validate the resulting evidence.**04**

### Report

Export clear JSON, HTML and SARIF artifacts for your team.

INTERACTIVE DEMO

## Run a scan in seconds.

This public demo is deterministic and does not contact the URL you enter. Connect the production scanner when you are ready for a pilot.Facilitator URLNetworkBase Sepolia (testnet)Base (mainnet)Ethereum (mainnet)◎

Enter a target and start the demo.

EVIDENCE OVER ASSUMPTIONS

## Independent by design.

Settlens never takes custody of funds or private keys. It produces deterministic checks and verifiable artifacts your engineers, partners and auditors can inspect.[Read the methodology →](docs/)

**01**Deterministic checks

**02**Reproducible evidence

**03**Conservative severity scoring

**04**Machine-readable reports

START SMALL, PROVE VALUE

## Start with a technical pilot.

A focused assessment of one payment surface, followed by a production-readiness report and clear next steps.

### What you receive

- Scoped x402 integration review
- Evidence-backed findings
- CI-ready report artifacts
- Engineering debrief

[Pilot request form: name, work email, company, message -> POST /api/pilot]

FAQ

## Questions, answered plainly.

**Q: What is x402?**

x402 is an open protocol that lets clients pay for web resources over standard HTTP requests. Settlens tests implementations of that flow.

**Q: Do I need a token?**

No. Settlens is not a blockchain and does not require a Settlens token.

**Q: Does Settlens custody funds?**

No. Settlens is an assurance tool. It does not custody funds or request private keys.

**Q: Can I run it in CI/CD?**

Yes. The CLI, GitHub Action and JSON/SARIF reports are designed for automated checks.
