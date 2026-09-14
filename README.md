# Gestão de Jardinagem — V2

PWA local-first para gestão pessoal de trabalhos de jardinagem. Não usa servidor, base de dados externa nem serviços pagos.

## Incluído nesta versão
- Clientes com número sequencial (C0001, C0002...); edição e eliminação com confirmação.
- Trabalhos com número sequencial (#0001, #0002...), múltiplos serviços e múltiplas partes/agendamentos.
- Horário de funcionamento configurável, com 06:00–22:00 fixo no calendário e horas fora do horário assinaladas a cinzento.
- Preços à hora/fixos predefinidos, preço mínimo e margem sobre materiais.
- Calendário diário, semanal e mensal; sobreposições lado a lado.
- Início/pausa/retoma/terminar sessão/concluir trabalho, com uma única sessão ativa de cada vez.
- Reagendamento com motivo obrigatório e histórico.
- Custos gerais, por cliente ou por trabalho; margem aplicada aos materiais imputados ao cliente.
- Pagamentos totais/parciais e forma de pagamento.
- Orçamentos com serviços, horas, periodicidade, materiais, PDF e conversão em trabalho.
- Relatório de trabalhos realizados em PDF com seleção de campos e fotografias.
- Logo da empresa em PNG/JPG.
- Backup JSON, restauração, lembrete mínimo de 30 dias e exportação CSV.
- Funcionamento local/offline e PWA.

## GitHub Pages
1. Criar um repositório no GitHub (por exemplo `jardinagem-app`).
2. Colocar **todos os ficheiros desta pasta na raiz do repositório**.
3. GitHub → **Settings → Pages**.
4. Em **Build and deployment**, escolher **Deploy from a branch**.
5. Branch `main` e pasta `/ (root)` → Save.
6. Abrir o endereço GitHub Pages apresentado pelo GitHub.
7. No iPhone, abrir no Safari e usar **Partilhar → Adicionar ao ecrã principal**.

## Dados
Os dados ficam no armazenamento local do navegador/dispositivo. O GitHub aloja apenas os ficheiros da aplicação. Fazer backups JSON regularmente.

## Atualização
Substituir no GitHub os ficheiros `index.html`, `styles.css`, `app.js`, `README.md`, `manifest.webmanifest`, `sw.js` e `icon.svg` pelos ficheiros desta versão. Depois de atualizar, no iPhone pode ser necessário fechar/reabrir a PWA ou atualizar a página para o novo código ser carregado.
