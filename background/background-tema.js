// =============================================================================
// TEMA NAS JANELAS DA PÁGINA
// O tema escolhido no popup (storage.sync "selectedTheme") vira um conjunto de
// variáveis CSS (--noc-*) aplicadas no <html> da aba antes de qualquer injeção.
// As janelas/avisos usam var(--noc-..., <verde Eco>) — sem as variáveis, ficam no Eco.
// =============================================================================

const PALETAS_TEMA = {
  eco: {
    pri: "#2E7D32", pri2: "#1B5E20", pri3: "#43A047", priRgb: "46 125 50", accent: "#2E7D32", onPri: "#ffffff",
    tint: "#E8F5E9", tint2: "#C8E6C9",
    surface: "#ffffff", surface2: "#F4F8F4", border: "#E3EBE4", border2: "#C9D8CB",
    text: "#17231A", text2: "#6B7A6E",
  },
  "eco-escuro": {
    pri: "#388E3C", pri2: "#1B5E20", pri3: "#4CAF50", priRgb: "76 175 80", accent: "#81C784", onPri: "#ffffff",
    tint: "#1F3323", tint2: "#2A4A30",
    surface: "#1B211D", surface2: "#151A17", border: "#2A332D", border2: "#3A463E",
    text: "#E6EFE7", text2: "#93A596",
  },
  moderno: {
    pri: "#007AFF", pri2: "#0056B3", pri3: "#339CFF", priRgb: "0 122 255", accent: "#007AFF", onPri: "#ffffff",
    tint: "#E6F2FF", tint2: "#CCE4FF",
    surface: "#ffffff", surface2: "#F7F7F8", border: "#E5E5E7", border2: "#D1D1D6",
    text: "#1D1D1F", text2: "#8A8A8E",
  },
  escuro: {
    pri: "#0A84FF", pri2: "#0060DF", pri3: "#409CFF", priRgb: "10 132 255", accent: "#64B5FF", onPri: "#ffffff",
    tint: "#1D3A5C", tint2: "#24496F",
    surface: "#2C2C2E", surface2: "#1C1C1E", border: "#444446", border2: "#555558",
    text: "#E5E5E7", text2: "#8E8E93",
  },
  classico: {
    pri: "#0052CC", pri2: "#0747A6", pri3: "#2684FF", priRgb: "0 82 204", accent: "#0052CC", onPri: "#ffffff",
    tint: "#DEEBFF", tint2: "#B3D4FF",
    surface: "#ffffff", surface2: "#F4F5F7", border: "#DFE1E6", border2: "#C1C7D0",
    text: "#172B4D", text2: "#5E6C84",
  },
  hacker: {
    pri: "#00C832", pri2: "#008F24", pri3: "#00FF41", priRgb: "0 255 65", accent: "#00FF41", onPri: "#0D0208",
    tint: "#003311", tint2: "#004D1A",
    surface: "#0D0208", surface2: "#001A08", border: "#00A020", border2: "#00FF41",
    text: "#00FF41", text2: "#00A020",
  },
  blueprint: {
    pri: "#FFFFFF", pri2: "#A3D5FF", pri3: "#FFFFFF", priRgb: "163 213 255", accent: "#FFFFFF", onPri: "#0F4C81",
    tint: "#155A96", tint2: "#1D6AAD",
    surface: "#0F4C81", surface2: "#0B3D69", border: "#A3D5FF", border2: "#7FB8E6",
    text: "#FFFFFF", text2: "#A3D5FF",
  },
  "8bit": {
    pri: "#CF2E2E", pri2: "#A82222", pri3: "#FF4C4C", priRgb: "207 46 46", accent: "#A82222", onPri: "#ffffff",
    tint: "#F3D6D6", tint2: "#EAB3B3",
    surface: "#E0E0E0", surface2: "#D3D3D3", border: "#8F8F8F", border2: "#777777",
    text: "#222222", text2: "#555555",
  },
  zen: {
    pri: "#A99985", pri2: "#968470", pri3: "#BCAE9C", priRgb: "169 153 133", accent: "#7D6E5C", onPri: "#ffffff",
    tint: "#F1EDE8", tint2: "#E5DDD3",
    surface: "#ffffff", surface2: "#F5F5F0", border: "#E6E6E0", border2: "#D6D6CC",
    text: "#4A4A4A", text2: "#888888",
  },
  jornal: {
    pri: "#654321", pri2: "#4A3018", pri3: "#8B5A2B", priRgb: "101 67 33", accent: "#654321", onPri: "#ffffff",
    tint: "#EFE2C6", tint2: "#E3D2AB",
    surface: "#FDF6E3", surface2: "#F5ECD2", border: "#D2C6A0", border2: "#BFB083",
    text: "#583E2E", text2: "#8A735A",
  },
  gemini: {
    pri: "#4285F4", pri2: "#3367D6", pri3: "#6EA0F7", priRgb: "66 133 244", accent: "#1A73E8", onPri: "#ffffff",
    tint: "#E8F0FE", tint2: "#D2E3FC",
    surface: "#ffffff", surface2: "#F8F9FA", border: "#E0E0E0", border2: "#C8C8C8",
    text: "#3C4043", text2: "#5F6368",
  },
  neutro: {
    pri: "#6C757D", pri2: "#495057", pri3: "#868E96", priRgb: "108 117 125", accent: "#495057", onPri: "#ffffff",
    tint: "#EEF0F2", tint2: "#DEE2E6",
    surface: "#ffffff", surface2: "#F8F9FA", border: "#CED4DA", border2: "#ADB5BD",
    text: "#212529", text2: "#6C757D",
  },
};

async function obterPaletaTema() {
  try {
    const { selectedTheme } = await chrome.storage.sync.get("selectedTheme");
    return PALETAS_TEMA[selectedTheme] || PALETAS_TEMA.eco;
  } catch (_) {
    return PALETAS_TEMA.eco;
  }
}

// Roda DENTRO da página: grava as variáveis no <html>. Variáveis CSS herdam
// também para dentro dos Shadow DOM dos avisos.
function definirVariaveisTemaNoc(p) {
  const r = document.documentElement;
  if (!r) return;
  const set = (k, v) => r.style.setProperty(k, v);
  set("--noc-pri", p.pri);
  set("--noc-pri2", p.pri2);
  set("--noc-pri3", p.pri3);
  set("--noc-pri-rgb", p.priRgb);
  set("--noc-on-pri", p.onPri);
  set("--noc-accent", p.accent); // texto sobre fundo "tint" (botões secundários)
  set("--noc-tint", p.tint);
  set("--noc-tint2", p.tint2);
  set("--noc-surface", p.surface);
  set("--noc-surface2", p.surface2);
  set("--noc-border", p.border);
  set("--noc-border2", p.border2);
  set("--noc-text", p.text);
  set("--noc-text2", p.text2);
}

// Nunca rejeita: se falhar (página sem permissão etc.), a janela abre no Eco.
async function aplicarTemaNaAba(tabId) {
  if (!tabId) return;
  try {
    const paleta = await obterPaletaTema();
    await chrome.scripting.executeScript({
      target: { tabId },
      func: definirVariaveisTemaNoc,
      args: [paleta],
    });
  } catch (_) { }
}

// Substitui chrome.scripting.executeScript nos arquivos da extensão:
// aplica o tema e depois injeta, mantendo o mesmo comportamento de callback/promise
// (inclusive chrome.runtime.lastError, que continua vindo da chamada original).
function executarComTema(opcoes, callback) {
  const tabId = opcoes?.target?.tabId;
  const antes = aplicarTemaNaAba(tabId);
  if (typeof callback === "function") {
    antes.finally(() => chrome.scripting.executeScript(opcoes, callback));
    return undefined;
  }
  return antes.then(() => chrome.scripting.executeScript(opcoes));
}

// Trocou o tema no popup: atualiza as abas abertas (janelas/avisos já exibidos mudam na hora).
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync" || !changes.selectedTheme) return;
  chrome.tabs.query({}, (tabs) => {
    for (const t of tabs || []) {
      if (t.id && /^https?:\/\//i.test(t.url || "") && !t.url.startsWith("https://chrome.google.com/webstore")) {
        aplicarTemaNaAba(t.id);
      }
    }
  });
});
