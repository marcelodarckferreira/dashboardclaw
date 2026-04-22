const STORAGE_KEY = "dashboardclaw_active_gateway";

export function getActiveGatewayId() {
  const val = localStorage.getItem(STORAGE_KEY);
  return val ? Number(val) : null;
}

export function setActiveGateway(id) {
  localStorage.setItem(STORAGE_KEY, String(id));
}

export function clearActiveGateway() {
  localStorage.removeItem(STORAGE_KEY);
}

function createModal(gateways) {
  const existing = document.getElementById("auth-modal");
  if (existing) existing.remove();

  const modal = document.createElement("div");
  modal.id = "auth-modal";
  modal.className = "auth-modal-overlay";
  modal.innerHTML = `
    <div class="auth-modal-card">
      <div class="auth-modal-logo">
        <i class="ph-fill ph-paw-print"></i>
        <span>OpenClaw</span>
      </div>
      <h2>Conectar ao Gateway</h2>
      ${
        gateways.length > 0
          ? `
        <select id="auth-gateway-select" class="auth-select">
          <option value="">Selecione um gateway...</option>
          ${gateways.map((g) => `<option value="${g.id}">${g.name} — ${g.host}:${g.port}</option>`).join("")}
        </select>
        <button id="auth-connect-btn" class="btn btn-primary" style="width:100%;margin-top:1rem">
          <i class="ph ph-plug"></i> Conectar
        </button>
        <hr style="margin:1rem 0;border-color:rgba(255,255,255,0.1)">
        `
          : ""
      }
      <p style="color:var(--text-muted);font-size:0.85rem;text-align:center">
        ${gateways.length === 0 ? "Nenhum gateway cadastrado." : "ou"}
      </p>
      <button id="auth-add-gw-btn" class="btn btn-secondary" style="width:100%;margin-top:0.5rem">
        <i class="ph ph-plus"></i> Cadastrar novo gateway
      </button>
    </div>
  `;
  document.body.appendChild(modal);

  const connectBtn = document.getElementById("auth-connect-btn");
  if (connectBtn) {
    connectBtn.addEventListener("click", () => {
      const select = document.getElementById("auth-gateway-select");
      const id = select ? Number(select.value) : 0;
      if (!id) return;
      setActiveGateway(id);
      modal.remove();
      window.location.reload();
    });
  }

  document.getElementById("auth-add-gw-btn")?.addEventListener("click", () => {
    modal.remove();
    const gwNav = document.querySelector('[data-target="gateways"]');
    if (gwNav) gwNav.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

export async function initAuth() {
  const originalFetch = window.fetch.bind(window);
  window.fetch = function (resource, config = {}) {
    const id = getActiveGatewayId();
    if (id && typeof resource === "string" && resource.startsWith("/api")) {
      config.headers = {
        ...config.headers,
        "X-Gateway-Id": String(id),
      };
    }
    return originalFetch(resource, config);
  };

  const activeId = getActiveGatewayId();
  if (activeId) return;

  let gateways = [];
  try {
    const res = await originalFetch("/api/gateways");
    if (res.ok) gateways = await res.json();
  } catch {
    // backend not yet available
  }

  createModal(gateways);
}
