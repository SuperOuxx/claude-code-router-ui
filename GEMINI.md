# Claude Code UI (Cloud CLI)

## Project Overview

This project, named "Claude Code UI" (or "Cloud CLI"), provides a web-based user interface for interacting with AI code assistants. It supports Claude Code, Cursor CLI, and Codex, offering a responsive design that works on desktop, tablet, and mobile devices. Key features include an interactive chat interface, integrated shell terminal, file explorer with live editing, Git integration, session management, and optional TaskMaster AI integration for advanced project management.

## Project Type

Code Project (Node.js/React)

## Key Technologies

*   **Frontend:** React, Vite, Tailwind CSS, CodeMirror
*   **Backend:** Node.js, Express.js, WebSockets
*   **AI Integration:** Claude Code, Cursor CLI, Codex
*   **Development Tools:** Playwright (for E2E tests)

## Building and Running

### Development Mode

To start the development server with hot-reloading:

```bash
npm run dev
```

This command runs both the backend server and the frontend client simultaneously.

### Production Build and Run

1.  **Build for production:**
    ```bash
    npm run build
    ```
    This command compiles and optimizes the application for deployment.

2.  **Start the production server:**
    ```bash
    npm run start
    ```
    This command first runs the production build and then starts the backend server.

### Running Components Separately

*   **Client (Frontend):**
    ```bash
    npm run client
    ```
    Starts the Vite development server for the client-side.

*   **Server (Backend):**
    ```bash
    npm run server
    ```
    Starts the Node.js backend server.

### End-to-End (E2E) Tests

To run the Playwright end-to-end tests:

```bash
npm run e2e
```

## Development Conventions

*   **Package Management:** Uses `npm` for managing project dependencies.
*   **Development Workflow:** Utilizes `concurrently` to run server and client development processes in parallel.
*   **Build Tool:** Employs `vite` for efficient building and serving of the application.
*   **Testing:** `playwright` is configured for end-to-end testing.
*   **Contributing:** The project encourages contributions following these guidelines:
    *   Fork the repository.
    *   Clone your fork.
    *   Install dependencies with `npm install`.
    *   Create feature branches (e.g., `git checkout -b feature/my-feature`).
    *   Commit changes following [Conventional Commits](https://conventionalcommits.org/).
    *   Submit Pull Requests with clear descriptions and test results.
*   **Code Quality:** Assumed to use linting and formatting tools (e.g., `npm run lint`, `npm run format`), although specific tools are not detailed in the analyzed files.
*   **Global CLI:** The project can be installed globally (`npm install -g @siteboon/claude-code-ui`) providing commands like `claude-code-ui` and `cloudcli` for server management.
