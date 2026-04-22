export function initChannels() {
  const container = document.getElementById("view-channels");
  if (!container) return;
  container.innerHTML = `
    <div class="page-header">
      <h1>Canais</h1>
      <p>Gerencie e opere os canais de comunicação dos seus agentes.</p>
    </div>
    <div class="panel">
      <div class="panel-body" style="text-align:center;padding:3rem;color:var(--text-muted)">
        <i class="ph ph-plugs" style="font-size:3rem;display:block;margin-bottom:1rem"></i>
        <strong>Em desenvolvimento</strong> — Sub-projeto 2
      </div>
    </div>
  `;
}
