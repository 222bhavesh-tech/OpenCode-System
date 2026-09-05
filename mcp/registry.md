# Master MCP Registry

**Last Updated:** 2026-09-04
**OpenCode Version:** 1.18.27
**Policy:** FREE-FIRST, SELF-HOSTED PREFERRED

---

## Installed MCPs (Active)

| Name | Category | Free Status | Primary Agent | Allowed Agents | Status |
|------|----------|-------------|---------------|----------------|--------|
| GitHub | Development | FREE | Build | Workspace, Commander, Planner, Build, Reviewer | âœ… ACTIVE |
| Filesystem | Development | FREE | Build | Workspace, Commander, Planner, Build, Reviewer | âœ… ACTIVE |
| Playwright | Browser | FREE | Build | Workspace, Commander, Planner, Build, Reviewer | âœ… ACTIVE |
| Memory | Knowledge | FREE | Planner | Workspace, Commander, Planner, Build, Reviewer | âœ… ACTIVE |
| Context7 | Documentation | FREE | Planner | Workspace, Commander, Planner, Build, Reviewer | âœ… ACTIVE |
| Chrome DevTools | Browser | FREE | Build | Workspace, Build, Reviewer | âœ… ACTIVE |
| Firecrawl | Web Scraping | FREE (limited) | Planner | Workspace, Planner, Build | âœ… ACTIVE |
| Chirpie | Social | FREE | Commander | Commander, Planner | âœ… ACTIVE |

---

## Available MCPs (Not Yet Installed)

### WEB CATEGORY

| Name | Package | Free Status | Install Method | Notes |
|------|---------|-------------|----------------|-------|
| SearXNG | `mcp-searxng` | FREE | `npm install -g mcp-searxng` | Self-hosted metasearch, requires Docker for SearXNG instance |
| Fetch | `mcp-fetch-server` | FREE âœ… | `npm install -g mcp-fetch-server` | Web content as HTML/Markdown/JSON/YouTube transcripts |


### DEVELOPMENT CATEGORY

| Name | Package | Free Status | Install Method | Notes |
|------|---------|-------------|----------------|-------|
| Sequential Thinking | `@modelcontextprotocol/server-sequential-thinking` | FREE âœ… | `npm install -g @modelcontextprotocol/server-sequential-thinking` | Step-by-step reasoning |


### UI/UX CATEGORY

| Name | Package | Free Status | Install Method | Notes |
|------|---------|-------------|----------------|-------|
| shadcn | `@anthropic-ai/shadcn` | FREE | `npx -y @anthropic-ai/shadcn` | Component library access |
| Storybook | `@anthropic-ai/storybook` | FREE | `npx -y @anthropic-ai/storybook` | Component documentation |

### CMS CATEGORY

| Name | Package | Free Status | Install Method | Notes |
|------|---------|-------------|----------------|-------|
| WordPress | `@cmsmcp/wordpress` | FREE âœ… | `npm install -g @cmsmcp/wordpress` | 337 tools, requires WordPress REST API |
| WooCommerce | `@cmsmcp/woocommerce` | FREE âœ… | `npm install -g @cmsmcp/woocommerce` | 95 tools, requires WooCommerce REST API |
| Shopify | `@cmsmcp/shopify` | FREE âœ… | `npm install -g @cmsmcp/shopify` | 147 tools, requires Shopify Admin API |

### DATABASE CATEGORY

| Name | Package | Free Status | Install Method | Notes |
|------|---------|-------------|----------------|-------|
| dbmcp | `dbmcp` | FREE âœ… | `curl -L https://dbmcp.haymon.ai/install.ps1 \| iex` | Single binary, MySQL/PostgreSQL/SQLite, PII redaction, write-prevention |
| mcp-multi-db | `mcp-multi-db` | FREE | `npm install -g mcp-multi-db` | Multi-database, read-only default |
| universal-db-mcp | `universal-db-mcp` | FREE | `pip install universal-db-mcp` | Python, PostgreSQL/SQLite/MySQL/DuckDB |

### SOCIAL CATEGORY

| Name | Package | Free Status | Install Method | Notes |
|------|---------|-------------|----------------|-------|
| Meta/Facebook | `@anthropic-ai/meta` | FREE | `npx -y @anthropic-ai/meta` | Graph API, requires OAuth |
| Instagram | `@anthropic-ai/instagram` | FREE | `npx -y @anthropic-ai/instagram` | Graph API, requires OAuth |
| LinkedIn | `@anthropic-ai/linkedin` | FREE | `npx -y @anthropic-ai/linkedin` | API, requires OAuth |
| X/Twitter | `@anthropic-ai/twitter` | FREE | `npx -y @anthropic-ai/twitter` | API v2, requires OAuth |
| YouTube | `@anthropic-ai/youtube` | FREE | `npx -y @anthropic-ai/youtube` | Data API v3, requires API key |
| TikTok | `@anthropic-ai/tiktok` | FREE | `npx -y @anthropic-ai/tiktok` | Research API, limited |
| Reddit | `@anthropic-ai/reddit` | FREE | `npx -y @anthropic-ai/reddit` | API, requires OAuth |
| Threads | `@anthropic-ai/threads` | FREE | `npx -y @anthropic-ai/threads` | Graph API, requires OAuth |

### GOOGLE CATEGORY

| Name | Package | Free Status | Install Method | Notes |
|------|---------|-------------|----------------|-------|
| Google Drive | `@anthropic-ai/google-drive` | FREE | `npx -y @anthropic-ai/google-drive` | API, requires OAuth, free quota |
| Google Sheets | `@anthropic-ai/google-sheets` | FREE | `npx -y @anthropic-ai/google-sheets` | API, requires OAuth, free quota |

---

## Disabled MCPs (Not Free)

| Name | Reason | Status |
|------|--------|--------|
| Figma | Requires Figma Dev/Full seat + OAuth | âŒ DISABLED |
| Google Flow | Requires Chrome CDP + real Google email | âŒ DISABLED |
| Computer Use | Requires Docker | âŒ DISABLED |

---

## MCP Classification

### MUST USE
- GitHub, Filesystem, Playwright, Memory, Context7

### HIGH PRIORITY
- Chrome DevTools, Firecrawl, Chirpie

### OPTIONAL
- SearXNG

### STANDBY
- shadcn, Storybook, CMS MCPs, Database MCPs, Social MCPs, Google MCPs

### NOT NEEDED
- (Determined per project by Workspace)

### CONFLICT / DUPLICATE
- Firecrawl vs Scrapling: Firecrawl PRIMARY, Scrapling FALLBACK
- Playwright vs Chrome DevTools: Playwright PRIMARY, Chrome DevTools SPECIALIST

---

## Agent MCP Access Matrix

| MCP | Workspace | Commander | Planner | Build | Reviewer |
|-----|-----------|-----------|---------|-------|----------|
| GitHub | âœ… | âœ… | âœ… | âœ… | âœ… (read) |
| Filesystem | âœ… | âœ… | âœ… | âœ… | âœ… (read) |
| Playwright | âœ… | âœ… | âœ… | âœ… | âœ… |
| Memory | âœ… | âœ… | âœ… | âœ… | âœ… |
| Context7 | âœ… | âœ… | âœ… | âœ… | âœ… |
| Chrome DevTools | âœ… | - | âœ… | âœ… | âœ… |
| Firecrawl | âœ… | - | âœ… | âœ… | - |
| Chirpie | - | âœ… | âœ… | - | - |
| SearXNG | âœ… | - | âœ… | - | - |
| Fetch | âœ… | - | âœ… | - | - |
| CMS MCPs | - | - | âœ… | âœ… | âœ… (read) |
| Database MCPs | - | - | âœ… (read) | âœ… | âœ… (read) |
| Social MCPs | - | - | âœ… (read) | - | - |
| Google MCPs | - | - | âœ… (read) | - | - |

---

## Installation Order

1. ~~GitHub~~ (installed)
2. ~~Filesystem~~ (installed)
3. ~~Playwright~~ (installed)
4. ~~Memory~~ (installed)
5. ~~Context7~~ (installed)
6. ~~Chrome DevTools~~ (installed)
7. ~~Firecrawl~~ (installed)
8. ~~Chirpie~~ (installed)
9. SearXNG (web search)
10. ~~Fetch~~ (installed)
11. ~~Sequential Thinking~~ (installed)
12. ~~dbmcp~~ (installed)
13. ~~CMS MCPs~~ (installed)
14. Social MCPs (evaluate per project)
15. Google MCPs (evaluate per project)

---

## Notes

- All MCPs must be FREE or have explicit user approval
- No paid MCP may be activated without user approval
- MCPs consume model context â€” keep unnecessary MCPs disabled
- Workspace classifies MCPs per project
- Reviewer independently verifies MCP usage



