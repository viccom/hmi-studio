# hmi-studio 质量门禁（全局 quality.just 一行接入 + 前端项目自有门）
import "~/.zcode/quality/quality.just"

set shell := ["bash", "-c"]

# 前端全套：类型 + 单测 + E2E + 构建（E2E 需 rs-iot 8790 存活）
[group('quality')]
fe-quality: typecheck test e2e build
    @echo "✅ fe-quality: 前端全部门禁通过"

[typecheck]
@pnpm run typecheck

[test]
@pnpm test

[e2e]
@pnpm e2e

[build]
@pnpm build
