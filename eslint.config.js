// ESLint 门禁（docs/standards.md §0）：非格式化规则——只拦误用模式与悬空代码，
// 格式风格遵循仓库既有事实约定（review 把关），不引入 Prettier 重刷全仓。
// src/dev 为研究资产（不维护），排除。
import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import pluginVue from 'eslint-plugin-vue'

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'src/dev/**'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/essential'],
  {
    // .vue 的 <script lang="ts"> 需显式指定 TS 子解析器（否则回落 espree 解析不了类型标注）
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
  },
  {
    rules: {
      // 视图单词名是既有约定（App/Login 视图组件由文件名 PascalCase 保证）
      'vue/multi-word-component-names': 'off',
      // 边界处 unknown + 显式收窄为准（standards §1.1）；warn 不拦门，review 关注
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // 字符串/模板串内全角空格等是有意的（nav-button 树形选项全角缩进——W9b）
      'no-irregular-whitespace': ['error', { skipStrings: true, skipTemplates: true }],
      // 未定义变量由 vue-tsc（strict）负责——eslint 的 no-undef 不识别浏览器全局
      'no-undef': 'off',
    },
  },
  {
    // 测试与 e2e：mock/快照场景 any 放宽
    files: ['**/*.test.ts', 'e2e/**/*.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
)
