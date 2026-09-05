# SWARM CONFIGURATION

## Team Name
<!-- Name of the specialist team -->

## Swarm ID
<!-- Unique identifier: SWARM-YYYY-MM-DD-NNN -->

## Specialists

### Architect
- **Role:** System design, architecture decisions, technical leadership
- **Capabilities:** Architecture patterns, design systems, technical strategy
- **MCPs:** Context7, Memory, GitHub
- **When to use:** Architecture decisions, system design, technical reviews

### Backend
- **Role:** Server-side implementation, APIs, business logic
- **Capabilities:** Node.js, Python, Go, databases, APIs, microservices
- **MCPs:** Context7, GitHub, Filesystem, Database
- **When to use:** Backend code, API endpoints, business logic

### Frontend
- **Role:** Client-side implementation, UI/UX, browser interactions
- **Capabilities:** React, Vue, CSS, HTML, responsive design, accessibility
- **MCPs:** Playwright, Chrome DevTools, Figma, Context7
- **When to use:** UI components, styling, browser testing

### Security
- **Role:** Security review, vulnerability assessment, hardening
- **Capabilities:** OWASP, penetration testing, security patterns, audits
- **MCPs:** GitHub, Filesystem, Playwright
- **When to use:** Security reviews, auth implementation, vulnerability fixes

### Database
- **Role:** Schema design, query optimization, data modeling
- **Capabilities:** PostgreSQL, MySQL, MongoDB, Redis, migrations
- **MCPs:** Database, Context7, Filesystem
- **When to use:** Database changes, migrations, query optimization

### QA
- **Role:** Test strategy, test implementation, quality assurance
- **Capabilities:** Unit tests, integration tests, E2E tests, test automation
- **MCPs:** Playwright, GitHub, Filesystem
- **When to use:** Test writing, quality reviews, regression testing

### DevOps
- **Role:** Deployment, CI/CD, infrastructure, monitoring
- **Capabilities:** Docker, CI/CD, cloud services, monitoring, logging
- **MCPs:** GitHub, Filesystem
- **When to use:** Deployment, CI/CD setup, infrastructure changes

### Research
- **Role:** Deep research, documentation analysis, external investigation
- **Capabilities:** Web research, documentation review, competitive analysis
- **MCPs:** Firecrawl, Context7, Memory, Fetch
- **When to use:** Research tasks, documentation needs, external investigation

### Docs
- **Role:** Documentation creation, API docs, user guides
- **Capabilities:** Technical writing, API documentation, README creation
- **MCPs:** Filesystem, GitHub
- **When to use:** Documentation updates, README creation, API docs

## Parallel Execution Rules
- Independent tasks can run in parallel across specialists
- Shared file modifications must be serialized
- Conflicts resolved by Commander
- Each specialist reports to Commander

## Spawn Limits
- Max concurrent specialists: 5
- Max total specialists per mission: 9
- Timeout per specialist: 10 minutes
- Retry limit: 3
