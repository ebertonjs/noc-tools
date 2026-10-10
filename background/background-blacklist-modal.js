// =============================================================================
// VERIFICADOR DE IP MODAL - NOC EXTENSION v1.0
// =============================================================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

    if (request.action === 'openIpChecker') {

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {

            const currentTab = tabs[0];

            if (!currentTab || !currentTab.id) {
                sendResponse({
                    success: false,
                    message: 'Nenhuma aba ativa encontrada.'
                });
                return;
            }

            const url = currentTab.url || '';
            const isValidUrl = url.startsWith('http://') || url.startsWith('https://');

            if (!isValidUrl) {
                sendResponse({
                    success: false,
                    message: 'Por favor, abra o verificador em uma página web válida (http:// ou https://). Páginas de extensão e configurações do navegador não são suportadas.'
                });
                return;
            }

            executarComTema(
                {
                    target: { tabId: currentTab.id },
                    files: ['background/background-content-blacklist.js']
                },
                (results) => {
                    if (chrome.runtime.lastError) {
                        console.error('Erro ao injetar o script:', chrome.runtime.lastError.message);
                        sendResponse({
                            success: false,
                            message: `Erro ao abrir o verificador: ${chrome.runtime.lastError.message}`
                        });
                    } else {
                        sendResponse({
                            success: true,
                            message: 'Verificador de IP aberto na página!'
                        });
                    }
                }
            );
        });

        return true;
    }

});
