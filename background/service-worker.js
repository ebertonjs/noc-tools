// =============================================================================
// SERVICE WORKER -
// =============================================================================

importScripts(
    'background-tema.js',
    'background-ia.js',
    'background-olt-modal.js',
    'background-alertas.js',
    'background-config-alerta.js',
    'background-blacklist.js',
    'background-OLT.js',
    'background-relatorio.js',
    'background-blacklist-modal.js',
    'background-content-hubsoft.js',
    'background-sticky-notes.js',
    'background-alert-server.js'

);

chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === "update" || details.reason === "install") {
        try {
            const response = await fetch(chrome.runtime.getURL('changelog/changelog.txt'));
            if (!response.ok) throw new Error("Arquivo não encontrado");
            const text = await response.text();
            const latestData = parseCustomChangelog(text);
            if (latestData && latestData.version) {
                console.log(`[UPDATER] Novidades encontradas para v${latestData.version}`);

                if (details.reason === "update") {
                    chrome.action.setBadgeText({ text: "NEW" });
                    chrome.action.setBadgeBackgroundColor({ color: "#cc0000ff" });
                    showUpdateToastOnActiveTab(latestData);
                }
            }
        } catch (e) {
            console.error("[UPDATER] Erro no changelog:", e);
        }
    }
});

// Páginas onde o Chrome nunca deixa injetar script (chrome://, Web Store, PDF viewer nativo, etc.)
function isPaginaInjetavelUpdate(url) {
    if (!url) return false;
    return /^https?:\/\//i.test(url) && !url.startsWith("https://chrome.google.com/webstore");
}

// Mostra um toast no canto superior direito da aba ativa avisando sobre a atualização,
// sem precisar abrir o popup da extensão. Segue o mesmo padrão de aviso em página já
// usado pelos Alertas Externos (Shadow DOM + fechamento automático).
async function showUpdateToastOnActiveTab(latestData) {
    try {
        const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });

        let targetTabId = null;
        if (activeTab?.id && isPaginaInjetavelUpdate(activeTab.url)) {
            targetTabId = activeTab.id;
        } else {
            const todasAbas = await chrome.tabs.query({});
            const fallback = todasAbas.find((t) => t.id && isPaginaInjetavelUpdate(t.url));
            targetTabId = fallback?.id || null;
        }

        if (!targetTabId) throw new Error("Nenhuma aba compatível para exibir o aviso de atualização.");

        await executarComTema({
                target: { tabId: targetTabId },
                func: renderUpdateToast,
                args: [{ version: latestData.version, changes: latestData.changes || [] }],
            })
            .catch(() => { }); // ex: permissão ainda não concedida nessa aba - ignora silenciosamente
    } catch (e) {
        // Sem aba compatível: fica só o badge "NEW" e o modal ao abrir o popup.
        console.warn("[UPDATER] Não foi possível exibir o aviso de atualização na página:", e);
    }
}


function renderUpdateToast({ version, changes }) {
    const hostId = "__noctools_update_toast__";
    if (document.getElementById(hostId)) return; // já exibido nessa aba

    const esc = (s) => {
        const div = document.createElement("div");
        div.textContent = s || "";
        return div.innerHTML;
    };

    let listHtml = "";
    (changes || []).forEach((change) => {
        const isCategoryEmoji = /^(🎨|📋|🤖|🚨|👥|✨|🔧|⚠️|🐛|🔥|📱|🎯)/.test(change);
        const isCategoryColon = change.trim().endsWith(":");

        if (isCategoryEmoji || isCategoryColon) {
            const cleanTitle = change.replace(/:$/, "").trim();
            listHtml += `<div class="changelog-category">${esc(cleanTitle)}</div>`;
        } else if (change.trim()) {
            listHtml += `
        <li class="changelog-item">
          <div class="changelog-bullet"></div>
          <span class="changelog-text">${esc(change)}</span>
        </li>
      `;
        }
    });

    const host = document.createElement("div");
    host.id = hostId;
    host.style.cssText = "all: initial; position: fixed; top: 16px; right: 16px; z-index: 2147483647;";
    const shadow = host.attachShadow({ mode: "open" });

    shadow.innerHTML = `
      <style>
        * { box-sizing: border-box; }

        .changelog-card {
          background: var(--noc-surface, #ffffff);
          width: 300px;
          max-height: 70vh;
          border-radius: 12px;
          box-shadow: 0 20px 60px rgb(var(--noc-pri-rgb, 46 125 50) / 0.2), 0 0 1px rgba(0, 0, 0, 0.1);
          overflow: hidden;
          display: flex;
          flex-direction: column;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          animation: slideIn 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
        }

        @keyframes slideIn {
          from { transform: translateY(-10px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }

        .changelog-header {
          background: linear-gradient(135deg, var(--noc-pri, #2E7D32) 0%, var(--noc-pri2, #1B5E20) 100%);
          padding: 14px 16px;
          color: var(--noc-on-pri, #ffffff);
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          position: relative;
        }

        .header-content {
          display: flex;
          align-items: center;
          gap: 8px;
          flex: 1;
        }

        .header-icon {
          font-size: 20px;
          line-height: 1;
        }

        .changelog-header h2 {
          margin: 0;
          font-size: 0.95em;
          color: var(--noc-on-pri, #ffffff);
          font-weight: 600;
          letter-spacing: -0.2px;
        }

        #close-changelog-x {
          background: rgba(255, 255, 255, 0.2);
          backdrop-filter: blur(10px);
          border: none;
          font-size: 13px;
          color: var(--noc-on-pri, #ffffff);
          cursor: pointer;
          width: 24px;
          height: 24px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
          flex-shrink: 0;
        }

        #close-changelog-x:hover {
          background: rgba(255, 255, 255, 0.3);
          transform: scale(1.05);
        }

        .changelog-body {
          padding: 14px 16px;
          overflow-y: auto;
          background: var(--noc-surface, #ffffff);
          flex: 1;
        }

        .changelog-list {
          list-style: none;
          padding: 0;
          margin: 0;
        }

        .changelog-category {
          font-size: 0.85em;
          font-weight: 700;
          color: var(--noc-text, #17231A);
          margin: 10px 0 6px 0;
          padding-bottom: 4px;
          border-bottom: 2px solid var(--noc-border, #E3EBE4);
          letter-spacing: -0.1px;
        }

        .changelog-category:first-child {
          margin-top: 0;
        }

        .changelog-item {
          margin-bottom: 6px;
          margin-left: 6px;
          display: flex;
          align-items: flex-start;
          font-size: 0.78em;
          line-height: 1.5;
          color: var(--noc-text2, #4A5A4D);
        }

        .changelog-bullet {
          min-width: 4px;
          height: 4px;
          background: var(--noc-pri, #2E7D32);
          border-radius: 50%;
          margin-top: 6px;
          margin-right: 8px;
          flex-shrink: 0;
        }

        .changelog-text {
          flex: 1;
        }

        .changelog-footer {
          padding: 10px 16px;
          border-top: 1px solid var(--noc-border, #E3EBE4);
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 8px;
          background: var(--noc-surface2, #fafafa);
        }

        .changelog-hint {
          font-size: 0.7em;
          color: var(--noc-text2, #6B7A6E);
          margin: 0;
          width: 100%;
          text-align: center;
        }

        .changelog-btn {
          background: linear-gradient(135deg, var(--noc-pri, #2E7D32) 0%, var(--noc-pri2, #1B5E20) 100%);
          color: var(--noc-on-pri, #ffffff);
          border: none;
          padding: 7px 16px;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 600;
          font-size: 0.8em;
          box-shadow: 0 4px 12px rgb(var(--noc-pri-rgb, 46 125 50) / 0.3);
          transition: all 0.3s ease;
          align-self: stretch;
        }

        .changelog-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 16px rgb(var(--noc-pri-rgb, 46 125 50) / 0.4);
        }

        .changelog-body::-webkit-scrollbar { width: 6px; }
        .changelog-body::-webkit-scrollbar-track { background: var(--noc-surface2, #f1f1f1); border-radius: 4px; }
        .changelog-body::-webkit-scrollbar-thumb { background: var(--noc-border2, #C9D8CB); border-radius: 4px; }
        .changelog-body::-webkit-scrollbar-thumb:hover { background: var(--noc-text2, #9AAD9D); }
      </style>

      <div class="changelog-card">
        <div class="changelog-header">
          <div class="header-content">
            <span class="header-icon">🎉</span>
            <h2>NOC TOOLS Novidades da Versão ${esc(version)}</h2>
          </div>
          <button id="close-changelog-x">✕</button>
        </div>
        <div class="changelog-body">
          <ul class="changelog-list">
            ${listHtml}
          </ul>
        </div>
        <div class="changelog-footer">
          <p class="changelog-hint">💡 Verifique todas as mudanças na aba Changelog</p>
          <button id="btn-changelog-ok" class="changelog-btn">Legal, entendi!</button>
        </div>
      </div>
    `;

    document.documentElement.appendChild(host);

    const closeFn = () => host.remove();
    shadow.getElementById("btn-changelog-ok").onclick = closeFn;
    shadow.getElementById("close-changelog-x").onclick = closeFn;
}



function parseCustomChangelog(text) {
    const lines = text.split('\n');
    let version = null;
    let changes = [];
    let isCapturing = false;
    const versionRegex = /^VERSÃO\s+([\d.]+)/i;

    for (let line of lines) {
        line = line.trim();
        const match = line.match(versionRegex);
        if (match) {
            if (!version) {
                version = match[1];
                isCapturing = true;
                continue;
            } else {
                break;
            }
        }
        if (isCapturing) {
            if (line.startsWith('=') || line === '') continue;
            if (line.endsWith(':')) {
                changes.push(`${line}`);
            } else if (line.startsWith('-')) {
                changes.push(line.replace(/^-/, '').trim());
            }
        }
    }

    return { version, changes };
}
