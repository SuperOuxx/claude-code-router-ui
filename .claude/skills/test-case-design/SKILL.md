---
name: test-case-design
description: 使用行业标准技术设计详细的测试用例。用于将测试计划转换为可执行的测试用例，通过边界分析和等价类划分确保全面覆盖。
---

# 测试用例设计技能 (Test Case Design Skill)

当设计测试用例时：

1. **应用测试设计技术**

   **等价类划分 (Equivalence Partitioning):**
   - 将输入数据分为有效和无效分区
   - 从每个分区选择一个代表值
   - 测试有效和无效场景

   **边界值分析 (Boundary Value Analysis):**
   - 在边界处进行测试 (min, min-1, min+1, max, max+1)
   - 测试数组边缘、字符串长度、数字范围
   - 识别差一错误 (off-by-one errors)

   **决策表 (Decision Tables):**
   - 用于具有多个条件的复杂业务逻辑
   - 覆盖所有输入和预期输出的组合
   - 处理基于规则的系统

   **状态转换 (State Transition):**
   - 测试系统状态和有效转换
   - 覆盖所有有效和无效转换
   - 测试进入和退出条件

2. **测试用例结构**
   每个测试用例应包括：
   - **Unique ID**: TC001, TC002 等
   - **Title**: 清晰、简洁的描述
   - **Description**: 正在测试什么以及为什么
   - **Preconditions**: 测试前所需的状态
   - **Test Data**: 需要的具体数据值
   - **Test Steps**: 详细的、循序渐进的说明
   - **Expected Result**: 应该发生什么
   - **Priority**: P0 (Critical), P1 (High), P2 (Medium), P3 (Low)
   - **Test Type**: Functional, UI, API, Performance, Security 等

3. **确保覆盖率**
   - **Positive Testing**: 有效输入，快乐路径
   - **Negative Testing**: 无效输入，错误处理
   - **Boundary Testing**: 边缘情况和限制
   - **Integration Testing**: 组件交互
   - **End-to-End Testing**: 完整的用户工作流

4. **编写清晰的步骤**
   - 具体且可操作
   - 使用简单的语言
   - 包含确切值（不是"输入有效名称" → "输入 'John Doe'"）
   - 按顺序编号每个步骤
   - 每步一个动作
   - 包含验证点

5. **输出格式**
   ```json
   {
     "test_cases": [
       {
         "id": "TC001",
         "title": "User login with valid credentials",
         "description": "Verify that a registered user can successfully login with correct username and password",
         "preconditions": "User account exists with username 'testuser' and password 'Pass123!'",
         "test_data": {
           "username": "testuser",
           "password": "Pass123!"
         },
         "steps": [
           {"step": 1, "action": "Navigate to login page", "expected": "Login form is displayed"},
           {"step": 2, "action": "Enter username 'testuser'", "expected": "Username is displayed in input field"},
           {"step": 3, "action": "Enter password 'Pass123!'", "expected": "Password is masked"},
           {"step": 4, "action": "Click Login button", "expected": "User is redirected to dashboard"},
           {"step": 5, "action": "Verify login success", "expected": "Welcome message is displayed"}
         ],
         "expected_result": "User successfully logs in and lands on dashboard page",
         "priority": "P0",
         "type": "Functional"
       }
     ]
   }
   ```

**最佳实践:**
- 每个测试用例应该验证一件事
- 保持测试用例相互独立
- 包含正向和负向场景
- 使用一致的命名约定
- 在可能的情况下使步骤可重用
- 考虑维护和更新
- 将测试用例链接到需求以实现可追溯性
