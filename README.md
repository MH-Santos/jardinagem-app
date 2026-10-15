# Jardim-app V7.0

Aplicação pessoal (PWA) para gerir trabalhos de jardinagem: calendário, picagem de ponto, orçamentos, pagamentos, custos e equipamentos. Funciona no browser, sem servidor e sem serviços pagos. Os dados ficam guardados apenas no dispositivo.

## Atualizar no GitHub Pages
1. Na versão atual da app, faça um backup (botão de nuvem no topo ou Mais › Definições › Fazer backup agora).
2. No repositório: **Add file › Upload files** e arraste todos os ficheiros desta pasta, substituindo os existentes:
   `index.html`, `styles.css`, `app.js`, `sw.js`, `manifest.webmanifest`, `icon.svg`, `icon-180.png`, `icon-192.png`, `icon-512.png`, `README.md`.
3. **Commit changes**. Espere 1–2 minutos.
4. Abra a app, feche-a e volte a abrir. A versão aparece no topo (Jardim-app V7.0). Os dados das versões anteriores são convertidos automaticamente.
5. No iPhone, para o novo ícone aparecer, remova o atalho do ecrã principal e volte a adicioná-lo (Safari › Partilhar › Adicionar ao ecrã principal). Os dados mantêm-se.

## Novidades da V7
**Segurança dos dados**
- Fotografias passam para IndexedDB (muito mais espaço); o JSON principal fica pequeno.
- Se os dados guardados não puderem ser lidos, a app bloqueia gravações e permite descarregá-los, em vez de os apagar.
- Versões de orçamentos guardadas sem duplicar fotografias (o tamanho já não cresce a cada edição).
- Restaurar backup descarrega primeiro uma cópia dos dados atuais.
- Backup inclui fotografias; no telemóvel abre a folha de partilha (Ficheiros, iCloud Drive, OneDrive, Google Drive). Lembrete configurável (mínimo 30 dias).

**Calendário e picagem de ponto**
- Seletor de datas próprio em formato calendário; datas sempre dd/mm/aaaa e horas 24 h em qualquer dispositivo.
- Vista dia/semana/mês ajustada ao ecrã; blocos alinhados com as horas (06:00–22:00); fora do horário a cinzento.
- Partes não concluídas de dias anteriores aparecem tracejadas no dia de hoje.
- Iniciar / Pausar / Concluir por parte; só um trabalho ativo de cada vez; barra fixa com o tempo a decorrer.
- Início com hora real no passado; correção e registo manual de horas; aviso de sessão esquecida.
- Ao iniciar fora da hora agendada, o trabalho é reposicionado no calendário.
- Reagendar com motivo obrigatório, opção de mover as partes seguintes, e acrescentar partes.

**Trabalhos, preços e orçamentos**
- Horas estimadas repartidas automaticamente pelas partes; o fim acompanha o início.
- Preço/hora e preço mínimo pré-preenchidos, com confirmação se forem alterados.
- Séries periódicas calculadas a partir da primeira data (o dia 31 passa ao último dia dos meses curtos), com período do acordo (3 meses, 6 meses, 1 ano, 2 anos) e "Renovar série".
- Orçamentos com número AAAA/NNN (recomeça a cada ano), versões, estados (Rascunho, Enviado, Aceite, Recusado, Convertido, Expirado) e fotografias.
- Conversão de orçamento usa o mesmo formulário do trabalho; materiais passam a custos imputados (só na 1.ª ocorrência, salvo indicação).

**Dinheiro**
- Pagamento total ou parcial a partir do trabalho (valor pré-preenchido) ou por cliente, distribuído pelos trabalhos mais antigos.
- Custos com categoria, associação a cliente/trabalho/equipamento e opção "imputar ao cliente" com margem.
- Pagamentos e custos podem ser editados e eliminados.
- Valores em dívida contam só trabalhos iniciados ou concluídos; cancelados não contam.
- Painel com resultado (ganhos − custos reais), semana atual (agendado vs livre), pagos/parciais/por pagar, previsto vs realizado, evolução e análise de preço fixo (€/h real).

**Documentos**
- Orçamento, nota de serviços (campos e fotografias à escolha) e extrato mensal do cliente.
- Abrem dentro da app; a impressão / gravação em PDF é sempre manual.

**Equipamentos**
- Fotografias da fatura, garantia, tarefas de manutenção periódicas com avisos, histórico e custos.

**Exportação**
- CSV de trabalhos, pagamentos, custos e clientes (separador ";", datas dd/mm/aaaa, compatível com Excel).

## Validação necessária no iPhone
- Instalar no ecrã principal e confirmar: teclado não tapa os botões de gravar; backup abre "Guardar em Ficheiros"; "Imprimir / Guardar PDF" mostra o documento com logótipo e fotografias.
- Fazer um backup logo após a primeira abertura da V7.

## Limitações
- Sem sincronização entre dispositivos: para mudar de telemóvel, use backup e restauro.
- Os documentos não são faturas e não comunicam com a AT.
