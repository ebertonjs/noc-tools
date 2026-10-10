// =============================================================================
// POPUP - Alertas Externos
// =============================================================================

document.addEventListener("DOMContentLoaded", () => {

  const els = {
    apiKey: document.getElementById("extAlertsApiKey"),
    interval: document.getElementById("extAlertsInterval"),
    enabled: document.getElementById("extAlertsEnabled"),
    saveBtn: document.getElementById("extAlertsSaveButton"),
    checkNowBtn: document.getElementById("extAlertsCheckNowButton"),
    markAllReadBtn: document.getElementById("extAlertsMarkAllReadButton"),
    status: document.getElementById("extAlertsStatus"),
    checkStatus: document.getElementById("extAlertsCheckStatus"),
    list: document.getElementById("extAlertsList"),
    badge: document.getElementById("externalAlertsBadge"),
  };

  if (!els.apiKey) return;

  function timeAgo(ts) {
    if (!ts) return "";
    const diffMs = Date.now() - ts * 1000;
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return "agora mesmo";
    if (mins < 60) return `há ${mins} min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `há ${hours}h`;
    const days = Math.floor(hours / 24);
    return `há ${days}d`;
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str || "";
    return div.innerHTML;
  }

  // Monta uma linha de resumo (subtítulo) por baixo do título, com os dados reais do alerta
  function summarizeAlert(a) {
    // Formato novo: usa os campos prontos de data.items; sem eles, cai no método antigo abaixo.
    const novos = a && a.data && Array.isArray(a.data.items) ? a.data.items : null;
    if (novos && novos.length) {
      const total = Number(a.data.total) || novos.length;
      const extra = total > 1 ? ` (+${total - 1})` : "";
      const it = novos[0];
      const origem = (a.source || "").toLowerCase();
      if (origem.includes("abr")) {
        const partes = [it.cessionaria, it.seq_ba ? `Seq BA ${it.seq_ba}` : null, it.status]
          .filter(Boolean)
          .join(" · ");
        return partes + extra;
      }
      if (origem.includes("mail") && it.from && it.subject) return `${it.from} · ${it.subject}${extra}`;
      if (origem.includes("grafana") && it.name) return `${it.name}${extra}`;
    }

    const src = (a.source || "").toLowerCase();
    const text = `${a.title || ""}\n${a.body || ""}`;
    const clean = (v) => (v || "").trim().replace(/^[^\p{L}\p{N}(]+/u, "").trim().replace(/[,;]+$/, "");
    const find = (patterns) => {
      for (const p of patterns) {
        const m = text.match(p);
        if (m && m[1]) return clean(m[1]);
      }
      return null;
    };

    if (src.includes("abr")) {
      const cessionaria = find([/cession[aá]ria[:\s-]+(.+)/i]);
      const seq = find([/seq\s*ba[:\s-]+(\S+)/i, /sequ[eê]ncia[:\s-]+(\S+)/i]);
      const status = find([/status[:\s-]+(.+)/i]);
      return [cessionaria, seq ? `Seq BA ${seq}` : null, status].filter(Boolean).join(" · ");
    }
    if (src.includes("email") || src.includes("mail")) {
      const pipe = text.match(/de:\s*([^|]+?)\s*\|\s*assunto:\s*([^|]+?)(?:\s*\|.+)?\s*$/im);
      if (pipe) return `${pipe[1].trim()} · ${pipe[2].trim()}`;
      const remetente = find([/remetente[:\s-]+(.+)/i, /from[:\s-]+(.+)/i]);
      return remetente || "";
    }
    if (src.includes("manual")) {
      return (a.body || "").trim();
    }
    return "";
  }

  function renderAlerts(alerts) {
    if (!alerts || alerts.length === 0) {
      els.list.innerHTML = `
        <div class="ext-empty" role="note">
          <svg viewBox="0 0 120 120" aria-hidden="true">
            <circle cx="60" cy="60" r="54" fill="var(--cor-primaria-clara, #e8f5e9)"/>
            <path d="M60 88c-14 0-24-10-24-24 0-18 14-30 38-32 2 22-2 56-14 56z" fill="var(--cor-primaria, #2e7d32)" opacity="0.9"/>
            <path d="M44 84c6-14 14-24 26-32" stroke="#fff" stroke-width="3.5" fill="none" stroke-linecap="round"/>
            <circle cx="86" cy="80" r="13" fill="#fff" stroke="var(--cor-primaria, #2e7d32)" stroke-width="3"/>
            <path d="M80 80l4.5 4.5L92 76.5" stroke="var(--cor-primaria, #2e7d32)" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <strong>Tudo tranquilo por aqui</strong>
          <span>Nenhum alerta recebido. Novos alertas aparecem aqui automaticamente.</span>
        </div>`;
      updateBadge(0);
      return;
    }

    const unreadCount = alerts.filter((a) => !a.read).length;
    updateBadge(unreadCount);

    els.list.innerHTML = alerts
      .map((a) => {
        const severityClass = ["critical", "warning", "info"].includes(a.severity)
          ? a.severity
          : "info";
        const subtitle = summarizeAlert(a);
        return `
          <div class="ext-alert-item severity-${severityClass} ${a.read ? "" : "unread"}" data-id="${escapeHtml(String(a.id))}" data-ack-id="${escapeHtml(String(a.id))}" title="${escapeHtml(a.body)}">
            <div class="ext-alert-row">
              <span class="ext-alert-title">${escapeHtml(a.title)}</span>
              <span class="ext-alert-source">${escapeHtml(a.source)}</span>
              <span class="ext-alert-time">${timeAgo(a.created_at)}</span>
            </div>
            ${subtitle ? `<div class="ext-alert-subtitle">${escapeHtml(subtitle)}</div>` : ""}
          </div>
        `;
      })
      .join("");

    els.list.querySelectorAll("[data-ack-id]").forEach((item) => {
      item.addEventListener("click", async () => {
        if (item.classList.contains("unread")) {
          const id = item.getAttribute("data-ack-id");
          await chrome.runtime.sendMessage({ type: "EXTALERTS_ACK", alertId: id });
          await refreshList();
        }
      });
    });
  }

  function updateBadge(count) {
    if (!els.badge) return;
    if (count > 0) {
      els.badge.style.display = "inline-block";
      els.badge.textContent = count > 99 ? "99+" : String(count);
    } else {
      els.badge.style.display = "none";
    }
  }

  async function refreshList() {
    const state = await chrome.runtime.sendMessage({ type: "EXTALERTS_GET_STATE" });
    renderAlerts(state.extAlerts);
  }

  async function loadConfig() {
    const cfg = await chrome.runtime.sendMessage({ type: "EXTALERTS_GET_CONFIG" });
    els.apiKey.value = cfg.extAlertsApiKey || "";
    els.interval.value = cfg.extAlertsIntervalMinutes || 1;
    els.enabled.checked = !!cfg.extAlertsEnabled;
  }

  els.saveBtn.addEventListener("click", async () => {
    const config = {
      extAlertsApiKey: els.apiKey.value.trim(),
      extAlertsIntervalMinutes: Math.max(1, Number(els.interval.value) || 1),
      extAlertsEnabled: els.enabled.checked,
    };
    await chrome.runtime.sendMessage({ type: "EXTALERTS_SAVE_CONFIG", config });
    els.status.textContent = "Configuração salva!";
    els.status.style.color = "";
    setTimeout(() => (els.status.textContent = ""), 2000);
  });

  els.checkNowBtn.addEventListener("click", async () => {
    els.checkStatus.textContent = "Verificando...";
    els.checkStatus.style.color = "";
    const res = await chrome.runtime.sendMessage({ type: "EXTALERTS_CHECK_NOW" });
    if (res?.error) {
      els.checkStatus.style.color = "#dc2626";
      els.checkStatus.textContent = `Erro: ${res.error}`;
    } else {
      els.checkStatus.style.color = "#16a34a";
      els.checkStatus.textContent = `OK. ${res.total} alerta(s) no total, ${res.newCount} novo(s).`;
    }
    await refreshList();
  });

  els.markAllReadBtn.addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ type: "EXTALERTS_ACK_ALL" });
    await refreshList();
  });

  // Inicialização
  loadConfig();
  refreshList();
});
