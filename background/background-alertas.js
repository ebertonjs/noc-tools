// =============================================================================
// BACKGROUND-ALERTAS.JS - NOC EXTENSION v2.0  
// =============================================================================


chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "extractAndProcessAlerts") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const currentTab = tabs[0];
      if (!currentTab || !currentTab.id) {
        sendResponse({ success: false, message: "Nenhuma aba ativa." });
        return;
      }
      executarComTema(
        {
          target: { tabId: currentTab.id },
          func: injectAlertExtractorUI,
          args: [request.keywords || []],
        },
        () => {
          if (chrome.runtime.lastError) {
            console.error("Erro:", chrome.runtime.lastError.message);
            sendResponse({ success: false, message: "Erro ao injetar." });
          } else {
            sendResponse({ success: true, message: "Interface injetada." });
          }
        }
      );
    });
    return true;
  }
});


function injectAlertExtractorUI(settingsKeywords) {
  if (document.getElementById("noc-alert-overlay")) {
    alert("O Extrator de Alertas já está aberto.");
    return;
  }


  // --- CSS TEMA MODERNIZADO ---
  const css = `
    #noc-alert-overlay {
      position: fixed;
      top: 20px;
      left: 20px;
      width: 580px;
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
    
    #noc-header {
      background: linear-gradient(135deg, var(--noc-pri, #2E7D32) 0%, var(--noc-pri2, #1B5E20) 100%);
      padding: 18px 20px;
      position: relative;
      border-radius: 12px 12px 0 0;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    
    #noc-title-area {
      flex: 1;
    }
    
    #noc-title {
      font-size: 1.15em;
      font-weight: 600;
      color: var(--noc-on-pri, #ffffff);
      margin: 0 0 4px 0;
      letter-spacing: -0.3px;
    }
    
    #noc-subtitle {
      font-size: 0.8em;
      color: rgba(255, 255, 255, 0.8);
      margin: 0;
      font-weight: 400;
    }
    
    #noc-close {
      background: rgba(255, 255, 255, 0.2);
      backdrop-filter: blur(10px);
      border: none;
      font-size: 1.1em;
      cursor: pointer;
      color: var(--noc-on-pri, #ffffff);
      width: 30px;
      height: 30px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
    }
    #noc-close:hover {
      background: rgba(255, 255, 255, 0.3);
      transform: scale(1.05);
    }


    #noc-body {
      flex-grow: 1;
      overflow-y: auto;
      padding: 20px;
      max-height: calc(100vh - 220px);
    }


    /* STATUS BOX */
    .noc-stat-box {
      padding: 12px;
      background-color: var(--noc-surface2, #F4F8F4);
      border-left: 4px solid var(--noc-pri, #2E7D32);
      border-radius: 6px;
      margin-bottom: 16px;
      color: var(--noc-text, #1F2A22);
    }
    .noc-stat-main {
      font-weight: 600;
      font-size: 0.9em;
      margin-bottom: 4px;
      color: var(--noc-text, #17231A);
    }
    .noc-stat-sub {
      font-size: 0.8em;
      line-height: 1.5;
      color: var(--noc-text2, #6B7A6E);
    }


    /* CARDS DE POP */
    .pop-card {
      background-color: var(--noc-surface2, #F4F8F4);
      border: 2px solid var(--noc-border, #E3EBE4);
      border-radius: 8px;
      margin-bottom: 12px;
      overflow: hidden;
      transition: all 0.2s ease;
    }
    .pop-card:hover {
      border-color: var(--noc-border2, #C9D8CB);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
    }
    
    .pop-header {
      padding: 10px 15px;
      background-color: var(--noc-surface, #ffffff);
      border-bottom: 2px solid var(--noc-border, #E3EBE4);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .pop-title-container {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .pop-title {
      font-weight: 600;
      color: var(--noc-text, #17231A);
      font-size: 0.9em;
    }
    .pop-count {
      background: linear-gradient(135deg, var(--noc-pri, #2E7D32) 0%, var(--noc-pri2, #1B5E20) 100%);
      color: var(--noc-on-pri, #ffffff);
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 0.7em;
      font-weight: 600;
    }
    
    .pop-copy-btn {
      padding: 6px 12px;
      background: linear-gradient(135deg, var(--noc-pri, #2E7D32) 0%, var(--noc-pri2, #1B5E20) 100%);
      color: var(--noc-on-pri, #ffffff);
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.75em;
      font-weight: 600;
      transition: all 0.3s ease;
      box-shadow: 0 2px 6px rgb(var(--noc-pri-rgb, 46 125 50) / 0.2);
    }
    .pop-copy-btn:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 8px rgb(var(--noc-pri-rgb, 46 125 50) / 0.3);
    }


    .pop-content {
      width: 100%;
      background-color: var(--noc-surface, #ffffff);
      color: var(--noc-text, #1F2A22);
      padding: 12px;
      font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', 'Monaco', monospace;
      font-size: 11px;
      line-height: 1.5;
      resize: none;
      outline: none;
      border: none;
      box-sizing: border-box;
      white-space: pre;
      display: block;
      overflow-x: auto;
    }


    #noc-footer {
      display: flex;
      gap: 10px;
      border-top: 1px solid var(--noc-border, #E3EBE4);
      padding: 16px 20px;
      background-color: var(--noc-surface2, #fafafa);
      border-radius: 0 0 12px 12px;
    }


    .noc-btn {
      padding: 10px 16px;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      flex-grow: 1;
      font-weight: 600;
      font-size: 13px;
      transition: all 0.3s ease;
    }
    .noc-btn-primary {
      background: linear-gradient(135deg, var(--noc-pri, #2E7D32) 0%, var(--noc-pri2, #1B5E20) 100%);
      color: var(--noc-on-pri, #ffffff);
      box-shadow: 0 4px 12px rgb(var(--noc-pri-rgb, 46 125 50) / 0.3);
    }
    .noc-btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 16px rgb(var(--noc-pri-rgb, 46 125 50) / 0.4);
    }
    
    .noc-btn-secondary {
      background: var(--noc-tint, #E8F5E9);
      color: var(--noc-accent, #2E7D32);
      box-shadow: none;
    }
    .noc-btn-secondary:hover {
      background: var(--noc-tint2, #C8E6C9);
    }


    /* Scrollbar */
    #noc-body::-webkit-scrollbar { width: 8px; }
    #noc-body::-webkit-scrollbar-track { background: var(--noc-surface2, #f1f1f1); border-radius: 4px; }
    #noc-body::-webkit-scrollbar-thumb { background: var(--noc-border2, #C9D8CB); border-radius: 4px; }
    #noc-body::-webkit-scrollbar-thumb:hover { background: var(--noc-text2, #9AAD9D); }
  `;


  const styleEl = document.createElement("style");
  styleEl.textContent = css;
  document.head.appendChild(styleEl);


  // --- HTML ESTRUTURA ---
  const overlay = document.createElement("div");
  overlay.id = "noc-alert-overlay";
  overlay.innerHTML = `
    <div id="noc-header">
      <div id="noc-title-area">
        <h2 id="noc-title">🚨 Extração de Alertas</h2>
        <p id="noc-subtitle">Análise Automática de Problemas</p>
      </div>
      <button id="noc-close">✕</button>
    </div>
    
    <div id="noc-body">
      <div class="noc-stat-box">
        <div class="noc-stat-main" id="noc-status-main">Iniciando análise...</div>
        <div class="noc-stat-sub" id="noc-status-sub">Aguarde enquanto os dados são processados.</div>
      </div>
      <div id="noc-cards-area"></div>
    </div>
    
    <div id="noc-footer">
      <button class="noc-btn noc-btn-secondary" id="noc-refresh">🔄 Reiniciar</button>
      <button class="noc-btn noc-btn-primary" id="noc-copy-all">📋 Copiar Tudo</button>
    </div>
  `;
  document.body.appendChild(overlay);


  const statusMainEl = document.getElementById("noc-status-main");
  const statusSubEl = document.getElementById("noc-status-sub");
  const cardsArea = document.getElementById("noc-cards-area");


  // --- LÓGICA DE EXTRAÇÃO ---
  function extractAlerts() {
    statusMainEl.textContent = "Processando página...";
    statusSubEl.textContent = "Identificando alertas e separando por POP.";
    cardsArea.innerHTML = "";


    try {
      const text = document.body.innerText || "";
      const keywords = ["PROBLEMA", "PROBLEM", "FALHA", "DOWN"];

      if (!keywords.some(k => text.includes(k))) {
        statusMainEl.textContent = "Nenhum alerta detectado";
        statusSubEl.textContent = "As palavras-chave não foram encontradas no texto visível.";
        return;
      }


      const regexSplit = new RegExp(`(${keywords.join("|")})`);
      const parts = text.split(regexSplit);
      const extractedItems = [];


      for (let i = 1; i < parts.length; i += 2) {
        let content = parts[i + 1];
        if (!content) continue;


        // Hora
        let timeStr = "??:??:??";
        if (i > 0) {
          const prevBlock = parts[i - 1];
          const timeMatch = prevBlock.match(/(\d{2}:\d{2}:\d{2})/g);
          if (timeMatch) timeStr = timeMatch[timeMatch.length - 1];
        }


        // Dispositivo
        const deviceMatch = content.match(/[A-Z0-9]+(?:-[A-Z0-9]+){2,}/);
        if (deviceMatch) {
          const fullDeviceName = deviceMatch[0];
          let rawDetails = content.substring(content.indexOf(fullDeviceName) + fullDeviceName.length);
          let firstLine = rawDetails.split('\n')[0];

          let interfaceName = null;
          let clientName = null;
          let reason = "Link down";


          const interfaceMatch = firstLine.match(/Interface\s+([^\s(]+)\(([^()]*)/i);
          if (interfaceMatch) {
            interfaceName = interfaceMatch[1];
            // Para no primeiro "(" ou ")" que aparecer depois do início do
            // parêntese, então em parênteses aninhados (ex.: "HEXA_TELECOM-01-
            // 077310-02A-001 (MEMBER-ETH-TRUNK10)") pega só "HEXA_TELECOM-01-
            // 077310-02A-001", sem cortar no meio da palavra.
            clientName = interfaceMatch[2].trim();
          } else {
            const parenthesisMatch = firstLine.match(/\(([^)(]*)/);
            if (parenthesisMatch) clientName = parenthesisMatch[1].trim();
          }


          // Filtro rigoroso
          if (!clientName || clientName.trim().length < 2) continue;

          // Limpeza
          clientName = clientName
            .replace(/-P\d+$/, '')
            .replace(/-RC-EDD.*$/, '')
            .replace(/, BR$/, '')
            .replace(/\[BKP\]/g, '')
            .trim();

          if (firstLine.includes(": Link down")) reason = "Link down";
          else {
            const lastColon = firstLine.lastIndexOf(":");
            if (lastColon > -1) reason = firstLine.substring(lastColon + 1).trim().replace(/\?$/, '');
          }


          extractedItems.push({
            pop: fullDeviceName,
            client: clientName,
            interface: interfaceName || "N/A",
            reason: reason,
            time: timeStr
          });
        }
      }


      if (extractedItems.length === 0) {
        statusMainEl.textContent = "Sem dados válidos";
        statusSubEl.textContent = "Padrões encontrados, mas os dados estavam incompletos.";
        return;
      }


      // Agrupamento
      const grouped = {};
      extractedItems.forEach(item => {
        if (!grouped[item.pop]) grouped[item.pop] = [];
        grouped[item.pop].push(item);
      });


      // Criação dos Cards
      Object.keys(grouped).sort().forEach(pop => {
        const alerts = grouped[pop];
        let popText = `POP = ${pop}\n`;

        alerts.forEach(alert => {
          const colInterface = alert.interface.padEnd(25, ' ');
          const colClient = alert.client.padEnd(30, ' ');
          popText += ` ${colInterface} ${colClient} ${alert.reason} ${alert.time}\n`;
        });


        const card = document.createElement('div');
        card.className = 'pop-card';
        card.innerHTML = `
            <div class="pop-header">
                <div class="pop-title-container">
                    <span class="pop-title"></span>
                    <span class="pop-count">${alerts.length}</span>
                </div>
                <button class="pop-copy-btn">📋 Copiar</button>
            </div>
            <textarea class="pop-content" readonly rows="${alerts.length + 2}"></textarea>
        `;
        // Texto da página entra só via textContent/value: um "</textarea><img onerror=...>"
        // vindo do alerta não consegue mais escapar do campo.
        card.querySelector('.pop-title').textContent = pop;
        card.querySelector('.pop-content').value = popText;

        // Botão copiar individual
        const copyBtn = card.querySelector('.pop-copy-btn');
        const textArea = card.querySelector('.pop-content');

        copyBtn.addEventListener('click', () => {
          textArea.select();
          document.execCommand('copy');
          const originalText = copyBtn.innerHTML;
          copyBtn.innerHTML = "✓ Copiado!";
          copyBtn.style.background = "linear-gradient(135deg, #00875a 0%, #00a86b 100%)";
          copyBtn.style.boxShadow = "0 4px 12px rgba(0, 135, 90, 0.3)";
          setTimeout(() => {
            copyBtn.innerHTML = originalText;
            copyBtn.style.background = "linear-gradient(135deg, var(--noc-pri, #2E7D32) 0%, var(--noc-pri2, #1B5E20) 100%)";
            copyBtn.style.boxShadow = "0 2px 6px rgb(var(--noc-pri-rgb, 46 125 50) / 0.2)";
          }, 1500);
        });


        cardsArea.appendChild(card);
      });


      statusMainEl.textContent = `✅ Alertas Extraídos: ${extractedItems.length}`;
      statusSubEl.textContent = `Foram encontrados ${Object.keys(grouped).length} POPs com alertas ativos.`;


    } catch (err) {
      console.error(err);
      statusMainEl.textContent = "❌ Erro na execução";
      statusSubEl.textContent = err.message;
    }
  }


  // --- LISTENERS GERAIS ---
  document.getElementById("noc-close").onclick = () => {
    overlay.remove();
    styleEl.remove();
  };

  document.getElementById("noc-refresh").onclick = extractAlerts;

  // Botão Copiar Tudo
  document.getElementById("noc-copy-all").onclick = () => {
    const allTextAreas = document.querySelectorAll('.pop-content');
    let fullText = "RELATÓRIO DE ALERTAS\n====================\n\n";

    allTextAreas.forEach(area => {
      fullText += area.value + "\n\n";
    });

    const tempInput = document.createElement("textarea");
    tempInput.value = fullText;
    document.body.appendChild(tempInput);
    tempInput.select();
    document.execCommand("copy");
    document.body.removeChild(tempInput);

    const btn = document.getElementById("noc-copy-all");
    const originalText = btn.innerHTML;
    btn.innerHTML = "✓ Copiado!";
    btn.style.background = "linear-gradient(135deg, #00875a 0%, #00a86b 100%)";
    btn.style.boxShadow = "0 4px 12px rgba(0, 135, 90, 0.3)";
    setTimeout(() => {
      btn.innerHTML = originalText;
      btn.style.background = "linear-gradient(135deg, var(--noc-pri, #2E7D32) 0%, var(--noc-pri2, #1B5E20) 100%)";
      btn.style.boxShadow = "0 4px 12px rgb(var(--noc-pri-rgb, 46 125 50) / 0.3)";
    }, 2000);
  };


  setTimeout(extractAlerts, 500);
}
