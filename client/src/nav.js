import { initTerminal } from "./terminal.js";
import { initGateways } from "./gateways.js";
import { initChannels } from "./channels.js";
import { initChat } from "./chat.js";
import { initAgentSessions } from "./agent-sessions.js";

const VIEW_INITS = {
  terminal: initTerminal,
  gateways: initGateways,
  channels: initChannels,
  chat: initChat,
  sessions: initAgentSessions,
};

const initialized = new Set();

export function initNav() {
  const navItems = document.querySelectorAll(".nav-item");
  const views = document.querySelectorAll(".view");

  navItems.forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();

      navItems.forEach((n) => n.classList.remove("active"));
      views.forEach((v) => v.classList.remove("active"));

      item.classList.add("active");

      const target = item.dataset.target;
      const view = document.getElementById(`view-${target}`);
      if (view) {
        view.classList.add("active");
        if (!initialized.has(target) && VIEW_INITS[target]) {
          VIEW_INITS[target]();
          initialized.add(target);
        }
      }
    });
  });

  document.querySelectorAll(".quick-actions .btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const icon = btn.querySelector("i");
      if (icon?.classList.contains("ph-arrows-clockwise")) {
        icon.style.transition = "transform 0.5s ease";
        icon.style.transform = "rotate(360deg)";
        setTimeout(() => {
          icon.style.transition = "none";
          icon.style.transform = "rotate(0deg)";
        }, 500);
      }
    });
  });
}
