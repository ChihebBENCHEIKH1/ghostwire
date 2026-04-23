# 🔮 Ghostwire — Live Visual API Builder

> A full-stack, real-time DevOps platform where you visually design API pipelines as node graphs, deploy them to production, provision real Docker infrastructure, and have an AI agent automatically diagnose and remediate failures — all observable live in a streaming terminal.

---

## Table of Contents

1. [What is Ghostwire?](#1-what-is-ghostwire)
2. [Architecture Overview](#2-architecture-overview)
3. [System Diagrams](#3-system-diagrams)
4. [Feature Deep-Dives](#4-feature-deep-dives)
5. [Technology Stack](#5-technology-stack)
6. [Project Structure](#6-project-structure)
7. [Database Schema](#7-database-schema)
8. [API Reference](#8-api-reference)
9. [WebSocket Event Catalogue](#9-websocket-event-catalogue)
10. [The ghostwire CLI](#10-the-ghostwire-cli)
11. [Challenges & How They Were Solved](#11-challenges--how-they-were-solved)
12. [Setup & Running](#12-setup--running)
13. [Environment Variables](#13-environment-variables)
14. [Deployment Lifecycle](#14-deployment-lifecycle)
15. [Production Deployment](#15-production-deployment)
16. [GitHub Actions CI/CD & Security Pipelines](#16-github-actions-cicd--security-pipelines)

---

## 1. What is Ghostwire?

Ghostwire is a **visual infrastructure orchestration platform** for developers and DevOps engineers. Instead of writing YAML files and guessing what your API pipeline looks like, you drag nodes onto a canvas, draw connections between them, and hit Deploy.

Under the hood it:

- **Executes real pipelines** — webhook payloads traverse the DAG node-by-node, with per-node timeouts, retries, backoff strategies, and mock chaos testing.
- **Provisions real Docker infrastructure** — deploying a canvas with a Postgres node spins up a real `postgres:15-alpine` container via Docker Compose.
- **Streams everything live** — every pipeline execution, every Docker pull log, every alert is streamed to the browser terminal via WebSocket in real time.
- **Heals itself with AI** — when a node breaches its alert threshold, an AI agent (ReAct loop via Ollama) wakes up, diagnoses the root cause, patches the node config, and replays the failed pipeline.
- **Exports to YAML and back** — every canvas state is round-trippable to/from YAML, and can be pushed from the terminal with `ghostwire deploy ./pipeline.yaml`.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         BROWSER (Next.js 16)                        │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │
│  │ArchitectView │  │DashboardView │  │LogExplorerView│             │
│  │              │  │              │  │               │             │
│  │ ┌──────────┐ │  │ ┌──────────┐ │  │ ┌───────────┐│             │
│  │ │  Canvas  │ │  │ │Analytics │ │  │ │ Hit Table ││             │
│  │ │ (XYFlow) │ │  │ │ + Charts │ │  │ │ + Replay  ││             │
│  │ └──────────┘ │  │ └──────────┘ │  │ └───────────┘│             │
│  │ ┌──────────┐ │  │ ┌──────────┐ │  └──────────────┘             │
│  │ │ LiveTerm-│ │  │ │HW Teleme-│ │                               │
│  │ │  inal    │ │  │ │  try     │ │                               │
│  │ └──────────┘ │  │ └──────────┘ │                               │
│  │ ┌──────────┐ │  └──────────────┘                               │
│  │ │AgentTerm-│ │                                                  │
│  │ │  inal    │ │   ┌──────────────────────────────┐              │
│  │ └──────────┘ │   │       Zustand Stores          │              │
│  └──────────────┘   │  flowStore  │  infraStore     │              │
│                     │  authStore  │                 │              │
│  ┌───────────────────────────────────────────────┐ │              │
│  │         usePipelineSocket (Socket.io-client)   │ │              │
│  │  Handles 17 event types, feeds all stores      │ │              │
│  └───────────────────────────────────────────────┘ │              │
│                     └──────────────────────────────┘              │
└───────────────────────────────┬─────────────────────────────────────┘
                                │  WebSocket (JWT auth)
                                │  REST (Bearer token / API key)
┌───────────────────────────────▼─────────────────────────────────────┐
│                    BACKEND (Node.js / Express 5)                     │
│                                                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────────┐ │
│  │ Auth Routes │  │ Pipeline    │  │  Infrastructure Provisioner  │ │
│  │ /api/auth/  │  │   Routes    │  │  server/provisioner.js       │ │
│  │ JWT + bcrypt│  │/api/webhook │  │                              │ │
│  └─────────────┘  │/api/hits    │  │  DAG → docker-compose.yml   │ │
│                   │/api/stress  │  │  spawn(docker compose up)    │ │
│  ┌─────────────┐  └─────────────┘  │  stream logs → WebSocket    │ │
│  │Deploy Routes│                   └─────────────────────────────┘ │
│  │/api/deploy  │  ┌─────────────┐                                  │
│  │/api/cli/dep │  │  AI Routes  │  ┌─────────────────────────────┐ │
│  └─────────────┘  │/api/ai/chat │  │    Auto-SRE Agent           │ │
│                   │/api/ai/anal │  │    startAutoSRE()            │ │
│  ┌─────────────┐  └─────────────┘  │    ReAct loop via Ollama    │ │
│  │  Job Queue  │                   │    sreActive + sreCooldown   │ │
│  │  MAX=1 FIFO │  ┌─────────────┐  └─────────────────────────────┘ │
│  │  server/    │  │  HW Teleme- │                                  │
│  │  queue.js   │  │  try (1s)   │  ┌─────────────────────────────┐ │
│  └─────────────┘  └─────────────┘  │      Socket.io Server        │ │
│                                    │  JWT middleware on connect   │ │
│  ┌──────────────────────────────┐  │  io.emit() to all clients   │ │
│  │   SQLite (better-sqlite3)    │  └─────────────────────────────┘ │
│  │ hits │ deployments │ users   │                                  │
│  │ node_configs                 │                                  │
│  └──────────────────────────────┘                                  │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                │  child_process.spawn
┌───────────────────────────────▼─────────────────────────────────────┐
│                        DOCKER ENGINE                                 │
│                                                                     │
│  .ghostwire-stack/docker-compose.yml  (auto-generated)              │
│  .ghostwire-stack/nginx.conf          (auto-generated if needed)    │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │
│  │postgres:15-  │  │ redis:alpine │  │ nginx:alpine │             │
│  │   alpine     │  │              │  │ → port 8080  │             │
│  │  port 5432   │  │  port 6379   │  │ reverse proxy│             │
│  └──────────────┘  └──────────────┘  └──────────────┘             │
└─────────────────────────────────────────────────────────────────────┘

             ┌─────────────────────────┐
             │   ghostwire CLI (ESM)   │
             │   cli/index.js          │
             │                         │
             │   ghostwire login       │
             │   ghostwire deploy *.yml│
             │   ghostwire status      │
             │   ghostwire analytics   │
             │   ghostwire nodes       │
             └────────────┬────────────┘
                          │ REST (JWT)
                          ▼
                     Backend API
```

---

## 3. System Diagrams

### 3.1 — Pipeline Execution Flow (DAG Traversal)

```
POST /api/webhook
      │
      ▼
 requireApiKey
      │
      ▼
 enqueue(processPipeline, job)   ◄── FIFO queue, MAX_CONCURRENT = 1
      │
      ▼
 INSERT hit (status='processing')
      │
      ▼
 Load active deployment schema from SQLite
      │
      ▼
 traverseGraph(graph, hitId, payload)
      │
      │   For each node in topological order:
      │   ┌─────────────────────────────────────────────┐
      │   │ 1. Merge inspector config (schema + DB)      │
      │   │ 2. emit node_start → frontend               │
      │   │ 3. Simulate work (sleep by node type)       │
      │   │ 4. Apply mockErrorRate (chaos testing)       │
      │   │ 5. On error: retry with backoff             │
      │   │ 6. Track consecutive failures               │
      │   │ 7. emit node_complete / node_error          │
      │   │ 8. Check alertThreshold → fire alert?       │
      │   └─────────────────────────────────────────────┘
      │
      ▼
 UPDATE hit (status='success'|'error', latency_ms)
      │
      ▼
 emit pipeline_complete → frontend
```

### 3.2 — Deployment Lifecycle

```
         ┌─────────────────────────────────────────────┐
         │              Canvas (Browser)                │
         │                                             │
         │  Drag nodes → Connect edges → Edit YAML     │
         │                    │                        │
         │            [Save Draft]                     │
         │                    │                        │
         │         PUT /api/deployments/draft          │
         │         ┌──────────────────────┐            │
         │         │  deployments table   │            │
         │         │  status = 'draft'    │            │
         │         └──────────────────────┘            │
         │                    │                        │
         │             [Deploy Button]                  │
         │                    │                        │
         └────────────────────┼────────────────────────┘
                              │
                   POST /api/deployments/deploy
                              │
                   ┌──────────▼──────────┐
                   │ archiveDeployed()   │  ← old 'deployed' → 'archived'
                   │ promoteToDeployed() │  ← draft → 'deployed'
                   └──────────┬──────────┘
                              │
               ┌──────────────┼──────────────────┐
               ▼              ▼                  ▼
      emit                canvas             runProvision()
      deployment_updated  hot-reload         fire & forget
                          (if CLI)
                                             │
                                    spawn(docker compose
                                      up -d --remove-orphans)
                                             │
                                    emit docker_provision_log
                                    per stdout/stderr line
                                             │
                                    LiveTerminal streams
                                    Docker pull logs live
```

### 3.3 — Auto-SRE Agent ReAct Loop

```
  Node fails consecutively N times (N = alertThreshold)
               │
               ▼
  ┌────────────────────────┐
  │  alert_trigger emitted │
  │  to all WS clients     │
  └────────────┬───────────┘
               │
  sreActive.has(nodeId)?  ── YES ──► skip (already running)
               │ NO
  sreCooldown > now?      ── YES ──► skip (60s cooldown)
               │ NO
               ▼
  ┌────────────────────────────────────────────────┐
  │              startAutoSRE()                    │
  │                                                │
  │  emit AWAKE  → "Auto-SRE triggered for X"      │
  │                                                │
  │  Build prompt:                                 │
  │    node type, failure count,                   │
  │    available actions:                          │
  │      patch_node_config | skip_patch            │
  │                                                │
  │  emit THINKING → "Consulting Ollama..."        │
  │                                                │
  │  POST http://localhost:11434/api/generate      │
  │  model: deepseek-r1:1.5b                       │
  │                                                │
  │  Strip <think>...</think> tags                 │
  │  Greedy JSON extract: /\{[\s\S]*\}/            │
  │                                                │
  │  emit THOUGHT  → LLM's reasoning text          │
  │                                                │
  │  Parse action:                                 │
  │  ┌──────────────────────────────────────────┐  │
  │  │ patch_node_config?                       │  │
  │  │   PUT /api/nodes/:id/config              │  │
  │  │   emit ACTION + OBSERVATION              │  │
  │  │                                          │  │
  │  │ skip_patch?                              │  │
  │  │   emit ACTION (log reason)               │  │
  │  └──────────────────────────────────────────┘  │
  │                                                │
  │  POST /api/hits/:id/replay                     │
  │  emit ACTION + OBSERVATION (replay)            │
  │                                                │
  │  emit RESOLUTION → "Remediation complete"      │
  │  emit agent_done                               │
  │                                                │
  │  sreActive.delete(nodeId)                      │
  │  sreCooldown.set(nodeId, now + 60_000)         │
  └────────────────────────────────────────────────┘
               │
  AgentTerminal auto-closes after 4 seconds
```

### 3.4 — Real-Time WebSocket Event Flow

```
  Backend (server.js)                  Browser (usePipelineSocket.ts)
  ───────────────────                  ──────────────────────────────

  node_start           ────────────►  activateNode()  → canvas pulse
  node_complete        ────────────►  completeNode()  → edge glow + latency
  node_error           ────────────►  failNode()      → red border
  pipeline_complete    ────────────►  playChime() + refresh analytics
  pipeline_log         ────────────►  addLog()        → LiveTerminal
  hw_telemetry         ────────────►  pushHwSample()  → CPU/RAM charts
  stress_start         ────────────►  setIsStressTesting(true)
  stress_progress      ────────────►  setStressProgress()
  alert_trigger        ────────────►  addAlert()      → NotificationBell
  node_config_updated  ────────────►  setNodeConfigLocal() → Inspector sync
  agent_start          ────────────►  startAgent()    → AgentTerminal opens
  agent_step           ────────────►  addAgentStep()  → terminal line
  agent_done           ────────────►  stopAgent()     → auto-close 4s
  cli_deployment_sync  ────────────►  setState()      → canvas hot-reload
  docker_provision_log ────────────►  addLog('docker')→ LiveTerminal (blue)
  deployment_updated   ────────────►  status indicator
  clients_update       ────────────►  setActiveConns()
```

### 3.5 — Inspector Config Merge Hierarchy

```
  Priority:  DB (highest)  >  Deployment Schema  >  Code Defaults (lowest)

  ┌─────────────────────────┐
  │  Code defaults           │  timeoutMs: 10000, maxRetries: 0,
  │  (fallback, server.js)   │  backoff: 'none', mockErrorRate: 0
  └────────────┬─────────────┘
               │ overridden by
  ┌────────────▼─────────────┐
  │  Deployment schema        │  Stored in deployments.schema_json
  │  node.inspector           │  Written on Save Draft / Deploy
  └────────────┬─────────────┘
               │ overridden by
  ┌────────────▼─────────────┐
  │  DB  node_configs  table  │  Written by Inspector → Apply Changes
  │  (live patching)          │  Written by Auto-SRE Agent patch action
  └──────────────────────────┘
```

### 3.6 — CLI Deploy → Canvas Hot-Reload

```
  Terminal                  Backend                   Browser
  ────────                  ───────                   ───────

  ghostwire deploy
  ./pipeline.yaml
       │
       │  POST /api/cli/deploy
       │  { yaml: "..." }
       ├─────────────────────►
                              yaml.load(yamlStr)
                              parse nodes / edges
                              extract inspectorConfigs
                              archiveDeployed()
                              promoteToDeployed()
                              │
                              ├──── io.emit('cli_deployment_sync') ──►
                              │                                       onCliDeploymentSync()
                              │                                       flowStore.setState({
                              │                                         nodes, edges,
                              │                                         inspectorConfigs,
                              │                                         deploymentState:'deployed'
                              │                                       })
                              │                                       Canvas re-renders instantly
                              │
                              └──── void runProvision(io, nodes)
                                    spawn docker compose up
                                    emit docker_provision_log ────────►
                                    per line                           LiveTerminal streams
                                                                       Docker logs (sky blue)
       │◄─────────────────────
  { id, nodeCount,
    edgeCount, deployedAt }
  Deployment summary printed
```

### 3.7 — Docker Provisioner: DAG Node → Container

```
  DAG Nodes                   Generated Service Block
  ─────────                   ───────────────────────

  ┌──────────┐
  │ postgres │ ──────────►   postgres-1:
  │  node    │                 image: postgres:15-alpine
  └──────────┘                 ports: ["5432:5432"]
                               volumes: [postgres_data:/var/lib/...]
                               healthcheck: pg_isready -U ghostwire

  ┌──────────┐
  │  redis   │ ──────────►   redis-1:
  │  node    │                 image: redis:alpine
  └──────────┘                 ports: ["6379:6379"]
                               volumes: [redis_data:/data]
                               healthcheck: redis-cli ping

  ┌──────────┐
  │  nginx   │ ──────────►   nginx-1:
  │  node    │                 image: nginx:alpine
  └──────────┘                 ports: ["8080:80"]
                               volumes: [./nginx.conf:/etc/nginx/...]

                               nginx.conf:
                               upstream ghostwire_backend {
                                 server host.docker.internal:3001;
                               }
                               proxy /api/ and /socket.io/

  webhook / ai-parser /         (skipped — no Docker service needed)
  filter / local-llm
```

---

## 4. Feature Deep-Dives

### 4.1 Visual Canvas

Built on **@xyflow/react** (React Flow v12). Every node is a `flowNode` type registered with React Flow. Connections between nodes are `particle` edges rendered by `ParticleEdge.tsx` — animated SVG paths with dashed gradient strokes and glowing pulses on active execution.

Node types and their visual representations:

| Palette Type | Icon | Color | Real Docker Service |
|---|---|---|---|
| `webhook` | Zap | Indigo `#6366f1` | — |
| `ai-parser` | Brain | Pink `#ec4899` | — |
| `postgres` | Database | Blue `#3b82f6` | `postgres:15-alpine` |
| `redis` | Layers | Amber `#f59e0b` | `redis:alpine` |
| `filter` | Filter | Green `#10b981` | — |
| `local-llm` | Bot | Purple `#a855f7` | — |
| `nginx` | Server | Cyan | `nginx:alpine` |

### 4.2 Inspector Panel

A per-node configuration sidebar with six controls:

| Field | Type | Range | Effect |
|---|---|---|---|
| Timeout (ms) | number | 100–60000 | Max execution time before timeout |
| Max Retries | number | 0–10 | Retry attempts on failure |
| Backoff Strategy | select | none / linear / exponential | Delay between retries |
| Mock Error Rate | range | 0–100% | Probability of simulated failure (chaos) |
| System Prompt | textarea | — | Ollama prompt for `local-llm` nodes only |
| Alert Threshold | number | 0–20 | Consecutive failures before SRE alert fires |

When **Apply Changes** is clicked, the config is written to:
1. In-memory Zustand store (instant UI feedback)
2. `node_configs` DB table via `PUT /api/nodes/:id/config` (persists across server restarts, wins over schema config at execution time)

### 4.3 YAML Round-Trip

Every canvas state serialises to a deterministic YAML format:

```yaml
version: '1.0'
state: deployed
nodes:
  - id: postgres-1
    type: postgres
    label: Store Data
    position:
      x: 350
      y: 100
    inspector:
      timeout_ms: 10000
      max_retries: 3
      backoff: exponential
      mock_error_rate: 0
      alert_threshold: 5
edges:
  - id: e1
    source: webhook-1
    target: postgres-1
```

`fromYaml()` validates node types against a whitelist, handles camelCase ↔ snake_case conversion, and produces typed `FlowNode[]` + `FlowEdge[]` arrays ready for React Flow.

### 4.4 Hardware Telemetry

The backend polls `os.cpus()` and `os.freemem()` every 1000ms and emits `hw_telemetry` to all connected clients. The frontend maintains a 60-sample rolling window in `infraStore.hwSamples` and renders live sparkline charts on the Dashboard view. The stress test additionally runs real CPU-burning code to produce genuine spikes.

### 4.5 AI Copilot

Two AI features powered by Ollama streaming:

- **Chat panel** — conversational assistant with message history context, streamed token-by-token via SSE
- **Payload analyzer** — single-shot analysis of a webhook payload explaining why it might have failed

Both use `text/event-stream` and the frontend parses `data: {"token":"..."}` lines to build the response progressively.

---

## 5. Technology Stack

### Backend
| Package | Version | Purpose |
|---|---|---|
| Node.js | ≥18 | Runtime |
| Express | ^5.2.1 | HTTP server |
| Socket.io | ^4.8.3 | WebSocket server |
| better-sqlite3 | ^12.6.2 | SQLite (sync, WAL mode) |
| jsonwebtoken | ^9.0.3 | JWT auth |
| bcryptjs | ^3.0.3 | Password hashing |
| js-yaml | ^4.1.1 | YAML parsing (CLI deploy endpoint) |
| uuid | ^9.0.1 | Hit ID generation |
| dotenv | ^17.3.1 | Environment config |

### Frontend
| Package | Version | Purpose |
|---|---|---|
| Next.js | 16.1.6 | App Router, React Server Components |
| React | 19.2.3 | UI framework |
| @xyflow/react | ^12.10.1 | Canvas / node graph |
| Framer Motion | ^12.35.2 | Animations, drag interactions |
| Zustand | ^5.0.11 | Client state management |
| Socket.io-client | ^4.8.3 | WebSocket client |
| Recharts | ^3.8.0 | Dashboard charts |
| @monaco-editor/react | ^4.7.0 | In-browser YAML editor |
| Lucide React | ^0.577.0 | Icon system |
| canvas-confetti | ^1.9.4 | Deploy success animation |

### CLI
| Package | Version | Purpose |
|---|---|---|
| commander | ^12.1.0 | Command routing |
| chalk | ^5.3.0 | Terminal colors |
| ora | ^8.0.1 | Spinners |
| inquirer | ^10.1.2 | Interactive prompts (masked password) |
| axios | ^1.7.2 | HTTP requests |
| js-yaml | ^4.1.0 | YAML dry-run validation |

### Infrastructure (Local)
| Tool | Purpose |
|---|---|
| Docker Engine / Docker Desktop | Container runtime for provisioned services |
| Ollama + deepseek-r1:1.5b | Local LLM inference (Auto-SRE + AI Copilot) |
| SQLite | Persistent storage — no external DB required |

### Infrastructure (Production — AWS)
| Tool | Purpose |
|---|---|
| Terraform | Infrastructure-as-code (AWS ECS, RDS, ElastiCache, ALB) |
| AWS ECS Fargate | Serverless container runtime for frontend + backend |
| AWS ECR | Private Docker image registry |
| AWS RDS PostgreSQL 16 | Managed relational DB (Multi-AZ in prod) |
| AWS ElastiCache Redis 7 | Managed Redis with TLS + auth token |
| AWS ALB | Application Load Balancer with path-based routing |
| AWS Secrets Manager | Encrypted secret storage (JWT secret, DB password, etc.) |
| AWS EFS | Elastic File System for SQLite persistence on ECS |
| NGINX 1.27 | TLS termination, rate limiting, WebSocket proxy |

---

## 6. Project Structure

```
The Live Visual API Builder/
│
├── server.js                    # Main backend (Express + Socket.io, ~750 lines)
│
├── server/
│   ├── db.js                    # SQLite schema + all prepared statements
│   ├── queue.js                 # Single-concurrency FIFO job queue
│   └── provisioner.js           # Docker Compose generator + executor
│
├── src/
│   ├── app/
│   │   ├── page.tsx             # Root — auth guard + view switcher
│   │   ├── layout.tsx           # HTML shell
│   │   └── globals.css          # Design system (~2400 lines)
│   │
│   ├── components/
│   │   ├── nodes/
│   │   │   ├── FlowNodeCard.tsx # Base node card (all palette types)
│   │   │   ├── WebhookNode.tsx  # Webhook-specific rendering
│   │   │   ├── DatabaseNode.tsx # Postgres / Redis node
│   │   │   └── TransformerNode.tsx # AI / Filter node
│   │   ├── edges/
│   │   │   └── ParticleEdge.tsx # Animated SVG connection line
│   │   ├── Canvas.tsx           # React Flow canvas
│   │   ├── TopBar.tsx           # Header: branding, deploy button
│   │   ├── Sidebar.tsx          # Node palette + user profile
│   │   ├── RightPanel.tsx       # Tabbed: YAML editor | Inspector
│   │   ├── YamlEditorPanel.tsx  # Monaco YAML editor
│   │   ├── InspectorPanel.tsx   # Per-node config form
│   │   ├── LiveTerminal.tsx     # Resizable streaming log terminal
│   │   ├── AgentTerminal.tsx    # Auto-SRE agent overlay
│   │   ├── AiChatPanel.tsx      # Streaming AI chat
│   │   ├── AiInsightModal.tsx   # Payload analysis modal
│   │   ├── AnalyticsBar.tsx     # RPS / p99 / error rate bar
│   │   ├── NotificationBell.tsx # Alert notifications dropdown
│   │   ├── DeploymentLogs.tsx   # Deployment history
│   │   ├── NodeConfigModal.tsx  # Quick config edit modal
│   │   ├── AuthScreen.tsx       # Login / register
│   │   ├── NavRail.tsx          # Left navigation rail
│   │   ├── Toast.tsx            # Notification toasts
│   │   └── SuccessExplosion.tsx # Confetti on deploy
│   │
│   ├── views/
│   │   ├── ArchitectView.tsx    # Canvas + terminal + agent overlay
│   │   ├── DashboardView.tsx    # Analytics + charts + hit feed
│   │   └── LogExplorerView.tsx  # Filterable hit log with replay
│   │
│   ├── hooks/
│   │   ├── usePipelineSocket.ts # All WebSocket event wiring (17 events)
│   │   └── useSounds.ts         # Web Audio API: ping, hum, chime
│   │
│   ├── store/
│   │   ├── flowStore.ts         # Canvas, deployment, logs, metrics
│   │   ├── infraStore.ts        # HW telemetry, alerts, agent steps
│   │   └── authStore.ts         # JWT token + user profile
│   │
│   ├── services/
│   │   └── api.ts               # Typed REST client
│   │
│   └── lib/
│       └── yaml-utils.ts        # toYaml() / fromYaml() / defaultInspector()
│
├── cli/
│   ├── index.js                 # ghostwire CLI (ESM, 6 commands)
│   └── package.json             # Separate ESM package with bin entry
│
├── .ghostwire-stack/            # Auto-generated on deploy (git-ignored)
│   ├── docker-compose.yml       # Generated from canvas DAG
│   └── nginx.conf               # Generated if nginx node present
│
├── nginx/
│   └── nginx.conf               # Production NGINX config (TLS, rate-limit, WebSocket)
│
├── terraform/                   # AWS infrastructure (Terraform)
│   ├── variables.tf             # 20+ input variables with validation
│   ├── main.tf                  # Provider, ECR, Secrets Manager, CloudWatch
│   ├── networking.tf            # VPC, subnets, NAT, ALB, security groups
│   ├── ecs.tf                   # ECS Fargate cluster, IAM, task defs, auto-scaling
│   ├── database.tf              # RDS PostgreSQL 16 + ElastiCache Redis 7
│   └── outputs.tf               # ALB DNS, ECR URLs, cluster/service names
│
├── infra/
│   └── postgres/
│       └── init.sql             # PostgreSQL schema + seed (Docker Compose)
│
├── .github/
│   └── workflows/
│       ├── ci.yml               # Lint + typecheck + SAST + Trivy + TF validate
│       ├── cd.yml               # OIDC → ECR push → ECS blue/green deploy
│       ├── security.yml         # DAST (ZAP) + Semgrep + Gitleaks + checkov
│       └── ai-agent.yml        # Claude code review + security triage + deploy watchdog
│
├── .zap/
│   └── rules.tsv                # ZAP scan rule overrides (suppress NGINX false positives)
│
├── Dockerfile                   # Multi-stage backend image (deps→prod-deps→runner)
├── Dockerfile.frontend          # Multi-stage frontend image (deps→builder→runner)
├── .dockerignore                # Build context exclusions
├── docker-compose.yml           # Full production stack (all 7 services)
├── docker-compose.dev.yml       # Dev overrides (hot-reload, host port exposure)
│
├── pipeline.db                  # SQLite database file
├── .env                         # Environment configuration
├── package.json                 # Root dependencies
├── next.config.ts               # Next.js (React Compiler + standalone output)
├── tsconfig.json                # TypeScript strict mode
└── CLAUDE.md                    # AI assistant context
```

---

## 7. Database Schema

```sql
-- Webhook execution records
CREATE TABLE hits (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  received_at TEXT    NOT NULL,          -- ISO timestamp
  event_name  TEXT,                      -- from payload.event field
  payload     TEXT    NOT NULL,          -- full JSON string
  status      TEXT    NOT NULL DEFAULT 'processing',  -- processing|success|error
  latency_ms  INTEGER,                   -- total pipeline duration
  api_key_id  TEXT,                      -- which API key triggered it
  is_replay   INTEGER NOT NULL DEFAULT 0 -- 1 = replayed hit
);

-- Live node configuration (patched by Inspector or Auto-SRE Agent)
CREATE TABLE node_configs (
  node_id    TEXT PRIMARY KEY,
  config     TEXT NOT NULL,  -- JSON: { timeoutMs, maxRetries, backoff, ... }
  updated_at TEXT NOT NULL
);

-- Pipeline deployment versions
CREATE TABLE deployments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL DEFAULT 'default',
  schema_json TEXT    NOT NULL,  -- full DAG: { nodes, edges, inspectorConfigs }
  status      TEXT    NOT NULL DEFAULT 'draft',  -- draft | deployed | archived
  deployed_at TEXT,
  created_at  TEXT    NOT NULL
);

-- User accounts
CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,  -- bcrypt, SALT_ROUNDS=10
  role          TEXT    NOT NULL DEFAULT 'user',
  created_at    TEXT    NOT NULL
);
```

---

## 8. API Reference

### Authentication (Public)

| Method | Path | Body | Response |
|---|---|---|---|
| `POST` | `/api/auth/register` | `{ username, password }` | `{ token, user }` |
| `POST` | `/api/auth/login` | `{ username, password }` | `{ token, user }` |
| `GET` | `/api/auth/me` | — | `{ user }` |

### Pipeline (API Key: `x-api-key` header)

| Method | Path | Body | Response |
|---|---|---|---|
| `POST` | `/api/webhook` | Any JSON | `{ accepted, queue }` |
| `POST` | `/api/stress-test` | `{ count, graph? }` | `{ accepted, count }` |

### Deployments (JWT required)

| Method | Path | Body | Response |
|---|---|---|---|
| `GET` | `/api/deployments/active` | — | `{ deployment }` |
| `PUT` | `/api/deployments/draft` | `{ schema }` | `{ id, status }` |
| `POST` | `/api/deployments/deploy` | `{ schema }` | `{ id, status, deployedAt }` |
| `POST` | `/api/cli/deploy` | `{ yaml }` | `{ id, nodeCount, edgeCount, deployedAt }` |

### Analytics & Hits (JWT required)

| Method | Path | Query | Response |
|---|---|---|---|
| `GET` | `/api/hits` | `limit, page, status, event, since` | `{ hits, total, page, pages }` |
| `POST` | `/api/hits/:id/replay` | — | `{ accepted }` |
| `GET` | `/api/analytics` | — | `{ totalHits, successRate, avgLatency, activeConns }` |
| `GET` | `/api/analytics/top-failing` | — | `{ nodes: [{ node_id, fail_count }] }` |
| `GET` | `/api/analytics/hw-history` | — | `{ cpu: number[], ram: number[] }` |

### Node Config (JWT required)

| Method | Path | Body | Response |
|---|---|---|---|
| `GET` | `/api/nodes/:id/config` | — | `{ config, updatedAt }` |
| `PUT` | `/api/nodes/:id/config` | `{ config }` | `{ success, updatedAt }` |

### AI Copilot (JWT required — SSE streaming)

| Method | Path | Body | Stream Format |
|---|---|---|---|
| `POST` | `/api/ai/chat` | `{ message, history }` | `data: {"token":"..."}` |
| `POST` | `/api/ai/analyze` | `{ payload }` | `data: {"token":"..."}` |

### System

| Method | Path | Response |
|---|---|---|
| `GET` | `/health` | `{ status, clients, uptime, queue }` |

---

## 9. WebSocket Event Catalogue

All connections require a valid JWT in `socket.handshake.auth.token`.

### Server → Client (17 events)

| Event | Payload Shape | Effect in Browser |
|---|---|---|
| `clients_update` | `{ count }` | Connection counter in TopBar |
| `pipeline_log` | `{ ts, level, text }` | LiveTerminal line |
| `node_start` | `{ nodeId, hitId, display? }` | Canvas node pulse animation |
| `node_complete` | `{ nodeId, hitId, latencyMs, edgeIds? }` | Edge glow + latency badge |
| `node_error` | `{ nodeId, hitId, error }` | Red node border |
| `pipeline_complete` | `{ hitId, totalLatencyMs }` | Chime + analytics refresh |
| `stress_start` | `{ total }` | Progress bar appears |
| `stress_progress` | `{ completed, total }` | Progress bar updates |
| `hw_telemetry` | `{ cpuPct, usedPct, totalMem, freeMem, ts }` | CPU/RAM sparklines |
| `alert_trigger` | `{ nodeId, nodeLabel, count, threshold, ts }` | NotificationBell badge |
| `node_config_updated` | `{ nodeId, config }` | Inspector panel live sync |
| `deployment_updated` | `{ id, status, deployedAt }` | Deployment status indicator |
| `agent_start` | `{ nodeId }` | AgentTerminal overlay opens |
| `agent_step` | `{ type, text, ts }` | Terminal line with step color |
| `agent_done` | — | AgentTerminal auto-closes in 4s |
| `cli_deployment_sync` | `{ id, schema, deployedAt }` | Full canvas hot-reload |
| `docker_provision_log` | `{ stream, text, ts }` | LiveTerminal (sky blue `⬡` icon) |

---

## 10. The ghostwire CLI

A standalone ESM Node.js package (`cli/`) that communicates with the backend over REST. Credentials are saved to `~/.ghostwire/config.json` (permissions 600).

### Installation

```bash
cd cli
npm install
npm link          # registers 'ghostwire' as a global command
```

### Commands

| Command | Description |
|---|---|
| `ghostwire login` | Prompt for username + masked password, save JWT |
| `ghostwire logout` | Clear saved credentials |
| `ghostwire whoami` | Show current user and role |
| `ghostwire deploy <file>` | Push YAML → deploy + provision Docker |
| `ghostwire deploy <file> --dry-run` | Validate YAML without deploying |
| `ghostwire status` | Platform health + active deployment info |
| `ghostwire analytics` | Success rate, error rate, avg latency |
| `ghostwire nodes` | Top failing nodes with ASCII bar chart |

### Example Session

```bash
$ ghostwire login
  Username: admin
  Password: ●●●●●●●●
  ✔ Logged in as admin
  Token saved to /home/user/.ghostwire/config.json

$ ghostwire deploy ./pipeline.yaml
  ✔ Pipeline deployed successfully!

  Deployment Summary
  ─────────────────────────────
  Deployment ID : #7
  Nodes         : 4
  Edges         : 3
  Deployed at   : 3/12/2026, 2:01:44 PM

  ✦ Canvas hot-reloaded on all connected clients

$ ghostwire status

  Platform Status
  ─────────────────────────────
  Status    : OK
  Clients   : 2
  Uptime    : 1h 23m 7s
  Queue     : 0 active / 0 pending

  Active Deployment
  ─────────────────────────────
  ID        : #7
  Status    : deployed
  Nodes     : 4
  Edges     : 3
  Deployed  : 3/12/2026, 2:01:44 PM

$ ghostwire analytics

  Analytics
  ─────────────────────────────
  Total Hits    : 1,247
  Success Rate  : 94.2%
  Error Rate    : 5.8%
  Avg Latency   : 823 ms
  Active Conns  : 2
```

---

## 11. Challenges & How They Were Solved

### 11.1 — Inspector Config Not Applied to Pipeline Execution

**Problem:** After setting `mockErrorRate: 100%` in the Inspector Panel and clicking "Apply Changes", all requests still passed. The execution engine was ignoring the config entirely.

**Root Cause:** Two disconnected config systems existed side-by-side:
- The deployment schema path (YAML in `deployments.schema_json`)
- The `node_configs` DB table (written by the Inspector via REST API)

`traverseGraph()` only read the schema path. The Inspector's "Apply Changes" only wrote to the in-memory Zustand store — never persisted to either the DB or the schema.

**Solution — Two-Part Fix:**

*Part 1 — server.js `traverseGraph`:* Merge DB config on top of schema config, with DB always winning:
```js
const schemaInsp = node?.inspector ?? {};
const dbCfgRow   = stmts.getConfig.get(nodeId);
const dbInsp     = dbCfgRow ? JSON.parse(dbCfgRow.config) : {};
const insp       = { ...schemaInsp, ...dbInsp };  // DB wins
```

*Part 2 — InspectorPanel.tsx `apply()`:* Write to both stores simultaneously:
```ts
setInspectorConfig(inspectorNodeId, local);           // in-memory / YAML
void api.updateNodeConfig(inspectorNodeId, local);    // DB persistence
```

---

### 11.2 — Auto-SRE Agent Infinite Loop

**Problem:** The agent ran, patched `maxRetries` to 10 (but `mockErrorRate` was still 100%), replayed the pipeline — which failed again — which triggered the alert again — which started another agent run. A tight infinite loop that locked up the server within seconds.

**Root Cause:** No mechanism prevented re-triggering during a run or in the cooldown period after one completed. The replayed hit was processed identically to a real incoming webhook hit.

**Solution:** Two-layer guard using native JS primitives — no external libraries, no DB overhead:
```js
const sreActive    = new Set();   // atomic lock — prevents concurrent runs
const sreCooldown  = new Map();   // 60s cooldown — prevents rapid re-trigger
const SRE_COOLDOWN = 60_000;

async function startAutoSRE(nodeId, ...) {
  if (sreActive.has(nodeId)) return;                           // lock check
  if ((sreCooldown.get(nodeId) ?? 0) > Date.now()) return;    // cooldown check

  sreActive.add(nodeId);
  try {
    // ... run the full ReAct loop ...
  } finally {
    sreActive.delete(nodeId);
    sreCooldown.set(nodeId, Date.now() + SRE_COOLDOWN);
    setTimeout(() => sreCooldown.delete(nodeId), SRE_COOLDOWN);
  }
}
```

---

### 11.3 — LLM JSON Parsing Failure from `<think>` Tags

**Problem:** The `deepseek-r1:1.5b` model wraps its chain-of-thought reasoning in `<think>…</think>` XML tags before outputting the actual JSON. The non-greedy regex `/\{[\s\S]*?\}/` was finding a partial `{...}` fragment *inside* the think block, not the actual JSON response. `JSON.parse()` threw: `Expected ',' or '}' after property value at position 307`.

**Root LLM Output Structure:**
```
<think>
The node is failing because { "mockErrorRate" is set to 100
which means every request will fail intentionally...
</think>
{"action": "patch_node_config", "field": "mockErrorRate", "value": 0}
```

**Solution — Three-Step Extraction:**
```js
// Step 1: strip reasoning block entirely
const stripped  = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

// Step 2: greedy match (captures the LARGEST {...} — the real JSON)
const jsonMatch = stripped.match(/\{[\s\S]*\}/);

// Step 3: graceful fallback if still malformed
try {
  parsed = JSON.parse(jsonMatch[0]);
} catch {
  thought = stripped.slice(0, 200).replace(/\n/g, ' ');
  // falls through to replay-only path — agent still replays the hit
}
```

---

### 11.4 — SQLite Write Contention Under Concurrent Load

**Problem:** Stress-testing with 50+ concurrent webhook hits caused `SQLITE_BUSY` errors. Multiple async pipeline executions were racing to write to the `hits` table simultaneously. SQLite in WAL mode handles concurrent reads fine, but concurrent writes to the same table still contend.

**Solution:** A custom single-concurrency FIFO job queue (`server/queue.js`) that serialises all pipeline executions. The HTTP endpoint returns `202 Accepted` immediately; the queue processes jobs one at a time:

```
┌─────────────────────────────────────────────┐
│  POST /api/webhook  → enqueue() → 202       │
│                                             │
│  queue:  [ job1, job2, job3, job4, ... ]    │
│              ↓                              │
│         process one at a time               │
│         active = 1,  MAX_CONCURRENT = 1     │
└─────────────────────────────────────────────┘
```

---

### 11.5 — Node Type Format Mismatch Between Frontend and CLI

**Problem:** The frontend (React Flow) stores nodes as `{ type: 'flowNode', data: { paletteType: 'postgres' } }`. The CLI YAML and the backend schema both use `{ type: 'postgres' }`. The Docker provisioner needed to handle both formats without duplicating logic.

**Solution:** A single normalisation helper used throughout `provisioner.js`:
```js
function getNodeType(node) {
  // React Flow / UI format
  if (node.type === 'flowNode' && node.data?.paletteType) return node.data.paletteType;
  // YAML / schema format
  return node.type ?? '';
}
```

---

### 11.6 — WebSocket Socket Not Re-authenticating After Login

**Problem:** The Socket.io client module singleton was created at module load time. After a user logged in and received a new JWT, the existing socket still had the old (null) auth token and was rejected by the server's JWT middleware on the next connection attempt. Events stopped arriving after re-login.

**Solution:** The entire socket lifecycle is encapsulated in a `useEffect` that re-runs when the JWT token changes. On each run, the previous socket is explicitly disconnected before creating a fresh authenticated connection:

```ts
useEffect(() => {
  if (socket) { socket.disconnect(); socket = null; }

  socket = io(BACKEND, {
    auth: { token },  // fresh JWT on every re-run
    ...
  });

  // register all handlers...

  return () => {
    // cleanup: deregister all handlers + disconnect
    socket.disconnect();
    socket = null;
  };
}, [token]);  // re-run when token changes
```

---

### 11.7 — TypeScript Type Incompatibility: InspectorConfig → NodeConfig

**Problem:** `InspectorConfig` is a strict interface with six named fields. `NodeConfig` has a `[key: string]: unknown` index signature (required for the generic API layer). TypeScript refused direct assignment because `InspectorConfig` doesn't declare an index signature.

**Solution:** Double-cast through `unknown` — the minimal escape hatch:
```ts
void api.updateNodeConfig(
  inspectorNodeId,
  local as unknown as import('@/services/api').NodeConfig
);
```

---

### 11.8 — Docker Compose YAML Indentation in Template Literals

**Problem:** JavaScript template literals mix string indentation with code indentation. The first version of `provisioner.js` produced compose files with inconsistent indentation that Docker Compose rejected with `yaml: line X: mapping values are not allowed in this context`.

**Solution:** Each service template is defined as a standalone string starting at column 2 (the service key under `services:`). The assembly step only adds the `services:` key prefix once:

```js
// Each template produces a block starting at 2-space indent
const postgres = (node) => `  ${node._svcName}:\n    image: postgres:15-alpine\n    ...`;

// Assembly:
const compose = `services:\n${services.join('\n\n')}\n${volBlock}`;
```

---

## 12. Setup & Running

### Prerequisites

- **Node.js** ≥ 18
- **Docker Desktop** (or Docker Engine) — for infrastructure provisioning
- **Ollama** — for AI features:
  ```bash
  ollama pull deepseek-r1:1.5b
  ```

### Install & Run

```bash
# 1. Install dependencies
npm install

# 2. Start the backend (keep this terminal open)
node server.js

# 3. Start the frontend (separate terminal)
npm run dev

# 4. Open in browser
open http://localhost:3000

# 5. Register an account → build a pipeline → click Deploy
```

### CLI Setup

```bash
cd cli
npm install
npm link

ghostwire login
ghostwire status
```

### Quick Test — Fire a Webhook

```bash
curl -X POST http://localhost:3001/api/webhook \
  -H "Content-Type: application/json" \
  -H "x-api-key: sk-visual-api-dev-1234" \
  -d '{"event": "user.signup", "userId": 42}'
```

### Quick Test — Auto-SRE Agent

1. Click any node on the canvas → open Inspector (right panel)
2. Set **Mock Error Rate** → `100%`
3. Set **Alert Threshold** → `1`
4. Click **Apply Changes**
5. Fire the webhook twice
6. Watch the `AgentTerminal` overlay open, diagnose, patch, and replay

### Quick Test — Docker Provisioning

1. Drag a **Postgres** or **Redis** node to the canvas
2. Click **Deploy**
3. Watch the LiveTerminal stream real Docker logs in sky blue
4. Verify: `docker ps`

### Quick Test — CLI Deploy with Canvas Hot-Reload

```bash
cat > /tmp/test-pipeline.yaml << 'EOF'
version: '1.0'
nodes:
  - id: webhook-1
    type: webhook
    label: Entry Point
    position: { x: 100, y: 150 }
  - id: postgres-1
    type: postgres
    label: Store Data
    position: { x: 400, y: 150 }
  - id: redis-1
    type: redis
    label: Cache Layer
    position: { x: 700, y: 150 }
edges:
  - id: e1
    source: webhook-1
    target: postgres-1
  - id: e2
    source: postgres-1
    target: redis-1
EOF

ghostwire deploy /tmp/test-pipeline.yaml
```

Keep the browser open — the canvas hot-reloads instantly and Docker logs stream into the terminal.

---

## 13. Environment Variables

```bash
# ── Backend ───────────────────────────────────────────────
PORT=3001
FRONTEND_ORIGIN=http://localhost:3000

# Comma-separated — only POST /api/webhook requires one
API_KEYS=sk-visual-api-dev-1234

# Change this in production!
JWT_SECRET=dev-secret-change-in-production

# ── Frontend (browser-exposed) ────────────────────────────
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
NEXT_PUBLIC_API_KEY=sk-visual-api-dev-1234
```

> `NEXT_PUBLIC_*` variables are embedded in the browser bundle. The API key only authorises webhook firing. All write operations (deploy, config changes, analytics) require a user JWT obtained via `/api/auth/login`.

### Production Environment Variables (Docker Compose / ECS)

```bash
# ── Database ──────────────────────────────────────────────
POSTGRES_USER=ghostwire
POSTGRES_PASSWORD=<strong-random-secret>
POSTGRES_DB=pipeline

# ── Redis ─────────────────────────────────────────────────
REDIS_PASSWORD=<strong-random-secret>

# ── Application ───────────────────────────────────────────
JWT_SECRET=<256-bit-random-secret>
API_KEYS=<comma-separated-production-keys>
NODE_ENV=production

# ── AWS (set in GitHub Actions secrets) ───────────────────
AWS_REGION=us-east-1
ECR_BACKEND_URL=<account>.dkr.ecr.us-east-1.amazonaws.com/ghostwire-backend
ECR_FRONTEND_URL=<account>.dkr.ecr.us-east-1.amazonaws.com/ghostwire-frontend
ECS_CLUSTER=ghostwire-prod
ECS_BACKEND_SERVICE=ghostwire-backend
ECS_FRONTEND_SERVICE=ghostwire-frontend
```

---

## 14. Deployment Lifecycle

```
┌──────────────────────────────────────────────────────────┐
│                Deployment State Machine                   │
│                                                          │
│   [canvas edit / CLI push]                               │
│          │                                               │
│          ▼                                               │
│   ┌──────────┐   Save Draft    ┌──────────┐             │
│   │  local   │ ──────────────► │  draft   │             │
│   │  dirty   │                 │  in DB   │             │
│   └──────────┘                 └────┬─────┘             │
│                                     │  Deploy           │
│                                     ▼                   │
│                              ┌──────────────┐           │
│   previous deployed ─archive─│  deployed    │           │
│                              └──────┬───────┘           │
│                                     │  next Deploy      │
│                                     ▼                   │
│                              ┌──────────────┐           │
│                              │   archived   │           │
│                              │ (kept for    │           │
│                              │  history)    │           │
│                              └──────────────┘           │
│                                                          │
│  Only one deployment has status='deployed' at a time.   │
│  Archive runs atomically before promotion.              │
└──────────────────────────────────────────────────────────┘
```

On every deploy — whether from the UI Deploy button or `ghostwire deploy` — **three things happen**:

1. **DB atomic update** (synchronous, within the HTTP handler): archive old deployed → promote draft to deployed
2. **Canvas hot-reload** (WebSocket `cli_deployment_sync`): all browser clients instantly reflect the new DAG
3. **Infrastructure provisioning** (async, fire-and-forget): Docker Compose generates and executes, streaming all container logs back to the browser terminal in real time

The `--remove-orphans` flag on `docker compose up` means any service whose node was removed from the YAML on this deploy is automatically stopped and removed — teardown is implicit in redeploy.

---

---

## 15. Production Deployment

### Docker Compose (Self-Hosted)

The full production stack runs as 7 services declared in `docker-compose.yml`:

```
┌─────────────────────────────────────────────────────────────────┐
│                     ghostwire-public network                    │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  nginx:1.27-alpine  (port 80/443)                        │   │
│  │  TLS · rate-limit · HSTS · CSP · WebSocket upgrade       │   │
│  └────────────────┬─────────────────────────────────────────┘   │
│                   │  /api/* /socket.io/*        /*              │
│          ┌────────▼────────┐             ┌──────▼──────┐        │
│          │    backend      │             │   frontend  │        │
│          │  Node.js :3001  │             │  Next.js    │        │
│          │  (standalone)   │             │  :3000      │        │
│          └────────┬────────┘             └─────────────┘        │
└───────────────────┼─────────────────────────────────────────────┘
                    │         ghostwire-internal network (isolated)
          ┌─────────┼──────────────────────┐
          │         │                      │
   ┌──────▼──┐  ┌───▼────┐  ┌─────────────▼──────┐
   │postgres │  │ redis  │  │ ollama             │
   │  16     │  │ 7      │  │ deepseek-r1:1.5b   │
   └─────────┘  └────────┘  └────────────────────┘
```

```bash
# Start full production stack
docker compose up -d

# Start development mode (hot-reload, host DB access)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up

# View logs
docker compose logs -f backend

# Tear down
docker compose down
```

> The `ghostwire-internal` network has `internal: true` — postgres, redis, and ollama are unreachable from outside Docker. Only the backend can reach them.

---

### AWS ECS Fargate (Terraform)

```
┌────────────────────────────────────────────────────────────────────────────┐
│  AWS (us-east-1)                                                           │
│                                                                            │
│  ┌──────────────────────────────────────────────────┐                     │
│  │  VPC  10.0.0.0/16                                │                     │
│  │                                                  │                     │
│  │  Public Subnets        Private Subnets           │                     │
│  │  ┌────────────────┐    ┌─────────────────────┐   │                     │
│  │  │  ALB           │    │  ECS Fargate        │   │                     │
│  │  │                │    │  ┌───────────────┐  │   │                     │
│  │  │  :80  → :443   │    │  │  backend task │  │   │                     │
│  │  │  /api/* ───────┼────┼─►│  :3001        │  │   │                     │
│  │  │  /socket.io/*  │    │  └───────────────┘  │   │                     │
│  │  │  /* ───────────┼────┼─►┌───────────────┐  │   │                     │
│  │  │                │    │  │ frontend task │  │   │                     │
│  │  └────────────────┘    │  │  :3000        │  │   │                     │
│  │                        │  └───────────────┘  │   │                     │
│  │                        └─────────────────────┘   │                     │
│  │                                                  │                     │
│  │  ┌──────────────────┐   ┌────────────────────┐   │                     │
│  │  │  RDS PostgreSQL  │   │  ElastiCache Redis │   │                     │
│  │  │  16  (Multi-AZ)  │   │  7  (TLS + auth)   │   │                     │
│  │  └──────────────────┘   └────────────────────┘   │                     │
│  └──────────────────────────────────────────────────┘                     │
│                                                                            │
│  ECR  (backend + frontend repos)                                           │
│  Secrets Manager  (JWT secret, DB password, Redis auth token)             │
│  EFS  (SQLite persistence for ECS tasks)                                  │
└────────────────────────────────────────────────────────────────────────────┘
```

```bash
cd terraform

# Initialise (first time)
terraform init

# Preview changes
terraform plan -var="project=ghostwire" -var="env=prod"

# Apply — provisions full AWS stack (~8 min)
terraform apply -var="project=ghostwire" -var="env=prod"

# Get outputs for GitHub Actions secrets
terraform output ecr_backend_url
terraform output ecr_frontend_url
terraform output ecs_cluster_name
```

**Terraform key decisions:**

| Decision | Reason |
|---|---|
| `deployment_circuit_breaker { rollback = true }` | Auto-rollback if ECS task fails health check during deploy |
| ALB sticky sessions on Socket.io target group | Socket.io long-polling requires same backend instance |
| `internal: true` on RDS/Redis security groups | No public internet access to databases |
| OIDC for GitHub Actions AWS auth | Zero long-lived AWS keys stored as secrets |
| EFS for SQLite | Persistent storage across Fargate task restarts |
| Auto-scaling on CPU target 70% | Scales backend from 1→4 tasks under load |

---

## 16. GitHub Actions CI/CD & Security Pipelines

Four workflows run on every push / PR:

```
Push / PR
    │
    ├── ci.yml ──────────────────────────────────────────────────────────┐
    │   Lint + TypeCheck + SAST + Trivy + TF Validate                   │
    │                                                                    │
    │   ┌─────────────────┐  ┌──────────────┐  ┌─────────────────────┐ │
    │   │ lint-typecheck  │  │ sast-semgrep │  │ dependency-audit    │ │
    │   │ ESLint + tsc    │  │ + CodeQL     │  │ npm audit + OSV     │ │
    │   └─────────────────┘  └──────────────┘  └─────────────────────┘ │
    │   ┌─────────────────┐  ┌──────────────┐  ┌─────────────────────┐ │
    │   │ build-backend   │  │ trivy-scan   │  │ terraform-validate  │ │
    │   │ build-frontend  │  │ HIGH/CRIT=1  │  │ tfsec + fmt check   │ │
    │   └─────────────────┘  └──────────────┘  └─────────────────────┘ │
    │                                                                    │
    ├── cd.yml  (main branch only) ──────────────────────────────────────┤
    │   OIDC → ECR Push → ECS Deploy → Smoke Test → Slack               │
    │                                                                    │
    │   OIDC assume role                                                 │
    │        │                                                           │
    │   docker build + push (SBOM + provenance attestation)             │
    │        │                                                           │
    │   ecs render-task-definition → deploy → wait-for-stability        │
    │        │                                                           │
    │   curl /health (smoke test)                                        │
    │        │                                                           │
    │   Slack notification (success / failure)                          │
    │                                                                    │
    ├── security.yml  (daily schedule + PR) ─────────────────────────────┤
    │                                                                    │
    │   ┌──────────────────┐  ┌──────────────────┐  ┌───────────────┐  │
    │   │ Gitleaks         │  │ TruffleHog       │  │ Semgrep full  │  │
    │   │ (git history)    │  │ (verified only)  │  │ ruleset       │  │
    │   └──────────────────┘  └──────────────────┘  └───────────────┘  │
    │   ┌──────────────────┐  ┌──────────────────┐  ┌───────────────┐  │
    │   │ tfsec + checkov  │  │ license-checker  │  │ OWASP ZAP     │  │
    │   │ (IaC + Docker)   │  │ (no GPL/LGPL)    │  │ baseline+full │  │
    │   └──────────────────┘  └──────────────────┘  └───────────────┘  │
    │                                                                    │
    └── ai-agent.yml  (PR open/sync + post-deploy) ──────────────────────┘
        Three Claude Opus 4.6 agents (raw HTTPS — no SDK dependency):

        Agent 1 — Code Reviewer
          • Gets PR diff (capped 30k chars)
          • Posts structured Markdown review with verdict:
            APPROVE / REQUEST_CHANGES / COMMENT
          • Flags security patterns, performance issues, type safety

        Agent 2 — Security Triage
          • Reads GitHub code scanning alerts
          • Assigns CVSS score + exploitability per alert
          • Files labelled GitHub issues for CRITICAL/HIGH
          • Skips FALSE_POSITIVE alerts

        Agent 3 — Deploy Watchdog
          • Polls /health every 30s for 5 min post-deploy
          • Detects HTTP non-200 or error_rate > 20%
          • Claude analyzes last 20 commits for root cause
          • Opens P0 incident issue with rollback commands
```

### Required GitHub Secrets

| Secret | Used By | Description |
|---|---|---|
| `AWS_ROLE_ARN` | cd.yml | IAM role ARN for OIDC auth |
| `AWS_REGION` | cd.yml | Target AWS region |
| `ECR_BACKEND_URL` | cd.yml | `terraform output ecr_backend_url` |
| `ECR_FRONTEND_URL` | cd.yml | `terraform output ecr_frontend_url` |
| `ECS_CLUSTER` | cd.yml | `terraform output ecs_cluster_name` |
| `ECS_BACKEND_SERVICE` | cd.yml | `terraform output ecs_backend_service` |
| `ECS_FRONTEND_SERVICE` | cd.yml | `terraform output ecs_frontend_service` |
| `SLACK_WEBHOOK_URL` | cd.yml | Slack incoming webhook for deploy notifications |
| `STAGING_URL` | security.yml | Base URL for OWASP ZAP DAST scan |
| `ZAP_API_KEY` | security.yml | ZAP API key injected via replacer rule |
| `ANTHROPIC_API_KEY` | ai-agent.yml | Claude Opus 4.6 for AI agents |

---

*Built with Node.js · Next.js 19 · React Flow · Socket.io · SQLite · Docker · Ollama · Terraform · AWS ECS · GitHub Actions · Claude Opus 4.6*
