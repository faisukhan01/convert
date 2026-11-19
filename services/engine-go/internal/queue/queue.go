// Package queue implements a bounded, priority-aware job queue with a
// worker pool, per-job retries and exponential backoff with jitter.
// Urgent actions (opt-outs, confirmations) preempt routine work.
package queue

import (
	"container/heap"
	"context"
	"errors"
	"log/slog"
	"math/rand"
	"sync"
	"time"

	"github.com/faisukhan01/convert/services/engine-go/internal/action"
)

// ErrFull is returned when the bounded queue has no capacity.
var ErrFull = errors.New("queue: capacity reached")

// Job wraps an action with execution metadata.
type Job struct {
	Action    action.Action
	Attempts  int
	NextRunAt time.Time
	seq       uint64
}

// jobHeap is a min-heap ordered by (priority, NextRunAt, seq).
type jobHeap []*Job

func (h jobHeap) Len() int { return len(h) }
func (h jobHeap) Less(i, j int) bool {
	pi, pj := h[i].Action.Priority, h[j].Action.Priority
	if pi != pj {
		return pi < pj
	}
	if !h[i].NextRunAt.Equal(h[j].NextRunAt) {
		return h[i].NextRunAt.Before(h[j].NextRunAt)
	}
	return h[i].seq < h[j].seq
}
func (h jobHeap) Swap(i, j int) { h[i], h[j] = h[j], h[i] }
func (h *jobHeap) Push(x any)   { *h = append(*h, x.(*Job)) }
func (h *jobHeap) Pop() any {
	old := *h
	n := len(old)
	item := old[n-1]
	old[n-1] = nil
	*h = old[:n-1]
	return item
}

// Handler executes a single action. Returning an error triggers a retry
// with backoff until MaxAttempts is exhausted.
type Handler func(ctx context.Context, a action.Action) error

// Queue is the bounded priority queue with workers.
type Queue struct {
	mu       sync.Mutex
	cond     *sync.Cond
	heap     jobHeap
	capacity int
	seq      atomicU64
	handlers map[string]Handler
	workers  int
	maxAtt   int
	baseBack time.Duration
	maxBack  time.Duration
	running  bool
	stopCh   chan struct{}
	wg       sync.WaitGroup

	// stats
	accepted  uint64
	completed uint64
	failed    uint64
	retries   uint64
	dropped   uint64
}

// atomicU64 is a tiny wrapper to avoid importing sync/atomic everywhere.
type atomicU64 struct {
	mu sync.Mutex
	v  uint64
}

func (a *atomicU64) next() uint64 {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.v++
	return a.v
}

// New constructs a queue. Start must be called to launch workers.
func New(capacity, workers, maxAttempts int, baseBackoff, maxBackoff time.Duration) *Queue {
	if capacity < 16 {
		capacity = 16
	}
	if workers < 1 {
		workers = 1
	}
	q := &Queue{
		heap:     make(jobHeap, 0, capacity),
		capacity: capacity,
		handlers: make(map[string]Handler),
		workers:  workers,
		maxAtt:   maxAttempts,
		baseBack: baseBackoff,
		maxBack:  maxBackoff,
		stopCh:   make(chan struct{}),
	}
	q.cond = sync.NewCond(&q.mu)
	heap.Init(&q.heap)
	return q
}

// Register attaches a handler for an action kind. Unknown kinds are logged
// and completed as no-ops by the worker (forward compatibility).
func (q *Queue) Register(kind string, h Handler) {
	q.mu.Lock()
	defer q.mu.Unlock()
	q.handlers[kind] = h
}

// Enqueue adds an action with its natural RunAt. Returns ErrFull when full.
func (q *Queue) Enqueue(a action.Action) error {
	q.mu.Lock()
	defer q.mu.Unlock()
	if len(q.heap) >= q.capacity {
		q.dropped++
		return ErrFull
	}
	j := &Job{Action: a, NextRunAt: a.RunAt, seq: q.seq.next()}
	heap.Push(&q.heap, j)
	q.accepted++
	q.cond.Signal()
	return nil
}

// Len reports current queue depth.
func (q *Queue) Len() int {
	q.mu.Lock()
	defer q.mu.Unlock()
	return len(q.heap)
}

// Stats returns queue counters.
func (q *Queue) Stats() map[string]uint64 {
	q.mu.Lock()
	defer q.mu.Unlock()
	return map[string]uint64{
		"depth":     uint64(len(q.heap)),
		"accepted":  q.accepted,
		"completed": q.completed,
		"failed":    q.failed,
		"retries":   q.retries,
		"dropped":   q.dropped,
	}
}

// Start launches the worker pool. Calling Start twice is a no-op.
func (q *Queue) Start(ctx context.Context) {
	q.mu.Lock()
	if q.running {
		q.mu.Unlock()
		return
	}
	q.running = true
	q.mu.Unlock()

	for i := 0; i < q.workers; i++ {
		q.wg.Add(1)
		go q.worker(ctx, i)
	}
	slog.Info("queue workers started", "workers", q.workers, "capacity", q.capacity)
}

// Stop signals workers to finish and waits for the pool to drain.
func (q *Queue) Stop() {
	close(q.stopCh)
	q.cond.Broadcast()
	q.wg.Wait()
}

// worker drains the heap until stop is signaled.
func (q *Queue) worker(ctx context.Context, id int) {
	defer q.wg.Done()
	for {
		q.mu.Lock()
		for len(q.heap) == 0 {
			select {
			case <-q.stopCh:
				q.mu.Unlock()
				return
			default:
			}
			q.cond.Wait()
			select {
			case <-q.stopCh:
				q.mu.Unlock()
				return
			default:
			}
		}
		job := heap.Pop(&q.heap).(*Job)
		q.mu.Unlock()

		if wait := time.Until(job.NextRunAt); wait > 0 {
			select {
			case <-time.After(wait):
			case <-q.stopCh:
				return
			case <-ctx.Done():
				return
			}
		}
		q.execute(ctx, job)
	}
}

// execute runs the handler and manages retry/backoff.
func (q *Queue) execute(ctx context.Context, job *Job) {
	q.mu.Lock()
	h, known := q.handlers[job.Action.Kind]
	q.mu.Unlock()

	var err error
	switch {
	case known:
		err = safeCall(ctx, h, job.Action)
	default:
		slog.Debug("no handler registered; completing as no-op", "kind", job.Action.Kind)
	}

	if err == nil {
		q.mu.Lock()
		q.completed++
		q.mu.Unlock()
		return
	}

	job.Attempts++
	if job.Attempts >= q.maxAtt {
		slog.Warn("job dead after retries", "kind", job.Action.Kind, "attempts", job.Attempts, "err", err)
		q.mu.Lock()
		q.failed++
		q.mu.Unlock()
		return
	}

	// exponential backoff with full jitter, capped
	back := q.baseBack * (1 << min32(job.Attempts, 20))
	if back > q.maxBack {
		back = q.maxBack
	}
	back = time.Duration(rand.Int63n(int64(back)) + 1) //nolint:gosec // jitter only
	job.NextRunAt = time.Now().Add(back)

	q.mu.Lock()
	heap.Push(&q.heap, job)
	q.retries++
	q.cond.Signal()
	q.mu.Unlock()
	slog.Info("job scheduled for retry", "kind", job.Action.Kind, "attempt", job.Attempts, "backoff", back)
}

// safeCall isolates handler panics so one bad action never kills a worker.
func safeCall(ctx context.Context, h Handler, a action.Action) (err error) {
	defer func() {
		if r := recover(); r != nil {
			err = errors.New("handler panic recovered")
		}
	}()
	return h(ctx, a)
}

func min32(a, b int) int {
	if a < b {
		return a
	}
	return b
}
