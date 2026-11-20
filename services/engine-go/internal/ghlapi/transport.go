package ghlapi

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"strings"
)

// encodeBody marshals the request payload; nil yields a nil reader.
func encodeBody(body any) io.Reader {
	if body == nil {
		return nil
	}
	buf, err := json.Marshal(body)
	if err != nil {
		// Marshaling of SDK request shapes is total; fall back to null.
		return strings.NewReader("null")
	}
	return bytes.NewReader(buf)
}

// decodeJSON decodes a successful response into out.
func decodeJSON(resp *http.Response, out any) error {
	dec := json.NewDecoder(resp.Body)
	return dec.Decode(out)
}

// readBodyString drains the body for error reporting (bounded).
func readBodyString(resp *http.Response) string {
	const maxBytes = 8 << 10
	buf := make([]byte, 0, 512)
	chunk := make([]byte, 1024)
	total := 0
	for {
		n, err := resp.Body.Read(chunk)
		if n > 0 {
			total += n
			if total > maxBytes {
				buf = append(buf, chunk[:maxBytes-total+n]...)
				break
			}
			buf = append(buf, chunk[:n]...)
		}
		if err != nil {
			break
		}
	}
	return string(buf)
}
