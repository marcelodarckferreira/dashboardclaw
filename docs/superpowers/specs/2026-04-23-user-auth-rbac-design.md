# Spec: Autenticação de Usuários com RBAC

**Data:** 2026-04-23
**Status:** Aprovado

---

## Contexto

O DashboardClaw atualmente valida apenas `X-Gateway-Id` por request (qual gateway está ativo). Não existe camada de autenticação de usuário — qualquer pessoa com acesso à rede pode usar o dashboard. Este spec define a adição de login com username/senha, sessões com token, e controle de acesso por papel (RBAC) com ajuste fino por usuário.

---

## Banco de Dados

Três tabelas novas adicionadas ao schema SQLite em `server/db.ts`:

```sql
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  role          TEXT    NOT NULL DEFAULT 'viewer',  -- 'admin' | 'operator' | 'viewer'
  enabled       INTEGER NOT NULL DEFAULT 1,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_sessions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      TEXT    NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_permissions (
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  resource TEXT    NOT NULL,   -- 'terminal' | 'files' | 'gateways' | 'channels' | 'chat' | 'sessions' | 'users'
  action   TEXT    NOT NULL,   -- 'read' | 'write' | 'none'
  PRIMARY KEY (user_id, resource)
);
```

`user_permissions` armazena apenas **desvios** do papel base. Se uma linha não existe para um (user_id, resource), as permissões padrão do `role` do usuário se aplicam.

---

## Papéis e Permissões Padrão

| Recurso    | admin | operator | viewer  |
|------------|-------|----------|---------|
| terminal   | write | write    | none    |
| files      | write | write    | read    |
| gateways   | write | none     | none    |
| channels   | write | write    | read    |
| chat       | write | write    | read    |
| sessions   | write | write    | read    |
| users      | write | none     | none    |

Regras de resolução de permissão:
1. Verificar `user_permissions` para o (user_id, resource) — se existe, usar esse valor
2. Caso contrário, usar o padrão do `role`
3. `none` = endpoint retorna 403; `read` = apenas GET permitido; `write` = todos os métodos

---

## Fluxo de Primeiro Acesso (Setup)

Quando o servidor inicia e a tabela `users` está vazia:
- `GET /api/auth/status` retorna `{ setup: true }`
- O frontend detecta `setup: true` e exibe a **tela de setup** antes de qualquer outra UI
- A tela de setup coleta username + senha (mínimo 8 caracteres) e confirma senha
- `POST /api/auth/setup` cria o primeiro usuário com `role: 'admin'` e retorna token
- Após setup, o servidor passa a modo normal e nunca mais aceita `POST /api/auth/setup`

---

## Fluxo de Login Normal

1. Frontend verifica `GET /api/auth/status` → `{ setup: false, authenticated: false }`
2. Exibe tela de login (username + senha)
3. `POST /api/auth/login` → valida credenciais → retorna `{ token, user: { id, username, role, permissions } }`
4. Token salvo em `localStorage` como `dashboard_token`
5. Permissões salvas em `localStorage` como `dashboard_permissions` (JSON)
6. Modal de seleção de gateway (fluxo existente, sem alteração)
7. Todas as requests da API enviam `Authorization: Bearer <token>` + `X-Gateway-Id`

---

## API Endpoints

### Auth (`server/auth-api.ts`)

| Método | Rota | Auth? | Descrição |
|--------|------|-------|-----------|
| GET  | `/api/auth/status`  | Não | Retorna `{ setup, authenticated }` |
| POST | `/api/auth/setup`   | Não | Cria primeiro admin (só funciona se users vazia) |
| POST | `/api/auth/login`   | Não | Login com username/senha |
| POST | `/api/auth/logout`  | Sim | Invalida token atual |
| GET  | `/api/auth/me`      | Sim | Retorna usuário atual + permissões |

### Users (`server/users-api.ts`) — apenas admin

| Método | Rota | Descrição |
|--------|------|-----------|
| GET    | `/api/users`              | Listar usuários |
| POST   | `/api/users`              | Criar usuário |
| PUT    | `/api/users/:id`          | Atualizar username/senha/role/enabled |
| DELETE | `/api/users/:id`          | Remover usuário (não pode remover a si mesmo) |
| GET    | `/api/users/:id/permissions` | Listar permissões custom do usuário |
| PUT    | `/api/users/:id/permissions` | Definir permissões custom |

---

## Middleware de Autenticação (`server/user-auth-middleware.ts`)

Substitui `requireGatewayAuth` como middleware principal. Responsabilidades:

1. Extrair token do header `Authorization: Bearer <token>`
2. Buscar `user_sessions` WHERE `token = ? AND expires_at > NOW()`
3. Se não encontrado: 401
4. Buscar usuário + permissões efetivas
5. Injetar em `req.user: { id, username, role, permissions: Record<string, 'read'|'write'|'none'> }`
6. `requireGatewayAuth` permanece como segundo middleware independente (valida `X-Gateway-Id`)

Ordem dos middlewares nas rotas protegidas: `userAuth → gatewayAuth → handler`

Rotas públicas (sem userAuth): `/api/auth/status`, `/api/auth/setup`, `/api/auth/login`, `/api/gateways` (apenas GET para bootstrap do modal)

---

## Segurança

- Senhas hasheadas com `bcrypt` custo 12
- Token: `crypto.randomBytes(32).toString('hex')` — 64 chars hex
- Expiração de sessão: 24 horas
- Logout invalida apenas o token atual (não todas as sessões do usuário)
- Admin não pode desabilitar ou remover a si mesmo
- `POST /api/auth/setup` é idempotente-safe: retorna 409 se já existem usuários

---

## Frontend

### Arquivos modificados

| Arquivo | O que muda |
|---------|-----------|
| `client/src/auth.js` | Adiciona verificação de setup/login antes do gateway modal; envia Bearer token |
| `client/src/users.js` | Nova view: tabela de usuários com CRUD e editor de permissões (só admin) |
| `client/index.html` | Nav item "Usuários" (visível por role no frontend via permissions) |
| `client/styles.css` | Estilos: login card, setup card, tabela de usuários, editor de permissões |

### Tela de setup

Card centralizado com:
- Campo "Username" (min 3 chars)
- Campo "Senha" (min 8 chars)
- Campo "Confirmar senha"
- Botão "Criar admin"

### Tela de login

Card centralizado com:
- Campo "Username"
- Campo "Senha"
- Botão "Entrar"
- Mensagem de erro inline (sem alert())

### View de Usuários (admin only)

Tabela com: username, role, status (ativo/inativo), ações (editar, remover).
Modal de edição: username, senha (opcional — vazio = não alterar), role, enabled.
Accordion de permissões custom por recurso com select `padrão / leitura / escrita / sem acesso`.

---

## Testes

- `server/auth-api.test.ts`: setup, login, logout, me, tokens inválidos/expirados
- `server/users-api.test.ts`: CRUD de usuários, permissões, proteção por role
- `server/user-auth-middleware.test.ts`: token válido, expirado, ausente, permissões efetivas

---

## Dependências

- `bcryptjs` (pure JS, sem binário nativo) — `npm install bcryptjs @types/bcryptjs`

---

## O que NÃO está no escopo

- Refresh token automático (token expira e o usuário faz login novamente)
- OAuth / SSO
- 2FA
- Rate limiting no login (pode ser adicionado depois)
- Auditoria de ações por usuário
