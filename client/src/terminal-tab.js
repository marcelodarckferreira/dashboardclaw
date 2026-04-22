export class TerminalTab {
  #sid = null;
  #term = null;
  #fit = null;
  #es = null;
  #container = null;
  #name;
  #alive = false;
  #command;
  #args;
  #cwd;

  constructor({ name, command = null, args = [], cwd = null }) {
    this.#name = name;
    this.#command = command;
    this.#args = args;
    this.#cwd = cwd;
  }

  get sid() { return this.#sid; }
  get name() { return this.#name; }
  set name(v) { this.#name = String(v); }
  get isAlive() { return this.#alive; }

  async open(container) {
    this.#container = container;

    // 1. Spawn PTY on the server
    const body = { name: this.#name };
    if (this.#command) { body.command = this.#command; body.args = this.#args; }
    if (this.#cwd) body.cwd = this.#cwd;

    const spawnRes = await fetch("/api/terminal/spawn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!spawnRes.ok) {
      const err = await spawnRes.json().catch(() => ({}));
      throw new Error(err.error || `Spawn failed: HTTP ${spawnRes.status}`);
    }

    const { sid } = await spawnRes.json();
    this.#sid = sid;

    // 2. Init xterm.js
    this.#term = new window.Terminal({
      cursorBlink: true,
      theme: { background: "#0f111a", foreground: "#eee" },
      fontFamily: "monospace",
      fontSize: 14,
    });
    this.#fit = new window.FitAddon.FitAddon();
    this.#term.loadAddon(this.#fit);
    this.#term.open(container);

    // 3. Connect SSE to the spawned PTY
    this.#es = new EventSource(`/api/terminal/stream?sid=${sid}`);

    this.#es.onmessage = (e) => {
      this.#term.write(atob(e.data));
    };

    this.#es.addEventListener("session", () => {
      // SSE confirmed — send initial resize
      this.#fit.fit();
      this.#sendResize();
    });

    this.#es.addEventListener("error", (e) => {
      try {
        const data = JSON.parse(e.data);
        this.#term.writeln(`\r\n\x1b[31mErro: ${data.error}\x1b[0m`);
      } catch {
        if (this.#alive) {
          this.#term.writeln("\r\n\x1b[31mConexão perdida com o terminal.\x1b[0m");
        }
      }
      this.#es.close();
      this.#alive = false;
    });

    this.#es.addEventListener("exit", (e) => {
      const { code } = JSON.parse(e.data);
      this.#term.writeln(
        `\r\n\x1b[33m[processo encerrado com código ${code}]\x1b[0m`,
      );
      this.#es.close();
      this.#alive = false;
    });

    // Browser → PTY: input
    this.#term.onData((data) => {
      if (!this.#sid) return;
      fetch("/api/terminal/input", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sid: this.#sid, data }),
      });
    });

    // Resize on window resize
    const onResize = () => {
      this.#fit?.fit();
      this.#sendResize();
    };
    window.addEventListener("resize", onResize);
    this._onResize = onResize;

    this.#alive = true;
  }

  activate() {
    if (!this.#container) return;
    this.#container.style.display = "block";
    // Give the browser a frame to render before fitting
    requestAnimationFrame(() => {
      this.#fit?.fit();
      this.#sendResize();
      this.#term?.focus();
    });
  }

  deactivate() {
    if (this.#container) this.#container.style.display = "none";
  }

  close() {
    this.#alive = false;
    this.#es?.close();
    this.#term?.dispose();
    if (this._onResize) window.removeEventListener("resize", this._onResize);
    if (this.#sid) {
      fetch(`/api/terminal/sessions/${this.#sid}`, { method: "DELETE" });
      this.#sid = null;
    }
  }

  #sendResize() {
    if (!this.#sid || !this.#term) return;
    fetch("/api/terminal/resize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sid: this.#sid,
        cols: this.#term.cols,
        rows: this.#term.rows,
      }),
    });
  }

  // Expose for external callers (e.g. embedded terminal resize)
  _sendResize() { this.#sendResize(); }
}
