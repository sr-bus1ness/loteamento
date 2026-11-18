# Gestão de Loteamentos — Esperança I e II

Sistema web responsivo (computador, tablet e celular Android/iOS, instalável como app) para administrar os
loteamentos **Esperança I** e **Esperança II** (Esperança/PB) da Futura Empreendimentos Imobiliários Ltda.

## Origem dos dados

Toda a estrutura de quadras e lotes foi extraída das plantas oficiais fornecidas (AG Topografia e Arquitetura):

| Loteamento | Planta | Quadras | Lotes | Área comercializável |
|---|---|---|---|---|
| Esperança I | Prancha 04/06, Rev. 02 (04/11/2013), 1:1000 | A–O (15) | 398 | 70.059,70 m² |
| Esperança II | Prancha 03/05 (21/05/2014), 1:1000 | A–K (11) | 361 | 59.318,50 m² |

- O contorno de cada lote no mapa é o desenho vetorial da própria planta (não é uma grade inventada).
- Número e área de cada lote foram lidos da planta. A soma das áreas e a quantidade de lotes **conferem quadra a quadra**
  com os quadros "Detalhamento das Quadras" das duas plantas.
- Na Esperança I o quadro de áreas cita 386 lotes; o detalhamento por quadra soma 398 (inclui a Quadra O, acrescentada
  na revisão 02). O sistema usa **398**.
- As ruas do mapa (`data/mapa.json`) foram extraídas das faixas cinza das plantas com `tools/extracao/ruas.py`.
- Os preços vêm das tabelas "TABELA ATUALIZADA 2026" (Esperança 1 de 13/01/2026 e Esperança 2 de 12/01/2026) e estão em
  `data/precos.json`. Plano: entrada de 5% + 200 parcelas; valor total = 200 × parcela. Quando a observação da tabela
  citava um lote diferente da cor da célula, valeu a cor (E1: C-04, H-21, M-19, M-26; E2: C-34 no grupo roxo).
- Os scripts usados na extração estão em `tools/extracao/` (Python: PyMuPDF, OpenCV, RapidOCR, Shapely).

## Funcionalidades (versão de consulta para o corretor, pensada para tablet)

- **Mapa** em fundo escuro, só com ruas, quadras e a letra de cada quadra. Toque numa quadra para aproximar; toque num
  lote para ver área, valor total, entrada e parcelas; toque fora do lote fecha os dados; toque fora de novo volta à
  visão geral. Também dá para arrastar e usar dois dedos para zoom. Cores: verde (disponível), amarelo (reservado),
  vermelho (vendido), cinza (indisponível = fora da tabela de preços).
- O **administrador** pode mudar o status de um lote no próprio painel do lote (ou voltar ao padrão da tabela).
- **Histórico** de todas as alterações (quem, quando, o quê).
- **Configurações**: dados e logomarca da empresa, usuários e níveis de acesso, backup/restauração em JSON.

### Atualizar a tabela de preços

Edite `data/precos.json`: em cada quadra, `lotes` são os lotes à venda, `parcela` é o valor padrão e `excecoes` são os
lotes com outra parcela (e `entrada` quando a entrada é um valor fixo). Lotes que não aparecem ficam Indisponíveis.

## 1. Configurar o Firebase (plano gratuito Spark)

1. Acesse <https://console.firebase.google.com> → **Adicionar projeto** (Google Analytics é opcional).
2. **Build → Authentication → Começar → E-mail/senha → Ativar**.
3. **Build → Realtime Database → Criar banco de dados** (local: `us-central1`), iniciar em **modo bloqueado**.
4. Na aba **Regras** do Realtime Database, apague o conteúdo e cole o arquivo `database.rules.json` → **Publicar**.
5. **Configurações do projeto (engrenagem) → Seus apps → Web (`</>`)** → registre o app e copie o objeto `firebaseConfig`
   para `js/firebase-config.js` (inclua o `databaseURL`).
6. Abra o sistema e clique em **Criar conta**. **A primeira conta criada vira Administrador** e os 759 lotes das plantas
   são importados automaticamente.
7. Demais usuários criam conta e ficam como *Pendente* até o administrador liberar em **Configurações → Usuários**
   (Administrador, Operador ou Somente leitura).

Enquanto `apiKey` estiver vazio, o sistema roda em **modo local** (dados só no navegador) para testes.

Níveis de acesso (garantidos pelas regras do banco, não só pela tela):

| | Ver | Vender, receber, status, cadastrar | Excluir, cancelar venda, estornar, usuários, empresa, restaurar backup |
|---|---|---|---|
| Somente leitura | ✔ | | |
| Operador | ✔ | ✔ | |
| Administrador | ✔ | ✔ | ✔ |

## 2. Publicar com GitHub

1. Crie um repositório no GitHub (ex.: `gestao-loteamentos`).
2. Envie esta pasta (com Git, GitHub Desktop ou "Add file → Upload files" no site):
   ```bash
   git init
   git add .
   git commit -m "Sistema de gestão dos loteamentos Esperança I e II"
   git branch -M main
   git remote add origin https://github.com/SEU_USUARIO/gestao-loteamentos.git
   git push -u origin main
   ```
3. No repositório: **Settings → Pages → Source: Deploy from a branch → `main` / `(root)`**. O endereço será
   `https://SEU_USUARIO.github.io/gestao-loteamentos/`.
4. No Firebase: **Authentication → Configurações → Domínios autorizados → Adicionar** `SEU_USUARIO.github.io`.
5. No celular, abra o endereço e use **Adicionar à tela inicial** (Android/Chrome e iOS/Safari) para instalar como app.

Alternativa: Firebase Hosting (requer Node.js): `npm i -g firebase-tools`, `firebase login`, `firebase init` (usar o
`firebase.json` existente) e `firebase deploy`. Isso também publica as regras do banco.

## Estrutura do código

```
index.html               casca da aplicação (login + layout)
css/app.css              estilos (responsivo; cores de status em :root)
js/firebase-config.js    credenciais do projeto Firebase
js/store.js              acesso a dados: Firebase (Auth + Realtime Database) ou modo local
js/state.js              estado sincronizado e permissões
js/ops.js                alteração de status com gravação atômica + histórico
js/precos.js             preços da tabela e status efetivo de cada lote
js/views/*.js            telas: mapa, historico, config
data/loteamentos.json    lotes extraídos das plantas (quadra, número, área, contorno no mapa)
data/mapa.json           ruas e contorno/letra de cada quadra
data/precos.json         tabelas de preço 2026
img/esperanca*.jpg       plantas renderizadas (usadas só pelos scripts de extração)
database.rules.json      regras de segurança do Realtime Database
tools/extracao/          scripts usados para extrair os dados das plantas
```

### Modelo de dados (Realtime Database)

```
usuarios/{uid}           nome, email, papel (admin|operador|leitura|pendente|bloqueado)
lotes/{E1-A-01}          emp, quadra, numero, area, status, valorTotal, entrada, numParcelas, valorParcela,
                         vendaId, compradorId, reserva{compradorId,validade,obs}, motivoBloqueio, obs
compradores/{id}         nome, cpf, rg, telefone, email, endereco, obs
vendas/{id}              loteId, compradorId, data, valorTotal, entrada, numParcelas, valorParcela, primeiroVenc, status
parcelas/{vendaId}/{n}   n (0 = entrada), venc, valor, pago, pagoEm, valorPago, pagamentoId
pagamentos/{id}          vendaId, parcela, valor, data, forma, obs, estornado
historico/{id}           ts, usuario, tipo, desc, loteId, vendaId, compradorId
config/empresa           nome, cnpj, cidade, telefone, logo
```

Para incluir um novo loteamento com mapa, gere um novo bloco em `data/loteamentos.json` (os scripts de
`tools/extracao/` servem de modelo) e adicione a imagem da planta em `img/`.

## Testar localmente

```bash
python -m http.server 8765
```
e abra <http://localhost:8765>.
