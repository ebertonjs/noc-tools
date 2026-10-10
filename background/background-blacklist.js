// =============================================================================
// VERIFICADOR MULTIFONTE DE REPUTAÇÃO DE IP - NOC EXTENSION v2.4.0 
// =============================================================================

async function checkIpReputationWithAI(ip, geminiConfig) {
  if (!geminiConfig.apiKey) throw new Error("Chave de API do Gemini não configurada.");

  if (!IPV4_REGEX.test(ip)) throw new Error("Formato de endereço IP inválido.");

  const aiPrompt = `
Você é um especialista em segurança de redes. Analise o endereço IP: ${ip}.
Responda em português, de forma concisa, seguindo o formato:

REPUTAÇÃO GERAL: [BOA, SUSPEITA ou RUIM]

DETALHES:
- [Análise sobre o histórico do IP (spam, malware, etc.)]
- [Comentário sobre o provedor/data center]

RECOMENDAÇÃO: [MONITORAR, NENHUMA AÇÃO ou BLOQUEAR]
`;

  const response = await fetch(geminiEndpoint(), {
    method: "POST",
    headers: geminiHeaders(geminiConfig.apiKey),
    body: JSON.stringify({
      contents: [{ parts: [{ text: aiPrompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 500
      }
    })
  });

  if (!response.ok) throw new Error(`Erro na API Gemini: ${response.status}`);

  const data = await response.json();
  const aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!aiResponse) throw new Error("A API Gemini retornou uma resposta vazia.");

  return aiResponse.trim();
}

// Mesma validação para todas as consultas (a IA já validava; as demais recebiam o texto cru).
const IPV4_REGEX = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

async function checkGeolocation(ip) {
  const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,message,country,city,isp,as,hosting`);
  if (!response.ok) throw new Error(`Erro na API de Geolocalização: ${response.status}`);

  const data = await response.json();
  if (data.status === "fail") throw new Error(`Falha na Geolocalização: ${data.message}`);

  const hostingStatus = data.hosting ? "SIM (Data Center/Hospedagem)" : "NÃO (Conexão Residencial/Móvel)";

  return `País: ${data.country || "N/A"}
Cidade: ${data.city || "N/A"}
Provedor: ${data.isp || "N/A"}
ASN: ${data.as || "N/A"}
Hosting/Data Center: ${hostingStatus}`;
}

async function getUserPublicIpV4() {
  const r = await fetch("https://api.ipify.org?format=json");
  if (!r.ok) throw new Error(`Falha ao obter IP público IPv4: ${r.status}`);
  const data = await r.json();
  if (!data.ip) throw new Error("IPv4 não retornado.");
  return data.ip;
}

async function getUserPublicIpV6() {
  try {
    const r = await fetch("https://api64.ipify.org?format=json");
    if (!r.ok) return null;
    const data = await r.json();
    return data.ip || null;
  } catch {
    return null;
  }
}

async function getUserIpInfo() {
  const ipv4 = await getUserPublicIpV4();
  const ipv6 = await getUserPublicIpV6();
  const geoText = await checkGeolocation(ipv4);
  return { ipv4, ipv6, geoText };
}

// A lista IPsum tem vários MB e é atualizada 1x por dia: baixa no máximo a cada 6h.
// Cache em memória (enquanto o service worker vive) + storage.local (sobrevive ao SW dormir).
const IPSUM_URL = "https://raw.githubusercontent.com/stamparm/ipsum/master/ipsum.txt";
const IPSUM_TTL_MS = 6 * 60 * 60 * 1000;
let ipsumCache = null; // { ts, texto } — busca direta no texto: mais leve que montar um Map de ~200 mil IPs

// Nível (nº de listas) do IP no texto do IPsum, ou 0 se não estiver.
function nivelNoIpsum(texto, ip) {
  const chave = "\n" + ip + "\t";
  let pos = texto.startsWith(ip + "\t") ? 0 : texto.indexOf(chave);
  if (pos < 0) return 0;
  if (pos > 0) pos += 1;
  const fimLinha = texto.indexOf("\n", pos);
  const linha = texto.slice(pos, fimLinha < 0 ? undefined : fimLinha);
  return Number(linha.split(/\s+/)[1]) || 1;
}

async function getIpsumTexto() {
  const agora = Date.now();
  if (ipsumCache && agora - ipsumCache.ts < IPSUM_TTL_MS) return ipsumCache.texto;

  const { ipsumTexto, ipsumTs } = await chrome.storage.local.get(["ipsumTexto", "ipsumTs"]);
  if (ipsumTexto && ipsumTs && agora - ipsumTs < IPSUM_TTL_MS) {
    ipsumCache = { ts: ipsumTs, texto: ipsumTexto };
    return ipsumTexto;
  }

  try {
    const response = await fetch(IPSUM_URL);
    if (!response.ok) throw new Error(`Erro ao buscar a lista IPsum: ${response.status}`);
    const texto = await response.text();
    ipsumCache = { ts: agora, texto };
    chrome.storage.local.set({ ipsumTexto: texto, ipsumTs: agora }).catch(() => { });
    return texto;
  } catch (e) {
    // Sem rede: usa a cópia antiga, se existir, em vez de falhar
    if (ipsumTexto) {
      ipsumCache = { ts: ipsumTs || 0, texto: ipsumTexto };
      return ipsumTexto;
    }
    throw e;
  }
}

async function checkIpsumBlacklist(ip) {
  const nivel = nivelNoIpsum(await getIpsumTexto(), ip);
  if (nivel) return `ENCONTRADO em ${nivel} lista(s) de ameaças (IPsum).`;
  return `NÃO ENCONTRADO em listas de ameaças conhecidas (IPsum).`;
}

async function checkSpamhausZen(ip) {
  const reversedIp = ip.split(".").reverse().join(".");
  const queryDomain = `${reversedIp}.zen.spamhaus.org`;
  const dohUrl = `https://cloudflare-dns.com/dns-query?name=${queryDomain}&type=A`;

  const response = await fetch(dohUrl, {
    headers: { accept: "application/dns-json" }
  });

  if (!response.ok) throw new Error(`Erro na consulta DoH: ${response.status}`);

  const data = await response.json();

  const codes = data.Status === 0 && Array.isArray(data.Answer)
    ? data.Answer.filter((ans) => ans.type === 1).map((ans) => ans.data)
    : [];

  if (codes.length === 0) return "NÃO LISTADO no Spamhaus ZEN.";

  // 127.255.255.x = erro do Spamhaus (consulta via resolver público/aberto, limite etc.),
  // NÃO é listagem. Sem isso o relatório dava falso positivo.
  if (codes.every((c) => c.startsWith("127.255.255."))) {
    return `INCONCLUSIVO (Spamhaus recusou a consulta via DNS público: ${codes.join(", ")}).
Verificar manualmente: https://check.spamhaus.org/results?query=${ip}`;
  }

  const ZEN_CODES = {
    "127.0.0.2": "SBL",
    "127.0.0.3": "SBL CSS",
    "127.0.0.4": "XBL",
    "127.0.0.9": "SBL DROP",
    "127.0.0.10": "PBL (ISP)",
    "127.0.0.11": "PBL (Spamhaus)",
  };
  const listed = codes.filter((c) => !c.startsWith("127.255.255."));
  const desc = listed.map((c) => `${c}${ZEN_CODES[c] ? ` = ${ZEN_CODES[c]}` : ""}`).join(", ");
  const soPbl = listed.every((c) => c === "127.0.0.10" || c === "127.0.0.11");

  return `${soPbl ? "LISTADO SÓ NA PBL (faixa dinâmica/residencial, não indica abuso)" : "LISTADO!"} (Códigos: ${desc})
Ver detalhes: https://check.spamhaus.org/results?query=${ip}`;
}

async function checkAbuseIPDB(ip) {
  return `Verificar reputação colaborativa em:
https://www.abuseipdb.com/check/${ip}`;
}
async function checkWhoisRDAP(ip) {
  try {
    const response = await fetch(`https://rdap.arin.net/registry/ip/${ip}`);
    if (!response.ok) throw new Error("RDAP not found or outside ARIN region.");

    const data = await response.json();
    const name = data.name || "N/A";
    const handle = data.handle || "N/A";
    let abuseContact = "N/A";

    if (data.entities) {
      for (const entity of data.entities) {
        if (entity.roles && entity.roles.includes("abuse")) {
          const email = entity.vcardArray?.[1]?.find((item) => item[0] === "email")?.[3];
          if (email) abuseContact = email;
        }
      }
    }

    return `Bloco: ${name} (Handle: ${handle})
Contato de Abuso: ${abuseContact}
Link: https://www.arin.net/resources/registry/whois/lookup.html?queryid=${ip}`;
  } catch (e) {
    return `Consulta detalhada falhou.
Tentar lookup WHOIS em: https://www.arin.net/resources/registry/whois/lookup.html?queryid=${ip}`;
  }
}

async function checkBarracudaBRBL(ip) {
  const reversedIp = ip.split(".").reverse().join(".");
  const queryDomain = `${reversedIp}.b.barracudacentral.org`;
  const dohUrl = `https://cloudflare-dns.com/dns-query?name=${queryDomain}&type=A`;

  const response = await fetch(dohUrl, {
    headers: { accept: "application/dns-json" }
  });

  if (!response.ok) throw new Error(`Erro na consulta DoH (BRBL): ${response.status}`);

  const data = await response.json();

  const codes = data.Status === 0 && Array.isArray(data.Answer)
    ? data.Answer.filter((ans) => ans.type === 1).map((ans) => ans.data)
    : [];
  if (codes.includes("127.0.0.2")) {
    return `LISTADO!
Verificar detalhes: https://www.barracudacentral.org/lookups/ip-reputation`;
  }
  if (codes.length > 0) {
    return `INCONCLUSIVO (resposta inesperada: ${codes.join(", ")}).
Verificar manualmente: https://www.barracudacentral.org/lookups/ip-reputation`;
  }

  return "NÃO LISTADO no Barracuda BRBL.";
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "checkIpReputation") {
    (async () => {
      try {
        const ip = String(request.ip || "").trim();
        if (!IPV4_REGEX.test(ip)) {
          sendResponse({ success: false, message: "Formato de endereço IPv4 inválido." });
          return;
        }
        request.ip = ip;

        const { geminiApiKey } = await chrome.storage.local.get("geminiApiKey");

        const results = await Promise.allSettled([
          checkGeolocation(request.ip),
          checkIpsumBlacklist(request.ip),
          checkSpamhausZen(request.ip),
          checkAbuseIPDB(request.ip),
          checkIpReputationWithAI(request.ip, { apiKey: geminiApiKey }),
          checkWhoisRDAP(request.ip),
          checkBarracudaBRBL(request.ip)
        ]);

        const finalReport = `
═══════════════════════════════════════════════════
    ANÁLISE MULTIFONTE DE REPUTAÇÃO DE IP
═══════════════════════════════════════════════════

📍 IP ANALISADO: ${request.ip}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🌍 GEOLOCALIZAÇÃO E PROVEDOR:
${results[0].status === "fulfilled" ? results[0].value : `❌ Erro: ${results[0].reason.message}`}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🚨 LISTAS DE AMEAÇAS (IPsum):
${results[1].status === "fulfilled" ? results[1].value : `❌ Erro: ${results[1].reason.message}`}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🛡️ DNSBL - SPAMHAUS ZEN:
${results[2].status === "fulfilled" ? results[2].value : `❌ Erro: ${results[2].reason.message}`}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

👥 REPUTAÇÃO COLABORATIVA (AbuseIPDB):
${results[3].status === "fulfilled" ? results[3].value : `❌ Erro: ${results[3].reason.message}`}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🤖 ANÁLISE POR IA (Gemini):
${results[4].status === "fulfilled" ? results[4].value : `❌ Erro: ${results[4].reason.message}`}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 INFORMAÇÕES DE REGISTRO (WHOIS/RDAP):
${results[5].status === "fulfilled" ? results[5].value : `❌ Erro: ${results[5].reason.message}`}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔒 BARRACUDA BRBL:
${results[6].status === "fulfilled" ? results[6].value : `❌ Erro: ${results[6].reason.message}`}


═══════════════════════════════════════════════════
           FIM DA ANÁLISE MULTIFONTE
═══════════════════════════════════════════════════
`;

        sendResponse({
          success: true,
          report: finalReport.trim()
        });
      } catch (error) {
        console.error("Erro no processamento de IP:", error);
        sendResponse({
          success: false,
          message: `Erro na análise: ${error.message}`
        });
      }
    })();

    return true;
  }

  if (request.action === "getUserIpInfo") {
    (async () => {
      try {
        const info = await getUserIpInfo();
        sendResponse({ success: true, data: info });
      } catch (error) {
        sendResponse({ success: false, message: error.message });
      }
    })();

    return true;
  }
});
