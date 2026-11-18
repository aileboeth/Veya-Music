# Veya Sync：自部署同步服务器

Veya Sync 是一个很小的同步服务器（一个程序，约 7 MB，运行时占 10 MB 左右内存），装在你自己的 VPS 上以后：

- **电脑和手机同步**：歌单和「我喜欢」、听歌记录和推荐（每台设备的记录合在一起算推荐）、每日推荐、不喜欢、搜索历史、音源脚本、部分设置（主题、音质、播放模式、歌词配色等；代理、下载位置、窗口大小各设备分开）
- **设备联动**：
  - **接力播放**：电脑在放的歌，手机上一点就接着放（同一首、同一秒、整个播放队列），电脑自动暂停；反过来也行
  - **推歌**：在歌曲菜单里选「在 xxx 上播放」，或者在「设备」面板里推到另一台的下一首
  - **一起听**：两台设备按同一个进度播放同一首歌（按服务器时钟对齐，误差约 0.1 秒）

数据只存在你自己的服务器上，不经过任何第三方。

## 安装

用 root 登录服务器，运行一条命令（Debian / Ubuntu / CentOS 等常见 Linux，x86_64 或 ARM 都可以）：

```bash
curl -fsSL https://github.com/aileboeth/Veya-Music/releases/latest/download/veya-sync-install.sh | bash
```

国内服务器连不上 GitHub 时用加速地址（安装过程中下载程序也会自动走加速镜像）：

```bash
curl -fsSL https://p.jackyu.cn/https://github.com/aileboeth/Veya-Music/releases/latest/download/veya-sync-install.sh | bash
```

装完会显示一个**二维码**和一行 `veya1.` 开头的**配对码**。

> 云服务器还要在控制台的「安全组 / 防火墙」里放行 **TCP 7650** 端口（脚本会自动放行服务器自己的 ufw / firewalld）。

## 配对

- **电脑**：Veya Music → 设置 → 同步与多设备 → 粘贴配对码 → 连接
- **手机**：Veya Music → 我的 → 多设备同步 → 扫码（扫服务器上的二维码，或者电脑上「手机配对 → 显示二维码」）

第一次同步时，服务器上已有的数据为准，这台设备独有的歌单、歌曲会合并上去，不会丢。

## 常用命令

| 命令 | 作用 |
|---|---|
| `veya-sync info` | 再次显示配对码和二维码 |
| `veya-sync info --url https://新地址:7650` | 服务器 IP 变了 / 自动检测的地址不对时修改 |
| `veya-sync update` | 更新到最新版（数据和配对码不变） |
| `veya-sync reset-key` | 更换密钥（配对码泄露时用；之后所有设备要重新配对） |
| `veya-sync uninstall` | 卸载程序，数据留在 `/opt/veya-sync`（重新安装后接着用） |
| `veya-sync uninstall --purge --yes` | 彻底卸载：程序、服务、开机自启、命令、安装时加的防火墙规则、系统用户和全部数据 |
| `journalctl -u veya-sync -n 50` | 查看运行日志 |

数据在 `/opt/veya-sync/data/`，备份这个文件夹即可。

`veya-sync` 命令不在了的话，用一键安装脚本卸载：

```bash
curl -fsSL https://github.com/aileboeth/Veya-Music/releases/latest/download/veya-sync-install.sh | bash -s -- uninstall --purge --yes
```

脚本只删它自己加的防火墙规则，你原来就放行过的端口不会动。系统日志（journalctl）里以前的运行记录由系统按时间自动清理，脚本不会去删。

## 已经有域名和 Nginx / 1Panel

可以放在反向代理后面，由代理负责 HTTPS（这样也能走 Cloudflare）：

```bash
curl -fsSL https://github.com/aileboeth/Veya-Music/releases/latest/download/veya-sync-install.sh | bash -s -- --behind-proxy --url https://music.example.com
```

Veya Sync 只监听 `127.0.0.1:7650`。在反向代理里把域名转发到 `http://127.0.0.1:7650`，并打开 WebSocket：

```nginx
location / {
    proxy_pass http://127.0.0.1:7650;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_read_timeout 3600s;
    client_max_body_size 100m;
}
```

## 其他选项

- `--port 7650`：换端口
- `--user-install`：没有 root 权限时装到自己的目录（`~/.veya-sync`）
- `--mirror <加速前缀>`：指定 GitHub 加速地址

## 安全

- 配对码里包含连接密钥，相当于密码，不要发给别人；泄露了就 `veya-sync reset-key`
- 默认用自签名证书加密，设备按配对码里的证书指纹校验，不需要域名，也防止连接被冒充
- 连续输错密钥的 IP 会被暂时拒绝
