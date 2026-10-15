// Free browser tools (/tools/*), progressive enhancement of form[data-tool]. Each form calls one offline
// tool of the same-origin MCP endpoint (POST /mcp, JSON-RPC tools/call) and renders the result with DOM
// methods only: the CSP sets trusted-types 'none', so innerHTML and HTML strings are never used.
(() => {
  const DECISION = { pay: "success", review: "warning", do_not_pay: "danger" };
  const STATUS = { pass: "success", fail: "danger", warn: "warning", skip: "neutral" };
  const SEVERITY = { critical: "danger", high: "warning", medium: "info", low: "neutral", info: "neutral" };

  const el = (tag, attrs, ...children) => {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs ?? {})) node.setAttribute(key, value);
    node.append(...children.flat().filter((child) => child != null && child !== false));
    return node;
  };
  const code = (text) => el("code", null, String(text ?? ""));
  const badge = (text, tone) => el("span", { class: `badge badge--${tone ?? "neutral"}` }, text);
  const table = (caption, head, rows) =>
    el("div", { class: "table-wrap", role: "region", "aria-label": caption, tabindex: "0" },
      el("table", { class: "table" }, el("caption", null, caption),
        el("thead", null, el("tr", null, head.map((label) => el("th", { scope: "col" }, label)))),
        el("tbody", null, rows.map((row) => el("tr", null, row.map((cell, i) => (i ? el("td", { "data-label": head[i] }, cell) : el("th", { scope: "row" }, cell))))))));
  const lead = (title, tone, text, reasons) =>
    el("div", { class: "prose" }, el("h3", { tabindex: "-1" }, `${title} `, badge(tone[0], tone[1])), el("p", null, text),
      reasons.length ? el("ul", null, reasons.map((reason) => el("li", null, reason))) : null);
  const time = (seconds) => {
    const date = new Date(seconds * 1000);
    return Number.isFinite(date.getTime()) ? `${date.toISOString().replace(".000", "")} (${seconds})` : `${seconds} Unix seconds (outside the calendar range)`;
  };

  const RENDER = {
    evaluate_payment_requirements: (r) => ({
      status: `Decision: ${r.decision}. ${r.checks.filter((c) => c.status === "pass").length} of ${r.checks.length} checks pass.`,
      nodes: [
        lead("Decision", [r.decision, DECISION[r.decision]], r.summary, r.reasons),
        el("div", { class: "actions" },
          el("button", { type: "button", class: "btn btn--secondary", "data-save-decision": "" }, "Download decision JSON"),
          el("a", { class: "btn btn--secondary", href: "/contact#pilot-request" }, "Scope an endpoint pilot")),
        el("p", { class: "field__hint" }, "The JSON is an unsigned decision snapshot, not a signed assessment report. A pilot can check a live endpoint, track reviewed terms and gate regressions in CI."),
        r.acceptable.length ? table(`Acceptable payment options (${r.acceptable.length})`, ["Network", "Scheme", "Amount (atomic units)", "Asset", "Pay to"],
          r.acceptable.map((o) => [code(o.network), code(o.scheme), code(o.amount), code(o.asset), code(o.payTo)])) : null,
        table(`Checks (${r.checks.length})`, ["Check", "Status", "Severity", "Message"],
          r.checks.map((c) => [el("a", { href: `/docs/checks#${c.id}` }, code(c.id)), badge(c.status, STATUS[c.status]), badge(c.severity, SEVERITY[c.severity]), c.message])),
      ],
    }),
    verify_payment_signature: (r) => {
      const row = (label, ok, detail) => [label, ok === undefined ? badge("not checked") : badge(ok ? "pass" : "fail", ok ? "success" : "danger"), detail];
      return {
        status: r.verified ? "Verified: every check passed." : `Rejected: ${r.reasons.length} reason(s).`,
        nodes: [
          lead("Result", r.verified ? ["verified", "success"] : ["rejected", "danger"],
            r.verified ? "The signature recovers to authorization.from, and the authorization pays payTo the exact amount inside its time window." : "At least one check failed:", r.reasons),
          table("Checks", ["Check", "Result", "Detail"], [
            row("Signer recovery", r.signatureValid, r.recovered ? ["Recovered ", code(r.recovered)] : "No signer recovered."),
            row("Recipient binding", r.recipientBound, [code("authorization.to"), " must equal ", code("payTo")]),
            row("Amount binding", r.amountBound, [code("authorization.value"), " must equal ", code("amount")]),
            row("Time window", r.fresh, ["Checked at ", time(r.checkedAt)]),
          ]),
        ],
      };
    },
  };

  // Base64 headers may be pasted with their name ("PAYMENT-REQUIRED: …") or wrapped; JSON is sent as an object.
  function parse(field) {
    const value = field.value.trim();
    if (!value) return undefined;
    const type = field.dataset.type;
    if (type === "list") return value.split(/[\s,]+/).filter(Boolean);
    if (type === "json") return JSON.parse(value);
    if (type === "header") {
      const header = value.replace(/^[a-z-]+:\s*/i, "");
      return header.startsWith("{") ? JSON.parse(header) : header.replace(/\s+/g, "");
    }
    if (type === "time") return /^\d+$/.test(value) ? Number(value) : value;
    return value;
  }

  async function call(name, args, signal) {
    let response;
    try {
      response = await fetch("/mcp", {
        method: "POST",
        signal,
        headers: { "content-type": "application/json", accept: "application/json", "mcp-protocol-version": "2025-06-18" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
      });
    } catch {
      throw new Error("Network error: check your connection and try again.");
    }
    if (response.status === 429) throw new Error(`Too many requests: try again in ${response.headers.get("retry-after") ?? 60} seconds.`);
    const body = await response.json().catch(() => null);
    if (body?.error) throw new Error(typeof body.error === "string" ? body.error : body.error.message);
    if (!body?.result) throw new Error(`The tool is unavailable (HTTP ${response.status}). Try again later.`);
    if (body.result.isError) throw new Error(body.result.content?.[0]?.text ?? "The tool could not run.");
    return body.result.structuredContent;
  }

  for (const form of document.querySelectorAll("form[data-tool]")) {
    const result = document.getElementById(form.dataset.result);
    const status = form.querySelector("[data-tool-status]");
    const placeholder = [...result.childNodes].map((node) => node.cloneNode(true));
    const snapshot = () => JSON.stringify([...form.querySelectorAll("[data-arg]")].map((field) => field.value));
    let inputSnapshot = snapshot();
    let revision = 0;
    let controller;
    let lastResult;
    const say = (text, tone) => {
      status.textContent = text;
      status.className = `form__status${tone ? ` is-${tone}` : ""}`;
    };
    const reset = () => {
      lastResult = undefined;
      result.replaceChildren(...placeholder.map((node) => node.cloneNode(true)));
    };
    const invalidate = (message) => {
      revision++;
      inputSnapshot = snapshot();
      controller?.abort();
      reset();
      say(message);
    };
    const changed = () => {
      if (snapshot() !== inputSnapshot) invalidate("Inputs changed. Check the request again for a current result.");
    };
    form.addEventListener("input", changed);
    form.addEventListener("change", changed);
    for (const button of form.querySelectorAll("[data-needs-js]")) button.disabled = false;

    for (const sample of form.querySelectorAll("[data-tool-sample]")) sample.addEventListener("click", (event) => {
      for (const [name, value] of Object.entries(JSON.parse(event.currentTarget.dataset.sample))) form.elements[name].value = value;
      invalidate(`${event.currentTarget.dataset.sampleLabel ?? "Sample"} loaded. Select “${form.querySelector("[type=submit]").textContent.trim()}” to run it.`);
    });

    result.addEventListener("click", (event) => {
      if (!event.target.closest("[data-save-decision]") || !lastResult) return;
      if (snapshot() !== inputSnapshot) return changed();
      const url = URL.createObjectURL(new Blob([JSON.stringify(lastResult, null, 2) + "\n"], { type: "application/json" }));
      const download = el("a", { href: url, download: "settlens-payment-decision.json" });
      document.body.append(download);
      download.click();
      download.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (form.classList.contains("is-busy")) return;
      const requestRevision = revision;
      const requestSnapshot = snapshot();
      const args = {};
      try {
        reset();
        for (const field of form.querySelectorAll("[data-arg]")) {
          let value;
          try {
            value = parse(field);
          } catch (error) {
            throw new Error(`${field.labels[0].textContent.trim()}: not valid JSON (${error.message}).`);
          }
          if (value === undefined) continue;
          const [key, sub] = field.dataset.arg.split(".");
          if (sub) (args[key] ??= {})[sub] = value;
          else args[key] = value;
        }
        form.classList.add("is-busy");
        result.setAttribute("aria-busy", "true");
        say("Checking…");
        controller = new AbortController();
        const answer = await call(form.dataset.tool, args, controller.signal);
        if (revision !== requestRevision || snapshot() !== requestSnapshot) {
          if (revision === requestRevision) invalidate("Inputs changed. Check the request again for a current result.");
          return;
        }
        inputSnapshot = requestSnapshot;
        const view = RENDER[form.dataset.tool](answer);
        result.replaceChildren(...view.nodes.filter(Boolean));
        lastResult = { tool: form.dataset.tool, result: answer };
        say(view.status);
        result.querySelector("h3").focus();
      } catch (error) {
        if (revision === requestRevision) {
          reset();
          say(error.message, "error");
        }
      } finally {
        controller = undefined;
        form.classList.remove("is-busy");
        result.removeAttribute("aria-busy");
      }
    });
  }
})();
