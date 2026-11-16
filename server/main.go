// Veya Sync：Veya Music 的自部署同步服务器。
// 同步歌单、听歌记录、音源脚本和设置，并在设备之间转发「接力播放 / 推歌 / 一起听」。
package main

import (
	"context"
	"crypto/tls"
	"encoding/base64"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"syscall"
	"time"

	qrcode "github.com/skip2/go-qrcode"
)

// 发布时用 -ldflags "-X main.version=x.y.z" 写入
var version = "dev"

func usage() {
	fmt.Print(`Veya Sync ` + version + ` - Veya Music 自部署同步服务器

用法:
  veya-sync init  [-c 配置文件] [--port 7650] [--url 访问地址] [--behind-proxy]   生成配置（密钥、证书）
  veya-sync serve [-c 配置文件]                                                 运行服务器
  veya-sync info  [-c 配置文件] [--url 新的访问地址]                             显示配对码和二维码
  veya-sync reset-key [-c 配置文件]                                             更换密钥（所有设备要重新配对）
  veya-sync version

默认配置文件: /opt/veya-sync/config.json（或环境变量 VEYA_SYNC_CONFIG）
`)
}

func defaultConfigPath() string {
	if v := os.Getenv("VEYA_SYNC_CONFIG"); v != "" {
		return v
	}
	// 装在自己目录里（--user-install）时，配置在程序旁边
	if exe, err := os.Executable(); err == nil {
		if real, e := filepath.EvalSymlinks(exe); e == nil {
			exe = real
		}
		p := filepath.Join(filepath.Dir(exe), "config.json")
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	return "/opt/veya-sync/config.json"
}

func main() {
	if len(os.Args) < 2 {
		usage()
		os.Exit(2)
	}
	cmd, args := os.Args[1], os.Args[2:]
	var err error
	switch cmd {
	case "init":
		err = cmdInit(args)
	case "serve":
		err = cmdServe(args)
	case "info":
		err = cmdInfo(args)
	case "reset-key":
		err = cmdResetKey(args)
	case "update", "uninstall":
		// 交给安装时保存的脚本处理（下载、校验、重启服务都在脚本里）
		exe, _ := os.Executable()
		if real, e := filepath.EvalSymlinks(exe); e == nil {
			exe = real
		}
		script := filepath.Join(filepath.Dir(exe), "install.sh")
		if _, e := os.Stat(script); e != nil {
			err = fmt.Errorf("找不到 %s，请重新运行一键安装命令", script)
			break
		}
		err = execScript(script, append([]string{cmd}, args...))
	case "version", "-v", "--version":
		fmt.Println(version)
	case "help", "-h", "--help":
		usage()
	default:
		usage()
		os.Exit(2)
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, "错误:", err)
		os.Exit(1)
	}
}

func cmdInit(args []string) error {
	fs := flag.NewFlagSet("init", flag.ExitOnError)
	cfgPath := fs.String("c", defaultConfigPath(), "配置文件")
	port := fs.Int("port", 7650, "端口")
	url := fs.String("url", "", "设备访问服务器的地址（留空 = 自动检测公网 IP）")
	behind := fs.Bool("behind-proxy", false, "放在反向代理（Nginx / 1Panel / Cloudflare）后面：只监听 127.0.0.1，不加密，由代理负责 HTTPS")
	force := fs.Bool("force", false, "已有配置时也重新生成")
	fs.Parse(args)

	if _, err := os.Stat(*cfgPath); err == nil && !*force {
		fmt.Println("配置已存在，保留原来的密钥和证书:", *cfgPath)
		return nil
	}
	dir := filepath.Dir(*cfgPath)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	c := &Config{Key: randomKey(), DataDir: "data", path: *cfgPath, Name: hostname()}
	if *behind {
		if *url == "" {
			return fmt.Errorf("反向代理模式需要用 --url 指定访问地址，例如 --url https://music.example.com")
		}
		c.Listen = "127.0.0.1:" + strconv.Itoa(*port)
		c.PublicURL = strings.TrimRight(*url, "/")
	} else {
		c.Listen = ":" + strconv.Itoa(*port)
		c.CertFile = "cert.pem"
		c.KeyFile = "key.pem"
		if err := genCert(filepath.Join(dir, c.CertFile), filepath.Join(dir, c.KeyFile)); err != nil {
			return fmt.Errorf("生成证书失败: %w", err)
		}
		if *url != "" {
			c.PublicURL = strings.TrimRight(*url, "/")
		} else if ip := detectPublicIP(); ip != "" {
			c.PublicURL = "https://" + hostPort(ip, *port)
		}
	}
	if err := c.save(); err != nil {
		return err
	}
	fmt.Println("已生成配置:", *cfgPath)
	return nil
}

func hostname() string {
	h, _ := os.Hostname()
	return h
}

func hostPort(host string, port int) string {
	return net.JoinHostPort(host, strconv.Itoa(port))
}

func cmdServe(args []string) error {
	fs := flag.NewFlagSet("serve", flag.ExitOnError)
	cfgPath := fs.String("c", defaultConfigPath(), "配置文件")
	fs.Parse(args)
	cfg, err := loadConfig(*cfgPath)
	if err != nil {
		return err
	}
	s, err := NewServer(cfg)
	if err != nil {
		return err
	}
	defer s.store.Close()
	srv := &http.Server{
		Addr:              cfg.Listen,
		Handler:           s.Handler(),
		ReadHeaderTimeout: 15 * time.Second,
		IdleTimeout:       120 * time.Second,
	}
	ln, err := net.Listen("tcp", cfg.Listen)
	if err != nil {
		return err
	}
	scheme := "http"
	if cfg.CertFile != "" {
		cert, err := tls.LoadX509KeyPair(cfg.CertFile, cfg.KeyFile)
		if err != nil {
			return fmt.Errorf("读取证书失败: %w", err)
		}
		srv.TLSConfig = &tls.Config{Certificates: []tls.Certificate{cert}, MinVersion: tls.VersionTLS12}
		ln = tls.NewListener(ln, srv.TLSConfig)
		scheme = "https"
	}
	fmt.Printf("Veya Sync %s 已启动：%s://%s（数据目录 %s，%d 条记录）\n", version, scheme, cfg.Listen, cfg.DataDir, s.store.Count())

	errc := make(chan error, 1)
	go func() { errc <- srv.Serve(ln) }()
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	select {
	case err := <-errc:
		return err
	case <-sig:
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		srv.Shutdown(ctx)
		return nil
	}
}

// 配对码：veya1. + base64url(JSON)，电脑版粘贴、手机扫码都用它
func pairCode(c *Config) (string, error) {
	if c.PublicURL == "" {
		return "", fmt.Errorf("还不知道设备要用什么地址访问这台服务器，请用 veya-sync info --url https://你的IP或域名:端口 指定")
	}
	p := map[string]string{"u": c.PublicURL, "k": c.Key}
	if c.CertFile != "" {
		fp, err := certFingerprint(c.CertFile)
		if err != nil {
			return "", err
		}
		p["f"] = fp
	}
	if c.Name != "" {
		p["n"] = c.Name
	}
	b, _ := json.Marshal(p)
	return "veya1." + base64.RawURLEncoding.EncodeToString(b), nil
}

func cmdInfo(args []string) error {
	fs := flag.NewFlagSet("info", flag.ExitOnError)
	cfgPath := fs.String("c", defaultConfigPath(), "配置文件")
	url := fs.String("url", "", "修改设备访问服务器的地址")
	noQR := fs.Bool("no-qr", false, "不显示二维码")
	fs.Parse(args)
	cfg, err := loadConfig(*cfgPath)
	if err != nil {
		return err
	}
	if *url != "" {
		u := strings.TrimRight(*url, "/")
		if !regexp.MustCompile(`^https?://[^\s/]+$`).MatchString(u) {
			return fmt.Errorf("地址格式不对，应该像 https://1.2.3.4:7650 或 https://music.example.com")
		}
		cfg.PublicURL = u
		if err := cfg.save(); err != nil {
			return err
		}
	}
	code, err := pairCode(cfg)
	if err != nil {
		return err
	}
	fmt.Println()
	fmt.Println("  Veya Sync " + version)
	fmt.Println("  访问地址: " + cfg.PublicURL)
	if cfg.CertFile != "" {
		fmt.Println("  证书: 自签名（设备按配对码里的指纹校验，不需要域名）")
	} else {
		fmt.Println("  证书: 由反向代理提供 HTTPS")
	}
	fmt.Println()
	if !*noQR {
		printQR(code)
		fmt.Println("  手机: Veya Music → 设置 → 同步 → 扫码配对")
	}
	fmt.Println("  电脑: Veya Music → 设置 → 同步 → 粘贴下面这一整行配对码")
	fmt.Println()
	fmt.Println(code)
	fmt.Println()
	fmt.Println("  配对码里含有密钥，不要发给别人。泄露了可以运行 veya-sync reset-key 更换。")
	return nil
}

func cmdResetKey(args []string) error {
	fs := flag.NewFlagSet("reset-key", flag.ExitOnError)
	cfgPath := fs.String("c", defaultConfigPath(), "配置文件")
	fs.Parse(args)
	cfg, err := loadConfig(*cfgPath)
	if err != nil {
		return err
	}
	cfg.Key = randomKey()
	if err := cfg.save(); err != nil {
		return err
	}
	fmt.Println("密钥已更换。重启服务（systemctl restart veya-sync）后，所有设备需要用新的配对码重新配对：")
	return cmdInfo([]string{"-c", *cfgPath})
}

// printQR 用半格字符 + ANSI 颜色在终端里画二维码（黑白固定，深色/浅色终端都能扫）
func printQR(text string) {
	q, err := qrcode.New(text, qrcode.Low)
	if err != nil {
		return
	}
	bm := q.Bitmap() // 已经带了白边
	const white, black = "\x1b[97m", "\x1b[30m"
	const bgWhite, bgBlack = "\x1b[107m", "\x1b[40m"
	var sb strings.Builder
	for y := 0; y < len(bm); y += 2 {
		sb.WriteString("  ")
		for x := 0; x < len(bm[y]); x++ {
			top := bm[y][x]
			bottom := false
			if y+1 < len(bm) {
				bottom = bm[y+1][x]
			}
			fg, bg := white, bgWhite
			if top {
				fg = black
			}
			if bottom {
				bg = bgBlack
			}
			sb.WriteString(fg + bg + "▀")
		}
		sb.WriteString("\x1b[0m\n")
	}
	fmt.Print(sb.String())
}

var ipv4Re = regexp.MustCompile(`\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b`)

// detectPublicIP 问几个查询 IP 的服务（国内外各有），拿到第一个合法的公网 IPv4
func detectPublicIP() string {
	client := &http.Client{Timeout: 4 * time.Second}
	for _, u := range []string{"https://4.ipw.cn", "https://api.ipify.org", "https://ipv4.icanhazip.com", "http://myip.ipip.net"} {
		resp, err := client.Get(u)
		if err != nil {
			continue
		}
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		resp.Body.Close()
		if m := ipv4Re.FindString(string(b)); m != "" {
			if ip := net.ParseIP(m); ip != nil && !ip.IsPrivate() && !ip.IsLoopback() {
				return m
			}
		}
	}
	return ""
}
