// Catalog: fetch + transform + cache of the Sigistry marketplace.json.
// Mirrors the website's marketplaceService.js transform.

const MARKETPLACE_URL =
  'https://raw.githubusercontent.com/Sigistry/marketplace/main/.claude-plugin/marketplace.json';

// Verification results (the "Verified by Sigistry" methodology output,
// written by the marketplace repo's scripts/verify-plugins.mjs).
const VERIFIED_URL =
  'https://raw.githubusercontent.com/Sigistry/marketplace/main/.claude-plugin/verified.json';

const TTL_MS = 5 * 60 * 1000; // 5 minutes

let cache = {
  plugins: [],
  fetchedAt: 0,
  lastGood: null, // last successfully-fetched plugin array
};

let vcache = {
  data: null,
  fetchedAt: 0,
  lastGood: null, // last successfully-fetched verified.json
};

function transformEntry(entry) {
  const name = entry.name || '';
  const id = name.toLowerCase().replace(/\s+/g, '-');
  const keywords = Array.isArray(entry.keywords) ? entry.keywords : [];
  const commands = Array.isArray(entry.commands) ? entry.commands : [];
  const agents = Array.isArray(entry.agents) ? entry.agents : [];
  const skills = Array.isArray(entry.skills) ? entry.skills : [];
  const author = entry.author;

  return {
    id,
    name,
    version: entry.version,
    description: entry.description,
    category: entry.category,
    tags: keywords,
    author,
    license: entry.license,
    commands,
    agents,
    skills,
    counts: {
      commands: commands.length,
      agents: agents.length,
      skills: skills.length,
    },
    homepage: entry.homepage,
    installMarketplace: '/plugin marketplace add sigistry/marketplace',
    installCommand: `/plugin install ${id}@sigistry`,
    searchableText: [name, entry.description, ...keywords, author && author.name]
      .filter(Boolean)
      .join(' ')
      .toLowerCase(),
  };
}

async function fetchCatalog() {
  const now = Date.now();
  if (cache.plugins.length && now - cache.fetchedAt < TTL_MS) {
    return cache.plugins;
  }

  try {
    const res = await fetch(MARKETPLACE_URL, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const rawPlugins = Array.isArray(data.plugins) ? data.plugins : [];
    const plugins = rawPlugins.map(transformEntry);

    cache = { plugins, fetchedAt: now, lastGood: plugins };
    return plugins;
  } catch (err) {
    // On fetch error: serve last-good cache, or an empty list. Never crash.
    if (cache.lastGood) {
      cache.fetchedAt = now; // avoid hammering on repeated errors within TTL
      return cache.lastGood;
    }
    return [];
  }
}

async function fetchVerified() {
  const now = Date.now();
  if (vcache.data && now - vcache.fetchedAt < TTL_MS) {
    return vcache.data;
  }
  try {
    const res = await fetch(VERIFIED_URL, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    vcache = { data, fetchedAt: now, lastGood: data };
    return data;
  } catch (err) {
    if (vcache.lastGood) {
      vcache.fetchedAt = now;
      return vcache.lastGood;
    }
    return null;
  }
}

// Full verification record for one plugin: status, per-check results, badge.
function verificationDetail(verifiedData, id) {
  const info = verifiedData?.plugins?.[id];
  if (!info) return null;
  return {
    status: info.status, // verified | listed | stale | failed
    hosting: info.hosting, // registry | external
    date: info.date,
    firstSeen: info.firstSeen,
    methodologyVersion: verifiedData.methodologyVersion,
    methodologyUrl:
      verifiedData.methodologyUrl || 'https://sigistry.com/verification',
    badgeUrl: `https://sigistry.com/badge/${id}.svg`,
    ...(info.repo ? { repo: info.repo, commit: info.commit } : {}),
    checks: (info.checks || []).map((c) => ({
      id: c.id,
      title: c.title,
      status: c.status, // pass | fail | n/a
      detail: c.detail,
    })),
  };
}

export async function searchPlugins(query, category) {
  const [plugins, verified] = await Promise.all([fetchCatalog(), fetchVerified()]);
  const q = query ? String(query).toLowerCase().trim() : '';
  const cat = category ? String(category).toLowerCase().trim() : '';

  let results = plugins;
  if (q) {
    results = results.filter((p) => p.searchableText.includes(q));
  }
  if (cat) {
    results = results.filter(
      (p) => (p.category || '').toLowerCase() === cat
    );
  }

  return results.slice(0, 15).map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    category: p.category,
    installCommand: p.installCommand,
    verification: verified?.plugins?.[p.id]?.status ?? 'unknown',
  }));
}

export async function getPlugin(id) {
  const [plugins, verified] = await Promise.all([fetchCatalog(), fetchVerified()]);
  const target = id ? String(id).toLowerCase().trim() : '';
  const found = plugins.find((p) => p.id === target);
  if (!found) return null;
  return { ...found, verification: verificationDetail(verified, target) };
}

export async function listCategories() {
  const plugins = await fetchCatalog();
  const counts = new Map();
  for (const p of plugins) {
    const c = p.category || 'uncategorized';
    counts.set(c, (counts.get(c) || 0) + 1);
  }
  const categories = [...counts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));

  return { categories, total: plugins.length };
}

// ---------------------------------------------------------------------------
// Skills index (written by the marketplace repo's generate-skills-index.mjs).
// Same fetch+TTL+last-good pattern as the catalog; get_skill additionally
// fetches the raw SKILL.md so agents can use the skill directly.
// ---------------------------------------------------------------------------

const SKILLS_URL =
  'https://raw.githubusercontent.com/Sigistry/marketplace/main/.claude-plugin/skills.json';
const RAW_BASE = 'https://raw.githubusercontent.com/Sigistry/marketplace/main';

let scache = { data: null, fetchedAt: 0, lastGood: null };
let rawCache = new Map(); // skill name -> { text, fetchedAt }

async function fetchSkillsIndex() {
  const now = Date.now();
  if (scache.data && now - scache.fetchedAt < TTL_MS) return scache.data;
  try {
    const res = await fetch(SKILLS_URL, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    scache = { data, fetchedAt: now, lastGood: data };
    return data;
  } catch {
    if (scache.lastGood) {
      scache.fetchedAt = now;
      return scache.lastGood;
    }
    return null;
  }
}

function skillHit(s) {
  return {
    name: s.name,
    description: s.description,
    plugin: s.plugin,
    verification: s.status ?? 'unknown',
    installCommand: `/plugin install ${s.plugin}@sigistry`,
    detailUrl: `https://sigistry.com/skills/${s.name}`,
  };
}

export async function searchSkills(query, plugin) {
  const idx = await fetchSkillsIndex();
  const skills = idx?.skills ?? [];
  const q = query ? String(query).toLowerCase().trim() : '';
  const p = plugin ? String(plugin).toLowerCase().trim() : '';

  let results = skills;
  if (q) {
    results = results.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.description || '').toLowerCase().includes(q)
    );
  }
  if (p) results = results.filter((s) => s.plugin.toLowerCase() === p);

  return results.slice(0, 20).map(skillHit);
}

export async function getSkill(name) {
  const idx = await fetchSkillsIndex();
  const target = name ? String(name).toLowerCase().trim() : '';
  const skill = (idx?.skills ?? []).find((s) => s.name === target);
  if (!skill) return null;

  // Raw SKILL.md, cached per skill: this is the portable artifact an agent
  // can apply directly (Claude Code, Claude Desktop, or any SKILL.md-aware
  // harness) without installing the plugin. Registry skills resolve to this
  // repo; externally pinned skills resolve to the AUTHOR'S repo at the
  // pinned (immutable) commit - no source is copied into Sigistry.
  const external = skill.hosting === 'external';
  const rawBase = external
    ? `https://raw.githubusercontent.com/${skill.repo}/${skill.commit}/${skill.path}`
    : `${RAW_BASE}/${skill.path}`;
  let source = null;
  const now = Date.now();
  const cached = rawCache.get(target);
  if (cached && now - cached.fetchedAt < TTL_MS) {
    source = cached.text;
  } else {
    try {
      const res = await fetch(`${rawBase}/SKILL.md`);
      if (res.ok) {
        source = await res.text();
        rawCache.set(target, { text: source, fetchedAt: now });
      }
    } catch {
      /* source stays null; metadata is still useful */
    }
  }

  return {
    ...skillHit(skill),
    pluginCategory: skill.pluginCategory ?? null,
    verifiedDate: skill.verifiedDate ?? null,
    hosting: skill.hosting ?? 'registry',
    ...(external ? { repo: skill.repo, commit: skill.commit } : {}),
    sourceUrl: external
      ? `https://github.com/${skill.repo}/tree/${skill.commit}/${skill.path}`
      : `https://github.com/Sigistry/marketplace/tree/main/${skill.path}`,
    source,
  };
}

// ---------------------------------------------------------------------------
// REST facade helpers. The MCP tools above return LLM-sized slices (top 15/20)
// with a trimmed shape; these power the public /v1 REST API + OpenAPI spec:
// fuller records, real limit/offset pagination, and no internal fields.
// ---------------------------------------------------------------------------

const REST_DEFAULT_LIMIT = 50;
const REST_MAX_LIMIT = 200;

function clampLimit(v) {
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n) || n <= 0) return REST_DEFAULT_LIMIT;
  return Math.min(n, REST_MAX_LIMIT);
}

function toOffset(v) {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// A plugin as returned in list responses: the full transformed entry minus the
// internal searchableText field, plus a flat verification status string.
function publicPlugin(p, verified) {
  const { searchableText, ...rest } = p;
  return { ...rest, verificationStatus: verified?.plugins?.[p.id]?.status ?? 'unknown' };
}

export async function restListPlugins({ q, category, limit, offset } = {}) {
  const [plugins, verified] = await Promise.all([fetchCatalog(), fetchVerified()]);
  const query = q ? String(q).toLowerCase().trim() : '';
  const cat = category ? String(category).toLowerCase().trim() : '';
  let results = plugins;
  if (query) results = results.filter((p) => p.searchableText.includes(query));
  if (cat) results = results.filter((p) => (p.category || '').toLowerCase() === cat);
  const total = results.length;
  const lim = clampLimit(limit);
  const off = toOffset(offset);
  const page = results.slice(off, off + lim).map((p) => publicPlugin(p, verified));
  return { total, count: page.length, limit: lim, offset: off, plugins: page };
}

// Full plugin record for the detail endpoint (getPlugin already attaches the
// verification object); strip the internal searchableText field.
export async function restGetPlugin(id) {
  const plugin = await getPlugin(id);
  if (!plugin) return null;
  const { searchableText, ...rest } = plugin;
  return rest;
}

export async function restGetVerification(id) {
  const verified = await fetchVerified();
  const target = id ? String(id).toLowerCase().trim() : '';
  return verificationDetail(verified, target); // null when unknown
}

// ---------------------------------------------------------------------------
// MCP server scorecards (marketplace scorecards/scorecards.json, graded per
// RUBRIC.md). Powers list_scorecards / get_scorecard (MCP tools) and
// /v1/scorecards (REST): an agent about to connect to a third-party MCP server
// can check its independent Sigistry grade first.
// ---------------------------------------------------------------------------
const SCORECARDS_URL =
  'https://raw.githubusercontent.com/Sigistry/marketplace/main/scorecards/scorecards.json';
let cardCache = { data: null, fetchedAt: 0, lastGood: null };

async function fetchScorecards() {
  const now = Date.now();
  if (cardCache.data && now - cardCache.fetchedAt < TTL_MS) return cardCache.data;
  try {
    const res = await fetch(SCORECARDS_URL, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    cardCache = { data, fetchedAt: now, lastGood: data };
    return data;
  } catch {
    if (cardCache.lastGood) {
      cardCache.fetchedAt = now;
      return cardCache.lastGood;
    }
    return null;
  }
}

export async function listScorecards() {
  const data = await fetchScorecards();
  const servers = data?.servers ?? {};
  const scorecards = Object.entries(servers).map(([id, s]) => ({
    id,
    name: s.name,
    grade: s.grade,
    repo: s.repo ?? null,
    commit: s.commit ?? null,
    endpoint: s.endpoint ?? null,
    date: s.date ?? null,
    selfAssessment: !!s.selfAssessment,
  }));
  return {
    rubricVersion: data?.rubricVersion ?? null,
    rubricUrl: data?.rubricUrl ?? null,
    total: scorecards.length,
    scorecards,
  };
}

export async function getScorecard(id) {
  const data = await fetchScorecards();
  const target = id ? String(id).toLowerCase().trim() : '';
  const s = data?.servers?.[target];
  if (!s) return null;
  return { id: target, rubricVersion: data.rubricVersion, rubricUrl: data.rubricUrl, ...s };
}

export async function restListSkills({ q, plugin, limit, offset } = {}) {
  const idx = await fetchSkillsIndex();
  const skills = idx?.skills ?? [];
  const query = q ? String(q).toLowerCase().trim() : '';
  const p = plugin ? String(plugin).toLowerCase().trim() : '';
  let results = skills;
  if (query) {
    results = results.filter(
      (s) =>
        s.name.toLowerCase().includes(query) ||
        (s.description || '').toLowerCase().includes(query)
    );
  }
  if (p) results = results.filter((s) => s.plugin.toLowerCase() === p);
  const total = results.length;
  const lim = clampLimit(limit);
  const off = toOffset(offset);
  const page = results.slice(off, off + lim).map(skillHit);
  return { total, count: page.length, limit: lim, offset: off, skills: page };
}
