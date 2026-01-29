---
name: test-case-design
description: Design detailed test cases using industry-standard techniques. Use when converting test plans into actionable test cases, ensuring comprehensive coverage through boundary analysis and equivalence partitioning.
---

# Test Case Design Skill

When designing test cases:

1. **Apply Test Design Techniques**

   **Equivalence Partitioning:**
   - Divide input data into valid and invalid partitions
   - Select one representative value from each partition
   - Test both valid and invalid scenarios

   **Boundary Value Analysis:**
   - Test at boundaries (min, min-1, min+1, max, max+1)
   - Test edges of arrays, string lengths, numeric ranges
   - Identify off-by-one errors

   **Decision Tables:**
   - Use for complex business logic with multiple conditions
   - Cover all combinations of inputs and expected outputs
   - Handle rule-based systems

   **State Transition:**
   - Test system states and valid transitions
   - Cover all valid and invalid transitions
   - Test entry and exit conditions

2. **Test Case Structure**
   Each test case should include:
   - **Unique ID**: TC001, TC002, etc.
   - **Title**: Clear, concise description
   - **Description**: What is being tested and why
   - **Preconditions**: Required state before testing
   - **Test Data**: Specific data values needed
   - **Test Steps**: Detailed, step-by-step instructions
   - **Expected Result**: What should happen
   - **Priority**: P0 (Critical), P1 (High), P2 (Medium), P3 (Low)
   - **Test Type**: Functional, UI, API, Performance, Security, etc.

3. **Ensure Coverage**
   - **Positive Testing**: Valid inputs, happy path
   - **Negative Testing**: Invalid inputs, error handling
   - **Boundary Testing**: Edge cases and limits
   - **Integration Testing**: Component interactions
   - **End-to-End Testing**: Complete user workflows

4. **Write Clear Steps**
   - Be specific and actionable
   - Use simple language
   - Include exact values (not "enter a valid name" → "enter 'John Doe'")
   - Number each step sequentially
   - One action per step
   - Include verification points

5. **Output Format**
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

**Best Practices:**
- Each test case should verify one thing
- Keep test cases independent of each other
- Include both positive and negative scenarios
- Use consistent naming conventions
- Make steps reusable where possible
- Consider maintenance and updates
- Link test cases to requirements for traceability
