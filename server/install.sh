#!/usr/bin/env bash
# Veya Sync 一键安装 / 更新 / 卸载
#
#   安装:  curl -fsSL https://github.com/aileboeth/Veya-Music/releases/latest/download/veya-sync-install.sh | bash
#   国内:  curl -fsSL http://8.217.135.233:9999/https://github.com/aileboeth/Veya-Music/releases/latest/download/veya-sync-install.sh | bash
#   更新:  veya-sync update        配对码: veya-sync info        卸载: veya-sync uninstall [--purge]
#
# 选项: --port 7650   --url https://地址   --behind-proxy（放在 Nginx / 1Panel / Cloudflare 后面）
#       --mirror <GitHub 加速前缀>   --user-install（没有 root 时装到自己的目录）   --yes
set -euo pipefail

REPO="aileboeth/Veya-Music"
MIRRORS=("https://p.jackyu.cn/" "http://8.217.135.233:9999/")
ACTION="install"
PORT=""
URL=""
BEHIND=0
MIRROR="${VEYA_MIRROR:-}"
USER_INSTALL=0
PURGE=0
YES=0
VERSION="${VEYA_SYNC_VERSION:-latest}"

say()  { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!!\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m错误:\033[0m %s\n' "$*" >&2; exit 1; }

ORIG_ARGS=("$@")
while [ $# -gt 0 ]; do
  case "$1" in
    install|update|uninstall|info) ACTION="$1" ;;
    --port) PORT="${2:-}"; shift ;;
    --url) URL="${2:-}"; shift ;;
    --behind-proxy) BEHIND=1 ;;
    --mirror) MIRROR="${2:-}"; shift ;;
    --user-install) USER_INSTALL=1 ;;
    --purge) PURGE=1 ;;
    --yes|-y) YES=1 ;;
    --version) VERSION="${2:-}"; shift ;;
    -h|--help) sed -n '2,11p' "$0" 2>/dev/null || true; exit 0 ;;
    *) die "不认识的参数: $1" ;;
  esac
  shift
done

# ---------- 安装位置 ----------
if [ "$(id -u)" -ne 0 ] && [ "$USER_INSTALL" -eq 0 ]; then
  # 已经装在自己目录里的，更新/卸载时继续用那里
  if [ -x "$HOME/.veya-sync/veya-sync" ] && [ ! -x /opt/veya-sync/veya-sync ]; then
    USER_INSTALL=1
  elif command -v sudo >/dev/null 2>&1; then
    say "需要 root 权限，通过 sudo 继续…"
    TMP_SELF="$(mktemp)"
    if [ -f "${BASH_SOURCE[0]:-}" ]; then
      cp "${BASH_SOURCE[0]}" "$TMP_SELF"
    else
      # 通过管道运行（curl | bash）时没有脚本文件：重新下载一份给 sudo 用
      src="https://github.com/$REPO/releases/latest/download/veya-sync-install.sh"
      curl -fsSL --connect-timeout 6 --max-time 30 -o "$TMP_SELF" "${MIRROR}$src" 2>/dev/null ||
        curl -fsSL --connect-timeout 6 --max-time 30 -o "$TMP_SELF" "${MIRRORS[1]}$src" ||
        die "无法重新下载安装脚本，请切换到 root（su -）后再运行"
    fi
    exec sudo -E bash "$TMP_SELF" "${ORIG_ARGS[@]}"
  else
    die "需要 root 权限。请先运行 su - 切换到 root 再执行，或者加 --user-install 装到自己的目录"
  fi
fi

if [ "$USER_INSTALL" -eq 1 ]; then
  DIR="$HOME/.veya-sync"
  RUN_USER="$(id -un)"
else
  DIR="/opt/veya-sync"
  RUN_USER="veya-sync"
fi
BIN="$DIR/veya-sync"
CONF="$DIR/config.json"
UNIT="/etc/systemd/system/veya-sync.service"

has_systemd() { [ -d /run/systemd/system ] && command -v systemctl >/dev/null 2>&1; }
has_user_systemd() { command -v systemctl >/dev/null 2>&1 && systemctl --user show-environment >/dev/null 2>&1; }

# ---------- 下载 ----------
need() { command -v "$1" >/dev/null 2>&1 || die "缺少命令 $1，请先安装（Debian/Ubuntu: apt install -y $2）"; }
need curl curl
need sha256sum coreutils

case "$(uname -m)" in
  x86_64|amd64) ARCH="amd64" ;;
  aarch64|arm64) ARCH="arm64" ;;
  armv7l|armv7*|armhf) ARCH="armv7" ;;
  *) die "暂不支持这种 CPU: $(uname -m)" ;;
esac

if [ "$VERSION" = "latest" ]; then
  BASE_PATH="https://github.com/$REPO/releases/latest/download"
else
  BASE_PATH="https://github.com/$REPO/releases/download/v${VERSION#v}"
fi

fetch() { # fetch <网址> <保存到>
  curl -fL --retry 2 --connect-timeout 10 --max-time 300 -o "$2" "$1"
}

pick_source() {
  if [ -n "$MIRROR" ]; then
    case "$MIRROR" in */) ;; *) MIRROR="$MIRROR/" ;; esac
    PREFIX="$MIRROR"; return
  fi
  if curl -fsSL --connect-timeout 6 --max-time 15 -o /dev/null "$BASE_PATH/veya-sync-SHA256SUMS.txt"; then
    PREFIX=""; return
  fi
  for m in "${MIRRORS[@]}"; do
    say "GitHub 连不上，试试加速镜像 $m"
    if curl -fsSL --connect-timeout 6 --max-time 20 -o /dev/null "${m}$BASE_PATH/veya-sync-SHA256SUMS.txt"; then
      PREFIX="$m"; return
    fi
  done
  die "GitHub 和加速镜像都连不上。可以用 --mirror 指定一个能用的 GitHub 加速前缀"
}

download_binary() {
  pick_source
  local tmp; tmp="$(mktemp -d)"
  local name="veya-sync-linux-$ARCH"
  say "下载 $name ${PREFIX:+（经由 $PREFIX）}"
  fetch "${PREFIX}$BASE_PATH/veya-sync-SHA256SUMS.txt" "$tmp/sums"
  fetch "${PREFIX}$BASE_PATH/$name" "$tmp/$name"
  local want; want="$(awk -v n="$name" '{ f=$2; sub(/^\*/, "", f); if (f == n) print $1 }' "$tmp/sums")"
  [ -n "$want" ] || die "校验文件里没有 $name"
  local got; got="$(sha256sum "$tmp/$name" | awk '{print $1}')"
  [ "$want" = "$got" ] || die "文件校验失败（下载不完整或被篡改），请重试"
  mkdir -p "$DIR"
  install -m 755 "$tmp/$name" "$BIN.new"
  mv -f "$BIN.new" "$BIN"
  # 保存一份安装脚本，veya-sync update / uninstall 会用到
  if [ -f "${BASH_SOURCE[0]:-}" ] && [ "${BASH_SOURCE[0]}" != "$DIR/install.sh" ]; then
    cp -f "${BASH_SOURCE[0]}" "$DIR/install.sh" 2>/dev/null || true
  else
    fetch "${PREFIX}$BASE_PATH/veya-sync-install.sh" "$DIR/install.sh.new" && mv -f "$DIR/install.sh.new" "$DIR/install.sh" || true
  fi
  chmod 755 "$DIR/install.sh" 2>/dev/null || true
  rm -rf "$tmp"
  say "已安装 $("$BIN" version)"
}

# ---------- 防火墙 ----------
open_port() {
  local p="$1"
  [ "$USER_INSTALL" -eq 1 ] && return 0
  if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
    ufw allow "$p/tcp" >/dev/null && say "已在 ufw 放行端口 $p"
  elif command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state >/dev/null 2>&1; then
    firewall-cmd --permanent --add-port="$p/tcp" >/dev/null && firewall-cmd --reload >/dev/null && say "已在 firewalld 放行端口 $p"
  elif command -v iptables >/dev/null 2>&1 && iptables -S INPUT 2>/dev/null | grep -q -- "-P INPUT DROP"; then
    iptables -C INPUT -p tcp --dport "$p" -j ACCEPT 2>/dev/null || iptables -I INPUT -p tcp --dport "$p" -j ACCEPT
    say "已在 iptables 放行端口 $p（重启后可能需要重新放行）"
  fi
}

# ---------- 服务 ----------
write_service() {
  if [ "$USER_INSTALL" -eq 0 ] && has_systemd; then
    id -u veya-sync >/dev/null 2>&1 || useradd --system --home-dir "$DIR" --no-create-home --shell /usr/sbin/nologin veya-sync 2>/dev/null || useradd -r -d "$DIR" -s /bin/false veya-sync
    chown -R veya-sync: "$DIR"
    chown root: "$BIN" "$DIR/install.sh" 2>/dev/null || true
    cat > "$UNIT" <<EOF
[Unit]
Description=Veya Sync (Veya Music sync server)
After=network-online.target
Wants=network-online.target

[Service]
User=veya-sync
ExecStart=$BIN serve -c $CONF
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=full
ProtectHome=true
PrivateTmp=true
ReadWritePaths=$DIR

[Install]
WantedBy=multi-user.target
EOF
    systemctl daemon-reload
    systemctl enable veya-sync >/dev/null 2>&1
    systemctl restart veya-sync
    ln -sf "$BIN" /usr/local/bin/veya-sync
    MODE="systemd"
  elif [ "$USER_INSTALL" -eq 1 ] && has_user_systemd; then
    mkdir -p "$HOME/.config/systemd/user"
    cat > "$HOME/.config/systemd/user/veya-sync.service" <<EOF
[Unit]
Description=Veya Sync (Veya Music sync server)

[Service]
ExecStart=$BIN serve -c $CONF
Restart=always
RestartSec=3

[Install]
WantedBy=default.target
EOF
    systemctl --user daemon-reload
    systemctl --user enable veya-sync >/dev/null 2>&1
    systemctl --user restart veya-sync
    command -v loginctl >/dev/null 2>&1 && loginctl enable-linger "$(id -un)" >/dev/null 2>&1 || true
    MODE="systemd-user"
  else
    # 没有 systemd（容器、chroot 等）：后台运行 + 开机自启
    [ "$USER_INSTALL" -eq 0 ] && { id -u veya-sync >/dev/null 2>&1 || useradd -r -d "$DIR" -s /bin/false veya-sync 2>/dev/null || true; }
    cat > "$DIR/run.sh" <<EOF
#!/bin/sh
pkill -f "$BIN serve" 2>/dev/null
sleep 1
cd "$DIR" && nohup "$BIN" serve -c "$CONF" >> "$DIR/veya-sync.log" 2>&1 &
EOF
    chmod 755 "$DIR/run.sh"
    if [ "$USER_INSTALL" -eq 0 ] && id -u veya-sync >/dev/null 2>&1 && command -v su >/dev/null 2>&1; then
      chown -R veya-sync: "$DIR"; chown root: "$BIN" "$DIR/run.sh" "$DIR/install.sh" 2>/dev/null || true
      su -s /bin/sh veya-sync -c "$DIR/run.sh"
      RUNNER="su -s /bin/sh veya-sync -c $DIR/run.sh"
    else
      "$DIR/run.sh"
      RUNNER="$DIR/run.sh"
    fi
    if command -v crontab >/dev/null 2>&1; then
      ( crontab -l 2>/dev/null | grep -v "veya-sync/run.sh" ; echo "@reboot $RUNNER" ) | crontab - 2>/dev/null || true
    fi
    [ "$USER_INSTALL" -eq 0 ] && ln -sf "$BIN" /usr/local/bin/veya-sync
    MODE="nohup"
  fi
}

wait_up() {
  local listen; listen="$(sed -n 's/.*"listen": *"\([^"]*\)".*/\1/p' "$CONF")"
  local port="${listen##*:}"
  local scheme="https"; grep -q '"certFile"' "$CONF" || scheme="http"
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    if curl -fsk --max-time 3 "$scheme://127.0.0.1:$port/api/info" >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  warn "服务好像没有启动成功，查看日志: $( [ "$MODE" = systemd ] && echo 'journalctl -u veya-sync -n 50' || echo "$DIR/veya-sync.log")"
  return 1
}

do_install() {
  local fresh=0
  [ -f "$CONF" ] || fresh=1
  download_binary
  if [ "$fresh" -eq 1 ]; then
    local args=(-c "$CONF" --port "${PORT:-7650}")
    [ -n "$URL" ] && args+=(--url "$URL")
    [ "$BEHIND" -eq 1 ] && args+=(--behind-proxy)
    [ "$BEHIND" -eq 1 ] && [ -z "$URL" ] && die "反向代理模式需要 --url https://你的域名"
    say "生成密钥和证书…"
    "$BIN" init "${args[@]}"
  else
    say "保留原来的配置和数据: $CONF"
    [ -n "$URL" ] && "$BIN" info -c "$CONF" --url "$URL" --no-qr >/dev/null
  fi
  write_service
  local listen; listen="$(sed -n 's/.*"listen": *"\([^"]*\)".*/\1/p' "$CONF")"
  case "$listen" in 127.0.0.1:*) ;; *) open_port "${listen##*:}" ;; esac
  wait_up || true
  "$BIN" info -c "$CONF" || warn "地址检测失败：请运行 veya-sync info --url https://服务器IP:${PORT:-7650} 设置访问地址"
  echo
  if grep -q '"certFile"' "$CONF"; then
    echo "  如果用的是云服务器，记得在控制台的「安全组 / 防火墙」里放行 TCP 端口 ${listen##*:}。"
  else
    echo "  反向代理设置（Nginx / 1Panel / OpenResty）: 把 $URL 转发到 http://$listen，并开启 WebSocket："
    echo "    proxy_http_version 1.1; proxy_set_header Upgrade \$http_upgrade; proxy_set_header Connection \"upgrade\";"
    echo "    proxy_read_timeout 3600s; client_max_body_size 100m;"
  fi
  echo "  常用命令: veya-sync info（配对码）  veya-sync update（更新）  veya-sync uninstall（卸载）"
}

do_update() {
  [ -x "$BIN" ] || die "还没有安装，去掉 update 直接运行就是安装"
  download_binary
  if [ "$USER_INSTALL" -eq 0 ] && has_systemd && [ -f "$UNIT" ]; then
    chown root: "$BIN"; systemctl restart veya-sync
  elif [ "$USER_INSTALL" -eq 1 ] && has_user_systemd; then
    systemctl --user restart veya-sync
  elif [ -x "$DIR/run.sh" ]; then
    if id -u veya-sync >/dev/null 2>&1 && [ "$USER_INSTALL" -eq 0 ]; then su -s /bin/sh veya-sync -c "$DIR/run.sh"; else "$DIR/run.sh"; fi
  fi
  MODE="update"
  wait_up && say "更新完成，数据和配对码不变"
}

do_uninstall() {
  if [ "$YES" -eq 0 ] && [ -t 0 ]; then
    read -r -p "确定卸载 Veya Sync 吗？[y/N] " a
    case "$a" in y|Y) ;; *) exit 0 ;; esac
  fi
  if [ "$USER_INSTALL" -eq 0 ] && has_systemd && [ -f "$UNIT" ]; then
    systemctl disable --now veya-sync >/dev/null 2>&1 || true
    rm -f "$UNIT"; systemctl daemon-reload
  elif [ "$USER_INSTALL" -eq 1 ] && has_user_systemd; then
    systemctl --user disable --now veya-sync >/dev/null 2>&1 || true
    rm -f "$HOME/.config/systemd/user/veya-sync.service"
  fi
  pkill -f "$BIN serve" 2>/dev/null || true
  command -v crontab >/dev/null 2>&1 && { crontab -l 2>/dev/null | grep -v "veya-sync/run.sh" | crontab - 2>/dev/null || true; }
  [ "$USER_INSTALL" -eq 0 ] && rm -f /usr/local/bin/veya-sync
  if [ "$PURGE" -eq 1 ]; then
    rm -rf "$DIR"
    [ "$USER_INSTALL" -eq 0 ] && { userdel veya-sync 2>/dev/null || true; }
    say "已卸载，并删除了所有数据"
  else
    rm -f "$BIN" "$DIR/run.sh"
    say "已卸载。数据和配置留在 $DIR（加 --purge 可以一起删掉）"
  fi
}

case "$ACTION" in
  install) do_install ;;
  update) do_update ;;
  uninstall) do_uninstall ;;
  info) "$BIN" info -c "$CONF" ;;
esac
