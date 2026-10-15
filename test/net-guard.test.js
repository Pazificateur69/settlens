import test from "node:test";
import assert from "node:assert/strict";
import { assertPublicDestination, isPublicAddress } from "../src/net-guard.js";

const PUBLIC = [
  "8.8.8.8",
  "1.1.1.1",
  "172.15.255.255",
  "172.32.0.0",
  "100.63.255.255",
  "100.128.0.0",
  "198.17.255.255",
  "198.20.0.0",
  "223.255.255.255",
  "2606:4700:4700::1111",
  "2001:4860:4860::8888",
  "::ffff:8.8.8.8",
  "64:ff9b::808:808",
  "2002:808:808::1",
  "[2606:4700::1]",
];

const NON_PUBLIC = [
  "0.0.0.0",
  "0.1.2.3",
  "10.1.2.3",
  "100.64.0.1",
  "100.127.255.255",
  "127.0.0.1",
  "127.255.255.254",
  "169.254.169.254",
  "172.16.0.1",
  "172.31.255.255",
  "192.0.0.8",
  "192.0.2.1",
  "192.168.1.1",
  "198.18.0.1",
  "198.19.255.255",
  "198.51.100.7",
  "203.0.113.9",
  "224.0.0.1",
  "239.255.255.255",
  "240.0.0.1",
  "255.255.255.255",
  "::",
  "::1",
  "fc00::1",
  "fd12:3456::1",
  "fe80::1",
  "fe80::1%eth0",
  "ff02::1",
  "::ffff:127.0.0.1",
  "::ffff:7f00:1",
  "::ffff:10.0.0.1",
  "::ffff:169.254.169.254",
  "::127.0.0.1",
  "::ffff:0:127.0.0.1",
  "64:ff9b::7f00:1",
  "64:ff9b::10.0.0.1",
  "64:ff9b:1::1",
  "2002:7f00:1::1",
  "2002:a00:1::",
  "2001::1",
  "2001:db8::1",
  "3fff::1",
  "not-an-ip",
  "1:2:3",
  "1::2::3",
  "",
];

test("public addresses are recognised", () => {
  for (const address of PUBLIC) {
    assert.equal(isPublicAddress(address), true, address);
  }
});

test("private, local, reserved and embedded-private addresses are rejected", () => {
  for (const address of NON_PUBLIC) {
    assert.equal(isPublicAddress(address), false, address);
  }
});

const neverResolve = async () => {
  throw new Error("the resolver must not be called");
};

test("unsafe URLs are rejected before any DNS lookup", async () => {
  const cases = [
    ["not a url", /absolute URL/],
    ["ftp://example.com/file", /http and https/],
    ["file:///etc/passwd", /http and https/],
    ["https://user:secret@example.com/", /Credentials/],
    ["http://localhost:4402/secure", /Local/],
    ["http://LOCALHOST./", /Local/],
    ["http://api.localhost/", /Local/],
    ["http://printer.local/", /Local/],
    ["http://metadata.google.internal/", /Local/],
    ["http://127.0.0.1/", /non-routable/],
    ["http://127.1/", /non-routable/],
    ["http://2130706433/", /non-routable/],
    ["http://0x7f000001/", /non-routable/],
    ["http://0/", /non-routable/],
    ["http://[::1]:8080/", /non-routable/],
    ["http://[::ffff:127.0.0.1]/", /non-routable/],
    ["http://[fd00::1]/", /non-routable/],
    ["http://169.254.169.254/latest/meta-data/", /non-routable/],
    ["https://8.8.8.8:8443/", /ports 80 and 443/],
    ["http://93.184.215.14:3318/", /ports 80 and 443/],
  ];
  for (const [url, expected] of cases) {
    await assert.rejects(
      assertPublicDestination(url, { resolver: neverResolve }),
      expected,
      url,
    );
  }
});

test("public literals pass without DNS and public names are resolved", async () => {
  const literal = await assertPublicDestination("https://8.8.8.8/x", {
    resolver: neverResolve,
  });
  assert.equal(literal.hostname, "8.8.8.8");
  for (const url of ["http://8.8.8.8:80/x", "https://8.8.8.8:443/x", "http://8.8.8.8:443/x"]) {
    await assertPublicDestination(url, { resolver: neverResolve });
  }

  const lookups = [];
  const resolved = await assertPublicDestination("https://pay.example.com/paid", {
    resolver: async (host) => {
      lookups.push(host);
      return [
        { address: "93.184.215.14", family: 4 },
        { address: "2606:2800:21f:cb07:6820:80da:af6b:8b2c", family: 6 },
      ];
    },
  });
  assert.equal(resolved.pathname, "/paid");
  assert.deepEqual(lookups, ["pay.example.com"]);

  await assertPublicDestination("https://pay.example.com/", {
    resolver: async () => ["93.184.215.14"],
  });
});

test("names resolving to any private answer, or to nothing, are rejected", async () => {
  const resolverFor = (answers) => async () => answers;
  await assert.rejects(
    assertPublicDestination("https://rebind.example/", {
      resolver: resolverFor([{ address: "93.184.215.14" }, { address: "10.0.0.5" }]),
    }),
    /private or non-routable/,
  );
  await assert.rejects(
    assertPublicDestination("https://mapped.example/", {
      resolver: resolverFor([{ address: "::ffff:192.168.0.1" }]),
    }),
    /private or non-routable/,
  );
  await assert.rejects(
    assertPublicDestination("https://empty.example/", { resolver: resolverFor([]) }),
    /no address/,
  );
  await assert.rejects(
    assertPublicDestination("https://empty.example/", { resolver: resolverFor(null) }),
    /no address/,
  );
  await assert.rejects(
    assertPublicDestination("https://broken.example/", {
      resolver: async () => {
        throw new Error("ENOTFOUND");
      },
    }),
    /Could not resolve broken\.example: ENOTFOUND/,
  );
});

test("the default resolver rejects names that do not resolve", async () => {
  await assert.rejects(
    assertPublicDestination("https://settlens-test.invalid/"),
    /Could not resolve/,
  );
});
