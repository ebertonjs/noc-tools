// =============================================================================
// BACKGROUND-STICKY-NOTES.JS - NOC TOOLS v1.1
// Handler + reinjeção automática em todas as abas
// =============================================================================

const STICKY_ACTIVE_KEY = 'noc_sticky_notes_active';

// ─── Injetar em uma aba específica ────────────────────────────────────────────
function injectStickyNotes(tabId, callback) {
    executarComTema(
        { target: { tabId }, files: ['background/background-content-sticky-notes.js'] },
        (results) => {
            if (callback) callback(!chrome.runtime.lastError);
        }
    );
}

function isValidUrl(url) {
    return url && (url.startsWith('http://') || url.startsWith('https://'));
}

// ─── Quando usuário clica em "Abrir Sticky Notes" no popup ───────────────────
// Injeta em TODAS as abas já abertas (http/https), não só na ativa.
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action !== 'openStickyNotes') return;

    chrome.tabs.query({}, (tabs) => {
        const targets = (tabs || []).filter((t) => t?.id && isValidUrl(t.url));

        if (targets.length === 0) {
            sendResponse({ success: false, message: 'Nenhuma aba web (http/https) encontrada.' });
            return;
        }

        // Salvar estado ativo + injetar em cada aba
        chrome.storage.local.set({ [STICKY_ACTIVE_KEY]: true }, () => {
            let pending = targets.length;
            let okCount = 0;

            targets.forEach((tab) => {
                injectStickyNotes(tab.id, (ok) => {
                    if (ok) okCount++;
                    pending--;
                    if (pending === 0) {
                        sendResponse(okCount > 0
                            ? { success: true,  message: `Sticky Notes abertas em ${okCount} aba(s)!` }
                            : { success: false, message: 'Erro ao abrir as notas.' }
                        );
                    }
                });
            });
        });
    });

    return true;
});

// ─── Reinjetar ao trocar de aba ───────────────────────────────────────────────
chrome.tabs.onActivated.addListener(({ tabId }) => {
    chrome.storage.local.get(STICKY_ACTIVE_KEY, (data) => {
        if (!data[STICKY_ACTIVE_KEY]) return;
        chrome.tabs.get(tabId, (tab) => {
            if (chrome.runtime.lastError || !isValidUrl(tab?.url)) return;
            injectStickyNotes(tabId);
        });
    });
});

// ─── Reinjetar quando uma aba termina de carregar ────────────────────────────
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status !== 'complete') return;
    chrome.storage.local.get(STICKY_ACTIVE_KEY, (data) => {
        if (!data[STICKY_ACTIVE_KEY]) return;
        if (!isValidUrl(tab?.url)) return;
        injectStickyNotes(tabId);
    });
});
