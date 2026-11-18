# Veya Music

[English](README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | **Deutsch** | [Русский](README.ru.md) | [Português (Brasil)](README.pt-BR.md)

Veya Music ist ein plattformübergreifender Musikplayer für Windows und Android, dessen Empfehlungen aus deinem eigenen Hörverlauf entstehen. Er durchsucht Kuwo, Kugou, QQ Music, NetEase Cloud Music und Migu an einem Ort und spielt Titel über LX-Music-kompatible benutzerdefinierte Quellskripte ab. Ein kleiner selbst gehosteter Server, Veya Sync, hält Computer und Handy synchron und lässt dich die Wiedergabe von einem Gerät an das andere übergeben.

> Die Oberfläche der App gibt es derzeit nur auf Chinesisch.

## Funktionen

- **Eine Suche für fünf Plattformen**: Titel, Playlists, Playlist-Plaza und Charts von Kuwo, Kugou, QQ Music, NetEase Cloud Music und Migu, mit Songtexten und Übersetzungen.
- **Quellskripte**: Importiere benutzerdefinierte LX-Music-Quellskripte (`.js`) und aktiviere mehrere gleichzeitig. Ein Geschwindigkeitstest mit einem Klick sortiert sie, die Wiedergabe bevorzugt schnelle und zuverlässige Skripte, und wenn alle scheitern, wird derselbe Titel auf einer anderen Plattform versucht.
- **Schutz vor falschen Titeln**: Liefert ein Skript Audio, dessen Länge nicht zum Titel passt (ein anderer Titel oder eine 30-Sekunden-Vorschau), wird automatisch das nächste Skript versucht.
- **Empfehlungen ohne Konto**, alle aus deinem lokalen Verlauf:
  - Tagesempfehlungen: 30 Titel pro Tag, jeweils mit Begründung; als „kein Interesse“ markierte Titel tauchen nicht mehr auf, ähnliche Titel und dieser Künstler rutschen nach unten.
  - Radio mit ähnlichen Titeln, das bei jedem beliebigen Titel startet und immer weiterläuft.
  - Automatisch weiter: Endet eine Liste im sequenziellen Modus, folgen ähnliche Titel.
  - Entdecken-Seite: Titel, die dir gefallen könnten, empfohlene Playlists, Charts und beliebte Playlists.
- **Finden, was gerade läuft**: Der aktuelle Titel wird hervorgehoben, eine „Wird gespielt“-Schaltfläche springt zu ihm zurück, und die Playerleiste zeigt, aus welcher Liste er stammt.
- **Deine Playlists**: Speichere Online-Playlists und aktualisiere sie später; sortiere eine Playlist nach deinen Wiedergaben, zuletzt gehört, Titel, Künstler oder Länge, oder zeige nur gehörte bzw. nie gehörte Titel. Playlist-Plaza und Playlist-Suche lassen sich nach Wiedergaben und Favoriten sortieren und filtern.
- **Playlists importieren** über einen Teilen-Link von NetEase Cloud Music, QQ Music, Kugou, Kuwo, Migu oder Soda Music (Qishui); für andere Apps füge Zeilen im Format „Titel - Künstler“ ein, und jeder Titel wird zugeordnet. „Meine Listen“ aus LX Music lassen sich mit einem Klick übernehmen.
- **Desktop-Songtexte** mit wortweiser Hervorhebung, einstellbarer Textdeckkraft und Hintergrundband; **Downloads** (mit `.lrc`, offline abspielbar); **Schlaf-Timer**; helles und dunkles Design; Tray-Symbol; Medientasten.
- **Proxy**: dem Systemproxy folgen, direkt verbinden oder einen festen Proxy-Port verwenden.
- **Synchronisation und Übergabe zwischen Geräten** mit deinem eigenen [Veya-Sync](#veya-sync-selbst-gehosteter-sync-server)-Server: Playlists, Verlauf und Empfehlungen, Quellskripte und einige Einstellungen; den aktuellen Titel auf einem anderen Gerät fortsetzen, einen Titel an ein anderes Gerät senden oder synchron zusammen hören.

## Android-App

Dieselbe Oberfläche und dieselben Funktionen wie die Desktop-Version, dazu: Wiedergabe im Hintergrund; Steuerung über Sperrbildschirm, Benachrichtigung und Headset (mit Schaltflächen für „Gefällt mir“ und Songtext in der Benachrichtigung); **schwebende Songtexte** über anderen Apps; die aktuelle Songtextzeile auf dem Sperrbildschirm und im Bluetooth-Display des Autos; Downloads in den Ordner `Music/Veya Music` des Handys; Kopplung mit dem Sync-Server per QR-Code; Updates in der App.

## Download

Die neueste Version gibt es unter [Releases](https://github.com/aileboeth/Veya-Music/releases/latest):

| Plattform | Datei | Voraussetzungen |
|---|---|---|
| Windows | `Veya-Music-Setup-<Version>.exe` | Windows 10 / 11, 64 Bit |
| Android | `Veya-Music-<Version>.apk` | Android 10 oder neuer |

Das Windows-Installationsprogramm ist mit einem selbst signierten Zertifikat signiert, daher kann Windows SmartScreen bei der ersten Installation warnen: Wähle **Weitere Informationen → Trotzdem ausführen**. Beide Versionen suchen selbst nach Updates und zeigen nach dem Update an, was sich geändert hat.

## Erste Schritte

Veya Music enthält weder Audio noch Quellskripte. So spielst du Titel ab:

1. Besorge dir ein oder mehrere benutzerdefinierte LX-Music-Quellskripte (`.js`). Der Ordner [`sources/`](sources/) enthält Skripte von Drittanbietern, die aus öffentlichen Kanälen gesammelt und getestet wurden; die Ergebnisse stehen in [sources/README.md](sources/README.md) (Chinesisch).
2. Öffne in der App **Einstellungen → Quellenverwaltung** und importiere die Skriptdateien (die Desktop-Version kann einen ganzen Ordner importieren).
3. Klicke auf **Geschwindigkeitstest**. Danach bevorzugt die Wiedergabe die schnellsten funktionierenden Skripte, und fehlgeschlagene Skripte lassen sich mit einem Klick deaktivieren.

## Veya Sync (selbst gehosteter Sync-Server)

Synchronisation, Übergabe, Titel senden und gemeinsames Hören laufen alle über Veya Sync, ein einziges kleines Programm (etwa 7 MB, rund 10 MB Arbeitsspeicher), das auf deinem eigenen Linux-Server (x86_64 oder ARM) läuft. Deine Daten bleiben auf deinem Server.

**Installation** (als root ausführen):

```bash
curl -fsSL https://github.com/aileboeth/Veya-Music/releases/latest/download/veya-sync-install.sh | bash
```

Wenn der Server GitHub nicht erreicht (zum Beispiel in Festlandchina), nimm den Mirror:

```bash
curl -fsSL https://p.jackyu.cn/https://github.com/aileboeth/Veya-Music/releases/latest/download/veya-sync-install.sh | bash
```

Am Ende werden ein QR-Code und ein Kopplungscode angezeigt, der mit `veya1.` beginnt. Füge den Code am Computer unter **Einstellungen → Sync & Geräte** ein; scanne am Handy den QR-Code unter **Ich → Sync zwischen Geräten**. Auf einem Cloud-Server musst du außerdem **TCP 7650** in der Sicherheitsgruppe des Anbieters freigeben.

**Weitere Befehle**: `veya-sync info` zeigt den Kopplungscode erneut an, `veya-sync update` aktualisiert (Daten und Kopplungscode bleiben erhalten), `veya-sync reset-key` ersetzt den Schlüssel.

**Alles deinstallieren** (Programm, Dienst, Autostart, den Befehl `veya-sync`, die hinzugefügten Firewall-Regeln, den Systembenutzer `veya-sync` und alle Daten):

```bash
veya-sync uninstall --purge --yes
```

Ohne `--purge` wird nur das Programm entfernt, und die Daten bleiben für eine spätere Neuinstallation in `/opt/veya-sync`. Falls der Befehl `veya-sync` schon fehlt:

```bash
curl -fsSL https://github.com/aileboeth/Veya-Music/releases/latest/download/veya-sync-install.sh | bash -s -- uninstall --purge --yes
```

Den Betrieb hinter Nginx / 1Panel mit eigener Domain, die Installation ohne root und weitere Optionen beschreibt [docs/SYNC.md](docs/SYNC.md) (Chinesisch).

## Aus dem Quellcode bauen

Desktop (Node.js und npm):

```powershell
npm install
node node_modules\electron\install.js   # npm 12 überspringt Installationsskripte, daher Electron manuell herunterladen
npm run dev        # Entwicklungsmodus
npm run build      # nach out/ bauen
npm run dist       # Installationsprogramm nach dist/ bauen
```

Android (JDK 17+ und das Android SDK, SDK-Pfad in `android/local.properties`):

```powershell
npm run build:android                      # Oberfläche nach android/app/src/main/assets/www packen
cd android; .\gradlew.bat :app:assembleDebug
```

Sync-Server (Go): `cd server; go test ./...`, und `server/build.ps1` baut die Linux-Binärdateien.

Automatische Prüfungen nutzen einen eigenen Datenordner `.e2e/` und lassen deine echten Daten unberührt:

```powershell
npm run build
powershell -File tools\run-e2e.ps1 -Steps tools\e2e\features.cjs -Fresh
powershell -File tools\e2e\sync-run.ps1   # startet einen lokalen Veya Sync und synchronisiert zwei Datenordner
node tools\test-sync-util.mjs; node tools\test-android-shims.mjs
```

**Veröffentlichen**: Erhöhe `version` in `package.json` (gemeinsam für Desktop, Android und Server) und füge oben in `src/renderer/src/changelog.json` einen Eintrag hinzu; führe `powershell -File tools\release.ps1` aus, das alles in `dist\release-<Version>\` ablegt; erstelle ein GitHub-Release mit dem Tag `v<Version>`, füge `release-notes.md` als Beschreibung ein und lade die übrigen Dateien hoch.

## Projektstruktur

- `src/main`: Electron-Hauptprozess (Ausführung der Quellskripte, Online-Daten, Quellenauswahl und Geschwindigkeitstest, Proxy, Updater, Empfehlungs-Engine, Downloads, Import aus LX Music, Playlist-Import)
- `src/main/lx`: das musicSdk aus lx-music-desktop (Apache-2.0, siehe `NOTICE`)
- `src/main/sync`: Sync-Engine; `src/renderer/src/remote.ts`: Übergabe, Titel senden, gemeinsam hören
- `src/preload`: Preload-Skripte (`userApi.js` ist die abgeschottete Laufzeitumgebung für Quellskripte)
- `src/renderer`: die Oberfläche (Vue 3), gemeinsam für Desktop und Android; `MobileApp.vue` ist die Hülle für das Handy
- `src/android`: der Android-„Hauptprozess“, der `src/main` in einer WebView wiederverwendet (`shims/` ersetzen Node-/Electron-APIs; Quellskripte laufen in einem Web Worker)
- `android/`: nativer Android-Teil (Kotlin): WebView-Host, Hintergrundwiedergabe mit ExoPlayer, schwebende Songtexte, Downloads, Netzwerk
- `server/`: Veya-Sync-Server (Go) und sein Einzeilen-Installationsskript
- `sources/`: Quellskripte von Drittanbietern, gesammelt aus öffentlichen Kanälen

## Lizenz und Danksagung

Veya Music steht unter der [Apache License 2.0](LICENSE). Autor: aile ([@aileboeth](https://github.com/aileboeth)).

Die Schnittstellen für Suche, Playlists, Charts und Songtexte sowie die Laufzeitumgebung für benutzerdefinierte Quellskripte stammen aus [lx-music-desktop](https://github.com/lyswhut/lx-music-desktop) (Apache-2.0); siehe [NOTICE](NOTICE). Danke an dessen Autor und an die Autoren der Quellskripte.

## Haftungsausschluss

1. Veya Music ist Open-Source-Software, die von einer Einzelperson entwickelt wurde, ausschließlich zum Lernen und für den technischen Austausch. Verwende sie nicht für kommerzielle Zwecke.
2. Diese Software stellt keine Audiodateien bereit, speichert keine und lädt keine hoch. Suchergebnisse, Playlists, Charts, Songtexte und ähnliche Daten stammen aus den öffentlichen Web-Schnittstellen der Musikplattformen; Wiedergabe- und Download-Links werden ausschließlich von Quellskripten Dritter abgerufen, die du selbst importierst. Diese Schnittstellen und Quellen stammen alle aus dem Internet und haben nichts mit dem Autor zu tun, der keine Gewähr für ihre Verfügbarkeit, Richtigkeit oder Rechtmäßigkeit übernimmt.
3. Die Urheberrechte an der Musik liegen bei den Plattformen und den Rechteinhabern. Lösche mit dieser Software erhaltene Musik innerhalb von 24 Stunden; höre oder kaufe die Titel, die dir gefallen, auf lizenzierten Plattformen und unterstütze die Künstler.
4. Du trägst alle Folgen der Nutzung dieser Software (einschließlich, aber nicht beschränkt auf Urheberrechtsstreitigkeiten und den Verlust von Konten oder Daten); der Autor übernimmt keinerlei Haftung.
5. Wenn die Gesetze deiner Region Software dieser Art nicht erlauben, beende die Nutzung und deinstalliere sie. Rechteinhaber, die ihre Rechte durch diese Software verletzt sehen, können den Autor über [Issues](https://github.com/aileboeth/Veya-Music/issues) kontaktieren; das Anliegen wird umgehend bearbeitet.

Mit der Nutzung dieser Software bestätigst du, dass du alles oben Genannte gelesen hast und ihm zustimmst. Desktop- und Android-Version zeigen diesen Hinweis beim ersten Start, und du kannst ihn unter **Einstellungen → Über** erneut lesen.

Die Skripte in [`sources/`](sources/) sind Skripte von Drittanbietern, gesammelt aus öffentlichen Kanälen. Ihre Urheberrechte liegen bei ihren Autoren, sie werden nur zum Lernen und für den Austausch bereitgestellt, und der Autor eines Skripts kann über Issues dessen Entfernung verlangen.
