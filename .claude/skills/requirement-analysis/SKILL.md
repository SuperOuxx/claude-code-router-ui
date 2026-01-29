---
name: requirement-analysis
description: Extract and structure requirements from text descriptions. Use when user provides feature requirements, user stories, or specifications that need to be analyzed and documented.
---

# Requirement Analysis Skill

When analyzing requirements from text descriptions:

1. **Identify Core Functionality**
   - Extract the main feature being described
   - Identify user goals and objectives
   - Note any specific user roles or personas mentioned

2. **Extract Acceptance Criteria**
   - Look for explicit success criteria
   - Identify measurable outcomes
   - Note any performance or quality requirements

3. **Define Scope Boundaries**
   - **In Scope**: Features explicitly mentioned
   - **Out Scope**: Features clearly excluded or deferred
   - **Assumptions**: Implicit requirements or dependencies

4. **Identify Constraints**
   - Technical constraints (platform, technology)
   - Business constraints (timeline, budget)
   - User constraints (accessibility, localization)

5. **Output Structure**
   Provide a structured requirement document:
   ```json
   {
     "requirement": {
       "feature": "Feature name",
       "objectives": ["goal1", "goal2"],
       "user_stories": ["As a... I want... So that..."],
       "scope": {
         "in_scope": ["included features"],
         "out_scope": ["excluded features"]
       },
       "acceptance_criteria": ["criterion1", "criterion2"],
       "constraints": ["constraint1"],
       "dependencies": ["dependency1"]
     }
   }
   ```

**Best Practices:**
- Use the 5W1H method (Who, What, Where, When, Why, How)
- Focus on user needs and business value
- Identify both functional and non-functional requirements
- Highlight any ambiguous or missing information
