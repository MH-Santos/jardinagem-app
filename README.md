# Jardim-app V6.3

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

## V6.2 — ajustes desta iteração
- Versão visível no cabeçalho da aplicação.
- Orçamentos integrados no separador Trabalhos, com sub-separador próprio; removido o acesso redundante em Mais.
- Numeração de orçamentos automática por ano civil: novo ano inicia em /001.
- Contadores de partes, ocorrências e intervalos inteiros com setas +/− onde faz sentido.
- Recorrências calculadas sempre a partir da primeira data/hora, com pré-visualização das ocorrências.
- Calendário identifica explicitamente a parte de cada trabalho.
- Cada parte possui estado e sessão independentes; custos e horas permanecem agregados ao trabalho.
- É possível registar um início real anterior à hora atual.
- Interface deixa de apresentar “Pausar”; “Terminar sessão” encerra a sessão.


## V6.3 — uniformização de datas, horas e utilização
- Datas apresentadas transversalmente como `dd/mm/aaaa`.
- Horas apresentadas transversalmente em formato de 24 horas (`HH:mm`), evitando os seletores AM/PM nativos do dispositivo.
- Partes de trabalhos e de conversões de orçamentos distribuem automaticamente as horas estimadas pelo número de partes; a hora de fim é calculada a partir da hora de início e pode ser alterada manualmente.
- Vista Calendário: escala horária alinhada com o início de cada hora; uma marcação 09:00–10:00 ocupa exatamente o intervalo entre as linhas 09:00 e 10:00.
- Vista Calendário: botão separado `Converter orçamento`, encaminhando diretamente para o separador Orçamentos.
- Geração de documentos: deixou de abrir automaticamente a janela de impressão. O documento abre primeiro com as imagens carregadas; a impressão passa a ser uma ação manual.
- Rodapé dos modais preparado para permanecer acessível acima do teclado em ecrãs pequenos.
- Cache PWA atualizada para V6.3.

## Nota sobre PC, Android e iPhone
A lógica funcional e o formato apresentado pela aplicação são agora uniformizados. A adaptação visual ao tamanho do ecrã continua a existir por razões de usabilidade, mas não deve alterar regras, cálculos, datas ou horas. A validação final em iPhone continua necessária, sobretudo para teclado, PWA e partilha de documentos.
