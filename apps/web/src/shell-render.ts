import type { ShellView } from "./shell.js";

export interface RenderedShell {
  readonly html: string;
}

export function renderShell(view: ShellView): RenderedShell {
  const badge = view.environmentBadge
    ? `<span class="environment-badge" data-tone="${escapeAttribute(
        view.environmentBadge.tone,
      )}"><span role="img" aria-label="${escapeAttribute(
        view.environmentBadge.iconLabel,
      )}">!</span> ${escapeHtml(view.environmentBadge.label)}</span>`
    : "";
  const selectors = view.layout.topBar
    .filter(
      (slot) =>
        slot === "workspace" || slot === "project" || slot === "environment",
    )
    .map(
      (slot) =>
        `<label>${labelForSlot(slot)}<select aria-label="${labelForSlot(
          slot,
        )}"><option>${labelForSlot(slot)}</option></select></label>`,
    )
    .join("");
  const navItems = view.layout.sideNav
    .map(
      (item) =>
        `<a href="${escapeAttribute(item.href)}">${escapeHtml(item.label)}</a>`,
    )
    .join("");

  return {
    html: `<!doctype html>
<html lang="en">
  <head><title>${escapeHtml(view.activeRoute)}</title></head>
  <body>
    <a class="skip-link" href="#main-content">Skip to main content</a>
    <header role="banner">
      <a href="/workspaces" aria-label="Modular MCP home">Modular MCP</a>
      ${selectors}
      ${badge}
    </header>
    <nav aria-label="Project navigation">${navItems}</nav>
    <main id="main-content" tabindex="-1">
      <h1>${escapeHtml(view.activeRoute)}</h1>
      <section aria-label="Page content"></section>
    </main>
  </body>
</html>`,
  };
}

export function attachShellFocusBehavior(document: Document): void {
  const skipLink = document.querySelector<HTMLAnchorElement>(
    'a[href="#main-content"]',
  );
  skipLink?.addEventListener("click", (event) => {
    event.preventDefault();
    focusMainContent(document);
  });
}

export function focusMainContent(document: Document): void {
  const main = document.getElementById("main-content");
  const elementConstructor = document.defaultView?.HTMLElement;
  if (elementConstructor !== undefined && main instanceof elementConstructor) {
    main.focus();
  }
}

function labelForSlot(slot: string): string {
  if (slot === "workspace") {
    return "Workspace";
  }
  if (slot === "project") {
    return "Project";
  }
  return "Environment";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replaceAll('"', "&quot;");
}
