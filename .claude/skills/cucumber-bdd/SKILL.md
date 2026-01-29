---
name: cucumber-bdd
description: Convert test cases into Gherkin syntax for BDD testing. Use when creating executable test specifications, bridging the gap between requirements and automated tests.
---

# Cucumber/BDD Skill

Behavior-Driven Development (BDD) bridges the gap between business requirements and automated tests using Gherkin syntax.

## When to Use
- Converting test cases to executable specifications
- Creating living documentation that serves as tests
- Collaborating with non-technical stakeholders
- Building automated test frameworks with Cucumber/SpecFlow
- Ensuring tests reflect business requirements

## Gherkin Syntax Structure

### Feature
Describes the feature being tested from a user's perspective.

```gherkin
Feature: User login
  As a registered user
  I want to login with my credentials
  So that I can access my personalized content
```

### Scenario
A specific test case or example.

```gherkin
Scenario: Successful login with valid credentials
  Given the user is on the login page
  When the user enters username "testuser" and password "Password123!"
  And the user clicks the login button
  Then the user should be redirected to the dashboard
  And a welcome message should be displayed
```

### Background
Defines steps that run before each scenario.

```gherkin
Background:
  Given the application is open
  And the database is connected
```

### Scenario Outline
Data-driven testing with Examples table.

```gherkin
Scenario Outline: Invalid login attempts
  Given the user is on the login page
  When the user enters username "<username>" and password "<password>"
  And the user clicks the login button
  Then an error message "<error>" should be displayed

  Examples:
    | username | password   | error                  |
    | invalid  | wrong      | Invalid credentials    |
    |          | password   | Username is required   |
    | testuser |            | Password is required   |
    | testuser | wrong      | Invalid credentials    |
```

## Gherkin Keywords

| Keyword | Purpose | Usage |
|---------|---------|-------|
| **Feature** | High-level description | Start of feature file |
| **Scenario** | Specific test case | Concrete example |
| **Given** | Precondition | Initial context |
| **When** | Action | User interaction |
| **Then** | Outcome | Expected result |
| **And** | Additional step | Multiple Given/When/Then |
| **But** | Contrast | Alternative outcome |
| **Background** | Shared context | Runs before each scenario |
| **Scenario Outline** | Template | Data-driven scenarios |
| **Examples** | Data table | Input combinations |

## Writing Good Gherkin

### 1. Use Business Language
❌ Bad: "Click element with ID #login-button"
✅ Good: "Click the login button"

### 2. Keep Scenarios Focused
❌ Bad: 20-step scenario testing everything
✅ Good: 3-5 steps testing one behavior

### 3. Make Steps Declarative
❌ Bad: "Click button, wait 2 seconds, check URL contains /home, verify text 'Welcome'"
✅ Good: "User is redirected to home page"

### 4. Use Scenario Outlines for Data
❌ Bad: Writing 5 similar scenarios
✅ Good: One Scenario Outline with Examples table

## Step Definition Patterns

### Given Steps (State)
```javascript
// Single step
Given('the user is on the login page', async function() {
  await this.page.goto('https://example.com/login');
});

// With parameters
Given('a user exists with username {string}', async function(username) {
  await this.database.createUser({ username });
});

// Table data
Given('the following products exist:', async function(dataTable) {
  const products = dataTable.hashes();
  for (const product of products) {
    await this.database.createProduct(product);
  }
});
```

### When Steps (Actions)
```javascript
// Simple action
When('the user clicks the {string} button', async function(buttonText) {
  await this.page.click(`button:text-is('${buttonText}')`);
});

// Multiple parameters
When('the user enters username {string} and password {string}',
  async function(username, password) {
    await this.page.fill('#username', username);
    await this.page.fill('#password', password);
  }
);
```

### Then Steps (Outcomes)
```javascript
// Verification
Then('a welcome message should be displayed', async function() {
  const message = await this.page.textContent('.welcome-message');
  assert.isNotEmpty(message);
});

// With parameters
Then('the error message {string} should be displayed', async function(expectedMsg) {
  const actualMsg = await this.page.textContent('.error');
  assert.equal(actualMsg, expectedMsg);
});
```

## Complete Example

```gherkin
Feature: User Authentication

  Background:
    Given the application is running
    And the test database is initialized

  Scenario: Successful registration
    Given the user is on the registration page
    When the user enters email "test@example.com" and password "SecurePass123!"
    And the user confirms password "SecurePass123!"
    And the user clicks the register button
    Then the account should be created
    And a confirmation email should be sent
    And the user should be redirected to the welcome page

  Scenario: Registration with weak password
    Given the user is on the registration page
    When the user enters email "test@example.com" and password "weak"
    And the user clicks the register button
    Then the registration should fail
    And an error "Password must be at least 8 characters" should be displayed

  Scenario Outline: Registration with invalid email formats
    Given the user is on the registration page
    When the user enters email "<email>" and password "SecurePass123!"
    And the user clicks the register button
    Then an error "Invalid email format" should be displayed

    Examples:
      | email                |
      | invalid              |
      | @example.com         |
      | user@               |
      | user @example.com    |
```

## Best Practices

### DO ✅
- Write scenarios from the user's perspective
- Use Given-When-Then structure consistently
- Keep scenarios short (3-8 steps)
- Make scenarios independent of each other
- Use meaningful, business-focused names
- Include examples in Scenario Outlines
- Write declarative steps (what, not how)
- Keep background steps minimal

### DON'T ❌
- Don't include implementation details
- Don't write scenarios that depend on execution order
- Don't mix multiple behaviors in one scenario
- Don't use technical jargon
- Don't write overly long scenarios
- Don't duplicate similar scenarios (use Scenario Outline)
- Don't include test data directly in steps (use tables)

## Integration with Playwright

```gherkin
Feature: E2E Testing with Playwright

  Scenario: Complete purchase flow
    Given the user is on the home page
    When the user searches for "laptop"
    And the user clicks the first product
    And the user adds the product to cart
    And the user proceeds to checkout
    And the user enters shipping information
    And the user selects "Credit Card" payment
    And the user confirms the order
    Then the order should be placed successfully
    And a confirmation email should be sent
```

Corresponding step definitions:
```javascript
const { Given, When, Then } = require('@cucumber/cucumber');
const { expect } = require('@playwright/test');

Given('the user is on the home page', async function() {
  await this.page.goto('https://shop.example.com');
});

When('the user searches for {string}', async function(searchTerm) {
  await this.page.fill('[name="search"]', searchTerm);
  await this.page.click('[type="submit"]');
});

Then('the order should be placed successfully', async function() {
  const confirmation = await this.page.textContent('.order-confirmation');
  expect(confirmation).toContain('Thank you for your order');
});
```

## Output Format

When converting test cases to Gherkin:

```gherkin
Feature: [Feature name from test case]

  [Background if common preconditions exist]

  Scenario: [Test case title]
    Given [Precondition steps]
    When [Action steps]
    Then [Verification steps]
    And [Additional steps as needed]

  Scenario Outline: [For data-driven tests]
    Given [Precondition]
    When [Action with <parameter>]
    Then [Expected <result>]

    Examples:
      | parameter | result |
      | value1    | output1|
      | value2    | output2|
```
