// =============================================================================
// BACKGROUND-CONTENT-HUBSOFT.JS 
// =============================================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "openHubsoftScanner") {
        openHubsoftScanner(sender.tab?.id, sendResponse);
        return true;
    }
});

async function openHubsoftScanner(tabId, sendResponse) {
    try {
        if (!tabId) {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            tabId = tab.id;
        }

        await executarComTema({
            target: { tabId: tabId },
            func: injectHubsoftUI
        });

        sendResponse({ success: true, message: "Scanner HubSoft aberto!" });
    } catch (error) {
        console.error("[Hubsoft] Erro:", error);
        sendResponse({ success: false, message: error.message });
    }
}

function injectHubsoftUI() {
    if (document.getElementById('noc-ui')) {
        document.getElementById('noc-ui').remove();
    }

    // Monta literal XPath seguro (protocolo com aspas simples quebrava a expressão)
    function xpathLiteral(valor) {
        const v = String(valor);
        if (!v.includes("'")) return `'${v}'`;
        if (!v.includes('"')) return `"${v}"`;
        return "concat('" + v.split("'").join("', \"'\", '") + "')";
    }

    // ========== ÍNDICE DE PROTOCOLOS (uma varredura só) ==========
    // Antes: 2 XPath no documento inteiro POR chamado (100 chamados = 200 varreduras).
    // Agora: percorre os textos da página uma vez e guarda protocolo -> elementos.
    let indiceProtocolos = null;

    function construirIndice(ids) {
        const alvo = new Set(ids.map(String));
        const mapa = new Map();
        const ui = document.getElementById('noc-ui');
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let no;
        while ((no = walker.nextNode())) {
            const el = no.parentElement;
            if (!el || (ui && ui.contains(el))) continue;
            const numeros = no.nodeValue.match(/\d{3,}/g);
            if (!numeros) continue;
            for (const n of numeros) {
                if (!alvo.has(n)) continue;
                if (!mapa.has(n)) mapa.set(n, []);
                const lista = mapa.get(n);
                if (lista[lista.length - 1] !== el) lista.push(el);
            }
        }
        return mapa;
    }

    // Elementos que contêm o protocolo: usa o índice; se não achar, cai no XPath antigo.
    function elementosDoProtocolo(protocolo) {
        const doIndice = indiceProtocolos && indiceProtocolos.get(String(protocolo));
        if (doIndice && doIndice.length) return doIndice;
        const xpath = `//*[contains(text(), ${xpathLiteral(protocolo)})]`;
        const snap = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
        const lista = [];
        for (let i = 0; i < snap.snapshotLength; i++) lista.push(snap.snapshotItem(i));
        return lista;
    }

    // ========== FUNÇÃO QUE EXTRAI USUÁRIO   ==========
    function buscarUsuarioNoDOM(protocolo) {
        try {
            const elements = elementosDoProtocolo(protocolo);

            for (let i = 0; i < elements.length; i++) {
                const elemento = elements[i];


                let container = elemento;
                for (let j = 0; j < 5 && container; j++) {
                    container = container.parentElement;
                    if (container && (container.tagName === 'TR' || container.classList?.contains('card') ||
                        container.classList?.contains('item') || container.getAttribute('role') === 'row')) {

                        // Procura por elementos que contenham nome de usuário
                        const textoContainer = container.textContent || "";

                        // Padrões para encontrar usuário
                        const padroes = [
                            /Aberto por:\s*([^\n]+)/i,
                            /Usu[áa]rio:\s*([^\n]+)/i,
                            /Criado por:\s*([^\n]+)/i,
                            /Respons[áa]vel:\s*([^\n]+)/i,
                            /Atendente:\s*([^\n]+)/i
                        ];

                        for (const padrao of padroes) {
                            const match = textoContainer.match(padrao);
                            if (match && match[1]) {
                                return match[1].trim();
                            }
                        }


                        const usuarioElements = container.querySelectorAll('[class*="user"], [class*="usuario"], [class*="author"], [class*="creator"], .author, .user');
                        for (const el of usuarioElements) {
                            const nome = el.textContent?.trim();
                            if (nome && nome.length > 3 && nome.length < 50 && !nome.includes('@')) {
                                return nome;
                            }
                        }

                        break;
                    }
                }
            }
        } catch (e) {
            console.error("Erro ao buscar usuário:", e);
        }
        return "Não identificado";
    }


    function buscarDescricaoNoDOM(protocolo) {
        try {
            const elements = elementosDoProtocolo(protocolo);

            for (let i = 0; i < elements.length; i++) {
                const elemento = elements[i];

                let container = elemento;
                for (let j = 0; j < 5 && container; j++) {
                    container = container.parentElement;
                    if (container) {
                        const texto = container.textContent || "";
                        const descMatch = texto.match(/Descri[cç][aã]o:?\s*([^\n]{30,500})/i);
                        if (descMatch && descMatch[1]) {
                            return descMatch[1].trim();
                        }
                    }
                }
            }
        } catch (e) { }
        return "";
    }

    async function buscarDadosInternos(protocolo, posicao) {
        const usuario = buscarUsuarioNoDOM(protocolo);
        const descricao = buscarDescricaoNoDOM(protocolo);

        return {
            descricao: descricao || "",
            usuario: usuario
        };
    }

    const processar = async () => {
        const dias = parseInt(document.getElementById('diasNoc').value) || 2;
        const limite = new Date();
        limite.setHours(0, 0, 0, 0);
        limite.setDate(limite.getDate() - dias);

        const btnGerar = document.getElementById('goNoc');
        const btnCopiar = document.getElementById('btnCopiar');
        const campoTexto = document.getElementById('txtNoc');

        btnGerar.disabled = true;
        btnCopiar.disabled = true;
        btnCopiar.innerText = "Aguarde...";
        campoTexto.value = "Iniciando captura...";

        let nomeUsuarioNoc = document.title.replace('HubSoft | ', '').trim();
        if (!nomeUsuarioNoc || nomeUsuarioNoc === "HubSoft") nomeUsuarioNoc = "";

        const linhas = document.body.innerText.split('\n').map(l => l.trim()).filter(l => l.length > 1);
        const relatorio = {
            "AGUARDANDO ATENDIMENTO": [], "EM TRATATIVA": [], "PENDENTE CLIENTE": [],
            "ACIONAMENTO EQUIPE O&M E LAST MILE": [], "VALIDAÇÃO": [], "LASTMILE": []
        };

        let protocolosParaProcessar = [];
        let catAtual = "EM TRATATIVA";

        linhas.forEach((linha, i) => {
            const linhaUpper = linha.toUpperCase();
            Object.keys(relatorio).forEach(cat => {
                if (linhaUpper === cat || (linhaUpper.includes(cat) && linhaUpper.length < 50)) catAtual = cat;
            });

            if (linha.includes("Protocolo:")) {
                const prot = linha.match(/\d+/);
                if (prot) {
                    protocolosParaProcessar.push({
                        id: prot[0],
                        empresa: (linhas[i - 1] || "Empresa?").replace(/\(\d+\)\s*/, '').trim(),
                        categoria: catAtual,
                        posicao: i
                    });
                }
            }
        });

        let encontrados = 0;
        const total = protocolosParaProcessar.length;
        indiceProtocolos = construirIndice(protocolosParaProcessar.map(p => p.id));

        for (let idx = 0; idx < total; idx++) {
            const item = protocolosParaProcessar[idx];
            btnGerar.innerText = `⏳ Processando ${idx + 1}/${total}`;
            // Deixa o navegador atualizar o progresso de tempos em tempos
            if (idx % 15 === 0) await new Promise(r => setTimeout(r, 0));

            let dataHora = "";
            for (let j = item.posicao; j <= item.posicao + 5; j++) {
                if (linhas[j] && (linhas[j].includes("Cadastro:") || linhas[j].includes("/"))) {
                    const mData = linhas[j].match(/\d{2}\/\d{2}\/\d{4}/);
                    if (mData) {
                        const mHora = linhas[j].match(/\d{2}:\d{2}/);
                        dataHora = mData[0] + (mHora ? " " + mHora[0] : "");
                        break;
                    }
                }
            }

            let exibir = true;
            if (dataHora) {
                try {
                    const partes = dataHora.split(' ');
                    const dataPartes = partes[0].split('/');
                    const dtC = new Date(parseInt(dataPartes[2]), parseInt(dataPartes[1]) - 1, parseInt(dataPartes[0]));
                    if (dtC < limite) exibir = false;
                } catch (e) {
                    console.error("Erro na data", e);
                }
            }

            if (exibir) {
                const dadosExtras = await buscarDadosInternos(item.id, item.posicao);
                let itemTexto = `• ${item.empresa}\n📋 PROTOCOLO: ${item.id}`;

                if (dataHora) {
                    itemTexto += `\n📅 DATA: ${dataHora}`;
                }

                if (dadosExtras) {
                    if (dadosExtras.usuario && dadosExtras.usuario !== "Não identificado") {
                        itemTexto += `\n👤 ABERTO POR: ${dadosExtras.usuario}`;
                    }

                    if (dadosExtras.descricao) {
                        const descLimpa = dadosExtras.descricao.replace(/\n/g, ' ').trim();
                        itemTexto += `\n└📝 ${descLimpa.substring(0, 180)}${descLimpa.length > 180 ? '...' : ''}`;
                    }
                }

                if (!relatorio[item.categoria].some(it => it.includes(item.id))) {
                    relatorio[item.categoria].push(itemTexto);
                    encontrados++;
                }
            }
        }

        let relatorioFinal = `📊 RELATÓRIO DE CHAMADOS  - ${nomeUsuarioNoc.toUpperCase()}\n📅 ${new Date().toLocaleString()}\n📦 TOTAL: ${encontrados} CHAMADOS\n━━━━━━━━━━━━━━━\n\n`;

        Object.entries(relatorio).forEach(([nome, lista]) => {
            if (lista.length > 0) {
                relatorioFinal += `🔴 ${nome} (${lista.length})\n${lista.join('\n\n')}\n\n`;
            }
        });

        campoTexto.value = encontrados > 0 ? relatorioFinal : "Nenhum chamado capturado dentro do prazo.";

        indiceProtocolos = null;
        btnGerar.innerText = "Gerar relatório";
        btnGerar.disabled = false;
        btnCopiar.disabled = false;
        btnCopiar.innerText = "📋 Copiar";
    };

    const copiarTexto = () => {
        const campo = document.getElementById('txtNoc');
        campo.select();
        document.execCommand('copy');
        const btn = document.getElementById('btnCopiar');
        btn.innerText = "✓ Copiado!";
        btn.style.background = "var(--noc-tint2, #C8E6C9)";
        setTimeout(() => {
            btn.innerText = "📋 Copiar";
            btn.style.background = "var(--noc-tint, #E8F5E9)";
        }, 2000);
    };

    // ========== MODAL (mesmo padrão visual de OLT / Extrator / IP / IA) ==========
    const FONTE = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

    const modal = document.createElement('div');
    modal.id = 'noc-ui';
    modal.style.cssText = `
        position: fixed; top: 20px; left: 60px; width: 620px; max-width: calc(100vw - 40px);
        max-height: calc(100vh - 40px); display: flex; flex-direction: column; overflow: hidden;
        background: var(--noc-surface, #ffffff); border-radius: 12px; z-index: 10000; font-family: ${FONTE};
        box-shadow: 0 20px 60px rgb(var(--noc-pri-rgb, 46 125 50) / 0.2), 0 0 1px rgba(0, 0, 0, 0.1);
        animation: nocHubIn 0.2s ease-out;
    `;

    const estilo = document.createElement('style');
    estilo.textContent = `
        @keyframes nocHubIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: none; } }
        #noc-ui button { font-family: ${FONTE}; transition: transform .15s ease, box-shadow .15s ease, background .15s ease; }
        #noc-ui .noc-btn-primario:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 16px rgb(var(--noc-pri-rgb, 46 125 50) / .4); }
        #noc-ui .noc-btn-secundario:hover:not(:disabled) { background: var(--noc-tint2, #C8E6C9) !important; }
        #noc-ui button:disabled { opacity: .6; cursor: not-allowed; }
        #noc-ui select:focus, #noc-ui textarea:focus { outline: none; border-color: var(--noc-pri, #2E7D32) !important; box-shadow: 0 0 0 3px rgb(var(--noc-pri-rgb, 46 125 50) / .15); }
    `;
    modal.appendChild(estilo);

    // Cabeçalho verde
    const header = document.createElement('div');
    header.style.cssText = `
        background: linear-gradient(135deg, var(--noc-pri, #2E7D32) 0%, var(--noc-pri2, #1B5E20) 100%); padding: 18px 20px;
        display: flex; justify-content: space-between; align-items: flex-start; flex-shrink: 0;
    `;
    const tituloArea = document.createElement('div');
    const title = document.createElement('div');
    title.textContent = '📋 Relatório HubSoft';
    title.style.cssText = 'font-size: 1.15em; font-weight: 600; color: var(--noc-on-pri, #ffffff); letter-spacing: -0.3px;';
    const subtitulo = document.createElement('div');
    subtitulo.textContent = 'Chamados do Fluxo de Atendimentos';
    subtitulo.style.cssText = 'font-size: 0.8em; color: rgba(255,255,255,0.85); margin-top: 4px;';
    tituloArea.append(title, subtitulo);

    const closeButton = document.createElement('button');
    closeButton.textContent = '✕';
    closeButton.title = 'Fechar';
    closeButton.style.cssText = `
        background: rgba(255,255,255,0.2); border: none; color: var(--noc-on-pri, #ffffff); width: 30px; height: 30px;
        border-radius: 6px; cursor: pointer; font-size: 1.05em; display: grid; place-items: center; flex-shrink: 0;
    `;
    closeButton.addEventListener('mouseenter', () => { closeButton.style.background = 'rgba(255,255,255,0.3)'; });
    closeButton.addEventListener('mouseleave', () => { closeButton.style.background = 'rgba(255,255,255,0.2)'; });
    closeButton.addEventListener('click', () => modal.remove());
    header.append(tituloArea, closeButton);
    modal.appendChild(header);

    // Corpo
    const inner = document.createElement('div');
    inner.style.cssText = 'padding: 18px 20px 20px; overflow-y: auto;';
    modal.appendChild(inner);

    // Aviso
    const warningBox = document.createElement('div');
    warningBox.style.cssText = `
        background: var(--noc-surface2, #F4F8F4); border-left: 4px solid var(--noc-pri, #2E7D32); border-radius: 8px;
        padding: 10px 14px; margin-bottom: 14px; font-size: 13px; line-height: 1.4;
    `;
    const avisoTitulo = document.createElement('div');
    avisoTitulo.textContent = 'Abra o Fluxo de Atendimentos';
    avisoTitulo.style.cssText = 'font-weight: 600; color: var(--noc-text, #17231A); margin-bottom: 2px;';
    const avisoTexto = document.createElement('div');
    avisoTexto.textContent = 'O relatório é montado a partir dos chamados visíveis nesta página.';
    avisoTexto.style.cssText = 'color: var(--noc-text2, #6B7A6E); font-size: 0.92em;';
    warningBox.append(avisoTitulo, avisoTexto);
    inner.appendChild(warningBox);

    // Período
    const daysRow = document.createElement('div');
    daysRow.style.cssText = 'display: flex; align-items: center; gap: 10px; margin-bottom: 12px;';
    const daysLabel = document.createElement('label');
    daysLabel.textContent = 'Período';
    daysLabel.htmlFor = 'diasNoc';
    daysLabel.style.cssText = 'font-size: 0.78em; font-weight: 700; color: var(--noc-text, #17231A); text-transform: uppercase; letter-spacing: 0.4px;';
    const daysSelect = document.createElement('select');
    daysSelect.id = 'diasNoc';
    daysSelect.style.cssText = `
        flex-grow: 1; padding: 9px 10px; border-radius: 8px; border: 2px solid var(--noc-border, #E3EBE4);
        background: var(--noc-surface2, #F4F8F4); color: var(--noc-text, #17231A); cursor: pointer; font-family: ${FONTE}; font-size: 13px;
    `;
    for (let i = 1; i <= 7; i++) {
        const opt = document.createElement('option');
        opt.value = String(i);
        opt.textContent = `Últimos ${i} dia${i > 1 ? 's' : ''}`;
        if (i === 2) opt.selected = true;
        daysSelect.appendChild(opt);
    }
    daysRow.append(daysLabel, daysSelect);
    inner.appendChild(daysRow);

    // Resultado
    const textarea = document.createElement('textarea');
    textarea.id = 'txtNoc';
    textarea.readOnly = true;
    textarea.placeholder = 'O relatório aparecerá aqui...';
    textarea.style.cssText = `
        width: 100%; box-sizing: border-box; height: 360px; padding: 12px; resize: vertical;
        border: 2px solid var(--noc-border, #E3EBE4); border-radius: 8px; background: var(--noc-surface2, #F4F8F4); color: var(--noc-text, #17231A);
        font-family: "SF Mono", Monaco, Consolas, monospace; font-size: 11.5px; line-height: 1.5; white-space: pre-wrap;
    `;
    inner.appendChild(textarea);

    // Botões
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display: flex; gap: 10px; margin-top: 14px;';
    inner.appendChild(btnRow);

    const btnGerar = document.createElement('button');
    btnGerar.id = 'goNoc';
    btnGerar.className = 'noc-btn-primario';
    btnGerar.textContent = 'Gerar relatório';
    btnGerar.style.cssText = `
        flex: 2; padding: 11px 14px; border: none; border-radius: 8px; cursor: pointer;
        background: linear-gradient(135deg, var(--noc-pri, #2E7D32) 0%, var(--noc-pri2, #1B5E20) 100%); color: var(--noc-on-pri, #ffffff);
        font-weight: 600; font-size: 0.9em; box-shadow: 0 4px 12px rgb(var(--noc-pri-rgb, 46 125 50) / 0.3);
    `;
    btnGerar.onclick = processar;
    btnRow.appendChild(btnGerar);

    const btnCopiar = document.createElement('button');
    btnCopiar.id = 'btnCopiar';
    btnCopiar.className = 'noc-btn-secundario';
    btnCopiar.textContent = '📋 Copiar';
    btnCopiar.disabled = true;
    btnCopiar.style.cssText = `
        flex: 1; padding: 11px 14px; border: none; border-radius: 8px; cursor: pointer;
        background: var(--noc-tint, #E8F5E9); color: var(--noc-accent, #2E7D32); font-weight: 600; font-size: 0.9em;
    `;
    btnCopiar.onclick = copiarTexto;
    btnRow.appendChild(btnCopiar);

    document.body.appendChild(modal);
}