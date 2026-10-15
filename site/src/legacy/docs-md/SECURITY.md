# Security policy

## Supported version

Security fixes are applied to the latest release line. Until the first public
release, the workspace version is the only supported version.

## Reporting a vulnerability

Do not open a public issue containing an exploit, credential, customer URL or
payment payload. Use the repository host's private security-advisory channel once
the repository is published. Before the first pilot, the project owner must add
a monitored security address and an alternate contact here.

Include:

- the affected version or commit;
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
