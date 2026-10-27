# hmi-studio 质量门禁（全局 quality.just 一行接入 + 前端项目自有门）
import "~/.zcode/quality/quality.just"

# 前端全套：类型 + lint + 分层 + 单测 + E2E + 构建（E2E 需 rs-iot 8790 存活）
[group('quality')]
fe-quality: typecheck lint layers test e2e build
    @echo "✅ fe-quality: 前端全部门禁通过"

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
