// HTTP wiring: stateless Streamable HTTP MCP server behind Express.

import express from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import { buildServer } from './server.js';
import {
  restListPlugins,
  restGetPlugin,
  restGetVerification,
  restListSkills,
  getSkill,
  listCategories,
  listScorecards,
  getScorecard,
} from './catalog.js';
import { openApiSpec } from './openapi.js';

const app = express();
app.use(express.json());

// Permissive CORS for a public read-only server.
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set(
    'Access-Control-Allow-Headers',
    'Content-Type, Mcp-Session-Id, Mcp-Protocol-Version'
  );
  res.set('Access-Control-Expose-Headers', 'Mcp-Session-Id');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.post('/mcp', async (req, res) => {
  try {
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
    });
    res.on('close', () => {
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal error' },
        id: null,
      });
    }
  }
});

app.get('/mcp', (_req, res) =>
  res
    .status(405)
    .set('Allow', 'POST')
    .json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message:
          'Method Not Allowed. Use POST for MCP; this is a stateless server.',
      },
      id: null,
    })
);

app.get('/health', (_req, res) => res.json({ ok: true }));

// ---------------------------------------------------------------------------
// Public read-only REST facade (/v1). Same catalog data as the MCP tools, in a
// plain HTTP/JSON shape for OpenAPI consumers. Described by /v1/openapi.json.
// All responses are cacheable for the catalog's ~5-minute TTL.
// ---------------------------------------------------------------------------
const v1 = express.Router();

v1.use((_req, res, next) => {
  res.set('Cache-Control', 'public, max-age=300');
  next();
});

// Wrap an async handler so a rejection becomes a clean JSON 500, never a hang.
const h = (fn) => (req, res) =>
  Promise.resolve(fn(req, res)).catch(() => {
    if (!res.headersSent) res.status(500).json({ error: 'internal_error', message: 'Something went wrong.' });
  });

const notFound = (res, message) => res.status(404).json({ error: 'not_found', message });

v1.get('/openapi.json', (_req, res) => res.json(openApiSpec));

v1.get('/plugins', h(async (req, res) => {
  const { q, category, limit, offset } = req.query;
  res.json(await restListPlugins({ q, category, limit, offset }));
}));

v1.get('/plugins/:id', h(async (req, res) => {
  const plugin = await restGetPlugin(req.params.id);
  if (!plugin) return notFound(res, `No plugin with id "${req.params.id}". List ids via GET /v1/plugins.`);
  res.json(plugin);
}));

v1.get('/verified/:id', h(async (req, res) => {
  const v = await restGetVerification(req.params.id);
  if (!v) return notFound(res, `No verification record for "${req.params.id}".`);
  res.json(v);
}));

v1.get('/skills', h(async (req, res) => {
  const { q, plugin, limit, offset } = req.query;
  res.json(await restListSkills({ q, plugin, limit, offset }));
}));

v1.get('/skills/:name', h(async (req, res) => {
  const skill = await getSkill(req.params.name);
  if (!skill) return notFound(res, `No skill named "${req.params.name}". List names via GET /v1/skills.`);
  res.json(skill);
}));

v1.get('/categories', h(async (_req, res) => {
  res.json(await listCategories());
}));

v1.get('/scorecards', h(async (_req, res) => {
  res.json(await listScorecards());
}));

v1.get('/scorecards/:id', h(async (req, res) => {
  const card = await getScorecard(req.params.id);
  if (!card) return notFound(res, `No scorecard with id "${req.params.id}". List them via GET /v1/scorecards.`);
  res.json(card);
}));

app.use('/v1', v1);

app.get('/', (_req, res) =>
  res
    .type('text/plain')
    .send(
      'Sigistry catalog. MCP: POST /mcp (Streamable HTTP; tools search_plugins, get_plugin, list_categories, search_skills, get_skill, list_scorecards, get_scorecard, verify_plugin). REST: GET /v1/plugins, /v1/plugins/{id}, /v1/skills, /v1/skills/{name}, /v1/categories, /v1/verified/{id}, /v1/scorecards, /v1/scorecards/{id}. OpenAPI: /v1/openapi.json. Docs: https://sigistry.com/api'
    )
);

const PORT = process.env.PORT || 8787;
app.listen(PORT, () =>
  console.log(`Sigistry MCP server on :${PORT}/mcp`)
);
