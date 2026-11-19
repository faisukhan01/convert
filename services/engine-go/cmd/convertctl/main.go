// Command convertctl is the operator CLI for the RidgeLine Go engine:
// ping, health, stats, events, replay and demo-fire against a running
// engine over HTTP. Zero external dependencies; exit codes are
// script-friendly (0 ok, 1 transport error, 2 usage error).
//
//	$ convertctl --addr localhost:8088 stats
//	$ convertctl events --status FAILED --limit 20
//	$ convertctl replay --limit 50
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	_ "github.com/faisukhan01/convert/services/engine-go/internal/version" // embed identity
)

const usage = `convertctl — RidgeLine engine operator CLI

Usage:
  convertctl [global flags] <command> [command flags]

Commands:
  ping                 check the engine answers
  health               detailed /healthz payload
  stats                operational snapshot (/v1/stats)
  events               list journal events (--status, --limit)
  contacts             list the projection (--limit)
  replay               re-drive recoverable events (--limit)
  demo-fire            self-fire a signed demo webhook (ENGINE_DEV only)
  version              print convertctl identity

Global flags:
  --addr   engine address (default http://localhost:8088)
  --timeout  request timeout (default 10s)

Examples:
  convertctl ping
  convertctl --addr http://engine.internal:8088 stats
  convertctl events --status FAILED --limit 20
`

func main() {
	if len(os.Args) < 2 {
		fmt.Fprint(os.Stderr, usage)
		os.Exit(2)
	}
	// Manual scan: first bare token is the command; --addr/--timeout are
	// global and may appear anywhere; everything else goes to the sub-flagset.
	var cmd, addr string
	var timeout time.Duration
	addr = "http://localhost:8088"
	timeout = 10 * time.Second

	var rest []string
	args := os.Args[1:]
	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "--addr", "-addr":
			if i+1 < len(args) {
				i++
				addr = args[i]
			}
		case "--timeout", "-timeout":
			if i+1 < len(args) {
				i++
				if d, err := time.ParseDuration(args[i]); err == nil {
					timeout = d
				}
			}
		case "help", "--help", "-h":
			fmt.Print(usage)
			return
		default:
			if cmd == "" {
				cmd = args[i]
			} else {
				rest = append(rest, args[i])
			}
		}
	}
	if cmd == "" {
		fmt.Fprint(os.Stderr, usage)
		os.Exit(2)
	}

	sub := flag.NewFlagSet(cmd, flag.ContinueOnError)
	limit := sub.Int("limit", 50, "max items")
	status := sub.String("status", "", "filter by journal status")
	body := sub.String("body", "", "demo payload type")
	if err := sub.Parse(rest); err != nil {
		os.Exit(2)
	}
	run(cmd, addr, timeout, *limit, *status, *body)
}

func run(cmd, addr string, timeout time.Duration, limit int, status, body string) {
	client := &http.Client{Timeout: timeout}
	base := strings.TrimRight(addr, "/")

	var err error
	switch cmd {
	case "ping":
		err = ping(client, base)
	case "health":
		err = get(client, base, "/healthz")
	case "stats":
		err = get(client, base, "/v1/stats")
	case "version":
		fmt.Println("convertctl 1.0.0 (client for ridgeline-engine-go)")
	case "events":
		q := "/v1/events?limit=" + itoa(limit)
		if status != "" {
			q += "&status=" + status
		}
		err = get(client, base, q)
	case "contacts":
		err = get(client, base, "/v1/contacts?limit="+itoa(limit))
	case "replay":
		err = post(client, base, "/v1/replay?limit="+itoa(max(limit, 1)), nil)
	case "demo-fire":
		typ := firstNonEmpty(body, "form.submitted")
		payload := map[string]string{
			"type":       typ,
			"locationId": "demo-location",
			"contactId":  "demo-contact-1",
			"name":       "Demo Homeowner",
		}
		if strings.Contains(typ, "form") || strings.Contains(typ, "survey") {
			payload["formName"] = "Roof Estimate Intake"
		}
		if strings.Contains(typ, "message") {
			payload["message"] = "Can we move my appointment to Friday?"
		}
		err = postJSON(client, base, "/v1/demo/fire", payload)
	default:
		fmt.Fprint(os.Stderr, usage)
		os.Exit(2)
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

func ping(c *http.Client, base string) error {
	start := time.Now()
	resp, err := c.Get(base + "/healthz")
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("health returned %s", resp.Status)
	}
	fmt.Printf("pong %s (%s)\n", base, time.Since(start).Round(time.Millisecond))
	return nil
}

func get(c *http.Client, base, path string) error {
	resp, err := c.Get(base + path)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	return printJSON(resp)
}

func post(c *http.Client, base, path string, _ any) error {
	req, err := http.NewRequest(http.MethodPost, base+path, nil)
	if err != nil {
		return err
	}
	resp, err := c.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	return printJSON(resp)
}

func postJSON(c *http.Client, base, path string, payload any) error {
	b, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	req, err := http.NewRequest(http.MethodPost, base+path, strings.NewReader(string(b)))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	return printJSON(resp)
}

func printJSON(resp *http.Response) error {
	var v any
	dec := json.NewDecoder(resp.Body)
	if err := dec.Decode(&v); err != nil {
		return fmt.Errorf("decode %s: %w", resp.Status, err)
	}
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	return enc.Encode(v)
}

func itoa(n int) string { return fmt.Sprintf("%d", n) }

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
