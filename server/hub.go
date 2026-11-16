package main

// 实时通道：设备在线状态、「正在播放」、设备之间的指令（接力播放、推歌、一起听）、对时。
// 服务器只负责转发，不理解指令内容。

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

type DeviceInfo struct {
	ID       string          `json:"id"`
	Name     string          `json:"name"`
	Platform string          `json:"platform"`
	Version  string          `json:"version"`
	LastSeen int64           `json:"lastSeen"`
	Online   bool            `json:"online"`
	NP       json.RawMessage `json:"np,omitempty"`
}

type conn struct {
	ws     *websocket.Conn
	device string
	send   chan []byte
	done   chan struct{}
	once   sync.Once
}

type Hub struct {
	s       *Server
	mu      sync.Mutex
	conns   map[*conn]bool
	devices map[string]*DeviceInfo
	saveT   *time.Timer
}

var upgrader = websocket.Upgrader{
	ReadBufferSize:  16 << 10,
	WriteBufferSize: 16 << 10,
	CheckOrigin:     func(r *http.Request) bool { return true }, // 靠密钥鉴权，不靠来源
}

func newHub(s *Server) *Hub {
	h := &Hub{s: s, conns: map[*conn]bool{}, devices: map[string]*DeviceInfo{}}
	if b, err := os.ReadFile(h.devicesPath()); err == nil {
		var list []*DeviceInfo
		if json.Unmarshal(b, &list) == nil {
			for _, d := range list {
				d.Online = false
				d.NP = nil
				h.devices[d.ID] = d
			}
		}
	}
	return h
}

func (h *Hub) devicesPath() string { return filepath.Join(h.s.cfg.DataDir, "devices.json") }

// 设备列表延迟写盘（在线状态变化很频繁）
func (h *Hub) saveDevicesLocked() {
	if h.saveT != nil {
		return
	}
	h.saveT = time.AfterFunc(3*time.Second, func() {
		h.mu.Lock()
		h.saveT = nil
		list := make([]DeviceInfo, 0, len(h.devices))
		for _, d := range h.devices {
			cp := *d
			cp.Online = false
			cp.NP = nil
			list = append(list, cp)
		}
		h.mu.Unlock()
		b, _ := json.MarshalIndent(list, "", "  ")
		tmp := h.devicesPath() + ".tmp"
		if os.WriteFile(tmp, b, 0o600) == nil {
			os.Rename(tmp, h.devicesPath())
		}
	})
}

func (h *Hub) deviceListLocked() []DeviceInfo {
	online := map[string]bool{}
	for c := range h.conns {
		online[c.device] = true
	}
	list := make([]DeviceInfo, 0, len(h.devices))
	for _, d := range h.devices {
		cp := *d
		cp.Online = online[d.ID]
		if !cp.Online {
			cp.NP = nil
		}
		list = append(list, cp)
	}
	sort.Slice(list, func(i, j int) bool { return list[i].LastSeen > list[j].LastSeen })
	return list
}

func (h *Hub) deviceList() []DeviceInfo {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.deviceListLocked()
}

func mustJSON(v any) []byte {
	b, _ := json.Marshal(v)
	return b
}

func (c *conn) push(b []byte) {
	select {
	case <-c.done:
	case c.send <- b:
	default:
		// 对方太慢，发不过去了：断开它，重连后会重新拿到最新状态
		c.close()
	}
}

func (c *conn) close() {
	c.once.Do(func() { close(c.done) })
}

func (h *Hub) broadcastLocked(b []byte, except string) {
	for c := range h.conns {
		if c.device != except {
			c.push(b)
		}
	}
}

func (h *Hub) broadcastDevicesLocked() {
	h.broadcastLocked(mustJSON(map[string]any{"type": "devices", "list": h.deviceListLocked()}), "")
}

func (h *Hub) broadcastRev(rev int64, from string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.broadcastLocked(mustJSON(map[string]any{"type": "rev", "rev": rev, "from": from, "store": h.s.storeID}), from)
}

type inMsg struct {
	Type   string          `json:"type"`
	Key    string          `json:"key,omitempty"`
	Device *DeviceInfo     `json:"device,omitempty"`
	State  json.RawMessage `json:"state,omitempty"`
	To     string          `json:"to,omitempty"`
	Cmd    string          `json:"cmd,omitempty"`
	Data   json.RawMessage `json:"data,omitempty"`
	ID     string          `json:"id,omitempty"`
	T0     float64         `json:"t0,omitempty"`
}

func (h *Hub) serveWS(w http.ResponseWriter, r *http.Request) {
	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	ws.SetReadLimit(4 << 20)
	ip := clientIP(r)

	// 第一条消息必须是鉴权（密钥不放在网址里，避免出现在代理日志中）
	ws.SetReadDeadline(time.Now().Add(15 * time.Second))
	var first inMsg
	if err := ws.ReadJSON(&first); err != nil || first.Type != "auth" || first.Device == nil {
		ws.Close()
		return
	}
	ok, blocked := h.s.checkKey(ip, first.Key)
	if !ok || !deviceRe.MatchString(first.Device.ID) {
		msg := "密钥不对"
		if blocked {
			msg = "密钥错误次数太多，请稍后再试"
		}
		ws.WriteJSON(map[string]any{"type": "error", "error": msg, "auth": false})
		ws.Close()
		return
	}
	c := &conn{ws: ws, device: first.Device.ID, send: make(chan []byte, 256), done: make(chan struct{})}

	h.mu.Lock()
	d := h.devices[c.device]
	if d == nil {
		d = &DeviceInfo{ID: c.device}
		h.devices[c.device] = d
	}
	d.Name = trimLen(first.Device.Name, 60)
	d.Platform = trimLen(first.Device.Platform, 20)
	d.Version = trimLen(first.Device.Version, 20)
	d.LastSeen = time.Now().UnixMilli()
	d.NP = nil
	h.conns[c] = true
	h.saveDevicesLocked()
	c.push(mustJSON(map[string]any{"type": "ready", "time": time.Now().UnixMilli(), "rev": h.s.store.Rev(), "store": h.s.storeID, "devices": h.deviceListLocked()}))
	h.broadcastDevicesLocked()
	h.mu.Unlock()

	go h.writer(c)
	h.reader(c)
}

func trimLen(s string, n int) string {
	r := []rune(s)
	if len(r) > n {
		return string(r[:n])
	}
	return s
}

func (h *Hub) writer(c *conn) {
	ping := time.NewTicker(25 * time.Second)
	defer func() {
		ping.Stop()
		c.ws.Close()
	}()
	for {
		select {
		case <-c.done:
			c.ws.SetWriteDeadline(time.Now().Add(5 * time.Second))
			c.ws.WriteMessage(websocket.CloseMessage, []byte{})
			return
		case b := <-c.send:
			c.ws.SetWriteDeadline(time.Now().Add(15 * time.Second))
			if err := c.ws.WriteMessage(websocket.TextMessage, b); err != nil {
				c.close()
				return
			}
		case <-ping.C:
			c.ws.SetWriteDeadline(time.Now().Add(15 * time.Second))
			if err := c.ws.WriteMessage(websocket.PingMessage, nil); err != nil {
				c.close()
				return
			}
		}
	}
}

func (h *Hub) reader(c *conn) {
	defer func() {
		h.mu.Lock()
		delete(h.conns, c)
		if d := h.devices[c.device]; d != nil {
			d.LastSeen = time.Now().UnixMilli()
			stillOnline := false
			for o := range h.conns {
				if o.device == c.device {
					stillOnline = true
				}
			}
			if !stillOnline {
				d.NP = nil
			}
		}
		h.saveDevicesLocked()
		h.broadcastDevicesLocked()
		h.mu.Unlock()
		c.close()
	}()
	c.ws.SetReadDeadline(time.Now().Add(70 * time.Second))
	c.ws.SetPongHandler(func(string) error {
		c.ws.SetReadDeadline(time.Now().Add(70 * time.Second))
		return nil
	})
	for {
		var m inMsg
		if err := c.ws.ReadJSON(&m); err != nil {
			return
		}
		c.ws.SetReadDeadline(time.Now().Add(70 * time.Second))
		switch m.Type {
		case "ping":
			c.push(mustJSON(map[string]any{"type": "pong", "t0": m.T0, "ts": float64(time.Now().UnixNano()) / 1e6}))
		case "np":
			h.mu.Lock()
			if d := h.devices[c.device]; d != nil {
				d.NP = m.State
				d.LastSeen = time.Now().UnixMilli()
			}
			h.broadcastLocked(mustJSON(map[string]any{"type": "np", "device": c.device, "state": m.State}), c.device)
			h.mu.Unlock()
		case "cmd":
			h.mu.Lock()
			out := mustJSON(map[string]any{"type": "cmd", "from": c.device, "cmd": m.Cmd, "data": m.Data, "id": m.ID})
			sent := 0
			for o := range h.conns {
				if o.device != c.device && (m.To == "*" || o.device == m.To) {
					o.push(out)
					sent++
				}
			}
			if sent == 0 && m.ID != "" {
				c.push(mustJSON(map[string]any{"type": "cmdError", "id": m.ID, "error": "对方设备不在线"}))
			}
			h.mu.Unlock()
		case "forget":
			// 从设备列表里删掉一台不再使用的设备（它下次连上会重新出现）
			h.mu.Lock()
			online := false
			for o := range h.conns {
				if o.device == m.To {
					online = true
				}
			}
			if !online && m.To != "" {
				delete(h.devices, m.To)
				h.saveDevicesLocked()
				h.broadcastDevicesLocked()
			}
			h.mu.Unlock()
		}
	}
}
