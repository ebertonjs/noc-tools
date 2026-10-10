// =============================================================================
// BACKGROUND - Alert Server (recebe alertas da extensão ABR Monitor)
// =============================================================================

const EXT_ALERTS_ALARM_NAME = "external-alerts-check";
const EXT_ALERTS_DEFAULT_INTERVAL_MIN = 1;
const EXT_ALERTS_MAX_STORED = 20;

// URL fixa: fica só aqui no código, não aparece nem é editável no popup/HTML.
const EXT_ALERTS_DEFAULT_SERVER_URL = "http://noctoolsalerta.duckdns.org:8788";

async function getExtAlertsConfig() {
  const defaults = {
    extAlertsServerUrl: EXT_ALERTS_DEFAULT_SERVER_URL,
    extAlertsApiKey: "",
    extAlertsIntervalMinutes: EXT_ALERTS_DEFAULT_INTERVAL_MIN,
    extAlertsEnabled: true,
  };
  // Movido de storage.sync para storage.local: a chave de API não deve
  // sincronizar entre dispositivos via conta Google (reduz exposição).
  const cfg = await chrome.storage.local.get(defaults);
  cfg.extAlertsServerUrl = EXT_ALERTS_DEFAULT_SERVER_URL; // sempre a fixa, ignora qualquer valor antigo salvo
  return cfg;
}

async function getExtAlertsState() {
  const defaults = {
    extAlerts: [], // lista local, mais recentes primeiro
    extAlertsLastCheck: null,
    extAlertsLastError: null,
    extAlertsLastSeen: null, // created_at do alerta mais recente já visto
  };
  return await chrome.storage.local.get(defaults);
}

async function setExtAlertsState(patch) {
  await chrome.storage.local.set(patch);
}

// Horário da última checagem fica no storage de sessão (memória), não no local:
// gravar no local a cada minuto disparava storage.onChanged à toa o dia todo.
function registrarUltimaChecagem() {
  try {
    chrome.storage.session?.set({ extAlertsLastCheck: Date.now() });
  } catch (_) { }
}

// ---------- Formato novo: monta o aviso a partir de data.items (campos prontos) ----------
// Devolve null quando o alerta não tem data (alertas antigos) ou quando faltam campos;
// nesses casos o buildAlertDisplay segue com o método antigo (regex no texto).
function buildStructuredDisplay(alert, hora) {
  const items = alert?.data?.items;
  if (!Array.isArray(items) || items.length === 0) return null;

  const src = (alert.source || "").toLowerCase();
  const total = Number(alert.data.total) || items.length;
  const MAX_LINHAS = 3;
  const txt = (v) => String(v ?? "").trim();
  const corta = (s, n) => (s.length > n ? s.slice(0, n).trim() + "..." : s);
  const resto = total > MAX_LINHAS ? total - MAX_LINHAS : 0;

  // ---------- ABR ----------
  if (src.includes("abr")) {
    const titulos = {
      new: ["Nova BA", "novas BAs"],
      status_changed: ["BA mudou de status", "BAs mudaram de status"],
      vanished: ["BA saiu da lista", "BAs saíram da lista"],
    };
    const [um, varios] = titulos[alert.event] || titulos.new;
    const icon = alert.event === "vanished" ? "⚠️" : alert.event === "status_changed" ? "🔄" : "🟡";
    const title = total === 1 ? um : `${total} ${varios}`;

    const statusDe = (it) =>
      alert.event === "status_changed" && txt(it.status_anterior)
        ? `${txt(it.status_anterior)} → ${txt(it.status)}`
        : txt(it.status);

    if (items.length === 1) {
      const it = items[0];
      const status = statusDe(it);
      return {
        icon,
        title,
        lines: [
          `Seq BA ${txt(it.seq_ba) || "--"}`,
          `Cessionária  ${txt(it.cessionaria) || "não identificada"}`,
          ...(txt(it.cedente) ? [`Cedente  ${txt(it.cedente)}`] : []),
          ...(status ? [status] : []),
          `📅 ${txt(it.abertura) || hora}`,
        ],
      };
    }

    const linhas = items.slice(0, MAX_LINHAS).map((it) =>
      [`Seq BA ${txt(it.seq_ba) || "--"}`, txt(it.cessionaria), statusDe(it)].filter(Boolean).join(" · ")
    );
    return {
      icon,
      title,
      lines: [...linhas, ...(resto ? [`+${resto} outra(s) BA(s)`] : []), `📅 ${hora}`],
    };
  }

  // ---------- E-mail ----------
  if (src.includes("mail")) {
    // Sem remetente/assunto separados, o texto original é mais fiel: usa o método antigo.
    if (!items.every((it) => txt(it.from) && txt(it.subject))) return null;

    if (items.length === 1) {
      const it = items[0];
      return {
        icon: "📧",
        title: "Novo e-mail",
        lines: [txt(it.from), corta(txt(it.subject), 70), txt(it.received) || hora],
      };
    }
    const linhas = items
      .slice(0, MAX_LINHAS)
      .map((it) => `${corta(txt(it.from), 30)} — ${corta(txt(it.subject), 40)}`);
    return {
      icon: "📧",
      title: `${total} novos e-mails`,
      lines: [...linhas, ...(resto ? [`+${resto} outro(s) e-mail(s)`] : []), `📅 ${hora}`],
    };
  }

  // ---------- Grafana ----------
  if (src.includes("grafana")) {
    const limpa = (nome) => {
      let l = txt(nome);
      const i = l.indexOf(":");
      if (i >= 0) l = l.slice(i + 1); // tira o prefixo "POP:" como antes
      return l
        .replace(/\s*-\s*ROTA DE (PROTE[ÇC][AÃ]O|TRABALHO)\s*$/i, "")
        .replace(/\s*-\s*OPS-[AB]\s*$/i, "")
        .trim();
    };
    const dbm = (v) => (/[a-z]/i.test(txt(v)) ? txt(v) : `${txt(v)} dBm`);

    const linhas = items.slice(0, MAX_LINHAS).flatMap((it) => [
      limpa(it.name),
      `Anterior ${txt(it.max)} → Atual ${dbm(it.last)} → verificar`,
    ]);
    return {
      icon: "🔔",
      title: `${total} ${total === 1 ? "item fora do padrão" : "itens fora do padrão"}`,
      lines: [...linhas, ...(resto ? [`+${resto} outro(s) item(ns)`] : []), `📅 ${hora}`],
    };
  }

  return null; // manual e demais origens seguem o caminho antigo
}

// ---------- Monta o conteúdo do aviso (ícone, título e linhas) por tipo de alerta ----------
function buildAlertDisplay(newest) {
  const src = (newest?.source || "").toLowerCase();
  const text = `${newest?.title || ""}\n${newest?.body || ""}`;

  // Remove emojis/símbolos no início de um valor capturado (ex: "🟡 Em Tratativa" -> "Em Tratativa")
  const clean = (v) => (v || "").trim().replace(/^[^\p{L}\p{N}(]+/u, "").trim().replace(/[,;]+$/, "");

  const find = (patterns) => {
    for (const p of patterns) {
      const m = text.match(p);
      if (m && m[1]) return clean(m[1]);
    }
    return null;
  };

  const ts = newest?.created_at ? newest.created_at * 1000 : Date.now();
  const hora = new Date(ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  // Formato novo: o ABR Monitor manda os campos prontos em data.items.
  const structured = buildStructuredDisplay(newest, hora);
  if (structured) return structured;

  // ---------- E-mail ----------
  if (src.includes("email") || src.includes("e-mail") || src.includes("mail")) {
    // Formato real: "De: Fulano | Assunto: Algo | 19/07/26 12:00" (tudo numa linha)
    const pipe = text.match(/de:\s*([^|]+?)\s*\|\s*assunto:\s*([^|]+?)(?:\s*\|\s*(.+))?\s*$/im);

    let remetente, assunto, dataEnvio;
    if (pipe) {
      remetente = pipe[1].trim();
      assunto = pipe[2].trim();
      dataEnvio = pipe[3] ? pipe[3].trim() : null;
    } else {
      remetente = find([
        /remetente[:\s-]+(.+)/i,
        /de[:\s-]+([\w.\-]+@[\w.\-]+)/i,
        /from[:\s-]+(.+)/i,
      ]) || "Remetente desconhecido";
      assunto = find([/assunto[:\s-]+(.+)/i, /subject[:\s-]+(.+)/i]) ||
        (newest?.body || newest?.title || "").split("\n").map((l) => l.trim())
          .find((l) => l && !/^(remetente|de|from|assunto)[:\s-]/i.test(l)) ||
        "Novo e-mail recebido.";
    }
    if (assunto.length > 70) assunto = assunto.slice(0, 70).trim() + "...";

    return {
      icon: "📧",
      title: "Novo e-mail",
      lines: [remetente, assunto, dataEnvio || hora],
    };
  }

  // ---------- ABR ----------
  if (src.includes("abr")) {
    const sequencia = find([
      /seq\s*ba[:\s-]+(\S+)/i,
      /sequ[eê]ncia[:\s-]+(\S+)/i,
      /n[ºo°]\s*abr[:\s-]*(\S+)/i,
      /abr\s*n?[ºo°]?[:\s-]+(\S+)/i,
    ]) || "--";

    const cessionaria = find([
      /cession[aá]ria[:\s-]+(.+)/i,
      /cession[aá]rio[:\s-]+(.+)/i,
      /empresa[:\s-]+(.+)/i,
      /cliente[:\s-]+(.+)/i,
    ]) || "não identificada";

    const cedente = find([/cedente[:\s-]+(.+)/i]);
    const abertura = find([/abertura[:\s-]+(.+)/i]);

    let status = find([/status[:\s-]+(.+)/i, /situa[çc][ãa]o[:\s-]+(.+)/i]);
    if (!status) {
      const conhecidos = ["Em Tratativa", "Pendente", "Concluída", "Concluida", "Cancelada", "Aberta", "Resolvida", "Fechada"];
      status = conhecidos.find((k) => text.toLowerCase().includes(k.toLowerCase()));
    }

    return {
      icon: "🟡",
      title: "Nova BA",
      lines: [
        `Seq BA ${sequencia}`,
        `Cessionária  ${cessionaria}`,
        ...(cedente ? [`Cedente  ${cedente}`] : []),
        ...(status ? [status] : []),
        `📅 ${abertura || hora}`,
      ],
    };
  }

  // ---------- Grafana ----------
  if (src.includes("grafana")) {
    const itemRe = /[🔴🟡🟢]\s*([^\n:]+):\s*([^\n]+)\n\s*Last:\s*([-\d.]+)\s*Max:\s*([-\d.]+)\s*DIF:\s*([-\d.]+)/g;
    const items = [];
    let m;
    while ((m = itemRe.exec(newest?.body || "")) !== null) {
      let label = m[2].trim();
      label = label.replace(/\s*-\s*ROTA DE (PROTE[ÇC][AÃ]O|TRABALHO)\s*$/i, "");
      label = label.replace(/\s*-\s*OPS-[AB]\s*$/i, "");
      items.push({ label: label.trim(), max: m[4].trim(), last: m[3].trim() });
    }

    const totalTitulo = find([/(\d+)\s*itens?/i]);
    const total = items.length || (totalTitulo ? Number(totalTitulo) : 1);

    const MAX_ITENS_EXIBIDOS = 3;
    const linhasItens = items.slice(0, MAX_ITENS_EXIBIDOS).flatMap((it) => [
      it.label,
      `Anterior ${it.max} → Atual ${it.last} dBm → verificar`,
    ]);
    const resto = items.length > MAX_ITENS_EXIBIDOS
      ? [`+${items.length - MAX_ITENS_EXIBIDOS} outro(s) item(ns)`]
      : [];

    return {
      icon: "🔔",
      title: `${total} ${total === 1 ? "item fora do padrão" : "itens fora do padrão"}`,
      lines: [...linhasItens, ...resto, `📅 ${hora}`],
    };
  }

  // ---------- Mensagem manual (enviada pelo popup do ABR Monitor) ----------
  if (src.includes("manual")) {
    let mensagem = (newest?.body || newest?.title || "").trim() || "Mensagem recebida.";
    if (mensagem.length > 200) mensagem = mensagem.slice(0, 200).trim() + "...";

    return {
      icon: "💬",
      title: "Mensagem do ABR Monitor",
      lines: [mensagem, hora],
    };
  }

  // ---------- Genérico (qualquer outra origem) ----------
  return {
    icon: "🔔",
    title: "Novo alerta",
    lines: [newest?.title || "Alerta recebido", hora],
  };
}

// ---------- Notificação nativa (popup do Windows) ----------
const EXT_ALERTS_MAX_NATIVE_NOTIFS = 2; // mantém só as N mais recentes visíveis

// Registra o id criado e fecha as notificações mais antigas além do limite
async function trackNativeNotification(id) {
  const { extAlertsNotifIds = [] } = await chrome.storage.local.get({ extAlertsNotifIds: [] });
  const updated = [...extAlertsNotifIds, id];
  while (updated.length > EXT_ALERTS_MAX_NATIVE_NOTIFS) {
    const oldId = updated.shift();
    chrome.notifications.clear(oldId);
  }
  await chrome.storage.local.set({ extAlertsNotifIds: updated });
}

chrome.notifications.onClosed.addListener(async (id) => {
  const { extAlertsNotifIds = [] } = await chrome.storage.local.get({ extAlertsNotifIds: [] });
  await chrome.storage.local.set({ extAlertsNotifIds: extAlertsNotifIds.filter((x) => x !== id) });
});

function notifyNewExternalAlerts(newAlerts) {
  // Mostra cada alerta individualmente (não agrupa em "Vários alertas novos").
  // Se vierem muitos de uma vez, só dispara os N mais recentes de fato — os demais
  // ficam salvos na lista do popup, mas não empilham notificação/toast sem necessidade.
  const toShow = [...newAlerts].reverse().slice(-EXT_ALERTS_MAX_NATIVE_NOTIFS); // ordem cronológica, mais antigo primeiro

  for (const alert of toShow) {
    const display = buildAlertDisplay(alert);
    const id = `ext-alert-${alert.id}`;
    chrome.notifications.create(id, {
      type: "basic",
      iconUrl: "icons/128x128.png",
      title: `${display.icon} ${display.title}`,
      message: display.lines.join("\n"),
      priority: 2,
      requireInteraction: true, // fica na tela até você clicar/fechar (troque para false para sumir sozinha)
    });
    trackNativeNotification(id);
  }

  injectInPageToast(toShow);
}

// Páginas onde o Chrome nunca deixa injetar script (chrome://, Web Store, PDF viewer nativo, etc.)
function isPaginaInjetavel(url) {
  if (!url) return false;
  return /^https?:\/\//i.test(url) && !url.startsWith("https://chrome.google.com/webstore");
}

// ---------- Aviso injetado dentro da página das abas abertas ----------
async function injectInPageToast(alerts) {
  if (!alerts || !alerts.length) return;

  const items = alerts.map((a) => {
    const display = buildAlertDisplay(a);
    return {
      title: `${display.icon} ${display.title}`,
      detailLines: display.lines,
      severity: a?.severity || "info",
    };
  });

  try {
    // Tenta a aba ativa primeiro; se ela não aceitar (chrome://, Web Store, PDF, etc.),
    // cai para a próxima aba http(s) disponível — sem voltar a injetar em todas.
    const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });

    let targetTabId = null;
    if (activeTab?.id && isPaginaInjetavel(activeTab.url)) {
      targetTabId = activeTab.id;
    } else {
      const todasAbas = await chrome.tabs.query({});
      const fallback = todasAbas.find((t) => t.id && isPaginaInjetavel(t.url));
      targetTabId = fallback?.id || null;
    }

    if (!targetTabId) throw new Error("Nenhuma aba compatível para exibir o aviso.");

    await executarComTema({
        target: { tabId: targetTabId },
        func: renderInPageAlertToastBatch,
        args: [{ items }],
      })
      .catch(() => { }); // falhou mesmo assim (ex: permissão ainda não concedida) - ignora
  } catch (e) {
    // Nenhuma aba compatível disponível:
    // não abre janela/aba nova, fica só a notificação nativa do Windows.
    console.warn("[Alert Server] Não foi possível exibir o aviso dentro da página:", e);
  }
}

// Executada DENTRO da página (não tem acesso ao escopo do background)
// Recebe uma lista de alertas (mais antigo primeiro) e empilha um toast por alerta,
// respeitando o limite MAX_TOASTS (o mais antigo vai saindo conforme chegam novos).
function renderInPageAlertToastBatch({ items }) {
  const MAX_TOASTS = 5; // com o aviso fixo, sobe o limite para não descartar alertas ainda não vistos
  // O aviso fica parado até o mouse passar em cima; aí começa a contagem e ele some depois de AUTO_CLOSE_MS.
  // (0 = nunca some sozinho, só no ✕)
  const AUTO_CLOSE_MS = 8000;
  const stackId = "__noctools_ext_alert_stack__";

  let stack = document.getElementById(stackId);
  if (!stack) {
    stack = document.createElement("div");
    stack.id = stackId;
    stack.style.cssText =
      "position:fixed; bottom:20px; right:20px; z-index:2147483647; display:flex; flex-direction:column; gap:10px; align-items:flex-end;";
    document.documentElement.appendChild(stack);
  }

  // Mesmo padrão de cor usado no resto da extensão (toast--error/warning e --cor-primaria)
  const colors = { critical: "#E53935", warning: "#F59E0B", info: "var(--noc-pri, #2E7D32)" };
  const tints = { critical: "#FDECEC", warning: "#FEF3E2", info: "var(--noc-tint, #E8F5E9)" };
  const esc = (s) => {
    const div = document.createElement("div");
    div.textContent = s || "";
    return div.innerHTML;
  };

  for (const { title, detailLines, severity } of items) {
    // Separa o emoji inicial do título para exibir no ícone à esquerda
    const m = /^(\S+)\s+(.*)$/u.exec(title || "");
    const temIcone = m && !/[\p{L}\p{N}]/u.test(m[1]);
    const icon = temIcone ? m[1] : "🔔";
    const titleText = temIcone ? m[2] : title;
    while (stack.children.length >= MAX_TOASTS) {
      stack.firstElementChild?.remove();
    }

    const borderColor = colors[severity] || colors.info;
    const tint = tints[severity] || tints.info;
    const host = document.createElement("div");
    host.style.cssText = "position:relative;";
    const shadow = host.attachShadow({ mode: "open" });

    shadow.innerHTML = `
      <style>
        .toast {
          width: 330px;
          box-sizing: border-box;
          padding: 14px 16px 16px 64px;
          background: var(--noc-surface, #ffffff);
          border: 1px solid var(--noc-border, #E3EBE4);
          border-radius: 16px;
          color: var(--noc-text, #17231A);
          box-shadow: 0 12px 32px rgba(20, 45, 25, 0.16);
          font-family: "Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, Arial, sans-serif;
          position: relative;
          overflow: hidden;
          animation: noctools-slide-in 0.25s ease-out;
        }
        .toast-icon {
          position: absolute; left: 14px; top: 14px;
          width: 38px; height: 38px; border-radius: 12px;
          background: ${tint}; color: ${borderColor};
          display: grid; place-items: center; font-size: 18px;
        }
        @keyframes noctools-slide-in {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .toast-close {
          position: absolute; top: 6px; right: 8px; cursor: pointer;
          color: var(--noc-text2, #9AAD9D); font-size: 14px; line-height: 1;
        }
        .toast-close:hover { color: var(--noc-text, #17231A); }
        .toast-title { font-weight: 700; font-size: 13.5px; margin: 2px 20px 6px 0; color: var(--noc-text, #17231A); }
        .toast-line { font-size: 12px; color: var(--noc-text2, #5F6F62); line-height: 1.6; }
        .toast-progress {
          position: absolute; left: 0; bottom: 0; height: 3px; width: 100%;
          background: ${borderColor}; opacity: 0.7;
          ${AUTO_CLOSE_MS > 0 ? `animation: noctools-countdown ${AUTO_CLOSE_MS}ms linear forwards paused;` : ""}
        }
        .toast.counting .toast-progress { animation-play-state: running; }
        .toast:hover .toast-progress { animation-play-state: paused; }
        @keyframes noctools-countdown {
          from { width: 100%; }
          to { width: 0%; }
        }
      </style>
      <div class="toast">
        <span class="toast-close" title="Fechar">✕</span>
        <div class="toast-icon">${esc(icon)}</div>
        <div class="toast-title">${esc(titleText)}</div>
        ${(detailLines || []).map((l) => `<div class="toast-line">${esc(l)}</div>`).join("")}
        ${AUTO_CLOSE_MS > 0 ? '<div class="toast-progress"></div>' : ""}
      </div>
    `;

    shadow.querySelector(".toast-close").addEventListener("click", () => host.remove());
    stack.appendChild(host);

    // Se AUTO_CLOSE_MS > 0: espera o mouse passar em cima e só então começa a contar; se 0, só fecha no ✕
    let autoCloseTimer = null;
    const toastEl = shadow.querySelector(".toast");
    const scheduleClose = () => {
      autoCloseTimer = setTimeout(() => host.remove(), AUTO_CLOSE_MS);
    };
    if (AUTO_CLOSE_MS > 0) {
      // Só começa a contar na primeira vez que o mouse passa por cima; depois segue sozinho
      toastEl.addEventListener(
        "mouseenter",
        () => {
          toastEl.classList.add("counting");
          scheduleClose();
        },
        { once: true }
      );
    }
  }
}

// ---------- Busca no servidor ----------
async function fetchExternalAlertsFromServer() {
  const cfg = await getExtAlertsConfig();
  if (!cfg.extAlertsServerUrl) {
    throw new Error("URL do servidor não configurada.");
  }

  if (!cfg.extAlertsApiKey) {
    throw new Error("Chave de API não configurada. Sem a chave o servidor não entrega alertas.");
  }

  const url = cfg.extAlertsServerUrl.replace(/\/+$/, "") + "/api/alerts";
  const res = await fetch(url, {
    method: "GET",
    headers: { "X-API-Key": cfg.extAlertsApiKey },
  });

  if (res.status === 401) {
    throw new Error("Chave de API inválida (401). Confira a chave nas configurações.");
  }
  if (res.status === 429) {
    throw new Error("Servidor bloqueou por excesso de tentativas (429). Aguarde 1 minuto.");
  }

  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${bodyText}`.trim());
  }

  return await res.json();
}

// ---------- Checagem principal ----------
async function checkExternalAlertsNow() {
  const cfg = await getExtAlertsConfig();
  if (!cfg.extAlertsServerUrl) {
    return { error: "URL do servidor não configurada." };
  }

  try {
    const serverAlerts = await fetchExternalAlertsFromServer();
    const state = await getExtAlertsState();

    // Mescla com o que já temos localmente (preserva "lido" já marcado aqui)
    const localById = new Map(state.extAlerts.map((a) => [a.id, a]));
    const merged = serverAlerts.map((a) => {
      const local = localById.get(a.id);
      return {
        id: a.id,
        source: a.source,
        title: a.title,
        body: a.body,
        severity: a.severity,
        created_at: a.created_at,
        event: a.event || null,
        data: a.data || null,
        // lido aqui OU confirmado por outro analista no servidor
        read: (local ? local.read : false) || !!a.acked,
      };
    });

    merged.sort((a, b) => b.created_at - a.created_at);
    const trimmed = merged.slice(0, EXT_ALERTS_MAX_STORED);

    // "Novo" = não lido, ainda não guardado e mais recente que o último alerta já visto.
    // Calculado sobre a lista COMPLETA do servidor (antes do corte), para um lote grande
    // não perder alertas; a marca d'água (extAlertsLastSeen) evita reavisar alertas antigos
    // que já não cabem na lista guardada localmente.
    const lastSeen = state.extAlertsLastSeen ?? null;
    let newAlerts = merged.filter(
      // ">=": alertas criados no mesmo segundo da marca d'água, mas entregues num ciclo
      // seguinte, também avisam. O !localById.has(id) evita reavisar os já guardados.
      (a) => !a.read && !localById.has(a.id) && (lastSeen === null || a.created_at >= lastSeen)
    );
    if (lastSeen === null) newAlerts = newAlerts.slice(0, EXT_ALERTS_MAX_STORED); // 1ª execução: não inunda
    const newestSeen = merged.length ? merged[0].created_at : null;
    const nextLastSeen = Math.max(lastSeen ?? 0, newestSeen ?? 0) || null;

    // Só grava quando algo mudou (lista, marca d'água ou erro anterior a limpar)
    const mudou =
      JSON.stringify(trimmed) !== JSON.stringify(state.extAlerts) ||
      nextLastSeen !== state.extAlertsLastSeen ||
      state.extAlertsLastError !== null;
    if (mudou) {
      await setExtAlertsState({
        extAlerts: trimmed,
        extAlertsLastSeen: nextLastSeen,
        extAlertsLastError: null,
      });
    }
    registrarUltimaChecagem();

    if (newAlerts.length > 0) {
      notifyNewExternalAlerts(newAlerts);
    }

    return { ok: true, total: trimmed.length, newCount: newAlerts.length };
  } catch (err) {
    console.error("[Alert Server] Erro ao buscar alertas:", err);
    const msgErro = String(err.message || err);
    const state = await getExtAlertsState();
    const patch = {};
    if (state.extAlertsLastError !== msgErro) patch.extAlertsLastError = msgErro;
    // sem chave válida, não exibe nada
    if (/\b401\b|não configurada/.test(msgErro) && state.extAlerts.length) patch.extAlerts = [];
    if (Object.keys(patch).length) await setExtAlertsState(patch);
    registrarUltimaChecagem();
    return { error: String(err.message || err) };
  }
}

// ---------- Marcar como lido (local + avisa o servidor, se possível) ----------
async function ackExternalAlert(alertId) {
  const state = await getExtAlertsState();
  const updated = state.extAlerts.map((a) => (a.id === alertId ? { ...a, read: true } : a));
  await setExtAlertsState({ extAlerts: updated });

  // Best-effort: avisa o servidor também (não bloqueia se falhar)
  const cfg = await getExtAlertsConfig();
  if (cfg.extAlertsServerUrl && cfg.extAlertsApiKey) {
    const url = cfg.extAlertsServerUrl.replace(/\/+$/, "") + `/api/alerts/${encodeURIComponent(alertId)}/ack`;
    fetch(url, {
      method: "POST",
      headers: { "X-API-Key": cfg.extAlertsApiKey },
    }).catch((e) => console.warn("[Alert Server] Não foi possível confirmar leitura no servidor:", e));
  }

  return { ok: true };
}

async function ackAllExternalAlerts() {
  const state = await getExtAlertsState();
  const pendentes = state.extAlerts.filter((a) => !a.read);
  const updated = state.extAlerts.map((a) => ({ ...a, read: true }));
  await setExtAlertsState({ extAlerts: updated });

  // Best-effort: avisa o servidor de cada alerta que estava pendente (vale para os outros analistas).
  // Em sequência, com pausa curta, para não estourar o rate limit (429) do servidor.
  const cfg = await getExtAlertsConfig();
  if (cfg.extAlertsServerUrl && cfg.extAlertsApiKey && pendentes.length) {
    const base = cfg.extAlertsServerUrl.replace(/\/+$/, "");
    (async () => {
      for (const a of pendentes) {
        try {
          const res = await fetch(`${base}/api/alerts/${encodeURIComponent(a.id)}/ack`, {
            method: "POST",
            headers: { "X-API-Key": cfg.extAlertsApiKey },
          });
          if (res.status === 429) {
            console.warn("[Alert Server] Rate limit no ack em lote; restantes ficam só locais.");
            break;
          }
        } catch (e) {
          console.warn("[Alert Server] Não foi possível confirmar leitura no servidor:", e);
        }
        await new Promise((r) => setTimeout(r, 250));
      }
    })();
  }

  return { ok: true };
}

// ---------- Agendamento ----------
async function scheduleExtAlertsAlarm() {
  const cfg = await getExtAlertsConfig();
  await chrome.alarms.clear(EXT_ALERTS_ALARM_NAME);
  if (!cfg.extAlertsEnabled) return;
  chrome.alarms.create(EXT_ALERTS_ALARM_NAME, {
    periodInMinutes: Math.max(1, Number(cfg.extAlertsIntervalMinutes) || EXT_ALERTS_DEFAULT_INTERVAL_MIN),
    delayInMinutes: 0.1,
  });
}

chrome.runtime.onInstalled.addListener(() => {
  scheduleExtAlertsAlarm();
});

chrome.runtime.onStartup.addListener(() => {
  scheduleExtAlertsAlarm();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === EXT_ALERTS_ALARM_NAME) {
    checkExternalAlertsNow();
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.extAlertsIntervalMinutes || changes.extAlertsEnabled)) {
    scheduleExtAlertsAlarm();
  }
});

// ---------- Mensagens do popup ----------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "EXTALERTS_GET_CONFIG") {
    // Não envia a URL para o popup
    getExtAlertsConfig().then(({ extAlertsServerUrl, ...cfg }) => sendResponse(cfg));
    return true;
  }
  if (msg?.type === "EXTALERTS_SAVE_CONFIG") {
    const { extAlertsServerUrl, ...cfg } = msg.config || {}; // URL nunca vem do popup
    chrome.storage.local.set(cfg)
      .then(() => chrome.storage.local.remove("extAlertsServerUrl")) // limpa URL antiga salva
      .then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg?.type === "EXTALERTS_GET_STATE") {
    getExtAlertsState().then(sendResponse);
    return true;
  }
  if (msg?.type === "EXTALERTS_CHECK_NOW") {
    checkExternalAlertsNow().then(sendResponse);
    return true;
  }
  if (msg?.type === "EXTALERTS_ACK") {
    ackExternalAlert(msg.alertId).then(sendResponse);
    return true;
  }
  if (msg?.type === "EXTALERTS_ACK_ALL") {
    ackAllExternalAlerts().then(sendResponse);
    return true;
  }
});
