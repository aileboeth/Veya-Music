# Veya Music

[English](README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Русский](README.ru.md) | **Português (Brasil)**

Veya Music é um player de música multiplataforma para Windows e Android, com recomendações criadas a partir do seu próprio histórico de audição. Ele pesquisa e navega por Kuwo, Kugou, QQ Music, NetEase Cloud Music e Migu em um só lugar e toca as músicas por meio de scripts de fonte personalizados compatíveis com o LX Music. Um pequeno servidor auto-hospedado, o Veya Sync, mantém o computador e o celular sincronizados e permite passar a reprodução de um para o outro.

> Por enquanto, a interface do aplicativo está disponível apenas em chinês.

## Recursos

- **Uma busca para cinco plataformas**: músicas, playlists, praça de playlists e paradas de Kuwo, Kugou, QQ Music, NetEase Cloud Music e Migu, com letras e traduções.
- **Scripts de fonte**: importe scripts de fonte personalizados do LX Music (`.js`) e ative vários ao mesmo tempo. Um teste de velocidade com um clique os classifica, a reprodução prefere os rápidos e confiáveis e, quando todos falham, a mesma música é tentada em outra plataforma.
- **Proteção contra música errada**: se um script devolver um áudio cuja duração não bate com a música (outra faixa ou uma prévia de 30 segundos), o próximo script é tentado automaticamente.
- **Recomendações sem conta**, todas a partir do seu histórico local:
  - Recomendações diárias: 30 músicas por dia, cada uma com o motivo; as que você marca como "não tenho interesse" deixam de aparecer, e músicas parecidas e esse artista caem na classificação.
  - Rádio de músicas parecidas, que começa em qualquer música e não para.
  - Continuação automática: quando uma lista termina no modo sequencial, músicas parecidas vêm em seguida.
  - Página Descobrir: músicas de que você pode gostar, playlists recomendadas, paradas e playlists populares.
- **Ache o que está tocando**: a música atual fica destacada, um botão "tocando agora" volta até ela e a barra do player mostra de qual lista ela veio.
- **Suas playlists**: salve playlists on-line e atualize-as depois; ordene uma playlist pelo número de vezes que você ouviu, ouvidas recentemente, título, artista ou duração, ou mostre só as músicas que você já ouviu ou nunca ouviu. A praça de playlists e a busca de playlists podem ordenar e filtrar por reproduções e favoritos.
- **Importe playlists** a partir de um link de compartilhamento do NetEase Cloud Music, QQ Music, Kugou, Kuwo, Migu ou Soda Music (Qishui); para outros apps, cole linhas "título - artista" e cada música é encontrada. Migre "Minhas listas" do LX Music com um clique.
- **Letras na área de trabalho** com destaque palavra por palavra, opacidade do texto e faixa de fundo ajustáveis; **downloads** (com `.lrc`, dá para ouvir off-line); **timer para desligar**; temas claro e escuro; ícone na bandeja; teclas de mídia.
- **Proxy**: seguir o proxy do sistema, conectar diretamente ou usar uma porta de proxy fixa.
- **Sincronização e continuidade entre dispositivos** com o seu próprio servidor [Veya Sync](#veya-sync-servidor-de-sincronização-auto-hospedado): playlists, histórico e recomendações, scripts de fonte e parte das configurações; continue a música atual em outro dispositivo, envie uma música para outro dispositivo ou ouçam juntos em sincronia.

## App para Android

A mesma interface e os mesmos recursos da versão para computador, e ainda: reprodução em segundo plano; controles na tela de bloqueio, na notificação e no fone de ouvido (com botões de "curtir" e de letra na notificação); **letras flutuantes** sobre outros apps; a linha atual da letra na tela de bloqueio e no Bluetooth do carro; downloads na pasta `Music/Veya Music` do celular; pareamento com o servidor de sincronização por QR code; atualizações dentro do app.

## Download

Baixe a versão mais recente em [Releases](https://github.com/aileboeth/Veya-Music/releases/latest):

| Plataforma | Arquivo | Requisitos |
|---|---|---|
| Windows | `Veya-Music-Setup-<versão>.exe` | Windows 10 / 11, 64 bits |
| Android | `Veya-Music-<versão>.apk` | Android 10 ou mais recente |

O instalador do Windows é assinado com um certificado autoassinado, por isso o Windows SmartScreen pode exibir um aviso na primeira instalação: escolha **Mais informações → Executar assim mesmo**. As duas versões procuram atualizações sozinhas e mostram o que mudou depois de atualizar.

## Primeiros passos

O Veya Music não traz áudio nem scripts de fonte. Para tocar músicas:

1. Consiga um ou mais scripts de fonte personalizados do LX Music (`.js`). A pasta [`sources/`](sources/) contém scripts de terceiros coletados de canais públicos e testados; veja os resultados em [sources/README.md](sources/README.md) (em chinês).
2. No app, abra **Configurações → Gerenciar fontes** e importe os arquivos de script (a versão para computador pode importar uma pasta inteira).
3. Clique em **Teste de velocidade**. A partir daí a reprodução prefere os scripts mais rápidos que funcionam, e os que falham podem ser desativados com um clique.

## Veya Sync (servidor de sincronização auto-hospedado)

Sincronização, continuidade, envio de músicas e ouvir junto passam pelo Veya Sync, um único programa pequeno (cerca de 7 MB e uns 10 MB de memória) que roda no seu próprio servidor Linux (x86_64 ou ARM). Seus dados ficam no seu servidor.

**Instalação** (execute como root):

```bash
curl -fsSL https://github.com/aileboeth/Veya-Music/releases/latest/download/veya-sync-install.sh | bash
```

Se o servidor não consegue acessar o GitHub (por exemplo, na China continental), use o espelho:

```bash
curl -fsSL https://p.jackyu.cn/https://github.com/aileboeth/Veya-Music/releases/latest/download/veya-sync-install.sh | bash
```

Ao terminar, ele mostra um QR code e um código de pareamento que começa com `veya1.`. No computador, cole o código em **Configurações → Sincronização e dispositivos**; no celular, escaneie o QR code em **Eu → Sincronização entre dispositivos**. Em um servidor na nuvem, libere também **TCP 7650** no grupo de segurança do provedor.

**Outros comandos**: `veya-sync info` mostra o código de pareamento de novo, `veya-sync update` atualiza (dados e código são mantidos), `veya-sync reset-key` troca a chave.

**Desinstalar** tudo (programa, serviço, inicialização automática, o comando `veya-sync`, as regras de firewall que ele adicionou, o usuário de sistema `veya-sync` e todos os dados):

```bash
veya-sync uninstall --purge --yes
```

Sem `--purge`, só o programa é removido e os dados ficam em `/opt/veya-sync` para uma reinstalação futura. Se o comando `veya-sync` já não existe:

```bash
curl -fsSL https://github.com/aileboeth/Veya-Music/releases/latest/download/veya-sync-install.sh | bash -s -- uninstall --purge --yes
```

Como usar atrás de Nginx / 1Panel com seu próprio domínio, a instalação sem root e outras opções estão descritas em [docs/SYNC.md](docs/SYNC.md) (em chinês).

## Compilar a partir do código-fonte

Computador (Node.js e npm):

```powershell
npm install
node node_modules\electron\install.js   # o npm 12 ignora scripts de instalação, então baixe o Electron manualmente
npm run dev        # modo de desenvolvimento
npm run build      # compilar em out/
npm run dist       # gerar o instalador em dist/
```

Android (JDK 17+ e o Android SDK, com o caminho do SDK em `android/local.properties`):

```powershell
npm run build:android                      # empacota a interface em android/app/src/main/assets/www
cd android; .\gradlew.bat :app:assembleDebug
```

Servidor de sincronização (Go): `cd server; go test ./...`, e `server/build.ps1` compila os binários para Linux.

As verificações automáticas usam uma pasta de dados separada, `.e2e/`, e não mexem nos seus dados reais:

```powershell
npm run build
powershell -File tools\run-e2e.ps1 -Steps tools\e2e\features.cjs -Fresh
powershell -File tools\e2e\sync-run.ps1   # inicia um Veya Sync local e sincroniza duas pastas de dados
node tools\test-sync-util.mjs; node tools\test-android-shims.mjs
```

**Publicar uma versão**: aumente `version` no `package.json` (compartilhada por computador, Android e servidor) e adicione uma entrada no topo de `src/renderer/src/changelog.json`; execute `powershell -File tools\release.ps1`, que coloca tudo em `dist\release-<versão>\`; crie uma release no GitHub com a tag `v<versão>`, cole `release-notes.md` na descrição e envie os demais arquivos.

## Estrutura do projeto

- `src/main`: processo principal do Electron (execução dos scripts de fonte, dados on-line, escolha de fonte e teste de velocidade, proxy, atualizador, motor de recomendações, downloads, importação do LX Music, importação de playlists)
- `src/main/lx`: o musicSdk do lx-music-desktop (Apache-2.0, veja `NOTICE`)
- `src/main/sync`: motor de sincronização; `src/renderer/src/remote.ts`: continuidade, envio de músicas, ouvir junto
- `src/preload`: scripts de preload (`userApi.js` é o ambiente isolado dos scripts de fonte)
- `src/renderer`: a interface (Vue 3), compartilhada por computador e Android; `MobileApp.vue` é a casca do celular
- `src/android`: o "processo principal" do Android, que reaproveita `src/main` dentro de um WebView (`shims/` substituem as APIs de Node / Electron; os scripts de fonte rodam em um Web Worker)
- `android/`: parte nativa do Android (Kotlin): host WebView, reprodução em segundo plano com ExoPlayer, letras flutuantes, downloads, rede
- `server/`: servidor Veya Sync (Go) e seu script de instalação de uma linha
- `sources/`: scripts de fonte de terceiros coletados de canais públicos

## Licença e créditos

O Veya Music é distribuído sob a [Apache License 2.0](LICENSE). Autor: aile ([@aileboeth](https://github.com/aileboeth)).

As interfaces de busca, playlists, paradas e letras, e o ambiente de execução dos scripts de fonte personalizados, vêm do [lx-music-desktop](https://github.com/lyswhut/lx-music-desktop) (Apache-2.0); veja [NOTICE](NOTICE). Obrigado ao seu autor e aos autores dos scripts de fonte.

## Aviso legal

1. O Veya Music é um software de código aberto desenvolvido por uma pessoa, apenas para aprendizado e troca técnica. Não o use para nenhuma finalidade comercial.
2. Este software não fornece, não armazena e não envia nenhum arquivo de áudio. Resultados de busca, playlists, paradas, letras e dados semelhantes vêm das interfaces web públicas das plataformas de música; os links de reprodução e download são obtidos inteiramente por scripts de fonte de terceiros que você mesmo importa. Essas interfaces e fontes vêm da internet e não têm relação com o autor, que não garante sua disponibilidade, exatidão nem legalidade.
3. Os direitos autorais das músicas pertencem às plataformas e aos detentores dos direitos. Apague em até 24 horas as músicas obtidas com este software; ouça ou compre as músicas de que você gosta em plataformas licenciadas e apoie os artistas.
4. Você assume todas as consequências do uso deste software (incluindo, sem limitação, disputas de direitos autorais e perda de contas ou dados); o autor não aceita nenhuma responsabilidade.
5. Se as leis da sua região não permitem este tipo de software, pare de usá-lo e desinstale-o. Detentores de direitos que acreditem que este software viola seus direitos podem falar com o autor pelas [Issues](https://github.com/aileboeth/Veya-Music/issues), e o pedido será tratado rapidamente.

Ao usar este software, você confirma que leu e concorda com tudo o que está acima. As versões para computador e Android mostram este aviso na primeira abertura, e você pode lê-lo de novo em **Configurações → Sobre**.

Os scripts da pasta [`sources/`](sources/) são scripts de terceiros coletados de canais públicos. Os direitos autorais pertencem aos seus autores, eles são fornecidos apenas para aprendizado e troca, e o autor de um script pode pedir a remoção pelas Issues.
