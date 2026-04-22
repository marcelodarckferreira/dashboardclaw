# 📦 OpenClaw Dashboard: Estado de Migração

> Este arquivo foi gerado para salvar o contexto do nosso trabalho. Ao mover esta pasta para o Windows, você manterá todo o planejamento e poderemos continuar exatamente de onde paramos.

## 1. O que decidimos (Arquitetura)
*   **Abandono do Modelo Plugin:** O projeto agora é um **Dashboard Standalone** independente.
*   **Backend Node.js:** O servidor (`server/index.ts`) vai rodar na porta `3000`, servindo a interface web e hospedando o Terminal PTY e a API de Arquivos. Ele usará o **Gateway Token** do OpenClaw para gerenciar a instância remotamente/localmente com segurança.
*   **Frontend Vanilla (Nível 1):** Usamos HTML/CSS/JS puro (na pasta `client/`) para criar um visual premium em Dark Mode (Glassmorphism), focado em **Monitoramento Operacional** (STT, Telegram Ingest, Validade de Schema) ao invés de um simples editor de arquivos.

## 2. O que já está pronto (Código)
*   ✅ `client/index.html`: Layout da interface em Grid (Sidebar + Main + Header).
*   ✅ `client/styles.css`: Todo o design system Premium e estilização dos KPIs.
*   ✅ `client/app.js`: Lógica base para navegação entre abas.
*   ✅ `server/index.ts`: Nosso novo servidor backend.
*   ✅ `server/file-api.ts` e `server/terminal-api.ts`: Já adaptados para upload/download seguro.

## 3. Por que estamos migrando?
O ambiente dividido entre arquivos no WSL (Linux) e terminal rodando no Windows estava quebrando a execução dos comandos `npm` e corrompendo caminhos. Trabalhar nativamente no Windows resolve isso.

---

## 4. Próximos Passos (Ação Imediata na Nova Pasta)

Assim que você copiar esta pasta para o seu Windows (ex: `C:\Projetos\openclaw-dashboard`) e abrir no VS Code, abra o terminal do VS Code e rode:

### Limpeza e Instalação:
```bash
# Instala as dependências do novo backend
npm install express cors
npm install --save-dev @types/express @types/cors

# Remove o lixo do plugin antigo (se ainda estiverem aí)
rm openclaw.plugin.json src/index.ts src/inject.js src/ide-page.ts src/terminal-page.ts
```

### O que o Gemini (Antigravity) fará em seguida:
1.  **Integrar o Terminal:** Vou adicionar a tag do `<script src=".../xterm.js">` no nosso `index.html` e conectar com o backend.
2.  **Dados Reais:** Vou fazer os cards (Telegram, STT, Schema) puxarem o status atual lendo os logs do OpenClaw.
3.  **Tela de Login:** Adicionar o campo para inserir o "Gateway Token".

**Para continuar:** Após a migração, basta me enviar a mensagem: *"Migração concluída, leia o MIGRATION_PLAN.md e vamos continuar a Fase 3."*
