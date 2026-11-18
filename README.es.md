# Veya Music

[English](README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | **Español** | [Français](README.fr.md) | [Deutsch](README.de.md) | [Русский](README.ru.md) | [Português (Brasil)](README.pt-BR.md)

Veya Music es un reproductor de música multiplataforma para Windows y Android, con recomendaciones creadas a partir de tu propio historial de escucha. Busca y explora Kuwo, Kugou, QQ Music, NetEase Cloud Music y Migu en un solo lugar, y reproduce las canciones mediante scripts de fuente personalizados compatibles con LX Music. Un pequeño servidor autoalojado, Veya Sync, mantiene sincronizados el ordenador y el móvil y permite pasar la reproducción de uno a otro.

> Por ahora la interfaz de la aplicación solo está disponible en chino.

## Funciones

- **Una búsqueda para cinco plataformas**: canciones, listas, plaza de listas y rankings de Kuwo, Kugou, QQ Music, NetEase Cloud Music y Migu, con letras y traducciones.
- **Scripts de fuente**: importa scripts de fuente personalizados de LX Music (`.js`) y activa varios a la vez. Una prueba de velocidad de un clic los ordena, la reproducción prefiere los rápidos y fiables y, si todos fallan, se intenta la misma canción en otra plataforma.
- **Protección contra canciones equivocadas**: si un script devuelve un audio cuya duración no coincide con la canción (otra pista o un fragmento de 30 segundos), se prueba automáticamente el siguiente script.
- **Recomendaciones sin cuenta**, todas a partir de tu historial local:
  - Recomendaciones diarias: 30 canciones al día, cada una con su motivo; las que marcas como "no me interesa" dejan de aparecer, y las canciones parecidas y ese artista bajan en la clasificación.
  - Radio de canciones similares que empieza en cualquier canción y no se detiene.
  - Continuación automática: cuando una lista termina en modo secuencial, siguen canciones similares.
  - Página Descubrir: canciones que te pueden gustar, listas recomendadas, rankings y listas populares.
- **Encuentra lo que suena**: la canción actual se resalta, un botón "reproduciendo ahora" vuelve a ella y la barra del reproductor muestra de qué lista viene.
- **Tus listas**: guarda listas en línea y actualízalas más tarde; ordena una lista por tus reproducciones, escuchadas recientemente, título, artista o duración, o muestra solo las canciones que has escuchado o no. La plaza de listas y la búsqueda de listas pueden ordenar y filtrar por reproducciones y favoritos.
- **Importa listas** desde un enlace compartido de NetEase Cloud Music, QQ Music, Kugou, Kuwo, Migu o Soda Music (Qishui); para otras apps, pega líneas "título - artista" y cada canción se empareja. Migra "Mis listas" desde LX Music con un clic.
- **Letras de escritorio** con resaltado palabra por palabra, opacidad del texto y banda de fondo ajustables; **descargas** (con `.lrc`, se pueden escuchar sin conexión); **temporizador de apagado**; temas claro y oscuro; icono en la bandeja; teclas multimedia.
- **Proxy**: seguir el proxy del sistema, conectar directamente o usar un puerto de proxy fijo.
- **Sincronización y continuidad entre dispositivos** con tu propio servidor [Veya Sync](#veya-sync-servidor-de-sincronización-autoalojado): listas, historial y recomendaciones, scripts de fuente y parte de la configuración; continúa la canción actual en otro dispositivo, envía una canción a otro dispositivo o escuchad juntos de forma sincronizada.

## App para Android

La misma interfaz y funciones que la versión de escritorio, y además: reproducción en segundo plano; controles en la pantalla de bloqueo, la notificación y los auriculares (con botones de "me gusta" y letra en la notificación); **letras flotantes** sobre otras apps; la línea actual de la letra en la pantalla de bloqueo y en el Bluetooth del coche; descargas en la carpeta `Music/Veya Music` del teléfono; emparejamiento con el servidor de sincronización mediante código QR; actualizaciones dentro de la app.

## Descarga

Descarga la última versión en [Releases](https://github.com/aileboeth/Veya-Music/releases/latest):

| Plataforma | Archivo | Requisitos |
|---|---|---|
| Windows | `Veya-Music-Setup-<versión>.exe` | Windows 10 / 11, 64 bits |
| Android | `Veya-Music-<versión>.apk` | Android 10 o posterior |

El instalador de Windows está firmado con un certificado autofirmado, por lo que Windows SmartScreen puede mostrar un aviso en la primera instalación: elige **Más información → Ejecutar de todas formas**. Ambas versiones buscan actualizaciones por sí solas y muestran los cambios tras actualizar.

## Primeros pasos

Veya Music no incluye audio ni scripts de fuente. Para reproducir canciones:

1. Consigue uno o varios scripts de fuente personalizados de LX Music (`.js`). La carpeta [`sources/`](sources/) contiene scripts de terceros recopilados de canales públicos y probados; consulta los resultados en [sources/README.md](sources/README.md) (en chino).
2. En la app abre **Ajustes → Gestión de fuentes** e importa los archivos de script (la versión de escritorio puede importar una carpeta entera).
3. Pulsa **Prueba de velocidad**. A partir de ahí la reproducción prefiere los scripts más rápidos que funcionan, y los que fallan se pueden desactivar con un clic.

## Veya Sync (servidor de sincronización autoalojado)

La sincronización, la continuidad, el envío de canciones y la escucha conjunta pasan por Veya Sync, un único programa pequeño (unos 7 MB y unos 10 MB de memoria) que se ejecuta en tu propio servidor Linux (x86_64 o ARM). Tus datos se quedan en tu servidor.

**Instalación** (ejecutar como root):

```bash
curl -fsSL https://github.com/aileboeth/Veya-Music/releases/latest/download/veya-sync-install.sh | bash
```

Si el servidor no puede acceder a GitHub (por ejemplo, en China continental), usa el espejo:

```bash
curl -fsSL https://p.jackyu.cn/https://github.com/aileboeth/Veya-Music/releases/latest/download/veya-sync-install.sh | bash
```

Al terminar muestra un código QR y un código de emparejamiento que empieza por `veya1.`. En el ordenador pega el código en **Ajustes → Sincronización y dispositivos**; en el móvil escanea el código QR en **Yo → Sincronización multidispositivo**. En un servidor en la nube, permite también **TCP 7650** en el grupo de seguridad del proveedor.

**Otros comandos**: `veya-sync info` vuelve a mostrar el código de emparejamiento, `veya-sync update` actualiza (se conservan los datos y el código), `veya-sync reset-key` cambia la clave.

**Desinstalar** todo (programa, servicio, inicio automático, el comando `veya-sync`, las reglas de cortafuegos que añadió, el usuario del sistema `veya-sync` y todos los datos):

```bash
veya-sync uninstall --purge --yes
```

Sin `--purge` solo se elimina el programa y los datos se quedan en `/opt/veya-sync` para una reinstalación posterior. Si el comando `veya-sync` ya no existe:

```bash
curl -fsSL https://github.com/aileboeth/Veya-Music/releases/latest/download/veya-sync-install.sh | bash -s -- uninstall --purge --yes
```

Cómo usarlo detrás de Nginx / 1Panel con tu propio dominio, la instalación sin root y otras opciones se describen en [docs/SYNC.md](docs/SYNC.md) (en chino).

## Compilar desde el código fuente

Escritorio (Node.js y npm):

```powershell
npm install
node node_modules\electron\install.js   # npm 12 omite los scripts de instalación, así que Electron se descarga a mano
npm run dev        # modo de desarrollo
npm run build      # compilar en out/
npm run dist       # crear el instalador en dist/
```

Android (JDK 17+ y el Android SDK, con la ruta del SDK en `android/local.properties`):

```powershell
npm run build:android                      # empaqueta la interfaz en android/app/src/main/assets/www
cd android; .\gradlew.bat :app:assembleDebug
```

Servidor de sincronización (Go): `cd server; go test ./...`, y `server/build.ps1` compila los binarios para Linux.

Las comprobaciones automáticas usan una carpeta de datos aparte, `.e2e/`, y no tocan tus datos reales:

```powershell
npm run build
powershell -File tools\run-e2e.ps1 -Steps tools\e2e\features.cjs -Fresh
powershell -File tools\e2e\sync-run.ps1   # inicia un Veya Sync local y sincroniza dos carpetas de datos
node tools\test-sync-util.mjs; node tools\test-android-shims.mjs
```

**Publicar una versión**: sube `version` en `package.json` (compartida por escritorio, Android y el servidor) y añade una entrada al principio de `src/renderer/src/changelog.json`; ejecuta `powershell -File tools\release.ps1`, que deja todo en `dist\release-<versión>\`; crea una release en GitHub con la etiqueta `v<versión>`, pega `release-notes.md` como descripción y sube el resto de archivos.

## Estructura del proyecto

- `src/main`: proceso principal de Electron (ejecución de scripts de fuente, datos en línea, selección de fuente y prueba de velocidad, proxy, actualizador, motor de recomendaciones, descargas, importación de LX Music, importación de listas)
- `src/main/lx`: el musicSdk de lx-music-desktop (Apache-2.0, ver `NOTICE`)
- `src/main/sync`: motor de sincronización; `src/renderer/src/remote.ts`: continuidad, envío de canciones, escucha conjunta
- `src/preload`: scripts de precarga (`userApi.js` es el entorno aislado para los scripts de fuente)
- `src/renderer`: la interfaz (Vue 3), compartida por escritorio y Android; `MobileApp.vue` es el armazón del móvil
- `src/android`: el "proceso principal" de Android, que reutiliza `src/main` dentro de un WebView (`shims/` sustituye las API de Node / Electron; los scripts de fuente se ejecutan en un Web Worker)
- `android/`: parte nativa de Android (Kotlin): host WebView, reproducción en segundo plano con ExoPlayer, letras flotantes, descargas, red
- `server/`: servidor Veya Sync (Go) y su script de instalación de una línea
- `sources/`: scripts de fuente de terceros recopilados de canales públicos

## Licencia y créditos

Veya Music se publica bajo la [Apache License 2.0](LICENSE). Autor: aile ([@aileboeth](https://github.com/aileboeth)).

Las interfaces de búsqueda, listas, rankings y letras, y el entorno de ejecución de los scripts de fuente personalizados, provienen de [lx-music-desktop](https://github.com/lyswhut/lx-music-desktop) (Apache-2.0); ver [NOTICE](NOTICE). Gracias a su autor y a los autores de los scripts de fuente.

## Aviso legal

1. Veya Music es software de código abierto desarrollado por una persona, solo para aprendizaje e intercambio técnico. No lo uses con ningún fin comercial.
2. Este software no proporciona, almacena ni sube ningún archivo de audio. Los resultados de búsqueda, listas, rankings, letras y datos similares proceden de las interfaces web públicas de las plataformas de música; los enlaces de reproducción y descarga los obtienen por completo scripts de fuente de terceros que importas tú. Estas interfaces y fuentes proceden de internet y no tienen relación con el autor, que no garantiza su disponibilidad, exactitud ni legalidad.
3. Los derechos de autor de la música pertenecen a las plataformas y a los titulares de los derechos. Elimina en un plazo de 24 horas la música obtenida con este software; escucha o compra las canciones que te gusten en plataformas con licencia y apoya a los artistas.
4. Asumes todas las consecuencias del uso de este software (incluidas, entre otras, disputas de derechos de autor y pérdida de cuentas o datos); el autor no acepta ninguna responsabilidad.
5. Si las leyes de tu región no permiten este tipo de software, deja de usarlo y desinstálalo. Los titulares de derechos que consideren que este software vulnera sus derechos pueden contactar con el autor a través de [Issues](https://github.com/aileboeth/Veya-Music/issues), y se atenderá con prontitud.

Al usar este software confirmas que has leído y aceptas todo lo anterior. Las versiones de escritorio y Android muestran este aviso al abrirse por primera vez, y puedes volver a leerlo en **Ajustes → Acerca de**.

Los scripts de [`sources/`](sources/) son scripts de terceros recopilados de canales públicos. Sus derechos de autor pertenecen a sus autores, se ofrecen solo para aprendizaje e intercambio, y el autor de un script puede pedir su retirada a través de Issues.
