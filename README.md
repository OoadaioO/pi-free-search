# pi-free-search

Pi 网页搜索扩展：13 个引擎自动回退、时间过滤、结果缓存。无需 API key 即可用 Bing / DuckDuckGo / SearXNG / AnySearch（以及若干 keyless 付费引擎）。

## 加载

```bash
# 一次性测试
pi -e ./src/index.ts

# 安装到全局（写入 ~/.pi/agent/settings.json）
pi install /absolute/path/to/pi-free-search
```

扩展入口由 `package.json` 的 `"pi.extensions": ["./src/index.ts"]` 声明。

## 工具

| 工具 | 作用 |
|---|---|
| `web_search` | 网页搜索。走配置的首选引擎，失败自动回退。 |
| `advanced_search` | 同上，外加 `timeRange` / `engine`。 |

`timeRange` 支持：`day|week|month|year`、相对值 `12h`/`3d`/`2mo`/`1y`、绝对日期 `YYYY-MM-DD`。

搜索结果对模型包在 `<untrusted-web-content>` 里，当作不可信外部数据。

## 命令

| 命令 | 作用 |
|---|---|
| `/search-engine` | 选择首选引擎并写入配置 |
| `/search-test [engine]` | 直测指定或当前引擎，**不走回退** |

## 配置

`~/.pi/agent/web-search.json`（不存在则用默认，改引擎时创建）：

```json
{
  "provider": "bing",
  "bingMarket": "zh-CN",
  "safeSearch": "off",
  "cache": true,
  "cacheTtl": 5
}
```

- `provider` 默认 `bing`；非法值回退 `bing`
- `safeSearch`：`off|moderate|strict`，作用于 bing / ddg / ddg-lite
- `cacheTtl`：0–5 分钟；`0` 或 `cache: false` 关闭缓存。回退命中 TTL 为配置值的 1/5

## 环境变量（API key）

只读环境变量，不写配置文件：

| 变量 | 引擎 |
|---|---|
| `ANYSEARCH_API_KEY` | anysearch（可选，提额） |
| `EXA_API_KEY` | exa（可选，无 key 走 MCP） |
| `TAVILY_API_KEY` | tavily（可选，无 key 走 keyless） |
| `KEENABLE_API_KEY` | keenable（可选，无 key 走 MCP） |
| `FIRECRAWL_API_KEY` | firecrawl（可选，无 key 匿名） |
| `PARALLEL_API_KEY` | parallel（可选，无 key 走 MCP） |
| `PERPLEXITY_API_KEY` | perplexity（必须） |
| `SERPBASE_API_KEY` | serpbase（必须） |
| `DEEPSEEK_API_KEY` | deepseek-official（必须） |

## 引擎与回退

免费：`ddg` `ddg-lite` `bing` `searxng` `anysearch`  
付费/可选 key：`exa` `tavily` `keenable` `firecrawl` `parallel` `perplexity` `serpbase` `deepseek-official`

顺序：首选 → 其他付费（exa/tavily/keenable/firecrawl/parallel 无 key 也会试）→ 剩余免费。带 `timeRange` 时把支持时间过滤的引擎排前。

结果 Note 两种句式：

- `Note: X does not support time filtering (timeRange=...), using Y.` — 首选被跳过，并未尝试
- `Note: X unavailable or failed (reason), using Y.` — 首选试过但失败

## 开发

```bash
npm install
npm test
npm run typecheck
```
