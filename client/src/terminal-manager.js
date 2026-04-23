import { TerminalTab } from "./terminal-tab.js";

export const TERMINAL_PRESETS = [
  { id: "shell",    label: "Shell",       command: null,         args: [] },
  { id: "claude",   label: "Claude CLI",  command: "claude",    args: ["--dangerously-skip-permissions"] },
  { id: "codex",    label: "Codex CLI",   command: "codex",     args: [] },
  { id: "gemini",   label: "Gemini CLI",  command: "gemini",    args: [] },
  { id: "openclaw", label: "OpenClaw",    command: "openclaw",  args: [] },
];

const MAX_TABS = 8;

class TerminalManagerClass {
  #tabs = [];        // Array<{ tab: TerminalTab, paneEl: HTMLElement }>
  #activeIndex = -1;
  #tabBarEl = null;
  #bodyEl = null;
  #initialized = false;

  init(viewContainerId) {
    if (this.#initialized) return;
    this.#initialized = true;

    const view = document.getElementById(viewContainerId);
    if (!view) return;

    view.innerHTML = `
      <div class="terminal-toolbar">
        <div class="terminal-tabs" id="terminal-tabs"></div>
        <div class="terminal-add-wrapper">
          <button class="terminal-add-btn" id="terminal-add-btn" title="Novo terminal">
            <i class="ph ph-plus"></i>
          </button>
          <div class="terminal-preset-dropdown hidden" id="terminal-preset-dropdown">
            ${TERMINAL_PRESETS.map(
              (p) =>
                `<button class="terminal-preset-item" data-preset="${p.id}">${p.label}</button>`,
            ).join("")}
            <div class="terminal-preset-divider"></div>
            <button class="terminal-preset-item" data-preset="custom">Custom…</button>
            <div class="terminal-custom-input hidden" id="terminal-custom-input">
              <input type="text" placeholder="ex: node -i" id="terminal-custom-cmd">
              <button class="btn btn-primary btn-sm" id="terminal-custom-ok">Abrir</button>
            </div>
          </div>
        </div>
      </div>
      <div class="terminal-body" id="terminal-body"></div>
    `;

    this.#tabBarEl = document.getElementById("terminal-tabs");
    this.#bodyEl = document.getElementById("terminal-body");

    this.#bindAddButton();
    this.openTab({ preset: "shell" });
  }

  async openTab({ preset, command, args, label } = {}) {
    if (this.#tabs.length >= MAX_TABS) {
      alert(`Máximo de ${MAX_TABS} terminais simultâneos atingido.`);
      return null;
    }

    let name = label ?? null;
    let cmd = command ?? null;
    let cmdArgs = args ?? [];

    if (preset && preset !== "custom") {
      const p = TERMINAL_PRESETS.find((x) => x.id === preset);
      if (p) {
        name = name ?? p.label;
        cmd = p.command;
        cmdArgs = p.args;
      }
    }
    name = name ?? "Shell";

    const paneEl = document.createElement("div");
    paneEl.className = "terminal-pane";
    paneEl.style.display = "none";
    this.#bodyEl.appendChild(paneEl);

    const tab = new TerminalTab({ name, command: cmd, args: cmdArgs });

    try {
      await tab.open(paneEl);
    } catch (err) {
      paneEl.remove();
      alert(`Erro ao abrir terminal: ${err.message}`);
      return null;
    }

    this.#tabs.push({ tab, paneEl });
    this.#renderTabBar();
    this.#activateTab(this.#tabs.length - 1);

    return tab;
  }

  async openEmbedded(containerId, { preset, command, args, label } = {}) {
    const container =
      typeof containerId === "string"
        ? document.getElementById(containerId)
        : containerId;
    if (!container) throw new Error(`Container não encontrado: ${containerId}`);

    let name = label ?? "Terminal";
    let cmd = command ?? null;
    let cmdArgs = args ?? [];

    if (preset) {
      const p = TERMINAL_PRESETS.find((x) => x.id === preset);
      if (p) {
        name = label ?? p.label;
        cmd = p.command;
        cmdArgs = p.args;
      }
    }

    const tab = new TerminalTab({ name, command: cmd, args: cmdArgs });
    await tab.open(container);
    tab.activate();
    return tab;
  }

  #activateTab(index) {
    this.#tabs.forEach(({ tab, paneEl }, i) => {
      if (i === index) {
        paneEl.style.display = "block";
        tab.activate();
      } else {
        tab.deactivate();
        paneEl.style.display = "none";
      }
    });
    this.#activeIndex = index;
    this.#renderTabBar();
  }

  #closeTab(index) {
    const { tab, paneEl } = this.#tabs[index];
    tab.close();
    paneEl.remove();
    this.#tabs.splice(index, 1);

    if (this.#tabs.length === 0) {
      this.openTab({ preset: "shell" });
    } else {
      this.#activateTab(Math.min(index, this.#tabs.length - 1));
    }
  }

  #renderTabBar() {
    if (!this.#tabBarEl) return;
    this.#tabBarEl.innerHTML = this.#tabs
      .map(
        ({ tab }, i) => `
        <div class="terminal-tab ${i === this.#activeIndex ? "active" : ""}"
             data-index="${i}">
          <span class="terminal-tab-label"
                contenteditable="true"
                spellcheck="false">${tab.name}</span>
          <button class="terminal-tab-close" data-close="${i}">×</button>
        </div>
      `,
      )
      .join("");

    this.#tabBarEl.querySelectorAll(".terminal-tab").forEach((el) => {
      const i = Number(el.dataset.index);
      el.addEventListener("click", (e) => {
        if (!e.target.classList.contains("terminal-tab-close")) {
          this.#activateTab(i);
        }
      });
      el.querySelector(".terminal-tab-label").addEventListener("blur", (e) => {
        const newName = e.target.textContent.trim();
        if (newName) this.#tabs[i].tab.name = newName;
      });
    });

    this.#tabBarEl.querySelectorAll(".terminal-tab-close").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.#closeTab(Number(btn.dataset.close));
      });
    });
  }

  #bindAddButton() {
    const addBtn = document.getElementById("terminal-add-btn");
    const dropdown = document.getElementById("terminal-preset-dropdown");
    const customSection = document.getElementById("terminal-custom-input");
    const customCmd = document.getElementById("terminal-custom-cmd");
    const customOk = document.getElementById("terminal-custom-ok");

    addBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      dropdown.classList.toggle("hidden");
      customSection.classList.add("hidden");
    });

    document.addEventListener("click", () =>
      dropdown.classList.add("hidden"),
    );

    dropdown.querySelectorAll(".terminal-preset-item").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const preset = btn.dataset.preset;
        if (preset === "custom") {
          customSection.classList.toggle("hidden");
          customCmd.focus();
          return;
        }
        dropdown.classList.add("hidden");
        await this.openTab({ preset });
      });
    });

    customOk.addEventListener("click", async () => {
      const raw = customCmd.value.trim();
      if (!raw) return;
      const [cmd, ...rest] = raw.split(/\s+/);
      dropdown.classList.add("hidden");
      customCmd.value = "";
      await this.openTab({ command: cmd, args: rest, label: raw });
    });

    customCmd.addEventListener("keydown", async (e) => {
      if (e.key === "Enter") customOk.click();
    });
  }
}

export const terminalManager = new TerminalManagerClass();

export function initTerminalManager() {
  terminalManager.init("view-terminal");
}
