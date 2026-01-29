# CCR Subagent 配置完整指南（含关键注意事项与实操流程）

## 🔑 问题1：除 `CCR-SUBAGENT-MODEL` 外必须注意的 7 个关键点

| 注意事项 | 说明 | 风险/价值 |
|----------|------|-----------|
| **1. 工具权限精准配置** | Subagent 创建时需严格限定权限（知识库[1][4]）：- 测试数据生成：仅需 `数据库MCP` + `只读`- UI测试执行：需 `Playwright MCP` + `执行权限`- **禁止**给原型解析Subagent开放编辑权限 | ⚠️ 误开编辑权限可能导致代码被意外修改 |
| **2. YAML Front Matter 配置** | Subagent 的 `.md` 文件需包含完整元数据（知识库[6]）：```yaml<br>---<br>tools:<br>  - name: database-mcp<br>    permissions: [read]<br>permissionMode: auto<br>skills:<br>  - cucumber-bdd-skill<br>---<br>``` | ✅ 确保Subagent能调用所需MCP/Skill |
| **3. 视觉任务特殊处理** | 解析原型图的Subagent：- 标签必须指定**视觉模型**（如 `anthropic/claude-3-opus-vision`）- 提示词需明确“你将收到图片，请分析UI元素” | ⚠️ 用文本模型处理图片会导致解析失败 |
| **4. CCR 配置前置验证** | 标签中指定的 `provider,model` **必须**在 `config.json` 的 `Providers.models` 中存在（知识库[2][8]） | ⚠️ 模型未注册 → 路由404错误 |
| **5. 上下文隔离特性** | Subagent 拥有独立上下文（知识库[6]），主对话仅接收其输出结果 | ✅ 避免测试数据生成污染主对话上下文 |
| **6. 后台执行优化** | 长任务（如Playwright测试）按 `Ctrl+B` 后台执行（知识库[1]） | ✅ 主对话可继续处理其他任务 |
| **7. MCP 服务就绪检查** | Subagent 调用的 MCP（数据库/Playwright）需：- 已在 Claude Code 中注册- 服务端正常运行 | ⚠️ MCP 未就绪 → Subagent 执行中断 |

---

## 🚀 问题2：软件测试工作流 Subagent 完整配置流程（实操版）

### 📌 前置条件
- 已安装 `claude-code` 和 `claude-code-router`
- CCR 已配置基础 `config.json`（含所需 Providers）
- MCP 服务已注册（数据库MCP、Playwright MCP）

---

### 步骤 1：配置 CCR 全局路由（`~/.claude-code-router/config.json`）
```json
{
  "Providers": [
    {
      "name": "openrouter",
      "api_base_url": "https://openrouter.ai/api/v1/chat/completions",
      "api_key": "${OPENROUTER_KEY}",
      "models": [
        "anthropic/claude-3-opus-vision",
        "anthropic/claude-3.5-sonnet",
        "deepseek/deepseek-reasoner"
      ]
    },
    {
      "name": "local-ollama",
      "api_base_url": "http://localhost:11434/v1/chat/completions",
      "api_key": "ollama",
      "models": ["qwen2.5-coder:latest"]
    }
  ],
  "Router": {
    "default": "openrouter,anthropic/claude-3.5-sonnet",
    "background": "local-ollama,qwen2.5-coder:latest",
    "think": "openrouter,deepseek/deepseek-reasoner"
  }
}
```
✅ **验证**：`ccr restart` → `ccr logs` 确认服务启动

---

### 步骤 2：创建测试工作流 Subagent（Claude Code 终端内操作）

#### 🌐 Subagent 1：原型解析员（处理图片需求）
```bash
/agents create
→ Level: user (全局可用)
→ Name: prototype-analyzer
→ Description: 解析UI原型图，提取可测试需求
→ Tools: 
   ✅ Read files
   ❌ Edit files
   ❌ Execute commands
   ✅ Other tools → 选择"无"（视觉任务无需MCP）
→ Model: 与主对话相同（后续由标签覆盖）
→ Save
```
**编辑文件**：`~/.claude/agents/prototype-analyzer.md`
```markdown
<CCR-SUBAGENT-MODEL>openrouter,anthropic/claude-3-opus-vision</CCR-SUBAGENT-MODEL>
---
tools: []
permissionMode: auto
---
你是一名UI测试专家。当用户上传原型图时：
1. 识别所有可交互元素（按钮/输入框/下拉菜单等）
2. 推断用户操作路径
3. 输出JSON格式需求清单：
{
  "features": [
    {"name": "登录", "elements": ["用户名框", "密码框", "登录按钮"], "flows": ["输入→点击"]}
  ]
}
```

#### 🌐 Subagent 2：测试数据匠（调用数据库MCP）
```bash
/agents create
→ Name: test-data-generator
→ Description: 根据测试用例生成边界测试数据
→ Tools: 
   ✅ Other tools → 选择"database-mcp"（需提前注册）
→ Model: 与主对话相同
→ Save
```
**编辑文件**：`~/.claude/agents/test-data-generator.md`
```markdown
<CCR-SUBAGENT-MODEL>openrouter,deepseek/deepseek-reasoner</CCR-SUBAGENT-MODEL>
---
tools:
  - name: database-mcp
    permissions: [read]
permissionMode: auto
skills:
  - boundary-value-analysis
---
你是一名测试数据专家。根据输入的测试用例：
1. 调用 database-mcp 生成符合边界条件的数据
2. 包含正常值、边界值、异常值
3. 输出JSON格式：
{
  "test_data": [
    {"username": "admin", "password": "Valid123!", "expected": "success"},
    {"username": "", "password": "short", "expected": "error_empty_username"}
  ]
}
```

#### 🌐 Subagent 3：UI测试执行官（调用Playwright MCP）
```bash
/agents create
→ Name: ui-test-runner
→ Description: 执行Playwright UI自动化测试
→ Tools: 
   ✅ Other tools → 选择"playwright-mcp"
   ✅ Execute commands（需执行测试脚本）
→ Model: 与主对话相同
→ Save
```
**编辑文件**：`~/.claude/agents/ui-test-runner.md`
```markdown
<CCR-SUBAGENT-MODEL>openrouter,anthropic/claude-3.5-sonnet</CCR-SUBAGENT-MODEL>
---
tools:
  - name: playwright-mcp
    permissions: [execute]
permissionMode: require
skills:
  - cucumber-to-playwright
---
你是一名UI测试工程师。收到Gherkin测试用例后：
1. 调用 playwright-mcp 生成并执行测试脚本
2. 返回测试结果（通过率、失败截图、日志链接）
3. 格式：
✅ 通过: 5/5
❌ 失败: 0
📸 截图: [链接]
```

---

### 步骤 3：工作流串联与执行
```bash
# 1. 用户上传原型图（含图片）
@prototype-analyzer 请分析这个登录页面原型

# 2. 生成测试用例后（主对话生成Gherkin）
@test-data-generator 为登录功能生成10组测试数据

# 3. 生成测试脚本后
@ui-test-runner 执行登录功能的UI测试（按Ctrl+B后台运行）
```

---

### 🔍 验证与调试技巧
| 场景 | 操作 | 命令 |
|------|------|------|
| 检查路由是否生效 | 查看CCR日志 | `ccr logs --tail 50` |
| 验证Subagent配置 | 检查YAML元数据 | `cat ~/.claude/agents/*.md` |
| 测试MCP连通性 | 手动调用MCP | `mcp-cli test database-mcp` |
| 重置Subagent上下文 | 清除缓存 | `rm -rf ~/.claude/cache/agents/*` |

---

## 💡 终极建议（来自知识库实践）
1. **权限最小化原则**（知识库[1][4]）：  
   > “给Subagent开编辑权限前，务必确认描述写得非常清楚，否则可能误改文件”
   
2. **模型分工策略**（知识库[8]）：  
   - 视觉任务 → Claude Opus Vision  
   - 推理任务 → DeepSeek Reasoner  
   - 后台任务 → 本地Ollama模型（降低成本）

3. **工作流编排技巧**（知识库[6]）：  
   > “主对话负责编排，Subagent负责专业产出——让测试计划生成、数据生成、执行各司其职”