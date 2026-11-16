package main

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"math/big"
	"net"
	"os"
	"path/filepath"
	"time"
)

type Config struct {
	// 监听地址，例如 ":7650"；反向代理模式下是 "127.0.0.1:7650"
	Listen string `json:"listen"`
	// 设备连接用的密钥（配对码里带着它）
	Key string `json:"key"`
	// 给设备用的访问地址，例如 https://1.2.3.4:7650 或 https://music.example.com
	PublicURL string `json:"publicUrl"`
	// 自签名证书；为空 = 不加密（只在反向代理后面、监听 127.0.0.1 时使用）
	CertFile string `json:"certFile,omitempty"`
	KeyFile  string `json:"keyFile,omitempty"`
	DataDir  string `json:"dataDir"`
	Name     string `json:"name,omitempty"`

	path string
}

func loadConfig(path string) (*Config, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	c := &Config{}
	if err := json.Unmarshal(b, c); err != nil {
		return nil, fmt.Errorf("配置文件格式不对: %w", err)
	}
	c.path = path
	dir := filepath.Dir(path)
	if c.DataDir == "" {
		c.DataDir = filepath.Join(dir, "data")
	} else if !filepath.IsAbs(c.DataDir) {
		c.DataDir = filepath.Join(dir, c.DataDir)
	}
	for _, p := range []*string{&c.CertFile, &c.KeyFile} {
		if *p != "" && !filepath.IsAbs(*p) {
			*p = filepath.Join(dir, *p)
		}
	}
	if c.Key == "" {
		return nil, errors.New("配置里缺少 key")
	}
	if c.Listen == "" {
		c.Listen = ":7650"
	}
	return c, nil
}

func (c *Config) save() error {
	b, _ := json.MarshalIndent(c, "", "  ")
	tmp := c.path + ".tmp"
	if err := os.WriteFile(tmp, append(b, '\n'), 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, c.path)
}

func randomKey() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return base64.RawURLEncoding.EncodeToString(b)
}

// genCert 生成自签名证书（ECDSA P-256，20 年有效期）。设备端按指纹固定这张证书，不看域名/IP，
// 所以 SAN 里写什么都不影响连接；这里写上本机的 IP 只是方便浏览器排查。
func genCert(certPath, keyPath string) error {
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return err
	}
	serial, _ := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 120))
	tpl := &x509.Certificate{
		SerialNumber:          serial,
		Subject:               pkix.Name{CommonName: "Veya Sync", Organization: []string{"Veya Music"}},
		NotBefore:             time.Now().Add(-24 * time.Hour),
		NotAfter:              time.Now().AddDate(20, 0, 0),
		KeyUsage:              x509.KeyUsageDigitalSignature | x509.KeyUsageCertSign,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		BasicConstraintsValid: true,
		IsCA:                  true,
		DNSNames:              []string{"veya-sync", "localhost"},
	}
	if addrs, err := net.InterfaceAddrs(); err == nil {
		for _, a := range addrs {
			if ipn, ok := a.(*net.IPNet); ok {
				tpl.IPAddresses = append(tpl.IPAddresses, ipn.IP)
			}
		}
	}
	der, err := x509.CreateCertificate(rand.Reader, tpl, tpl, &key.PublicKey, key)
	if err != nil {
		return err
	}
	kb, err := x509.MarshalECPrivateKey(key)
	if err != nil {
		return err
	}
	if err := os.WriteFile(keyPath, pem.EncodeToMemory(&pem.Block{Type: "EC PRIVATE KEY", Bytes: kb}), 0o600); err != nil {
		return err
	}
	return os.WriteFile(certPath, pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}), 0o644)
}

// certFingerprint 证书 DER 的 SHA-256，base64url 编码（放进配对码）
func certFingerprint(certPath string) (string, error) {
	b, err := os.ReadFile(certPath)
	if err != nil {
		return "", err
	}
	block, _ := pem.Decode(b)
	if block == nil {
		return "", errors.New("证书文件格式不对")
	}
	sum := sha256.Sum256(block.Bytes)
	return base64.RawURLEncoding.EncodeToString(sum[:]), nil
}
