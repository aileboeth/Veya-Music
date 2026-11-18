# Veya Music

[English](README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | **Français** | [Deutsch](README.de.md) | [Русский](README.ru.md) | [Português (Brasil)](README.pt-BR.md)

Veya Music est un lecteur de musique multiplateforme pour Windows et Android, dont les recommandations sont construites à partir de votre propre historique d'écoute. Il permet de chercher et de parcourir Kuwo, Kugou, QQ Music, NetEase Cloud Music et Migu au même endroit, et lit les morceaux grâce à des scripts de source personnalisés compatibles avec LX Music. Un petit serveur auto-hébergé, Veya Sync, synchronise votre ordinateur et votre téléphone et permet de passer la lecture de l'un à l'autre.

> Pour l'instant, l'interface de l'application n'existe qu'en chinois.

## Fonctionnalités

- **Une seule recherche pour cinq plateformes** : morceaux, playlists, place des playlists et classements de Kuwo, Kugou, QQ Music, NetEase Cloud Music et Migu, avec paroles et traductions.
- **Scripts de source** : importez des scripts de source personnalisés LX Music (`.js`) et activez-en plusieurs à la fois. Un test de vitesse en un clic les classe, la lecture privilégie les plus rapides et les plus fiables et, si tous échouent, le même morceau est essayé sur une autre plateforme.
- **Protection contre les mauvais morceaux** : si un script renvoie un audio dont la durée ne correspond pas au morceau (une autre piste ou un extrait de 30 secondes), le script suivant est essayé automatiquement.
- **Recommandations sans compte**, toutes issues de votre historique local :
  - Sélection du jour : 30 morceaux par jour, chacun avec sa raison ; les morceaux marqués « pas intéressé » ne reviennent plus, et les morceaux similaires et cet artiste sont classés plus bas.
  - Radio de morceaux similaires, qui part de n'importe quel morceau et ne s'arrête pas.
  - Suite automatique : quand une liste se termine en mode séquentiel, des morceaux similaires suivent.
  - Page Découvrir : morceaux que vous pourriez aimer, playlists recommandées, classements et playlists populaires.
- **Retrouver ce qui joue** : le morceau en cours est mis en évidence, un bouton « en cours de lecture » y ramène, et la barre du lecteur indique de quelle liste il vient.
- **Vos playlists** : enregistrez des playlists en ligne et actualisez-les plus tard ; triez une playlist par nombre d'écoutes, écoutes récentes, titre, artiste ou durée, ou n'affichez que les morceaux déjà écoutés ou jamais écoutés. La place des playlists et la recherche de playlists peuvent trier et filtrer par nombre d'écoutes et de favoris.
- **Importer des playlists** depuis un lien de partage NetEase Cloud Music, QQ Music, Kugou, Kuwo, Migu ou Soda Music (Qishui) ; pour les autres applis, collez des lignes « titre - artiste » et chaque morceau est retrouvé. Migrez « Mes listes » depuis LX Music en un clic.
- **Paroles sur le bureau** avec surlignage mot à mot, opacité du texte et bandeau de fond réglables ; **téléchargements** (avec `.lrc`, lisibles hors ligne) ; **minuterie de mise en veille** ; thèmes clair et sombre ; icône dans la zone de notification ; touches multimédia.
- **Proxy** : suivre le proxy du système, se connecter directement ou utiliser un port de proxy fixe.
- **Synchronisation et continuité entre appareils** avec votre propre serveur [Veya Sync](#veya-sync-serveur-de-synchronisation-auto-hébergé) : playlists, historique et recommandations, scripts de source et une partie des réglages ; poursuivez le morceau en cours sur un autre appareil, envoyez un morceau à un autre appareil ou écoutez ensemble en synchronisation.

## Application Android

La même interface et les mêmes fonctions que la version de bureau, avec en plus : lecture en arrière-plan ; commandes sur l'écran de verrouillage, dans la notification et sur le casque (avec des boutons « j'aime » et paroles dans la notification) ; **paroles flottantes** au-dessus des autres applis ; la ligne de paroles en cours sur l'écran de verrouillage et l'écran Bluetooth de la voiture ; téléchargements dans le dossier `Music/Veya Music` du téléphone ; appairage avec le serveur de synchronisation par QR code ; mises à jour dans l'application.

## Téléchargement

Récupérez la dernière version dans [Releases](https://github.com/aileboeth/Veya-Music/releases/latest) :

| Plateforme | Fichier | Configuration requise |
|---|---|---|
| Windows | `Veya-Music-Setup-<version>.exe` | Windows 10 / 11, 64 bits |
| Android | `Veya-Music-<version>.apk` | Android 10 ou plus récent |

L'installateur Windows est signé avec un certificat auto-signé ; Windows SmartScreen peut donc afficher un avertissement lors de la première installation : choisissez **Informations complémentaires → Exécuter quand même**. Les deux versions recherchent elles-mêmes les mises à jour et affichent les changements après la mise à jour.

## Premiers pas

Veya Music ne contient ni audio ni script de source. Pour lire des morceaux :

1. Procurez-vous un ou plusieurs scripts de source personnalisés LX Music (`.js`). Le dossier [`sources/`](sources/) contient des scripts tiers collectés sur des canaux publics et testés ; les résultats sont dans [sources/README.md](sources/README.md) (en chinois).
2. Dans l'application, ouvrez **Réglages → Gestion des sources** et importez les fichiers de script (la version de bureau peut importer un dossier entier).
3. Cliquez sur **Test de vitesse**. La lecture privilégie ensuite les scripts fonctionnels les plus rapides, et les scripts en échec peuvent être désactivés en un clic.

## Veya Sync (serveur de synchronisation auto-hébergé)

La synchronisation, la continuité, l'envoi de morceaux et l'écoute commune passent tous par Veya Sync, un seul petit programme (environ 7 Mo, environ 10 Mo de mémoire) qui tourne sur votre propre serveur Linux (x86_64 ou ARM). Vos données restent sur votre serveur.

**Installation** (à lancer en root) :

```bash
curl -fsSL https://github.com/aileboeth/Veya-Music/releases/latest/download/veya-sync-install.sh | bash
```

Si le serveur ne peut pas joindre GitHub (par exemple en Chine continentale), utilisez le miroir :

```bash
curl -fsSL https://p.jackyu.cn/https://github.com/aileboeth/Veya-Music/releases/latest/download/veya-sync-install.sh | bash
```

À la fin, il affiche un QR code et un code d'appairage commençant par `veya1.`. Sur l'ordinateur, collez le code dans **Réglages → Synchronisation et appareils** ; sur le téléphone, scannez le QR code dans **Moi → Synchronisation multi-appareils**. Sur un serveur cloud, autorisez aussi **TCP 7650** dans le groupe de sécurité de l'hébergeur.

**Autres commandes** : `veya-sync info` réaffiche le code d'appairage, `veya-sync update` met à jour (données et code conservés), `veya-sync reset-key` remplace la clé.

**Tout désinstaller** (programme, service, démarrage automatique, la commande `veya-sync`, les règles de pare-feu ajoutées, l'utilisateur système `veya-sync` et toutes les données) :

```bash
veya-sync uninstall --purge --yes
```

Sans `--purge`, seul le programme est supprimé et les données restent dans `/opt/veya-sync` pour une réinstallation ultérieure. Si la commande `veya-sync` n'existe plus :

```bash
curl -fsSL https://github.com/aileboeth/Veya-Music/releases/latest/download/veya-sync-install.sh | bash -s -- uninstall --purge --yes
```

L'utilisation derrière Nginx / 1Panel avec votre propre domaine, l'installation sans root et les autres options sont décrites dans [docs/SYNC.md](docs/SYNC.md) (en chinois).

## Compiler depuis les sources

Bureau (Node.js et npm) :

```powershell
npm install
node node_modules\electron\install.js   # npm 12 ignore les scripts d'installation, il faut donc télécharger Electron à la main
npm run dev        # mode développement
npm run build      # compiler dans out/
npm run dist       # créer l'installateur dans dist/
```

Android (JDK 17+ et le SDK Android, avec le chemin du SDK dans `android/local.properties`) :

```powershell
npm run build:android                      # empaqueter l'interface dans android/app/src/main/assets/www
cd android; .\gradlew.bat :app:assembleDebug
```

Serveur de synchronisation (Go) : `cd server; go test ./...`, et `server/build.ps1` compile les binaires Linux.

Les vérifications automatiques utilisent un dossier de données séparé, `.e2e/`, et ne touchent pas à vos vraies données :

```powershell
npm run build
powershell -File tools\run-e2e.ps1 -Steps tools\e2e\features.cjs -Fresh
powershell -File tools\e2e\sync-run.ps1   # démarre un Veya Sync local et synchronise deux dossiers de données
node tools\test-sync-util.mjs; node tools\test-android-shims.mjs
```

**Publier une version** : augmentez `version` dans `package.json` (commune au bureau, à Android et au serveur) et ajoutez une entrée en tête de `src/renderer/src/changelog.json` ; lancez `powershell -File tools\release.ps1`, qui place tout dans `dist\release-<version>\` ; créez une release GitHub avec l'étiquette `v<version>`, collez `release-notes.md` comme description et envoyez les autres fichiers.

## Organisation du projet

- `src/main` : processus principal Electron (exécution des scripts de source, données en ligne, choix de la source et test de vitesse, proxy, mises à jour, moteur de recommandations, téléchargements, import depuis LX Music, import de playlists)
- `src/main/lx` : le musicSdk de lx-music-desktop (Apache-2.0, voir `NOTICE`)
- `src/main/sync` : moteur de synchronisation ; `src/renderer/src/remote.ts` : continuité, envoi de morceaux, écoute commune
- `src/preload` : scripts de préchargement (`userApi.js` est l'environnement isolé des scripts de source)
- `src/renderer` : l'interface (Vue 3), partagée par le bureau et Android ; `MobileApp.vue` est l'enveloppe du téléphone
- `src/android` : le « processus principal » Android, qui réutilise `src/main` dans une WebView (`shims/` remplace les API Node / Electron ; les scripts de source tournent dans un Web Worker)
- `android/` : partie native Android (Kotlin) : hôte WebView, lecture en arrière-plan avec ExoPlayer, paroles flottantes, téléchargements, réseau
- `server/` : serveur Veya Sync (Go) et son script d'installation en une ligne
- `sources/` : scripts de source tiers collectés sur des canaux publics

## Licence et remerciements

Veya Music est publié sous [licence Apache 2.0](LICENSE). Auteur : aile ([@aileboeth](https://github.com/aileboeth)).

Les interfaces de recherche, de playlists, de classements et de paroles, ainsi que l'environnement d'exécution des scripts de source personnalisés, proviennent de [lx-music-desktop](https://github.com/lyswhut/lx-music-desktop) (Apache-2.0) ; voir [NOTICE](NOTICE). Merci à son auteur, ainsi qu'aux auteurs des scripts de source.

## Avertissement

1. Veya Music est un logiciel libre développé par un particulier, uniquement à des fins d'apprentissage et d'échange technique. Ne l'utilisez à aucune fin commerciale.
2. Ce logiciel ne fournit, ne stocke et ne téléverse aucun fichier audio. Les résultats de recherche, playlists, classements, paroles et données similaires proviennent des interfaces web publiques des plateformes musicales ; les liens de lecture et de téléchargement sont entièrement obtenus par des scripts de source tiers que vous importez vous-même. Ces interfaces et ces sources viennent toutes d'internet et n'ont aucun lien avec l'auteur, qui ne garantit ni leur disponibilité, ni leur exactitude, ni leur légalité.
3. Les droits d'auteur sur la musique appartiennent aux plateformes et aux ayants droit. Supprimez dans les 24 heures la musique obtenue avec ce logiciel ; écoutez ou achetez les morceaux que vous aimez sur des plateformes autorisées et soutenez les artistes.
4. Vous assumez toutes les conséquences de l'utilisation de ce logiciel (y compris, sans s'y limiter, les litiges de droits d'auteur et la perte de comptes ou de données) ; l'auteur décline toute responsabilité.
5. Si la loi de votre région n'autorise pas ce type de logiciel, cessez de l'utiliser et désinstallez-le. Les ayants droit qui estiment que ce logiciel porte atteinte à leurs droits peuvent contacter l'auteur via les [Issues](https://github.com/aileboeth/Veya-Music/issues) ; la demande sera traitée rapidement.

En utilisant ce logiciel, vous confirmez avoir lu et accepté tout ce qui précède. Les versions de bureau et Android affichent cet avertissement au premier lancement, et vous pouvez le relire dans **Réglages → À propos**.

Les scripts du dossier [`sources/`](sources/) sont des scripts tiers collectés sur des canaux publics. Leurs droits d'auteur appartiennent à leurs auteurs, ils sont fournis uniquement pour l'apprentissage et l'échange, et l'auteur d'un script peut en demander le retrait via les Issues.
