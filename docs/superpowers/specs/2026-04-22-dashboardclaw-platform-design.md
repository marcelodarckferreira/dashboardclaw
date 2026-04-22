# DashboardClaw Platform — Design Spec

**Data:** 2026-04-22  
**Status:** Aprovado para implementação  
**Escopo:** Core (Sub-projeto 1 de 4)

---

## Visão Geral

Transformar o DashboardClaw de um monitor local single-gateway em uma **plataforma de gestão multi-gateway** para OpenClaw. O Core estabelece a fundação técnica completa (schema, padrão de módulos, scaffolding de sub-projetos futuros) para que cada sub-projeto subsequente apenas preencha o que já está estruturado.

### Sub-projetos (ordem de execução)

| # | Sub-projeto | Depende de | Status |
|---|---|---|---|
| 1 | **Core** — bugs + Vite + SQLite + multi-gateway | — | Este spec |
| 2 | **Canais** — CRUD Telegram, WhatsApp, webhooks | Core | Futuro |
| 3 | **Chat** — interface de mensagens em tempo real | Core + Canais | Futuro |
| 4 | **Sessões** — controle de sessões dos agentes | Core | Futuro |

---

## Correções de Bloqueadores

Três bugs bloqueiam qualquer trabalho no projeto:

### 1. tsconfig.json
`rootDir` e `include` apontam para `src/` (pasta deletada). Mudar para `server/`.

```json
{
  "compilerOptions": {
    "rootDir": "server",
    "outDir": "dist"
  },
  "include": ["server/**/*"]
}
```

### 2. client/app.js — encoding corrompido
As linhas 105–134 têm encoding UTF-16 corrompido (token auth). O arquivo inteiro é substituído pelos módulos Vite descritos abaixo.

### 3. Terminal SSE — sid e base64
O código atual:
- Não captura o evento `session` (que entrega o `sid`)
- Não decodifica base64 no output do PTY
- Não passa `sid` nas requisições de `/input` e `/resize`

Correção no módulo `terminal.js` (ver Seção Frontend).

---

## Arquitetura

```
DashboardClaw
├── server/          ← Node.js + Express (TypeScript, ESM)
│   ├── db.ts        ← SQLite via better-sqlite3, schema completo
│   ├── gateways-api.ts    ← CRUD gateways + poll de status
│   ├── channels-api.ts    ← stub (rotas declaradas, sem lógica)
│   ├── agent-sessions-api.ts ← stub
│   ├── chat-api.ts        ← stub
│   └── index.ts           ← Express, monta todos os routers
│
└── client/          ← SPA Vanilla JS com Vite
    ├── index.html
    └── src/
        ├── main.js              ← entry point
        ├── nav.js               ← tab switching
        ├── auth.js              ← modal de login + fetch intercept
        ├── terminal.js          ← xterm.js + SSE corrigido
        ├── gateways.js          ← CRUD gateways
        ├── channels.js          ← stub
        ├── chat.js              ← stub
        ├── agent-sessions.js    ← stub
        └── styles.css
```

---

## Schema SQLite

Arquivo: `server/db.ts`  
Biblioteca: `better-sqlite3`  
Todas as tabelas criadas com `CREATE TABLE IF NOT EXISTS` na inicialização.

### Tabelas Core (implementadas)

```sql
CREATE TABLE IF NOT EXISTS gateways (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  host       TEXT    NOT NULL,
  port       INTEGER NOT NULL DEFAULT 18789,
  token      TEXT    NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  gateway_id INTEGER NOT NULL REFERENCES gateways(id) ON DELETE CASCADE,
  last_seen  DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS service_status (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  gateway_id INTEGER NOT NULL REFERENCES gateways(id) ON DELETE CASCADE,
  service    TEXT    NOT NULL, -- 'gateway' | 'telegram' | 'stt' | 'schema'
  status     TEXT    NOT NULL, -- 'ok' | 'warn' | 'error'
  value      TEXT,
  detail     TEXT,
  checked_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Tabelas Stub (criadas agora, implementadas nos sub-projetos)

```sql
CREATE TABLE IF NOT EXISTS channels (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  gateway_id INTEGER NOT NULL REFERENCES gateways(id) ON DELETE CASCADE,
  type       TEXT    NOT NULL, -- 'telegram' | 'whatsapp' | 'webhook'
  config     TEXT    NOT NULL DEFAULT '{}', -- JSON
  enabled    INTEGER NOT NULL DEFAULT 1,    -- BOOLEAN
  status     TEXT    NOT NULL DEFAULT 'unknown',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS agent_sessions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  gateway_id INTEGER NOT NULL REFERENCES gateways(id) ON DELETE CASCADE,
  agent_id   TEXT    NOT NULL,
  status     TEXT    NOT NULL DEFAULT 'active', -- 'active' | 'idle' | 'ended'
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  ended_at   DATETIME
);

CREATE TABLE IF NOT EXISTS messages (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id       INTEGER REFERENCES channels(id) ON DELETE SET NULL,
  agent_session_id INTEGER REFERENCES agent_sessions(id) ON DELETE SET NULL,
  direction        TEXT    NOT NULL, -- 'in' | 'out'
  content          TEXT    NOT NULL,
  sent_at          DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

Arquivo do banco: `./dashboardclaw.db` (raiz do projeto, ignorado pelo git).

---

## Backend

### Padrão de módulo

Cada API exporta uma função factory que recebe a instância `db` e retorna um `express.Router`:

```typescript
// Padrão seguido por todos os módulos
export function createGatewaysApi(db: Database): express.Router {
  const router = express.Router();
  // ...rotas
  return router;
}
```

`server/index.ts` monta todos os routers:

```typescript
import { createGatewaysApi } from './gateways-api.js';
import { createChannelsApi } from './channels-api.js';
import { createAgentSessionsApi } from './agent-sessions-api.js';
import { createChatApi } from './chat-api.js';

app.use('/api/gateways',       createGatewaysApi(db));
app.use('/api/channels',       createChannelsApi(db));       // stub
app.use('/api/agent-sessions', createAgentSessionsApi(db));  // stub
app.use('/api/chat',           createChatApi(db));           // stub
```

Em produção, Express serve `client/dist/` ao invés de `client/`.

### Rotas implementadas no Core

**`/api/gateways`**

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/gateways` | Lista todos os gateways |
| POST | `/api/gateways` | Cadastra gateway `{name, host, port, token}` |
| PUT | `/api/gateways/:id` | Atualiza gateway |
| DELETE | `/api/gateways/:id` | Remove gateway (cascade) |
| POST | `/api/gateways/:id/poll` | Ping no gateway, grava `service_status`, retorna status atual |
| GET | `/api/gateways/:id/status` | Últimas N leituras de `service_status` |

**`/api/sessions`** (via `gateways-api.ts`)

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/sessions` | Registra/atualiza acesso `{gateway_id}` |

### Rotas stub (Sub-projetos 2–4)

Os módulos stub declaram o router mas retornam `501 Not Implemented` em todas as rotas. Isso garante que o `index.ts` não mude quando os sub-projetos forem implementados.

---

## Frontend

### Vite

```bash
npm install --save-dev vite
```

Scripts em `package.json`:
```json
"client:dev":   "vite client/",
"client:build": "vite build client/ --outDir ../dist/client"
```

Em desenvolvimento, backend na porta 3000 e Vite na 5173 com proxy `/api` → `localhost:3000`.

### Módulos

**`auth.js`**
- Lê `active_gateway_id` do `localStorage`
- Se não houver gateway ativo, exibe modal de seleção
- Modal lista gateways do `/api/gateways` ou oferece link para "Canais" para cadastrar o primeiro
- Intercepta `window.fetch` para injetar `X-Gateway-Id: <id>` em todas as requisições da API
- `getActiveGateway()`, `setActiveGateway(id)`, `clearActiveGateway()`

**`terminal.js`**
```javascript
// Correções aplicadas:
// 1. addEventListener('session') captura o sid
// 2. atob(e.data) decodifica base64
// 3. sid incluído em /input e /resize

let sid = null;
const eventSource = new EventSource('/api/terminal/stream');

eventSource.addEventListener('session', (e) => {
  sid = JSON.parse(e.data).sid;
});

eventSource.onmessage = (e) => {
  term.write(atob(e.data));  // decode base64
};

term.onData((data) => {
  fetch('/api/terminal/input', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sid, data })
  });
});
```

**`gateways.js`** (view `view-gateways`)
- Lista gateways cadastrados com status (último poll)
- Formulário inline: Nome, Host, Porta, Token
- Botão "Conectar" → chama `/poll`, define gateway ativo via `auth.setActiveGateway()`
- Botão "Remover" com confirmação

**`nav.js`** (entry point via `main.js`)
- Tab switching: `data-target` → `view-{target}`
- Chama `initAuth()` no load
- Chama `initTerminal()` quando a view terminal é ativada
- Imports:
  ```javascript
  import { initAuth } from './auth.js';
  import { initTerminal } from './terminal.js';
  import { initGateways } from './gateways.js';
  ```

**Módulos stub** (`channels.js`, `chat.js`, `agent-sessions.js`)
- Exportam `init{Name}()` que renderiza um placeholder "Em desenvolvimento"

### Views no `index.html`

A sidebar ganha dois itens novos (Chat, Sessões) e "Canais" mantém seu propósito original (canais de comunicação — Sub-projeto 2). Gestão de gateways fica em "Gateways", item novo no Core.

| Nav item | View ID | Status no Core |
|---|---|---|
| Overview | `view-overview` | KPI cards com dados reais do gateway ativo |
| Terminal | `view-terminal` | Corrigido |
| Gateways | `view-gateways` | CRUD de gateways + botão Conectar — **novo** |
| Canais | `view-channels` | Stub — implementado no Sub-projeto 2 |
| Chat | `view-chat` | Stub — implementado no Sub-projeto 3 |
| Sessões | `view-sessions` | Stub — implementado no Sub-projeto 4 |
| Configurações | `view-settings` | Stub |

### Modal de Login

Aparece quando nenhum gateway está ativo. Design glassmorphism consistente com o tema atual:
- Overlay com `backdrop-filter: blur()`
- Card centralizado com logo
- Select de gateways cadastrados (se houver)
- Botão "Conectar"
- Link "Cadastrar novo gateway" → abre view Canais

---

## Dependências Novas

| Pacote | Tipo | Motivo |
|--------|------|--------|
| `better-sqlite3` | dependency | SQLite síncrono para Express |
| `@types/better-sqlite3` | devDependency | Tipos TypeScript |
| `vite` | devDependency | Bundler frontend |

---

## O que NÃO está no escopo do Core

- Implementação real dos canais Telegram/WhatsApp/webhooks → Sub-projeto 2
- Interface de chat → Sub-projeto 3  
- Controle de sessões de agentes → Sub-projeto 4
- Autenticação do dashboard com senha → futuro
- CORS restritivo em produção → futuro
