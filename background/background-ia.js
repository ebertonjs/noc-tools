// =============================================================================
// CONFIGURAÇÕES DE IA - NOC EXTENSION v2.0 (MODERNIZADO)
// =============================================================================


// Modelo e endpoint do Gemini centralizados: usados também por background-blacklist.js
// e background-OLT.js (importScripts compartilha o escopo global do service worker).
const GEMINI_MODEL = "gemini-2.5-flash";

function geminiEndpoint(model = GEMINI_MODEL) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

// Chave vai no header (x-goog-api-key), não na URL, para não aparecer em logs/histórico.
function geminiHeaders(apiKey) {
  return { "Content-Type": "application/json", "x-goog-api-key": apiKey };
}

let geminiConfig = {
  apiKey: "",
  temperature: 0.7,
  customPrompt:
    "Sugira uma resposta breve para a seguinte pergunta/problema/situação de suporte, ideal para um ambiente de atendimento ao cliente, sendo direto e objetivo. Não peça desculpas no início ou final, vá direto ao ponto e seja solucionador:",
};


let isProcessing = false;


function showInPageMessage(tabId, message) {
  const createMessageBoxFunction = (msg) => {
    document.getElementById("gemini-message-box")?.remove();
    document.getElementById("gemini-suggestion-loading")?.remove();


    const boxDiv = document.createElement("div");
    boxDiv.id = "gemini-message-box";
    boxDiv.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: var(--noc-surface, #ffffff);
            color: var(--noc-text, #1d1d1f);
            padding: 25px 40px;
            border-radius: 12px;
            z-index: 10000;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            font-weight: 500;
            font-size: 1em;
            box-shadow: 0 20px 60px rgb(var(--noc-pri-rgb, 46 125 50) / 0.2), 0 0 1px rgba(0, 0, 0, 0.1);
            animation: fadeIn 0.3s ease-out;
            max-width: 400px;
            text-align: center;
            display: flex;
            flex-direction: column;
            gap: 15px;
        `;


    const msgDiv = document.createElement("div");
    msgDiv.textContent = msg; // texto puro: mensagens de erro podem trazer conteúdo externo
    const closeBtn = document.createElement("button");
    closeBtn.id = "close-gemini-error-button";
    closeBtn.textContent = "Fechar";
    closeBtn.style.cssText = "padding: 10px 16px; border: none; background: linear-gradient(135deg, var(--noc-pri, #2E7D32) 0%, var(--noc-pri2, #1B5E20) 100%); color: var(--noc-on-pri, #ffffff); border-radius: 8px; cursor: pointer; font-weight: 600; box-shadow: 0 4px 12px rgb(var(--noc-pri-rgb, 46 125 50) / 0.3);";
    closeBtn.addEventListener("click", () => boxDiv.remove());
    boxDiv.append(msgDiv, closeBtn);


    document.body.appendChild(boxDiv);
  };


  executarComTema({
      target: { tabId: tabId },
      func: createMessageBoxFunction,
      args: [message],
    })
    .catch((err) =>
      console.warn(`Falha ao injetar mensagem na aba ${tabId}: ${err.message}`)
    );
}


function showLoadingMessage(tabId) {
  executarComTema({
    target: { tabId: tabId },
    function: () => {
      const existingDiv = document.getElementById("gemini-suggestion-loading");
      if (existingDiv) existingDiv.remove();


      const loadingDiv = document.createElement("div");
      loadingDiv.id = "gemini-suggestion-loading";
      loadingDiv.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(255, 255, 255, 0.95);
                backdrop-filter: blur(10px);
                color: var(--noc-text, #1d1d1f);
                padding: 30px 50px;
                border-radius: 12px;
                z-index: 10000;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                font-weight: 600;
                font-size: 1.2em;
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 20px 60px rgb(var(--noc-pri-rgb, 46 125 50) / 0.2), 0 0 1px rgba(0, 0, 0, 0.1);
                border: none;
                animation: fadeIn 0.3s ease-out;
            `;


      loadingDiv.innerHTML = `<div>🧠 Processando com IA...</div>`;
      document.body.appendChild(loadingDiv);
    },
  });
}


// Lê a config do storage. Chamado dentro dos handlers: o service worker dorme após ~30s
// e, ao acordar pelo menu de contexto, a variável em memória ainda estaria vazia.
async function loadGeminiConfig() {
  const result = await chrome.storage.local.get([
    "geminiApiKey",
    "geminiTemperature",
    "geminiCustomPrompt",
  ]);
  if (result.geminiApiKey) geminiConfig.apiKey = result.geminiApiKey;
  if (result.geminiTemperature !== undefined) geminiConfig.temperature = result.geminiTemperature;
  if (result.geminiCustomPrompt !== undefined) geminiConfig.customPrompt = result.geminiCustomPrompt;
  return geminiConfig;
}

loadGeminiConfig().catch(() => { });


chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

  if (request.action === "saveGeminiSettings") {
    const settings = request.settings;


    geminiConfig.apiKey = settings.apiKey;
    geminiConfig.temperature = settings.temperature;
    geminiConfig.customPrompt = settings.customPrompt;


    chrome.storage.local.set({
      geminiApiKey: settings.apiKey,
      geminiTemperature: settings.temperature,
      geminiCustomPrompt: settings.customPrompt
    }, () => {
      sendResponse({ success: true });
    });


    return true;
  }


  if (request.action === "loadGeminiSettings") {
    chrome.storage.local.get(
      ["geminiApiKey", "geminiTemperature", "geminiCustomPrompt"],
      (result) => {
        sendResponse({
          success: true,
          settings: {
            geminiApiKey: result.geminiApiKey || "",
            geminiTemperature: result.geminiTemperature !== undefined ? result.geminiTemperature : 0.7,
            geminiCustomPrompt: result.geminiCustomPrompt || "Sugira uma resposta breve...",
          }
        });
      }
    );
    return true;
  }
});

function createContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "suggestGeminiResponse",
      title: "Analisar com IA",
      contexts: ["selection", "image", "page"],
    });
  });
}


chrome.runtime.onInstalled.addListener(createContextMenus);
chrome.runtime.onStartup.addListener(createContextMenus);


function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 8192;
  let binary = "";


  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.slice(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode.apply(null, chunk);
  }


  return btoa(binary);
}


chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "suggestGeminiResponse") {
    await loadGeminiConfig();

    if (isProcessing) {
      showInPageMessage(tab.id, "Aguarde o processamento anterior finalizar.");
      return;
    }


    if (!geminiConfig.apiKey || geminiConfig.apiKey.length < 5) {
      showInPageMessage(
        tab.id,
        "Erro: Chave da API Gemini não configurada ou inválida. Configure em 'Configurações'."
      );
      return;
    }


    if (!geminiConfig.customPrompt || geminiConfig.customPrompt.trim() === "") {
      showInPageMessage(
        tab.id,
        "Erro: O prompt personalizado da IA não pode estar vazio. Configure em 'Configurações'."
      );
      return;
    }


    if (info.selectionText) {
      const selectedText = info.selectionText;


      isProcessing = true;
      showLoadingMessage(tab.id);
      callGeminiAPI(selectedText, null, tab.id, tab.url);
    } else if (info.srcUrl) {


      isProcessing = true;
      showLoadingMessage(tab.id);
      processImageAnalysis(info.srcUrl, tab.id, tab.url);
    } else {
      showInPageMessage(
        tab.id,
        "Selecione um texto ou clique com o botão direito em uma imagem para analisar."
      );
    }
  }
});


async function processImageAnalysis(imageUrl, tabId, tabUrl) {
  try {


    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 segundos


    const response = await fetch(imageUrl, {
      signal: controller.signal,
      mode: "cors",
      headers: {
        Accept: "image/*",
      },
    });


    clearTimeout(timeoutId);


    if (!response.ok) {
      throw new Error(`Erro HTTP: ${response.status} - ${response.statusText}`);
    }


    const contentType = response.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) {
      throw new Error("O arquivo selecionado não é uma imagem válida.");
    }


    const contentLength = response.headers.get("content-length");
    if (contentLength && parseInt(contentLength) > 10 * 1024 * 1024) {
      // 10MB limite
      throw new Error("Imagem muito grande. Máximo permitido: 10MB");
    }


    const arrayBuffer = await response.arrayBuffer();


    if (arrayBuffer.byteLength === 0) {
      throw new Error("Imagem vazia ou corrompida");
    }




    const base64Data = arrayBufferToBase64(arrayBuffer);




    await callGeminiAPI(
      null,
      { data: base64Data, mimeType: contentType },
      tabId,
      tabUrl
    );
  } catch (error) {
    console.error("Erro ao processar imagem:", error);


    executarComTema({
      target: { tabId: tabId },
      function: () => {
        const loadingDiv = document.getElementById("gemini-suggestion-loading");
        if (loadingDiv) loadingDiv.remove();
      },
    });


    isProcessing = false;


    let errorMessage = "Erro ao processar imagem: ";
    if (error.name === "AbortError") {
      errorMessage += "Timeout (imagem muito grande ou conexão lenta)";
    } else if (error.message.includes("CORS")) {
      errorMessage +=
        "Imagem bloqueada por CORS. Tente salvar e fazer upload da imagem.";
    } else {
      errorMessage += error.message;
    }


    showInPageMessage(tabId, errorMessage);
  }
}


async function callGeminiAPI(textContent, imageData, tabId, tabUrl) {
  const API_URL = geminiEndpoint();


  try {
    const parts = [];


    if (textContent) {
      const promptToSend = `${geminiConfig.customPrompt}\n\n${textContent}`;
      parts.push({ text: promptToSend });
    }


    if (imageData) {
      const promptForImage = `${geminiConfig.customPrompt}\n\nAnalise esta imagem e forneça uma resposta adequada:`;
      parts.push({ text: promptForImage });
      parts.push({
        inline_data: {
          mime_type: imageData.mimeType,
          data: imageData.data,
        },
      });
    }




    const response = await fetch(API_URL, {
      method: "POST",
      headers: geminiHeaders(geminiConfig.apiKey),
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          temperature: geminiConfig.temperature,
          topK: 1,
          topP: 1,
          maxOutputTokens: 4000,
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


    executarComTema({
      target: { tabId: tabId },
      function: () => {
        const loadingDiv = document.getElementById("gemini-suggestion-loading");
        if (loadingDiv) loadingDiv.remove();
      },
    });


    isProcessing = false;


    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error(
        "Erro HTTP ao chamar a API Gemini:",
        response.status,
        errorData
      );


      let errorMessage = `Erro ao obter sugestão da IA: ${errorData.error ? errorData.error.message : response.statusText
        }.`;


      if (errorData.promptFeedback && errorData.promptFeedback.blockReason) {
        errorMessage += ` Motivo do bloqueio: ${errorData.promptFeedback.blockReason}.`;
      } else if (
        errorData.candidates &&
        errorData.candidates[0] &&
        errorData.candidates[0].finishReason === "SAFETY"
      ) {
        errorMessage += ` A resposta foi bloqueada por questões de segurança.`;
      }


      showInPageMessage(tabId, errorMessage);
      return;
    }


    const data = await response.json();


    const suggestedText = data.candidates?.[0]?.content?.parts?.[0]?.text;


    if (suggestedText) {
      executarComTema({
        target: { tabId: tabId },
        function: (suggestion) => {
          const existingDiv = document.getElementById(
            "gemini-suggestion-popup"
          );
          if (existingDiv) existingDiv.remove();


          const overlay = document.createElement("div");
          overlay.id = "gemini-overlay";
          overlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0, 0, 0, 0.5); z-index: 9999;
            animation: fadeIn 0.2s ease-out;
        `;


          const popupDiv = document.createElement("div");
          popupDiv.id = "gemini-suggestion-popup";


          const savedPosition = localStorage.getItem("gemini-popup-position");
          const savedSize = localStorage.getItem("gemini-popup-size");
          const isFixed = localStorage.getItem("gemini-popup-fixed") === "true";


          let initialStyle = `
            position: fixed; background: var(--noc-surface, #ffffff); padding: 0; border-radius: 12px;
            box-shadow: 0 20px 60px rgb(var(--noc-pri-rgb, 46 125 50) / 0.2), 0 0 1px rgba(0, 0, 0, 0.1);
            z-index: 10000; 
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            color: var(--noc-text, #1F2A22);
            display: flex; flex-direction: column;
            resize: both; overflow: hidden;
            min-width: 400px; min-height: 300px;
            max-width: 80vw; max-height: 80vh;
        `;


          if (savedPosition && isFixed) {
            const pos = JSON.parse(savedPosition);
            initialStyle += `top: ${pos.top}px; left: ${pos.left}px;`;
          } else {
            initialStyle += `top: 50%; left: 50%; transform: translate(-50%, -50%);`;
          }


          if (savedSize && isFixed) {
            const size = JSON.parse(savedSize);
            initialStyle += `width: ${size.width}px; height: ${size.height}px;`;
          } else {
            initialStyle += `width: 520px; height: 400px;`;
          }


          if (!isFixed) {
            initialStyle += `animation: modalAppear 0.2s ease-out;`;
          }


          popupDiv.style.cssText = initialStyle;


          popupDiv.innerHTML = `
            <style>
                @keyframes modalAppear {
                    from { opacity: 0; transform: translate(-50%, -50%) scale(0.95); }
                    to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
                }
                @keyframes fadeIn {
                    from { opacity: 0; } to { opacity: 1; }
                }
                
                /* Header arrastável */
                .modal-header {
                    background: linear-gradient(135deg, var(--noc-pri, #2E7D32) 0%, var(--noc-pri2, #1B5E20) 100%);
                    padding: 18px 20px;
                    position: relative;
                    border-radius: 12px 12px 0 0;
                    cursor: move;
                    user-select: none;
                    flex-shrink: 0;
                }
                
                .modal-title {
                    margin: 0 0 4px 0;
                    font-size: 1.15em;
                    color: var(--noc-on-pri, #ffffff);
                    font-weight: 600;
                    letter-spacing: -0.3px;
                }
                
                .modal-subtitle {
                    margin: 0;
                    color: rgba(255, 255, 255, 0.8);
                    font-size: 0.8em;
                    font-weight: 400;
                }
                
                /* Barra de controles */
                .modal-controls {
                    position: absolute;
                    top: 16px;
                    right: 80px;
                    display: flex;
                    gap: 6px;
                }
                
                .control-button {
                    background: rgba(255, 255, 255, 0.2);
                    backdrop-filter: blur(10px);
                    border: none;
                    color: var(--noc-on-pri, #ffffff);
                    padding: 4px 10px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 0.75em;
                    transition: all 0.2s ease;
                    font-weight: 500;
                }
                
                .control-button:hover {
                    background: rgba(255, 255, 255, 0.3);
                    transform: scale(1.05);
                }
                
                .control-button.active {
                    background: rgba(255, 255, 255, 0.4);
                }
                
                /* Conteúdo scrollável */
                .modal-content {
                    padding: 20px;
                    flex: 1;
                    overflow-y: auto;
                    line-height: 1.6;
                    white-space: pre-wrap;
                    font-size: 0.95em;
                    color: var(--noc-text, #1F2A22);
                }
                
                /* Ações fixas */
                .modal-actions {
                    padding: 16px 20px;
                    display: flex;
                    gap: 10px;
                    justify-content: center;
                    border-top: 1px solid var(--noc-border, #E3EBE4);
                    flex-shrink: 0;
                }
                
                .modal-button {
                    padding: 10px 20px;
                    border: none;
                    border-radius: 8px;
                    cursor: pointer;
                    font-size: 0.9em;
                    font-weight: 600;
                    transition: all 0.3s ease;
                    min-width: 100px;
                }
                
                .modal-button-primary {
                    background: linear-gradient(135deg, var(--noc-pri, #2E7D32) 0%, var(--noc-pri2, #1B5E20) 100%);
                    color: var(--noc-on-pri, #ffffff);
                    box-shadow: 0 4px 12px rgb(var(--noc-pri-rgb, 46 125 50) / 0.3);
                }
                
                .modal-button-primary:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 6px 16px rgb(var(--noc-pri-rgb, 46 125 50) / 0.4);
                }
                
                .modal-button-secondary {
                    background: var(--noc-tint, #E8F5E9);
                    color: var(--noc-accent, #2E7D32);
                    border: 2px solid var(--noc-tint, #E8F5E9);
                }
                
                .modal-button-secondary:hover {
                    background: var(--noc-tint2, #C8E6C9);
                    border-color: var(--noc-tint2, #C8E6C9);
                }
                
                /* Botão fechar */
                .modal-close {
                    position: absolute;
                    top: 16px;
                    right: 16px;
                    background: rgba(255, 255, 255, 0.2);
                    backdrop-filter: blur(10px);
                    border: none;
                    width: 30px;
                    height: 30px;
                    border-radius: 6px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s ease;
                    color: var(--noc-on-pri, #ffffff);
                    z-index: 1;
                    font-size: 1.1em;
                }
                
                .modal-close:hover {
                    background: rgba(255, 255, 255, 0.3);
                    transform: scale(1.05);
                }
                
                /* Indicador de redimensionamento */
                .resize-handle {
                    position: absolute;
                    bottom: 0;
                    right: 0;
                    width: 20px;
                    height: 20px;
                    background: linear-gradient(135deg, transparent 0%, var(--noc-border2, #C9D8CB) 50%);
                    cursor: nw-resize;
                    border-bottom-right-radius: 12px;
                }
                
                .resize-handle:hover {
                    background: linear-gradient(135deg, transparent 0%, var(--noc-text2, #9AAD9D) 50%);
                }
                
                /* Indicador de fixado */
                .fixed-indicator {
                    position: absolute;
                    top: 16px;
                    left: 16px;
                    background: rgba(255, 255, 255, 0.2);
                    backdrop-filter: blur(10px);
                    color: var(--noc-on-pri, #ffffff);
                    padding: 4px 8px;
                    border-radius: 6px;
                    font-size: 12px;
                    opacity: 0;
                    transition: opacity 0.2s ease;
                }
                
                .fixed-indicator.show {
                    opacity: 1;
                }
            </style>
            
            <button id="close-popup" class="modal-close">✕</button>
            <div class="fixed-indicator" id="fixed-indicator">📌 Fixado</div>
            
            <div class="modal-header" id="modal-drag-handle">
                <h3 class="modal-title">🤖 Análise Inteligente</h3>
                <p class="modal-subtitle">Resultado gerado por IA</p>
                
                <div class="modal-controls">
                    <button id="pin-button" class="control-button ${isFixed ? "active" : ""}">
                        ${isFixed ? "📌 Fixado" : "📍 Fixar"}
                    </button>
                    <button id="reset-position" class="control-button">
                        🎯 Centralizar
                    </button>
                </div>
            </div>
            
            <div class="modal-content" id="gemini-suggestion-content"></div>
            
            <div class="modal-actions">
                <button id="copy-suggestion" class="modal-button modal-button-primary">
                    📋 Copiar
                </button>
                <button id="close-suggestion" class="modal-button modal-button-secondary">
                    Fechar
                </button>
            </div>
            
            <div class="resize-handle" id="resize-handle"></div>
        `;


          // Texto puro: a resposta da IA pode conter HTML (ex.: prompt injection vindo do chamado)
          popupDiv.querySelector("#gemini-suggestion-content").textContent = suggestion;

          document.body.appendChild(overlay);
          document.body.appendChild(popupDiv);


          function updateFixedIndicator() {
            const indicator = document.getElementById("fixed-indicator");
            const isCurrentlyFixed =
              localStorage.getItem("gemini-popup-fixed") === "true";
            indicator.classList.toggle("show", isCurrentlyFixed);
          }


          function savePosition() {
            const rect = popupDiv.getBoundingClientRect();
            localStorage.setItem(
              "gemini-popup-position",
              JSON.stringify({
                top: rect.top,
                left: rect.left,
              })
            );
            localStorage.setItem(
              "gemini-popup-size",
              JSON.stringify({
                width: rect.width,
                height: rect.height,
              })
            );
          }


          function closePopup() {
            if (localStorage.getItem("gemini-popup-fixed") === "true") {
              savePosition();
            }
            overlay.remove();
            popupDiv.remove();
          }


          overlay.addEventListener("click", closePopup);
          document
            .getElementById("close-popup")
            .addEventListener("click", closePopup);
          document
            .getElementById("close-suggestion")
            .addEventListener("click", closePopup);


          document
            .getElementById("pin-button")
            .addEventListener("click", () => {
              const isCurrentlyFixed =
                localStorage.getItem("gemini-popup-fixed") === "true";
              const newFixedState = !isCurrentlyFixed;


              localStorage.setItem(
                "gemini-popup-fixed",
                newFixedState.toString()
              );


              if (newFixedState) {
                savePosition();
                document.getElementById("pin-button").textContent = "📌 Fixado";
                document.getElementById("pin-button").classList.add("active");
              } else {
                localStorage.removeItem("gemini-popup-position");
                localStorage.removeItem("gemini-popup-size");
                document.getElementById("pin-button").textContent = "📍 Fixar";
                document
                  .getElementById("pin-button")
                  .classList.remove("active");
              }


              updateFixedIndicator();
            });


          document
            .getElementById("reset-position")
            .addEventListener("click", () => {
              popupDiv.style.transition = "all 0.3s ease";
              popupDiv.style.top = "50%";
              popupDiv.style.left = "50%";
              popupDiv.style.transform = "translate(-50%, -50%)";
              popupDiv.style.width = "520px";
              popupDiv.style.height = "400px";


              if (localStorage.getItem("gemini-popup-fixed") === "true") {
                setTimeout(savePosition, 300);
              }
            });


          document
            .getElementById("copy-suggestion")
            .addEventListener("click", () => {
              navigator.clipboard.writeText(suggestion).then(() => {
                const btn = document.getElementById("copy-suggestion");
                btn.innerHTML = "✓ Copiado!";
                btn.style.background = "linear-gradient(135deg, #00875a 0%, #00a86b 100%)";
                btn.style.boxShadow = "0 4px 12px rgba(0, 135, 90, 0.3)";
                setTimeout(() => {
                  btn.innerHTML = "📋 Copiar";
                  btn.style.background = "linear-gradient(135deg, var(--noc-pri, #2E7D32) 0%, var(--noc-pri2, #1B5E20) 100%)";
                  btn.style.boxShadow = "0 4px 12px rgb(var(--noc-pri-rgb, 46 125 50) / 0.3)";
                }, 2500);
              });
            });


          updateFixedIndicator();


          const dragHandle = document.getElementById("modal-drag-handle");
          let isDragging = false;
          let offsetX, offsetY;


          dragHandle.addEventListener("mousedown", (e) => {
            if (
              e.target.closest("#close-popup") ||
              e.target.closest(".control-button")
            )
              return;


            isDragging = true;
            popupDiv.style.transition = "none";
            popupDiv.style.transform = "none";


            const rect = popupDiv.getBoundingClientRect();
            offsetX = e.clientX - rect.left;
            offsetY = e.clientY - rect.top;


            e.preventDefault();
          });


          document.addEventListener("mousemove", (e) => {
            if (!isDragging) return;


            requestAnimationFrame(() => {
              let newX = e.clientX - offsetX;
              let newY = e.clientY - offsetY;


              newX = Math.max(
                0,
                Math.min(newX, window.innerWidth - popupDiv.offsetWidth)
              );
              newY = Math.max(
                0,
                Math.min(newY, window.innerHeight - popupDiv.offsetHeight)
              );


              popupDiv.style.left = newX + "px";
              popupDiv.style.top = newY + "px";
            });
          });


          document.addEventListener("mouseup", () => {
            if (isDragging) {
              isDragging = false;
              popupDiv.style.transition = "all 0.15s ease";


              if (localStorage.getItem("gemini-popup-fixed") === "true") {
                savePosition();
              }
            }
          });


          const resizeHandle = document.getElementById("resize-handle");
          let isResizing = false;
          let startX, startY, startWidth, startHeight;


          resizeHandle.addEventListener("mousedown", (e) => {
            isResizing = true;
            startX = e.clientX;
            startY = e.clientY;
            startWidth = parseInt(
              document.defaultView.getComputedStyle(popupDiv).width,
              10
            );
            startHeight = parseInt(
              document.defaultView.getComputedStyle(popupDiv).height,
              10
            );


            popupDiv.style.transition = "none";
            e.preventDefault();
          });


          document.addEventListener("mousemove", (e) => {
            if (!isResizing) return;


            requestAnimationFrame(() => {
              const newWidth = startWidth + e.clientX - startX;
              const newHeight = startHeight + e.clientY - startY;


              const finalWidth = Math.max(
                400,
                Math.min(newWidth, window.innerWidth * 0.8)
              );
              const finalHeight = Math.max(
                300,
                Math.min(newHeight, window.innerHeight * 0.8)
              );


              popupDiv.style.width = finalWidth + "px";
              popupDiv.style.height = finalHeight + "px";
            });
          });


          document.addEventListener("mouseup", () => {
            if (isResizing) {
              isResizing = false;
              popupDiv.style.transition = "all 0.15s ease";


              if (localStorage.getItem("gemini-popup-fixed") === "true") {
                savePosition();
              }
            }
          });


          if (!isFixed) {
            setTimeout(() => {
              if (document.getElementById("gemini-suggestion-popup")) {
                closePopup();
              }
            }, 60000);
          }
        },
        args: [suggestedText],
      });
    } else {
      showInPageMessage(
        tabId,
        "Não foi possível obter uma sugestão da IA. Tente novamente."
      );
    }
  } catch (error) {
    console.error("Erro na chamada da API Gemini:", error);


    executarComTema({
      target: { tabId: tabId },
      function: () => {
        const loadingDiv = document.getElementById("gemini-suggestion-loading");
        if (loadingDiv) loadingDiv.remove();
      },
    });


    isProcessing = false;


    showInPageMessage(tabId, `Erro de conectividade: ${error.message}`);
  }
}
