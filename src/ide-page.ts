/**
 * IDE Page Generator
 * Creates a full-featured code editor interface using Monaco Editor (CDN)
 * With integrated chat sidebar for OpenClaw gateway communication
 */

export interface IdePageConfig {
  monacoVersion: string;
  theme: "vs-dark" | "vs" | "hc-black";
  chatEnabled: boolean;
  chatDefaultOpen: boolean;
}

const DEFAULT_CONFIG: IdePageConfig = {
  monacoVersion: "0.52.0",
  theme: "vs-dark",
  chatEnabled: true,
  chatDefaultOpen: true,
};

/**
 * Language detection from file extension
 */
const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  json: "json",
  md: "markdown",
  html: "html",
  htm: "html",
  css: "css",
  scss: "scss",
  less: "less",
  py: "python",
  rb: "ruby",
  rs: "rust",
  go: "go",
  java: "java",
  c: "c",
  cpp: "cpp",
  h: "c",
  hpp: "cpp",
  cs: "csharp",
  php: "php",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  yaml: "yaml",
  yml: "yaml",
  xml: "xml",
  sql: "sql",
  graphql: "graphql",
  dockerfile: "dockerfile",
  makefile: "makefile",
  toml: "toml",
  ini: "ini",
  txt: "plaintext",
};

/**
 * Generate the IDE page HTML
 */
export function generateIdePage(config: Partial<IdePageConfig> = {}): string {
  const { monacoVersion, theme } = { ...DEFAULT_CONFIG, ...config };
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Better Gateway IDE</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    :root {
      --bg-primary: #1e1e1e;
      --bg-secondary: #252526;
      --bg-tertiary: #2d2d30;
      --bg-hover: #2a2d2e;
      --bg-active: #37373d;
      --border-color: #3c3c3c;
      --text-primary: #cccccc;
      --text-secondary: #858585;
      --text-muted: #6e6e6e;
      --accent: #0078d4;
      --accent-hover: #1c8ae6;
      --success: #4ec9b0;
      --warning: #dcdcaa;
      --error: #f14c4c;
      --scrollbar-bg: #1e1e1e;
      --scrollbar-thumb: #424242;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      height: 100vh;
      overflow: hidden;
    }
    
    #app {
      display: flex;
      flex-direction: column;
      height: 100vh;
    }
    
    /* Header / Toolbar */
    #toolbar {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 16px;
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border-color);
      height: 42px;
    }
    
    #toolbar .logo {
      font-weight: 600;
      color: var(--accent);
      font-size: 14px;
    }
    
    #toolbar .separator {
      width: 1px;
      height: 20px;
      background: var(--border-color);
    }
    
    .toolbar-btn {
      background: transparent;
      border: none;
      color: var(--text-secondary);
      padding: 6px 10px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    
    .toolbar-btn:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }
    
    .toolbar-btn.active {
      background: var(--bg-active);
      color: var(--text-primary);
    }
    
    #save-status {
      margin-left: auto;
      font-size: 12px;
      color: var(--text-muted);
    }
    
    #save-status.saving { color: var(--warning); }
    #save-status.saved { color: var(--success); }
    #save-status.error { color: var(--error); }
    
    /* Main Layout */
    #main {
      display: flex;
      flex: 1;
      overflow: hidden;
    }
    
    /* Sidebar */
    #sidebar {
      width: 260px;
      min-width: 200px;
      max-width: 400px;
      background: var(--bg-secondary);
      border-right: 1px solid var(--border-color);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    
    #sidebar.collapsed {
      width: 0;
      min-width: 0;
      border-right: none;
    }
    
    #sidebar-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 12px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-secondary);
      border-bottom: 1px solid var(--border-color);
    }
    
    #sidebar-header button {
      background: transparent;
      border: none;
      color: var(--text-secondary);
      cursor: pointer;
      padding: 4px;
      border-radius: 4px;
    }
    
    #sidebar-header button:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }
    
    /* File Search */
    #file-search-container {
      padding: 8px 12px;
      border-bottom: 1px solid var(--border-color);
    }
    
    #file-search {
      width: 100%;
      padding: 6px 10px;
      background: var(--bg-primary);
      border: 1px solid var(--border-color);
      border-radius: 4px;
      color: var(--text-primary);
      font-size: 12px;
      outline: none;
    }
    
    #file-search:focus {
      border-color: var(--accent);
    }
    
    #file-search::placeholder {
      color: var(--text-muted);
    }
    
    #file-tree {
      flex: 1;
      overflow-y: auto;
      padding: 8px 0;
    }
    
    .tree-item {
      display: flex;
      align-items: center;
      padding: 4px 12px;
      cursor: pointer;
      font-size: 13px;
      color: var(--text-primary);
      user-select: none;
    }
    
    .tree-item:hover {
      background: var(--bg-hover);
    }
    
    .tree-item.selected {
      background: var(--bg-active);
    }
    
    .tree-item.directory {
      color: var(--text-secondary);
    }
    
    .tree-item .icon {
      width: 16px;
      height: 16px;
      margin-right: 6px;
      flex-shrink: 0;
      font-size: 14px;
      text-align: center;
    }
    
    .tree-item .name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    
    .tree-item .chevron {
      width: 16px;
      margin-right: 2px;
      font-size: 10px;
      color: var(--text-muted);
      transition: transform 0.15s;
    }
    
    .tree-item .chevron.expanded {
      transform: rotate(90deg);
    }
    
    .tree-children {
      display: none;
    }
    
    .tree-children.expanded {
      display: block;
    }
    
    /* Resize Handle */
    #resize-handle {
      width: 4px;
      cursor: col-resize;
      background: transparent;
    }
    
    #resize-handle:hover {
      background: var(--accent);
    }
    
    /* Editor Area */
    #editor-area {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    
    /* Tab Bar */
    #tab-bar {
      display: flex;
      align-items: center;
      background: var(--bg-tertiary);
      border-bottom: 1px solid var(--border-color);
      height: 36px;
      overflow-x: auto;
    }
    
    #tab-bar::-webkit-scrollbar {
      height: 3px;
    }
    
    .tab {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 0 12px;
      height: 100%;
      font-size: 13px;
      color: var(--text-secondary);
      background: transparent;
      border: none;
      border-right: 1px solid var(--border-color);
      cursor: pointer;
      white-space: nowrap;
    }
    
    .tab:hover {
      background: var(--bg-hover);
    }
    
    .tab.active {
      background: var(--bg-primary);
      color: var(--text-primary);
      border-bottom: 1px solid var(--bg-primary);
      margin-bottom: -1px;
    }
    
    .tab.modified .tab-name::after {
      content: " •";
      color: var(--warning);
    }
    
    .tab .close-btn {
      background: transparent;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      padding: 2px;
      border-radius: 4px;
      font-size: 14px;
      line-height: 1;
      visibility: hidden;
    }
    
    .tab:hover .close-btn,
    .tab.active .close-btn {
      visibility: visible;
    }
    
    .tab .close-btn:hover {
      background: var(--bg-active);
      color: var(--text-primary);
    }
    
    .tab.dragging {
      opacity: 0.5;
    }
    
    .tab.drag-over {
      border-left: 2px solid var(--accent);
    }
    
    /* Tab scroll buttons */
    .tab-scroll-btn {
      background: var(--bg-tertiary);
      border: none;
      color: var(--text-secondary);
      padding: 0 8px;
      cursor: pointer;
      height: 100%;
      font-size: 14px;
    }
    
    .tab-scroll-btn:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }
    
    .tab-scroll-btn:disabled {
      opacity: 0.3;
      cursor: default;
    }
    
    /* Editor Container */
    #editor-container {
      flex: 1;
      overflow: hidden;
    }
    
    /* Welcome Screen */
    #welcome {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--text-muted);
      font-size: 14px;
    }
    
    #welcome h2 {
      font-size: 24px;
      font-weight: 400;
      margin-bottom: 16px;
      color: var(--text-secondary);
    }
    
    #welcome .shortcuts {
      margin-top: 24px;
      text-align: left;
    }
    
    #welcome .shortcut {
      display: flex;
      gap: 12px;
      margin: 8px 0;
    }
    
    #welcome kbd {
      background: var(--bg-tertiary);
      padding: 2px 8px;
      border-radius: 4px;
      font-family: inherit;
      font-size: 12px;
      min-width: 80px;
      text-align: center;
    }
    
    /* Loading Overlay */
    #loading {
      position: fixed;
      inset: 0;
      background: var(--bg-primary);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }
    
    #loading.hidden {
      display: none;
    }
    
    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid var(--bg-tertiary);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
    
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    
    /* Context Menu */
    #context-menu {
      position: fixed;
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 4px 0;
      min-width: 160px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
      z-index: 1000;
      display: none;
    }
    
    #context-menu.visible {
      display: block;
    }
    
    .context-item {
      padding: 6px 12px;
      font-size: 13px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .context-item:hover {
      background: var(--bg-hover);
    }
    
    .context-separator {
      height: 1px;
      background: var(--border-color);
      margin: 4px 0;
    }
    
    /* Scrollbar styling */
    ::-webkit-scrollbar {
      width: 10px;
      height: 10px;
    }
    
    ::-webkit-scrollbar-track {
      background: var(--scrollbar-bg);
    }
    
    ::-webkit-scrollbar-thumb {
      background: var(--scrollbar-thumb);
      border-radius: 5px;
    }
    
    ::-webkit-scrollbar-thumb:hover {
      background: #555;
    }
    
    /* ==================== Chat Sidebar ==================== */
    
    #chat-resize-handle {
      width: 4px;
      cursor: col-resize;
      background: transparent;
      flex-shrink: 0;
    }
    
    #chat-resize-handle:hover {
      background: var(--accent);
    }
    
    #chat-sidebar {
      width: 350px;
      min-width: 280px;
      max-width: 600px;
      background: var(--bg-secondary);
      border-left: 1px solid var(--border-color);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    
    #chat-sidebar.collapsed {
      width: 0;
      min-width: 0;
      border-left: none;
    }
    
    #chat-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 12px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-secondary);
      border-bottom: 1px solid var(--border-color);
    }
    
    #chat-header .chat-title {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    #chat-status {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--text-muted);
    }
    
    #chat-status.connected {
      background: var(--success);
    }
    
    #chat-status.connecting {
      background: var(--warning);
      animation: pulse 1s infinite;
    }
    
    #chat-status.error {
      background: var(--error);
    }
    
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    
    #chat-header button {
      background: transparent;
      border: none;
      color: var(--text-secondary);
      cursor: pointer;
      padding: 4px;
      border-radius: 4px;
      font-size: 14px;
    }
    
    #chat-header button:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }
    
    #chat-messages {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    
    .chat-message {
      display: flex;
      flex-direction: column;
      gap: 4px;
      animation: fadeIn 0.2s ease-out;
    }
    
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }
    
    .chat-message.user {
      align-items: flex-end;
    }
    
    .chat-message.assistant {
      align-items: flex-start;
    }
    
    .chat-message .sender {
      font-size: 11px;
      color: var(--text-muted);
      padding: 0 8px;
    }
    
    .chat-message .content {
      max-width: 90%;
      padding: 10px 14px;
      border-radius: 12px;
      font-size: 13px;
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-word;
    }
    
    .chat-message.user .content {
      background: var(--accent);
      color: white;
      border-bottom-right-radius: 4px;
    }
    
    .chat-message.assistant .content {
      background: var(--bg-tertiary);
      color: var(--text-primary);
      border-bottom-left-radius: 4px;
    }
    
    .chat-message.system .content {
      background: transparent;
      color: var(--text-muted);
      font-size: 12px;
      text-align: center;
      padding: 8px;
    }
    
    .chat-message.streaming .content::after {
      content: "▋";
      animation: blink 0.8s infinite;
    }
    
    @keyframes blink {
      0%, 50% { opacity: 1; }
      51%, 100% { opacity: 0; }
    }
    
    #chat-input-area {
      padding: 12px;
      border-top: 1px solid var(--border-color);
      background: var(--bg-secondary);
    }
    
    #chat-input-wrapper {
      display: flex;
      gap: 8px;
      align-items: flex-end;
    }
    
    #chat-input {
      flex: 1;
      min-height: 40px;
      max-height: 120px;
      padding: 10px 12px;
      background: var(--bg-primary);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      color: var(--text-primary);
      font-size: 13px;
      font-family: inherit;
      resize: none;
      outline: none;
      line-height: 1.4;
    }
    
    #chat-input:focus {
      border-color: var(--accent);
    }
    
    #chat-input::placeholder {
      color: var(--text-muted);
    }
    
    #chat-send-btn {
      width: 40px;
      height: 40px;
      background: var(--accent);
      border: none;
      border-radius: 8px;
      color: white;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      transition: background 0.15s;
    }
    
    #chat-send-btn:hover {
      background: var(--accent-hover);
    }
    
    #chat-send-btn:disabled {
      background: var(--bg-tertiary);
      color: var(--text-muted);
      cursor: not-allowed;
    }
    
    .chat-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--text-muted);
      text-align: center;
      padding: 24px;
    }
    
    .chat-empty h3 {
      font-size: 16px;
      font-weight: 500;
      color: var(--text-secondary);
      margin-bottom: 8px;
    }
    
    .chat-empty p {
      font-size: 13px;
      line-height: 1.5;
    }
    
    .chat-empty kbd {
      background: var(--bg-tertiary);
      padding: 2px 6px;
      border-radius: 4px;
      font-family: inherit;
      font-size: 11px;
    }
  </style>
</head>
<body>
  <div id="loading">
    <div class="spinner"></div>
  </div>
  
  <div id="app">
    <div id="toolbar">
      <span class="logo">⚡ Better Gateway IDE</span>
      <span class="separator"></span>
      <button class="toolbar-btn" id="toggle-sidebar" title="Toggle Sidebar (Ctrl+B)">
        ☰ Files
      </button>
      <button class="toolbar-btn" id="new-file-btn" title="New File (Ctrl+N)">
        + New
      </button>
      <button class="toolbar-btn" id="refresh-btn" title="Refresh Files">
        ↻ Refresh
      </button>
      <span id="save-status"></span>
      <button class="toolbar-btn" id="toggle-chat" title="Toggle Chat (Ctrl+Shift+C)">
        💬 Chat
      </button>
    </div>
    
    <div id="main">
      <div id="sidebar">
        <div id="sidebar-header">
          <span>Explorer</span>
          <button id="collapse-btn" title="Collapse All">⊟</button>
        </div>
        <div id="file-search-container">
          <input type="text" id="file-search" placeholder="Search files... (Ctrl+P)" />
        </div>
        <div id="file-tree"></div>
      </div>
      
      <div id="resize-handle"></div>
      
      <div id="editor-area">
        <div id="tab-bar"></div>
        <div id="editor-container">
          <div id="welcome">
            <h2>Better Gateway IDE</h2>
            <p>Open a file from the sidebar to start editing</p>
            <div class="shortcuts">
              <div class="shortcut"><kbd>⌘/Ctrl+S</kbd> <span>Save file</span></div>
              <div class="shortcut"><kbd>⌘/Ctrl+B</kbd> <span>Toggle sidebar</span></div>
              <div class="shortcut"><kbd>⌘/Ctrl+P</kbd> <span>Quick open</span></div>
              <div class="shortcut"><kbd>⌘/Ctrl+W</kbd> <span>Close tab</span></div>
              <div class="shortcut"><kbd>⌘/Ctrl+Shift+C</kbd> <span>Toggle chat</span></div>
            </div>
          </div>
        </div>
      </div>
      
      <div id="chat-resize-handle"></div>
      
      <div id="chat-sidebar">
        <div id="chat-header">
          <div class="chat-title">
            <span id="chat-status" title="Disconnected"></span>
            <span>Chat</span>
          </div>
          <button id="chat-close-btn" title="Close Chat (Ctrl+Shift+C)">×</button>
        </div>
        <div id="chat-messages">
          <div class="chat-empty">
            <h3>OpenClaw Chat</h3>
            <p>Chat with your AI assistant while coding.<br/>Press <kbd>⌘/Ctrl+Shift+C</kbd> to toggle.</p>
          </div>
        </div>
        <div id="chat-input-area">
          <div id="chat-input-wrapper">
            <textarea id="chat-input" placeholder="Type a message..." rows="1"></textarea>
            <button id="chat-send-btn" title="Send message">↑</button>
          </div>
        </div>
      </div>
    </div>
  </div>
  
  <div id="context-menu">
    <div class="context-item" data-action="new-file">📄 New File</div>
    <div class="context-item" data-action="new-folder">📁 New Folder</div>
    <div class="context-separator"></div>
    <div class="context-item" data-action="rename">✏️ Rename</div>
    <div class="context-item" data-action="delete">🗑️ Delete</div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/monaco-editor@${monacoVersion}/min/vs/loader.js"></script>
  <script>
    // Configuration
    const API_BASE = '/better-gateway/api/files';
    const EXTENSION_MAP = ${JSON.stringify(EXTENSION_TO_LANGUAGE)};
    
    // State
    const state = {
      files: [],
      openTabs: [],
      activeTab: null,
      editor: null,
      models: new Map(), // path -> monaco model
      expandedDirs: new Set(['']),
      unsavedChanges: new Map(), // path -> true
      // Chat state
      chatWs: null,
      chatMessages: [],
      chatSessionKey: 'webchat:ide:main',
      chatConnected: false,
      chatReconnectAttempts: 0,
      chatMaxReconnectAttempts: 5,
      chatPendingRequests: new Map(), // id -> { resolve, reject }
      chatCurrentStreamId: null,
      chatStreamingContent: '',
    };
    
    // DOM Elements
    const elements = {
      loading: document.getElementById('loading'),
      fileTree: document.getElementById('file-tree'),
      tabBar: document.getElementById('tab-bar'),
      editorContainer: document.getElementById('editor-container'),
      welcome: document.getElementById('welcome'),
      sidebar: document.getElementById('sidebar'),
      saveStatus: document.getElementById('save-status'),
      contextMenu: document.getElementById('context-menu'),
      fileSearch: document.getElementById('file-search'),
      // Chat elements
      chatSidebar: document.getElementById('chat-sidebar'),
      chatResizeHandle: document.getElementById('chat-resize-handle'),
      chatMessages: document.getElementById('chat-messages'),
      chatInput: document.getElementById('chat-input'),
      chatSendBtn: document.getElementById('chat-send-btn'),
      chatStatus: document.getElementById('chat-status'),
    };
    
    // Search state
    let searchQuery = '';
    
    // ==================== File API ====================
    
    async function fetchFiles(path = '/') {
      const res = await fetch(\`\${API_BASE}?path=\${encodeURIComponent(path)}&recursive=true\`);
      if (!res.ok) throw new Error('Failed to fetch files');
      const data = await res.json();
      return data.files;
    }
    
    async function readFile(path) {
      const res = await fetch(\`\${API_BASE}/read?path=\${encodeURIComponent(path)}\`);
      if (!res.ok) throw new Error('Failed to read file');
      const data = await res.json();
      return data.content;
    }
    
    async function writeFile(path, content) {
      const res = await fetch(\`\${API_BASE}/write\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, content }),
      });
      if (!res.ok) throw new Error('Failed to write file');
      return res.json();
    }
    
    async function deleteFile(path) {
      const res = await fetch(\`\${API_BASE}?path=\${encodeURIComponent(path)}\`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete file');
      return res.json();
    }
    
    async function createDirectory(path) {
      const res = await fetch(\`\${API_BASE}/mkdir\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });
      if (!res.ok) throw new Error('Failed to create directory');
      return res.json();
    }
    
    // ==================== File Tree ====================
    
    function buildTree(files) {
      const root = { name: '', children: {}, type: 'directory' };
      
      for (const file of files) {
        const parts = file.path.split('/').filter(Boolean);
        let current = root;
        
        for (let i = 0; i < parts.length; i++) {
          const part = parts[i];
          const isLast = i === parts.length - 1;
          
          if (!current.children[part]) {
            current.children[part] = {
              name: part,
              path: parts.slice(0, i + 1).join('/'),
              type: isLast ? file.type : 'directory',
              size: file.size,
              modified: file.modified,
              children: {},
            };
          }
          current = current.children[part];
        }
      }
      
      return root;
    }
    
    function sortTreeChildren(children) {
      return Object.values(children).sort((a, b) => {
        // Directories first
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1;
        }
        // Then alphabetically
        return a.name.localeCompare(b.name);
      });
    }
    
    function getFileIcon(name, type) {
      if (type === 'directory') return '📁';
      const ext = name.split('.').pop()?.toLowerCase();
      const icons = {
        ts: '🔷', tsx: '⚛️', js: '🟨', jsx: '⚛️',
        json: '📋', md: '📝', html: '🌐', css: '🎨',
        py: '🐍', rb: '💎', rs: '🦀', go: '🐹',
        sh: '⚙️', bash: '⚙️', yml: '⚙️', yaml: '⚙️',
        png: '🖼️', jpg: '🖼️', gif: '🖼️', svg: '🖼️',
        txt: '📄',
      };
      return icons[ext] || '📄';
    }
    
    function matchesSearch(name, path) {
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      return name.toLowerCase().includes(query) || path.toLowerCase().includes(query);
    }
    
    function hasMatchingDescendants(node) {
      if (!searchQuery) return true;
      if (matchesSearch(node.name, node.path)) return true;
      if (node.type === 'directory' && node.children) {
        return Object.values(node.children).some(child => hasMatchingDescendants(child));
      }
      return false;
    }
    
    function highlightMatch(text) {
      if (!searchQuery) return text;
      const query = searchQuery.toLowerCase();
      const idx = text.toLowerCase().indexOf(query);
      if (idx === -1) return text;
      return text.slice(0, idx) + '<mark style="background: var(--accent); color: var(--bg-primary); padding: 0 2px; border-radius: 2px;">' + text.slice(idx, idx + query.length) + '</mark>' + text.slice(idx + query.length);
    }
    
    function renderTree(node, container, depth = 0) {
      const sorted = sortTreeChildren(node.children);
      
      for (const child of sorted) {
        // Skip items that don't match search (unless they have matching descendants)
        if (searchQuery && !hasMatchingDescendants(child)) {
          continue;
        }
        
        const item = document.createElement('div');
        item.className = 'tree-item' + (child.type === 'directory' ? ' directory' : '');
        item.style.paddingLeft = (12 + depth * 16) + 'px';
        item.dataset.path = child.path;
        item.dataset.type = child.type;
        
        // Auto-expand directories when searching
        const isExpanded = searchQuery ? true : state.expandedDirs.has(child.path);
        const displayName = highlightMatch(child.name);
        
        if (child.type === 'directory') {
          item.innerHTML = \`
            <span class="chevron \${isExpanded ? 'expanded' : ''}">▶</span>
            <span class="icon">\${getFileIcon(child.name, child.type)}</span>
            <span class="name">\${displayName}</span>
          \`;
        } else {
          item.innerHTML = \`
            <span class="icon">\${getFileIcon(child.name, child.type)}</span>
            <span class="name">\${displayName}</span>
          \`;
        }
        
        container.appendChild(item);
        
        // Add click handlers
        item.addEventListener('click', () => handleTreeItemClick(child));
        item.addEventListener('contextmenu', (e) => showContextMenu(e, child));
        
        // Render children if directory and expanded
        if (child.type === 'directory' && Object.keys(child.children).length > 0) {
          const childContainer = document.createElement('div');
          childContainer.className = 'tree-children' + (isExpanded ? ' expanded' : '');
          container.appendChild(childContainer);
          renderTree(child, childContainer, depth + 1);
        }
      }
    }
    
    function handleTreeItemClick(node) {
      if (node.type === 'directory') {
        // Toggle expanded state
        if (state.expandedDirs.has(node.path)) {
          state.expandedDirs.delete(node.path);
        } else {
          state.expandedDirs.add(node.path);
        }
        refreshFileTree();
      } else {
        openFile(node.path);
      }
    }
    
    async function refreshFileTree() {
      try {
        state.files = await fetchFiles('/');
        const tree = buildTree(state.files);
        elements.fileTree.innerHTML = '';
        renderTree(tree, elements.fileTree);
        updateTreeSelection();
      } catch (err) {
        console.error('Failed to refresh file tree:', err);
      }
    }
    
    function updateTreeSelection() {
      document.querySelectorAll('.tree-item').forEach(item => {
        item.classList.toggle('selected', item.dataset.path === state.activeTab);
      });
    }
    
    // ==================== Tabs ====================
    
    // Tab drag state
    let draggedTab = null;
    
    function renderTabs() {
      elements.tabBar.innerHTML = '';
      
      for (const path of state.openTabs) {
        const tab = document.createElement('button');
        tab.className = 'tab' + (path === state.activeTab ? ' active' : '');
        tab.draggable = true;
        tab.dataset.path = path;
        
        if (state.unsavedChanges.has(path)) {
          tab.classList.add('modified');
        }
        
        const name = path.split('/').pop();
        tab.innerHTML = \`
          <span class="tab-name">\${name}</span>
          <span class="close-btn" title="Close (Ctrl+W)">×</span>
        \`;
        
        // Click handlers
        tab.addEventListener('click', (e) => {
          if (e.target.classList.contains('close-btn')) {
            closeTab(path);
          } else {
            switchToTab(path);
          }
        });
        
        // Middle-click to close
        tab.addEventListener('auxclick', (e) => {
          if (e.button === 1) { // Middle button
            e.preventDefault();
            closeTab(path);
          }
        });
        
        // Drag and drop for tab reordering
        tab.addEventListener('dragstart', (e) => {
          draggedTab = path;
          tab.classList.add('dragging');
          e.dataTransfer.effectAllowed = 'move';
        });
        
        tab.addEventListener('dragend', () => {
          tab.classList.remove('dragging');
          draggedTab = null;
          document.querySelectorAll('.tab.drag-over').forEach(t => t.classList.remove('drag-over'));
        });
        
        tab.addEventListener('dragover', (e) => {
          e.preventDefault();
          if (draggedTab && draggedTab !== path) {
            tab.classList.add('drag-over');
          }
        });
        
        tab.addEventListener('dragleave', () => {
          tab.classList.remove('drag-over');
        });
        
        tab.addEventListener('drop', (e) => {
          e.preventDefault();
          tab.classList.remove('drag-over');
          if (draggedTab && draggedTab !== path) {
            // Reorder tabs
            const fromIdx = state.openTabs.indexOf(draggedTab);
            const toIdx = state.openTabs.indexOf(path);
            if (fromIdx !== -1 && toIdx !== -1) {
              state.openTabs.splice(fromIdx, 1);
              state.openTabs.splice(toIdx, 0, draggedTab);
              renderTabs();
            }
          }
        });
        
        elements.tabBar.appendChild(tab);
      }
    }
    
    async function openFile(path) {
      // Check if already open
      if (!state.openTabs.includes(path)) {
        state.openTabs.push(path);
      }
      
      // Switch to tab
      await switchToTab(path);
    }
    
    async function switchToTab(path) {
      state.activeTab = path;
      
      // Hide welcome screen
      elements.welcome.style.display = 'none';
      
      // Get or create model
      let model = state.models.get(path);
      if (!model) {
        try {
          const content = await readFile(path);
          const ext = path.split('.').pop()?.toLowerCase() || '';
          const language = EXTENSION_MAP[ext] || 'plaintext';
          
          model = monaco.editor.createModel(content, language, monaco.Uri.parse('file:///' + path));
          state.models.set(path, model);
          
          // Track changes
          model.onDidChangeContent(() => {
            if (!state.unsavedChanges.has(path)) {
              state.unsavedChanges.set(path, true);
              renderTabs();
            }
          });
        } catch (err) {
          console.error('Failed to open file:', err);
          return;
        }
      }
      
      state.editor.setModel(model);
      renderTabs();
      updateTreeSelection();
      
      // Restore view state if we have it
      const viewState = localStorage.getItem('viewState:' + path);
      if (viewState) {
        state.editor.restoreViewState(JSON.parse(viewState));
      }
    }
    
    function closeTab(path) {
      const idx = state.openTabs.indexOf(path);
      if (idx === -1) return;
      
      // Check for unsaved changes
      if (state.unsavedChanges.has(path)) {
        if (!confirm(\`"\${path.split('/').pop()}" has unsaved changes. Close anyway?\`)) {
          return;
        }
      }
      
      // Remove from tabs
      state.openTabs.splice(idx, 1);
      
      // Dispose model
      const model = state.models.get(path);
      if (model) {
        model.dispose();
        state.models.delete(path);
      }
      
      state.unsavedChanges.delete(path);
      
      // Switch to another tab or show welcome
      if (state.activeTab === path) {
        if (state.openTabs.length > 0) {
          const newIdx = Math.min(idx, state.openTabs.length - 1);
          switchToTab(state.openTabs[newIdx]);
        } else {
          state.activeTab = null;
          state.editor.setModel(null);
          elements.welcome.style.display = 'flex';
        }
      }
      
      renderTabs();
    }
    
    // ==================== Save ====================
    
    async function saveCurrentFile() {
      if (!state.activeTab) return;
      
      const model = state.models.get(state.activeTab);
      if (!model) return;
      
      elements.saveStatus.textContent = 'Saving...';
      elements.saveStatus.className = 'saving';
      
      try {
        await writeFile(state.activeTab, model.getValue());
        state.unsavedChanges.delete(state.activeTab);
        renderTabs();
        elements.saveStatus.textContent = 'Saved';
        elements.saveStatus.className = 'saved';
        setTimeout(() => {
          elements.saveStatus.textContent = '';
          elements.saveStatus.className = '';
        }, 2000);
      } catch (err) {
        elements.saveStatus.textContent = 'Save failed';
        elements.saveStatus.className = 'error';
        console.error('Save failed:', err);
      }
    }
    
    // ==================== Context Menu ====================
    
    let contextMenuTarget = null;
    
    function showContextMenu(e, node) {
      e.preventDefault();
      contextMenuTarget = node;
      elements.contextMenu.style.left = e.clientX + 'px';
      elements.contextMenu.style.top = e.clientY + 'px';
      elements.contextMenu.classList.add('visible');
    }
    
    function hideContextMenu() {
      elements.contextMenu.classList.remove('visible');
      contextMenuTarget = null;
    }
    
    async function handleContextAction(action) {
      if (!contextMenuTarget) return;
      
      const target = contextMenuTarget;
      hideContextMenu();
      
      switch (action) {
        case 'new-file': {
          const name = prompt('New file name:');
          if (!name) return;
          const dir = target.type === 'directory' ? target.path : target.path.split('/').slice(0, -1).join('/');
          const newPath = dir ? dir + '/' + name : name;
          await writeFile(newPath, '');
          await refreshFileTree();
          openFile(newPath);
          break;
        }
        case 'new-folder': {
          const name = prompt('New folder name:');
          if (!name) return;
          const dir = target.type === 'directory' ? target.path : target.path.split('/').slice(0, -1).join('/');
          const newPath = dir ? dir + '/' + name : name;
          await createDirectory(newPath);
          await refreshFileTree();
          break;
        }
        case 'rename': {
          const newName = prompt('New name:', target.name);
          if (!newName || newName === target.name) return;
          // Would need a rename API endpoint
          alert('Rename not implemented yet');
          break;
        }
        case 'delete': {
          if (!confirm(\`Delete "\${target.name}"?\`)) return;
          await deleteFile(target.path);
          if (state.openTabs.includes(target.path)) {
            closeTab(target.path);
          }
          await refreshFileTree();
          break;
        }
      }
    }
    
    // ==================== Keyboard Shortcuts ====================
    
    function setupKeyboardShortcuts() {
      document.addEventListener('keydown', (e) => {
        // Use Cmd on Mac, Ctrl on Windows/Linux
        const modKey = e.metaKey || e.ctrlKey;
        
        // Cmd/Ctrl+S - Save
        if (modKey && e.key === 's') {
          e.preventDefault();
          saveCurrentFile();
        }
        
        // Cmd/Ctrl+B - Toggle sidebar
        if (modKey && e.key === 'b') {
          e.preventDefault();
          elements.sidebar.classList.toggle('collapsed');
        }
        
        // Cmd/Ctrl+W - Close tab
        if (modKey && e.key === 'w') {
          e.preventDefault();
          if (state.activeTab) {
            closeTab(state.activeTab);
          }
        }
        
        // Cmd/Ctrl+P - Focus file search / Quick open
        if (modKey && e.key === 'p') {
          e.preventDefault();
          elements.sidebar.classList.remove('collapsed');
          elements.fileSearch.focus();
          elements.fileSearch.select();
        }
        
        // Cmd/Ctrl+Tab - Next tab
        if (modKey && e.key === 'Tab' && !e.shiftKey) {
          e.preventDefault();
          if (state.openTabs.length > 1) {
            const idx = state.openTabs.indexOf(state.activeTab);
            const nextIdx = (idx + 1) % state.openTabs.length;
            switchToTab(state.openTabs[nextIdx]);
          }
        }
        
        // Cmd/Ctrl+Shift+Tab - Previous tab
        if (modKey && e.shiftKey && e.key === 'Tab') {
          e.preventDefault();
          if (state.openTabs.length > 1) {
            const idx = state.openTabs.indexOf(state.activeTab);
            const prevIdx = (idx - 1 + state.openTabs.length) % state.openTabs.length;
            switchToTab(state.openTabs[prevIdx]);
          }
        }
        
        // Cmd/Ctrl+Shift+C - Toggle chat sidebar
        if (modKey && e.shiftKey && (e.key === 'c' || e.key === 'C')) {
          e.preventDefault();
          toggleChatSidebar();
        }
        
        // Escape - Hide context menu and clear search
        if (e.key === 'Escape') {
          hideContextMenu();
          if (document.activeElement === elements.fileSearch) {
            elements.fileSearch.blur();
            searchQuery = '';
            elements.fileSearch.value = '';
            refreshFileTree();
          }
        }
      });
    }
    
    function setupFileSearch() {
      elements.fileSearch.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        refreshFileTree();
      });
      
      elements.fileSearch.addEventListener('keydown', (e) => {
        // Enter key opens first matching file
        if (e.key === 'Enter' && searchQuery) {
          const firstFile = elements.fileTree.querySelector('.tree-item:not(.directory)');
          if (firstFile) {
            openFile(firstFile.dataset.path);
            searchQuery = '';
            elements.fileSearch.value = '';
            elements.fileSearch.blur();
          }
        }
      });
    }
    
    // ==================== Resize Handle ====================
    
    function setupResizeHandle() {
      const handle = document.getElementById('resize-handle');
      let isResizing = false;
      
      handle.addEventListener('mousedown', () => {
        isResizing = true;
        document.body.style.cursor = 'col-resize';
      });
      
      document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const newWidth = e.clientX;
        if (newWidth >= 200 && newWidth <= 400) {
          elements.sidebar.style.width = newWidth + 'px';
        }
      });
      
      document.addEventListener('mouseup', () => {
        isResizing = false;
        document.body.style.cursor = '';
      });
    }
    
    // ==================== Chat Sidebar ====================
    
    function generateRequestId() {
      return 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
    
    function connectChat() {
      if (state.chatWs && state.chatWs.readyState === WebSocket.OPEN) return;
      
      const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
      const wsUrl = protocol + '://' + location.host;
      
      updateChatStatus('connecting');
      
      try {
        state.chatWs = new WebSocket(wsUrl);
        
        state.chatWs.addEventListener('open', () => {
          console.log('[IDE Chat] Connected');
          state.chatConnected = true;
          state.chatReconnectAttempts = 0;
          updateChatStatus('connected');
          
          // Send connect frame
          sendChatFrame('connect', {
            clientType: 'ide',
            version: '1.0.0',
          });
        });
        
        state.chatWs.addEventListener('message', (event) => {
          try {
            const frame = JSON.parse(event.data);
            handleChatFrame(frame);
          } catch (err) {
            console.error('[IDE Chat] Failed to parse message:', err);
          }
        });
        
        state.chatWs.addEventListener('close', (event) => {
          console.log('[IDE Chat] Disconnected:', event.code, event.reason);
          state.chatConnected = false;
          updateChatStatus('disconnected');
          
          // Auto-reconnect
          if (state.chatReconnectAttempts < state.chatMaxReconnectAttempts) {
            state.chatReconnectAttempts++;
            const delay = Math.min(1000 * Math.pow(2, state.chatReconnectAttempts - 1), 30000);
            console.log('[IDE Chat] Reconnecting in ' + delay + 'ms (attempt ' + state.chatReconnectAttempts + ')');
            setTimeout(connectChat, delay);
          } else {
            updateChatStatus('error');
          }
        });
        
        state.chatWs.addEventListener('error', (err) => {
          console.error('[IDE Chat] WebSocket error:', err);
          updateChatStatus('error');
        });
      } catch (err) {
        console.error('[IDE Chat] Failed to connect:', err);
        updateChatStatus('error');
      }
    }
    
    function sendChatFrame(method, params) {
      if (!state.chatWs || state.chatWs.readyState !== WebSocket.OPEN) {
        console.warn('[IDE Chat] Cannot send - not connected');
        return null;
      }
      
      const id = generateRequestId();
      const frame = { method, params, id };
      state.chatWs.send(JSON.stringify(frame));
      return id;
    }
    
    function handleChatFrame(frame) {
      // Handle response to a pending request
      if (frame.id && state.chatPendingRequests.has(frame.id)) {
        const pending = state.chatPendingRequests.get(frame.id);
        state.chatPendingRequests.delete(frame.id);
        
        if (frame.error) {
          pending.reject(new Error(frame.error.message || 'Unknown error'));
        } else {
          pending.resolve(frame.result);
        }
        return;
      }
      
      // Handle chat events (streaming responses)
      if (frame.method === 'chat.event') {
        const event = frame.params;
        
        if (event.state === 'delta') {
          // Streaming content
          if (event.message?.content) {
            const content = typeof event.message.content === 'string' 
              ? event.message.content 
              : event.message.content.map(c => c.text || '').join('');
            
            if (state.chatCurrentStreamId !== event.runId) {
              // New stream - add a new message
              state.chatCurrentStreamId = event.runId;
              state.chatStreamingContent = content;
              addChatMessage('assistant', content, true);
            } else {
              // Continue stream - update existing message
              state.chatStreamingContent = content;
              updateStreamingMessage(content);
            }
          }
        } else if (event.state === 'final') {
          // Stream complete
          if (state.chatCurrentStreamId === event.runId) {
            finalizeStreamingMessage();
            state.chatCurrentStreamId = null;
            state.chatStreamingContent = '';
          }
        } else if (event.state === 'error') {
          // Error
          if (state.chatCurrentStreamId === event.runId) {
            finalizeStreamingMessage();
            state.chatCurrentStreamId = null;
          }
          addChatMessage('system', 'Error: ' + (event.errorMessage || 'Unknown error'));
        } else if (event.state === 'aborted') {
          // Aborted
          if (state.chatCurrentStreamId === event.runId) {
            finalizeStreamingMessage();
            state.chatCurrentStreamId = null;
          }
          addChatMessage('system', 'Response aborted');
        }
      }
    }
    
    function updateChatStatus(status) {
      const statusEl = elements.chatStatus;
      if (!statusEl) return;
      
      statusEl.className = '';
      statusEl.classList.add(status);
      
      const titles = {
        connected: 'Connected',
        connecting: 'Connecting...',
        disconnected: 'Disconnected',
        error: 'Connection failed',
      };
      statusEl.title = titles[status] || status;
    }
    
    function addChatMessage(role, content, streaming = false) {
      // Remove empty state if present
      const emptyState = elements.chatMessages.querySelector('.chat-empty');
      if (emptyState) emptyState.remove();
      
      const msg = document.createElement('div');
      msg.className = 'chat-message ' + role;
      if (streaming) msg.classList.add('streaming');
      msg.dataset.role = role;
      
      const senderNames = {
        user: 'You',
        assistant: 'Assistant',
        system: '',
      };
      
      msg.innerHTML = \`
        \${senderNames[role] ? '<div class="sender">' + senderNames[role] + '</div>' : ''}
        <div class="content">\${escapeHtml(content)}</div>
      \`;
      
      elements.chatMessages.appendChild(msg);
      elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
      
      // Store in state
      state.chatMessages.push({ role, content, streaming });
    }
    
    function updateStreamingMessage(content) {
      const messages = elements.chatMessages.querySelectorAll('.chat-message.streaming');
      const lastStreaming = messages[messages.length - 1];
      if (lastStreaming) {
        const contentEl = lastStreaming.querySelector('.content');
        if (contentEl) {
          contentEl.textContent = content;
          elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
        }
      }
    }
    
    function finalizeStreamingMessage() {
      const messages = elements.chatMessages.querySelectorAll('.chat-message.streaming');
      messages.forEach(msg => msg.classList.remove('streaming'));
    }
    
    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
    
    async function sendChatMessage() {
      const input = elements.chatInput;
      const message = input.value.trim();
      if (!message) return;
      
      // Disable input while sending
      input.disabled = true;
      elements.chatSendBtn.disabled = true;
      
      // Add user message to UI
      addChatMessage('user', message);
      input.value = '';
      autoResizeInput();
      
      try {
        // Send to gateway
        const id = sendChatFrame('chat.send', {
          sessionKey: state.chatSessionKey,
          message: message,
        });
        
        if (!id) {
          addChatMessage('system', 'Failed to send - not connected');
        }
      } catch (err) {
        console.error('[IDE Chat] Send failed:', err);
        addChatMessage('system', 'Failed to send message');
      } finally {
        input.disabled = false;
        elements.chatSendBtn.disabled = false;
        input.focus();
      }
    }
    
    function toggleChatSidebar() {
      const sidebar = elements.chatSidebar;
      const handle = elements.chatResizeHandle;
      
      if (sidebar.classList.contains('collapsed')) {
        sidebar.classList.remove('collapsed');
        handle.style.display = '';
        // Connect if not connected
        if (!state.chatConnected) {
          connectChat();
        }
      } else {
        sidebar.classList.add('collapsed');
        handle.style.display = 'none';
      }
      
      // Save preference
      localStorage.setItem('chatSidebarOpen', !sidebar.classList.contains('collapsed'));
    }
    
    function autoResizeInput() {
      const input = elements.chatInput;
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    }
    
    function setupChatSidebar() {
      // Connect on load if sidebar is open
      const savedOpen = localStorage.getItem('chatSidebarOpen');
      const shouldOpen = savedOpen === null ? ${config.chatDefaultOpen} : savedOpen === 'true';
      
      if (!shouldOpen) {
        elements.chatSidebar.classList.add('collapsed');
        elements.chatResizeHandle.style.display = 'none';
      } else {
        connectChat();
      }
      
      // Toggle button
      document.getElementById('toggle-chat')?.addEventListener('click', toggleChatSidebar);
      document.getElementById('chat-close-btn')?.addEventListener('click', toggleChatSidebar);
      
      // Send button
      elements.chatSendBtn?.addEventListener('click', sendChatMessage);
      
      // Input handling
      elements.chatInput?.addEventListener('keydown', (e) => {
        // Enter to send (without shift)
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendChatMessage();
        }
      });
      
      elements.chatInput?.addEventListener('input', autoResizeInput);
      
      // Resize handle for chat sidebar
      let isResizingChat = false;
      
      elements.chatResizeHandle?.addEventListener('mousedown', () => {
        isResizingChat = true;
        document.body.style.cursor = 'col-resize';
      });
      
      document.addEventListener('mousemove', (e) => {
        if (!isResizingChat) return;
        const containerWidth = document.getElementById('main').offsetWidth;
        const newWidth = containerWidth - e.clientX;
        if (newWidth >= 280 && newWidth <= 600) {
          elements.chatSidebar.style.width = newWidth + 'px';
        }
      });
      
      document.addEventListener('mouseup', () => {
        if (isResizingChat) {
          isResizingChat = false;
          document.body.style.cursor = '';
        }
      });
    }
    
    // ==================== Initialize ====================
    
    async function init() {
      // Load Monaco
      require.config({
        paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@${monacoVersion}/min/vs' }
      });
      
      require(['vs/editor/editor.main'], async function() {
        // Create editor
        state.editor = monaco.editor.create(elements.editorContainer, {
          theme: '${theme}',
          fontSize: 14,
          fontFamily: "'Fira Code', 'Cascadia Code', Consolas, monospace",
          fontLigatures: true,
          minimap: { enabled: true },
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 2,
          wordWrap: 'off',
          lineNumbers: 'on',
          renderLineHighlight: 'all',
          cursorBlinking: 'smooth',
          smoothScrolling: true,
        });
        
        // Save view state on switch
        state.editor.onDidChangeCursorPosition(() => {
          if (state.activeTab) {
            const viewState = state.editor.saveViewState();
            localStorage.setItem('viewState:' + state.activeTab, JSON.stringify(viewState));
          }
        });
        
        // Load file tree
        await refreshFileTree();
        
        // Setup UI
        setupKeyboardShortcuts();
        setupResizeHandle();
        setupFileSearch();
        setupChatSidebar();
        
        // Context menu handlers
        elements.contextMenu.querySelectorAll('.context-item').forEach(item => {
          item.addEventListener('click', () => handleContextAction(item.dataset.action));
        });
        document.addEventListener('click', hideContextMenu);
        
        // Toolbar buttons
        document.getElementById('toggle-sidebar').addEventListener('click', () => {
          elements.sidebar.classList.toggle('collapsed');
        });
        document.getElementById('refresh-btn').addEventListener('click', refreshFileTree);
        document.getElementById('collapse-btn').addEventListener('click', () => {
          state.expandedDirs.clear();
          state.expandedDirs.add('');
          refreshFileTree();
        });
        document.getElementById('new-file-btn').addEventListener('click', async () => {
          const name = prompt('New file name:');
          if (!name) return;
          await writeFile(name, '');
          await refreshFileTree();
          openFile(name);
        });
        
        // Restore open tabs from localStorage
        const savedTabs = localStorage.getItem('openTabs');
        const savedActive = localStorage.getItem('activeTab');
        if (savedTabs) {
          const tabs = JSON.parse(savedTabs);
          for (const path of tabs) {
            state.openTabs.push(path);
          }
          if (savedActive && state.openTabs.includes(savedActive)) {
            await switchToTab(savedActive);
          } else if (state.openTabs.length > 0) {
            await switchToTab(state.openTabs[0]);
          }
          renderTabs();
        }
        
        // Save tabs on change
        const saveTabs = () => {
          localStorage.setItem('openTabs', JSON.stringify(state.openTabs));
          localStorage.setItem('activeTab', state.activeTab || '');
        };
        setInterval(saveTabs, 5000);
        window.addEventListener('beforeunload', saveTabs);
        
        // Hide loading
        elements.loading.classList.add('hidden');
      });
    }
    
    init();
  </script>
</body>
</html>`;
}

export { EXTENSION_TO_LANGUAGE };
