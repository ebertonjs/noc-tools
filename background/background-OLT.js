// =============================================================================
// CONFIGURAÇÕES DE OLT AVANÇADAS - NOC EXTENSION v3.0
// =============================================================================

async function enhanceOltAnalysisWithAI(formattedOutput, geminiConfig) {
  if (!geminiConfig.apiKey || geminiConfig.apiKey.length < 5) {
    return formattedOutput;
  }

  const aiPrompt = `Você é um assistente especializado em formatação de logs de OLT. Analise o seguinte relatório e MANTENHA exatamente o mesmo formato, mas organize melhor os dados se necessário.

REGRAS IMPORTANTES:
1. Mantenha EXATAMENTE o formato tabular atual
2. NÃO adicione análise técnica, insights ou recomendações
3. NÃO adicione seções extras como "=== ANÁLISE TÉCNICA ==="
4. Apenas organize e formate os dados de forma clara
5. SEMPRE inclua o total no final de cada seção no formato "total X"
6. Use alinhamento consistente nas colunas

Relatório para formatar:

${formattedOutput}`;

  try {
    const controller = new AbortController();
    const abortTimer = setTimeout(() => controller.abort(), 15000);

    const fetchPromise = fetch(geminiEndpoint(), {
      method: "POST",
      signal: controller.signal, // cancela a requisição de fato no timeout
      headers: geminiHeaders(geminiConfig.apiKey),
      body: JSON.stringify({
        contents: [{ parts: [{ text: aiPrompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 1000,
          topK: 1,
          topP: 1,
        },
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
          {
            category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
            threshold: "BLOCK_NONE",
          },
          {
            category: "HARM_CATEGORY_DANGEROUS_CONTENT",
            threshold: "BLOCK_NONE",
          },
        ],
      }),
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Timeout na formatação IA")), 15000)
    );

    const response = await Promise.race([fetchPromise, timeoutPromise]).finally(() =>
      clearTimeout(abortTimer)
    );

    if (response.ok) {
      const data = await response.json();
      const aiFormatted = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (aiFormatted && aiFormatted.trim()) {
        return aiFormatted.trim();
      }
    }
  } catch (error) {
    console.log("Erro na formatação IA do OLT:", error);
  }

  return formattedOutput;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "analyzeOltLog") {
    (async () => {
      try {
        const logText = request.logText;
        const filterDate = request.filterDate;
        const lines = logText.split("\n");

        let caiuHoje = [];
        let aindaOffline = [];
        let filteredByDate = [];

        const todayFormatted = `${new Date().getFullYear()}-${String(
          new Date().getMonth() + 1
        ).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`;

        lines.forEach((line) => {
          const trimmedLine = line.trim();
          if (!trimmedLine) return;

          const huaweiMatch = trimmedLine.match(
            /^(\d+)\s+(online|offline)\s+((?:\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})|(?:\s*-\s*))?\s+((?:\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})|(?:\s*-\s*))?\s*(.*)$/
          );

          const zteMatch = trimmedLine.match(
            /^(1\/1\/1:\d+)\s+SN\([^\s]+\s+\d+\s+SN\([^\s]+\)\s+(\w+)\s+(\d+)/
          );

          let entry = null;

          if (huaweiMatch) {
            entry = {
              id: huaweiMatch[1],
              status: huaweiMatch[2],
              online:
                huaweiMatch[3] && huaweiMatch[3].trim() !== "-"
                  ? huaweiMatch[3].trim()
                  : "",
              offline:
                huaweiMatch[4] && huaweiMatch[4].trim() !== "-"
                  ? huaweiMatch[4].trim()
                  : "",
              cause: huaweiMatch[5] ? huaweiMatch[5].trim() : "",
            };
          } else if (zteMatch) {
            const zteId = zteMatch[1].split(":")[1];
            const zteStatus =
              zteMatch[2].toLowerCase() === "working" ? "online" : "offline";

            entry = {
              id: zteId,
              status: zteStatus,
              online: "",
              offline:
                zteStatus === "offline" ? todayFormatted + " 00:00:00" : "",
              cause: zteStatus === "offline" ? zteMatch[2] : "",
            };
          }

          if (entry) {
            if (entry.status === "offline" && entry.offline) {
              const offlineDateOnly = entry.offline.split(" ")[0];
              if (offlineDateOnly === todayFormatted) {
                caiuHoje.push(entry);
              }
              if (offlineDateOnly === filterDate) {
                filteredByDate.push(entry);
              }
            }
            if (entry.status === "offline" && !entry.online) {
              aindaOffline.push(entry);
            }
          }
        });

        let resultData = {};
        if (filterDate) {
          resultData = {
            filterDate: filterDate,
            dispositivos: filteredByDate,
          };
        } else {
          resultData = {
            caiuHoje: caiuHoje,
            aindaOffline: aindaOffline,
          };
        }

        if (request.enhanceWithAI) {
          const result = await new Promise((resolve) => {
            chrome.storage.local.get(
              ["geminiApiKey", "geminiTemperature", "geminiCustomPrompt"],
              resolve
            );
          });

          const geminiConfig = {
            apiKey: result.geminiApiKey || "",
            temperature: 0.1,
            customPrompt: result.geminiCustomPrompt || "",
          };

          let formattedOutput = "";
          if (filterDate) {
            const filteredResults = resultData.dispositivos;
            if (filteredResults.length > 0) {
              formattedOutput +=
                "ID".padEnd(4) +
                "ESTADO ATUAL".padEnd(15) +
                "DATA".padEnd(20) +
                "MOTIVO\n";
              filteredResults.forEach((item) => {
                formattedOutput += `${item.id.padEnd(4)}${item.status.padEnd(
                  15
                )}${item.offline.padEnd(20)}${item.cause || "-"}\n`;
              });
              formattedOutput += `Total Offline ${filteredResults.length}`;
            } else {
              formattedOutput =
                "Nenhuma ONU ficou offline na data selecionada.";
            }
          } else {
            if (resultData.caiuHoje && resultData.caiuHoje.length > 0) {
              formattedOutput += "--- CAIU NA DATA DE HOJE ---\n\n";

              // Agrupar por motivo
              const groupedByReason = {};
              resultData.caiuHoje.forEach((item) => {
                const reason = item.cause || "Desconhecido";
                if (!groupedByReason[reason]) {
                  groupedByReason[reason] = [];
                }
                groupedByReason[reason].push(item);
              });

              // Ordenar motivos: dying-gasp primeiro, depois LOSi/LOBi, depois outros
              const sortedReasons = Object.keys(groupedByReason).sort((a, b) => {
                if (a === "dying-gasp") return -1;
                if (b === "dying-gasp") return 1;
                if (a === "LOSi/LOBi") return -1;
                if (b === "LOSi/LOBi") return 1;
                return a.localeCompare(b);
              });

              // Exibir cada grupo
              sortedReasons.forEach((reason, index) => {
                const items = groupedByReason[reason];

                if (index > 0) formattedOutput += "\n";

                formattedOutput += `🔴 ${reason.toUpperCase()} (${items.length})\n`;
                formattedOutput +=
                  "ID".padEnd(4) +
                  "ESTADO ATUAL".padEnd(15) +
                  "DATA".padEnd(25) +
                  "MOTIVO\n";

                items.forEach((item) => {
                  formattedOutput += 
                    `${item.id.padEnd(4)}` +
                    `${item.status.padEnd(15)}` +
                    `${item.offline.padEnd(25)}` +
                    `${item.cause || "-"}\n`;
                });
              });

              formattedOutput += `\n📊 Total de clientes Offline: ${resultData.caiuHoje.length}\n`;
            }

            if (resultData.aindaOffline && resultData.aindaOffline.length > 0) {
              if (formattedOutput) formattedOutput += "\n";
              formattedOutput += "--- AINDA ESTÃO OFFLINE ---\n";
              formattedOutput +=
                "ID".padEnd(4) +
                "ESTADO ATUAL".padEnd(15) +
                "DATA".padEnd(20) +
                "MOTIVO\n";
              resultData.aindaOffline.forEach((item) => {
                formattedOutput += `${item.id.padEnd(4)}${item.status.padEnd(
                  15
                )}${item.offline || "-".padEnd(20)}${item.cause || "-"}\n`;
              });
              formattedOutput += `total ${resultData.aindaOffline.length}`;
            }

            if (formattedOutput.trim() === "") {
              formattedOutput =
                "Nenhum log de OLT encontrado que corresponda aos critérios de hoje ou que ainda esteja offline.";
            }
          }

          const enhancedOutput = await enhanceOltAnalysisWithAI(
            formattedOutput,
            geminiConfig
          );

          sendResponse({
            success: true,
            result: {
              ...resultData,
              enhancedOutput: enhancedOutput,
            },
          });
        } else {
          sendResponse({ success: true, result: resultData });
        }
      } catch (error) {
        console.error("Erro no processamento OLT:", error);
        sendResponse({
          success: false,
          message: `Erro na análise: ${error.message}`,
        });
      }
    })();

    return true;
  }
});
