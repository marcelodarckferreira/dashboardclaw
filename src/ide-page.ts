/**
 * IDE Page Generator
 * Creates a full-featured code editor interface using Monaco Editor (CDN)
 */

export interface IdePageConfig {
  monacoVersion: string;
  theme: "vs-dark" | "vs" | "hc-black";
}

const DEFAULT_CONFIG: IdePageConfig = {
  monacoVersion: "0.52.0",
  theme: "vs-dark",
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
    </div>
    
    <div id="main">
      <div id="sidebar">
        <div id="sidebar-header">
          <span>Explorer</span>
          <button id="collapse-btn" title="Collapse All">⊟</button>
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
              <div class="shortcut"><kbd>Ctrl+S</kbd> <span>Save file</span></div>
              <div class="shortcut"><kbd>Ctrl+B</kbd> <span>Toggle sidebar</span></div>
              <div class="shortcut"><kbd>Ctrl+P</kbd> <span>Quick open</span></div>
              <div class="shortcut"><kbd>Ctrl+W</kbd> <span>Close tab</span></div>
            </div>
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
    };
    
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
    
    function renderTree(node, container, depth = 0) {
      const sorted = sortTreeChildren(node.children);
      
      for (const child of sorted) {
        const item = document.createElement('div');
        item.className = 'tree-item' + (child.type === 'directory' ? ' directory' : '');
        item.style.paddingLeft = (12 + depth * 16) + 'px';
        item.dataset.path = child.path;
        item.dataset.type = child.type;
        
        const isExpanded = state.expandedDirs.has(child.path);
        
        if (child.type === 'directory') {
          item.innerHTML = \`
            <span class="chevron \${isExpanded ? 'expanded' : ''}">▶</span>
            <span class="icon">\${getFileIcon(child.name, child.type)}</span>
            <span class="name">\${child.name}</span>
          \`;
        } else {
          item.innerHTML = \`
            <span class="icon">\${getFileIcon(child.name, child.type)}</span>
            <span class="name">\${child.name}</span>
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
    
    function renderTabs() {
      elements.tabBar.innerHTML = '';
      
      for (const path of state.openTabs) {
        const tab = document.createElement('button');
        tab.className = 'tab' + (path === state.activeTab ? ' active' : '');
        if (state.unsavedChanges.has(path)) {
          tab.classList.add('modified');
        }
        
        const name = path.split('/').pop();
        tab.innerHTML = \`
          <span class="tab-name">\${name}</span>
          <span class="close-btn" title="Close">×</span>
        \`;
        
        tab.addEventListener('click', (e) => {
          if (e.target.classList.contains('close-btn')) {
            closeTab(path);
          } else {
            switchToTab(path);
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
        // Ctrl+S - Save
        if (e.ctrlKey && e.key === 's') {
          e.preventDefault();
          saveCurrentFile();
        }
        
        // Ctrl+B - Toggle sidebar
        if (e.ctrlKey && e.key === 'b') {
          e.preventDefault();
          elements.sidebar.classList.toggle('collapsed');
        }
        
        // Ctrl+W - Close tab
        if (e.ctrlKey && e.key === 'w') {
          e.preventDefault();
          if (state.activeTab) {
            closeTab(state.activeTab);
          }
        }
        
        // Escape - Hide context menu
        if (e.key === 'Escape') {
          hideContextMenu();
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
