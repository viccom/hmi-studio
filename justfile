# hmi-studio 质量门禁（全局 quality.just 一行接入 + 前端项目自有门）
import "~/.zcode/quality/quality.just"

# 前端全套：类型 + lint + 分层 + 单测 + E2E + 构建 + hmi-mcp 两档（E2E 需 rs-iot 8790 存活）
[group('quality')]
fe-quality: typecheck lint layers test e2e build mcp-typecheck mcp-test
    @echo "✅ fe-quality: 前端全部门禁通过（含 hmi-mcp）"

# 各道门独立可用（just typecheck / just lint / …）
[private]
typecheck:
    @pnpm run typecheck

[private]
lint:
    @pnpm exec eslint .

[private]
layers:
    @node scripts/check-layers.mjs

[private]
test:
    @pnpm test

[private]
e2e:
    @pnpm e2e

[private]
build:
    @pnpm build

# hmi-mcp 独立包门禁（P1；mcp/ 不在根 tsconfig/vitest include 内，须单独跑——M1 修复）
[private]
mcp-typecheck:
    @pnpm -C mcp run typecheck

[private]
mcp-test:
    @pnpm -C mcp test
