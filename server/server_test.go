package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

func rec(k, v string, t int64) Record { return Record{K: k, V: json.RawMessage(v), T: t} }

func TestStoreMergeAndPersist(t *testing.T) {
	dir := t.TempDir()
	s, err := OpenStore(dir)
	if err != nil {
		t.Fatal(err)
	}
	n, rev, err := s.Put("devA", []Record{rec("a", `1`, 100), rec("b", `{"x":1}`, 100)})
	if err != nil || n != 2 || rev != 2 {
		t.Fatalf("put1 n=%d rev=%d err=%v", n, rev, err)
	}
	// 旧的修改不覆盖新的；新的覆盖旧的；时间相同按设备 id 比较
	n, _, _ = s.Put("devB", []Record{rec("a", `2`, 50), rec("b", `null`, 200)})
	if n != 1 {
		t.Fatalf("expected 1 accepted, got %d", n)
	}
	n, _, _ = s.Put("devC", []Record{rec("a", `3`, 100)})
	if n != 1 {
		t.Fatalf("tie: devC > devA should win, got %d", n)
	}
	n, _, _ = s.Put("devA", []Record{rec("a", `4`, 100)})
	if n != 0 {
		t.Fatalf("tie: devA < devC should lose, got %d", n)
	}
	// 自己写的记录不再发回给自己
	recs, last, more := s.Since(0, "devB", 1<<20)
	if more || last != s.Rev() {
		t.Fatalf("since: last=%d rev=%d more=%v", last, s.Rev(), more)
	}
	for _, r := range recs {
		if r.D == "devB" {
			t.Fatal("own record returned")
		}
	}
	s.Close()

	// 模拟断电：尾部写了半行
	f, _ := os.OpenFile(filepath.Join(dir, "records.jsonl"), os.O_APPEND|os.O_WRONLY, 0o600)
	f.WriteString(`{"k":"half","v":`)
	f.Close()
	s2, err := OpenStore(dir)
	if err != nil {
		t.Fatal(err)
	}
	defer s2.Close()
	if s2.Count() != 2 || string(s2.recs["a"].V) != "3" || string(s2.recs["b"].V) != "null" || s2.Rev() != 4 {
		t.Fatalf("reload wrong: count=%d a=%s b=%s rev=%d", s2.Count(), s2.recs["a"].V, s2.recs["b"].V, s2.Rev())
	}
	// 整理后还能继续追加
	if n, _, err := s2.Put("devA", []Record{rec("c", `"z"`, 300)}); n != 1 || err != nil {
		t.Fatal("append after compact failed", err)
	}
}

func TestStorePaging(t *testing.T) {
	s, _ := OpenStore(t.TempDir())
	defer s.Close()
	big := `"` + strings.Repeat("x", 1000) + `"`
	var batch []Record
	for i := 0; i < 50; i++ {
		batch = append(batch, rec("k"+string(rune('A'+i)), big, int64(100+i)))
	}
	s.Put("d1", batch)
	got := 0
	var since int64
	for pages := 0; pages < 100; pages++ {
		recs, last, more := s.Since(since, "", 10_000)
		got += len(recs)
		since = last
		if !more {
			break
		}
	}
	if got != 50 {
		t.Fatalf("paging got %d", got)
	}
}

func newTestServer(t *testing.T) (*Server, *httptest.Server) {
	cfg := &Config{Key: "secret-key-123", DataDir: t.TempDir(), Listen: "127.0.0.1:0"}
	s, err := NewServer(cfg)
	if err != nil {
		t.Fatal(err)
	}
	ts := httptest.NewServer(s.Handler())
	t.Cleanup(func() { ts.Close(); s.store.Close() })
	return s, ts
}

func call(t *testing.T, method, url, key, device string, body any) (int, map[string]any) {
	var rd *bytes.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rd = bytes.NewReader(b)
	} else {
		rd = bytes.NewReader(nil)
	}
	req, _ := http.NewRequest(method, url, rd)
	req.Header.Set("Authorization", "Bearer "+key)
	req.Header.Set("X-Veya-Device", device)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	var out map[string]any
	json.NewDecoder(resp.Body).Decode(&out)
	return resp.StatusCode, out
}

func TestHTTPAndWS(t *testing.T) {
	s, ts := newTestServer(t)
	if code, _ := call(t, "GET", ts.URL+"/api/state", "wrong", "device-a", nil); code != 401 {
		t.Fatalf("bad key should be 401, got %d", code)
	}
	// 连续输错 5 次以后暂时拒绝
	for i := 0; i < 5; i++ {
		call(t, "GET", ts.URL+"/api/state", "wrong", "device-a", nil)
	}
	if code, _ := call(t, "GET", ts.URL+"/api/state", "secret-key-123", "device-a", nil); code != 429 {
		t.Fatalf("expected 429 after many failures, got %d", code)
	}
	s.fails.Delete("127.0.0.1")

	// 设备 B 先连上实时通道
	wsURL := "ws" + strings.TrimPrefix(ts.URL, "http") + "/ws"
	wb, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer wb.Close()
	wb.WriteJSON(map[string]any{"type": "auth", "key": "secret-key-123", "device": map[string]any{"id": "device-b", "name": "手机", "platform": "android"}})
	readType := func(c *websocket.Conn, want string) map[string]any {
		c.SetReadDeadline(time.Now().Add(3 * time.Second))
		for {
			var m map[string]any
			if err := c.ReadJSON(&m); err != nil {
				t.Fatalf("waiting %s: %v", want, err)
			}
			if m["type"] == want {
				return m
			}
		}
	}
	ready := readType(wb, "ready")
	store := ready["store"].(string)

	code, out := call(t, "POST", ts.URL+"/api/push", "secret-key-123", "device-a", map[string]any{"store": store, "records": []Record{rec("list/1", `{"name":"x"}`, 1000)}})
	if code != 200 || out["accepted"].(float64) != 1 {
		t.Fatalf("push: %d %v", code, out)
	}
	if m := readType(wb, "rev"); m["rev"].(float64) != 1 || m["from"] != "device-a" {
		t.Fatalf("rev msg %v", m)
	}
	// 服务器数据被重置过：旧的 store id 推送会被拒绝
	if code, _ := call(t, "POST", ts.URL+"/api/push", "secret-key-123", "device-a", map[string]any{"store": "old", "records": []Record{rec("x", `1`, 1)}}); code != 409 {
		t.Fatalf("expected 409, got %d", code)
	}
	code, out = call(t, "GET", ts.URL+"/api/pull?since=0", "secret-key-123", "device-b", nil)
	if code != 200 || len(out["records"].([]any)) != 1 {
		t.Fatalf("pull: %d %v", code, out)
	}

	// 设备 A 连上，给 B 发指令、上报正在播放
	wa, _, _ := websocket.DefaultDialer.Dial(wsURL, nil)
	defer wa.Close()
	wa.WriteJSON(map[string]any{"type": "auth", "key": "secret-key-123", "device": map[string]any{"id": "device-a", "name": "电脑", "platform": "windows"}})
	readType(wa, "ready")
	wa.WriteJSON(map[string]any{"type": "np", "state": map[string]any{"song": "s1", "time": 12.5}})
	if m := readType(wb, "np"); m["device"] != "device-a" {
		t.Fatalf("np %v", m)
	}
	wa.WriteJSON(map[string]any{"type": "cmd", "to": "device-b", "cmd": "handoff", "data": map[string]any{"x": 1}, "id": "m1"})
	if m := readType(wb, "cmd"); m["cmd"] != "handoff" || m["from"] != "device-a" {
		t.Fatalf("cmd %v", m)
	}
	wa.WriteJSON(map[string]any{"type": "cmd", "to": "nobody", "cmd": "x", "id": "m2"})
	if m := readType(wa, "cmdError"); m["id"] != "m2" {
		t.Fatalf("cmdError %v", m)
	}
	wa.WriteJSON(map[string]any{"type": "ping", "t0": 5})
	if m := readType(wa, "pong"); m["t0"].(float64) != 5 {
		t.Fatalf("pong %v", m)
	}
	// 错误密钥的实时连接被拒绝
	wx, _, _ := websocket.DefaultDialer.Dial(wsURL, nil)
	defer wx.Close()
	wx.WriteJSON(map[string]any{"type": "auth", "key": "nope", "device": map[string]any{"id": "device-x"}})
	if m := readType(wx, "error"); m["auth"] != false {
		t.Fatalf("auth error %v", m)
	}
}
