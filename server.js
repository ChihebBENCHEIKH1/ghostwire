"use strict";

/**
 * server.js — Visual API Builder — SaaS Observability Platform v6.0
 *
 * New: JWT auth, hardware telemetry, real CPU spike, node alert system,
 *      filtered hits API, top-failing nodes endpoint
 */

require("dotenv").config();

const express = require("express");
const http    = require("http");
const os      = require("os");
const crypto  = require("crypto");
const { Server }     = require("socket.io");
const cors           = require("cors");
const jwt            = require("jsonwebtoken");
const bcrypt         = require("bcryptjs");
const { v4: uuidv4 } = require("uuid");
const yaml           = require("js-yaml");
const { stmts }      = require("./server/db");
const { enqueue, getStats } = require("./server/queue");
const { runProvision } = require("./server/provisioner");

const PORT        = parseInt(process.env.PORT       ?? "3001", 10);
const ORIGINS     = (process.env.FRONTEND_ORIGIN ?? "http://localhost:3000").split(",").map(o => o.trim());
const VALID_KEYS  = new Set((process.env.API_KEYS   ?? "sk-dev-1234").split(",").map(k => k.trim()));
const JWT_SECRET  = process.env.JWT_SECRET          ?? "dev-secret-change-in-production";
const SALT_ROUNDS = 10;

// ── Express + Socket.io ───────────────────────────────────────────────────────
const app = express();
app.use(cors({ origin: ORIGINS, methods: ["GET", "POST", "PUT", "DELETE"] }));
app.use(express.json({ limit: "2mb" }));

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: { origin: ORIGINS, methods: ["GET", "POST"] },
  transports: ["websocket", "polling"],
});

// ── Socket.io JWT middleware ──────────────────────────────────────────────────
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error("Authentication required"));
  try {
    const payload    = jwt.verify(token, JWT_SECRET);
    socket.userId    = payload.userId;
    socket.username  = payload.username;
    next();
  } catch {
    next(new Error("Invalid or expired token"));
  }
});

io.on("connection", (socket) => {
  console.log(`[io] + connected  user=${socket.username}  id=${socket.id}  total=${io.engine.clientsCount}`);
  io.emit("clients_update", { count: io.engine.clientsCount });
  socket.on("disconnect", () => {
    io.emit("clients_update", { count: io.engine.clientsCount });
  });
});

// ── JWT helpers ───────────────────────────────────────────────────────────────
function signToken(user) {
  return jwt.sign(
    { userId: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: "24h" },
  );
}

function requireJwt(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authorization header required" });
  }
  try {
    req.user = jwt.verify(auth.slice(7), JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

function requireApiKey(req, res, next) {
  const key = req.headers["x-api-key"];
  if (!key || !VALID_KEYS.has(key)) {
    emitLog("warn", `Rejected — invalid x-api-key`);
    return res.status(401).json({ error: "Unauthorized", hint: "Set x-api-key header." });
  }
  req.apiKeyId = `***${key.slice(-4)}`;
  next();
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function emitLog(level, text) {
  process.stdout.write(`[${level.padEnd(7).toUpperCase()}] ${text}\n`);
  io.emit("pipeline_log", { ts: new Date().toISOString(), level, text });
}

// ── Hardware Telemetry ────────────────────────────────────────────────────────
let prevCpuInfo = os.cpus();

function getCpuPercent() {
  const cpus = os.cpus();
  let totalIdle = 0, totalTick = 0;
  cpus.forEach((cpu, i) => {
    const prev = prevCpuInfo[i] ?? cpu;
    for (const type of Object.keys(cpu.times)) {
      totalTick += (cpu.times[type] ?? 0) - (prev.times[type] ?? 0);
    }
    totalIdle += (cpu.times.idle ?? 0) - (prev.times.idle ?? 0);
  });
  prevCpuInfo = cpus;
  if (totalTick === 0) return 0;
  return Math.max(0, Math.min(100, Math.round(100 - (100 * totalIdle / totalTick))));
}

const hwHistory = { cpu: [], ram: [] };
const MAX_HW_SAMPLES = 60;

setInterval(() => {
  const cpuPct  = getCpuPercent();
  const total   = os.totalmem();
  const free    = os.freemem();
  const usedPct = Math.round(((total - free) / total) * 100);

  hwHistory.cpu.push(cpuPct);
  hwHistory.ram.push(usedPct);
  if (hwHistory.cpu.length > MAX_HW_SAMPLES) hwHistory.cpu.shift();
  if (hwHistory.ram.length > MAX_HW_SAMPLES) hwHistory.ram.shift();

  io.emit("hw_telemetry", { cpuPct, usedPct, totalMem: total, freeMem: free, ts: Date.now() });
}, 1000);

// ── Real CPU spike (crypto chunks — yields event loop every 8ms) ──────────────
function cpuBurnAsync(ms) {
  return new Promise(resolve => {
    const end = Date.now() + ms;
    function tick() {
      const slice = Date.now() + 8;
      while (Date.now() < slice) {
        crypto.createHash("sha256").update(Math.random().toString(36)).digest("hex");
      }
      if (Date.now() < end) setImmediate(tick);
      else resolve();
    }
    setImmediate(tick);
  });
}

// ── Alert tracking ────────────────────────────────────────────────────────────
const consecutiveFailures = {};

// ── Ollama integration ────────────────────────────────────────────────────────
const OLLAMA_URL   = process.env.OLLAMA_URL   ?? "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "deepseek-r1:1.5b";

async function ollamaGenerate(prompt, stream = false) {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ model: OLLAMA_MODEL, prompt, stream }),
    });
    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}: ${await res.text()}`);
    if (stream) return res;
    const data = await res.json();
    return data.response ?? "";
  } catch (err) {
    if (err.cause?.code === "ECONNREFUSED" || err.message?.includes("fetch failed")) {
      throw new Error("AI service unavailable — Ollama is not running");
    }
    throw err;
  }
}

// ── Node processing ───────────────────────────────────────────────────────────
const BASE_DURATION = {
  webhook: 80, "ai-parser": 700, postgres: 520, redis: 70, filter: 90, "local-llm": 0,
};
function nodeDuration(type) {
  const base = BASE_DURATION[type] ?? 300;
  return base + Math.floor(Math.random() * base * 0.4);
}

const DEFAULT_GRAPH = {
  nodes: [
    { id: "webhook-1",   type: "webhook",   label: "Webhook Trigger" },
    { id: "ai-parser-1", type: "ai-parser", label: "AI Parser"       },
    { id: "postgres-1",  type: "postgres",  label: "Postgres DB"     },
  ],
  edges: [
    { id: "e-1", source: "webhook-1",   target: "ai-parser-1" },
    { id: "e-2", source: "ai-parser-1", target: "postgres-1"  },
  ],
};

// ── Dynamic Graph Traversal ───────────────────────────────────────────────────
async function traverseGraph(graph, hitId, rawPayload, isStress) {
  const t0 = Date.now();
  // Mutable payload — local-llm nodes can append their insight
  const currentPayload = { ...rawPayload };
  const children = {}, edgeMap = {}, inDegree = {};

  for (const n of graph.nodes) { children[n.id] = []; inDegree[n.id] = 0; }
  for (const e of graph.edges) {
    (children[e.source] = children[e.source] ?? []).push(e.target);
    inDegree[e.target] = (inDegree[e.target] ?? 0) + 1;
    edgeMap[`${e.source}->${e.target}`] = e.id;
  }

  const entryNodes = graph.nodes.filter(n => (inDegree[n.id] ?? 0) === 0 || n.type === "webhook");
  const visited = new Set();

  async function processNode(nodeId, attempt) {
    attempt = attempt ?? 0;
    if (visited.has(nodeId) && attempt === 0) return;
    if (attempt === 0) visited.add(nodeId);

    const node      = graph.nodes.find(n => n.id === nodeId);
    const nodeType  = node ? node.type  : "webhook";
    const nodeLabel = node ? node.label : nodeType;

    // Merge schema inspector config with DB-persisted config (DB takes precedence so
    // live Inspector edits take effect without redeployment)
    const schemaInsp = (node && node.inspector) ? node.inspector : {};
    const dbCfgRow   = stmts.getConfig.get(nodeId);
    const dbInsp     = dbCfgRow ? JSON.parse(dbCfgRow.config) : {};
    const insp       = { ...schemaInsp, ...dbInsp };

    const timeoutMs      = Number(insp.timeoutMs      ?? insp.timeout_ms     ?? 10000);
    const maxRetries     = Number(insp.maxRetries     ?? insp.max_retries    ?? 0);
    const backoff        = String(insp.backoff        ?? "none");
    const mockErrorRate  = Number(insp.mockErrorRate  ?? insp.mock_error_rate ?? 0);
    const alertThreshold = Number(insp.alertThreshold ?? 0);

    io.emit("node_start", { nodeId, hitId, display: nodeLabel + ": processing..." });

    // ── Local LLM node: call Ollama ───────────────────────────────────────────
    if (nodeType === "local-llm") {
      const systemPrompt = insp.systemPrompt ?? "Analyze this payload and provide a brief insight";
      const prompt = `${systemPrompt}:\n${JSON.stringify(currentPayload, null, 2)}`;
      io.emit("node_start", { nodeId, hitId, display: nodeLabel + ": calling Ollama..." });
      try {
        const insight = await ollamaGenerate(prompt);
        currentPayload._ai_insight = insight.trim();
        emitLog("info", `LLM node ${nodeId} generated insight (${insight.length} chars)`);
      } catch (err) {
        emitLog("warn", `LLM node ${nodeId}: Ollama unavailable — ${err.message}`);
        currentPayload._ai_insight = null;
      }
    }

    const duration = Math.min(nodeType === "local-llm" ? 0 : nodeDuration(nodeType), timeoutMs);
    if (isStress && duration > 0) {
      await Promise.all([sleep(duration), cpuBurnAsync(duration)]);
    } else if (duration > 0) {
      await sleep(duration);
    }

    // Mock failure
    const didFail = mockErrorRate > 0 && Math.random() * 100 < mockErrorRate;
    if (didFail) {
      if (attempt < maxRetries) {
        const delay = backoff === "exponential" ? Math.pow(2, attempt + 1) * 200
                    : backoff === "linear"      ? (attempt + 1) * 300
                    : 100;
        emitLog("warn", "Node " + nodeId + " failed — retry " + (attempt + 1) + "/" + maxRetries);
        await sleep(delay);
        return processNode(nodeId, attempt + 1);
      }
      // Track consecutive failures
      consecutiveFailures[nodeId] = (consecutiveFailures[nodeId] ?? 0) + 1;
      if (alertThreshold > 0 && consecutiveFailures[nodeId] >= alertThreshold) {
        io.emit("alert_trigger", {
          nodeId, nodeLabel,
          count: consecutiveFailures[nodeId],
          threshold: alertThreshold,
          ts: new Date().toISOString(),
        });
        emitLog("warn", "ALERT: Node " + nodeId + " failed " + consecutiveFailures[nodeId] + "x (threshold=" + alertThreshold + ")");
        void startAutoSRE(nodeId, nodeLabel, consecutiveFailures[nodeId], hitId);
      }
      io.emit("node_error", { nodeId, hitId, error: "Mock failure (" + mockErrorRate + "% error rate)" });
      return;
    }

    // Success — reset failure streak
    consecutiveFailures[nodeId] = 0;

    const childIds = children[nodeId] ?? [];
    const edgeIds  = childIds.map(c => edgeMap[nodeId + "->" + c]).filter(Boolean);

    io.emit("node_complete", {
      nodeId, hitId, latencyMs: duration, edgeIds,
      display: nodeLabel + ": done in " + duration + "ms",
    });

    await Promise.all(childIds.map(c => processNode(c, 0)));
  }

  try {
    await Promise.all(entryNodes.map(n => processNode(n.id, 0)));
  } catch (err) {
    emitLog("error", "Graph traversal error  hitId=" + hitId + "  " + err.message);
  }

  return Date.now() - t0;
}

// ── Auto-SRE Agent ────────────────────────────────────────────────────────────
const sreActive      = new Set();   // nodes currently being remediated
const sreCooldown    = new Map();   // nodeId → cooldown-expiry timestamp (60 s)
const SRE_COOLDOWN_MS = 60_000;

async function startAutoSRE(nodeId, nodeLabel, failureCount, lastHitId) {
  // Don't re-trigger while already running or in cooldown
  if (sreActive.has(nodeId)) return;
  if ((sreCooldown.get(nodeId) ?? 0) > Date.now()) return;

  sreActive.add(nodeId);
  const agentStep = (type, text) => {
    io.emit("agent_step", { type, text, ts: new Date().toISOString() });
    emitLog("info", "[SRE] " + type + ": " + text);
  };

  io.emit("agent_start", { nodeId, nodeLabel });
  agentStep("AWAKE",    `Auto-SRE triggered for "${nodeLabel}" — ${failureCount} consecutive failure(s)`);
  agentStep("THINKING", "Consulting Ollama for root cause analysis and remediation plan...");

  const cfgRow = stmts.getConfig.get(nodeId);
  const currentConfig = cfgRow ? JSON.parse(cfgRow.config) : {};

  const prompt =
    `You are an Auto-SRE agent. A pipeline node has failed repeatedly.\n` +
    `Node ID: ${nodeId}\nNode Label: ${nodeLabel}\nFailure count: ${failureCount}\n` +
    `Current inspector config: ${JSON.stringify(currentConfig, null, 2)}\n\n` +
    `Diagnose the problem and decide if the mockErrorRate or alertThreshold should be adjusted.\n` +
    `Respond with ONLY valid JSON — no text outside the JSON object:\n` +
    `{"thought":"<brief diagnosis>","action":"patch_node_config","args":{"configKey":"mockErrorRate","newValue":0}}\n` +
    `OR\n{"thought":"<brief diagnosis>","action":"skip_patch"}`;

  let thought = "";
  let parsed  = null;
  try {
    const raw = await ollamaGenerate(prompt, false);
    // deepseek-r1 wraps reasoning in <think>…</think> — strip it first
    const stripped = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    // Greedy match: grab the outermost { … } block
    const jsonMatch = stripped.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[0]);
        thought = parsed.thought ?? stripped.slice(0, 200).replace(/\n/g, " ");
      } catch {
        // JSON was still malformed — use plain text as thought
        thought = stripped.slice(0, 200).replace(/\n/g, " ");
      }
    } else {
      thought = stripped.slice(0, 200).replace(/\n/g, " ");
    }
  } catch (err) {
    thought = "LLM unavailable (" + err.message + ") — falling back to replay only.";
  }

  agentStep("THOUGHT", thought || "No diagnosis from LLM; proceeding with default remediation.");

  if (parsed?.action === "patch_node_config" && parsed.args?.configKey !== undefined) {
    const { configKey, newValue } = parsed.args;
    const updated = { ...currentConfig, [configKey]: newValue };
    const now = new Date().toISOString();
    stmts.upsertConfig.run(nodeId, JSON.stringify(updated), now);
    io.emit("node_config_updated", { nodeId, config: updated, updatedAt: now });
    agentStep("ACTION",      `patch_node_config("${nodeId}", "${configKey}", ${JSON.stringify(newValue)})`);
    agentStep("OBSERVATION", `Node config updated — ${configKey} is now ${JSON.stringify(newValue)}`);
  } else {
    agentStep("ACTION", "skip_patch — no config change warranted");
  }

  // Replay the triggering hit (or the most recent one)
  const hitRow = lastHitId ? stmts.getHit.get(lastHitId) : null;
  if (hitRow) {
    agentStep("ACTION",      `replay_pipeline(hitId=${hitRow.id})`);
    const payload = JSON.parse(hitRow.payload);
    enqueue(processPipeline, { payload, apiKeyId: hitRow.api_key_id, isReplay: true });
    agentStep("OBSERVATION", `Pipeline replay enqueued for hit #${hitRow.id}`);
  } else {
    agentStep("OBSERVATION", "No hit available to replay.");
  }

  agentStep("RESOLUTION", `Remediation complete — "${nodeLabel}" patched and pipeline replayed.`);
  io.emit("agent_done", { nodeId, nodeLabel, resolution: `"${nodeLabel}" remediated by Auto-SRE.` });

  // Release lock and start 60 s cooldown so the agent doesn't re-trigger on the replay
  sreActive.delete(nodeId);
  sreCooldown.set(nodeId, Date.now() + SRE_COOLDOWN_MS);
  setTimeout(() => sreCooldown.delete(nodeId), SRE_COOLDOWN_MS);
}

// ── Pipeline Processor ────────────────────────────────────────────────────────
async function processPipeline({ payload, apiKeyId, isReplay, isStress }) {
  const graph = payload._graph && typeof payload._graph === "object"
    ? payload._graph : DEFAULT_GRAPH;
  const cleanPayload = Object.fromEntries(Object.entries(payload).filter(([k]) => k !== "_graph"));

  const rowId = stmts.insertHit.run(
    new Date().toISOString(),
    cleanPayload.event ?? null,
    JSON.stringify(cleanPayload),
    apiKeyId ?? null,
    isReplay ? 1 : 0,
  ).lastInsertRowid;

  emitLog("info", "Job #" + rowId + (isReplay ? " [REPLAY]" : "") + "  event=\"" + (cleanPayload.event ?? "hit") + "\"  nodes=" + (graph.nodes ? graph.nodes.length : "?"));

  const totalLatencyMs = await traverseGraph(graph, rowId, cleanPayload, !!isStress);

  stmts.updateHit.run("success", totalLatencyMs, rowId);
  emitLog("success", "Job #" + rowId + " complete  total=" + totalLatencyMs + "ms");
  io.emit("pipeline_complete", { hitId: rowId, totalLatencyMs, isReplay: !!isReplay });
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH ROUTES (public)
// ═══════════════════════════════════════════════════════════════════════════════

app.post("/api/auth/register", async (req, res) => {
  const { username, password } = req.body ?? {};
  if (!username || !password) return res.status(400).json({ error: "username and password required" });
  if (username.length < 3)    return res.status(400).json({ error: "username must be >=3 chars" });
  if (password.length < 6)    return res.status(400).json({ error: "password must be >=6 chars" });

  const existing = stmts.findUserByUsername.get(username);
  if (existing) return res.status(409).json({ error: "Username already taken" });

  const hash   = await bcrypt.hash(password, SALT_ROUNDS);
  const result = stmts.createUser.run(username, hash, new Date().toISOString());
  const user   = { id: result.lastInsertRowid, username, role: "user" };
  const token  = signToken(user);

  emitLog("info", "New user registered: " + username);
  res.status(201).json({ token, user: { id: user.id, username, role: "user" } });
});

app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body ?? {};
  if (!username || !password) return res.status(400).json({ error: "username and password required" });

  const row = stmts.findUserByUsername.get(username);
  if (!row) return res.status(401).json({ error: "Invalid credentials" });

  const match = await bcrypt.compare(password, row.password_hash);
  if (!match)  return res.status(401).json({ error: "Invalid credentials" });

  const token = signToken(row);
  emitLog("info", "User logged in: " + username);
  res.json({ token, user: { id: row.id, username: row.username, role: row.role } });
});

app.get("/api/auth/me", requireJwt, (req, res) => {
  const row = stmts.findUserById.get(req.user.userId);
  if (!row) return res.status(404).json({ error: "User not found" });
  res.json({ user: row });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PIPELINE ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

app.post("/api/webhook", requireApiKey, (req, res) => {
  const payload = req.body;
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    return res.status(400).json({ error: "Body must be a JSON object." });
  enqueue(processPipeline, { payload, apiKeyId: req.apiKeyId, isReplay: false });
  res.status(202).json({ accepted: true, queue: getStats() });
});

app.post("/api/stress-test", requireApiKey, (req, res) => {
  const count = Math.min(parseInt(req.body ? req.body.count ?? "50" : "50", 10), 100);
  const graph = (req.body && req.body.graph) ? req.body.graph : DEFAULT_GRAPH;

  res.json({ accepted: true, count });
  emitLog("warn", "Stress test started — " + count + " payloads (CPU burn enabled)");
  io.emit("stress_start", { total: count });

  let completed = 0;
  for (let i = 0; i < count; i++) {
    setTimeout(async () => {
      const payload = { event: "stress.test", index: i, batchId: uuidv4().slice(0, 8), ts: Date.now(), _graph: graph };
      try {
        await processPipeline({ payload, apiKeyId: req.apiKeyId, isReplay: false, isStress: true });
      } catch {}
      completed++;
      io.emit("stress_progress", { completed, total: count });
      if (completed === count) emitLog("success", "Stress test complete — " + count + " payloads");
    }, Math.random() * 2000);
  }
});

app.get("/api/hits", requireJwt, (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit  ?? "20"), 100);
  const page   = Math.max(parseInt(req.query.page   ?? "1"), 1);
  const offset = (page - 1) * limit;
  const status = req.query.status ?? null;
  const event  = req.query.event  ?? null;
  const since  = req.query.since  ?? null;

  const rows  = stmts.listHitsFiltered.all({ status, event, since, limit, offset });
  const total = stmts.countHitsFiltered.get({ status, event, since }).count;
  const hits  = rows.map(r => ({ ...r, payload: JSON.parse(r.payload), is_replay: r.is_replay === 1 }));
  res.json({ hits, total, page, limit, pages: Math.ceil(total / limit) });
});

app.post("/api/hits/:id/replay", requireJwt, (req, res) => {
  const row = stmts.getHit.get(parseInt(req.params.id, 10));
  if (!row) return res.status(404).json({ error: "Hit not found." });
  const payload = JSON.parse(row.payload);
  enqueue(processPipeline, { payload, apiKeyId: row.api_key_id, isReplay: true });
  res.json({ accepted: true, queue: getStats() });
});

app.get("/api/analytics", requireJwt, (_req, res) => {
  const row = stmts.analytics.get();
  res.json({
    totalHits:   row.total_hits   ?? 0,
    successRate: row.total_hits > 0 ? Math.round((row.success_count / row.total_hits) * 100) : 100,
    avgLatency:  Math.round(row.avg_latency ?? 0),
    activeConns: io.engine.clientsCount,
  });
});

app.get("/api/analytics/top-failing", requireJwt, (_req, res) => {
  const rows = stmts.topFailingNodes.all();
  res.json({ nodes: rows });
});

app.get("/api/analytics/hw-history", requireJwt, (_req, res) => {
  res.json({ cpu: hwHistory.cpu, ram: hwHistory.ram });
});

app.get("/api/nodes/:id/config", requireJwt, (req, res) => {
  const row = stmts.getConfig.get(req.params.id);
  if (!row) return res.json({ config: null, updatedAt: null });
  res.json({ config: JSON.parse(row.config), updatedAt: row.updated_at });
});

app.put("/api/nodes/:id/config", requireJwt, (req, res) => {
  const { config } = req.body;
  if (!config || typeof config !== "object")
    return res.status(400).json({ error: "Body must contain a config object." });
  const now = new Date().toISOString();
  stmts.upsertConfig.run(req.params.id, JSON.stringify(config), now);
  io.emit("node_config_updated", { nodeId: req.params.id, config, updatedAt: now });
  emitLog("info", "Node config updated  nodeId=" + req.params.id);
  res.json({ success: true, updatedAt: now });
});

app.get("/api/deployments/active", requireJwt, (_req, res) => {
  const deployed = stmts.getActiveDeployment.get();
  const row = deployed ?? stmts.getLatestDeployment.get();
  if (!row) return res.json({ deployment: null });
  res.json({ deployment: { id: row.id, status: row.status, deployedAt: row.deployed_at, createdAt: row.created_at, schema: JSON.parse(row.schema_json) } });
});

app.put("/api/deployments/draft", requireJwt, (req, res) => {
  const { schema } = req.body;
  if (!schema) return res.status(400).json({ error: "schema required" });
  const now = new Date().toISOString();
  const existing = stmts.getLatestDraft.get();
  if (existing) {
    stmts.updateDeploymentSchema.run(JSON.stringify(schema), now, existing.id);
    return res.json({ id: existing.id, status: "draft", updatedAt: now });
  }
  const result = stmts.insertDeployment.run("default", JSON.stringify(schema), "draft", now);
  res.json({ id: result.lastInsertRowid, status: "draft", createdAt: now });
});

app.post("/api/deployments/deploy", requireJwt, (req, res) => {
  const { schema } = req.body;
  if (!schema) return res.status(400).json({ error: "schema required" });
  const now = new Date().toISOString();
  stmts.archiveDeployed.run();
  const draft = stmts.getLatestDraft.get();
  let id;
  if (draft) {
    stmts.updateDeploymentSchema.run(JSON.stringify(schema), now, draft.id);
    stmts.promoteToDeployed.run(now, draft.id);
    id = draft.id;
  } else {
    const r = stmts.insertDeployment.run("default", JSON.stringify(schema), "deployed", now);
    id = r.lastInsertRowid;
    stmts.promoteToDeployed.run(now, id);
  }
  emitLog("success", "Pipeline deployed  id=" + id);
  io.emit("deployment_updated", { id, status: "deployed", deployedAt: now });
  res.json({ id, status: "deployed", deployedAt: now });

  // Fire-and-forget: provision real Docker infra from the DAG (skipped if Docker unavailable)
  runProvision(io, schema.nodes ?? []).catch(() => {});
});

// ── CLI Deploy ────────────────────────────────────────────────────────────────
app.post("/api/cli/deploy", requireJwt, (req, res) => {
  const { yaml: yamlStr } = req.body;
  if (!yamlStr) return res.status(400).json({ error: "yaml required" });

  let parsed;
  try {
    parsed = yaml.load(yamlStr);
  } catch (e) {
    return res.status(400).json({ error: "Invalid YAML: " + e.message });
  }

  if (!parsed || typeof parsed !== "object") {
    return res.status(400).json({ error: "YAML must be a mapping" });
  }

  const nodes = parsed.nodes ?? [];
  const edges = parsed.edges ?? [];

  if (!Array.isArray(nodes)) {
    return res.status(400).json({ error: "nodes must be an array" });
  }

  // Build the schema object the same way the frontend does
  const schema = { nodes, edges, inspectorConfigs: {}, state: "deployed" };

  // Apply any inline inspector configs from the YAML
  for (const node of nodes) {
    if (node.inspector && node.id) {
      schema.inspectorConfigs[node.id] = {
        timeoutMs:      Number(node.inspector.timeout_ms      ?? node.inspector.timeoutMs      ?? 10000),
        maxRetries:     Number(node.inspector.max_retries      ?? node.inspector.maxRetries      ?? 0),
        backoff:        String(node.inspector.backoff          ?? "none"),
        mockErrorRate:  Number(node.inspector.mock_error_rate  ?? node.inspector.mockErrorRate  ?? 0),
        alertThreshold: Number(node.inspector.alert_threshold  ?? node.inspector.alertThreshold ?? 0),
        systemPrompt:   node.inspector.system_prompt           ?? node.inspector.systemPrompt   ?? null,
      };
    }
  }

  const now = new Date().toISOString();
  stmts.archiveDeployed.run();
  const draft = stmts.getLatestDraft.get();
  let id;
  if (draft) {
    stmts.updateDeploymentSchema.run(JSON.stringify(schema), now, draft.id);
    stmts.promoteToDeployed.run(now, draft.id);
    id = draft.id;
  } else {
    const r = stmts.insertDeployment.run("default", JSON.stringify(schema), "deployed", now);
    id = r.lastInsertRowid;
    stmts.promoteToDeployed.run(now, id);
  }

  emitLog("success", `CLI deployment #${id} — ${nodes.length} node(s), ${edges.length} edge(s)`);

  // Broadcast to all connected browser clients so they hot-reload the canvas
  io.emit("cli_deployment_sync", { id, schema, deployedAt: now });

  // Fire-and-forget: provision real Docker infra from the DAG (skipped if Docker unavailable)
  runProvision(io, nodes).catch(() => {});

  res.json({ id, nodeCount: nodes.length, edgeCount: edges.length, deployedAt: now });
});

// ── AI Copilot ────────────────────────────────────────────────────────────────
app.post("/api/ai/chat", requireJwt, async (req, res) => {
  const { message, history } = req.body ?? {};
  if (!message) return res.status(400).json({ error: "message required" });

  const contextLines = (history ?? [])
    .slice(-10)
    .map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n");
  const prompt = contextLines
    ? `You are a helpful DevOps and AI assistant for a visual API pipeline builder platform.\n\n${contextLines}\nUser: ${message}\nAssistant:`
    : `You are a helpful DevOps and AI assistant for a visual API pipeline builder platform.\nUser: ${message}\nAssistant:`;

  res.setHeader("Content-Type",  "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection",    "keep-alive");
  res.flushHeaders();

  try {
    const ollamaRes = await ollamaGenerate(prompt, true);
    const reader  = ollamaRes.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const line of decoder.decode(value).split("\n").filter(Boolean)) {
        try {
          const chunk = JSON.parse(line);
          if (chunk.response) res.write(`data: ${JSON.stringify({ token: chunk.response })}\n\n`);
          if (chunk.done)     res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        } catch { /* skip */ }
      }
    }
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
  }
  res.end();
});

app.post("/api/ai/analyze", requireJwt, async (req, res) => {
  const { payload } = req.body ?? {};
  if (!payload) return res.status(400).json({ error: "payload required" });

  res.setHeader("Content-Type",  "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection",    "keep-alive");
  res.flushHeaders();

  const prompt =
    `You are a DevOps assistant. Explain why this webhook payload might have failed in one short sentence: ${JSON.stringify(payload)}`;

  try {
    const ollamaRes = await ollamaGenerate(prompt, true /* stream */);
    const reader  = ollamaRes.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const line of decoder.decode(value).split("\n").filter(Boolean)) {
        try {
          const chunk = JSON.parse(line);
          if (chunk.response) res.write(`data: ${JSON.stringify({ token: chunk.response })}\n\n`);
          if (chunk.done)     res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        } catch { /* skip malformed line */ }
      }
    }
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    emitLog("warn", `AI analyze error: ${err.message}`);
  }
  res.end();
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", clients: io.engine.clientsCount, uptime: Math.round(process.uptime()), ...getStats() });
});

// ── Start ─────────────────────────────────────────────────────────────────────
httpServer.listen(PORT, () => {
  const key = (process.env.API_KEYS ?? "sk-dev-1234").split(",")[0].trim();
  console.log("\n  Visual API Builder — SaaS Platform v6.0  ::" + PORT + "\n  API Key: " + key + "\n");
});
