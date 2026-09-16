# Jardim-app V6

Aplicação local-first para gestão pessoal de trabalhos de jardinagem.

## V6 — principais alterações
- Persistência mais segura: validação da estrutura carregada e tratamento de erros de `localStorage`.
- Mantida a chave de dados existente `jardinagem-v1-data` para preservar os dados das versões anteriores.
- Trabalhos: edição, cancelamento mantendo o histórico e eliminação individual de fotografias.
- Reagendamento: permite escolher uma parte específica ou, explicitamente, reagendar todas as partes.
- Preços: separação mais clara entre preço/hora, valor estimado e preço fixo.
- Orçamentos: conversão para trabalho através de modal do Jardim-app, com definição das partes e suporte a séries periódicas.
- Materiais dos orçamentos são transferidos para o trabalho como valores de materiais orçamentados.
- Fotografias de orçamentos podem ser removidas individualmente.
- Eliminação de clientes bloqueada quando existem dependências em trabalhos, orçamentos, custos ou pagamentos.
- Lembrete de backup não abre sobre formulários/modais ativos.
- Branding PWA atualizado para Jardim-app e cache do Service Worker para V6.
- Ajustes de utilização em iPhone e `dvh` nos modais.

## Limitações / validação necessária
- A aplicação continua a usar `localStorage`; não foi feita migração automática para IndexedDB.
- Fotografias continuam comprimidas e guardadas localmente. Deve ser feito teste real no iPhone com várias fotografias.
- PDF, exportação JSON/CSV, teclado e comportamento do PWA devem ser validados no iPhone.

## Atualização
Antes de substituir os ficheiros no GitHub Pages, fazer um backup JSON dentro do Jardim-app.
