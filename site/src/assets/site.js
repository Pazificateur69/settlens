// Settlens site: progressive enhancement only. Every page works without this file.
(() => {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // A prerendered page (speculation rules) runs this before it is shown: start motion on activation.
  const whenShown = (start) => (document.prerendering ? document.addEventListener("prerenderingchange", start, { once: true }) : start());
  const live = document.createElement("p");
  live.className = "sr-only";
  live.setAttribute("aria-live", "polite");
  document.body.append(live);
  const announce = (message) => {
    live.textContent = "";
    window.setTimeout(() => (live.textContent = message), 50);
  };

  // Mobile navigation: swap the no-JS "Menu" link (jumps to the footer site map) for a disclosure button.
  const toggle = document.querySelector("[data-nav-toggle]");
  const nav = document.getElementById("primary-nav");
  if (toggle && nav) {
    // The label stays "Menu": aria-expanded already announces the state.
    const setOpen = (open, restoreFocus) => {
      toggle.setAttribute("aria-expanded", String(open));
      nav.classList.toggle("is-open", open);
      if (!open && restoreFocus) toggle.focus();
    };
    toggle.hidden = false;
    document.querySelector("[data-nav-fallback]")?.setAttribute("hidden", "");
    toggle.addEventListener("click", () => setOpen(toggle.getAttribute("aria-expanded") !== "true"));
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && nav.classList.contains("is-open")) setOpen(false, true);
    });
    document.addEventListener("click", (event) => {
      const outside = !nav.contains(event.target) && !toggle.contains(event.target);
      if (outside && nav.classList.contains("is-open")) setOpen(false);
    });
    nav.addEventListener("click", (event) => {
      if (event.target.closest("a")) setOpen(false);
    });
    // Tabbing out of the open menu closes it, so it never covers the element that now has focus.
    nav.addEventListener("focusout", (event) => {
      if (nav.classList.contains("is-open") && !nav.contains(event.relatedTarget) && event.relatedTarget !== toggle) setOpen(false);
    });
    window.matchMedia("(min-width: 64rem)").addEventListener("change", (event) => {
      if (event.matches) setOpen(false);
    });
  }

  // Copy buttons on code blocks (rendered hidden; shown only when the Clipboard API exists).
  for (const button of document.querySelectorAll("[data-copy]")) {
    const code = button.closest(".code")?.querySelector("pre code");
    const label = button.querySelector("[data-copy-label]");
    if (!code || !label || !navigator.clipboard) continue;
    button.hidden = false;
    let timer;
    button.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(code.textContent);
        label.textContent = "Copied";
        button.classList.add("is-copied");
        announce("Code copied to clipboard");
      } catch {
        const range = document.createRange();
        range.selectNodeContents(code);
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(range);
        label.textContent = "Selected";
        announce("Copy failed. The code is selected; press Ctrl+C (Cmd+C on Mac) to copy.");
      }
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        label.textContent = "Copy";
        button.classList.remove("is-copied");
      }, 2000);
    });
  }

  // Highlight the table-of-contents entry for the section being read.
  const tocLinks = [...document.querySelectorAll("[data-toc-link]")];
  if (tocLinks.length && "IntersectionObserver" in window) {
    const headings = [...new Set(tocLinks.map((link) => decodeURIComponent(link.hash.slice(1))))]
      .map((id) => document.getElementById(id))
      .filter(Boolean);
    const visible = new Set();
    // One indicator per list glides to the active entry (CSSOM custom properties pass the CSP).
    const lists = [...new Set(tocLinks.map((link) => link.closest(".toc__list")))].filter(Boolean);
    for (const list of lists) list.classList.add("has-indicator");
    const update = () => {
      const current = headings.find((heading) => visible.has(heading)) ?? headings.filter((heading) => heading.getBoundingClientRect().top < 0).pop();
      for (const link of tocLinks) link.classList.toggle("is-active", Boolean(current) && link.hash === `#${current.id}`);
      for (const list of lists) {
        const active = list.querySelector("a.is-active");
        list.classList.toggle("has-active", Boolean(active));
        if (!active) continue;
        list.style.setProperty("--toc-y", `${active.offsetTop}px`);
        list.style.setProperty("--toc-h", active.offsetHeight);
      }
    };
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) entry.isIntersecting ? visible.add(entry.target) : visible.delete(entry.target);
        update();
      },
      { rootMargin: "-72px 0px -55% 0px" },
    );
    for (const heading of headings) observer.observe(heading);
  }

  // Pilot form: JSON POST with inline status. Without JS the form posts and the server redirects back.
  for (const form of document.querySelectorAll("[data-pilot-form]")) {
    const status = form.querySelector("[data-form-status]");
    const submit = form.querySelector('button[type="submit"]');
    const snapshot = () => JSON.stringify(Object.fromEntries(new FormData(form)));
    // The focused submit button is never disabled (focus would fall back to <body>): a flag blocks resubmission.
    let sending = false;
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (sending) return;
      sending = true;
      submit.setAttribute("aria-disabled", "true");
      form.classList.add("is-busy");
      status.className = "form__status";
      status.textContent = "Sending your request…";
      const sent = snapshot();
      try {
        const response = await fetch(form.action, {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: sent,
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "The request could not be sent.");
        status.textContent = form.querySelector("#pilot-sent span")?.textContent ?? "Thanks, your request was received.";
        status.classList.add("is-success");
        if (snapshot() === sent) form.reset();
        else status.textContent += " New edits have not been sent.";
      } catch (error) {
        const reason = error instanceof TypeError ? "The network request failed." : error.message;
        status.textContent = `${reason} Try again, or email contact@settlens.com.`;
        status.classList.add("is-error");
      } finally {
        sending = false;
        submit.removeAttribute("aria-disabled");
        form.classList.remove("is-busy");
      }
    });
  }

  // Terminals replay line by line when first scrolled into view (a hero terminal, or one reached from
  // below, shows whole).
  if (!reduceMotion && "IntersectionObserver" in window) whenShown(() => {
    for (const terminal of document.querySelectorAll(".terminal[data-replay]")) {
      const lines = [...terminal.querySelectorAll(".t-line")];
      if (lines.length < 2 || terminal.closest(".hero")) continue;
      terminal.classList.add("is-replaying");
      const observer = new IntersectionObserver(
        (entries) => {
          const entry = entries.find((item) => item.isIntersecting);
          if (!entry) return;
          observer.disconnect();
          const step = entry.boundingClientRect.top < 0 ? 0 : 45;
          lines.forEach((line, index) => window.setTimeout(() => line.classList.add("is-shown"), index * step));
        },
        { threshold: 0.25 },
      );
      observer.observe(terminal);
    }

    // Diagram flows: one dash per message path travels in message (document) order; CSS runs two
    // cycles, paused off screen. The dash gap hides each packet outside its slot of the shared cycle.
    const onScreen = new IntersectionObserver((entries) => {
      for (const entry of entries) entry.target.classList.toggle("is-live", entry.isIntersecting);
    });
    for (const svg of document.querySelectorAll(".diagram svg")) {
      const paths = [...svg.querySelectorAll(".d-msg")];
      const spans = paths.map((path) => path.getTotalLength() + 42); // -12 to past the end, plus a pause
      const cycle = spans.reduce((sum, span) => sum + span, 0);
      let before = 0;
      for (const [index, path] of paths.entries()) {
        const packet = path.cloneNode(false);
        const period = 2 * cycle + spans[index];
        const px = (name, value) => packet.style.setProperty(name, `${value.toFixed(1)}px`);
        px("--gap", period - 6);
        px("--from", period + 12 + before);
        px("--to", period + 12 + before - cycle);
        packet.style.animationDuration = `${(cycle / 240).toFixed(2)}s`;
        packet.classList.add("d-packet");
        path.after(packet);
        before += spans[index];
      }
      const figure = svg.closest(".diagram");
      if (!paths.length || !figure) continue;
      figure.classList.add("has-flow");
      onScreen.observe(figure);
    }
  });

  // Linked cards: a soft light follows fine pointers (site.css reads --mx/--my).
  if (!reduceMotion && window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    document.addEventListener("pointermove", (event) => {
      const card = event.target.closest?.(".card--link");
      const box = card?.getBoundingClientRect();
      if (!box) return;
      card.style.setProperty("--mx", `${event.clientX - box.left}px`);
      card.style.setProperty("--my", `${event.clientY - box.top}px`);
    }, { passive: true });
  }
})();
