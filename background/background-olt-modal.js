// =============================================================================
// BACKGROUND-OLT-MODAL.JS - NOC EXTENSION v2.0 (MODERNIZADO)
// =============================================================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'openOltAnalyzer') {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const currentTab = tabs[0];

            if (!currentTab || !currentTab.id) {
                sendResponse({
                    success: false,
                    message: 'Nenhuma aba ativa encontrada.'
                });
                return;
            }

            executarComTema(
                {
                    target: { tabId: currentTab.id },
                    files: ['background/background-content-olt.js']
                },
                (results) => {
                    if (chrome.runtime.lastError) {
                        console.error('Erro ao injetar o script:', chrome.runtime.lastError.message);
                        sendResponse({
                            success: false,
                            message: `Erro ao abrir o analisador: ${chrome.runtime.lastError.message}`
                        });
                    } else {
                        sendResponse({
                            success: true,
                            message: 'Analisador de OLT aberto na página!'
                        });
                    }
                }
            );
        });

        return true;
    }
});
