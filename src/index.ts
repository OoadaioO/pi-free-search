/**
 * Pi web search extension.
 *
 * Load with:  pi -e ./src/index.ts
 * Or:         pi install /absolute/path/to/pi-free-search
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { loadConfig, saveConfig } from "./config.ts";
import { registerSearchCommands } from "./commands.ts";
import { createSearchProvider } from "./provider.ts";
import { buildPromptSection } from "./prompt.ts";
import { registerSearchTools } from "./tools.ts";

export default function (pi: ExtensionAPI) {
  const getConfig = () => loadConfig();
  const provider = createSearchProvider({ getConfig });

  registerSearchTools(pi, { provider, getConfig });
  registerSearchCommands(pi, {
    getConfig,
    save: (config) => saveConfig(config),
    provider,
  });

  pi.on("before_agent_start", async (event) => {
    return {
      systemPrompt: `${event.systemPrompt}\n\n${buildPromptSection(getConfig())}`,
    };
  });
}
