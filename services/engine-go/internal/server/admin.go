package server

import (
	"crypto/subtle"
	"net/http"

	"github.com/faisukhan01/convert/services/engine-go/internal/httpx"
)

// withAdmin guards administrative endpoints behind a bearer token.
// The token is compared in constant time; an unset token disables all
// admin routes (fail-closed) unless the engine runs in dev mode.
func withAdmin(adminToken string, devMode bool, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		provided := bearer(r)
		if adminToken == "" {
			if devMode {
				// Dev mode: requests are allowed but explicitly marked so
				// operators notice when tokens are missing.
				w.Header().Set("X-Admin-Mode", "dev-unauthenticated")
				next.ServeHTTP(w, r)
				return
			}
			httpx.WriteErr(w, http.StatusForbidden, "admin_disabled",
				"admin routes require ENGINE_ADMIN_TOKEN to be configured")
			return
		}
		if provided == "" {
			httpx.WriteErr(w, http.StatusUnauthorized, "admin_unauthorized",
				"missing admin token (Authorization: Bearer <ENGINE_ADMIN_TOKEN> or X-Admin-Token)")
			return
		}
		if subtle.ConstantTimeCompare([]byte(provided), []byte(adminToken)) != 1 {
			httpx.WriteErr(w, http.StatusUnauthorized, "admin_unauthorized", "invalid admin token")
			return
		}
		next.ServeHTTP(w, r)
	})
}

// bearer extracts the token from the Authorization header or X-Admin-Token.
func bearer(r *http.Request) string {
	if h := r.Header.Get("X-Admin-Token"); h != "" {
		return h
	}
	auth := r.Header.Get("Authorization")
	const prefix = "Bearer "
	if len(auth) > len(prefix) && equalFoldPrefix(auth, prefix) {
		return auth[len(prefix):]
	}
	return ""
}

func equalFoldPrefix(s, prefix string) bool {
	if len(s) < len(prefix) {
		return false
	}
	for i := 0; i < len(prefix); i++ {
		a := s[i]
		b := prefix[i]
		if a >= 'A' && a <= 'Z' {
			a += 32
		}
		if b >= 'A' && b <= 'Z' {
			b += 32
		}
		if a != b {
			return false
		}
	}
	return true
}
