# NOC TOOLS

Extensão do Chrome (Manifest V3) com ferramentas para o dia a dia do NOC.

## Ferramentas

- **Relatório HubSoft**: lê o Fluxo de Atendimentos e monta um relatório dos chamados por categoria.
- **Analisador de OLT**: interpreta logs Huawei e ZTE (ONUs offline, motivo e data).
- **Extrator de Alertas**: agrupa os alertas da página por POP.
- **Verificador de IP**: IP público, geolocalização e reputação (IPsum, Spamhaus, Barracuda, RDAP e IA).
- **Analisar com IA**: menu de contexto que usa o Gemini para sugerir respostas a partir de um texto ou imagem.
- **Alertas Externos**: recebe os alertas do ABR Monitor pelo Alert Server.
- **Temas**: Eco (padrão), Eco Escuro e outros; as janelas nas páginas seguem o tema escolhido.

## Instalação

1. Baixe ou clone este repositório.
2. Abra `chrome://extensions` e ative o **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e selecione a pasta do projeto.

Depois de atualizar os arquivos, clique no ⟳ da extensão em `chrome://extensions`.

## Configuração

Tudo fica na aba **Configurações** do popup:

- **Chave da API Gemini**: usada pela IA, pelo Verificador de IP e pelo Analisador de OLT.
- **Chave do Alert Server**: obrigatória para receber os Alertas Externos.

As chaves ficam salvas só no navegador (`chrome.storage.local`) e não fazem parte do código.

## Estrutura

```
manifest.json            Manifesto da extensão
popup.html / .css / .js  Interface do popup
popup-alert-server.js    Aba de Alertas Externos
background/              Service worker e ferramentas injetadas nas páginas
  service-worker.js      Ponto de entrada (importScripts)
  background-tema.js     Cores dos temas aplicadas nas janelas
changelog/changelog.txt  Histórico de versões (exibido ao atualizar)
icons/                   Ícones
```

## Versões

Veja o [changelog](changelog/changelog.txt). Cada versão é marcada com uma tag (`v0.3.7`, ...).

---

Desenvolvido por Edinho Silva.
