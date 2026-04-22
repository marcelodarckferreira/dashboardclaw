export function initChat() {
  const container = document.getElementById("view-chat");
  if (!container) return;
  container.innerHTML = `
    <div class="page-header">
      <h1>Chat</h1>
      <p>Converse com seus agentes, troque modelos e sessões.</p>
    </div>
    <div class="panel">
      <div class="panel-body" style="text-align:center;padding:3rem;color:var(--text-muted)">
        <i class="ph ph-chat-circle-dots" style="font-size:3rem;display:block;margin-bottom:1rem"></i>
        <strong>Em desenvolvimento</strong> — Sub-projeto 3
      </div>
    </div>
  `;
}
