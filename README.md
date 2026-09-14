# Sigistry MCP server

[Official MCP Registry](https://registry.modelcontextprotocol.io/v0/servers?search=sigistry)

[![Sigistry: Verified Plugins, Skills & MCP Scorecards MCP connector – tool definition quality and endpoint health on Glama](https://glama.ai/mcp/connectors/com.sigistry/plugin-catalog/badges/score.svg)](https://glama.ai/mcp/connectors/com.sigistry/plugin-catalog)

A small, self-contained Node.js service that exposes the [Sigistry](https://sigistry.com) trust layer for Claude Code to AI agents through a public, read-only, authless **remote MCP server** using the Streamable HTTP transport: security-checked plugins and portable skills, independent A-to-F security scorecards for third-party MCP servers, and a local plugin-verification recipe.

It reads the same `marketplace.json`, `skills.json`, and `scorecards.json` the website uses and serves them as MCP tools, so any MCP-capable agent can discover verified plugins and skills, fetch portable SKILL.md sources, get ready-to-run install commands, and check how a third-party MCP server scored before connecting to it.

## Tools

- **search_plugins** `{ query?: string, category?: string }`: case-insensitive keyword match against each plugin's searchable text, optionally filtered by category. Returns up to 15 matches (id, name, description, category, installCommand).
- **get_plugin** `{ id: string }`: returns the full plugin object including component counts and both install commands (`installMarketplace` + `installCommand`). Returns a not-found error (suggesting `search_plugins`) if the id is unknown.
- **list_categories** `{}`: returns the distinct categories with a plugin count each, plus the total plugin count.
- **search_skills** `{ query?: string, plugin?: string }` and **get_skill** `{ name: string }`: search verified skills and fetch the full portable SKILL.md source.
- **list_scorecards** `{}` and **get_scorecard** `{ id: string }`: list MCP servers Sigistry has independently graded (overall grade A-F) and fetch one server's full per-axis scorecard. Useful before an agent connects to a third-party MCP server.
- **verify_plugin** `{ pluginPath?: string }`: returns the recipe to run the open-source verifier locally (the plugin code never leaves the user's machine).

## REST API (OpenAPI)

The same catalog data is also available as a public, read-only REST API for tools that consume OpenAPI (custom GPTs, code generators, integrations) rather than MCP. Served by the same Node process under `/v1`, described by an OpenAPI 3.1 spec, and documented at [sigistry.com/api](https://sigistry.com/api).

- `GET /v1/plugins?q=&category=&limit=&offset=` — list/search plugins (paginated)
- `GET /v1/plugins/{id}` — full plugin record with the verification object
- `GET /v1/verified/{id}` — the security-audit record for one plugin
- `GET /v1/skills?q=&plugin=&limit=&offset=` — list/search skills
- `GET /v1/skills/{name}` — full skill record including the portable SKILL.md source
- `GET /v1/categories` — categories with counts
- `GET /v1/scorecards` — MCP servers graded by Sigistry, with grades
- `GET /v1/scorecards/{id}` — one server's full per-axis scorecard
- `GET /v1/openapi.json` — the spec

Responses carry `Cache-Control: public, max-age=300`. The `/v1` routes live in `src/index.js`; the shared data helpers are in `src/catalog.js`; the spec is `src/openapi.js`.

## Add to Claude Code

Connect straight to the hosted endpoint (no gateway, no key):

```bash
claude mcp add --transport http sigistry https://sigistry.com/mcp
```

## Use with Smithery

Listed on [Smithery](https://smithery.ai/servers/sigistry/plugin-catalog) as `@sigistry/plugin-catalog`. Smithery's gateway proxies to the same hosted endpoint, so you can install it into any Smithery-supported client:

```bash
npx -y @smithery/cli install @sigistry/plugin-catalog --client claude
```

## Run locally

```bash
npm install
npm start
```

The server listens on `http://localhost:8787/mcp` (override with `PORT`). Smoke-test it with the bundled client:

```bash
npm test   # runs node test/client.mjs against localhost:8787
```

Other endpoints:

- `GET /health` produces `{ ok: true }`
- `GET /` produces a plain-text description
- `GET /mcp` produces `405` (this is a stateless server; use `POST`)
- `GET /v1/...` serves the REST API (see above); try `curl localhost:8787/v1/categories`

## Deployment

Runs under **pm2** (`ecosystem.config.cjs`) on the host, listening on `127.0.0.1:8787`, and exposed as the **paths** `sigistry.com/mcp` (MCP) and `sigistry.com/v1/*` (REST) via two `location` blocks in the site's Nginx, so there is no new subdomain, DNS record, or TLS cert. Because the static site is served directly by Nginx, a Node hiccup only ever affects those paths. A `Dockerfile` is included as an alternative to pm2.

Deployment is handled by internal tooling that is not part of this public repository.

The catalog is fetched from GitHub at runtime and cached in memory (~5 minute TTL). On a fetch error the server serves the last-good cache (or an empty list) and never crashes.

## Official MCP Registry

Published to the [Official MCP Registry](https://github.com/modelcontextprotocol/registry) as **`com.sigistry/plugin-catalog`** (status `active`). The manifest is [`server.json`](./server.json); its `remotes` entry points at `https://sigistry.com/mcp`. To publish an update, bump the `version` in `server.json` and re-run the publisher; the registry caps `description` at 100 characters.

## Discovery

- **Official MCP Registry** and **PulseMCP** (auto-ingests from the registry): live.
- **Smithery** (`@sigistry/plugin-catalog`): listed.
- **Glama** indexes public MCP repositories on GitHub automatically.

## License

MIT

---

*Sigistry is an independent project and is not affiliated with, endorsed by, or sponsored by Anthropic, PBC. Claude and Claude Code are trademarks of Anthropic, PBC, used here only to identify compatibility.*
