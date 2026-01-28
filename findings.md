# Findings & Decisions

## Requirements
从用户请求中捕获的需求：
1. 打开 md 文件时默认为预览模式
2. 支持不同模式切换：所见即所得/分屏/即时渲染等
3. 增加 mindmap 思维导图显示功能，使用 ```mindmap ...``` 语法
4. 增加完整的 vditor toolbar，包括：
   - headings (标题)
   - bold (粗体)
   - italic (斜体)
   - strike (删除线)
   - list (无序列表)
   - ordered-list (有序列表)
   - check (任务列表)
   - quote (引用)
   - code (代码块)
   - inline-code (行内代码)
   - table (表格)
   - line (分割线)
   - link (链接)
   - upload (上传)
   - undo (撤销)
   - redo (重做)
   - edit-mode (编辑模式切换)
   - fullscreen (全屏)
   - outline (大纲)

## Research Findings

### Vditor 官方文档 (2026-01-28)

#### 1. 编辑模式配置
- **mode 参数**: 可选值包括 `'sv'` (分屏预览), `'ir'` (即时渲染, 类似 Typora), `'wysiwyg'` (所见即所得)
- **默认值**: `'ir'` (即时渲染模式)
- **关键发现**: Vditor 文档显示默认就是即时渲染模式，这接近预览效果

#### 2. Mindmap 思维导图支持
- Vditor **原生支持** mindmap/脑图渲染
- 使用方式: 通过 `mindmapRender()` 静态方法或配置自动渲染
- 语法: 使用 ```mindmap ...``` 代码块包裹
- 支持 ECharts 实现的脑图功能

#### 3. Toolbar 配置
- **toolbar 参数**: 可以用字符串数组简写，例如: `toolbar: ['emoji', 'br', 'bold', '|', 'line']`
- **可用的 name 值**:
  - `headings` - 标题
  - `bold` - 粗体
  - `italic` - 斜体
  - `strike` - 删除线
  - `|` - 分隔符
  - `line` - 分割线
  - `quote` - 引用
  - `list` - 无序列表
  - `ordered-list` - 有序列表
  - `check` - 任务列表
  - `outdent` - 减少缩进
  - `indent` - 增加缩进
  - `code` - 代码块
  - `inline-code` - 行内代码
  - `insert-after` - 在后面插入
  - `insert-before` - 在前面插入
  - `undo` - 撤销
  - `redo` - 重做
  - `upload` - 上传
  - `link` - 链接
  - `table` - 表格
  - `record` - 录音
  - `edit-mode` - 编辑模式切换
  - `both` - 分屏/编辑切换
  - `preview` - 预览
  - `fullscreen` - 全屏
  - `outline` - 大纲
  - `code-theme` - 代码主题
  - `content-theme` - 内容主题
  - `export` - 导出
  - `devtools` - 开发工具
  - `info` - 信息
  - `help` - 帮助
  - `br` - 换行

#### 4. 其他重要配置
- **preview.mode**: 可选 `'both'` 或 `'editor'`，控制预览区域显示
- **outline**: `{ enable: boolean, position: 'left' | 'right' }` - 大纲配置
- **resize**: `{ enable: boolean, position: 'top' | 'bottom' }` - 支持大小拖拽
- **counter**: 字数统计功能
- **cache**: localStorage 缓存配置

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| 真正集成 Vditor 替换 CodeMirror | 现有代码未真正使用 Vditor，需要完整重构 |
| 使用 'wysiwyg' 模式作为默认 | 用户明确要求：打开md文件默认是所见即所得模式 |
| 移除自动保存功能 | 用户明确要求：去掉800ms防抖的自动保存功能，只保留手动保存 |
| 保留 onDirtyChange 回调 | 用于在关闭或切换时提示未保存内容 |
| 配置完整 toolbar | 用户明确要求了具体的 toolbar 工具列表 |
| Vditor 原生支持 mindmap | 文档显示 Vditor 内置支持，使用 ```mindmap``` 语法即可 |
| 禁用 Vditor 本地缓存 | 使用项目自己的保存逻辑和冲突检测机制 |

## Issues Encountered
<!-- 问题将在遇到后添加 -->

## Resources
- Vditor 官方文档: https://ld246.com/article/1549638745630
- Vditor 官网: https://b3log.org/vditor/
- API 文档位置: 已在浏览器中查看完整配置选项
- PRD 文档: tasks/prd-vditor.md - 完整的产品需求文档

## Visual/Browser Findings
- Vditor 官网 (https://b3log.org/vditor/): 展示了三种编辑模式（所见即所得、即时渲染、分屏预览）
- API 文档页面: 包含完整的配置选项、工具栏配置方法和所有可用参数
- 截图已保存: vditor-homepage, vditor-official-site, vditor-api-docs

## Current Code Analysis (2026-01-28)

### 关键发现
1. **Vditor 未真正集成**: `MarkdownFileEditor.jsx` 虽然有 `editorMode` 状态支持 'vditor'，但实际使用的是:
   - CodeMirror (`@uiw/react-codemirror`) - 用于编辑
   - ReactMarkdown - 用于预览
   - **并未真正初始化 Vditor 实例**

2. **已有资源**:
   - `src/lib/vditorLoader.js` - 动态加载 Vditor 的工具函数
   - 使用 CDN: `https://unpkg.com/vditor/dist/index.css` 和 `index.min.js`
   - 返回 `window.Vditor` Promise

3. **当前实现**:
   - 支持在 Vditor 和纯文本模式之间切换（UI上）
   - 但两者都使用 CodeMirror，不是真正的 Vditor
   - 支持:
     - 自动保存（800ms 防抖）
     - Ctrl/Cmd+S 手动保存
     - 粘贴/拖拽文件上传
     - 冲突检测（mtime）

4. **需要重构的内容**:
   - 真正集成 Vditor（使用 vditorLoader.js）
   - 配置默认预览模式（mode: 'ir' 或 'sv'）
   - 添加 mindmap 支持
   - 添加完整的 toolbar
   - 保留现有功能（保存、冲突检测、文件上传）

---
*Update this file after every 2 view/browser/search operations*
