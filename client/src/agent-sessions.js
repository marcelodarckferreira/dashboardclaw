export function initAgentSessions() {
  const container = document.getElementById("view-sessions");
  if (!container) return;
  container.innerHTML = `
    <div class="page-header">
      <h1>Sessões</h1>
      <p>Controle e histórico de sessões dos agentes.</p>
    </div>
    <div class="panel">
      <div class="panel-body" style="text-align:center;padding:3rem;color:var(--text-muted)">
        <i class="ph ph-list-bullets" style="font-size:3rem;display:block;margin-bottom:1rem"></i>
        <strong>Em desenvolvimento</strong> — Sub-projeto 4
      </div>
    </div>
  `;
}
