// Served by the server with status 404 for any unknown URL, so every link here is absolute.

export const meta = {
  path: "/404",
  title: "Page not found",
  description: "The page you requested does not exist on settlens.com. Use these links to reach the product, documentation, guides or the team.",
  section: "system",
  lastmod: "2026-10-13",
  noindex: true,
};

export default function render(ctx) {
  const { hero, section, cards } = ctx;
  return ctx.html`${hero({
    title: "This page does not exist.",
    lede: "The link may be outdated, or the page moved when the site was rebuilt. These are the places most people are looking for.",
    actions: [
      { label: "Go to the home page", href: "/" },
      { label: "Contact us", href: "/contact" },
    ],
  })}
${section({
  title: "Popular destinations",
  body: cards(
    [
      { icon: "shield-check", title: "Product", body: "What Settlens checks, from passive scans to signed evidence.", href: "/product" },
      { icon: "book", title: "Documentation", body: "Install the CLI, configure checks and read reports.", href: "/docs" },
      { icon: "layers", title: "Learn x402", body: "How x402 V2 payments work and what to test.", href: "/learn" },
      { icon: "search", title: "Free tools", body: "Check an x402 payment request or an EIP-3009 signature in your browser.", href: "/tools" },
      { icon: "file", title: "Blog", body: "Notes on agentic payment security.", href: "/blog" },
    ],
    { columns: 3 },
  ),
})}`;
}
