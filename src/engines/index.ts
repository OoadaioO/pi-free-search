import type { EngineCallContext, EngineId, EngineResult } from "../types.ts";
import { searchAnysearch } from "./anysearch.ts";
import { searchBing } from "./bing.ts";
import { searchDdgHtml, searchDdgLite } from "./ddg.ts";
import { searchDeepSeekOfficial } from "./deepseek.ts";
import { searchExa } from "./exa.ts";
import { searchFirecrawl } from "./firecrawl.ts";
import { searchKeenable } from "./keenable.ts";
import { searchParallel } from "./parallel.ts";
import { searchPerplexity } from "./perplexity.ts";
import { searchSearxng } from "./searxng.ts";
import { searchSerpbase } from "./serpbase.ts";
import { searchTavily } from "./tavily.ts";

export async function runEngine(engine: EngineId, ctx: EngineCallContext): Promise<EngineResult> {
  switch (engine) {
    case "ddg":
      return searchDdgHtml(ctx);
    case "ddg-lite":
      return searchDdgLite(ctx);
    case "bing":
      return searchBing(ctx);
    case "searxng":
      return searchSearxng(ctx);
    case "anysearch":
      return searchAnysearch(ctx);
    case "exa":
      return searchExa(ctx);
    case "tavily":
      return searchTavily(ctx);
    case "keenable":
      return searchKeenable(ctx);
    case "firecrawl":
      return searchFirecrawl(ctx);
    case "parallel":
      return searchParallel(ctx);
    case "perplexity":
      return searchPerplexity(ctx);
    case "serpbase":
      return searchSerpbase(ctx);
    case "deepseek-official":
      return searchDeepSeekOfficial(ctx);
  }
}
