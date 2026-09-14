// OpenAPI 3.1 description of the Sigistry public read-only catalog API.
// Hand-authored and colocated with the routes so it deploys in lockstep with
// the server that implements it. Served at GET /v1/openapi.json.

const SITE = 'https://sigistry.com';

const verificationStatus = {
  type: 'string',
  enum: ['verified', 'listed', 'stale', 'failed', 'unknown'],
  description:
    'verified = passed the eight-check security methodology; listed = in the registry but not audited; stale = verified at a pinned commit the repo has since moved past; failed = an audit check failed; unknown = no record.',
};

const Check = {
  type: 'object',
  properties: {
    id: { type: 'string', example: 'skill-safety' },
    title: { type: 'string', example: 'Skill safety' },
    status: { type: 'string', enum: ['pass', 'fail', 'n/a'] },
    detail: { type: 'string' },
  },
  required: ['id', 'title', 'status'],
};

const Verification = {
  type: 'object',
  nullable: true,
  description: 'Full security-audit record. null when the plugin was never audited.',
  properties: {
    status: verificationStatus,
    hosting: { type: 'string', enum: ['registry', 'external'], description: 'registry = vendored here; external = author repo verified at a pinned commit.' },
    date: { type: 'string', format: 'date', description: 'date of the last audit run' },
    firstSeen: { type: 'string', format: 'date', description: 'date the plugin entered the registry' },
    methodologyVersion: { type: 'string', example: '1.2' },
    methodologyUrl: { type: 'string', format: 'uri' },
    badgeUrl: { type: 'string', format: 'uri', description: 'SVG badge for this plugin' },
    repo: { type: 'string', description: 'external repo (owner/name), when externally hosted' },
    commit: { type: 'string', description: 'pinned commit the verification applies to' },
    checks: { type: 'array', items: Check, description: 'per-check results of the security audit' },
  },
};

const Author = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    url: { type: 'string', format: 'uri' },
  },
};

const Counts = {
  type: 'object',
  properties: {
    commands: { type: 'integer' },
    agents: { type: 'integer' },
    skills: { type: 'integer' },
  },
};

const PluginSummary = {
  type: 'object',
  description: 'A plugin as returned in list responses.',
  properties: {
    id: { type: 'string', example: 'sql-safety-net' },
    name: { type: 'string' },
    version: { type: 'string' },
    description: { type: 'string' },
    category: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' }, description: 'keywords from the marketplace entry' },
    author: Author,
    license: { type: 'string' },
    counts: Counts,
    homepage: { type: 'string', format: 'uri' },
    installMarketplace: { type: 'string', description: 'command to add the marketplace to Claude Code' },
    installCommand: { type: 'string', description: 'command to install this plugin' },
    verificationStatus,
  },
};

const Plugin = {
  allOf: [
    { $ref: '#/components/schemas/PluginSummary' },
    {
      type: 'object',
      description: 'A full plugin record (detail response). Adds component paths and the full verification object.',
      properties: {
        commands: { type: 'array', items: { type: 'string' }, description: 'relative paths to command files' },
        agents: { type: 'array', items: { type: 'string' }, description: 'relative paths to agent files' },
        skills: { type: 'array', items: { type: 'string' }, description: 'relative paths to skill manifests' },
        verification: { $ref: '#/components/schemas/Verification' },
      },
    },
  ],
};

const SkillSummary = {
  type: 'object',
  properties: {
    name: { type: 'string', example: 'assessment-scoring' },
    description: { type: 'string', description: 'the skill trigger: when an agent should load it' },
    plugin: { type: 'string', description: 'parent plugin id that ships this skill' },
    verification: { ...verificationStatus, description: 'verification status of the parent plugin' },
    installCommand: { type: 'string' },
    detailUrl: { type: 'string', format: 'uri' },
  },
};

const Skill = {
  allOf: [
    { $ref: '#/components/schemas/SkillSummary' },
    {
      type: 'object',
      description: 'Full skill record, including the portable raw SKILL.md source.',
      properties: {
        pluginCategory: { type: 'string', nullable: true },
        verifiedDate: { type: 'string', nullable: true, format: 'date' },
        hosting: { type: 'string', enum: ['registry', 'external'] },
        repo: { type: 'string', description: 'author repo (owner/name), when externally hosted' },
        commit: { type: 'string', description: 'pinned commit the source is served from' },
        sourceUrl: { type: 'string', format: 'uri', description: 'GitHub location of the skill directory' },
        source: { type: 'string', nullable: true, description: 'the complete raw SKILL.md (frontmatter + body); null only if the fetch failed' },
      },
    },
  ],
};

const pageEnvelope = (itemsKey, itemRef) => ({
  type: 'object',
  properties: {
    total: { type: 'integer', description: 'total matches before pagination' },
    count: { type: 'integer', description: 'items in this page' },
    limit: { type: 'integer' },
    offset: { type: 'integer' },
    [itemsKey]: { type: 'array', items: { $ref: itemRef } },
  },
});

const ScorecardAxis = {
  type: 'object',
  properties: {
    id: { type: 'string', example: 'transport' },
    title: { type: 'string' },
    status: { type: 'string', enum: ['pass', 'partial', 'fail', 'n/a'] },
    evidence: { type: 'string', description: 'the file/behavior the result rests on' },
  },
};

const ScorecardSummary = {
  type: 'object',
  properties: {
    id: { type: 'string', example: 'sigistry-catalog' },
    name: { type: 'string' },
    grade: { type: 'string', enum: ['A', 'B', 'C', 'D', 'F'], description: 'overall grade' },
    repo: { type: 'string', nullable: true },
    commit: { type: 'string', nullable: true, description: 'the graded commit' },
    endpoint: { type: 'string', nullable: true },
    date: { type: 'string', nullable: true, format: 'date' },
    selfAssessment: { type: 'boolean', description: "true for Sigistry's own servers" },
  },
};

const Scorecard = {
  allOf: [
    { $ref: '#/components/schemas/ScorecardSummary' },
    {
      type: 'object',
      properties: {
        rubricVersion: { type: 'string', nullable: true },
        rubricUrl: { type: 'string', nullable: true, format: 'uri' },
        axes: { type: 'array', items: ScorecardAxis, description: 'per-axis results with cited evidence' },
        notes: { type: 'array', items: { type: 'string' }, description: 'hardening suggestions and context' },
      },
    },
  ],
};

const ScorecardList = {
  type: 'object',
  properties: {
    rubricVersion: { type: 'string', nullable: true },
    rubricUrl: { type: 'string', nullable: true, format: 'uri' },
    total: { type: 'integer' },
    scorecards: { type: 'array', items: { $ref: '#/components/schemas/ScorecardSummary' } },
  },
};

const Error = {
  type: 'object',
  properties: {
    error: { type: 'string', example: 'not_found' },
    message: { type: 'string' },
  },
  required: ['error'],
};

const limitParam = {
  name: 'limit',
  in: 'query',
  description: 'Max items to return (default 50, max 200).',
  schema: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
};
const offsetParam = {
  name: 'offset',
  in: 'query',
  description: 'Items to skip, for pagination.',
  schema: { type: 'integer', minimum: 0, default: 0 },
};

const jsonResponse = (ref) => ({
  content: { 'application/json': { schema: { $ref: ref } } },
});
const notFound = {
  description: 'No such resource.',
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
};

export const openApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'Sigistry Catalog API',
    version: '1.0.0',
    description:
      'Public, read-only REST access to the Sigistry catalog of verified Claude Code plugins and portable skills. Same data as the MCP server at https://sigistry.com/mcp, in a plain HTTP/JSON shape for tools that consume OpenAPI (custom GPTs, code generators, integrations). No auth, no rate-limited keys; be reasonable. Data is cached ~5 minutes.',
    license: { name: 'MIT' },
    contact: { name: 'Sigistry', url: SITE },
  },
  servers: [{ url: SITE, description: 'Production' }],
  tags: [
    { name: 'plugins', description: 'Verified Claude Code plugins' },
    { name: 'skills', description: 'Portable, verified SKILL.md instruction sets' },
    { name: 'scorecards', description: 'Independent grades of public MCP servers' },
    { name: 'meta', description: 'Categories, verification, and the spec itself' },
  ],
  paths: {
    '/v1/plugins': {
      get: {
        tags: ['plugins'],
        summary: 'List and search plugins',
        operationId: 'listPlugins',
        parameters: [
          { name: 'q', in: 'query', description: 'Full-text keyword filter over name, description, keywords, and author.', schema: { type: 'string' } },
          { name: 'category', in: 'query', description: 'Exact category match, e.g. "database", "devops".', schema: { type: 'string' } },
          limitParam,
          offsetParam,
        ],
        responses: { 200: { description: 'A page of plugins.', ...jsonResponse('#/components/schemas/PluginList') } },
      },
    },
    '/v1/plugins/{id}': {
      get: {
        tags: ['plugins'],
        summary: 'Get one plugin by id',
        operationId: 'getPlugin',
        parameters: [{ name: 'id', in: 'path', required: true, description: 'Stable plugin id, e.g. "sql-safety-net".', schema: { type: 'string' } }],
        responses: {
          200: { description: 'The full plugin record.', ...jsonResponse('#/components/schemas/Plugin') },
          404: notFound,
        },
      },
    },
    '/v1/verified/{id}': {
      get: {
        tags: ['meta'],
        summary: 'Get the verification record for a plugin',
        operationId: 'getVerification',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'The security-audit record.', ...jsonResponse('#/components/schemas/Verification') },
          404: notFound,
        },
      },
    },
    '/v1/skills': {
      get: {
        tags: ['skills'],
        summary: 'List and search skills',
        operationId: 'listSkills',
        parameters: [
          { name: 'q', in: 'query', description: 'Keyword filter over skill name and description.', schema: { type: 'string' } },
          { name: 'plugin', in: 'query', description: 'Restrict to skills shipped by this plugin id.', schema: { type: 'string' } },
          limitParam,
          offsetParam,
        ],
        responses: { 200: { description: 'A page of skills.', ...jsonResponse('#/components/schemas/SkillList') } },
      },
    },
    '/v1/skills/{name}': {
      get: {
        tags: ['skills'],
        summary: 'Get one skill by name, with portable source',
        operationId: 'getSkill',
        parameters: [{ name: 'name', in: 'path', required: true, description: 'Stable skill name, e.g. "assessment-scoring".', schema: { type: 'string' } }],
        responses: {
          200: { description: 'The full skill record including raw SKILL.md.', ...jsonResponse('#/components/schemas/Skill') },
          404: notFound,
        },
      },
    },
    '/v1/categories': {
      get: {
        tags: ['meta'],
        summary: 'List plugin categories with counts',
        operationId: 'listCategories',
        responses: {
          200: {
            description: 'Categories sorted by descending plugin count.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    categories: { type: 'array', items: { type: 'object', properties: { category: { type: 'string' }, count: { type: 'integer' } } } },
                    total: { type: 'integer' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/v1/scorecards': {
      get: {
        tags: ['scorecards'],
        summary: 'List graded MCP servers',
        operationId: 'listScorecards',
        responses: { 200: { description: 'Every graded MCP server with its overall grade.', ...jsonResponse('#/components/schemas/ScorecardList') } },
      },
    },
    '/v1/scorecards/{id}': {
      get: {
        tags: ['scorecards'],
        summary: 'Get one MCP server scorecard',
        operationId: 'getScorecard',
        parameters: [{ name: 'id', in: 'path', required: true, description: 'Scorecard id, e.g. "sigistry-catalog".', schema: { type: 'string' } }],
        responses: {
          200: { description: 'The full scorecard: per-axis results, evidence, notes, graded commit.', ...jsonResponse('#/components/schemas/Scorecard') },
          404: notFound,
        },
      },
    },
    '/v1/openapi.json': {
      get: {
        tags: ['meta'],
        summary: 'This OpenAPI document',
        operationId: 'getOpenApi',
        responses: { 200: { description: 'The OpenAPI 3.1 spec.', content: { 'application/json': { schema: { type: 'object' } } } } },
      },
    },
  },
  components: {
    schemas: {
      PluginSummary,
      Plugin,
      SkillSummary,
      Skill,
      Verification,
      Check,
      Error,
      PluginList: pageEnvelope('plugins', '#/components/schemas/PluginSummary'),
      SkillList: pageEnvelope('skills', '#/components/schemas/SkillSummary'),
      ScorecardSummary,
      Scorecard,
      ScorecardAxis,
      ScorecardList,
    },
  },
};
