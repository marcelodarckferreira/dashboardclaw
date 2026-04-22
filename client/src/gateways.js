import { setActiveGateway, getActiveGatewayId } from "./auth.js";

export async function initGateways() {
  const container = document.getElementById("view-gateways");
  if (!container) return;
  await renderGateways(container);
}

async function renderGateways(container) {
  let gateways = [];
  try {
    const res = await fetch("/api/gateways");
    if (res.ok) gateways = await res.json();
  } catch {
    container.innerHTML = `<p class="error-text">Erro ao carregar gateways.</p>`;
    return;
  }

  const activeId = getActiveGatewayId();

  container.innerHTML = `
    <div class="page-header">
      <h1>Gateways</h1>
      <p>Gerencie suas instâncias OpenClaw.</p>
    </div>

    <div class="panel" style="margin-bottom:1.5rem">
      <div class="panel-header"><h2>Adicionar Gateway</h2></div>
      <div class="panel-body">
        <form id="gw-add-form" class="gw-form">
          <input class="form-input" name="name" placeholder="Nome (ex: Produção)" required>
          <input class="form-input" name="host" placeholder="Host (ex: 192.168.1.10)" required>
          <input class="form-input" name="port" type="number" placeholder="Porta" value="18789" required>
          <input class="form-input" name="token" type="password" placeholder="Gateway Token" required>
          <button type="submit" class="btn btn-primary"><i class="ph ph-plus"></i> Adicionar</button>
        </form>
      </div>
    </div>

    <div class="panel">
      <div class="panel-header"><h2>Gateways cadastrados</h2></div>
      <div class="panel-body">
        ${
          gateways.length === 0
            ? `<p style="color:var(--text-muted)">Nenhum gateway cadastrado ainda.</p>`
            : `<ul class="gw-list">
                ${gateways
                  .map(
                    (g) => `
                  <li class="gw-item ${g.id === activeId ? "gw-active" : ""}">
                    <div class="gw-info">
                      <strong>${g.name}</strong>
                      <span>${g.host}:${g.port}</span>
                    </div>
                    <div class="gw-actions">
                      <button class="btn btn-primary btn-sm" data-action="connect" data-id="${g.id}">
                        <i class="ph ph-plug"></i> ${g.id === activeId ? "Conectado" : "Conectar"}
                      </button>
                      <button class="btn btn-secondary btn-sm" data-action="delete" data-id="${g.id}">
                        <i class="ph ph-trash"></i>
                      </button>
                    </div>
                  </li>
                `
                  )
                  .join("")}
              </ul>`
        }
      </div>
    </div>
  `;

  document.getElementById("gw-add-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const data = {
      name: form.name.value,
      host: form.host.value,
      port: Number(form.port.value),
      token: form.token.value,
    };
    const res = await fetch("/api/gateways", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      await renderGateways(container);
    } else {
      const err = await res.json();
      alert(`Erro: ${err.error}`);
    }
  });

  container.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const action = btn.dataset.action;
      const id = Number(btn.dataset.id);

      if (action === "connect") {
        await fetch(`/api/gateways/${id}/poll`, { method: "POST" });
        setActiveGateway(id);
        await renderGateways(container);
      }

      if (action === "delete") {
        if (!confirm("Remover este gateway?")) return;
        await fetch(`/api/gateways/${id}`, { method: "DELETE" });
        await renderGateways(container);
      }
    });
  });
}
