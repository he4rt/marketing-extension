# ADR 0001: Coleta de dados sociais via extensão Chrome, Playwright e OpenClaw

## Status

Aceito.

## Contexto

O Heart Hub precisa ingerir dados de redes sociais para enriquecer perfis de membros da comunidade He4rt Developers e habilitar funcionalidades como:

- score social e reputação;
- gamificação por ações sociais;
- classificação de conteúdo;
- detecção de interesses;
- recomendações de tecnologias, trilhas, eventos e conexões;
- timeline unificada de atividade;
- dashboard de analytics social;
- matchmaking e sugestões de networking.

No caso do Instagram, o objetivo ideal seria entender interações de membros comuns da comunidade, como curtidas, comentários, follows, menções e outros sinais comportamentais. A pesquisa técnica indicou que a API oficial da Meta não oferece um fluxo amplo e confiável para obter o histórico geral de posts curtidos, consumidos ou comentados por usuários comuns em qualquer perfil do Instagram, mesmo com consentimento via OAuth.

A API oficial é útil principalmente para dados da própria conta autenticada, especialmente contas Business/Creator, e para ativos sob controle da conta conectada: posts próprios, comentários em posts próprios, métricas, insights, mensagens e menções de acordo com escopos aprovados. Ela não resolve bem o caso central de gamificação e recomendação baseado em interações de membros comuns em múltiplas redes.

Já existe neste repositório uma extensão Chrome para X/Twitter que intercepta respostas GraphQL no navegador, consolida payloads e exporta JSON estruturado. O mesmo padrão pode ser generalizado para Instagram e futuras redes sociais.

Após refinamento da estratégia, a automação não será composta apenas por OpenClaw + extensão. A coleta recorrente deverá ser dividida em camadas:

- **extensão Chrome** para captura, estado local, exportação e normalização inicial;
- **Playwright** para navegação determinística, execução de fluxos repetíveis e operação da UI interna da extensão;
- **OpenClaw** para diagnóstico, investigação, correções de código, pull requests e alertas quando a automação determinística falhar;
- **infraestrutura gerenciada** em VM ou provedor terceiro para executar o navegador com perfil persistente, extensão instalada, logs e agendamentos.

## Decisão

A abordagem principal para coleta social será um **pipeline em camadas usando extensão Chrome + Playwright + OpenClaw em infraestrutura gerenciada**.

A extensão Chrome será responsável por capturar dados observáveis durante navegação autenticada em redes sociais suportadas. Playwright será responsável por executar os fluxos previsíveis de navegação e por controlar a interface interna da extensão. OpenClaw será responsável pela camada inteligente de operação: identificar falhas não previstas, propor soluções, alterar código, rodar validações, abrir pull requests e disparar alertas.

Para Instagram, a extensão deverá capturar respostas de rede, payloads de APIs internas e/ou dados visíveis na interface enquanto uma conta operacional da He4rt navega por superfícies relevantes, como:

- perfil oficial da comunidade;
- posts e reels da comunidade;
- listas de curtidas quando visíveis;
- comentários e respostas;
- perfis públicos de membros;
- seguidores/seguindo quando necessário e permitido operacionalmente;
- campanhas, hashtags e menções públicas;
- outras superfícies públicas ou visíveis à conta operacional.

Playwright será responsável por:

- abrir o Chrome com a extensão instalada;
- executar rotinas periódicas de navegação e captura;
- acionar fluxos de scroll, abertura de modais e páginas relevantes;
- abrir diretamente páginas internas da extensão, como `chrome-extension://<extension_id>/popup.html` ou uma futura `automation.html`;
- preencher campos, clicar botões, consultar status e disparar exportações da extensão;
- encerrar cada execução de forma controlada.

OpenClaw será responsável por:

- detectar falhas inesperadas;
- gerar logs, capturas de tela e evidências de execução;
- atualizar o código da extensão quando mudanças de UI/payload quebrarem a coleta;
- atualizar scripts Playwright quando fluxos determinísticos quebrarem;
- rodar validações locais;
- criar commits, pushes e pull requests com correções;
- disparar alertas por email quando houver erro fora do esperado.

A infraestrutura gerenciada será responsável por:

- hospedar o navegador e o perfil persistente usado pela automação;
- manter a extensão instalada;
- executar jobs em horários específicos, sem polling contínuo;
- armazenar logs, capturas de tela e artefatos de execuções;
- isolar credenciais e sessões em ambiente controlado;
- reiniciar processos e expor métricas operacionais.

A API oficial da Meta será mantida como **método complementar e alternativo** para os dados que ela conseguir entregar de forma estável e autorizada. Sempre que um dado puder ser coletado tanto pela extensão quanto pela API oficial, o sistema deverá registrar a origem e permitir comparação, reconciliação e preferência configurável por fonte.

## Alternativas Consideradas

### 1. Meta API oficial como método principal

Vantagens:

- maior aderência a políticas oficiais da plataforma;
- OAuth, escopos e consentimento formalizados;
- melhor estabilidade para dados suportados;
- menor risco operacional de bloqueio por automação;
- dados de insights oficiais para contas Business/Creator.

Limitações:

- não expõe histórico geral de curtidas, consumo ou comentários de usuários comuns em qualquer post;
- exige contas Business/Creator para muitos fluxos;
- depende de App Review, escopos aprovados e mudanças de política da Meta;
- não resolve bem gamificação de membros comuns baseada em ações fora dos ativos da He4rt;
- webhooks não entregam uma stream global de atividade do usuário.

Conclusão: será usada como fallback/complemento, mas não atende ao objetivo principal de coleta padronizada multi-rede.

### 2. Provedores pagos de dados sociais

Vantagens:

- reduzem esforço de OAuth, token refresh, rate limit e App Review;
- podem oferecer schema unificado cross-platform;
- podem acelerar integrações com Instagram, TikTok, YouTube, LinkedIn e outras redes.

Limitações:

- custo recorrente e possível lock-in;
- cobertura real precisa ser validada por provider;
- podem não entregar interações individuais específicas necessárias para gamificação;
- nem sempre há transparência suficiente sobre origem, frescor e qualidade dos dados.

Conclusão: podem ser avaliados como benchmark ou fallback futuro, mas não serão a base inicial.

### 3. Importação manual de dados exportados pelo usuário

Vantagens:

- consentimento explícito;
- pode conter histórico que APIs não entregam;
- útil para onboarding ou reprocessamento histórico.

Limitações:

- exige ação manual do usuário;
- formato pode mudar;
- experiência ruim para uso frequente;
- pode conter dados sensíveis demais;
- não atende ao objetivo de coleta automática.

Conclusão: descartada neste momento.

### 4. Extensão instalada pelo usuário comum

Vantagens:

- poderia capturar interações pessoais do próprio membro no navegador;
- melhora o consentimento direto para dados comportamentais individuais;
- permitiria sinais mais ricos para recomendações, como posts curtidos, páginas visitadas e comentários feitos pelo próprio usuário;
- reduz a necessidade de uma conta operacional central observar tudo.

Limitações:

- UX de instalação é mais pesada;
- coleta é limitada ao navegador desktop e ao período em que a extensão estiver ativa;
- não cobre uso mobile, que é dominante no Instagram;
- aumenta sensibilidade de privacidade;
- exige controles fortes de transparência, minimização, pausa, exclusão e auditoria;
- pode ser percebida como invasiva se não for extremamente clara.

Conclusão: fica documentada como possibilidade futura opt-in, mas não será obrigatória nem método principal no início.

### 5. Extensão interna + OpenClaw como coletor principal

Vantagens:

- funciona de forma semelhante em múltiplas redes sociais;
- permite capturar dados não disponíveis em APIs oficiais;
- reduz dependência de App Review e escopos específicos;
- pode ser operada com contas internas/moderadoras, sem exigir instalação por todo membro;
- permite automação periódica com batching diário;
- permite adaptação rápida quando payloads mudarem;
- encaixa com o modelo já testado para X/Twitter neste repositório;
- é adequada para uso interno, pesquisa, enriquecimento e gamificação sobre ativos públicos/observáveis da comunidade.

Limitações:

- fragilidade contra mudanças de UI, endpoints e payloads;
- risco operacional de bloqueio por automação;
- maior responsabilidade de compliance, retenção e transparência;
- exige monitoramento e manutenção contínuos;
- não deve coletar credenciais, cookies, tokens ou dados privados fora do escopo operacional;
- precisa de governança para evitar coleta excessiva.

Conclusão: a extensão continua sendo o mecanismo principal de captura e OpenClaw continua essencial para operação inteligente, mas OpenClaw não deve ser o executor primário do caminho feliz de coleta. Fluxos repetíveis serão executados por Playwright para reduzir custo, variabilidade e risco operacional.

### 6. Extensão interna + Playwright + OpenClaw em infraestrutura gerenciada

Vantagens:

- separa coleta determinística de investigação inteligente;
- reduz custo de tokens e latência no caminho feliz;
- torna os fluxos recorrentes mais previsíveis e testáveis;
- permite operar a extensão sem depender do menu nativo de extensões do Chrome;
- permite abrir diretamente páginas internas da extensão por `chrome-extension://...`;
- facilita execução apenas em janelas de horário definidas;
- permite usar OpenClaw somente quando houver erro, queda de qualidade ou mudança de payload/UI;
- melhora observabilidade por meio de logs, capturas de tela, traces e artefatos de execução;
- encaixa melhor em provedores gerenciados ou VMs dedicadas com perfil persistente.

Limitações:

- exige manter scripts Playwright além da extensão;
- exige provisionamento e hardening da VM/provedor;
- exige estratégia de sessão persistente e recuperação de login/challenge;
- pode ter limitações dependendo do provedor escolhido para extensões Chrome, perfil persistente e navegador com interface visual;
- ainda mantém os riscos de automação contra plataformas externas.

Conclusão: escolhida como arquitetura final deste ADR. A extensão captura; Playwright opera os fluxos previsíveis; OpenClaw mantém e corrige o pipeline; a infraestrutura gerenciada executa em horários programados.

## Considerações De Compliance E Privacidade

Mesmo sendo um projeto open source, os dados sociais coletados podem envolver pessoas identificáveis. Portanto:

- a coleta deve priorizar dados públicos, visíveis ou relacionados a ativos oficiais da He4rt;
- eventos normalizados devem armazenar somente o necessário para o produto;
- raw payloads devem ter retenção limitada, classificação de sensibilidade e acesso restrito;
- credenciais, cookies, tokens e sessões nunca devem ser expostos em payloads, logs, commits ou exports públicos;
- membros devem poder entender quais dados podem ser usados para reputação e recomendações;
- deve existir mecanismo de opt-out, contestação e remoção de associação entre username social e usuário Heart Hub;
- dados de não membros devem ser minimizados, agregados, anonimizados ou descartados quando não houver finalidade clara;
- fontes de dados devem ser registradas em cada evento: `extension`, `openclaw`, `meta_api`, `manual_review`, `provider`, etc.;
- cada evento deve carregar metadados de confiança, captura e rastreabilidade.

Este ADR não substitui revisão jurídica. Antes de expor dados pessoais publicamente ou usar os dados para decisões relevantes sobre usuários, o projeto deve revisar LGPD/GDPR, termos das plataformas e política de privacidade do Heart Hub.

## Transparência E Dados Abertos

Como o Heart Hub é um projeto open source, a coleta deve buscar confiança por transparência.

Sempre que possível, os dados coletados e processados devem ficar disponíveis para consulta pública ou autenticada pelos usuários, respeitando privacidade e segurança. Isso significa:

- disponibilizar dashboards ou endpoints para que qualquer usuário consulte os eventos que geraram pontuação;
- explicar de onde cada evento veio e quando foi capturado;
- indicar se a fonte foi oficial ou experimental;
- mostrar o nível de confiança do evento;
- permitir auditoria comunitária sobre regras de pontuação;
- publicar schemas, transformações e regras de scoring no repositório;
- não publicar raw payloads sensíveis sem sanitização;
- não publicar dados que exponham sessões, identificadores privados ou informações não necessárias.

Um formato recomendado para eventos públicos:

```json
{
  "provider": "instagram",
  "event_type": "post_liked",
  "actor_username": "membro",
  "target_type": "community_post",
  "target_public_url": "https://www.instagram.com/p/...",
  "source": "openclaw_extension",
  "confidence": "medium",
  "captured_at": "2026-05-20T12:00:00Z",
  "scoring_rule": "instagram_like_on_community_post_v1"
}
```

Payloads brutos completos devem ser tratados como material de auditoria interna, não como dado aberto por padrão.

## Estratégia De Sincronização

O modelo inicial será batch/polling diário, executado em horários específicos. A automação não deve ficar fazendo polling contínuo durante o dia.

Fluxo recomendado:

1. Um agendador da VM/provedor dispara o job no horário definido.
2. Playwright inicia ou conecta em um Chrome/Chromium com perfil persistente e extensão instalada.
3. Playwright abre a UI interna da extensão por URL `chrome-extension://...` para configurar targets, limpar estado ou consultar status.
4. Playwright navega por posts, reels, perfis, campanhas e superfícies configuradas.
5. A extensão captura payloads e snapshots estruturados.
6. Playwright aciona exportação ou aguarda envio automático dos dados ao Heart Hub.
7. O Heart Hub persiste o raw payload em tabela de integração.
8. Jobs assíncronos normalizam eventos sociais.
9. Regras de scoring geram pontos e reputação.
10. Painéis e endpoints públicos exibem eventos auditáveis e pontuação.
11. Validadores pós-run verificam volume, schema, freshness e erros esperados.
12. Se houver falha não prevista, OpenClaw é acionado para triagem, correção, PR e alerta.

Exemplos de janelas:

- coleta diária geral às 06:00 em `America/Sao_Paulo`;
- reconciliação diária às 18:00;
- execuções extras durante campanhas, com orçamento limitado;
- execução sob demanda quando moderadores criarem campanhas novas.

Cada run deve ter limites explícitos:

- duração máxima;
- número máximo de posts;
- número máximo de perfis;
- número máximo de scrolls;
- número máximo de modais abertos;
- política de backoff para login challenge, captcha, bloqueios e erros de rede.

Para quase tempo real, o projeto poderá:

- aumentar a frequência de execução;
- usar webhooks oficiais quando disponíveis;
- executar Playwright por campanhas ativas;
- acionar OpenClaw apenas em caso de anomalia, quebra de fluxo ou necessidade de adaptação;
- monitorar posts recentes com prioridade maior.

Tradeoff: quanto mais próximo de tempo real, maior o risco de bloqueio, custo operacional e instabilidade. O padrão inicial deve ser diário.

## Uso Complementar Da Meta API Oficial

A integração oficial da Meta deve ser implementada quando trouxer dados mais confiáveis ou estáveis que a extensão.

Casos prováveis:

- dados do perfil profissional da He4rt;
- posts e reels próprios;
- comentários em mídia própria;
- insights agregados;
- menções;
- mensagens, se escopo for aprovado;
- reconciliação de métricas capturadas por extensão;
- verificação de divergências.

Quando a Meta API e a extensão coletarem o mesmo dado, o Heart Hub deve:

- armazenar ambos os raw payloads;
- normalizar para o mesmo tipo de evento;
- registrar fonte e versão;
- preferir a fonte oficial para métricas agregadas quando confiável;
- usar a extensão para listas de atores e sinais que a API não entrega;
- permitir reprocessamento futuro caso a política de fonte mude.

## Possibilidade Futura: Extensão Para Usuários Comuns

Uma versão opt-in da extensão poderá ser criada para membros comuns da comunidade.

Objetivo:

- coletar interações pessoais do próprio membro;
- melhorar recomendações de tecnologias e aprendizados;
- enriquecer perfil com interesses reais;
- permitir que o membro audite exatamente o que foi enviado.

Requisitos mínimos:

- consentimento explícito e granular;
- botão de pausa;
- modo privado;
- preview local antes de envio;
- exclusão de histórico;
- allowlist de domínios e tipos de evento;
- não coletar mensagens privadas por padrão;
- não coletar credenciais, cookies ou tokens;
- envio assinado e versionado para o Heart Hub;
- código open source e auditável.

Essa versão deve ser tratada como produto separado da extensão interna operada por OpenClaw, pois os riscos de privacidade e UX são diferentes.

## Consequências

### Positivas

- Padroniza a coleta social entre redes diferentes.
- Permite capturar sinais que APIs oficiais não entregam.
- Aproveita a experiência já adquirida com X/Twitter.
- Permite automação determinística com Playwright e manutenção inteligente por OpenClaw.
- Dá flexibilidade para evoluir rapidamente conforme necessidades de produto.
- Mantém a Meta API disponível para dados oficiais e reconciliação.
- Reduz custo e variabilidade ao não usar agente LLM no caminho feliz da coleta.
- Viabiliza execução em horários específicos sem manter polling contínuo.

### Negativas

- A coleta fica mais sensível a mudanças de frontend e payloads privados.
- A operação exige observabilidade e alertas fortes.
- Há maior risco de compliance e bloqueio operacional.
- O sistema precisa distinguir claramente dado público, dado interno, raw payload e evento normalizado.
- A confiabilidade dos eventos pode variar por rede, superfície e método de captura.
- A stack passa a incluir extensão, scripts Playwright, OpenClaw e infraestrutura gerenciada.
- Sessões persistentes, desafios de login e fingerprints de navegador passam a ser riscos operacionais explícitos.

## Diretrizes De Implementação

- Toda integração deve persistir raw payload antes de transformar.
- Todo evento normalizado deve registrar origem, versão do analisador, confiança e data de captura.
- A extensão deve evitar qualquer coleta de segredo ou sessão.
- A automação deve operar com contas dedicadas da comunidade, não contas pessoais de moderadores.
- Playwright deve ser o executor padrão dos fluxos repetíveis de coleta.
- A extensão deve expor uma UI ou página interna própria para automação, como `automation.html`, além do popup humano.
- A automação não deve depender do menu nativo de extensões do Chrome; deve abrir páginas internas por `chrome-extension://<extension_id>/...`.
- OpenClaw deve ser acionado para triagem, correções, PRs e alertas, não para cada clique do caminho feliz.
- A infraestrutura gerenciada deve usar perfil persistente, isolamento de secrets, logs e limites de execução.
- Alterações automáticas feitas por agentes devem passar por pull request.
- Falhas de captura devem gerar alertas e anexar evidências suficientes para debug.
- Regras de scoring devem ser versionadas e auditáveis.
- Dados públicos devem ser derivados de eventos normalizados e sanitizados, não de raw payloads.
- A Meta API oficial deve ser usada sempre que for mais estável, autorizada e suficiente para o mesmo dado.
