package main

import (
	"crypto/subtle"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

type Server struct {
	cfg     *Config
	store   *Store
	hub     *Hub
	storeID string
	fails   sync.Map // ip -> *failInfo，密钥错误时限速
}

type failInfo struct {
	mu    sync.Mutex
	n     int
	until time.Time
}

var deviceRe = regexp.MustCompile(`^[\w.-]{6,64}$`)

func NewServer(cfg *Config) (*Server, error) {
	st, err := OpenStore(cfg.DataDir)
	if err != nil {
		return nil, err
	}
	s := &Server{cfg: cfg, store: st}
	s.storeID = loadStoreID(cfg.DataDir)
	s.hub = newHub(s)
	return s, nil
}

// 数据目录的唯一 id：服务器数据被清空 / 换了一台服务器时，设备能发现并重新完整同步
func loadStoreID(dir string) string {
	p := filepath.Join(dir, "store-id")
	if b, err := os.ReadFile(p); err == nil && len(strings.TrimSpace(string(b))) >= 8 {
		return strings.TrimSpace(string(b))
	}
	id := randomKey()[:16]
	os.WriteFile(p, []byte(id+"\n"), 0o600)
	return id
}

func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	// 只在反向代理模式（监听本机）下相信转发头
	if host == "127.0.0.1" || host == "::1" {
		if v := r.Header.Get("CF-Connecting-IP"); v != "" {
			return v
		}
		if v := r.Header.Get("X-Forwarded-For"); v != "" {
			return strings.TrimSpace(strings.Split(v, ",")[0])
		}
	}
	return host
}

// checkKey 校验密钥；连续输错会被暂时拒绝，防止被暴力猜
func (s *Server) checkKey(ip, key string) (ok bool, blocked bool) {
	v, _ := s.fails.LoadOrStore(ip, &failInfo{})
	f := v.(*failInfo)
	f.mu.Lock()
	defer f.mu.Unlock()
	if time.Now().Before(f.until) {
		return false, true
	}
	if key != "" && subtle.ConstantTimeCompare([]byte(key), []byte(s.cfg.Key)) == 1 {
		f.n = 0
		return true, false
	}
	f.n++
	if f.n >= 5 {
		d := time.Duration(f.n-4) * 10 * time.Second
		if d > 10*time.Minute {
			d = 10 * time.Minute
		}
		f.until = time.Now().Add(d)
	}
	return false, false
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(v)
}

func errJSON(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]any{"error": msg})
}

func (s *Server) auth(next func(w http.ResponseWriter, r *http.Request, device string)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		key := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		ok, blocked := s.checkKey(clientIP(r), key)
		if blocked {
			errJSON(w, http.StatusTooManyRequests, "密钥错误次数太多，请稍后再试")
			return
		}
		if !ok {
			time.Sleep(300 * time.Millisecond)
			errJSON(w, http.StatusUnauthorized, "密钥不对")
			return
		}
		device := r.Header.Get("X-Veya-Device")
		if !deviceRe.MatchString(device) {
			errJSON(w, http.StatusBadRequest, "缺少设备 id")
			return
		}
		next(w, r, device)
	}
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		io.WriteString(w, "Veya Sync "+version+" is running.\n")
	})
	mux.HandleFunc("/api/info", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, 200, map[string]any{"app": "veya-sync", "version": version, "time": time.Now().UnixMilli()})
	})
	mux.HandleFunc("/api/state", s.auth(func(w http.ResponseWriter, r *http.Request, device string) {
		writeJSON(w, 200, map[string]any{
			"app": "veya-sync", "version": version, "time": time.Now().UnixMilli(),
			"store": s.storeID, "rev": s.store.Rev(), "records": s.store.Count(), "name": s.cfg.Name,
			"devices": s.hub.deviceList(),
		})
	}))
	mux.HandleFunc("/api/pull", s.auth(func(w http.ResponseWriter, r *http.Request, device string) {
		since, _ := strconv.ParseInt(r.URL.Query().Get("since"), 10, 64)
		recs, last, more := s.store.Since(since, device, 6<<20)
		writeJSON(w, 200, map[string]any{"store": s.storeID, "rev": last, "more": more, "records": recs, "time": time.Now().UnixMilli()})
	}))
	mux.HandleFunc("/api/push", s.auth(func(w http.ResponseWriter, r *http.Request, device string) {
		if r.Method != http.MethodPost {
			errJSON(w, http.StatusMethodNotAllowed, "需要 POST")
			return
		}
		var body struct {
			Store   string   `json:"store"`
			Records []Record `json:"records"`
		}
		dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 96<<20))
		if err := dec.Decode(&body); err != nil {
			errJSON(w, http.StatusBadRequest, "数据格式不对")
			return
		}
		// 设备以为的服务器和实际的不是同一份数据（服务器被重置过）：让它先完整拉一遍
		if body.Store != "" && body.Store != s.storeID {
			writeJSON(w, http.StatusConflict, map[string]any{"error": "store changed", "store": s.storeID})
			return
		}
		n, rev, err := s.store.Put(device, body.Records)
		if err == errBadRecord {
			errJSON(w, http.StatusBadRequest, "记录格式不对")
			return
		}
		if err != nil {
			errJSON(w, http.StatusInternalServerError, "保存失败: "+err.Error())
			return
		}
		if n > 0 {
			s.hub.broadcastRev(rev, device)
		}
		writeJSON(w, 200, map[string]any{"store": s.storeID, "accepted": n, "rev": rev, "time": time.Now().UnixMilli()})
	}))
	mux.HandleFunc("/ws", s.hub.serveWS)
	return withCORS(mux)
}

func withCORS(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Veya-Device")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(204)
			return
		}
		h.ServeHTTP(w, r)
	})
}
