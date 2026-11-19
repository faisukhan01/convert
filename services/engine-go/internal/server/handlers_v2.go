package server

import (
	"net/http"
	"strings"

	"github.com/faisukhan01/convert/services/engine-go/internal/ai"
	"github.com/faisukhan01/convert/services/engine-go/internal/eventlog"
	"github.com/faisukhan01/convert/services/engine-go/internal/ghlapi"
	"github.com/faisukhan01/convert/services/engine-go/internal/httpx"
	"github.com/faisukhan01/convert/services/engine-go/internal/rules"
	"github.com/faisukhan01/convert/services/engine-go/internal/scoring"
	"github.com/faisukhan01/convert/services/engine-go/internal/store/pg"
)

// Services carries the optional integrations attached at boot. Nil members
// degrade their endpoints to a 503 with a clear message instead of panicking.
type Services struct {
	GHL     *ghlapi.Executor
	DB      *pg.Store
	Rules   *rules.Set
	Tracker *scoring.Tracker
	AI      *ai.Client
}

// Attach installs the integrations (called once at boot, before Listen).
func (s *Server) Attach(svc *Services) {
	s.svc = svc
}

// requireService is a guard that renders a 503 envelope when an integration
// is not wired (e.g. engine booted without DATABASE_URL).
func (s *Server) requireService(w http.ResponseWriter, name string, present bool) bool {
	if present {
		return true
	}
	httpx.WriteErr(w, http.StatusServiceUnavailable, "integration_missing",
		name+" is not configured on this engine instance")
	return false
}

// ───────────────────────── rules ─────────────────────────

// handleRulesGet lists the active ruleset with match statistics.
func (s *Server) handleRulesGet(w http.ResponseWriter, _ *http.Request) {
	if !s.requireService(w, "rules engine", s.svc != nil && s.svc.Rules != nil) {
		return
	}
	set := s.svc.Rules
	httpx.WriteOK(w, http.StatusOK, map[string]any{
		"count": set.Count(),
		"rules": set.All(),
	})
}

// handleRulesPut replaces the ruleset from JSON. Admin token required.
func (s *Server) handleRulesPut(w http.ResponseWriter, r *http.Request) {
	if !s.requireService(w, "rules engine", s.svc != nil && s.svc.Rules != nil) {
		return
	}
	var payload struct {
		Rules []rules.Rule `json:"rules"`
	}
	if err := httpx.DecodeJSON(w, r, &payload, 256<<10); err != nil {
		httpx.WriteErr(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	if err := s.svc.Rules.Replace(payload.Rules); err != nil {
		httpx.WriteErr(w, http.StatusUnprocessableEntity, "invalid_rules", err.Error())
		return
	}
	httpx.WriteOK(w, http.StatusOK, map[string]any{"count": s.svc.Rules.Count()})
}

// handleRulesReset clears rule match statistics.
func (s *Server) handleRulesReset(w http.ResponseWriter, _ *http.Request) {
	if !s.requireService(w, "rules engine", s.svc != nil && s.svc.Rules != nil) {
		return
	}
	s.svc.Rules.Reset()
	httpx.WriteOK(w, http.StatusOK, map[string]any{"reset": true})
}

// ───────────────────────── scoring ─────────────────────────

// handleScore returns the lead temperature for a contact.
func (s *Server) handleScore(w http.ResponseWriter, r *http.Request) {
	if !s.requireService(w, "lead scoring", s.svc != nil && s.svc.Tracker != nil) {
		return
	}
	q := r.URL.Query()
	location := q.Get("locationId")
	contact := q.Get("contactId")
	if location == "" || contact == "" {
		httpx.WriteErr(w, http.StatusBadRequest, "bad_request", "locationId and contactId are required")
		return
	}
	res := s.svc.Tracker.Score(location, contact)
	httpx.WriteOK(w, http.StatusOK, map[string]any{
		"locationId": location,
		"contactId":  contact,
		"score":      res.Score,
		"band":       string(res.Band),
		"reasons":    res.Reasons,
		"signals":    res.Signals,
		"lastSeen":   res.LastSeen,
	})
}

// ───────────────────────── AI brain ─────────────────────────

// handleAIQualify runs the z.ai qualification (with deterministic fallback)
// over a supplied lead context. Useful for demos, review tooling and the
// TypeScript app's "why is this lead hot?" panel.
func (s *Server) handleAIQualify(w http.ResponseWriter, r *http.Request) {
	if !s.requireService(w, "ai brain", s.svc != nil && s.svc.AI != nil) {
		return
	}
	var in ai.LeadInput
	if err := httpx.DecodeJSON(w, r, &in, 128<<10); err != nil {
		httpx.WriteErr(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	verdict, err := s.svc.AI.QualifyLead(r.Context(), in)
	if err != nil {
		httpx.WriteErr(w, http.StatusInternalServerError, "ai_error", err.Error())
		return
	}
	httpx.WriteOK(w, http.StatusOK, map[string]any{"verdict": verdict})
}

// handleAIReply drafts an outbound reply for a lead context.
func (s *Server) handleAIReply(w http.ResponseWriter, r *http.Request) {
	if !s.requireService(w, "ai brain", s.svc != nil && s.svc.AI != nil) {
		return
	}
	var in ai.ReplyInput
	if err := httpx.DecodeJSON(w, r, &in, 64<<10); err != nil {
		httpx.WriteErr(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	switch strings.ToLower(in.Channel) {
	case "sms", "email":
		in.Channel = strings.ToLower(in.Channel)
	default:
		in.Channel = "sms"
	}
	text, blocked, err := s.svc.AI.DraftReply(r.Context(), in)
	if err != nil {
		httpx.WriteErr(w, http.StatusInternalServerError, "ai_error", err.Error())
		return
	}
	httpx.WriteOK(w, http.StatusOK, map[string]any{
		"blocked": blocked,
		"channel": in.Channel,
		"text":    text,
	})
}

// ───────────────────────── GHL passthroughs ─────────────────────────

// handleGHLStatus reports the client wiring without leaking the token.
func (s *Server) handleGHLStatus(w http.ResponseWriter, _ *http.Request) {
	if !s.requireService(w, "GoHighLevel executor", s.svc != nil && s.svc.GHL != nil) {
		return
	}
	client := s.svc.GHL.Client()
	httpx.WriteOK(w, http.StatusOK, map[string]any{
		"configured": client.Configured(),
		"token":      client.MaskedToken(),
		"locationId": client.LocationID(),
		"dryRun":     s.svc.GHL.DryRun(),
	})
}

// handleGHLPipelines lists pipelines with stages (read-only proxy).
func (s *Server) handleGHLPipelines(w http.ResponseWriter, r *http.Request) {
	if !s.requireService(w, "GoHighLevel executor", s.svc != nil && s.svc.GHL != nil) {
		return
	}
	pipelines, err := s.svc.GHL.Client().ListPipelines(r.Context())
	if err != nil {
		httpx.WriteErr(w, http.StatusBadGateway, "ghl_error", err.Error())
		return
	}
	httpx.WriteOK(w, http.StatusOK, map[string]any{"pipelines": pipelines, "count": len(pipelines)})
}

// handleGHLContactUpsert creates or updates a contact (admin write path).
func (s *Server) handleGHLContactUpsert(w http.ResponseWriter, r *http.Request) {
	if !s.requireService(w, "GoHighLevel executor", s.svc != nil && s.svc.GHL != nil) {
		return
	}
	var contact ghlapi.Contact
	if err := httpx.DecodeJSON(w, r, &contact, 64<<10); err != nil {
		httpx.WriteErr(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	if contact.Email == "" && contact.Phone == "" {
		httpx.WriteErr(w, http.StatusUnprocessableEntity, "invalid_contact", "email or phone is required")
		return
	}
	saved, err := s.svc.GHL.Client().UpsertContact(r.Context(), &contact)
	if err != nil {
		httpx.WriteErr(w, http.StatusBadGateway, "ghl_error", err.Error())
		return
	}
	httpx.WriteOK(w, http.StatusOK, map[string]any{"contact": saved})
}

// handleGHLContactGet fetches a contact by id (read-only proxy).
func (s *Server) handleGHLContactGet(w http.ResponseWriter, r *http.Request) {
	if !s.requireService(w, "GoHighLevel executor", s.svc != nil && s.svc.GHL != nil) {
		return
	}
	id := strings.TrimPrefix(r.URL.Path, "/v1/ghl/contacts/")
	if id == "" {
		httpx.WriteErr(w, http.StatusBadRequest, "bad_request", "contact id path segment required")
		return
	}
	contact, err := s.svc.GHL.Client().GetContact(r.Context(), id)
	if err != nil {
		if ghlapi.IsNotFound(err) {
			httpx.WriteErr(w, http.StatusNotFound, "not_found", "contact does not exist")
			return
		}
		httpx.WriteErr(w, http.StatusBadGateway, "ghl_error", err.Error())
		return
	}
	httpx.WriteOK(w, http.StatusOK, map[string]any{"contact": contact})
}

// handleGHLContactTags adds or removes tags (admin write path).
func (s *Server) handleGHLContactTags(w http.ResponseWriter, r *http.Request) {
	if !s.requireService(w, "GoHighLevel executor", s.svc != nil && s.svc.GHL != nil) {
		return
	}
	id := strings.TrimPrefix(strings.TrimSuffix(r.URL.Path, "/tags"), "/v1/ghl/contacts/")
	var body struct {
		Add    []string `json:"add"`
		Remove []string `json:"remove"`
	}
	if err := httpx.DecodeJSON(w, r, &body, 16<<10); err != nil {
		httpx.WriteErr(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	client := s.svc.GHL.Client()
	if len(body.Add) > 0 {
		if err := client.AddTags(r.Context(), id, body.Add...); err != nil {
			httpx.WriteErr(w, http.StatusBadGateway, "ghl_error", err.Error())
			return
		}
	}
	if len(body.Remove) > 0 {
		if err := client.RemoveTags(r.Context(), id, body.Remove...); err != nil {
			httpx.WriteErr(w, http.StatusBadGateway, "ghl_error", err.Error())
			return
		}
	}
	httpx.WriteOK(w, http.StatusOK, map[string]any{"updated": true, "contactId": id})
}

// handleGHLOpportunityCreate opens a new pipeline card (admin write path).
func (s *Server) handleGHLOpportunityCreate(w http.ResponseWriter, r *http.Request) {
	if !s.requireService(w, "GoHighLevel executor", s.svc != nil && s.svc.GHL != nil) {
		return
	}
	var opp ghlapi.Opportunity
	if err := httpx.DecodeJSON(w, r, &opp, 64<<10); err != nil {
		httpx.WriteErr(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	if opp.ContactID == "" || opp.PipelineID == "" || opp.PipelineStageID == "" {
		httpx.WriteErr(w, http.StatusUnprocessableEntity, "invalid_opportunity",
			"contactId, pipelineId and pipelineStageId are required")
		return
	}
	created, err := s.svc.GHL.Client().CreateOpportunity(r.Context(), &opp)
	if err != nil {
		httpx.WriteErr(w, http.StatusBadGateway, "ghl_error", err.Error())
		return
	}
	httpx.WriteOK(w, http.StatusOK, map[string]any{"opportunity": created})
}

// ───────────────────────── durable store ─────────────────────────

// handleStoreStats reports Postgres pool health and table aggregates.
func (s *Server) handleStoreStats(w http.ResponseWriter, r *http.Request) {
	if !s.requireService(w, "postgres store", s.svc != nil && s.svc.DB != nil) {
		return
	}
	ctx := r.Context()
	eventCounts, err := s.svc.DB.CountEventsByStatus(ctx)
	if err != nil {
		httpx.WriteErr(w, http.StatusInternalServerError, "store_error", err.Error())
		return
	}
	actionCounts, _ := s.svc.DB.CountActionsByKind(ctx)
	total, optedOut, _ := s.svc.DB.ContactTotals(ctx)
	totalActions, failedActions, _ := s.svc.DB.ActionTotals(ctx)

	httpx.WriteOK(w, http.StatusOK, map[string]any{
		"pool":     s.svc.DB.Stats(ctx),
		"events":   eventCounts,
		"actions":  map[string]any{"byKind": actionCounts, "total": totalActions, "failed": failedActions},
		"contacts": map[string]any{"total": total, "optedOut": optedOut},
	})
}

// handleStoreEvents lists durable events straight from Postgres.
func (s *Server) handleStoreEvents(w http.ResponseWriter, r *http.Request) {
	if !s.requireService(w, "postgres store", s.svc != nil && s.svc.DB != nil) {
		return
	}
	limit := clampInt(queryInt(r, "limit", 50), 1, 500)
	events, err := s.svc.DB.ListEvents(r.Context(), limit, eventlog.Status(r.URL.Query().Get("status")))
	if err != nil {
		httpx.WriteErr(w, http.StatusInternalServerError, "store_error", err.Error())
		return
	}
	httpx.WriteOK(w, http.StatusOK, map[string]any{"count": len(events), "events": events})
}

// handleStoreActions lists the durable action audit trail.
func (s *Server) handleStoreActions(w http.ResponseWriter, r *http.Request) {
	if !s.requireService(w, "postgres store", s.svc != nil && s.svc.DB != nil) {
		return
	}
	limit := clampInt(queryInt(r, "limit", 50), 1, 500)
	kind := r.URL.Query().Get("kind")
	actions, err := s.svc.DB.ListActions(r.Context(), limit, kind)
	if err != nil {
		httpx.WriteErr(w, http.StatusInternalServerError, "store_error", err.Error())
		return
	}
	httpx.WriteOK(w, http.StatusOK, map[string]any{"count": len(actions), "actions": actions})
}
