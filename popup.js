// =============================================================================
// POPUP.JS - NOC EXTENSION v2.0  
// =============================================================================

document.addEventListener('DOMContentLoaded', function () {
  chrome.action.setBadgeText({ text: "" }); // as novidades já aparecem na página ao atualizar
});



class ToastManager {
  static show(message, type = "success", duration = 3000) {
    const existingToast = document.getElementById("toast-notification");
    if (existingToast) existingToast.remove();


    const toast = document.createElement("div");
    toast.id = "toast-notification";
    toast.className = `toast toast--${type}`;


    toast.innerHTML = `
      <div class="toast__content">
        <span class="toast__icon">${this.getIcon(type)}</span>
        <span class="toast__message"></span>
      </div>
    `;
    // Mensagens podem trazer texto de erro externo: sempre como texto puro
    toast.querySelector(".toast__message").textContent = message;


    document.body.appendChild(toast);


    setTimeout(() => toast.classList.add("toast--show"), 10);


    setTimeout(() => {
      toast.classList.remove("toast--show");
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }


  static getIcon(type) {
    const icons = {
      success: "✓",
      error: "✕",
      warning: "⚠",
      info: "ℹ",
    };
    return icons[type] || icons.info;
  }
}
document.addEventListener("DOMContentLoaded", () => {
  const tabButtons = document.querySelectorAll(".tab-button");
  const tabContents = document.querySelectorAll(".tab-content");
  const sidebar = document.querySelector(".sidebar");
  const toggleSidebarButton = document.getElementById("toggleSidebarButton");

  function aplicarEstadoSidebar(recolhida) {
    if (recolhida) {
      sidebar.classList.add("recolhida");
      toggleSidebarButton.title = "Expandir barra lateral";
    } else {
      sidebar.classList.remove("recolhida");
      toggleSidebarButton.title = "Recolher barra lateral";
    }
  }

  chrome.storage.sync.get("sidebarRecolhida", (data) => {
    if (sidebar && toggleSidebarButton) {
      aplicarEstadoSidebar(data.sidebarRecolhida);
    }
  });

  if (sidebar && toggleSidebarButton) {
    toggleSidebarButton.addEventListener("click", () => {
      const estaRecolhida = sidebar.classList.toggle("recolhida");
      toggleSidebarButton.title = estaRecolhida
        ? "Expandir barra lateral"
        : "Recolher barra lateral";
      chrome.storage.sync.set({ sidebarRecolhida: estaRecolhida });
    });
  }

  const themeSelector = document.getElementById("themeSelector");

  // Fontes extras só para os temas que usam (o CSS carrega apenas Inter + Poppins)
  const FONTES_POR_TEMA = {
    hacker: "Fira+Code:wght@400;700",
    blueprint: "Architects+Daughter",
    "8bit": "Press+Start+2P",
    jornal: "Merriweather:wght@400;700",
  };

  function carregarFonteDoTema(theme) {
    const familia = FONTES_POR_TEMA[theme];
    if (!familia || document.getElementById(`fonte-tema-${theme}`)) return;
    const link = document.createElement("link");
    link.id = `fonte-tema-${theme}`;
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${familia}&display=swap`;
    document.head.appendChild(link);
  }

  function applyTheme(theme) {
    document.body.className = "";
    // Eco Escuro reaproveita todas as regras do Eco e só troca as cores
    if (theme === "eco-escuro") document.body.classList.add("theme-eco");
    document.body.classList.add(`theme-${theme}`);
    carregarFonteDoTema(theme);
    document.querySelectorAll(".theme-card").forEach((c) =>
      c.classList.toggle("active", c.getAttribute("data-theme") === theme)
    );
  }

  // Tema padrão = "eco". Migração única: padrão antigo ("moderno" ou nada salvo) vai
  // para o Eco e o Escuro antigo vai para o Eco Escuro; os demais temas ficam como estão.
  chrome.storage.sync.get(["selectedTheme", "themeEcoMigradoV2"], (data) => {
    let theme = data.selectedTheme || "eco";
    if (!data.themeEcoMigradoV2) {
      if (!data.selectedTheme || data.selectedTheme === "moderno") theme = "eco";
      else if (data.selectedTheme === "escuro") theme = "eco-escuro";
      chrome.storage.sync.set({ selectedTheme: theme, themeEcoMigradoV2: true });
    }
    applyTheme(theme);
    if (themeSelector) themeSelector.value = theme;
  });

  if (themeSelector) {
    themeSelector.addEventListener("change", () => {
      const selectedTheme = themeSelector.value;
      chrome.storage.sync.set({ selectedTheme: selectedTheme }, () => {
        applyTheme(selectedTheme);
        console.log(`Tema alterado para: ${selectedTheme}`);
      });
    });
  }

  const toggleThemeButton = document.getElementById("toggleThemeButton");

  if (toggleThemeButton) {
    toggleThemeButton.addEventListener("click", () => {
      chrome.storage.sync.get("selectedTheme", (data) => {
        const currentTheme = data.selectedTheme || "eco";
        // Eco <-> Eco Escuro; qualquer outro tema volta para o Eco
        const newTheme = currentTheme === "eco" ? "eco-escuro" : "eco";
        chrome.storage.sync.set({ selectedTheme: newTheme }, () => {
          applyTheme(newTheme);
          if (themeSelector) themeSelector.value = newTheme;
          console.log(`Tema alternado para: ${newTheme}`);
        });
      });
    });
  }
  // Listeners para os botões de tema (theme-card)
  const themeCards = document.querySelectorAll(".theme-card");

  themeCards.forEach((card) => {
    card.addEventListener("click", () => {
      const selectedTheme = card.getAttribute("data-theme");

      chrome.storage.sync.set({ selectedTheme: selectedTheme }, () => {
        applyTheme(selectedTheme);
        if (themeSelector) themeSelector.value = selectedTheme;
        console.log(`Tema alterado para: ${selectedTheme}`);
      });
    });
  });
  const logsOutput = document.getElementById("logsOutput");

  function loadChangelog() {
    if (!logsOutput) return;
    fetch(chrome.runtime.getURL("changelog/changelog.txt"))
      .then((response) => {
        if (!response.ok)
          throw new Error("Arquivo changelog.txt não encontrado.");
        return response.text();
      })
      .then((data) => {
        logsOutput.textContent = data;
      })
      .catch((error) => {
        logsOutput.textContent = `Erro ao carregar o log: ${error.message}`;
      });
  }

  function showDefaultTab() {
    const defaultTab = document.getElementById("hubsoft-tab");
    const defaultButton = document.querySelector(
      '.tab-button[data-tab="hubsoft-tab"]'
    );
    if (defaultTab) defaultTab.classList.add("active");
    if (defaultButton) defaultButton.classList.add("active");
  }

  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const targetTabId = button.dataset.tab;
      tabButtons.forEach((btn) => btn.classList.remove("active"));
      tabContents.forEach((content) => content.classList.remove("active"));
      button.classList.add("active");
      const targetTab = document.getElementById(targetTabId);
      if (targetTab) targetTab.classList.add("active");
      if (targetTabId === "settings-tab") {
        loadSettings();
      } else if (targetTabId === "logs-tab") {
        loadChangelog();
      } else if (targetTabId === "monitor-tab") {
        loadAlertMonitorSettings();
      }
    });
  });

  showDefaultTab();


  const oltLogInput = document.getElementById("oltLogInput");
  const analyzeOltLogButton = document.getElementById("analyzeOltLogButton");
  const filterOltDateInput = document.getElementById("filterOltDate");
  const filterOltLogButton = document.getElementById("filterOltLogButton");
  const oltLogOutput = document.getElementById("oltLogOutput");
  const copyOltLogOutputButton = document.getElementById("copyOltLogOutputButton");

  if (oltLogInput) oltLogInput.style.display = 'none';
  if (filterOltDateInput) filterOltDateInput.parentElement.style.display = 'none';
  if (oltLogOutput) oltLogOutput.style.display = 'none';
  if (copyOltLogOutputButton) copyOltLogOutputButton.style.display = 'none';

  if (analyzeOltLogButton) {
    analyzeOltLogButton.textContent = 'Abrir Analisador de OLT';
    analyzeOltLogButton.addEventListener("click", () => {
      analyzeOltLogButton.disabled = true;
      analyzeOltLogButton.textContent = 'Abrindo...';

      chrome.runtime.sendMessage({ action: "openOltAnalyzer" }, (response) => {
        analyzeOltLogButton.disabled = false;
        analyzeOltLogButton.textContent = 'Abrir Analisador de OLT';

        if (chrome.runtime.lastError) {
          ToastManager.show("Erro ao abrir o analisador", "error");
          return;
        }

        if (response && response.success) {
          ToastManager.show("Analisador aberto na página!", "success");
        } else {
          ToastManager.show(response?.message || "Erro ao abrir", "error");
        }
      });
    });
  }

  if (filterOltLogButton) {
    filterOltLogButton.style.display = 'none';
  }

  if (copyOltLogOutputButton) {
    copyOltLogOutputButton.addEventListener("click", () => {
      navigator.clipboard.writeText(oltLogOutput.textContent).then(() => {
        ToastManager.show("Resultado OLT copiado!", "success");
      });
    });
  }

  const extractAlertsButton = document.getElementById("extractAlertsButton");
  const alertOutput = document.getElementById("alertOutput");
  const copyAlertsOutputButton = document.getElementById(
    "copyAlertsOutputButton"
  );

  if (extractAlertsButton) {
    extractAlertsButton.addEventListener("click", () => {
      alertOutput.textContent = "... Extraindo e agrupando alertas...";
      extractAlertsButton.disabled = true;
      copyAlertsOutputButton.style.display = "none";

      chrome.storage.sync.get(
        ["alertCssSelector", "alertDelimiter", "alertKeywords"],
        (settings) => {
          const payload = {
            action: "extractAndProcessAlerts",
            selector: settings.alertCssSelector || "body",
            delimiter: settings.alertDelimiter || "PROBLEMA",
            keywords: settings.alertKeywords
              ? settings.alertKeywords.split(",").map((k) => k.trim())
              : ["Interface", "Peer"],
          };

          chrome.runtime.sendMessage(payload, (response) => {
            // O background injeta o extrator na página e responde só {success, message};
            // o resultado aparece na própria página, não aqui.
            if (chrome.runtime.lastError) {
              alertOutput.textContent = `Erro de comunicação: ${chrome.runtime.lastError.message}`;
            } else if (!response?.success) {
              alertOutput.textContent = response?.message || "Erro ao abrir o extrator.";
            } else {
              alertOutput.textContent = "Extrator aberto na página.";
            }

            extractAlertsButton.disabled = false;
          });
        }
      );
    });
  }

  if (copyAlertsOutputButton) {
    copyAlertsOutputButton.addEventListener("click", () => {
      navigator.clipboard.writeText(alertOutput.innerText).then(() => {
        ToastManager.show("Alertas copiados!", "success");
      });
    });
  }

  const geminiApiKeyInput = document.getElementById("geminiApiKey");
  const geminiTemperatureInput = document.getElementById("geminiTemperature");
  const geminiCustomPromptInput = document.getElementById("geminiCustomPrompt");
  const saveSettingsButton = document.getElementById("saveSettingsButton");
  const settingsStatusDiv = document.getElementById("settingsStatus");

  function loadSettings() {
    if (!settingsStatusDiv) return;

    settingsStatusDiv.textContent = "Carregando...";
    chrome.runtime.sendMessage({ action: "loadGeminiSettings" }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn(
          "Erro ao carregar configurações da IA, popup provavelmente fechado."
        );
        return;
      }

      if (response && response.success && response.settings) {
        geminiApiKeyInput.value = response.settings.geminiApiKey || "";
        geminiTemperatureInput.value =
          response.settings.geminiTemperature !== undefined
            ? response.settings.geminiTemperature
            : 0.7;
        geminiCustomPromptInput.value =
          response.settings.geminiCustomPrompt ||
          "Sugira uma resposta breve...";
        settingsStatusDiv.textContent = "Configurações carregadas.";
      } else {
        settingsStatusDiv.textContent = "Erro ao carregar configurações.";
      }
    });
  }

  if (saveSettingsButton) {
    saveSettingsButton.addEventListener("click", () => {
      const settings = {
        apiKey: geminiApiKeyInput.value.trim(),
        temperature: parseFloat(geminiTemperatureInput.value),
        customPrompt: geminiCustomPromptInput.value.trim(),
      };

      settingsStatusDiv.textContent = "Salvando...";

      chrome.runtime.sendMessage(
        { action: "saveGeminiSettings", settings: settings },
        (response) => {
          if (chrome.runtime.lastError) {
            console.log(
              "Popup fechado antes da resposta (IA Settings). Erro ignorado."
            );
            settingsStatusDiv.textContent = "Configurações salvas!";
            settingsStatusDiv.style.color = "green";
            setTimeout(() => {
              if (settingsStatusDiv) settingsStatusDiv.textContent = "";
            }, 2000);

            return;
          }

          if (response && response.success) {
            settingsStatusDiv.textContent = "Configurações salvas!";
          } else {
            settingsStatusDiv.textContent = `Erro ao salvar: ${response?.message || "Erro desconhecido"
              }`;
          }
        }
      );
    });
  }

  const monitorIntervalSelect = document.getElementById(
    "monitorIntervalSelect"
  );
  const allowRepeatNotificationsCheckbox = document.getElementById(
    "allowRepeatNotificationsCheckbox"
  );
  const monitorKeywordsTextarea = document.getElementById(
    "monitorKeywordsTextarea"
  );
  const monitorRemindersTextarea = document.getElementById(
    "monitorRemindersTextarea"
  );
  const saveMonitorSettingsButton = document.getElementById(
    "saveMonitorSettingsButton"
  );
  const monitorSettingsStatus = document.getElementById(
    "monitorSettingsStatus"
  );

  document.getElementById("advancedToggle")?.addEventListener("click", () => {
    const advancedSettings = document.getElementById("advancedSettings");
    const toggleIcon = document.getElementById("advancedToggleIcon");

    if (advancedSettings && toggleIcon) {
      const isHidden = advancedSettings.style.display === "none";
      advancedSettings.style.display = isHidden ? "block" : "none";
      toggleIcon.textContent = isHidden ? "▲" : "▼";
    }
  });

  const enableAdaptiveIntervalCheckbox = document.getElementById(
    "enableAdaptiveIntervalCheckbox"
  );
  const onlyActiveTabCheckbox = document.getElementById(
    "onlyActiveTabCheckbox"
  );
  const debugModeCheckbox = document.getElementById("debugModeCheckbox");
  const excludePatternsTextarea = document.getElementById(
    "excludePatternsTextarea"
  );
  const maxCacheSizeInput = document.getElementById("maxCacheSizeInput");

  function loadAlertMonitorSettings() {
    if (!monitorSettingsStatus) return;

    monitorSettingsStatus.textContent = "Carregando...";

    const timeoutId = setTimeout(() => {
      if (monitorSettingsStatus) {
        monitorSettingsStatus.textContent = "Timeout - recarregue a extensão";
      }
    }, 5000);

    chrome.runtime.sendMessage(
      { action: "loadAlertMonitorSettings" },
      (response) => {
        clearTimeout(timeoutId);

        if (chrome.runtime.lastError) {
          console.warn(
            "Service worker pode ter sido terminado:",
            chrome.runtime.lastError.message
          );
          if (monitorSettingsStatus) {
            monitorSettingsStatus.textContent = "Erro - tente novamente";
          }
          return;
        }

        if (response && response.success) {
          const settings = response.settings;

          if (monitorIntervalSelect)
            monitorIntervalSelect.value = settings.monitorInterval || 10;
          if (allowRepeatNotificationsCheckbox)
            allowRepeatNotificationsCheckbox.checked =
              settings.allowRepeatNotifications || false;
          if (monitorKeywordsTextarea)
            monitorKeywordsTextarea.value = settings.monitorKeywords || "";
          if (monitorRemindersTextarea)
            monitorRemindersTextarea.value = settings.monitorReminders || "";

          if (enableAdaptiveIntervalCheckbox)
            enableAdaptiveIntervalCheckbox.checked =
              settings.enableAdaptiveInterval !== false;
          if (onlyActiveTabCheckbox)
            onlyActiveTabCheckbox.checked = settings.onlyActiveTab || false;
          if (debugModeCheckbox)
            debugModeCheckbox.checked = settings.debugMode || false;
          if (excludePatternsTextarea)
            excludePatternsTextarea.value = settings.excludePatterns || "";
          if (maxCacheSizeInput)
            maxCacheSizeInput.value = settings.maxCacheSize || 100;

          if (monitorSettingsStatus) {
            monitorSettingsStatus.textContent = "Configurações carregadas.";
            setTimeout(() => {
              if (monitorSettingsStatus) monitorSettingsStatus.textContent = "";
            }, 2000);
          }

          updateMonitorStatus(settings);
        } else {
          if (monitorSettingsStatus) {
            monitorSettingsStatus.textContent =
              "Erro ao carregar configurações.";
          }
        }
      }
    );
  }

  if (saveMonitorSettingsButton) {
    saveMonitorSettingsButton.addEventListener("click", () => {
      if (
        !monitorIntervalSelect ||
        !allowRepeatNotificationsCheckbox ||
        !monitorKeywordsTextarea ||
        !monitorRemindersTextarea
      )
        return;

      const settings = {
        monitorInterval: parseInt(monitorIntervalSelect.value, 10),
        allowRepeatNotifications: allowRepeatNotificationsCheckbox.checked,
        monitorKeywords: monitorKeywordsTextarea.value.trim(),
        monitorReminders: monitorRemindersTextarea.value.trim(),

        enableAdaptiveInterval:
          enableAdaptiveIntervalCheckbox?.checked !== false,
        onlyActiveTab: onlyActiveTabCheckbox?.checked || false,
        debugMode: debugModeCheckbox?.checked || false,
        excludePatterns: excludePatternsTextarea?.value.trim() || "",
        maxCacheSize: parseInt(maxCacheSizeInput?.value || "100", 10),
      };

      if (monitorSettingsStatus)
        monitorSettingsStatus.textContent = "Salvando...";

      const timeoutId = setTimeout(() => {
        if (monitorSettingsStatus) {
          monitorSettingsStatus.textContent = "Salvo (verificar logs)";
        }
      }, 5000);

      chrome.runtime.sendMessage(
        {
          action: "saveAlertMonitorSettings",
          settings: settings,
        },
        (response) => {
          clearTimeout(timeoutId);

          if (chrome.runtime.lastError) {
            console.log(
              "Service worker terminado, mas configurações podem ter sido salvas"
            );
            if (monitorSettingsStatus) {
              monitorSettingsStatus.textContent = "Salvo (verificar logs)";
              setTimeout(() => {
                if (monitorSettingsStatus)
                  monitorSettingsStatus.textContent = "";
              }, 3000);
            }
            return;
          }

          if (response && response.success) {
            if (monitorSettingsStatus) {
              monitorSettingsStatus.textContent =
                "Configurações salvas com sucesso!";
              setTimeout(() => {
                if (monitorSettingsStatus)
                  monitorSettingsStatus.textContent = "";
              }, 3000);
            }
            ToastManager.show("Monitor configurado!", "success");
          } else {
            if (monitorSettingsStatus) {
              monitorSettingsStatus.textContent = `Erro: ${response?.message || "Desconhecido"
                }`;
            }
            ToastManager.show("Erro ao salvar configurações", "error");
          }
        }
      );
    });
  }

  document
    .getElementById("resetMonitorSettingsButton")
    ?.addEventListener("click", () => {
      if (
        confirm(
          "Tem certeza que deseja resetar todas as configurações para os valores padrão?"
        )
      ) {
        chrome.runtime.sendMessage(
          { action: "resetAlertMonitorSettings" },
          (response) => {
            if (response && response.success) {
              loadAlertMonitorSettings();
              ToastManager.show("Configurações resetadas!", "success");
            } else {
              ToastManager.show("Erro ao resetar configurações", "error");
            }
          }
        );
      }
    });

  document
    .getElementById("exportMonitorSettingsButton")
    ?.addEventListener("click", () => {
      chrome.runtime.sendMessage(
        { action: "loadAlertMonitorSettings" },
        (response) => {
          if (response && response.success) {
            const data = JSON.stringify(response.settings, null, 2);
            const blob = new Blob([data], { type: "application/json" });
            const url = URL.createObjectURL(blob);

            const a = document.createElement("a");
            a.href = url;
            a.download = `noc-monitor-config-${new Date()
              .toISOString()
              .slice(0, 10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            ToastManager.show("Configurações exportadas!", "success");
          }
        }
      );
    });

  document
    .getElementById("viewMonitorStatsButton")
    ?.addEventListener("click", () => {
      chrome.runtime.sendMessage({ action: "getMonitorStats" }, (response) => {
        const stats = response || {
          cacheSize: 0,
          activeAlerts: 0,
          lastScan: "Nunca",
        };

        const message = `📊 Estatísticas do Monitor:
        
🗄️ Cache: ${stats.cacheSize} entradas
🚨 Alertas ativos: ${stats.activeAlerts}
⏱️ Último scan: ${stats.lastScan}
🔋 Modo adaptativo: ${stats.adaptiveMode ? "Ativo" : "Inativo"}`;

        alert(message);
      });
    });

  function updateMonitorStatus(settings) {
    const statusDiv = document.getElementById("monitorStatus");
    if (!statusDiv) return;

    const keywordCount = settings.monitorKeywords
      ? settings.monitorKeywords.split("\n").filter((k) => k.trim()).length
      : 0;
    const excludeCount = settings.excludePatterns
      ? settings.excludePatterns.split("\n").filter((p) => p.trim()).length
      : 0;

    statusDiv.innerHTML = `
        ⏰ Intervalo: ${settings.monitorInterval}s
        🔍 Palavras-chave: ${keywordCount}
        🚫 URLs ignoradas: ${excludeCount}
        🔋 Modo adaptativo: ${settings.enableAdaptiveInterval ? "Ativo" : "Inativo"
      }
    `;
  }
});

const gerarRelatorioBtn = document.getElementById('gerarRelatorioBtn');

if (gerarRelatorioBtn) {
  gerarRelatorioBtn.addEventListener('click', () => {
    gerarRelatorioBtn.disabled = true;
    gerarRelatorioBtn.innerHTML = '<span class="icon">⏳</span> Analisando...';

    chrome.runtime.sendMessage({
      action: "gerarRelatorioStatus"
    }, (response) => {
      gerarRelatorioBtn.disabled = false;
      gerarRelatorioBtn.innerHTML = '<span class="icon">⚡</span> Gerar Relatório';

      if (chrome.runtime.lastError) {
        alert(`Erro: ${chrome.runtime.lastError.message}`);
        return;
      }

      if (!response.success) {
        alert(`Erro: ${response.message || 'Falha ao gerar relatório'}`);
      }
    });
  });
}

const openIpCheckerButton = document.getElementById("openIpCheckerButton");

if (openIpCheckerButton) {
  openIpCheckerButton.addEventListener("click", () => {
    const originalText = openIpCheckerButton.textContent;

    openIpCheckerButton.disabled = true;
    openIpCheckerButton.textContent = "Abrindo...";

    chrome.runtime.sendMessage({ action: "openIpChecker" }, (response) => {
      openIpCheckerButton.disabled = false;
      openIpCheckerButton.textContent = originalText;

      if (chrome.runtime.lastError) {
        ToastManager?.show(
          `Erro: ${chrome.runtime.lastError.message}`,
          "error"
        );
        return;
      }

      if (response?.success) {
        ToastManager?.show(response.message || "Verificador aberto!", "success");
      } else {
        ToastManager?.show(
          response?.message || "Não foi possível abrir o verificador.",
          "error"
        );
      }
    });
  });
}



const openHubsoftScannerButton = document.getElementById("openHubsoftScannerButton");

if (openHubsoftScannerButton) {
  openHubsoftScannerButton.addEventListener("click", () => {
    const originalText = openHubsoftScannerButton.textContent;

    openHubsoftScannerButton.disabled = true;
    openHubsoftScannerButton.textContent = "Abrindo Scanner...";

    chrome.runtime.sendMessage({ action: "openHubsoftScanner" }, (response) => {
      openHubsoftScannerButton.disabled = false;
      openHubsoftScannerButton.textContent = originalText;

      if (chrome.runtime.lastError) {
        ToastManager?.show(`Erro: ${chrome.runtime.lastError.message}`, "error");
        return;
      }

      if (response?.success) {
        ToastManager?.show(response.message || "Scanner HubSoft aberto!", "success");
      } else {
        ToastManager?.show(response?.message || "Não foi possível abrir o scanner.", "error");
      }
    });
  });
}

// =============================================================================
// STICKY NOTES
// =============================================================================
const openStickyNotesButton = document.getElementById("openStickyNotesButton");

if (openStickyNotesButton) {
  openStickyNotesButton.addEventListener("click", () => {
    const originalText = openStickyNotesButton.textContent;

    openStickyNotesButton.disabled = true;
    openStickyNotesButton.textContent = "Abrindo...";

    chrome.runtime.sendMessage({ action: "openStickyNotes" }, (response) => {
      openStickyNotesButton.disabled = false;
      openStickyNotesButton.textContent = originalText;

      if (chrome.runtime.lastError) {
        ToastManager?.show(`Erro: ${chrome.runtime.lastError.message}`, "error");
        return;
      }

      if (response?.success) {
        ToastManager?.show(response.message || "Sticky Notes abertas!", "success");
      } else {
        ToastManager?.show(response?.message || "Não foi possível abrir as notas.", "error");
      }
    });
  });
}
