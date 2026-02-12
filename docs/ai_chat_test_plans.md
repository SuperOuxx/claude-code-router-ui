# AI Chat Test Plans

## Test Cases for "Chat with AI" Feature

| Test Case ID | Description | Steps | Expected Result |
|--------------|-------------|-------|-----------------|
| TC-CA-001 | Send valid text question | 1. Enter 'What is the capital of France?'<br>2. Click send button | Input accepted<br>Response received within 5s |
| TC-CA-002 | Send code snippet | 1. Paste 50-line Python code<br>2. Click send button | Input accepted with syntax highlighting<br>Relevant explanation received |
| TC-CA-003 | Empty message submission | 1. Leave message field empty | Send button disabled |
| TC-CA-004 | Maximum character limit (5000) | 1. Enter exactly 5000 characters<br>2. Enter 5001 characters | Input accepted<br>Input rejected with warning |
| TC-CA-005 | Special characters and SQL input | 1. Enter SQL injection attempt | Input treated as text, no SQL execution |
| TC-CA-006 | Context continuation | 1. Follow-up question after geography discussion | Response references previous context |
| TC-CA-007 | New session context reset | 1. Start new session<br>2. Ask about previous discussion | No history visible<br>'No context' response |
| TC-CA-008 | API failure handling | 1. Send message during API downtime<br>2. Retry after 10s | 'Service unavailable' error<br>Message sent if service restored |
| TC-CA-009 | Code output rendering | 1. Request code solution | Response displays in formatted code block |
| TC-CA-010 | Concurrent sessions (50 users) | 1. Simulate 50 concurrent requests | 95% responses < 8s<br>Error rate ≤ 1% |
| TC-CA-011 | Large file attachment (10MB limit) | 1. Attach 9.9MB file<br>2. Attach 10.1MB file | Upload accepted<br>Upload rejected |
| TC-CA-012 | Session timeout (30 minutes) | 1. Send after 29 min inactivity<br>2. Send after 31 min | Accepted<br>Session expired warning |

## Techniques Applied:
1. **Boundary Value Analysis**:
   - Min/Max character limits (empty, 5000, 5001)
   - File size boundaries (9.9MB/10.1MB)
   - Session timeout thresholds (29/31 min)

2. **Equivalence Partitioning**:
   - Valid Inputs: Normal text/code/questions
   - Invalid Inputs: Empty/SQL/XSS/oversized
   - System States: API available/unavailable

3. **Coverage Areas**:
   - Functional: 60%
   - Boundary: 25%
   - Error/Security: 15%