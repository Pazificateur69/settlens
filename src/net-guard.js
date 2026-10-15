/* Destination guard for network tools exposed remotely (SSRF protection).
 *
 * Rejects non-HTTP(S) URLs, ports other than 80 and 443, URL credentials,
 * local host names and any host whose address (literal or every DNS answer) is
 * not publicly routable, including IPv4 addresses embedded in IPv6 (mapped,
 * compatible, NAT64, 6to4).
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

// [base, prefix length] pairs of IPv4 ranges that are not globally reachable.
const BLOCKED_IPV4 = [
  ["0.0.0.0", 8], // "this network"
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // CGNAT shared address space
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local (includes cloud metadata 169.254.169.254)
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // documentation
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // documentation
  ["203.0.113.0", 24], // documentation
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved, includes broadcast 255.255.255.255
].map(([base, bits]) => [ipv4ToInt(base), bits]);

const LOCAL_NAME = /(^|\.)(localhost|local|internal)$/;

function ipv4ToInt(address) {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(address);
  if (!match) {
    return null;
  }
  const octets = match.slice(1).map(Number);
  if (octets.some((octet) => octet > 255)) {
    return null;
  }
  return octets.reduce((value, octet) => value * 256 + octet, 0);
}

function isPublicIpv4Int(value) {
  return !BLOCKED_IPV4.some(
    ([base, bits]) =>
      Math.floor(value / 2 ** (32 - bits)) === Math.floor(base / 2 ** (32 - bits)),
  );
}

// Parses an IPv6 address (optionally with a dotted IPv4 tail or a %zone) into
// eight 16-bit groups. Returns null when the text is not a valid IPv6 address.
function ipv6Groups(address) {
  let text = address.toLowerCase().split("%")[0];
  const tail = /(\d+\.\d+\.\d+\.\d+)$/.exec(text);
  if (tail) {
    const value = ipv4ToInt(tail[1]);
    if (value === null) {
      return null;
    }
    text = `${text.slice(0, -tail[1].length)}${Math.floor(value / 65536).toString(16)}:${(value % 65536).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) {
    return null;
  }
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) {
    return null;
  }
  const groups = [
    ...head,
    ...Array(halves.length === 2 ? missing : 0).fill("0"),
    ...rest,
  ];
  if (groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) {
    return null;
  }
  return groups.map((group) => Number.parseInt(group, 16));
}

function isPublicIpv6(address) {
  const g = ipv6Groups(address);
  if (!g) {
    return false;
  }
  const embedded = (high, low) => isPublicIpv4Int(g[high] * 65536 + g[low]);
  const zeros = (from, to) => g.slice(from, to).every((group) => group === 0);

  // ::/96 (includes :: and ::1), ::ffff:0:0/96 mapped, ::ffff:0:0:0/96 translated.
  if (zeros(0, 5) && (g[5] === 0 || g[5] === 0xffff)) {
    return embedded(6, 7);
  }
  if (zeros(0, 4) && g[4] === 0xffff && g[5] === 0) {
    return embedded(6, 7);
  }
  // NAT64 well-known prefix 64:ff9b::/96 embeds an IPv4 address.
  if (g[0] === 0x64 && g[1] === 0xff9b && zeros(2, 6)) {
    return embedded(6, 7);
  }
  // 6to4 2002::/16 embeds an IPv4 address in groups 1-2.
  if (g[0] === 0x2002) {
    return embedded(1, 2);
  }
  // Only global unicast 2000::/3 is public. This excludes fc00::/7 (ULA),
  // fe80::/10 (link-local), ff00::/8 (multicast) and 64:ff9b:1::/48.
  if ((g[0] & 0xe000) !== 0x2000) {
    return false;
  }
  // 2001::/32 Teredo, 2001:db8::/32 and 3fff::/20 documentation.
  return !(
    (g[0] === 0x2001 && (g[1] === 0 || g[1] === 0xdb8)) ||
    (g[0] === 0x3fff && g[1] < 0x1000)
  );
}

export function isPublicAddress(address) {
  const text = String(address).replace(/^\[|\]$/g, "");
  const version = isIP(text.split("%")[0]);
  if (version === 4) {
    return isPublicIpv4Int(ipv4ToInt(text));
  }
  return version === 6 && isPublicIpv6(text);
}

function defaultResolver(hostname) {
  return lookup(hostname, { all: true, verbatim: true });
}

// fetch re-resolves DNS after this check (TOCTOU / DNS rebinding window); that
// is accepted because remote network tools are bearer-token gated, passive and
// never follow redirects.
export async function assertPublicDestination(rawUrl, { resolver = defaultResolver } = {}) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("The destination must be an absolute URL.");
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only http and https destinations are allowed.");
  }
  if (url.username || url.password) {
    throw new Error("Credentials in the URL are not allowed.");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  if (!host || LOCAL_NAME.test(host)) {
    throw new Error("Local destinations are not allowed.");
  }
  const literal = isIP(host.split("%")[0]) !== 0;
  if (literal && !isPublicAddress(host)) {
    throw new Error("Private or non-routable destinations are not allowed.");
  }
  // A public address can still be the server's own: other ports would reach its host services.
  // URL drops a scheme's default port, so "" is 80 for http and 443 for https.
  if (!["", "80", "443"].includes(url.port)) {
    throw new Error("Only ports 80 and 443 are allowed.");
  }
  if (literal) {
    return url;
  }

  let answers;
  try {
    answers = await resolver(host);
  } catch (error) {
    throw new Error(`Could not resolve ${host}: ${error.message}`);
  }
  const addresses = (answers ?? []).map((answer) =>
    typeof answer === "string" ? answer : answer?.address,
  );
  if (addresses.length === 0) {
    throw new Error(`Could not resolve ${host}: no address returned.`);
  }
  if (!addresses.every((address) => isPublicAddress(address))) {
    throw new Error(
      "The destination resolves to a private or non-routable address.",
    );
  }
  return url;
}
