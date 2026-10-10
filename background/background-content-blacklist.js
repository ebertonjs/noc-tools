// =============================================================================
// CONTENT SCRIPT - MODAL VERIFICADOR DE IP (NOC EXTENSION)
// =============================================================================

(() => {
  const MODAL_ID = "noc-ip-checker-modal";
  const OVERLAY_ID = "noc-ip-checker-overlay";

  if (document.getElementById(MODAL_ID) || document.getElementById(OVERLAY_ID)) return;

  // ----------------------------
  // Helpers
  // ----------------------------
  function escapeHtml(str) {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function setUserInfoLoading(isLoading) {
    const btn = document.getElementById("noc-btn-refresh-userip");
    const status = document.getElementById("noc-userip-status");
    if (!btn || !status) return;

    btn.disabled = !!isLoading;
    status.textContent = isLoading ? "Carregando..." : "";
  }

  function setUserInfoError(msg) {
    const box = document.getElementById("noc-userip-box");
    const status = document.getElementById("noc-userip-status");
    if (!box || !status) return;

    box.innerHTML = `
      <div class="noc-stat-box">
        <div class="noc-stat-main">❌ Falha ao obter informações do IP</div>
        <div class="noc-stat-sub">${escapeHtml(msg || "Erro desconhecido.")}</div>
      </div>
    `;
    status.textContent = "";
  }

  function renderUserIpInfo(data) {
    const box = document.getElementById("noc-userip-box");
    if (!box) return;

    const ipv4 = data?.ipv4 ? escapeHtml(data.ipv4) : "N/A";
    const ipv6 = data?.ipv6 ? escapeHtml(data.ipv6) : null;
    const geo = data?.geoText ? escapeHtml(data.geoText) : "N/A";

    box.innerHTML = `
      <div class="noc-stat-box" style="margin-bottom:12px;">
        <div class="noc-stat-main">IP Público IPV4 detectado: <strong>${ipv4}</strong></div>
        <div class="noc-stat-sub">
          IP Público IPV6 detectado: <strong>${ipv6 ? ipv6 : "não disponível"}</strong><br/>
          Detalhes do IP (Geo/ISP/ASN/Hosting) abaixo.
        </div>
      </div>

      <div class="pop-card" style="margin-bottom:0;">
        <div class="pop-header">
          <div class="pop-title-container">
            <span class="pop-title">📍 Informações do IP</span>
            <span class="pop-count">USER</span>
          </div>
        </div>
        <pre class="pop-content">${geo}</pre>
      </div>
    `;
  }

  function loadUserIpInfo() {
    setUserInfoLoading(true);

    chrome.runtime.sendMessage({ action: "getUserIpInfo" }, (resp) => {
      setUserInfoLoading(false);

      if (chrome.runtime.lastError) {
        setUserInfoError(chrome.runtime.lastError.message);
        return;
      }

      if (!resp || !resp.success) {
        setUserInfoError(resp?.message || "Resposta inválida do background.");
        return;
      }

      renderUserIpInfo(resp.data);
    });
  }

  function setCheckLoading(isLoading) {
    const btn = document.getElementById("noc-btn-checkip");
    const status = document.getElementById("noc-check-status");
    if (!btn || !status) return;

    btn.disabled = !!isLoading;
    status.textContent = isLoading ? "Consultando..." : "";
  }

  function setReport(text) {
    const out = document.getElementById("noc-report");
    if (!out) return;
    out.value = text || "";
  }

  // ----------------------------
  // CSS (padrão do seu tema modernizado)
  // ----------------------------
  const style = document.createElement("style");
  style.textContent = `
    #${OVERLAY_ID}{
      position: fixed;
      inset: 0;
      background: transparent;
      z-index: 9999;
    }

    #${MODAL_ID}{
      position: fixed;
      top: 20px;
      left: 20px;

      width: 500px; /* menor */
      max-width: calc(100vw - 40px);
      height: auto;
      max-height: calc(100vh - 40px);

      background-color: var(--noc-surface, #ffffff);
      box-shadow: 0 20px 60px rgb(var(--noc-pri-rgb, 46 125 50) / 0.2), 0 0 1px rgba(0, 0, 0, 0.1);
      border-radius: 12px;
      padding: 0;

      z-index: 10000;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;

      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    #noc-header{
      background: linear-gradient(135deg, var(--noc-pri, #2E7D32) 0%, var(--noc-pri2, #1B5E20) 100%);
      padding: 16px 18px;
      position: relative;
      border-radius: 12px 12px 0 0;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
    }

    #noc-title-area{ flex: 1; }

    #noc-title{
      font-size: 1.08em;
      font-weight: 600;
      color: var(--noc-on-pri, #ffffff);
      margin: 0 0 4px 0;
      letter-spacing: -0.2px;
    }

    #noc-subtitle{
      font-size: 0.8em;
      color: rgba(255, 255, 255, 0.82);
      margin: 0;
      font-weight: 400;
    }

    #noc-close{
      background: rgba(255, 255, 255, 0.2);
      backdrop-filter: blur(10px);
      border: none;
      font-size: 1.05em;
      cursor: pointer;
      color: var(--noc-on-pri, #ffffff);
      width: 30px;
      height: 30px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
      flex: 0 0 auto;
    }
    #noc-close:hover{
      background: rgba(255, 255, 255, 0.3);
      transform: scale(1.05);
    }

    #noc-body{
      flex-grow: 1;
      overflow-y: auto;
      padding: 16px;
      max-height: calc(100vh - 210px);
      background: var(--noc-surface, #ffffff);
    }

    .noc-stat-box{
      padding: 12px;
      background-color: var(--noc-surface2, #F4F8F4);
      border-left: 4px solid var(--noc-pri, #2E7D32);
      border-radius: 6px;
      margin-bottom: 12px;
      color: var(--noc-text, #1F2A22);
    }
    .noc-stat-main{
      font-weight: 600;
      font-size: 0.9em;
      margin-bottom: 4px;
      color: var(--noc-text, #17231A);
    }
    .noc-stat-sub{
      font-size: 0.8em;
      line-height: 1.5;
      color: var(--noc-text2, #6B7A6E);
    }

    .pop-card{
      background-color: var(--noc-surface2, #F4F8F4);
      border: 2px solid var(--noc-border, #E3EBE4);
      border-radius: 8px;
      margin-bottom: 12px;
      overflow: hidden;
      transition: all 0.2s ease;
    }
    .pop-card:hover{
      border-color: var(--noc-border2, #C9D8CB);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
    }

    .pop-header{
      padding: 10px 12px;
      background-color: var(--noc-surface, #ffffff);
      border-bottom: 2px solid var(--noc-border, #E3EBE4);
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }

    .pop-title-container{
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .pop-title{
      font-weight: 600;
      color: var(--noc-text, #17231A);
      font-size: 0.9em;
    }

    .pop-count{
      background: linear-gradient(135deg, var(--noc-pri, #2E7D32) 0%, var(--noc-pri2, #1B5E20) 100%);
      color: var(--noc-on-pri, #ffffff);
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 0.7em;
      font-weight: 600;
    }

    .pop-actions{
      display: flex;
      gap: 10px;
      align-items: center;
      flex-wrap: wrap;
    }

    .pop-content{
      width: 100%;
      background-color: var(--noc-surface, #ffffff);
      color: var(--noc-text, #1F2A22);
      padding: 12px;
      font-family: 'JetBrains Mono','Fira Code','Consolas','Monaco', monospace;
      font-size: 11px;
      line-height: 1.5;
      resize: none;
      outline: none;
      border: none;
      box-sizing: border-box;
      white-space: pre-wrap;
      display: block;
      overflow-x: auto;
      margin: 0;
    }

    .noc-input{
      width: 220px;
      max-width: 100%;
      background: var(--noc-surface, #ffffff);
      color: var(--noc-text, #1F2A22);
      border: 2px solid var(--noc-border, #E3EBE4);
      border-radius: 8px;
      padding: 9px 10px;
      outline: none;
      font-size: 13px;
      transition: all .2s ease;
    }
    .noc-input:focus{
      border-color: var(--noc-pri, #2E7D32);
      box-shadow: 0 0 0 3px rgb(var(--noc-pri-rgb, 46 125 50) / 0.15);
    }

    .noc-textarea{
      width: 100%;
      min-height: 190px;
      background: var(--noc-surface, #ffffff);
      color: var(--noc-text, #1F2A22);
      border: 2px solid var(--noc-border, #E3EBE4);
      border-radius: 8px;
      padding: 12px;
      font-family: 'JetBrains Mono','Fira Code','Consolas','Monaco', monospace;
      font-size: 11px;
      line-height: 1.5;
      resize: vertical;
      outline: none;
      box-sizing: border-box;
      margin-top: 10px;
    }
    .noc-textarea:focus{
      border-color: var(--noc-pri, #2E7D32);
      box-shadow: 0 0 0 3px rgb(var(--noc-pri-rgb, 46 125 50) / 0.15);
    }

    #noc-footer{
      display: flex;
      gap: 10px;
      border-top: 1px solid var(--noc-border, #E3EBE4);
      padding: 14px 16px;
      background-color: var(--noc-surface2, #fafafa);
      border-radius: 0 0 12px 12px;
      align-items: center;
      flex-wrap: wrap;
    }

    .noc-btn{
      padding: 10px 14px;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 600;
      font-size: 13px;
      transition: all 0.3s ease;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }

    .noc-btn-primary{
      background: linear-gradient(135deg, var(--noc-pri, #2E7D32) 0%, var(--noc-pri2, #1B5E20) 100%);
      color: var(--noc-on-pri, #ffffff);
      box-shadow: 0 4px 12px rgb(var(--noc-pri-rgb, 46 125 50) / 0.3);
    }
    .noc-btn-primary:hover{
      transform: translateY(-2px);
      box-shadow: 0 6px 16px rgb(var(--noc-pri-rgb, 46 125 50) / 0.4);
    }

    .noc-btn-secondary{
      background: var(--noc-tint, #E8F5E9);
      color: var(--noc-accent, #2E7D32);
      box-shadow: none;
    }
    .noc-btn-secondary:hover{
      background: var(--noc-tint2, #C8E6C9);
    }

    .noc-btn:disabled{
      opacity: .55;
      cursor: not-allowed;
      transform: none !important;
    }

    .noc-status{
      font-size: 12px;
      color: var(--noc-text2, #6B7A6E);
      font-weight: 600;
    }

    #noc-body::-webkit-scrollbar{ width: 8px; }
    #noc-body::-webkit-scrollbar-track{ background: var(--noc-surface2, #f1f1f1); border-radius: 4px; }
    #noc-body::-webkit-scrollbar-thumb{ background: var(--noc-border2, #C9D8CB); border-radius: 4px; }
    #noc-body::-webkit-scrollbar-thumb:hover{ background: var(--noc-text2, #9AAD9D); }
  `;
  document.documentElement.appendChild(style);

  // ----------------------------
  // HTML
  // ----------------------------
  const overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;

  const modal = document.createElement("div");
  modal.id = MODAL_ID;

  modal.innerHTML = `
    <div id="noc-header">
      <div id="noc-title-area">
        <h2 id="noc-title">🛡️ Verificador de IP</h2>
        <p id="noc-subtitle">IP do usuário + análise multifonte de reputação</p>
      </div>
      <button id="noc-close" aria-label="Fechar">✕</button>
    </div>

    <div id="noc-body">
      <div class="pop-card">
        <div class="pop-header">
          <div class="pop-title-container">
            <span class="pop-title">📌 IP do Usuário</span>
            <span class="pop-count">AUTO</span>
          </div>

          <div class="pop-actions">
            <button class="noc-btn noc-btn-secondary" id="noc-btn-refresh-userip">Atualizar</button>
            <span class="noc-status" id="noc-userip-status"></span>
          </div>
        </div>

        <div style="padding:12px;" id="noc-userip-box">
          <div class="noc-stat-box" style="margin:0;">
            <div class="noc-stat-main">Carregando...</div>
            <div class="noc-stat-sub">Buscando IP público (IPv4/IPv6) e detalhes.</div>
          </div>
        </div>
      </div>

      <div class="pop-card">
        <div class="pop-header">
          <div class="pop-title-container">
            <span class="pop-title">🔎 Analisar outro IP</span>
            <span class="pop-count">IP</span>
          </div>

          <div class="pop-actions">
            <input class="noc-input" id="noc-ip-input" placeholder="Ex: 8.8.8.8" />
            <button class="noc-btn noc-btn-primary" id="noc-btn-checkip">Analisar</button>
            <span class="noc-status" id="noc-check-status"></span>
          </div>
        </div>

        <div style="padding:12px;">
          <textarea class="noc-textarea" id="noc-report" readonly placeholder="O relatório aparecerá aqui..."></textarea>
        </div>
      </div>
    </div>

    <div id="noc-footer">
      <button class="noc-btn noc-btn-secondary" id="noc-btn-clear">Limpar</button>
      <button class="noc-btn noc-btn-primary" id="noc-btn-copy">Copiar Relatório</button>
    </div>
  `;

  document.body.appendChild(overlay);
  document.body.appendChild(modal);
  function closeModal() {
    overlay.remove();
    modal.remove();
    style.remove();
    document.removeEventListener("keydown", onKeyDown);
  }

  function onKeyDown(e) {
    if (e.key === "Escape") closeModal();
  }

  overlay.addEventListener("click", closeModal);
  document.getElementById("noc-close").addEventListener("click", closeModal);
  document.addEventListener("keydown", onKeyDown);

  document.getElementById("noc-btn-refresh-userip").addEventListener("click", () => {
    loadUserIpInfo();
  });

  document.getElementById("noc-btn-checkip").addEventListener("click", () => {
    const ip = (document.getElementById("noc-ip-input").value || "").trim();
    if (!ip) {
      setReport("❌ Informe um IP válido para analisar.");
      return;
    }

    setCheckLoading(true);
    setReport("");

    chrome.runtime.sendMessage({ action: "checkIpReputation", ip }, (resp) => {
      setCheckLoading(false);

      if (chrome.runtime.lastError) {
        setReport(`❌ Erro: ${chrome.runtime.lastError.message}`);
        return;
      }

      if (!resp || !resp.success) {
        setReport(`❌ Erro: ${resp?.message || "Falha ao analisar."}`);
        return;
      }

      setReport(resp.report || "");
    });
  });

  document.getElementById("noc-btn-clear").addEventListener("click", () => {
    document.getElementById("noc-ip-input").value = "";
    setReport("");
    const st = document.getElementById("noc-check-status");
    if (st) st.textContent = "";
  });

  document.getElementById("noc-btn-copy").addEventListener("click", async () => {
    const text = (document.getElementById("noc-report").value || "").trim();
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      const status = document.getElementById("noc-check-status");
      if (status) {
        status.textContent = "Copiado!";
        setTimeout(() => (status.textContent = ""), 1200);
      }
    } catch (e) {
      const status = document.getElementById("noc-check-status");
      if (status) status.textContent = "Falha ao copiar.";
    }
  });

  loadUserIpInfo();
})();
