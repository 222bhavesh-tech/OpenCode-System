# OpenCode Swarm — Specialist Agent Team

## Purpose
Dynamic specialist team that Commander can spawn based on task requirements.

## Architecture
```
COMMANDER
    │
    ▼
SWARM COORDINATOR
    │
    ├── Specialist Registry
    ├── Team Assembly
    ├── Task Distribution
    ├── Result Collection
    └── Conflict Resolution
    │
    ▼
SPECIALIST AGENTS
    ├── Architect
    ├── Backend
    ├── Frontend
    ├── Security
    ├── Database
    ├── QA
    ├── DevOps
    ├── Research
    ├── Docs
    └── [Dynamic specialists]
```

## Specialist Registry

### Architect
```text
Role: System design, architecture decisions, technical leadership
Capabilities:
    - Architecture patterns (microservices, monolith, serverless)
    - Design systems
    - Technical strategy
    - API design
    - System modeling
MCPs: Context7, Memory, GitHub
Tools: Read, Grep, Glob
When to use:
    - Architecture decisions
    - System design
    - Technical reviews
    - Refactoring planning
```

### Backend
```text
Role: Server-side implementation, APIs, business logic
Capabilities:
    - Node.js, TypeScript, Python, Go
    - REST APIs, GraphQL, gRPC
    - Authentication, authorization
    - Business logic
    - Middleware
    - Caching
MCPs: Context7, GitHub, Filesystem
Tools: Read, Write, Edit, Bash
When to use:
    - Backend code
    - API endpoints
    - Business logic
    - Server configuration
```

### Frontend
```text
Role: Client-side implementation, UI/UX, browser interactions
Capabilities:
    - React, Vue, Angular, Svelte
    - HTML, CSS, Tailwind
    - Responsive design
    - Accessibility (WCAG)
    - State management
    - Browser APIs
MCPs: Playwright, Chrome DevTools, Figma, Context7
Tools: Read, Write, Edit, Bash, Playwright
When to use:
    - UI components
    - Styling
    - Browser testing
    - Visual verification
    - Accessibility
```

### Security
```text
Role: Security review, vulnerability assessment, hardening
Capabilities:
    - OWASP Top 10
    - Authentication/Authorization
    - Input validation
    - SQL injection prevention
    - XSS prevention
    - Dependency auditing
    - Secret management
MCPs: GitHub, Filesystem, Playwright
Tools: Read, Grep, Bash
When to use:
    - Security reviews
    - Vulnerability fixes
    - Auth implementation
    - Dependency audits
    - Secret scanning
```

### Database
```text
Role: Schema design, query optimization, data modeling
Capabilities:
    - PostgreSQL, MySQL, SQLite
    - MongoDB, Redis
    - Schema design
    - Query optimization
    - Migrations
    - ORM configuration
MCPs: Database, Context7, Filesystem
Tools: Read, Write, Edit, Bash
When to use:
    - Database changes
    - Schema design
    - Query optimization
    - Migrations
    - Data modeling
```

### QA
```text
Role: Test strategy, test implementation, quality assurance
Capabilities:
    - Unit testing (Jest, Vitest, Pytest)
    - Integration testing
    - E2E testing (Playwright, Cypress)
    - Test automation
    - Coverage analysis
    - Regression testing
MCPs: Playwright, GitHub, Filesystem
Tools: Read, Write, Edit, Bash, Playwright
When to use:
    - Test writing
    - Quality reviews
    - Regression testing
    - Coverage improvement
    - Test automation
```

### DevOps
```text
Role: Deployment, CI/CD, infrastructure, monitoring
Capabilities:
    - Docker, Docker Compose
    - CI/CD (GitHub Actions, GitLab CI)
    - Cloud services (AWS, GCP, Azure)
    - Monitoring, logging
    - Infrastructure as code
    - Deployment automation
MCPs: GitHub, Filesystem
Tools: Read, Write, Edit, Bash
When to use:
    - Deployment setup
    - CI/CD configuration
    - Docker setup
    - Infrastructure changes
    - Monitoring setup
```

### Research
```text
Role: Deep research, documentation analysis, external investigation
Capabilities:
    - Web research
    - Documentation review
    - Competitive analysis
    - Best practices research
    - Library evaluation
    - Technology assessment
MCPs: Firecrawl, Context7, Memory, Fetch
Tools: Read, Grep, Glob, Firecrawl
When to use:
    - Research tasks
    - Documentation needs
    - External investigation
    - Technology evaluation
    - Best practices
```

### Docs
```text
Role: Documentation creation, API docs, user guides
Capabilities:
    - Technical writing
    - API documentation
    - README creation
    - User guides
    - Architecture docs
    - Changelog maintenance
MCPs: Filesystem, GitHub
Tools: Read, Write, Edit
When to use:
    - Documentation updates
    - README creation
    - API docs
    - User guides
    - Architecture docs
```

## Team Assembly

### Dynamic Team Selection
```text
Task Analysis
    │
    ▼
Determine requirements
    │
    ├── Code changes → Backend/Frontend
    ├── Architecture → Architect
    ├── Security → Security
    ├── Database → Database
    ├── Testing → QA
    ├── Deployment → DevOps
    ├── Research → Research
    ├── Documentation → Docs
    └── Multiple → Team
    │
    ▼
Assemble team
    │
    ▼
Assign tasks
    │
    ▼
Start parallel execution
```

### Team Size Rules
- Simple task: 1 specialist
- Medium task: 2-3 specialists
- Complex task: 4-5 specialists
- Maximum: 5 concurrent specialists
- Total per mission: 9 specialists

## Parallel Execution

### Independent Tasks
```text
Tasks with no dependencies
    │
    ▼
Assign to specialists
    │
    ▼
Execute in parallel
    │
    ▼
Collect results
    │
    ▼
Merge outputs
```

### Dependent Tasks
```text
Tasks with dependencies
    │
    ▼
Execute in order
    │
    ▼
Each task waits for dependencies
    │
    ▼
Continue when ready
```

## Conflict Resolution

### File Conflicts
```text
Two specialists need same file
    │
    ▼
Commander detects conflict
    │
    ▼
Decide order or split file
    │
    ▼
Serialize access
```

### Approach Conflicts
```text
Specialists disagree on approach
    │
    ▼
Commander evaluates
    │
    ▼
Decides approach
    │
    ▼
Informs specialists
```

## Specialist Tool Permissions

### Researcher
```text
Read: Yes
Write: No
Bash: No
Browser: Yes
GitHub: Yes
```

### Architect
```text
Read: Yes
Write: No (except architecture docs)
Bash: No
Browser: No
GitHub: Yes
```

### Builder
```text
Read: Yes
Write: Yes
Bash: Yes
Browser: No
GitHub: Yes
```

### Tester
```text
Read: Yes
Write: Yes (test files)
Bash: Yes
Browser: Yes
GitHub: No
```

### Security
```text
Read: Yes
Write: No (except security fixes)
Bash: Yes (limited)
Browser: No
GitHub: Yes
```
