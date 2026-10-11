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
                        // Para no próximo rótulo conhecido: sem isso, "Fulano" + "Descrição: ..." vinham colados
                        const FIM = String.raw`(?=\s*(?:Descri[cç][aã]o|Protocolo|Cadastro|Status|Data|Cliente|Servi[cç]o|Etapa|Respons[áa]vel|Atendente|Usu[áa]rio)\b|\n|$)`;
                        const rotulos = [
                            String.raw`Usu[áa]rio que Abriu:?`,
                            String.raw`Aberto por:`,
                            String.raw`Criado por:`,
                            String.raw`Usu[áa]rio:`,
                            String.raw`Respons[áa]vel:`,
                            String.raw`Atendente:`
                        ];

                        for (const rotulo of rotulos) {
                            const match = textoContainer.match(new RegExp(rotulo + String.raw`\s*(.+?)` + FIM, 'i'));
                            const nome = match && match[1] ? match[1].trim().slice(0, 60) : "";
                            if (nome) return nome;
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

    // Clica em "VER MAIS (n)" de todas as colunas até não sobrar nenhum (limite de segurança)
    async function expandirVerMais(onProgresso) {
        const ui = document.getElementById('noc-ui');
        const acharBotoes = () => [...document.querySelectorAll('button, a, [role="button"], div, span')]
            .filter(el => !(ui && ui.contains(el)) && el.children.length <= 3 &&
                /^\s*ver mais\s*\(\d+\)\s*$/i.test(el.textContent || '') && el.offsetParent !== null)
            // fica só com o elemento mais externo de cada botão (evita clicar 2x no mesmo)
            .filter((el, _, arr) => !arr.some(o => o !== el && o.contains(el)));
        for (let rodada = 0; rodada < 20; rodada++) {
            const botoes = acharBotoes();
            if (!botoes.length) return rodada;
            onProgresso && onProgresso(rodada + 1);
            botoes.forEach(b => { try { b.click(); } catch (e) { } });
            await new Promise(r => setTimeout(r, 900));
        }
        return 20;
    }

    // ========== ATENDIMENTO ABERTO (modal) ==========
    // Lê os campos pelo rótulo ("Usuário que Abriu", "Tipo de Atendimento"...): o valor fica
    // num input/select ao lado do rótulo, dentro do mesmo bloco do formulário.
    const normalizar = (t) => (t || '').replace(/\*/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

    const ROTULOS_MODAL = ['Cliente', 'Usuário que Abriu', 'Data de Cadastro', 'Contato Responsável', 'Telefone do Contato',
        'Serviço', 'Login', 'Endereço Instalação', 'Tipo de Atendimento', 'Status de Atendimento', 'Origem do Contato',
        'Disponibilidade', 'Usuários Responsáveis', 'Fluxo de Atendimento', 'Etapa do Fluxo de Atendimento',
        'Descrição da Abertura'].map(r => r.toLowerCase());

    function lerCampo(rotulo, manterLinhas = false) {
        const limpa = (v) => manterLinhas
            ? v.split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n')
            : v.replace(/\s+/g, ' ').trim();
        const alvo = normalizar(rotulo);
        const ui = document.getElementById('noc-ui');
        const candidatos = [...document.querySelectorAll('label, span, div, p, mat-label')]
            .filter(el => !(ui && ui.contains(el)) && el.children.length <= 2 && normalizar(el.textContent) === alvo);
        for (const rot of candidatos) {
            let bloco = rot;
            // começa no próprio candidato (pode ser o bloco do campo inteiro) e vai subindo
            for (let k = 0; k < 6 && bloco; k++, bloco = bloco.parentElement) {
                const campos = bloco.querySelectorAll('input, textarea');
                if (campos.length > 1) break; // subiu demais: pegou a linha com vários campos
                const campo = campos[0];
                if (campo && campo.value && campo.value.trim()) return limpa(campo.value);
                if (bloco === rot) continue;
                // selects (mat-select etc.): texto do bloco sem o rótulo.
                // Se o bloco já contém outro rótulo conhecido, subiu demais: para aqui.
                const linhasBloco = (bloco.innerText || '').split('\n').map(l => l.trim()).filter(Boolean);
                const outrosRotulos = linhasBloco.filter(l => ROTULOS_MODAL.includes(normalizar(l)) && normalizar(l) !== alvo);
                if (outrosRotulos.length) break;
                const texto = linhasBloco.filter(l => normalizar(l) !== alvo);
                if (texto.length && texto.join(' ').length < 600) {
                    return limpa(texto.join('\n'));
                }
            }
        }
        return '';
    }

    function lerAtendimentoAberto() {
        const textoPagina = document.body.innerText || '';
        if (!/Usu[áa]rio que Abriu/i.test(textoPagina)) return null;
        const mTitulo = textoPagina.match(/Atendimento\s*-\s*(\d{10,})\s*-\s*(.+)/i);
        if (!mTitulo) return null;
        // selo do rodapé, ex.: "0 % (-23h 17min)" (ignora as etiquetas "Tempo: ..." dos cards)
        const mSla = textoPagina.match(/(?<!Tempo:\s*)(?<![\d%])(\d+\s*%\s*\(-?[^)\n]*\))/);
        return {
            protocolo: mTitulo[1],
            cliente: lerCampo('Cliente') || mTitulo[2].replace(/^\(\d+\)\s*/, '').trim(),
            usuario: lerCampo('Usuário que Abriu'),
            cadastro: lerCampo('Data de Cadastro'),
            servico: lerCampo('Serviço'),
            tipo: lerCampo('Tipo de Atendimento'),
            status: lerCampo('Status de Atendimento'),
            responsaveis: lerCampo('Usuários Responsáveis'),
            etapa: lerCampo('Etapa do Fluxo de Atendimento'),
            descricao: lerCampo('Descrição da Abertura', true),
            sla: mSla ? mSla[1].replace(/\s+/g, ' ') : '',
            ts: Date.now(),
        };
    }

    async function lerCache() {
        try { return (await chrome.storage.local.get('hubsoftCache')).hubsoftCache || {}; } catch (e) { return {}; }
    }

    async function salvarNoCache(at) {
        if (!at || !at.protocolo) return;
        try {
            const cache = await lerCache();
            cache[at.protocolo] = at;
            // guarda só os 300 mais recentes
            const chaves = Object.keys(cache).sort((a, b) => cache[b].ts - cache[a].ts);
            chaves.slice(300).forEach(k => delete cache[k]);
            await chrome.storage.local.set({ hubsoftCache: cache });
        } catch (e) { }
    }

    // Enquanto a janela do relatório estiver aberta, todo atendimento aberto é guardado
    let ultimoCapturado = '';
    let timerObs = null;
    const observador = new MutationObserver(() => {
        clearTimeout(timerObs);
        timerObs = setTimeout(() => {
            if (!document.getElementById('noc-ui')) { observador.disconnect(); return; }
            const at = lerAtendimentoAberto();
            if (!at || !at.usuario) return;
            const chave = at.protocolo + '|' + at.usuario + '|' + at.sla;
            if (chave === ultimoCapturado) return;
            ultimoCapturado = chave;
            salvarNoCache(at);
            const st = document.getElementById('statusCapturaNoc');
            if (st) st.textContent = `✓ Atendimento ${at.protocolo} guardado (aberto por ${at.usuario})`;
        }, 600);
    });
    observador.observe(document.body, { childList: true, subtree: true });

    // ========== ABRIR CADA ATENDIMENTO AUTOMATICAMENTE ==========
    const espera = (ms) => new Promise(r => setTimeout(r, ms));
    let pararAuto = false;

    // Card do quadro que contém o protocolo (procura de novo a cada vez: o DOM muda ao abrir/fechar)
    function acharCard(id) {
        const ui = document.getElementById('noc-ui');
        const snap = document.evaluate(`//*[contains(text(), '${id}')]`, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
        for (let i = 0; i < snap.snapshotLength; i++) {
            const el = snap.snapshotItem(i);
            if (ui && ui.contains(el)) continue;
            if (/Atendimento\s*-/.test(el.textContent || '')) continue; // título do modal, não o card
            let card = el;
            for (let k = 0; k < 8 && card; k++) {
                const t = card.innerText || '';
                if ((t.match(/Protocolo:/g) || []).length > 1) break;
                if (/Cadastro/i.test(t) && card.offsetHeight > 60) return { card, protocoloEl: el };
                card = card.parentElement;
            }
        }
        return null;
    }

    // Jeitos de abrir: título da empresa, o card inteiro, a linha do protocolo
    function alvosDeClique(achado) {
        const { card, protocoloEl } = achado;
        const linhas = [...card.querySelectorAll('*')].filter(e => e.children.length === 0 && (e.textContent || '').trim());
        const titulo = linhas.find(e => /^\(\d+\)\s+\S/.test(e.textContent.trim()));
        return [titulo, card, protocoloEl].filter(Boolean);
    }

    function modalAbertoDe(id) {
        const t = document.body.innerText || '';
        if (!/Usu[áa]rio que Abriu/i.test(t)) return false;
        const m = t.match(/Atendimento\s*-\s*(\d{10,})/i);
        return !!(m && m[1] === String(id));
    }
    const algumModalAberto = () => /Usu[áa]rio que Abriu/i.test(document.body.innerText || '');

    async function esperarAte(cond, ms) {
        const fim = Date.now() + ms;
        while (Date.now() < fim) { if (cond()) return true; await espera(150); }
        return cond();
    }

    async function fecharModal() {
        if (!algumModalAberto()) return true;
        // 1) tecla Esc
        const esc = { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true };
        (document.activeElement || document.body).dispatchEvent(new KeyboardEvent('keydown', esc));
        document.dispatchEvent(new KeyboardEvent('keydown', esc));
        if (await esperarAte(() => !algumModalAberto(), 800)) return true;
        // 2) botão de fechar do cabeçalho do atendimento
        const ui = document.getElementById('noc-ui');
        const botoes = [...document.querySelectorAll('button, [role="button"], mat-icon, i, a, span')]
            .filter(b => !(ui && ui.contains(b)) && b.offsetParent !== null)
            .filter(b => {
                const txt = (b.textContent || '').trim().toLowerCase();
                const rot = ((b.getAttribute('aria-label') || '') + ' ' + (b.getAttribute('title') || '') + ' ' + (b.getAttribute('mattooltip') || '')).toLowerCase();
                return ['close', 'clear', '✕', '×', 'x'].includes(txt) || /fechar|close/.test(rot);
            });
        for (const b of botoes.reverse()) {
            try { (b.closest('button') || b).click(); } catch (e) { }
            if (await esperarAte(() => !algumModalAberto(), 1200)) return true;
        }
        return !algumModalAberto();
    }

    let jeitoQueFunciona = null; // índice do alvo de clique que abriu o atendimento

    async function abrirELer(id) {
        let achado = acharCard(id);
        if (!achado) { await expandirVerMais(); achado = acharCard(id); }
        if (!achado) return { erro: 'card não encontrado' };
        const alvos = alvosDeClique(achado);
        const ordem = jeitoQueFunciona !== null && alvos[jeitoQueFunciona]
            ? [jeitoQueFunciona, ...alvos.keys()].filter((v, i, a) => a.indexOf(v) === i)
            : [...alvos.keys()];
        for (const idx of ordem) {
            const alvo = alvos[idx];
            try { alvo.scrollIntoView({ block: 'center' }); alvo.click(); } catch (e) { continue; }
            if (await esperarAte(() => modalAbertoDe(id), 3000)) {
                await espera(500); // deixa os campos preencherem
                let at = lerAtendimentoAberto();
                if (at && !at.usuario) { await espera(800); at = lerAtendimentoAberto(); }
                jeitoQueFunciona = idx;
                const fechou = await fecharModal();
                return { at, fechou };
            }
            if (algumModalAberto()) await fecharModal(); // abriu outra coisa
        }
        return { erro: 'não abriu' };
    }

    // Código do tipo ("O&M-01", "QLD-01"): o card mostra cortado, mas o código vem inteiro
    const codigoTipo = (t) => ((t || '').match(/(?<![A-Z&])[A-Z&]{2,5}-\d{2}/) || [''])[0];

    async function coletarAbrindo(ids, onProgresso, tipoDoCard = {}) {
        const cache = await lerCache();
        // Abre se nunca foi lido OU se o tipo no card mudou desde a última leitura
        const pendentes = ids.filter(id => {
            const c = cache[id];
            if (!(c && c.usuario)) return true;
            const noCard = codigoTipo(tipoDoCard[id]);
            return !!(noCard && codigoTipo(c.tipo) && noCard !== codigoTipo(c.tipo));
        });
        let ok = 0, falhas = 0;
        for (let i = 0; i < pendentes.length; i++) {
            if (pararAuto) break;
            onProgresso(i + 1, pendentes.length);
            const r = await abrirELer(pendentes[i]);
            if (r.at && r.at.usuario) { await salvarNoCache(r.at); ok++; } else falhas++;
            if (r.at && r.fechou === false) return { ok, falhas, total: pendentes.length, erro: 'Não consegui fechar o atendimento. Feche-o e gere de novo.' };
            // se os 2 primeiros falharam, o jeito de abrir não serve nesta página
            if (ok === 0 && falhas >= 2) return { ok, falhas, total: pendentes.length, erro: 'Não consegui abrir os atendimentos automaticamente nesta página.' };
            await espera(250);
        }
        return { ok, falhas, total: pendentes.length };
    }

    const capturarAtendimento = async () => {
        const campoTexto = document.getElementById('txtNoc');
        const at = lerAtendimentoAberto();
        if (!at) {
            campoTexto.value = 'Nenhum atendimento aberto. Abra um atendimento no HubSoft e clique em "Capturar atendimento".';
            return;
        }
        await salvarNoCache(at);
        const linhasRes = [
            `📋 ATENDIMENTO ${at.protocolo}`,
            `🏢 CLIENTE: ${at.cliente}`,
            at.usuario && `👤 ABERTO POR: ${at.usuario}`,
            at.cadastro && `📅 CADASTRO: ${at.cadastro}`,
            at.tipo && `🏷️ TIPO: ${at.tipo}`,
            at.servico && `🔌 SERVIÇO: ${at.servico}`,
            at.status && `📌 STATUS: ${at.status}`,
            at.etapa && `🧭 ETAPA: ${at.etapa}`,
            at.responsaveis && `👥 RESPONSÁVEIS: ${at.responsaveis}`,
            at.sla && `⏱️ SLA: ${at.sla}`,
            at.descricao && `\n📝 DESCRIÇÃO:\n${at.descricao}`,
        ].filter(Boolean);
        campoTexto.value = linhasRes.join('\n');
        document.getElementById('btnCopiar').disabled = false;
    };

    // opcoes.ignorarPeriodo: lê o quadro inteiro (Status das Rotas)
    // opcoes.silencioso: não mexe no relatório de chamados nem no controle de novos/encerrados
    // opcoes.onProgresso(texto): recebe as mensagens de progresso
    const processar = async (opcoes = {}) => {
        if (!opcoes || opcoes instanceof Event) opcoes = {};
        const dias = parseInt(document.getElementById('diasNoc').value) || 2;
        const limite = new Date();
        limite.setHours(0, 0, 0, 0);
        limite.setDate(limite.getDate() - dias);

        const btnGerar = document.getElementById('goNoc');
        const btnCopiar = document.getElementById('btnCopiar');
        const campoTexto = document.getElementById('txtNoc');

        const textoAnterior = campoTexto.value;
        const progresso = (t) => { btnGerar.innerText = t; if (opcoes.onProgresso) opcoes.onProgresso(t); };
        btnGerar.disabled = true;
        btnCopiar.disabled = true;
        btnCopiar.innerText = "Aguarde...";
        campoTexto.value = "Iniciando captura...";

        if (document.getElementById('verMaisNoc')?.checked !== false) {
            await expandirVerMais(n => progresso(`⏳ Carregando cards (${n})...`));
        }

        let nomeUsuarioNoc = document.title.replace('HubSoft | ', '').trim();
        if (!nomeUsuarioNoc || nomeUsuarioNoc === "HubSoft") nomeUsuarioNoc = "";

        const linhas = document.body.innerText.split('\n').map(l => l.trim()).filter(l => l.length > 1);
        const relatorio = {
            "AGUARDANDO ATENDIMENTO": [], "EM TRATATIVA": [], "PENDENTE CLIENTE": [],
            "ACIONAMENTO EQUIPE O&M E LAST MILE": [], "VALIDAÇÃO": [], "LASTMILE": []
        };

        let protocolosParaProcessar = [];
        let catAtual = "EM TRATATIVA";

        // Cabeçalho de coluna = "NOME (n)". Usar só ele evita que a etiqueta do card
        // (ex.: "PENDENTE CLIENTE") troque a categoria no meio de outra coluna.
        const ehCabecalho = (l) => /\(\d+\)\s*$/.test(l);
        const normal = (t) => t.toUpperCase().replace(/\s+/g, '').replace(/\(\d+\)$/, '');
        const temCabecalhos = linhas.some(l => ehCabecalho(l) && Object.keys(relatorio).some(c => normal(l).startsWith(normal(c))));

        linhas.forEach((linha, i) => {
            const linhaUpper = linha.toUpperCase();
            if (temCabecalhos) {
                if (ehCabecalho(linha)) {
                    // compara sem espaços: "Lastmile" = "LASTMILE"; maior nome primeiro ("...LAST MILE" antes de "LASTMILE")
                    const n = normal(linha);
                    const cat = Object.keys(relatorio).sort((a, b) => b.length - a.length).find(c => n.startsWith(normal(c)));
                    if (cat) catAtual = cat;
                }
            } else {
                Object.keys(relatorio).forEach(cat => {
                    if (linhaUpper === cat || (linhaUpper.includes(cat) && linhaUpper.length < 50)) catAtual = cat;
                });
            }

            if (linha.includes("Protocolo:")) {
                const prot = linha.match(/\d+/);
                if (prot) {
                    let tipo = "", tempo = "";
                    for (let k = i - 2; k >= Math.max(0, i - 6); k--) {
                        const l = linhas[k];
                        if (/^A[ÇC][ÕO]ES$/i.test(l) || l.includes('Cadastro:') || l.includes('Protocolo:')) break;
                        // etiquetas podem vir uma por linha ou todas na mesma linha
                        const mTempo = !tempo && l.match(/Tempo\s*:\s*(.+?)\s*$/i);
                        if (mTempo) tempo = mTempo[1].trim();
                        // código em maiúsculas (O&M-01, QLD-01), mesmo se vier colado no texto anterior
                        const mTipo = !tipo && l.match(/(?<![A-Z&])([A-Z&]{2,5}-\d{2}\s*[–-]\s*.+?)(?=\s*Tempo\s*:|\s*$)/);
                        if (mTipo) tipo = mTipo[1].trim();
                    }
                    protocolosParaProcessar.push({
                        id: prot[0],
                        empresa: (linhas[i - 1] || "Empresa?").replace(/\(\d+\)\s*/, '').trim(),
                        categoria: catAtual,
                        posicao: i,
                        tipo,
                        tempo
                    });
                }
            }
        });

        // ---------- Abre cada atendimento do período para pegar quem abriu ----------
        let avisoAuto = '';
        if (document.getElementById('autoAbrirNoc')?.checked) {
            const idsPeriodo = [];
            for (const item of protocolosParaProcessar) {
                let dia = null;
                for (let j = item.posicao; j <= item.posicao + 5; j++) {
                    const m = linhas[j] && linhas[j].match(/(\d{2})\/(\d{2})\/(\d{4})/);
                    if (m) { dia = new Date(+m[3], +m[2] - 1, +m[1]); break; }
                }
                if ((opcoes.ignorarPeriodo || !dia || dia >= limite) && !idsPeriodo.includes(item.id)) idsPeriodo.push(item.id);
            }
            pararAuto = false;
            const btnParar = document.getElementById('btnPararNoc');
            if (btnParar) { btnParar.textContent = '⏹ Parar'; btnParar.style.display = ''; }
            const tipoDoCard = {};
            protocolosParaProcessar.forEach(p => { if (p.tipo) tipoDoCard[p.id] = p.tipo; });
            const r = await coletarAbrindo(idsPeriodo, (i, n) => {
                progresso(`🔎 Abrindo atendimentos ${i}/${n}`);
                campoTexto.value = `Abrindo cada atendimento para pegar quem abriu (${i}/${n})...\nNão mexa na página do HubSoft enquanto isso.`;
            }, tipoDoCard);
            if (btnParar) btnParar.style.display = 'none';
            if (r.erro) avisoAuto = `⚠️ ${r.erro} (${r.ok} lido(s) de ${r.total}).`;
            else if (pararAuto) avisoAuto = `⏹ Parado: ${r.ok} de ${r.total} atendimento(s) lidos.`;
            else if (r.falhas) avisoAuto = `⚠️ ${r.falhas} atendimento(s) não puderam ser lidos.`;
            const st = document.getElementById('statusCapturaNoc');
            if (st) st.textContent = avisoAuto || `✓ ${r.ok} atendimento(s) lidos${r.total < idsPeriodo.length ? ` (${idsPeriodo.length - r.total} já estavam guardados)` : ''}.`;
        }

        let encontrados = 0;
        const total = protocolosParaProcessar.length;
        indiceProtocolos = construirIndice(protocolosParaProcessar.map(p => p.id));
        const agora = new Date();
        const itensPorCat = {};
        Object.keys(relatorio).forEach(c => { itensPorCat[c] = []; });
        const vistos = new Set();

        for (let idx = 0; idx < total; idx++) {
            const item = protocolosParaProcessar[idx];
            if (idx % 15 === 0) progresso(`⏳ Processando ${idx + 1}/${total}`);
            // Deixa o navegador atualizar o progresso de tempos em tempos
            if (idx % 15 === 0) await new Promise(r => setTimeout(r, 0));

            let dataHora = "";
            let dt = null;
            for (let j = item.posicao; j <= item.posicao + 5; j++) {
                if (linhas[j] && (linhas[j].includes("Cadastro:") || linhas[j].includes("/"))) {
                    const mData = linhas[j].match(/(\d{2})\/(\d{2})\/(\d{4})/);
                    if (mData) {
                        const mHora = linhas[j].match(/(\d{2}):(\d{2})/);
                        dataHora = mData[0] + (mHora ? " " + mHora[0] : "");
                        dt = new Date(+mData[3], +mData[2] - 1, +mData[1], mHora ? +mHora[1] : 0, mHora ? +mHora[2] : 0);
                        break;
                    }
                }
            }

            if (dt) {
                const dia = new Date(dt); dia.setHours(0, 0, 0, 0);
                if (!opcoes.ignorarPeriodo && dia < limite) continue;
            }
            if (vistos.has(item.id)) continue;
            vistos.add(item.id);

            const dadosExtras = await buscarDadosInternos(item.id, item.posicao);
            itensPorCat[item.categoria].push({
                id: item.id,
                categoria: item.categoria,
                empresa: item.empresa,
                dataHora,
                dt,
                usuario: dadosExtras.usuario && dadosExtras.usuario !== "Não identificado" ? dadosExtras.usuario : "",
                tipo: item.tipo,
                tempo: item.tempo,
                descricao: (dadosExtras.descricao || "").replace(/\s+/g, ' ').trim(),
            });
            encontrados++;
        }

        // ---------- Dados dos atendimentos já abertos (cache) ----------
        const cache = await lerCache();
        Object.values(itensPorCat).forEach(lista => lista.forEach(it => {
            const c = cache[it.id];
            if (!c) return;
            if (c.usuario) it.usuario = c.usuario;
            const mesmoTipo = !codigoTipo(it.tipo) || codigoTipo(it.tipo) === codigoTipo(c.tipo);
            if (c.tipo && mesmoTipo && c.tipo.length > (it.tipo || '').length) it.tipo = c.tipo;
            if (c.descricao) it.descricao = c.descricao;
        }));

        // Etiquetas cortadas no card ("0% (-7"): fecha com reticências
        Object.values(itensPorCat).forEach(lista => lista.forEach(it => {
            if (it.tempo && it.tempo.includes('(') && !it.tempo.includes(')')) it.tempo += '…)';
        }));

        // ---------- Novos desde o último relatório ----------
        let anteriores = null;
        try {
            const salvo = await chrome.storage.local.get("hubsoftUltimoRelatorio");
            if (Array.isArray(salvo.hubsoftUltimoRelatorio)) anteriores = new Set(salvo.hubsoftUltimoRelatorio);
            if (!opcoes.silencioso) await chrome.storage.local.set({ hubsoftUltimoRelatorio: [...vistos] });
        } catch (e) { /* sem storage: só não marca os novos */ }

        // ---------- Encerrados desde o último relatório ----------
        // Compara o quadro inteiro (todas as datas), não só o período, para um chamado
        // antigo fora do filtro não parecer "encerrado". Só vale com todos os cards carregados.
        const quadroCompleto = document.getElementById('verMaisNoc')?.checked !== false;
        const quadroAtual = {};
        protocolosParaProcessar.forEach(p => { if (!quadroAtual[p.id]) quadroAtual[p.id] = { empresa: p.empresa, categoria: p.categoria }; });
        let encerrados = [];
        try {
            const { hubsoftQuadroAnterior: ant } = await chrome.storage.local.get('hubsoftQuadroAnterior');
            if (!opcoes.silencioso && ant && ant.completo && quadroCompleto && ant.itens) {
                encerrados = Object.entries(ant.itens)
                    .filter(([id]) => !quadroAtual[id])
                    .map(([id, info]) => ({ id, ...info }));
            }
            if (quadroCompleto && !opcoes.silencioso) {
                await chrome.storage.local.set({ hubsoftQuadroAnterior: { ts: Date.now(), completo: true, itens: quadroAtual } });
            }
        } catch (e) { /* sem storage: só não lista os encerrados */ }

        // ---------- Tempo em aberto ----------
        const idade = (d) => {
            if (!d) return null;
            const min = Math.max(0, Math.floor((agora - d) / 60000));
            const dd = Math.floor(min / 1440), hh = Math.floor((min % 1440) / 60), mm = min % 60;
            const txt = dd ? `${dd}d ${hh}h` : hh ? `${hh}h ${String(mm).padStart(2, '0')}min` : `${mm}min`;
            const flag = min >= 1440 ? "🔥" : min >= 240 ? "⚠️" : "";
            return { min, txt, flag };
        };

        let qtdNovos = 0, qtdAtrasados = 0;
        Object.values(itensPorCat).forEach(lista => {
            lista.forEach(it => {
                it.idade = idade(it.dt);
                it.novo = anteriores ? !anteriores.has(it.id) : false;
                if (it.novo) qtdNovos++;
                if (it.idade && it.idade.min >= 240) qtdAtrasados++;
            });
            // Mais novos primeiro; sem data vão para o fim
            lista.sort((a, b) => (b.dt ? b.dt.getTime() : -Infinity) - (a.dt ? a.dt.getTime() : -Infinity));
        });

        const formato = document.getElementById('formatoNoc')?.value || 'completo';
        const corta = (t, n) => (t.length > n ? t.slice(0, n).trim() + '...' : t);
        const cats = Object.entries(itensPorCat).filter(([, l]) => l.length);
        const quando = agora.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        const extras = [qtdNovos ? `🆕 ${qtdNovos} novo(s)` : '', encerrados.length ? `✅ ${encerrados.length} encerrado(s)` : '', qtdAtrasados ? `⚠️ ${qtdAtrasados} acima de 4h` : ''].filter(Boolean).join(' · ');
        const MAX_ENC = 30;
        const encLista = encerrados.slice(0, MAX_ENC);
        const encResto = encerrados.length > MAX_ENC ? encerrados.length - MAX_ENC : 0;
        let relatorioFinal = '';

        if (formato === 'whatsapp') {
            relatorioFinal = `*📊 Relatório de chamados${nomeUsuarioNoc ? ' — ' + nomeUsuarioNoc : ''}*\n_${quando}_ · *${encontrados} chamado(s)*${extras ? '\n' + extras : ''}\n`;
            cats.forEach(([nome, lista]) => {
                relatorioFinal += `\n*${nome} (${lista.length})*\n`;
                lista.forEach(it => {
                    relatorioFinal += `• *${it.empresa}*${it.novo ? ' 🆕' : ''} — #${it.id}\n`;
                    const meta = [it.tipo, it.idade ? `aberto há ${it.idade.txt}${it.idade.flag ? ' ' + it.idade.flag : ''}` : '', it.usuario ? `por ${it.usuario}` : ''].filter(Boolean).join(' · ');
                    if (meta) relatorioFinal += `   ${meta}\n`;
                    if (it.descricao) relatorioFinal += `   _${corta(it.descricao.split('\n').join(' | '), 140)}_\n`;
                });
            });
        } else {
            relatorioFinal = `📊 RELATÓRIO DE CHAMADOS${nomeUsuarioNoc ? '  - ' + nomeUsuarioNoc.toUpperCase() : ''}\n📅 ${quando}\n📦 TOTAL: ${encontrados} CHAMADOS${extras ? '\n' + extras : ''}\n━━━━━━━━━━━━━━━\n`;
            relatorioFinal += cats.map(([nome, lista]) => `• ${nome}: ${lista.length}`).join('\n') + '\n━━━━━━━━━━━━━━━\n\n';
            cats.forEach(([nome, lista]) => {
                const blocos = lista.map(it => {
                    let t = `• ${it.empresa}${it.novo ? ' 🆕' : ''}\n📋 PROTOCOLO: ${it.id}`;
                    if (it.tipo) t += `\n🏷️ TIPO: ${it.tipo}`;
                    if (it.dataHora) t += `\n📅 DATA: ${it.dataHora}${it.idade ? ` (${it.idade.flag ? it.idade.flag + ' ' : ''}há ${it.idade.txt})` : ''}`;
                    if (it.descricao) t += `\n📝 DESCRIÇÃO: ${corta(it.descricao.split('\n').join(' | '), 180)}`;
                    if (it.usuario) t += `\n👤 ABERTO POR: ${it.usuario}`;
                    return t;
                });
                relatorioFinal += `🔴 ${nome} (${lista.length})\n${blocos.join('\n\n')}\n\n`;
            });
        }

        if (encerrados.length) {
            if (formato === 'whatsapp') {
                relatorioFinal += `\n*✅ Encerrados desde o último relatório (${encerrados.length})*\n`;
                relatorioFinal += encLista.map(e => `• ${e.empresa} — #${e.id}`).join('\n') + '\n';
            } else {
                relatorioFinal += `✅ ENCERRADOS DESDE O ÚLTIMO RELATÓRIO (${encerrados.length})\n`;
                relatorioFinal += encLista.map(e => `• ${e.empresa} — ${e.id} (estava em ${e.categoria})`).join('\n') + '\n';
            }
            if (encResto) relatorioFinal += `+${encResto} outro(s)\n`;
        }

        campoTexto.value = opcoes.silencioso
            ? textoAnterior
            : (encontrados > 0 || encerrados.length ? relatorioFinal : "Nenhum chamado capturado dentro do prazo.");

        indiceProtocolos = null;
        btnGerar.innerText = "Gerar relatório";
        btnGerar.disabled = false;
        btnCopiar.disabled = false;
        btnCopiar.innerText = "📋 Copiar";
        return { itens: Object.values(itensPorCat).flat(), avisoAuto };
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

    // =====================================================================
    // ========== STATUS DAS ROTAS (aba da janela do Relatório HubSoft) =====
    // =====================================================================
    const ROTAS_PADRAO = [
        'ROTA 381 = BHE-CMG01 <> CET-TRV01; CET-TRV01 <> JML-CNH01; JML-CNH01 <> NER-SJE01; NER-SJE01 <> IIG-VNZ01; IIG-VNZ01 <> BOT-PPS01',
        'ROTA MG10 = BHE-CMG01 <> BHE-JDC01; BHE-JDC01 <> VPN-JPI01; VPN-JPI01 <> LGT-LUN01; LGT-LUN01 <> SHX-SDC01; SHX-SDC01 <> CMD-CTR01; CMD-CTR01 <> CMD-SSB01; CMD-SSB01 <> GHE-CTR01; GHE-CTR01 <> DDS-CTR01; DDS-CTR01 <> SKO-CTR01; SKO-CTR01 <> GVS-SPO01',
        'ROTA SP4 = BHE-CMG01 <> CRM-ROD01; CRM-ROD01 <> PDS-NJD01; PDS-NJD01 <> TCS-ROD01; TCS-ROD01 <> PSA-COL01; PSA-COL01 <> EXM-PTN01; EXM-PTN01 <> SPO-TAT01; SPO-TAT01 <> BRE-TBE01; BRE-TBE01 <> BHE-CMG01; BHE-CMG02 <> BRE-TBE01',
        'ROTA CUV <> PTU = CUV-LDS01 <> MCL-TOS01; MCL-TOS01 <> PTU-CTR01',
        'ROTA 040 = BHE-CMG01 <> SLA-JDU01; SLA-JDU01 <> PEB-DRC01; PEB-DCR01 <> CUV-TRV01; CUV-TRV01 <> FXA-CTR01; FXA-CTR01 <> TMS-CTR01; TMS-CTR01 <> JPI-LDO01; JPI-LDO01 <> JPI-CTR01',
        'ROTA CUV <> CLH = CUV-TRV01 <> CUV-LDS01; CUV-LDS01 <> DMT-CTR01; DMT-CTR01 <> CLH-CTR01',
        'ROTA RJO = JFA-MHO01 <> RJO-SCV02; JFA-SMT01 <> RJO-SCV02; RJO-SCV01 <> VTA-SUA01',
    ].join('\n');

    const SEP_ROTAS = '━━━━━━━━━━━━━━━━━━━━━━';
    const dois = (n) => String(n).padStart(2, '0');
    const popNorm = (c) => ((String(c).toUpperCase().match(/[A-Z]{3}-[A-Z]{3}/) || [''])[0]);

    // "ROTA X = AAA-BBB01 <> CCC-DDD01; ..." -> [{ nome, pops:Set('AAA-BBB') }]
    function parseRotas(texto) {
        return String(texto || '').split('\n').map(l => l.trim()).filter(l => l.includes('=')).map(l => {
            const i = l.indexOf('=');
            const nome = l.slice(0, i).trim();
            const pops = new Set((l.slice(i + 1).toUpperCase().match(/[A-Z]{3}-[A-Z]{3}/g) || []));
            return { nome, pops };
        }).filter(r => r.nome);
    }

    // Trecho com 2 POPs na descrição: "CMD-CTR01 <> CGK-LAP01" ou "AOR <> RSP"
    function extrairTrecho(texto) {
        const t = String(texto || '').toUpperCase();
        const achados = [];
        const re = /(?<![A-Z])([A-Z]{3}-[A-Z]{3})(\d{2})?(?![A-Z])/g;
        let m;
        while ((m = re.exec(t)) && achados.length < 2) {
            if (!achados.includes(m[1])) achados.push(m[1]);
        }
        if (achados.length === 2) return { a: achados[0], b: achados[1] };
        const curto = t.match(/(?<![A-Z])([A-Z]{3})\s*<>\s*([A-Z]{3})(?![A-Z])/);
        if (curto) return { a: curto[1], b: curto[2] };
        return null;
    }

    function classificar(trecho, rotas) {
        const rota = rotas.find(r => r.pops.has(trecho.a) && r.pops.has(trecho.b));
        return rota ? { categoria: 'maior', rota: rota.nome } : { categoria: 'menor', rota: '' };
    }

    const formatarInicio = (dataHora) => {
        const m = String(dataHora || '').match(/(\d{2}\/\d{2}\/\d{4})\s*(\d{2}:\d{2}(?::\d{2})?)?/);
        return m ? `${m[1]}${m[2] ? ' - ' + m[2] : ''}` : '';
    };

    async function lerEstadoRotas() {
        try {
            const { rotasEstado } = await chrome.storage.local.get('rotasEstado');
            return Object.assign({ responsavel: '', rotasTexto: ROTAS_PADRAO, falhas: {}, ordem: [], abrConosco: [], abrNossas: [], ac: 'Sem falhas.', temp: 'Sem falhas.' }, rotasEstado || {});
        } catch (e) {
            return { responsavel: '', rotasTexto: ROTAS_PADRAO, falhas: {}, ordem: [], abrConosco: [], abrNossas: [], ac: 'Sem falhas.', temp: 'Sem falhas.' };
        }
    }
    let timerSalvarRotas = null;
    function salvarEstadoRotas(estado) {
        clearTimeout(timerSalvarRotas);
        timerSalvarRotas = setTimeout(() => {
            try { chrome.storage.local.set({ rotasEstado: estado }); } catch (e) { }
        }, 300);
    }

    // ---------- Texto final (formato WhatsApp do Status Geral das Rotas) ----------
    // "09/10/2026 - 04:53:29" -> timestamp (para ordenar do mais novo ao mais antigo)
    const tsInicio = (txt) => {
        const m = String(txt || '').match(/(\d{2})\/(\d{2})\/(\d{4})(?:\D+(\d{2}):(\d{2}))?/);
        return m ? new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0)).getTime() : -Infinity;
    };
    const maisNovoPrimeiro = (a, b) => tsInicio(b.inicio) - tsInicio(a.inicio);

    function gerarTextoRotas(estado) {
        const rotas = parseRotas(estado.rotasTexto);
        const falhas = estado.ordem.map(id => estado.falhas[id]).filter(f => f && f.categoria !== 'ignorar').sort(maisNovoPrimeiro);
        const maiores = falhas.filter(f => f.categoria === 'maior');
        const menores = falhas.filter(f => f.categoria === 'menor');
        const massivas = falhas.filter(f => f.massiva);
        const agora = new Date();
        const quando = `${dois(agora.getDate())}/${dois(agora.getMonth() + 1)}/${agora.getFullYear()} - ${dois(agora.getHours())}:${dois(agora.getMinutes())}`;
        const out = [];
        const campo = (rot, v) => (v && String(v).trim() ? `- *${rot}:* ${String(v).trim()}` : null);
        const blocoComum = (f, extras = []) => [
            campo('Início', f.inicio),
            campo('Protocolo', f.protocolo),
            ...extras,
            campo('Detentora', f.detentora),
            f.protocoloDetentora ? campo(`Protocolo ${f.detentora ? f.detentora.charAt(0).toUpperCase() + f.detentora.slice(1).toLowerCase() : 'Detentora'}`, f.protocoloDetentora) : null,
            campo('Status', f.status),
            campo('Previsão', f.previsao || 'S/I'),
        ].filter(Boolean);

        out.push('*STATUS GERAL DAS ROTAS*', '');
        out.push(`👤 *Responsável:* ${estado.responsavel || '-'}  `);
        out.push(`🕒 *Atualização:* ${quando}  `);
        out.push(`📊 *Resumo:* ${dois(maiores.length)} Maior Cap. | ${dois(menores.length)} Menor Cap. | ${dois(massivas.length)} Falha Massiva | ${dois(estado.abrConosco.length)} ABRs Registradas Conosco | ${dois(estado.abrNossas.length)} Nossas ABRs`);
        out.push('', SEP_ROTAS, '', '*STATUS DAS ROTAS*', '');
        rotas.forEach(r => {
            const afetada = maiores.some(f => f.rota === r.nome);
            out.push(`${afetada ? '🔴' : '🟢'} ${r.nome}  `);
        });
        // rota informada à mão que não está na lista também aparece
        [...new Set(maiores.map(f => f.rota).filter(n => n && !rotas.some(r => r.nome === n)))].forEach(n => out.push(`🔴 ${n}  `));

        out.push('', SEP_ROTAS, '', `*MAIOR CAPACIDADE (${dois(maiores.length)})*`, '');
        if (maiores.length) {
            out.push(maiores.map(f => [`🔴 *AFETA ${f.rota || 'ROTA ?'}*`, campo('Menor trecho', f.trecho), ...blocoComum(f)].filter(Boolean).join('\n')).join('\n\n---\n\n'));
        } else out.push('- Sem falhas.');

        out.push('', SEP_ROTAS, '', `*MENOR CAPACIDADE (${dois(menores.length)})*`, '');
        if (menores.length) {
            out.push(menores.map(f => [`🔴 *${f.trecho || '?'}*`, ...blocoComum(f)].join('\n')).join('\n\n---\n\n'));
        } else out.push('- Sem falhas.');

        out.push('', SEP_ROTAS, '', `*FALHAS MASSIVAS (${dois(massivas.length)})*`, '');
        if (massivas.length) {
            out.push(massivas.map(f => {
                const clientes = String(f.clientes || '').split('/').map(c => c.trim()).filter(Boolean);
                const extras = [
                    clientes.length ? `- *Afetação:* ${dois(clientes.length)} cliente${clientes.length > 1 ? 's' : ''}` : null,
                    clientes.length ? `- *Clientes:* ${clientes.join(' / ')}` : null,
                ].filter(Boolean);
                return [`🔴 *${f.trecho || '?'}*`, ...blocoComum(f, extras)].join('\n');
            }).join('\n\n---\n\n'));
        } else out.push('- Sem falhas.');

        const blocoAbr = (a) => [
            `*Seq. BA:* ${a.seq || 'S/I'}`,
            campo('HUB', a.hub), campo('Cessionária', a.cessionaria), campo('Tipo', a.tipo),
            campo('Trecho', a.trecho), campo('Status', a.status),
        ].filter(Boolean).join('\n');

        out.push('', SEP_ROTAS, '', `*ABRs REGISTRADAS CONOSCO (${dois(estado.abrConosco.length)})*`, '');
        out.push(estado.abrConosco.length ? estado.abrConosco.map(blocoAbr).join('\n\n---\n\n') : '- Sem registros.');

        out.push('', SEP_ROTAS, '', '*NOSSAS ABRs REGISTRADAS*', '');
        out.push(estado.abrNossas.length ? estado.abrNossas.map(blocoAbr).join('\n\n---\n\n') : '- Sem registros.');

        out.push('', SEP_ROTAS, '', '*FALHAS AC*', '', `- ${estado.ac || 'Sem falhas.'}`);
        out.push('', SEP_ROTAS, '', '*TEMPERATURA (L4)*', '', `- ${estado.temp || 'Sem falhas.'}`);
        return out.join('\n');
    }

    // ---------- Interface ----------
    function criar(tag, css, props = {}) {
        const e = document.createElement(tag);
        if (css) e.style.cssText = css;
        Object.assign(e, props);
        return e;
    }
    const CSS_INPUT = 'width:100%; box-sizing:border-box; padding:7px 9px; border:2px solid var(--noc-border, #E3EBE4); border-radius:8px; background:var(--noc-surface2, #F4F8F4); color:var(--noc-text, #17231A); font-family:inherit; font-size:12.5px;';
    const CSS_LABEL = 'display:block; font-size:10.5px; font-weight:700; text-transform:uppercase; letter-spacing:.3px; color:var(--noc-text2, #6B7A6E); margin:6px 0 3px;';
    const CSS_CARD = 'border:1px solid var(--noc-border, #E3EBE4); border-radius:10px; padding:10px 12px; margin-bottom:10px; background:var(--noc-surface, #fff);';
    const CSS_TITULO = 'font-size:12px; font-weight:800; color:var(--noc-text, #17231A); margin:14px 0 8px; text-transform:uppercase; letter-spacing:.4px;';
    const CSS_BTN2 = 'padding:7px 12px; border:none; border-radius:8px; background:var(--noc-tint, #E8F5E9); color:var(--noc-accent, #2E7D32); font-weight:600; font-size:12px; cursor:pointer;';

    function campoTexto(rotulo, valor, onInput, opts = {}) {
        const w = criar('div', opts.largura ? `flex:${opts.largura}; min-width:0;` : '');
        w.append(criar('label', CSS_LABEL, { textContent: rotulo }));
        const inp = criar(opts.area ? 'textarea' : 'input', CSS_INPUT + (opts.area ? 'min-height:54px; resize:vertical;' : ''));
        inp.value = valor || '';
        if (opts.placeholder) inp.placeholder = opts.placeholder;
        inp.addEventListener('input', () => onInput(inp.value));
        w.append(inp);
        return w;
    }
    const linha = (...filhos) => { const l = criar('div', 'display:flex; gap:8px;'); l.append(...filhos); return l; };

    async function montarAbaRotas(painel) {
        const estado = await lerEstadoRotas();
        if (!estado.responsavel) estado.responsavel = (document.title.replace('HubSoft | ', '').trim() || '').replace(/^HubSoft$/, '');
        painel.innerHTML = '';

        // Topo: responsável + ler chamados + configurar rotas
        const topo = criar('div', 'display:flex; gap:8px; align-items:flex-end;');
        topo.append(campoTexto('Responsável', estado.responsavel, v => { estado.responsavel = v; salvarEstadoRotas(estado); }, { largura: 1 }));
        const btnLer = criar('button', CSS_BTN2 + 'background:linear-gradient(135deg, var(--noc-pri, #2E7D32) 0%, var(--noc-pri2, #1B5E20) 100%); color:var(--noc-on-pri, #fff); padding:9px 12px;', { textContent: '🔄 Ler chamados' });
        const btnCfg = criar('button', CSS_BTN2 + 'padding:9px 12px;', { textContent: '⚙️ Rotas' });
        topo.append(btnLer, btnCfg);
        painel.append(topo);

        const status = criar('div', 'font-size:12px; color:var(--noc-text2, #6B7A6E); margin:8px 0 2px; min-height:16px;');
        status.textContent = estado.lidoEm ? `Última leitura: ${new Date(estado.lidoEm).toLocaleString('pt-BR')}` : 'Clique em "Ler chamados" para buscar as falhas no HubSoft.';
        painel.append(status);

        // Configuração das rotas (texto editável)
        const cfg = criar('div', 'display:none; margin-top:8px;');
        cfg.append(criar('div', 'font-size:11.5px; color:var(--noc-text2, #6B7A6E); margin-bottom:4px;', { textContent: 'Uma rota por linha: NOME = POP <> POP; POP <> POP. A falha vira "Maior capacidade" quando os dois POPs do trecho estão na mesma rota.' }));
        const cfgArea = criar('textarea', CSS_INPUT + 'min-height:150px; font-family:Consolas, monospace; font-size:11px; white-space:pre;');
        cfgArea.value = estado.rotasTexto;
        cfgArea.addEventListener('input', () => { estado.rotasTexto = cfgArea.value; salvarEstadoRotas(estado); });
        const btnPadrao = criar('button', CSS_BTN2 + 'margin-top:6px;', { textContent: 'Restaurar lista padrão' });
        btnPadrao.onclick = () => { cfgArea.value = ROTAS_PADRAO; estado.rotasTexto = ROTAS_PADRAO; salvarEstadoRotas(estado); render(); };
        cfg.append(cfgArea, btnPadrao);
        btnCfg.onclick = () => { cfg.style.display = cfg.style.display === 'none' ? '' : 'none'; if (cfg.style.display === 'none') render(); };
        painel.append(cfg);

        const lista = criar('div');
        painel.append(lista);

        function cardFalha(f) {
            const card = criar('div', CSS_CARD);
            const rotas = parseRotas(estado.rotasTexto);
            const salvar = () => salvarEstadoRotas(estado);
            const cab = criar('div', 'display:flex; justify-content:space-between; gap:8px; align-items:center;');
            cab.append(criar('div', 'font-weight:700; font-size:13px; color:var(--noc-text, #17231A);', { textContent: `🔴 ${f.trecho || 'Falha'}` }));
            cab.append(criar('div', 'font-size:11px; color:var(--noc-text2, #6B7A6E); text-align:right;', { textContent: [f.empresa, f.protocolo ? '#' + f.protocolo : ''].filter(Boolean).join(' · ') }));
            card.append(cab);

            const selCat = criar('select', CSS_INPUT);
            [['maior', 'Maior capacidade'], ['menor', 'Menor capacidade'], ['ignorar', 'Não incluir']].forEach(([v, t]) => selCat.append(criar('option', '', { value: v, textContent: t })));
            selCat.value = f.categoria;
            const selRota = criar('select', CSS_INPUT);
            selRota.append(criar('option', '', { value: '', textContent: '— rota afetada —' }));
            rotas.forEach(r => selRota.append(criar('option', '', { value: r.nome, textContent: r.nome })));
            if (f.rota && !rotas.some(r => r.nome === f.rota)) selRota.append(criar('option', '', { value: f.rota, textContent: f.rota }));
            selRota.value = f.rota || '';
            const wCat = criar('div', 'flex:1;'); wCat.append(criar('label', CSS_LABEL, { textContent: 'Classificação' }), selCat);
            const wRota = criar('div', 'flex:1;'); wRota.append(criar('label', CSS_LABEL, { textContent: 'Afeta rota' }), selRota);
            card.append(linha(wCat, wRota));
            const corpo = criar('div');
            const atualizarVis = () => { wRota.style.visibility = selCat.value === 'maior' ? 'visible' : 'hidden'; corpo.style.display = selCat.value === 'ignorar' ? 'none' : ''; card.style.opacity = selCat.value === 'ignorar' ? '.55' : '1'; };
            selCat.onchange = () => { f.categoria = selCat.value; atualizarVis(); salvar(); };
            selRota.onchange = () => { f.rota = selRota.value; salvar(); };

            corpo.append(linha(
                campoTexto(f.categoria === 'maior' ? 'Menor trecho' : 'Trecho', f.trecho, v => { f.trecho = v; salvar(); }, { largura: 2 }),
                campoTexto('Início', f.inicio, v => { f.inicio = v; salvar(); }, { largura: 1 })
            ));
            if (f.manual) corpo.append(campoTexto('Protocolo', f.protocolo, v => { f.protocolo = v; salvar(); }));
            corpo.append(linha(
                campoTexto('Detentora', f.detentora, v => { f.detentora = v; salvar(); }, { largura: 1, placeholder: 'ex.: VALE' }),
                campoTexto('Protocolo da detentora', f.protocoloDetentora, v => { f.protocoloDetentora = v; salvar(); }, { largura: 1 })
            ));
            corpo.append(campoTexto('Status', f.status, v => { f.status = v; salvar(); }, { area: true, placeholder: 'ex.: Equipe em campo...' }));
            const linhaMass = criar('label', 'display:flex; align-items:center; gap:6px; font-size:12px; margin-top:8px; color:var(--noc-text, #17231A); cursor:pointer;');
            const chkMass = criar('input', 'margin:0; accent-color:var(--noc-pri, #2E7D32);', { type: 'checkbox', checked: !!f.massiva });
            linhaMass.append(chkMass, document.createTextNode('Falha massiva'));
            const clientesBox = campoTexto('Clientes afetados (separe com /)', f.clientes, v => { f.clientes = v; salvar(); }, { placeholder: 'ACSNET / EXPRESSO MINAS FRIOS LTDA' });
            clientesBox.style.display = f.massiva ? '' : 'none';
            chkMass.onchange = () => { f.massiva = chkMass.checked; clientesBox.style.display = f.massiva ? '' : 'none'; salvar(); };
            corpo.append(linha(campoTexto('Previsão', f.previsao, v => { f.previsao = v; salvar(); }, { largura: 1, placeholder: 'S/I' }), criar('div', 'flex:1; display:flex; align-items:flex-end;')));
            corpo.lastChild.lastChild.append(linhaMass);
            corpo.append(clientesBox);
            if (f.manual) {
                const rm = criar('button', CSS_BTN2 + 'margin-top:8px;', { textContent: '🗑 Remover falha manual' });
                rm.onclick = () => { delete estado.falhas[f.id]; estado.ordem = estado.ordem.filter(x => x !== f.id); salvar(); render(); };
                corpo.append(rm);
            }
            card.append(corpo);
            atualizarVis();
            return card;
        }

        function listaAbr(chave, titulo, comImportar) {
            const box = criar('div');
            box.append(criar('div', CSS_TITULO, { textContent: `${titulo} (${dois(estado[chave].length)})` }));
            estado[chave].forEach((a, idx) => {
                const c = criar('div', CSS_CARD);
                const s = () => salvarEstadoRotas(estado);
                c.append(linha(
                    campoTexto('Seq. BA', a.seq, v => { a.seq = v; s(); }, { largura: 1 }),
                    campoTexto('HUB', a.hub, v => { a.hub = v; s(); }, { largura: 2 }),
                    campoTexto('Cessionária', a.cessionaria, v => { a.cessionaria = v; s(); }, { largura: 1 })
                ));
                c.append(linha(
                    campoTexto('Tipo', a.tipo, v => { a.tipo = v; s(); }, { largura: 1 }),
                    campoTexto('Trecho', a.trecho, v => { a.trecho = v; s(); }, { largura: 2 })
                ));
                c.append(campoTexto('Status', a.status, v => { a.status = v; s(); }, { area: true }));
                const rm = criar('button', CSS_BTN2 + 'margin-top:6px;', { textContent: '🗑 Remover' });
                rm.onclick = () => { estado[chave].splice(idx, 1); s(); render(); };
                c.append(rm);
                box.append(c);
            });
            const acoes = criar('div', 'display:flex; gap:8px;');
            const add = criar('button', CSS_BTN2, { textContent: '+ Adicionar' });
            add.onclick = () => { estado[chave].push({ seq: '', hub: '', cessionaria: '', tipo: '', trecho: '', status: '' }); salvarEstadoRotas(estado); render(); };
            acoes.append(add);
            if (comImportar) {
                const imp = criar('button', CSS_BTN2, { textContent: '📥 Importar BAs recebidas' });
                imp.title = 'Traz as BAs que chegaram pelos Alertas Externos (ABR Monitor)';
                imp.onclick = async () => {
                    let n = 0;
                    try {
                        const { extAlerts = [] } = await chrome.storage.local.get('extAlerts');
                        extAlerts.filter(al => /abr/i.test(al.source || '') && al.data && Array.isArray(al.data.items)).forEach(al => {
                            al.data.items.forEach(it => {
                                const seq = String(it.seq_ba || '').trim();
                                if (!seq || estado[chave].some(x => String(x.seq).trim() === seq)) return;
                                estado[chave].push({ seq, hub: '', cessionaria: it.cessionaria || '', tipo: '', trecho: '', status: it.status || '' });
                                n++;
                            });
                        });
                    } catch (e) { }
                    status.textContent = n ? `✓ ${n} BA(s) importada(s).` : 'Nenhuma BA nova nos Alertas Externos.';
                    salvarEstadoRotas(estado); render();
                };
                acoes.append(imp);
            }
            box.append(acoes);
            return box;
        }

        function render() {
            lista.innerHTML = '';
            const falhas = estado.ordem.map(id => estado.falhas[id]).filter(Boolean).sort(maisNovoPrimeiro);
            lista.append(criar('div', CSS_TITULO, { textContent: `Falhas (${dois(falhas.filter(f => f.categoria !== 'ignorar').length)})` }));
            if (!falhas.length) lista.append(criar('div', 'font-size:12px; color:var(--noc-text2, #6B7A6E); margin-bottom:8px;', { textContent: 'Nenhuma falha com trecho de POP encontrada nos chamados.' }));
            falhas.forEach(f => lista.append(cardFalha(f)));
            const addF = criar('button', CSS_BTN2, { textContent: '+ Falha manual' });
            addF.onclick = () => {
                const id = 'manual-' + Date.now();
                estado.falhas[id] = { id, manual: true, categoria: 'menor', rota: '', trecho: '', inicio: '', protocolo: '', detentora: '', protocoloDetentora: '', status: '', previsao: 'S/I', massiva: false, clientes: '' };
                estado.ordem.push(id); salvarEstadoRotas(estado); render();
            };
            lista.append(addF);
            lista.append(listaAbr('abrConosco', 'ABRs registradas conosco', true));
            lista.append(listaAbr('abrNossas', 'Nossas ABRs registradas', false));
            lista.append(criar('div', CSS_TITULO, { textContent: 'Falhas AC e temperatura' }));
            lista.append(linha(
                campoTexto('Falhas AC', estado.ac, v => { estado.ac = v; salvarEstadoRotas(estado); }, { largura: 1 }),
                campoTexto('Temperatura (L4)', estado.temp, v => { estado.temp = v; salvarEstadoRotas(estado); }, { largura: 1 })
            ));
            const btnGerarR = criar('button', CSS_BTN2 + 'width:100%; margin-top:14px; padding:11px; font-size:13px; background:linear-gradient(135deg, var(--noc-pri, #2E7D32) 0%, var(--noc-pri2, #1B5E20) 100%); color:var(--noc-on-pri, #fff);', { textContent: '📝 Gerar texto' });
            const saida = criar('textarea', CSS_INPUT + 'min-height:220px; margin-top:10px; font-family:Consolas, monospace; font-size:11px; display:none;', { readOnly: true });
            const btnCopiarR = criar('button', CSS_BTN2 + 'width:100%; margin-top:8px; padding:9px; display:none;', { textContent: '📋 Copiar' });
            btnGerarR.onclick = () => { saida.value = gerarTextoRotas(estado); saida.style.display = ''; btnCopiarR.style.display = ''; saida.scrollIntoView({ block: 'nearest' }); };
            btnCopiarR.onclick = async () => {
                try { await navigator.clipboard.writeText(saida.value); } catch (e) { saida.select(); document.execCommand('copy'); }
                btnCopiarR.textContent = '✓ Copiado!'; setTimeout(() => { btnCopiarR.textContent = '📋 Copiar'; }, 1800);
            };
            lista.append(btnGerarR, saida, btnCopiarR);
        }

        btnLer.onclick = async () => {
            btnLer.disabled = true;
            try {
                const r = await processar({ ignorarPeriodo: true, silencioso: true, onProgresso: t => { status.textContent = t; } });
                const rotas = parseRotas(estado.rotasTexto);
                const presentes = new Set();
                (r.itens || []).forEach(it => {
                    const trecho = extrairTrecho(it.descricao);
                    if (!trecho) return;
                    presentes.add(it.id);
                    const atual = estado.falhas[it.id];
                    if (atual) { atual.empresa = it.empresa; return; } // mantém o que você já preencheu
                    const cls = classificar(trecho, rotas);
                    estado.falhas[it.id] = {
                        id: it.id, protocolo: it.id, empresa: it.empresa,
                        categoria: cls.categoria, rota: cls.rota,
                        trecho: `${trecho.a} <> ${trecho.b}`,
                        inicio: formatarInicio(it.dataHora),
                        detentora: '', protocoloDetentora: '', status: '', previsao: 'S/I', massiva: false, clientes: '',
                    };
                    estado.ordem.push(it.id);
                });
                // falhas que saíram do quadro (encerradas) somem; as manuais ficam
                const removidas = estado.ordem.filter(id => !String(id).startsWith('manual-') && !presentes.has(id));
                removidas.forEach(id => delete estado.falhas[id]);
                estado.ordem = estado.ordem.filter(id => estado.falhas[id]);
                estado.lidoEm = Date.now();
                salvarEstadoRotas(estado);
                status.textContent = `✓ ${presentes.size} falha(s) com trecho encontrada(s)${removidas.length ? ` · ${removidas.length} encerrada(s) removida(s)` : ''}.${r.avisoAuto ? ' ' + r.avisoAuto : ''}`;
                render();
            } catch (e) {
                status.textContent = 'Erro ao ler os chamados: ' + (e && e.message ? e.message : e);
            }
            btnLer.disabled = false;
        };

        render();
    }

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
    const formatoSelect = document.createElement('select');
    formatoSelect.id = 'formatoNoc';
    formatoSelect.title = 'Formato do relatório';
    formatoSelect.style.cssText = daysSelect.style.cssText + 'flex-grow: 0; min-width: 170px;';
    [['completo', 'Formato completo'], ['whatsapp', 'WhatsApp / Teams']].forEach(([v, t]) => {
        const o = document.createElement('option'); o.value = v; o.textContent = t; formatoSelect.appendChild(o);
    });
    try {
        chrome.storage.local.get('hubsoftFormato').then(r => { if (r.hubsoftFormato) formatoSelect.value = r.hubsoftFormato; }).catch(() => { });
    } catch (e) { }
    formatoSelect.addEventListener('change', () => {
        try { chrome.storage.local.set({ hubsoftFormato: formatoSelect.value }); } catch (e) { }
    });

    daysRow.append(daysLabel, daysSelect, formatoSelect);
    inner.appendChild(daysRow);

    const verMaisRow = document.createElement('label');
    verMaisRow.style.cssText = 'display: flex; align-items: center; gap: 8px; margin: -4px 0 12px; font-size: 12.5px; color: var(--noc-text2, #6B7A6E); cursor: pointer;';
    const verMaisChk = document.createElement('input');
    verMaisChk.type = 'checkbox';
    verMaisChk.id = 'verMaisNoc';
    verMaisChk.checked = true;
    verMaisChk.style.cssText = 'accent-color: var(--noc-pri, #2E7D32); margin: 0;';
    verMaisRow.append(verMaisChk, document.createTextNode('Carregar todos os cards (clica em "Ver mais" nas colunas)'));
    inner.appendChild(verMaisRow);

    const autoRow = document.createElement('label');
    autoRow.style.cssText = verMaisRow.style.cssText;
    const autoChk = document.createElement('input');
    autoChk.type = 'checkbox';
    autoChk.id = 'autoAbrirNoc';
    autoChk.checked = true;
    autoChk.style.cssText = verMaisChk.style.cssText;
    try {
        chrome.storage.local.get('hubsoftAutoAbrir').then(r => { if (r.hubsoftAutoAbrir === false) autoChk.checked = false; }).catch(() => { });
    } catch (e) { }
    autoChk.addEventListener('change', () => { try { chrome.storage.local.set({ hubsoftAutoAbrir: autoChk.checked }); } catch (e) { } });
    autoRow.append(autoChk, document.createTextNode('Abrir cada atendimento para pegar quem abriu (só na 1ª vez de cada chamado)'));
    inner.appendChild(autoRow);

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

    const btnCapturar = document.createElement('button');
    btnCapturar.id = 'btnCapturarNoc';
    btnCapturar.className = 'noc-btn-secundario';
    btnCapturar.textContent = '📥 Capturar atendimento';
    btnCapturar.title = 'Com um atendimento aberto no HubSoft, gera o resumo dele';
    btnCapturar.style.cssText = btnCopiar.style.cssText;
    btnCapturar.onclick = capturarAtendimento;
    btnRow.appendChild(btnCapturar);

    const btnParar = document.createElement('button');
    btnParar.id = 'btnPararNoc';
    btnParar.className = 'noc-btn-secundario';
    btnParar.textContent = '⏹ Parar';
    btnParar.style.cssText = btnCopiar.style.cssText + 'flex: 0 0 auto;';
    btnParar.style.display = 'none';
    btnParar.onclick = () => { pararAuto = true; btnParar.textContent = 'Parando...'; };
    btnRow.appendChild(btnParar);

    const statusCaptura = document.createElement('div');
    statusCaptura.id = 'statusCapturaNoc';
    statusCaptura.style.cssText = 'margin-top: 10px; font-size: 12px; color: var(--noc-text2, #6B7A6E); min-height: 16px;';
    statusCaptura.textContent = 'Dica: com esta janela aberta, cada atendimento que você abrir fica guardado e completa o relatório (quem abriu, tipo e SLA).';
    inner.appendChild(statusCaptura);

    // ---------- Abas: Chamados | Status das Rotas ----------
    const painelChamados = document.createElement('div');
    painelChamados.append(...inner.childNodes);
    const painelRotas = document.createElement('div');
    painelRotas.style.display = 'none';
    const abas = document.createElement('div');
    abas.style.cssText = 'display:flex; gap:6px; margin-bottom:14px; border-bottom:2px solid var(--noc-border, #E3EBE4);';
    const criarAba = (txt) => {
        const b = document.createElement('button');
        b.textContent = txt;
        b.style.cssText = 'padding:8px 14px; border:none; background:transparent; cursor:pointer; font-weight:600; font-size:13px; color:var(--noc-text2, #6B7A6E); border-bottom:3px solid transparent; margin-bottom:-2px;';
        return b;
    };
    const abaChamados = criarAba('📋 Chamados');
    const abaRotas = criarAba('🛰️ Status das Rotas');
    let rotasMontada = false;
    const ativar = (qual) => {
        const r = qual === 'rotas';
        painelChamados.style.display = r ? 'none' : '';
        painelRotas.style.display = r ? '' : 'none';
        [[abaChamados, !r], [abaRotas, r]].forEach(([b, on]) => {
            b.style.color = on ? 'var(--noc-accent, #2E7D32)' : 'var(--noc-text2, #6B7A6E)';
            b.style.borderBottomColor = on ? 'var(--noc-pri, #2E7D32)' : 'transparent';
        });
        if (r && !rotasMontada) { rotasMontada = true; montarAbaRotas(painelRotas); }
    };
    abaChamados.onclick = () => ativar('chamados');
    abaRotas.onclick = () => ativar('rotas');
    abas.append(abaChamados, abaRotas);
    inner.append(abas, painelChamados, painelRotas);
    ativar('chamados');

    document.body.appendChild(modal);
}