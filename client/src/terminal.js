let terminalInitialized = false;

export function initTerminal() {
  if (terminalInitialized) return;
  terminalInitialized = true;

  const container = document.getElementById("terminal-container");
  if (!container) return;

  const term = new window.Terminal({
    cursorBlink: true,
    theme: { background: "#0f111a", foreground: "#eee" },
    fontFamily: "monospace",
    fontSize: 14,
  });

  const fitAddon = new window.FitAddon.FitAddon();
  term.loadAddon(fitAddon);
  term.open(container);
  fitAddon.fit();

  let sid = null;

  const eventSource = new EventSource("/api/terminal/stream");

  eventSource.addEventListener("session", (e) => {
    sid = JSON.parse(e.data).sid;
  });

  eventSource.onmessage = (e) => {
    term.write(atob(e.data));
  };

  eventSource.addEventListener("error", (e) => {
    try {
      const data = JSON.parse(e.data);
      term.writeln(`\r\n\x1b[31mErro: ${data.error}\x1b[0m`);
    } catch {
      term.writeln("\r\n\x1b[31mConexão perdida com o terminal.\x1b[0m");
    }
    eventSource.close();
  });

  eventSource.addEventListener("exit", (e) => {
    const { code } = JSON.parse(e.data);
    term.writeln(`\r\n\x1b[33m[processo encerrado com código ${code}]\x1b[0m`);
    eventSource.close();
  });

  term.onData((data) => {
    if (!sid) return;
    fetch("/api/terminal/input", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sid, data }),
    });
  });

  function sendResize() {
    if (!sid) return;
    fetch("/api/terminal/resize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sid, cols: term.cols, rows: term.rows }),
    });
  }

  window.addEventListener("resize", () => {
    fitAddon.fit();
    sendResize();
  });

  const resizeInterval = setInterval(() => {
    if (sid) {
      clearInterval(resizeInterval);
      sendResize();
    }
  }, 100);
}
