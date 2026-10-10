// =============================================================================
// CONFIGURAÇÕES DE ALERTA AVANÇADAS - NOC EXTENSION v2.0
// Novas funcionalidades: Intervalo adaptativo, exclusões, modo debug
// =============================================================================

function getDefaultAlertSettings() {
  return {
    monitorInterval: 10,
    allowRepeatNotifications: false,
    monitorKeywords: "Link down\nONU Offline\nPorta bloqueada",
    monitorReminders: "",

    enableAdaptiveInterval: true,
    maxCacheSize: 100,
    debugMode: false,
    onlyActiveTab: false,
    excludePatterns:
      "youtube.com\ntwitch.tv\nnetflix.com\nspotify.com\ninstagram.com",

    batchSize: 3,
    cacheExpiry: 60,
    maxEmptyScans: 6,
    maxTextLength: 50000,
  };
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "saveAlertMonitorSettings") {

    const sanitizedSettings = sanitizeSettings(request.settings);

    chrome.storage.sync.set({ alertMonitorSettings: sanitizedSettings }, () => {
      if (chrome.runtime.lastError) {
        console.error(
          "❌ Erro ao salvar configurações do monitor:",
          chrome.runtime.lastError.message
        );
        sendResponse({
          success: false,
          message: chrome.runtime.lastError.message,
        });
        return;
      }


      chrome.runtime.sendMessage({
        action: "alertSettingsUpdated",
        settings: sanitizedSettings,
      });

      sendResponse({ success: true });
    });
    return true;
  }

  if (request.action === "loadAlertMonitorSettings") {
    chrome.storage.sync.get("alertMonitorSettings", (data) => {
      if (chrome.runtime.lastError) {
        console.error(
          "❌ Erro ao carregar configurações do monitor:",
          chrome.runtime.lastError.message
        );
        sendResponse({
          success: false,
          message: chrome.runtime.lastError.message,
        });
        return;
      }

      const settings = data.alertMonitorSettings || getDefaultAlertSettings();

      sendResponse({ success: true, settings: settings });
    });
    return true;
  }

  if (request.action === "resetAlertMonitorSettings") {
    const defaultSettings = getDefaultAlertSettings();

    chrome.storage.sync.set({ alertMonitorSettings: defaultSettings }, () => {
      if (chrome.runtime.lastError) {
        sendResponse({
          success: false,
          message: chrome.runtime.lastError.message,
        });
        return;
      }


      chrome.runtime.sendMessage({
        action: "alertSettingsUpdated",
        settings: defaultSettings,
      });

      sendResponse({ success: true, settings: defaultSettings });
    });
    return true;
  }

  if (request.action === "getMonitorStats") {
    chrome.runtime.sendMessage({ action: "getMonitoringStats" }, (response) => {
      sendResponse(
        response || {
          cacheSize: 0,
          activeAlerts: 0,
          lastScan: "Nunca",
          adaptiveMode: false,
        }
      );
    });
    return true;
  }
});

function sanitizeSettings(settings) {
  const sanitized = { ...settings };

  if (sanitized.monitorInterval < 5) {
    sanitized.monitorInterval = 5;
    console.warn("⚠️ Intervalo mínimo é 5 segundos, valor ajustado");
  }
  if (sanitized.monitorInterval > 300) {
    sanitized.monitorInterval = 300;
    console.warn("⚠️ Intervalo máximo é 300 segundos (5 min), valor ajustado");
  }

  if (sanitized.maxCacheSize < 10) {
    sanitized.maxCacheSize = 10;
  } else if (sanitized.maxCacheSize > 1000) {
    sanitized.maxCacheSize = 1000;
    console.warn("⚠️ Tamanho máximo de cache é 1000, valor ajustado");
  }

  if (sanitized.monitorKeywords) {
    const keywords = sanitized.monitorKeywords
      .split("\n")
      .map((k) => k.trim())
      .filter((k) => k.length > 0)
      .filter((k, i, arr) => arr.indexOf(k) === i); // remover duplicatas

    sanitized.monitorKeywords = keywords.join("\n");

    if (keywords.length > 50) {
      console.warn("⚠️ Muitas palavras-chave podem afetar a performance");
    }
  }

  if (sanitized.excludePatterns) {
    const patterns = sanitized.excludePatterns
      .split("\n")
      .map((p) => p.trim())
      .filter((p) => p.length > 0)
      .filter((p, i, arr) => arr.indexOf(p) === i); // remover duplicatas

    sanitized.excludePatterns = patterns.join("\n");
  }

  sanitized.batchSize = Math.max(1, Math.min(sanitized.batchSize || 3, 10));
  sanitized.cacheExpiry = Math.max(
    30,
    Math.min(sanitized.cacheExpiry || 60, 300)
  );
  sanitized.maxEmptyScans = Math.max(
    3,
    Math.min(sanitized.maxEmptyScans || 6, 20)
  );
  sanitized.maxTextLength = Math.max(
    1000,
    Math.min(sanitized.maxTextLength || 50000, 200000)
  );

  return sanitized;
}

function exportSettings() {
  chrome.storage.sync.get("alertMonitorSettings", (data) => {
    const settings = data.alertMonitorSettings || getDefaultAlertSettings();
    const blob = new Blob([JSON.stringify(settings, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);

    chrome.downloads.download({
      url: url,
      filename: `noc-monitor-settings-${new Date()
        .toISOString()
        .slice(0, 10)}.json`,
    });
  });
}

function importSettings(jsonData) {
  try {
    const settings = JSON.parse(jsonData);
    const sanitized = sanitizeSettings(settings);

    chrome.storage.sync.set({ alertMonitorSettings: sanitized }, () => {
      if (chrome.runtime.lastError) {
        console.error(
          "❌ Erro ao importar configurações:",
          chrome.runtime.lastError.message
        );
        return;
      }

      chrome.runtime.sendMessage({
        action: "alertSettingsUpdated",
        settings: sanitized,
      });
    });
  } catch (error) {
    console.error(
      "❌ Erro ao fazer parse das configurações importadas:",
      error
    );
  }
}

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    const defaultSettings = getDefaultAlertSettings();

    chrome.storage.sync.set({ alertMonitorSettings: defaultSettings }, () => {
    });
  } else if (details.reason === "update") {

    chrome.storage.sync.get("alertMonitorSettings", (data) => {
      if (data.alertMonitorSettings) {
        const current = data.alertMonitorSettings;
        const defaults = getDefaultAlertSettings();
        const updated = { ...defaults, ...current };

        chrome.storage.sync.set({ alertMonitorSettings: updated }, () => {
          chrome.runtime.sendMessage({
            action: "alertSettingsUpdated",
            settings: updated,
          });
        });
      }
    });
  }
});

chrome.commands?.onCommand.addListener((command) => {
  switch (command) {
    case "toggle-monitor":
      break;
    case "show-stats":
      break;
  }
});
