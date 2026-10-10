// =============================================================================
// BACKGROUND-OLT.JS - NOC EXTENSION v2.0 (MODERNIZADO)
// =============================================================================

(function () {

    if (window.oltAnalyzerInitialized) {
        const modal = document.getElementById('olt-analyzer-modal');
        if (modal) {
            modal.style.display = 'block';
        }
        return;
    }

    window.oltAnalyzerInitialized = true;

    function createModal() {
        let modal = document.getElementById('olt-analyzer-modal');
        if (modal) {
            modal.style.display = 'block';
            return;
        }

        modal = document.createElement('div');
        modal.id = 'olt-analyzer-modal';
        modal.style.position = 'fixed';
        modal.style.top = '20px';
        modal.style.left = '20px';
        modal.style.width = '480px';
        modal.style.maxWidth = 'calc(100vw - 40px)';
        modal.style.maxHeight = 'calc(100vh - 40px)';
        modal.style.backgroundColor = 'var(--noc-surface, #ffffff)';
        modal.style.boxShadow = '0 20px 60px rgb(var(--noc-pri-rgb, 46 125 50) / 0.2), 0 0 1px rgba(0, 0, 0, 0.1)';
        modal.style.borderRadius = '12px';
        modal.style.padding = '0';
        modal.style.zIndex = '10000';
        modal.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
        modal.style.display = 'flex';
        modal.style.flexDirection = 'column';
        modal.style.overflow = 'hidden';
        modal.style.border = 'none';

        const header = document.createElement('div');
        header.style.background = 'linear-gradient(135deg, var(--noc-pri, #2E7D32) 0%, var(--noc-pri2, #1B5E20) 100%)';
        header.style.padding = '18px 20px';
        header.style.position = 'relative';
        header.style.borderRadius = '12px 12px 0 0';

        const title = document.createElement('h2');
        title.innerHTML = '🔍 Analisador OLT';
        title.style.margin = '0';
        title.style.fontSize = '1.15em';
        title.style.color = 'var(--noc-on-pri, #ffffff)';
        title.style.fontWeight = '600';
        title.style.letterSpacing = '-0.3px';
        header.appendChild(title);

        const subtitle = document.createElement('p');
        subtitle.textContent = 'Logs Huawei & ZTE';
        subtitle.style.margin = '4px 0 0 0';
        subtitle.style.fontSize = '0.8em';
        subtitle.style.color = 'rgba(255, 255, 255, 0.8)';
        subtitle.style.fontWeight = '400';
        header.appendChild(subtitle);

        const headerButtons = document.createElement('div');
        headerButtons.style.position = 'absolute';
        headerButtons.style.top = '16px';
        headerButtons.style.right = '16px';
        headerButtons.style.display = 'flex';
        headerButtons.style.gap = '6px';

        const resetButton = document.createElement('button');
        resetButton.innerHTML = '🔄';
        resetButton.title = 'Resetar tudo';
        resetButton.style.background = 'rgba(255, 255, 255, 0.2)';
        resetButton.style.backdropFilter = 'blur(10px)';
        resetButton.style.border = 'none';
        resetButton.style.fontSize = '1em';
        resetButton.style.cursor = 'pointer';
        resetButton.style.color = 'var(--noc-on-pri, #ffffff)';
        resetButton.style.width = '30px';
        resetButton.style.height = '30px';
        resetButton.style.borderRadius = '6px';
        resetButton.style.display = 'flex';
        resetButton.style.alignItems = 'center';
        resetButton.style.justifyContent = 'center';
        resetButton.style.fontWeight = '300';
        resetButton.style.transition = 'all 0.2s ease';
        resetButton.addEventListener('mouseenter', () => {
            resetButton.style.background = 'rgba(255, 255, 255, 0.3)';
            resetButton.style.transform = 'scale(1.05) rotate(180deg)';
        });
        resetButton.addEventListener('mouseleave', () => {
            resetButton.style.background = 'rgba(255, 255, 255, 0.2)';
            resetButton.style.transform = 'scale(1) rotate(0deg)';
        });
        resetButton.addEventListener('click', () => resetAnalyzer());
        headerButtons.appendChild(resetButton);

        const closeButton = document.createElement('button');
        closeButton.innerHTML = '✕';
        closeButton.title = 'Fechar';
        closeButton.style.background = 'rgba(255, 255, 255, 0.2)';
        closeButton.style.backdropFilter = 'blur(10px)';
        closeButton.style.border = 'none';
        closeButton.style.fontSize = '1.1em';
        closeButton.style.cursor = 'pointer';
        closeButton.style.color = 'var(--noc-on-pri, #ffffff)';
        closeButton.style.width = '30px';
        closeButton.style.height = '30px';
        closeButton.style.borderRadius = '6px';
        closeButton.style.display = 'flex';
        closeButton.style.alignItems = 'center';
        closeButton.style.justifyContent = 'center';
        closeButton.style.fontWeight = '300';
        closeButton.style.transition = 'all 0.2s ease';
        closeButton.addEventListener('mouseenter', () => {
            closeButton.style.background = 'rgba(255, 255, 255, 0.3)';
            closeButton.style.transform = 'scale(1.05)';
        });
        closeButton.addEventListener('mouseleave', () => {
            closeButton.style.background = 'rgba(255, 255, 255, 0.2)';
            closeButton.style.transform = 'scale(1)';
        });
        closeButton.addEventListener('click', () => {
            modal.style.display = 'none';
        });
        headerButtons.appendChild(closeButton);

        header.appendChild(headerButtons);
        modal.appendChild(header);

        const body = document.createElement('div');
        body.style.padding = '20px';
        body.style.overflowY = 'auto';
        body.style.maxHeight = 'calc(100vh - 140px)';
        const inputLabel = document.createElement('label');
        inputLabel.textContent = 'Cole o Log da OLT';
        inputLabel.style.display = 'block';
        inputLabel.style.marginBottom = '8px';
        inputLabel.style.fontWeight = '600';
        inputLabel.style.color = 'var(--noc-text, #17231A)';
        inputLabel.style.fontSize = '0.8em';
        inputLabel.style.textTransform = 'uppercase';
        inputLabel.style.letterSpacing = '0.5px';
        body.appendChild(inputLabel);

        const logInput = document.createElement('textarea');
        logInput.id = 'olt-log-input';
        logInput.rows = 5;
        logInput.placeholder = 'Cole aqui o log da OLT...';
        logInput.style.width = '100%';
        logInput.style.padding = '10px';
        logInput.style.border = '2px solid var(--noc-border, #E3EBE4)';
        logInput.style.borderRadius = '8px';
        logInput.style.fontFamily = '"JetBrains Mono", "Fira Code", Consolas, Monaco, monospace';
        logInput.style.fontSize = '12px';
        logInput.style.marginBottom = '16px';
        logInput.style.resize = 'vertical';
        logInput.style.backgroundColor = 'var(--noc-surface2, #F4F8F4)';
        logInput.style.color = 'var(--noc-text, #1F2A22)';
        logInput.style.transition = 'all 0.2s ease';
        logInput.style.outline = 'none';
        logInput.style.boxSizing = 'border-box';
        logInput.addEventListener('focus', () => {
            logInput.style.borderColor = 'var(--noc-pri, #2E7D32)';
            logInput.style.backgroundColor = 'var(--noc-surface, #ffffff)';
            logInput.style.boxShadow = '0 0 0 3px rgb(var(--noc-pri-rgb, 46 125 50) / 0.1)';
        });
        logInput.addEventListener('blur', () => {
            logInput.style.borderColor = 'var(--noc-border, #E3EBE4)';
            logInput.style.backgroundColor = 'var(--noc-surface2, #F4F8F4)';
            logInput.style.boxShadow = 'none';
        });
        body.appendChild(logInput);

        const filterSection = document.createElement('div');
        filterSection.style.marginBottom = '16px';
        filterSection.style.padding = '12px';
        filterSection.style.backgroundColor = 'var(--noc-surface2, #F4F8F4)';
        filterSection.style.borderRadius = '8px';
        filterSection.style.border = '1px solid var(--noc-border, #E3EBE4)';

        const dateLabel = document.createElement('label');
        dateLabel.textContent = 'Filtro de Data';
        dateLabel.style.display = 'block';
        dateLabel.style.marginBottom = '8px';
        dateLabel.style.fontWeight = '600';
        dateLabel.style.color = 'var(--noc-text, #17231A)';
        dateLabel.style.fontSize = '0.8em';
        dateLabel.style.textTransform = 'uppercase';
        dateLabel.style.letterSpacing = '0.5px';
        filterSection.appendChild(dateLabel);

        const dateInput = document.createElement('input');
        dateInput.type = 'date';
        dateInput.id = 'olt-filter-date';
        dateInput.style.padding = '8px 10px';
        dateInput.style.border = '2px solid var(--noc-border, #E3EBE4)';
        dateInput.style.borderRadius = '6px';
        dateInput.style.width = '100%';
        dateInput.style.backgroundColor = 'var(--noc-surface, #ffffff)';
        dateInput.style.color = 'var(--noc-text, #1F2A22)';
        dateInput.style.fontSize = '13px';
        dateInput.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        dateInput.style.transition = 'all 0.2s ease';
        dateInput.style.outline = 'none';
        dateInput.style.boxSizing = 'border-box';
        dateInput.addEventListener('focus', () => {
            dateInput.style.borderColor = 'var(--noc-pri, #2E7D32)';
            dateInput.style.boxShadow = '0 0 0 3px rgb(var(--noc-pri-rgb, 46 125 50) / 0.1)';
        });
        dateInput.addEventListener('blur', () => {
            dateInput.style.borderColor = 'var(--noc-border, #E3EBE4)';
            dateInput.style.boxShadow = 'none';
        });

        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        dateInput.value = `${year}-${month}-${day}`;

        filterSection.appendChild(dateInput);
        body.appendChild(filterSection);

        const buttonContainer = document.createElement('div');
        buttonContainer.style.display = 'grid';
        buttonContainer.style.gridTemplateColumns = '1fr 1fr';
        buttonContainer.style.gap = '10px';
        buttonContainer.style.marginBottom = '16px';

        const analyzeButton = document.createElement('button');
        analyzeButton.innerHTML = '📊 Analisar';
        analyzeButton.style.padding = '10px 16px';
        analyzeButton.style.background = 'linear-gradient(135deg, var(--noc-pri, #2E7D32) 0%, var(--noc-pri2, #1B5E20) 100%)';
        analyzeButton.style.color = 'var(--noc-on-pri, #ffffff)';
        analyzeButton.style.border = 'none';
        analyzeButton.style.borderRadius = '8px';
        analyzeButton.style.cursor = 'pointer';
        analyzeButton.style.fontWeight = '600';
        analyzeButton.style.fontSize = '13px';
        analyzeButton.style.transition = 'all 0.3s ease';
        analyzeButton.style.boxShadow = '0 4px 12px rgb(var(--noc-pri-rgb, 46 125 50) / 0.3)';
        analyzeButton.addEventListener('mouseenter', () => {
            analyzeButton.style.transform = 'translateY(-2px)';
            analyzeButton.style.boxShadow = '0 6px 16px rgb(var(--noc-pri-rgb, 46 125 50) / 0.4)';
        });
        analyzeButton.addEventListener('mouseleave', () => {
            analyzeButton.style.transform = 'translateY(0)';
            analyzeButton.style.boxShadow = '0 4px 12px rgb(var(--noc-pri-rgb, 46 125 50) / 0.3)';
        });
        analyzeButton.addEventListener('click', () => analyzeLog(false));
        buttonContainer.appendChild(analyzeButton);

        const filterButton = document.createElement('button');
        filterButton.innerHTML = '📅 Por Data';
        filterButton.style.padding = '10px 16px';
        filterButton.style.background = 'linear-gradient(135deg, var(--noc-pri3, #43A047) 0%, var(--noc-pri, #2E7D32) 100%)';
        filterButton.style.color = 'var(--noc-on-pri, #ffffff)';
        filterButton.style.border = 'none';
        filterButton.style.borderRadius = '8px';
        filterButton.style.cursor = 'pointer';
        filterButton.style.fontWeight = '600';
        filterButton.style.fontSize = '13px';
        filterButton.style.transition = 'all 0.3s ease';
        filterButton.style.boxShadow = '0 4px 12px rgb(var(--noc-pri-rgb, 46 125 50) / 0.3)';
        filterButton.addEventListener('mouseenter', () => {
            filterButton.style.transform = 'translateY(-2px)';
            filterButton.style.boxShadow = '0 6px 16px rgb(var(--noc-pri-rgb, 46 125 50) / 0.4)';
        });
        filterButton.addEventListener('mouseleave', () => {
            filterButton.style.transform = 'translateY(0)';
            filterButton.style.boxShadow = '0 4px 12px rgb(var(--noc-pri-rgb, 46 125 50) / 0.3)';
        });
        filterButton.addEventListener('click', () => analyzeLog(true));
        buttonContainer.appendChild(filterButton);

        body.appendChild(buttonContainer);

        const resultArea = document.createElement('pre');
        resultArea.id = 'olt-result-area';
        resultArea.style.width = '100%';
        resultArea.style.maxHeight = '280px';
        resultArea.style.overflowY = 'auto';
        resultArea.style.padding = '12px';
        resultArea.style.border = '2px solid var(--noc-border, #E3EBE4)';
        resultArea.style.borderRadius = '8px';
        resultArea.style.backgroundColor = 'var(--noc-surface, #ffffff)';
        resultArea.style.color = 'var(--noc-text, #1F2A22)';
        resultArea.style.fontFamily = '"JetBrains Mono", "Fira Code", Consolas, Monaco, monospace';
        resultArea.style.fontSize = '12px';
        resultArea.style.marginBottom = '10px';
        resultArea.style.display = 'none';
        resultArea.style.whiteSpace = 'pre-wrap';
        resultArea.style.lineHeight = '1.5';
        resultArea.style.boxShadow = 'inset 0 2px 4px rgba(0, 0, 0, 0.05)';
        resultArea.style.boxSizing = 'border-box';
        body.appendChild(resultArea);

        const copyButton = document.createElement('button');
        copyButton.id = 'olt-copy-button';
        copyButton.innerHTML = '📋 Copiar';
        copyButton.style.padding = '10px 16px';
        copyButton.style.background = 'linear-gradient(135deg, var(--noc-pri, #2E7D32) 0%, var(--noc-pri2, #1B5E20) 100%)';
        copyButton.style.color = 'var(--noc-on-pri, #ffffff)';
        copyButton.style.border = 'none';
        copyButton.style.borderRadius = '8px';
        copyButton.style.cursor = 'pointer';
        copyButton.style.width = '100%';
        copyButton.style.display = 'none';
        copyButton.style.fontWeight = '600';
        copyButton.style.fontSize = '13px';
        copyButton.style.transition = 'all 0.3s ease';
        copyButton.style.boxShadow = '0 4px 12px rgb(var(--noc-pri-rgb, 46 125 50) / 0.3)';
        copyButton.addEventListener('mouseenter', () => {
            if (copyButton.innerHTML === '📋 Copiar') {
                copyButton.style.transform = 'translateY(-2px)';
                copyButton.style.boxShadow = '0 6px 16px rgb(var(--noc-pri-rgb, 46 125 50) / 0.4)';
            }
        });
        copyButton.addEventListener('mouseleave', () => {
            if (copyButton.innerHTML === '📋 Copiar') {
                copyButton.style.transform = 'translateY(0)';
                copyButton.style.boxShadow = '0 4px 12px rgb(var(--noc-pri-rgb, 46 125 50) / 0.3)';
            }
        });
        copyButton.addEventListener('click', () => {
            const result = document.getElementById('olt-result-area');
            if (result && result.textContent) {
                navigator.clipboard.writeText(result.textContent).then(() => {
                    copyButton.innerHTML = '✓ Copiado!';
                    copyButton.style.background = 'linear-gradient(135deg, var(--noc-pri2, #1B5E20) 0%, var(--noc-pri, #2E7D32) 100%)';
                    copyButton.style.boxShadow = '0 4px 12px rgba(0, 135, 90, 0.3)';
                    setTimeout(() => {
                        copyButton.innerHTML = '📋 Copiar';
                        copyButton.style.background = 'linear-gradient(135deg, var(--noc-pri, #2E7D32) 0%, var(--noc-pri2, #1B5E20) 100%)';
                        copyButton.style.boxShadow = '0 4px 12px rgb(var(--noc-pri-rgb, 46 125 50) / 0.3)';
                    }, 2500);
                }).catch(err => {
                    console.error('Erro ao copiar:', err);
                    copyButton.innerHTML = '❌ Erro';
                    setTimeout(() => {
                        copyButton.innerHTML = '📋 Copiar';
                    }, 2000);
                });
            }
        });
        body.appendChild(copyButton);

        modal.appendChild(body);
        document.body.appendChild(modal);
    }

    function resetAnalyzer() {
        const logInput = document.getElementById('olt-log-input');
        const dateInput = document.getElementById('olt-filter-date');
        const resultArea = document.getElementById('olt-result-area');
        const copyButton = document.getElementById('olt-copy-button');

        if (logInput) {
            logInput.value = '';
            logInput.style.borderColor = 'var(--noc-border, #E3EBE4)';
            logInput.style.backgroundColor = 'var(--noc-surface2, #F4F8F4)';
            logInput.style.boxShadow = 'none';
        }

        if (dateInput) {
            const today = new Date();
            const year = today.getFullYear();
            const month = String(today.getMonth() + 1).padStart(2, '0');
            const day = String(today.getDate()).padStart(2, '0');
            dateInput.value = `${year}-${month}-${day}`;
            dateInput.style.borderColor = 'var(--noc-border, #E3EBE4)';
            dateInput.style.boxShadow = 'none';
        }

        if (resultArea) {
            resultArea.textContent = '';
            resultArea.style.display = 'none';
            resultArea.style.borderColor = 'var(--noc-border, #E3EBE4)';
            resultArea.style.backgroundColor = 'var(--noc-surface, #ffffff)';
        }

        if (copyButton) {
            copyButton.style.display = 'none';
            copyButton.innerHTML = '📋 Copiar';
            copyButton.style.background = 'linear-gradient(135deg, var(--noc-pri, #2E7D32) 0%, var(--noc-pri2, #1B5E20) 100%)';
            copyButton.style.boxShadow = '0 4px 12px rgb(var(--noc-pri-rgb, 46 125 50) / 0.3)';
        }

        if (logInput) {
            logInput.focus();
        }
    }
    async function analyzeLog(useFilter) {
        const logInput = document.getElementById('olt-log-input');
        const dateInput = document.getElementById('olt-filter-date');
        const resultArea = document.getElementById('olt-result-area');
        const copyButton = document.getElementById('olt-copy-button');

        const logText = logInput.value.trim();

        if (!logText) {
            resultArea.textContent = '⚠️ Por favor, cole o log da OLT antes de analisar.';
            resultArea.style.display = 'block';
            resultArea.style.borderColor = '#fc8181';
            resultArea.style.backgroundColor = '#fff5f5';
            copyButton.style.display = 'none';
            return;
        }

        resultArea.textContent = '⏳ Analisando log...';
        resultArea.style.display = 'block';
        resultArea.style.borderColor = 'var(--noc-border, #E3EBE4)';
        resultArea.style.backgroundColor = 'var(--noc-surface, #ffffff)';
        copyButton.style.display = 'none';

        try {
            const response = await chrome.runtime.sendMessage({
                action: 'analyzeOltLog',
                logText: logText,
                filterDate: useFilter ? dateInput.value : null,
                enhanceWithAI: true
            });

            if (response && response.success) {
                const resultData = response.result;

                if (resultData.enhancedOutput) {
                    resultArea.textContent = resultData.enhancedOutput;
                } else {
                    let formattedOutput = '';

                    if (useFilter && resultData.dispositivos) {
                        const filteredResults = resultData.dispositivos;
                        if (filteredResults.length > 0) {
                            formattedOutput = `${'ID'.padEnd(4)} ${'ESTADO ATUAL'.padEnd(15)} ${'DATA'.padEnd(20)} MOTIVO\n`;
                            filteredResults.forEach(item => {
                                formattedOutput += `${item.id.padEnd(4)} ${item.status.padEnd(15)} ${item.offline.padEnd(20)} ${item.cause || '-'}\n`;
                            });
                            formattedOutput += `\nTotal Offline: ${filteredResults.length}`;
                        } else {
                            formattedOutput = 'Nenhuma ONU ficou offline na data selecionada.';
                        }
                    } else {
                        if (resultData.caiuHoje && resultData.caiuHoje.length > 0) {
                            formattedOutput = '--- CAIU NA DATA DE HOJE ---\n';
                            formattedOutput += `${'ID'.padEnd(4)} ${'ESTADO ATUAL'.padEnd(15)} ${'DATA'.padEnd(20)} MOTIVO\n`;
                            resultData.caiuHoje.forEach(item => {
                                formattedOutput += `${item.id.padEnd(4)} ${item.status.padEnd(15)} ${item.offline.padEnd(20)} ${item.cause || '-'}\n`;
                            });
                            formattedOutput += `\nTotal de clientes Offline: ${resultData.caiuHoje.length}\n`;
                        }

                        if (resultData.aindaOffline && resultData.aindaOffline.length > 0) {
                            if (formattedOutput) formattedOutput += '\n';
                            formattedOutput += '--- AINDA ESTÃO OFFLINE ---\n';
                            formattedOutput += `${'ID'.padEnd(4)} ${'ESTADO ATUAL'.padEnd(15)} ${'DATA'.padEnd(20)} MOTIVO\n`;
                            resultData.aindaOffline.forEach(item => {
                                formattedOutput += `${item.id.padEnd(4)} ${item.status.padEnd(15)} ${(item.offline || '-').padEnd(20)} ${item.cause || '-'}\n`;
                            });
                            formattedOutput += `\ntotal: ${resultData.aindaOffline.length}`;
                        }

                        if (!formattedOutput.trim()) {
                            formattedOutput = 'Nenhum log de OLT encontrado que corresponda aos critérios de hoje ou que ainda esteja offline.';
                        }
                    }

                    resultArea.textContent = formattedOutput;
                }

                resultArea.style.borderColor = '#48bb78';
                resultArea.style.backgroundColor = '#f0fff4';
                copyButton.style.display = 'block';
            } else {
                resultArea.textContent = `❌ Erro na análise: ${response?.message || 'Erro desconhecido'}`;
                resultArea.style.borderColor = '#fc8181';
                resultArea.style.backgroundColor = '#fff5f5';
                copyButton.style.display = 'none';
            }
        } catch (error) {
            resultArea.textContent = `❌ Erro: ${error.message}`;
            resultArea.style.borderColor = '#fc8181';
            resultArea.style.backgroundColor = '#fff5f5';
            copyButton.style.display = 'none';
        }
    }

    createModal();

})();
