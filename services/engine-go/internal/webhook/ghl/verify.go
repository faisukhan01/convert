package ghl

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"strings"
)

// Signature header conventions supported by the verifier.
const (
	// HeaderSignature is the canonical header: "sha256=<hex>".
	HeaderSignature = "X-Webhook-Signature"
	// HeaderSignatureAlt is the provider-alternate header name some GHL
	// workflow configurations emit. Both are accepted for compatibility.
	HeaderSignatureAlt = "X-GHL-Signature"
)

// ErrMissingHeader is returned when no signature header is present.
var ErrMissingHeader = errors.New("ghl: missing signature header")

// ErrBadFormat is returned when the header cannot be parsed as a hex digest.
var ErrBadFormat = errors.New("ghl: malformed signature header")

// VerifySignature checks an HMAC-SHA256 hex digest over raw against the
// shared secret. It accepts the "sha256=" prefix and bare-hex forms, and is
// constant-time to prevent timing oracles (mirrors src/lib/crypto.ts).
func VerifySignature(secret string, raw []byte, headerValue string) error {
	if headerValue == "" {
		return ErrMissingHeader
	}
	provided := strings.TrimPrefix(strings.TrimSpace(headerValue), "sha256=")
	provided = strings.ToLower(provided)
	if len(provided) != sha256.Size*2 {
		return ErrBadFormat
	}
	providedBytes, err := hex.DecodeString(provided)
	if err != nil {
		return ErrBadFormat
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(raw)
	expected := mac.Sum(nil)
	if hmac.Equal(providedBytes, expected) {
		return nil
	}
	return errors.New("ghl: signature mismatch")
}

// Sign produces the canonical signature for outbound tests and the demo
// self-fire endpoint ("sha256=<hex>" form).
func Sign(secret string, raw []byte) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(raw)
	return "sha256=" + hex.EncodeToString(mac.Sum(nil))
}
