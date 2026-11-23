# Multiplayer (Fase 11)

## Como jogar

1. Uma pessoa abre o app **Sala** e cria uma sala. Aparece um código (por exemplo `S7K2Q`).
2. As outras abrem o mesmo jogo, vão em **Sala → Entrar com código** e digitam o código.
3. Cada uma escolhe o papel: **Streamer** ou **Desenvolvedor** (dá para trocar a qualquer momento).
4. Cada pessoa continua com o próprio computador, dinheiro, equipe e canal (o próprio perfil). A sala junta: jogos, versões, conversa, logs, contratos, recompensas por bug, chefes mundiais, duelos e ranking.

## As três conexões

| Conexão | Quando | Como funciona |
| --- | --- | --- |
| Salas do Claude | o jogo aberto pelo link do Claude | salas ao vivo do Claude e o banco de dados do Claude (último estado da sala). Quem entra precisa abrir o jogo pelo link compartilhado. |
| Servidor (Render) | o jogo aberto pelo endereço do servidor | WebSocket em `/ws`; o servidor repassa as mensagens e guarda o último estado |
| Este navegador | aberto como arquivo | abas do mesmo navegador (BroadcastChannel); bom para testar sozinho |

O jogo escolhe sozinho; dá para trocar na hora de criar ou entrar.

## Publicar o servidor no Render

O servidor está em `server/` e não tem dependências (Node 18 ou mais novo).

1. Rode `python3 tools/build.py`: o jogo é copiado para `server/public/index.html`.
2. Suba o projeto para um repositório no GitHub.
3. No Render: **New → Blueprint** e aponte para o repositório (usa o `render.yaml` da raiz). Ou **New → Web Service** com *Root directory* `server`, *Build command* vazio e *Start command* `node server.js`.
4. Abra o endereço que o Render der (por exemplo `https://digital-life-simulator.onrender.com`). O jogo abre e a sala usa o servidor automaticamente.

Rodar no seu computador: `cd server && node server.js` e abra `http://localhost:10000`.

Rotas: `/` (jogo), `/saude` (verificação), `/salas` (salas abertas), `/ws?sala=&id=&nome=` (WebSocket).

No plano gratuito do Render o disco é apagado a cada deploy e o serviço dorme sem uso. Por isso o estado guardado no servidor é só para quem chega depois; o que vale de verdade é o **Save Exclusivo**.

## Save Exclusivo

- Fica no computador de quem criou a sala, junto com os saves normais (um automático a cada 6 horas do jogo e quantos manuais quiser).
- Guarda o estado inteiro da sala e o perfil de cada participante que estava conectado.
- Só pode ser carregado reativando a sala: o dono abre a sala (Sala → Suas salas → Reativar), vai em **Configurações → Save/Exclusivo** e clica no save. A sala volta inteira, para todo mundo.
- Cada participante pode pedir o próprio perfil de volta (botão "Recuperar o meu perfil"); ele aparece na tela de perfis.

## Desenvolvedor

- Jogos ficam em `Projetos/Jogos da Sala/<nome>/`: `jogo.lua` e as pastas `biomas`, `inimigos`, `itens`, `missoes`, `mecanicas`. O Assistente de Scripts (contexto "Jogo da sala") cria um jogo do zero ou conteúdo para um jogo que já existe.
- **Preparar versão**: a equipe leva 6 horas por unidade de mudança (bioma 3, mecânica 4, chefe 2, inimigo 1, missão 1, item 0,5; alterar vale metade). Velocidade = você + a equipe do Estúdio (habilidade × moral). Só trabalham em dias úteis das 9h às 18h.
- Cada versão nasce com bugs (1 a 1,8 por unidade). **Testes** com o QA e **testar jogando** acham bugs; **Corrigir** remove os encontrados. Bugs que sobram travam o jogo dos streamers e aparecem no log.
- **Peso**: conteúdo total ÷ 25 ÷ otimização. FPS no jogo = FPS do PC ÷ (1 + peso × 0,35). **Otimizar** soma 0,25 à otimização (até 3).
- **Publicar** para todos ou em acesso antecipado só para streamers escolhidos.
- **Log dos jogos**: travamentos, FPS baixo, erros de memória e valores estranhos de cheats; o dev pode banir o jogador do jogo.

## Streamer

- A Loja de Apps avisa jogo novo; o app Atualizações avisa versão nova. O download usa a internet do plano.
- O Arcade joga os jogos da sala. Live na categoria "Jogo da sala": audiência × 1,15 (× 1,3 em acesso antecipado). Ao terminar, o público compra: 3% do pico × qualidade.
- Cheats funcionam nos jogos da sala pelo mesmo injetor, com o cliente em `Jogos/<nome>`; quem vigia é o desenvolvedor.

## Exclusivas do multiplayer

- Contratos de live (o dev reserva o dinheiro; o streamer recebe ao completar os minutos; recusado, volta).
- Recompensa por bug (o dev paga quem relatou).
- Chefe mundial (vida compartilhada; quem participou ganha ouro).
- Duelos contra o personagem de outro jogador; ranking de streamers, desenvolvedores e duelos.
