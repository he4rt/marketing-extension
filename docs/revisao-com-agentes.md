# Revisão de Código com Agentes

Este documento descreve como usar agentes de IA para revisar mudanças nesta extensão sem substituir a revisão humana. A ideia é transformar agentes em uma primeira camada de triagem: eles devem encontrar riscos, inconsistências, lacunas de teste e problemas de manutenção antes de uma pessoa aprovar a PR.

## Objetivos

- Revisar mudanças com foco em bugs, regressões de captura, segurança, privacidade, arquitetura por provider e compatibilidade com Manifest V3.
- Produzir comentários acionáveis, com referência a arquivos/linhas, severidade e sugestão objetiva de correção.

## Escopo Esperado

- Validar alterações em captura, normalização, persistência, exportação, popup, manifest, testes, scripts e documentação.
- Conferir se mudanças específicas de um provider não vazam comportamento para outros providers.

## Comandos Obrigatórios

Antes de pedir revisão por agente, rode localmente:

```sh
mise exec -- bun install --frozen-lockfile
mise exec -- bun run typecheck
mise exec -- bun test
mise exec -- bun run build
mise exec -- bun run validate
```

Na PR, a pipeline `Validar extensão` deve executar uma validação equivalente em GitHub Actions.

## Checklist de Revisão

- Verifique se o contrato genérico de exportação continua consistente: `publications`, `comments_by_publication`, `engagements_by_publication`, `raw_payloads`, `summary` e `tracked_profiles`.
- Verifique se payload bruto e dados normalizados preservam `provider`, identificadores estáveis, `captured_at` e informação suficiente para auditoria/reprocessamento.
- Verifique se parsers específicos de Instagram e X permanecem isolados em seus providers e se regras compartilhadas ficam em módulos compartilhados.
- Verifique se o popup usa linguagem genérica em português brasileiro e não reintroduz termos acoplados a uma rede social específica.
- Verifique se alterações de storage/contexto não misturam dados entre providers, abas, handles ou sessões de página.
- Verifique se drift detection registra problemas de formato sem bloquear a captura quando houver fallback seguro.
- Verifique se dados pessoais coletados são necessários para o objetivo da extensão e aparecem de forma transparente no export.
- Verifique se testes cobrem deduplicação, reprocessamento, comentários, respostas, filtros, troca de provider e exportação.

## Padrão de Comentários

Comentários de revisão devem seguir este formato:

```md
[P1] Título curto do problema

Arquivo/linha: `src/...`

Impacto: descreva a falha prática para usuário, pipeline ou ingestão.

Correção sugerida: explique a menor mudança segura para corrigir.
```

Use severidades:

- `P0`: quebra crítica, perda de dados grave, vazamento sensível ou extensão inutilizável.
- `P1`: bug real, regressão de captura/exportação, falha de validação ou arquitetura que bloqueia evolução próxima.
- `P2`: risco moderado, teste ausente relevante, inconsistência de UX ou manutenção.
- `P3`: nit, clareza, documentação ou melhoria não bloqueante.

## Prompt Recomendado

Use este prompt ao pedir revisão para um agente:

```md
Revise esta PR como code review. Priorize bugs, riscos de regressão, isolamento entre providers, privacidade, consistência do export JSON, Manifest V3, testes faltantes e decisões arquiteturais que dificultem futuras integrações. Não comente estilo superficial. Para cada achado, inclua severidade P0-P3, arquivo/linha, impacto e correção sugerida. Se não houver achados bloqueantes, diga isso explicitamente e liste riscos residuais.
```

## Padrões do Projeto

- A extensão deve funcionar com captura passiva: ela observa dados já carregados pela sessão do navegador e não executa ações de mutação nas redes sociais.
- Cada provider deve ter parser, detecção e heurísticas próprias; o pipeline compartilhado deve cuidar de deduplicação, armazenamento, exportação e diagnóstico genérico.
- O export deve priorizar dados normalizados para ingestão no Heart Hub, mantendo `raw_payloads` como trilha de auditoria e reprocessamento.
- O projeto deve evitar dependências externas desnecessárias; Bun, TypeScript, Biome e APIs nativas do Chrome são a base preferencial.

## Automação Recomendada

- GitHub Actions deve ficar responsável por validação determinística: typecheck, testes, build, validação do manifest e pacote da extensão.
- Agentes devem atuar como revisão semântica e arquitetural, revisando o diff e os testes, mas não devem ser o único critério de aprovação.
- Bots de revisão por IA, como CodeRabbit, podem ser habilitados no repositório público se a organização permitir; a decisão deve considerar ruído, privacidade, custo e aderência aos padrões deste documento.

## Limitações

- Agentes podem não reproduzir o comportamento real de Instagram/X sem sessão autenticada e extensão carregada no Chrome.
- Revisões automáticas podem gerar falsos positivos; comentários devem ser triados por uma pessoa antes de bloquear merge.
- Mudanças em DOM ou APIs internas das redes sociais podem exigir validação manual com export JSON real.

