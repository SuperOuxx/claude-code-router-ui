---
name: test-planning
description: Create comprehensive test plans and strategies. Use when starting a new testing project, defining test approach, or determining what needs to be tested and how.
---

# Test Planning Skill

When creating a test plan:

1. **Analyze Test Scope**
   - Review requirements and acceptance criteria
   - Identify what needs to be tested
   - Determine what's out of scope

2. **Select Test Types**
   Based on the project, include relevant types:
   - **Functional Testing**: Verify features work as specified
   - **Performance Testing**: Load, stress, scalability
   - **Security Testing**: Authentication, authorization, vulnerabilities
   - **Compatibility Testing**: Browsers, devices, OS versions
   - **Usability Testing**: User experience, accessibility
   - **Integration Testing**: API, third-party services
   - **Regression Testing**: Prevent new bugs in existing features

3. **Define Test Strategy**
   - Test approach (manual, automated, or hybrid)
   - Test levels (unit, integration, system, acceptance)
   - Risk-based testing prioritization
   - Entry and exit criteria for each phase

4. **Specify Test Environment**
   - Browsers and versions to test
   - Devices and screen sizes
   - Operating systems
   - Test data requirements
   - Database setup
   - Test servers and staging environments

5. **Create Test Schedule**
   Break down into phases:
   - Test planning and preparation
   - Test case development
   - Test environment setup
   - Test execution
   - Bug triage and fixes
   - Regression testing
   - Test closure and reporting

6. **Risk Assessment**
   - Identify high-risk areas
   - Plan mitigation strategies
   - Define contingency plans

7. **Output Structure**
   ```json
   {
     "test_plan": {
       "strategy": "Overall testing approach",
       "test_types": [
         {
           "type": "Functional Testing",
           "priority": "P0",
           "scope": "Core features",
           "approach": "Automated"
         }
       ],
       "environment": {
         "browsers": ["Chrome", "Firefox", "Safari"],
         "devices": ["Desktop", "Mobile"],
         "test_data": "Description of data needs"
       },
       "schedule": [
         {
           "phase": "Test Planning",
           "duration": "2 days",
           "tasks": ["task1", "task2"]
         }
       ],
       "risks": [
         {
           "risk": "Risk description",
           "impact": "High/Medium/Low",
           "mitigation": "Mitigation plan"
         }
       ]
     }
   }
   ```

**Best Practices:**
- Prioritize testing based on risk and business impact
- Balance automation and manual testing efforts
- Consider early testing (shift-left approach)
- Plan for test maintenance and updates
