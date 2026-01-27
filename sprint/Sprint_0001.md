# 在Project Files中用 Vditor 编辑、查看 markdown 文件
## [ ] 集成 Vditor
Description: 使用 playwright 查 [Vditor 的文档](https://b3log.org/vditor/demo/index.html)，在 Project Files 中，如果打开的文件是 markdown 文件，则用 Vditor 编辑、查看
Acceptance criteria: 能在 编辑、查看 markdown 文件时，显示 mindmap、mermaid

## [ ] 兼容现有文档编辑器
Description: 兼容现有的文档编辑器相关代码，涉及的依赖："@codemirror/lang-markdown": "^6.3.3", "react-markdown": "^10.1.0", "remark-gfm": "^4.0.0", "remark-math": "^6.0.0", "rehype-katex": "^7.0.1", "katex": "^0.16.25"
Acceptance criteria: 涉及文档渲染、编辑的功能 正常运行、不报错

## [ ] 测试验证
Description: 编写测试去验证新增功能
Acceptance criteria: 测试全部通过

## [ ] 提升代码可维护性
Description: 用 code-simplifier skills 重构，在不改变功能的前提下，提升代码的可读性
Acceptance criteria: 测试全部通过