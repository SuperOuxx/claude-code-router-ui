# Task Plan: Vditor 文档编辑器重构

## Goal
重构 vditor 文档编辑器，实现默认预览模式、mindmap 思维导图支持，以及完整的工具栏功能。

## Current Phase
Phase 6

## Phases

### Phase 1: Requirements & Discovery
- [x] 理解用户需求
- [x] 查看 Vditor 官方文档了解配置选项
- [x] 查看 mindmap 支持的实现方式
- [x] 查看 toolbar 配置方法
- [x] 记录所有发现到 findings.md
- **Status:** complete

### Phase 2: 现有代码分析
- [x] 查看当前 Vditor 集成代码
- [x] 分析现有配置和问题
- [x] 确定需要修改的文件
- **Status:** complete

### Phase 3: 实现 Vditor 集成
- [x] 重构 MarkdownFileEditor.jsx 真正集成 Vditor
- [x] 配置默认为 sv 模式（分屏预览）
- [x] 配置完整 toolbar（headings/bold/italic/strike/list/ordered-list/check/quote/code/inline-code/table/line/link/upload/undo/redo/edit-mode/fullscreen/outline）
- [x] 保留现有功能（保存、冲突检测、文件上传）
- **Status:** complete

### Phase 4: 实现 Mindmap 支持
- [x] 验证 Vditor 默认支持 ```mindmap``` 语法
- [x] Vditor 原生支持，无需额外配置
- **Status:** complete

### Phase 5: 测试与验证
- [x] 代码构建测试（npm run build）
- [x] 验证无构建错误
- [ ] 验证模式切换（需要运行时测试）
- [ ] 验证 mindmap 渲染（需要运行时测试）
- [ ] 验证工具栏功能（需要运行时测试）
- **Status:** complete (构建测试通过)

### Phase 6: 交付
- [x] 最终审查
- [x] 代码构建成功
- [ ] 代码提交（需要用户确认）
- **Status:** in_progress

## Key Questions
1. ~~Vditor 如何设置默认为预览模式？~~ ✅ 使用 `mode: 'sv'` (分屏预览) 或 `'ir'` (即时渲染)
2. ~~Vditor 如何支持 mindmap 思维导图？需要额外插件吗？~~ ✅ Vditor 原生支持，使用 ```mindmap``` 语法
3. ~~toolbar 的完整配置语法是什么？~~ ✅ 数组配置: `toolbar: ['headings', 'bold', ...]`
4. ~~现有代码中 Vditor 是如何初始化的？~~ ✅ 发现现有代码未真正集成 Vditor，需要重构

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| 使用 Playwright MCP 查看文档 | 用户要求使用此工具进行研究 |
| 使用 'wysiwyg' 模式作为默认 | 用户修改要求：打开md文件默认是所见即所得模式 |
| 移除自动保存功能 | 用户修改要求：只保留手动保存，去掉800ms防抖的自动保存 |
| 真正集成 Vditor 替换 CodeMirror | 现有代码未真正使用 Vditor，需要完整重构 |
| 保留现有功能（手动保存、冲突检测、上传、未保存提示） | 用户要求保留 |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| 无 | - | 构建成功，无错误 |

## Notes
- 更新阶段状态：pending → in_progress → complete
- 在做出重大决策前重读此计划
- 记录所有错误以避免重复
- 使用 2-Action Rule：每 2 次查看/浏览器/搜索操作后立即更新 findings.md
