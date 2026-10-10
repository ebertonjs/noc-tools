// =============================================================================
// GERADOR DE RELATÓRIO DE FALHAS (ROTAS) - NOC EXTENSION
// =============================================================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "gerarRelatorioStatus") {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const currentTab = tabs[0];

            if (!currentTab || !currentTab.url) {
                sendResponse({ success: false, message: "Nenhuma aba ativa encontrada." });
                return;
            }

            if (!(currentTab.url.includes("atlassian.net") || currentTab.url.includes("jira.com"))) {
                sendResponse({ success: false, message: "Você não está em uma página do Jira." });
                return;
            }

            executarComTema(
                {
                    target: { tabId: currentTab.id },
                    files: ["background/background-content-relatorio-extractor.js"],
                },
                () => {
                    if (chrome.runtime.lastError) {
                        console.error("Erro ao injetar o script:", chrome.runtime.lastError.message);
                        sendResponse({
                            success: false,
                            message:
                                "Erro ao iniciar a extração. O script não pôde ser injetado na página. Recarregue a página do Jira e tente novamente.",
                        });
                        return;
                    }
                    sendResponse({ success: true, message: "Janela de extração aberta. Role a página e finalize quando terminar." });
                }
            );
        });

        return true;
    }

    if (request.action === "finalizarRelatorioExtracao") {
        (async () => {
            try {
                const tickets = Array.isArray(request.tickets) ? request.tickets : [];
                const usuarioAtivo = request.usuarioAtivo || "N/A";

                if (tickets.length === 0) {
                    sendResponse({ success: false, message: "Nenhum ticket capturado. Role a página e tente novamente." });
                    return;
                }

                const separated = await separarTicketsPorMarcadoresInternos(tickets);

                const relatorio = processarRotasJira(
                    separated.ticketsNormais,
                    usuarioAtivo,
                    separated.ticketsABR,
                    separated.ticketsBA,
                    separated.ticketsSEQBA
                );

                sendResponse({ success: true, relatorio });
                return;
            } catch (e) {
                console.error("Erro ao finalizar relatório:", e);
                sendResponse({ success: false, message: e?.message || "Erro ao gerar relatório." });
                return;
            }
        })();

        return true;
    }
});

async function separarTicketsPorMarcadoresInternos(tickets) {
    const LIMITE_LEITURA_INTERNA = 80;

    const ticketsABR = [];
    const ticketsBA = [];
    const ticketsSEQBA = [];
    const ticketsNormais = [];

    for (let i = 0; i < tickets.length; i++) {
        const t = tickets[i];

        const url = t.url || null;

        if (i >= LIMITE_LEITURA_INTERNA) {
            ticketsNormais.push({ ...t, url });
            continue;
        }

        let textoUpper = "";
        if (url) {
            textoUpper = await lerTextoInternoDoChamadoUpper(url);
        }

        const seqBA = extrairSEQBA(textoUpper);
        if (seqBA) {
            ticketsSEQBA.push({
                ...t,
                url,
                marcador: normalizarMarcador(seqBA),
                cliente: extrairClienteDoResumo(t.resumo || ""),
            });
            continue;
        }

        const ba = extrairBA(textoUpper);
        if (ba) {
            ticketsBA.push({
                ...t,
                url,
                marcador: normalizarMarcador(ba),
                cliente: extrairClienteDoResumo(t.resumo || ""),
            });
            continue;
        }

        const abr = extrairABR(textoUpper);
        if (abr) {
            ticketsABR.push({
                ...t,
                url,
                marcador: normalizarMarcador(abr),
                cliente: extrairClienteDoResumo(t.resumo || ""),
            });
            continue;
        }

        ticketsNormais.push({ ...t, url });
    }


    return { ticketsNormais, ticketsABR, ticketsBA, ticketsSEQBA };
}

async function lerTextoInternoDoChamadoUpper(url) {
    try {
        const res = await fetch(url, { credentials: "include" });
        const html = await res.text();
        const txt = htmlToText(html);
        return txt.toUpperCase();
    } catch (e) {
        return "";
    }
}

function htmlToText(html) {
    if (!html) return "";

    let s = String(html);

    s = s.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ");
    s = s.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ");

    s = s.replace(/<br\s*\/?>/gi, "\n");
    s = s.replace(/<\/p>/gi, "\n");

    s = s.replace(/<[^>]+>/g, " ");

    s = s
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'");

    s = s.replace(/[ \t\r\f\v]+/g, " ");
    s = s.replace(/\n{3,}/g, "\n\n");

    return s.trim();
}

function normalizarMarcador(m) {
    return String(m || "")
        .replace(/\s+/g, " ")
        .replace(/\s*-\s*/g, "-")
        .replace(/\[\s*/g, "[")
        .replace(/\s*\]/g, "]")
        .trim();
}

function extrairABR(textoUpper) {
    const m1 = textoUpper.match(/\bABR\s*-\s*\d+\b/);
    if (m1?.[0]) return m1[0];
    const m2 = textoUpper.match(/\bABR\s*\d+\b/);
    if (m2?.[0]) return m2[0];
    return null;
}

function extrairSEQBA(textoUpper) {
    const m1 = textoUpper.match(/\bSEQ\.?\s*BA\s*-\s*(?:\[\s*)?\d+(?:\s*\])?\b/);
    if (m1?.[0]) return m1[0];
    const m2 = textoUpper.match(/\bSEQ\.?\s*BA\s*(?:\[\s*)?\d+(?:\s*\])?\b/);
    if (m2?.[0]) return m2[0];
    const m3 = textoUpper.match(/\bSEQBA\s*-\s*\d+\b/);
    if (m3?.[0]) return m3[0];
    const m4 = textoUpper.match(/\bSEQBA\s*\d+\b/);
    if (m4?.[0]) return m4[0];
    return null;
}

function extrairBA(textoUpper) {
    const m1 = textoUpper.match(/\bBA\s*-\s*(?:\[\s*)?\d+(?:\s*\])?\b/);
    if (m1?.[0]) return m1[0];
    const m2 = textoUpper.match(/\bBA\s*(?:\[\s*)?\d+(?:\s*\])?\b/);
    if (m2?.[0]) return m2[0];
    return null;
}

function extrairClienteDoResumo(resumo) {
    const s = String(resumo || "").toUpperCase();

    let m = s.match(/INDISPONIBILIDADE\s*-\s*([^-\n]+?)\s*-\s*/i);
    if (m?.[1]) return m[1].trim();

    m = s.match(/QUALIDADE\s*-\s*([^-\n]+?)\s*-\s*/i);
    if (m?.[1]) return m[1].trim();

    const clean = s.replace(/\s+/g, " ").trim();
    return clean ? clean.slice(0, 40).trim() : "CLIENTE NÃO IDENTIFICADO";
}

function processarRotasJira(tickets, usuarioAtivo, ticketsABR = [], ticketsBA = [], ticketsSEQBA = []) {
    const linha = "━━━━━━━━━━━━━━━";

    const now = new Date();
    const dataHora = now.toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    });

    // Configuração das rotas (mantém a mesma estrutura)
    const rotasAlta = {
        "381": {
            enlaces: [
                { a: "BHE-CMG01", b: "CET-TRV01" },
                { a: "CET-TRV01", b: "JML-CNH01" },
                { a: "JML-CNH01", b: "NER-SJE01" },
                { a: "NER-SJE01", b: "IIG-VNZ01" },
                { a: "IIG-VNZ01", b: "BOT-PPS01" }
            ]
        },
        "MG10": {
            enlaces: [
                { a: "BHE-CMG01", b: "BHE-JDC01" },
                { a: "BHE-JDC01", b: "VPN-JPI01" },
                { a: "VPN-JPI01", b: "LGT-LUN01" },
                { a: "LGT-LUN01", b: "SHX-SDC01" },
                { a: "SHX-SDC01", b: "CMD-CTR01" },
                { a: "CMD-CTR01", b: "CMD-SSB01" },
                { a: "CMD-SSB01", b: "GHE-CTR01" },
                { a: "GHE-CTR01", b: "DDS-CTR01" },
                { a: "DDS-CTR01", b: "SKO-CTR01" },
                { a: "SKO-CTR01", b: "GVS-SPO01" },
                { a: "BHE-CMG02", b: "CMD-CTR01" }
            ]
        },
        "BHE X BRE (SP4)": {
            enlaces: [
                { a: "BHE-CMG01", b: "CRM-ROD01" },
                { a: "CRM-ROD01", b: "PDS-NJD01" },
                { a: "PDS-NJD01", b: "TCS-ROD01" },
                { a: "TCS-ROD01", b: "PSA-COL01" },
                { a: "PSA-COL01", b: "EXM-PTN01" },
                { a: "EXM-PTN01", b: "SPO-TAT01" },
                { a: "SPO-TAT01", b: "BRE-TBE01" },
                { a: "BRE-TBE01", b: "BHE-CMG01" },
                { a: "BHE-CMG02", b: "BRE-TBE01" }
            ]
        },
        "ROTA CUV <> PTU": {
            enlaces: [
                { a: "CUV-LDS01", b: "MCL-TOS01" },
                { a: "MCL-TOS01", b: "PTU-CTR01" }
            ]
        },
        "040": {
            enlaces: [
                { a: "BHE-CMG01", b: "SLA-JDU01" },
                { a: "SLA-JDU01", b: "PEB-DRC01" },
                { a: "PEB-DCR01", b: "CUV-TRV01" },
                { a: "CUV-TRV01", b: "FXA-CTR01" },
                { a: "FXA-CTR01", b: "TMS-CTR01" },
                { a: "TMS-CTR01", b: "JPI-LDO01" },
                { a: "JPI-LDO01", b: "JPI-CTR01" }
            ]
        },
        "ROTA CUV <> CLH": {
            enlaces: [
                { a: "CUV-TRV01", b: "CUV-LDS01" },
                { a: "CUV-LDS01", b: "DMT-CTR01" },
                { a: "DMT-CTR01", b: "CLH-CTR01" }
            ]
        },
        "RJO": {
            enlaces: [
                { a: "JFA-MHO01", b: "RJO-SCV02" },
                { a: "JFA-SMT01", b: "RJO-SCV02" },
                { a: "RJO-SCV01", b: "VTA-SUA01" },
                { a: "BRE-TBE01", b: "RJO-SCV01" }
            ]
        }
    };

    const menor = {
        nome: "ROTAS DE MENOR CAPACIDADE",
        status: "✅",
        tickets: []
    };

    // Funções auxiliares (mantém as mesmas)
    const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const basePop = (popCompleto) => {
        return popCompleto.replace(/-/g, "");
    };

    const matchPopNoTexto = (texto, popCompleto) => {
        const full = popCompleto.toUpperCase();
        if (texto.includes(full)) return true;
        const base = basePop(popCompleto).toUpperCase();
        const re = new RegExp(escapeRegExp(base), "i");
        return re.test(texto);
    };

    const matchPopAlta = (rotaNome, textoUpper, popCompleto) => {
        const full = String(popCompleto).toUpperCase();
        if (!full) return false;
        if (rotaNome === "MG10") {
            return textoUpper.includes(full);
        }
        return matchPopNoTexto(textoUpper, full);
    };

    const extrairParPopMenor = (texto) => {
        const re = /([A-Z]{3,4}-[A-Z]{3,6}\d+).*?([A-Z]{3,4}-[A-Z]{3,6}\d+)/;
        const m = texto.match(re);
        if (!m) return null;
        return [m[1], m[2]];
    };

    const parBateComAlta = (p1, p2) => {
        const tx = `${p1} ${p2}`.toUpperCase();
        for (const rotaNome in rotasAlta) {
            for (const lnk of rotasAlta[rotaNome].enlaces) {
                if (matchPopAlta(rotaNome, tx, lnk.a) || matchPopAlta(rotaNome, tx, lnk.b)) {
                    return true;
                }
            }
        }
        return false;
    };

    const safe = (v) => (v && String(v).trim() ? String(v).trim() : "N/A");

    const formatarDataHora = (raw) => {
        const s = (raw || "").trim();
        if (!s) return "N/A";
        if (/\d{1,2}\/[a-z]{3}\/\d{2}/i.test(s)) return s;
        const d = new Date(s);
        if (isNaN(d.getTime())) return s;
        const meses = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
        const dd = String(d.getDate()).padStart(2, "0");
        const mm = meses[d.getMonth()] ?? "???";
        const yy = String(d.getFullYear()).slice(-2);
        const hh = String(d.getHours()).padStart(2, "0");
        const mi = String(d.getMinutes()).padStart(2, "0");
        return `${dd}/${mm}/${yy} ${hh}:${mi}`;
    };

    // Classificação dos tickets
    const estadoAlta = {};
    for (const nome in rotasAlta) {
        estadoAlta[nome] = { status: "✅", tickets: [] };
    }

    tickets.forEach((t) => {
        const texto = (t.resumo || "").toUpperCase();
        let entrouAlta = false;

        for (const rotaNome in rotasAlta) {
            for (const lnk of rotasAlta[rotaNome].enlaces) {
                if (matchPopAlta(rotaNome, texto, lnk.a) || matchPopAlta(rotaNome, texto, lnk.b)) {
                    entrouAlta = true;
                    estadoAlta[rotaNome].status = "⚠️";
                    estadoAlta[rotaNome].tickets.push({
                        resumo: t.resumo,
                        criador: safe(t.criador),
                        status: safe(t.status),
                        criadoEm: t.criadoEm,
                        url: t.url,
                        chave: t.chave
                    });
                    break;
                }
            }
            if (entrouAlta) break;
        }

        if (entrouAlta) return;

        const par = extrairParPopMenor(texto);
        if (!par) return;
        const [p1, p2] = par;
        if (parBateComAlta(p1, p2)) return;

        menor.status = "⚠️";
        menor.tickets.push({
            resumo: `${p1} <> ${p2}`,
            criador: safe(t.criador),
            status: safe(t.status),
            criadoEm: t.criadoEm,
            url: t.url,
            chave: t.chave
        });
    });

    const dedupeFalhas = (lista) => {
        const uniq = [];
        const seen = new Set();
        (lista || []).forEach((x) => {
            const k = `${x.chave}${x.resumo}${x.status}${x.criadoEm}${x.criador}`;
            if (!seen.has(k)) {
                seen.add(k);
                uniq.push(x);
            }
        });
        return uniq;
    };

    const ordemAltaBase = ["381", "MG10", "BHE X BRE (SP4)", "ROTA CUV <> PTU", "040", "ROTA CUV <> CLH", "RJO"];

    const nomeRotaAltaDisplay = (rotaNome) => {
        if (rotaNome === "381") return "ROTA 381";
        if (rotaNome === "MG10") return "ROTA MG10";
        if (rotaNome === "040") return "ROTA 040";
        if (rotaNome === "RJO") return "ROTA RJO";
        if (rotaNome.includes("SP4")) return "ROTA (SP4)";
        if (rotaNome.includes("CUV <> PTU")) return "ROTA CUV <> PTU";
        if (rotaNome.includes("CUV <> CLH")) return "ROTA CUV <> CLH";
        return rotaNome.replace(/ROTA/i, "");
    };

    // GERAÇÃO DO RELATÓRIO NO NOVO FORMATO
    let out = [];

    out.push("📊 RELATÓRIO DE FALHAS");
    out.push(linha);
    out.push(`👤 Gerado por: ${safe(usuarioAtivo)}`);
    out.push(`🕒 Data/Hora: ${dataHora}`);
    out.push(linha);
    out.push("");
    out.push("✅ STATUS GERAL DAS ROTAS");
    out.push("");
    out.push("🛰️ Alta Capacidade");

    // Lista todas as rotas com ícone
    ordemAltaBase.forEach((rotaNome) => {
        const st = estadoAlta[rotaNome]?.status || "✅";
        const displayNome = nomeRotaAltaDisplay(rotaNome);
        out.push(`  ${st} ${displayNome}`);
    });

    // Contagem de falhas
    const totalFalhasAlta = ordemAltaBase.filter(n => estadoAlta[n]?.status === "⚠️").length;
    const totalFalhasMenor = menor.status === "⚠️" ? dedupeFalhas(menor.tickets).length : 0;
    const totalFalhasABR = [...ticketsABR, ...ticketsBA, ...ticketsSEQBA].length;
    const totalFalhas = totalFalhasAlta + totalFalhasMenor + totalFalhasABR;

    // Seção de falhas ativas
    if (totalFalhas > 0) {
        out.push("");
        out.push(`🔴 FALHAS ATIVAS: ${totalFalhas}`);
        out.push("");

        // Detalhes das falhas de alta capacidade
        ordemAltaBase.forEach((rotaNome) => {
            const ticketsRota = dedupeFalhas(estadoAlta[rotaNome]?.tickets || []);
            if (estadoAlta[rotaNome]?.status === "⚠️" && ticketsRota.length > 0) {
                const displayNome = nomeRotaAltaDisplay(rotaNome);
                out.push(displayNome);

                ticketsRota.forEach((x) => {
                    const resumoCurto = String(x.resumo).replace(/.*?-.*?-/, "").trim().slice(0, 80);
                    const criadorFormatado = safe(x.criador).split(" ").slice(0, 2).join(" ");
                    const dataFormatada = safe(formatarDataHora(x.criadoEm)).replace(/(\d{1,2}\/[a-z]{3}\/\d{2})/i, "$1");

                    out.push(`├─ ${resumoCurto}`);
                    out.push(`└─ ${safe(x.chave)} | ${criadorFormatado} | ${dataFormatada}`);
                });
                out.push("");
            }
        });
    }

    // Menor capacidade
    const uniqMenor = dedupeFalhas(menor.tickets);
    if (menor.status === "⚠️" && uniqMenor.length > 0) {
        uniqMenor.forEach((x, idx) => {
            if (idx === 0) out.push("🟡 Menor Capacidade:");
            out.push(`  • ${x.resumo}`);
            out.push(`    ${safe(x.chave)} | ${safe(x.criador)} | ${safe(formatarDataHora(x.criadoEm))}`);
        });
    } else {
        out.push("🟢 Menor Capacidade: Todas operacionais");
    }

    // ABR
    const allABR = [...ticketsABR, ...ticketsBA, ...ticketsSEQBA];
    const uniqABR = [];
    const seenABR = new Set();
    allABR.forEach((t) => {
        const k = `${t?.chave}${t?.marcador}`;
        if (!seenABR.has(k)) {
            seenABR.add(k);
            uniqABR.push(t);
        }
    });

    if (uniqABR.length > 0) {
        uniqABR.forEach((t, idx) => {
            if (idx === 0) out.push("🟡 ABR Registrada:");
            const cliente = t?.cliente || extrairClienteDoResumo(t?.resumo);
            const marcador = normalizarMarcador(t?.marcador || "N/A");
            out.push(`  • ${cliente} - ${marcador}`);
            out.push(`    ${safe(t?.chave)} | ${safe(t?.criador)} | ${safe(formatarDataHora(t?.criadoEm))}`);
        });
    } else {
        out.push("🟢 ABR Registrada: Sem ocorrências");
    }

    return out.join("\n").trim();
}

// Funções auxiliares necessárias
function normalizarMarcador(m) {
    return String(m || "")
        .replace(/\s/g, "")
        .replace(/-/g, "-")
        .replace(/\//g, "")
        .replace(/\\/g, "")
        .trim();
}

function extrairClienteDoResumo(resumo) {
    const s = String(resumo || "").toUpperCase();
    let m = s.match(/INDISPONIBILIDADE\s*-\s*([^-]+?)\s*-/i);
    if (m?.[1]) return m[1].trim();
    m = s.match(/QUALIDADE\s*-\s*([^-]+?)\s*-/i);
    if (m?.[1]) return m[1].trim();
    const clean = s.replace(/\s+/g, " ").trim();
    return clean ? clean.slice(0, 40).trim() : "CLIENTE NÃO IDENTIFICADO";
}
