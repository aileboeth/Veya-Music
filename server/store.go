package main

// 记录存储：每条记录 = 键 + 值 + 修改时间 + 写入设备，按「修改时间新的胜出」合并（时间相同按设备 id 比较，保证各端结果一致）。
// 值为 null 的记录是删除标记，永久保留，避免别的设备把删掉的东西又同步回来。
// 数据落盘为一个追加写入的 JSON Lines 文件，启动时整理一次（去掉被覆盖的旧行、修复断电时写了一半的尾行）。

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sort"
	"sync"
)

type Record struct {
	K string          `json:"k"`
	V json.RawMessage `json:"v"`
	T int64           `json:"t"`
	D string          `json:"d"`
	R int64           `json:"r"`
}

const (
	maxKeyLen   = 512
	maxValueLen = 24 << 20
)

type Store struct {
	mu      sync.RWMutex
	dir     string
	recs    map[string]*Record
	rev     int64
	journal *os.File
	stale   int // 日志里被覆盖掉的旧行数，多了就整理
}

func (s *Store) journalPath() string { return filepath.Join(s.dir, "records.jsonl") }

func OpenStore(dir string) (*Store, error) {
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, err
	}
	s := &Store{dir: dir, recs: map[string]*Record{}}
	if f, err := os.Open(s.journalPath()); err == nil {
		r := bufio.NewReaderSize(f, 1<<20)
		for {
			line, err := r.ReadBytes('\n')
			if len(bytes.TrimSpace(line)) > 0 {
				var rec Record
				// 断电时写了一半的行解析失败，直接跳过
				if json.Unmarshal(line, &rec) == nil && rec.K != "" {
					cp := rec
					s.recs[rec.K] = &cp
					if rec.R > s.rev {
						s.rev = rec.R
					}
				}
			}
			if err != nil {
				break
			}
		}
		f.Close()
	} else if !errors.Is(err, os.ErrNotExist) {
		return nil, err
	}
	if err := s.compact(); err != nil {
		return nil, err
	}
	return s, nil
}

// compact 把当前所有记录按版本号顺序重写成新日志（原子替换），然后以追加方式打开
func (s *Store) compact() error {
	if s.journal != nil {
		s.journal.Close()
		s.journal = nil
	}
	tmp := s.journalPath() + ".tmp"
	f, err := os.OpenFile(tmp, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	w := bufio.NewWriterSize(f, 1<<20)
	for _, rec := range s.sortedLocked() {
		b, _ := json.Marshal(rec)
		w.Write(b)
		w.WriteByte('\n')
	}
	if err := w.Flush(); err != nil {
		f.Close()
		return err
	}
	if err := f.Sync(); err != nil {
		f.Close()
		return err
	}
	f.Close()
	if err := os.Rename(tmp, s.journalPath()); err != nil {
		return err
	}
	s.stale = 0
	s.journal, err = os.OpenFile(s.journalPath(), os.O_APPEND|os.O_WRONLY, 0o600)
	return err
}

func (s *Store) sortedLocked() []*Record {
	out := make([]*Record, 0, len(s.recs))
	for _, r := range s.recs {
		out = append(out, r)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].R < out[j].R })
	return out
}

func (s *Store) Rev() int64 {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.rev
}

func (s *Store) Count() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.recs)
}

// newer 判断 a 是否应该覆盖 b
func newer(a, b *Record) bool {
	if b == nil {
		return true
	}
	if a.T != b.T {
		return a.T > b.T
	}
	return a.D > b.D
}

var errBadRecord = errors.New("bad record")

// Put 合并一批记录，返回被接受的条数和合并后的版本号
func (s *Store) Put(device string, recs []Record) (int, int64, error) {
	for i := range recs {
		r := &recs[i]
		if r.K == "" || len(r.K) > maxKeyLen || len(r.V) > maxValueLen || r.T <= 0 {
			return 0, 0, errBadRecord
		}
		if len(r.V) == 0 {
			r.V = json.RawMessage("null")
		}
		r.D = device
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	var buf bytes.Buffer
	accepted := 0
	for i := range recs {
		in := recs[i]
		ex := s.recs[in.K]
		if !newer(&in, ex) {
			continue
		}
		if ex != nil {
			s.stale++
		}
		s.rev++
		in.R = s.rev
		cp := in
		s.recs[in.K] = &cp
		b, _ := json.Marshal(&cp)
		buf.Write(b)
		buf.WriteByte('\n')
		accepted++
	}
	if accepted > 0 {
		if _, err := s.journal.Write(buf.Bytes()); err != nil {
			return 0, 0, err
		}
		if err := s.journal.Sync(); err != nil {
			return 0, 0, err
		}
		if s.stale > 2000 && s.stale > len(s.recs) {
			if err := s.compact(); err != nil {
				return accepted, s.rev, err
			}
		}
	}
	return accepted, s.rev, nil
}

// Since 返回版本号大于 since 的记录（按版本号排序），单次最多约 maxBytes 字节。
// skipDevice 非空时跳过这台设备自己写入的记录（它本地已经有了）。
// 返回值：记录、本页最后一条的版本号（客户端下次从这里继续）、是否还有更多
func (s *Store) Since(since int64, skipDevice string, maxBytes int) ([]*Record, int64, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	all := make([]*Record, 0)
	for _, r := range s.recs {
		if r.R > since {
			all = append(all, r)
		}
	}
	sort.Slice(all, func(i, j int) bool { return all[i].R < all[j].R })
	out := make([]*Record, 0)
	size := 0
	last := since
	for i, r := range all {
		if size > 0 && size+len(r.V)+len(r.K) > maxBytes {
			return out, last, i < len(all)
		}
		last = r.R
		if skipDevice != "" && r.D == skipDevice {
			continue
		}
		out = append(out, r)
		size += len(r.V) + len(r.K) + 64
	}
	if len(all) == 0 {
		last = s.rev
	}
	return out, last, false
}

func (s *Store) Close() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.journal != nil {
		s.journal.Close()
		s.journal = nil
	}
}
