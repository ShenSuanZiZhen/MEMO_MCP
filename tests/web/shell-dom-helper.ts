import { createRequire } from "node:module";
import {
  attachShellFocusBehavior,
  renderShell,
  type ShellView,
} from "../../apps/web/src/index.js";

export interface ShellAxeResult {
  readonly violations: readonly string[];
}

interface TestWindow {
  readonly document: Document;
  eval(source: string): void;
}

interface TestDom {
  readonly window: TestWindow;
}

interface AxeCoreModule {
  readonly source: string;
}

interface JsdomModule {
  readonly JSDOM: new (
    html: string,
    options: {
      readonly pretendToBeVisual: boolean;
      readonly runScripts: "outside-only";
      readonly url: string;
    },
  ) => TestDom;
}

const requireFromWebPackage = createRequire(
  new URL("../../apps/web/package.json", import.meta.url),
);
const axeCore = requireFromWebPackage("axe-core") as AxeCoreModule;
const { JSDOM } = requireFromWebPackage("jsdom") as JsdomModule;

export function createShellDom(view: ShellView): TestDom {
  const dom = new JSDOM(renderShell(view).html, {
    pretendToBeVisual: true,
    runScripts: "outside-only",
    url: "https://web.modular-mcp.local",
  });
  attachShellFocusBehavior(dom.window.document);
  return dom;
}

export async function runAxeOnShell(view: ShellView): Promise<ShellAxeResult> {
  const dom = createShellDom(view);
  dom.window.eval(axeCore.source);
  const axe = (
    dom.window as unknown as {
      axe: {
        run(
          node: Document,
          options: {
            readonly rules: Record<string, { readonly enabled: boolean }>;
          },
        ): Promise<{
          readonly violations: readonly {
            readonly id: string;
          }[];
        }>;
      };
    }
  ).axe;
  const result = await axe.run(dom.window.document, {
    // jsdom has no canvas implementation for axe color-contrast checks.
    rules: { "color-contrast": { enabled: false } },
  });
  return {
    violations: result.violations.map((violation) => violation.id),
  };
}
