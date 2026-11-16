//go:build !windows

package main

import (
	"fmt"
	"os"
	"os/exec"
	"syscall"
)

func execScript(script string, args []string) error {
	bash, err := exec.LookPath("bash")
	if err != nil {
		return fmt.Errorf("需要 bash")
	}
	return syscall.Exec(bash, append([]string{"bash", script}, args...), os.Environ())
}
