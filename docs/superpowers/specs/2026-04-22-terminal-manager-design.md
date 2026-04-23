# DashboardClaw 2A — Terminal Manager Design Spec

**Data:** 2026-04-22
**Status:** Aprovado para implementação
**Escopo:** Sub-projeto 2A de 4 (série Sub-projeto 2)
**Depende de:** Sub-projeto 1 (Core) — concluído

---

## Visão Geral

Transformar o terminal único do DashboardClaw em um **gerenciador de múltiplos terminais com tabs**, suportando presets de CLIs (Claude, Codex, Gemini, OpenClaw) e uma API pública para abrir terminais embutidos em qualquer outra view (ex: autenticação de providers no Sub-projeto 2B).

O backend já suporta múltiplas sessões PTY via `Map<sid, TerminalSession>`. A mudança no backend é mínima — separar spawn de stream. O trabalho principal está no frontend.

---

## Arquitetura

```
server/
  terminal-api.ts      ← extend: spawn, sessions list, kill; stream aceita ?sid=

client/src/
  terminal-tab.js      ← novo: uma instância xterm.js + SSE + lifecycle por tab
  terminal-manager.js  ← novo: tab bar + array de TerminalTab + API embutível
  terminal.js          ← deletar: substituído pelos dois acima
```

---

## Backend — Mudanças em server/terminal-api.ts

### Novos campos em TerminalSession

```typescript
interface TerminalSession {
  sid: string;
  pty: IPty;
  res: ServerResponse | null;   // null até SSE conectar
  keepaliveTimer: ReturnType<typeof setInterval> | null;
  cleaned: boolean;
  name: string;                 // novo
  command: string;              // novo — shell ou preset
  startedAt: number;            // novo — Date.now()
}
```

### Endpoints novos / modificados

#### POST /api/terminal/spawn
Cria o PTY sem abrir SSE. Retorna `{sid, pid}` imediatamente.

**Request body:**
```json
{
  "name": "Claude CLI",
  "command": "claude",
  "args": ["--dangerously-skip-permissions"],
  "cwd": "/workspace"
}
```
Todos os campos são opcionais. Se `command` for omitido, usa o shell padrão (`SHELL` env ou `powershell.exe` no Windows).

**Response 200:**
```json
{ "sid": "a1b2c3d4e5f6", "pid": 12345 }
```

**Response 503:**
```json
{ "error": "node-pty is not installed. Run: npm install node-pty" }
```

#### GET /api/terminal/stream?sid=XXX
Conecta SSE a um PTY existente. Se `?sid` for omitido, comportamento legado: spawna shell padrão + abre SSE (retrocompatível com `terminal.js` antigo durante transição).

Quando `sid` é fornecido e a sessão não existe: retorna SSE com evento `error` e fecha.

#### GET /api/terminal/sessions
Lista sessões ativas. Não requer autenticação (mesma política do `/api/terminal/stream`).

**Response 200:**
```json
[
  {
    "sid": "a1b2c3d4e5f6",
    "name": "Claude CLI",
    "command": "claude",
    "pid": 12345,
    "startedAt": 1745280000000
  }
]
```

#### DELETE /api/terminal/sessions/:sid
Mata o PTY e fecha a SSE connection. Idempotente — retorna 200 mesmo se o sid não existir.

**Response 200:**
```json
{ "ok": true }
```

---

## Frontend — Módulos novos

### terminal-tab.js

Responsabilidade: ciclo de vida de uma tab — spawn → conectar SSE → xterm → input/resize → fechar.

```javascript
export class TerminalTab {
  constructor({ name, command, args, cwd, container })
  // Ciclo de vida
  async open()      // POST /spawn → GET /stream?sid → xterm.open(container)
  close()           // DELETE /sessions/:sid + fecha SSE + dispose xterm
  activate()        // mostra container + fitAddon.fit() + sendResize()
  deactivate()      // esconde container (PTY continua vivo)
  // Getters
  get sid()
  get name()
  get isAlive()
}
```

**Detalhes de implementação:**

- `open()` é assíncrono: `POST /spawn` → recebe `{sid}` → `new EventSource(/api/terminal/stream?sid=...)` → aguarda evento `session` para confirmar conexão → `term.open(container)`
- PTY output: decodifica base64 → `term.write(data)`
- Input: `term.onData(d => POST /input {sid, data})`
- Resize: `fitAddon` + `window.resize` → `POST /resize {sid, cols, rows}`
- Ao fechar SSE (`close` event ou evento `exit`): chama `close()` automaticamente

### terminal-manager.js

Responsabilidade: tab bar, criação de tabs, API pública embutível.

**Presets:**
```javascript
export const TERMINAL_PRESETS = [
  { id: 'shell',    label: 'Shell',       command: null,       args: [] },
  { id: 'claude',   label: 'Claude CLI',  command: 'claude',   args: ['--dangerously-skip-permissions'] },
  { id: 'codex',    label: 'Codex CLI',   command: 'codex',    args: [] },
  { id: 'gemini',   label: 'Gemini CLI',  command: 'gemini',   args: [] },
  { id: 'openclaw', label: 'OpenClaw',    command: 'openclaw', args: [] },
];
```

**API pública:**
```javascript
export const terminalManager = {
  // Inicializa a view de terminais no container principal
  init(viewContainerId),

  // Abre novo tab na view principal (com preset ou comando custom)
  async openTab({ preset, command, args, label }),

  // Abre terminal embutido num container específico (para outras views)
  // Retorna instância de TerminalTab — caller é responsável por .close()
  async openEmbedded(containerId, { preset, command, args, label }),
};
```

---

## UI — View Terminal

### Tab bar

```
┌─────────────────────────────────────────────────────────────┐
│  ● Shell 1  ×  │  ● Claude CLI  ×  │  ● OpenClaw  ×  │ [+▾]│
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   xterm.js do tab ativo (único visível, outros em          │
│   display:none — PTY continua rodando em background)       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Comportamento das tabs:**
- Label editável via clique duplo (renomeia só localmente, não persiste no servidor)
- `×` chama `tab.close()` → mata PTY → remove tab da barra
- Tab ativo: `tab.activate()` — exibe xterm + fitAddon.fit() + resize
- Tab inativo: `tab.deactivate()` — `display:none` no container
- Máximo de 8 tabs simultâneos — ao tentar criar o 9º, exibe aviso
- Ao fechar o último tab, abre automaticamente um Shell

### Dropdown `[+▾]`

```
  ┌─────────────────────┐
  │  Shell              │
  │  Claude CLI         │
  │  Codex CLI          │
  │  Gemini CLI         │
  │  OpenClaw           │
  │  ───────────────    │
  │  Custom…            │
  └─────────────────────┘
```

"Custom…" revela um `<input>` inline para digitar o comando antes de abrir.

---

## Terminal Embutido — Uso em outras views

Sub-projetos futuros podem abrir terminais inline sem usar a view Terminal:

```javascript
import { terminalManager } from './terminal-manager.js';

// Exemplo: view de Providers abre terminal para autenticar Claude CLI
const tab = await terminalManager.openEmbedded('provider-terminal-container', {
  preset: 'claude',
  label: 'Auth Claude CLI',
});

// Quando autenticação completa (evento no xterm ou botão do usuário):
tab.close();
```

O terminal embutido usa a mesma infraestrutura de spawn/SSE — apenas renderiza num container fornecido pelo caller, sem aparecer nas tabs da view Terminal.

---

## Estilos CSS novos

Adicionar a `client/styles.css`:

- `.terminal-tabs` — flex row, gap entre tabs, borda inferior
- `.terminal-tab` — tab individual: label + botão `×`, cursor pointer
- `.terminal-tab.active` — highlight com `var(--accent)`
- `.terminal-tab-label` — texto do tab, editável com `contenteditable`
- `.terminal-tab-close` — botão `×`, visível no hover
- `.terminal-add-btn` — botão `[+▾]` à direita
- `.terminal-preset-dropdown` — dropdown flutuante com presets
- `.terminal-preset-input` — input do modo Custom
- `.terminal-body` — container flex que empilha as xterm divs
- `.terminal-pane` — div de cada xterm, `width:100%; height:100%`

---

## Testes

Sem testes automatizados de frontend (xterm.js exige browser real). Backend: adicionar ao `server/terminal-api` (ou arquivo separado se extraído):

- `POST /spawn` retorna `{sid, pid}` com shell padrão
- `POST /spawn` com `command` retorna `{sid, pid}`
- `GET /sessions` retorna array com sessão criada
- `DELETE /sessions/:sid` retorna `{ok: true}` e remove da lista
- `DELETE /sessions/:sid` com sid inexistente retorna `{ok: true}` (idempotente)

---

## Sequência de commits esperada

1. `feat: extend terminal-api with spawn, sessions list, and kill endpoints`
2. `feat: add TerminalTab class with full SSE lifecycle`
3. `feat: add TerminalManager with tab bar, presets, and embedded API`
4. `feat: update terminal view in index.html with tab bar markup`
5. `style: add terminal tabs and dropdown CSS`
6. `refactor: delete client/src/terminal.js`
7. `test: add backend tests for spawn, sessions, and kill endpoints`
