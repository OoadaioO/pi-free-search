/**
 * Demo pi extension: confirm destructive session actions.
 *
 * Code lives under src/ (not extensions/). pi discovers it via the
 * "pi" manifest in package.json, so the directory name is free choice.
 *
 * Load with:  pi -e ./src/demo-extension/index.ts
 * Or place under an auto-discovered dir (~/.pi/agent/extensions/ or .pi/extensions/)
 * for /reload hot-reload.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.on("session_before_switch", async (event, ctx) => {
    if (!ctx.hasUI) return;

    if (event.reason === "new") {
      const confirmed = await ctx.ui.confirm(
        "Clear session?",
        "This will delete all messages in the current session.",
      );

      if (!confirmed) {
        ctx.ui.notify("Clear cancelled", "info");
        return { cancel: true };
      }
    }
  });
}
