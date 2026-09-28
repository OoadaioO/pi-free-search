# pi extension 开发项目

演示用 pi extension 开发脚手架,展示扩展的依赖处理规范。

## 扩展依赖处理(重要)

pi 用 [jiti](https://github.com/unjs/jiti) 加载扩展,TS 无需编译即可运行。
依赖分三类(`packages.md`):

| 依赖类型 | 放哪 | 说明 |
|----------|------|------|
| 第三方运行时库 | `dependencies` | `npm install` 自动安装 |
| pi 核心包 | `peerDependencies`(`*`) | `@earendil-works/pi-coding-agent`、`typebox`、`@earendil-works/pi-ai`、`@earendil-works/pi-tui` — 不打包 |
| 其它 pi 包 | `dependencies` + `bundledDependencies` | 需打包进 tarball,用 `node_modules/` 路径引用 |

> 运行时默认用生产安装(`npm install --omit=dev`),所以 `devDependencies` 在扩展运行时不可用。

## 快速开始

```bash
npm install
npm run dev      # 本地开发,tsx watch
npm start        # 运行扩展
npm run typecheck
```

## 加载 / 测试扩展

```bash
# 一次性测试
pi -e ./src/demo-extension/index.ts

# pi 通过 package.json 的 "pi" manifest 指定扩展目录,代码可放在任意位置(如 src/)
# manifest:  "pi": { "extensions": ["./src"] }
# 放入自动发现目录后可用 /reload 热重载
#   - 全局: ~/.pi/agent/extensions/
#   - 项目: .pi/extensions/
```

## 结构

```
src/
└── demo-extension/
    └── index.ts     # 扩展入口,导出默认函数
```

扩展导出默认工厂函数,接收 `ExtensionAPI`,可订阅事件、注册工具/命令/快捷键。
