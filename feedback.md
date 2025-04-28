To:      Senior Software Engineer
Subject: Implementing “Era-of-Experience” Principles in tinycrops-geminiapp
Priority: High – this is our new technical North Star

Overview
The current codebase gives us a solid CRUD memory system, tool-calling Gemini chat, and an embryonic Artifact layer. To align the project with Silver & Sutton’s “Era of Experience” paper we must evolve the agent from “episodic Q&A + static memory” to a continuously learning, environment-grounded, reward-optimising system. Below is a pragmatic, engineering-centric set of instructions that maps the paper’s four big ideas—Streams, Grounded Actions/Observations, Grounded Rewards, and Planning/Reasoning—onto the existing repo.

────────────────────────────────────────

Treat Every User Session as a Stream ──────────────────────────────────────── 1.1 Rename/Refactor • Replace the “chat session” map in server.js with a StreamManager class that: – generates stream_id (UUID) – persists minimal metadata in DB (Streams table: id, user_id, start_ts, last_active_ts, status). – emits ‘tick’ events (e.g., per user request) so later we can attach intrinsic motivation and scheduled learning.
1.2  Episode Buffer
• In geminiMemory.sendMessageWithMemory add rolling episode buffering:
– Append {role, content, ts} to a temp EpisodesBuffer in Redis or in-process mem (bounded by N messages or Δt).
– When buffer closes (heuristic or explicit ‘endEpisode’ call) flush to Memory DB with episode_id.
• Add salience placeholder columns now (experience_plan.md Phase 1) so we can compute novelty later.

1.3  Stream TTL & Resume
• Add /api/streams/resume/:id that reloads StreamManager state, artifacts, last N memories.

────────────────────────────────────────
2. Make the Agent Truly Interactive
────────────────────────────────────────
2.1  Tool Catalogue
• Promote functionDeclarations to a versioned JSON file tools/v1.json.
• Add “EXECUTE_CODE”, “WEB_SEARCH”, “SQL_RUNNER” placeholders but gate behind feature flags so we can progressively roll out.

2.2  Sandbox Layer
• Stand-up a minimal dockerised sandbox service (Phase 8 of plan) exposing /sandbox/execute. Use Firecracker or Docker with resource caps.
• Add tool handler runCode({language, snippet}) that forwards to sandbox and returns stdout/stderr.

2.3  Feedback Capture
• After each tool call, write a ToolObservation row:
id | stream_id | episode_id | tool | args | result | error | ts

────────────────────────────────────────
3. Ground Rewards
────────────────────────────────────────
3.1  Reward Schema
• Create Rewards table: id, stream_id, source (enum: intrinsic|extrinsic|human), signal, value, ts.

3.2  Intrinsic Metrics MVP
• Novelty: cosine distance between current episode embedding and top-k previous (use OpenAI/Gemini embedding endpoint).
• Success/Failure: parse tool result for exit code == 0, set +1 / -1.
• Store both as intrinsic rewards.

3.3  Human Feedback Hook
• Add simple thumbs-up/down UI button in public/app.js → POST /api/rewards with {stream_id, value}.
• Persist as human reward.

────────────────────────────────────────
4. Continual Learning Loop
────────────────────────────────────────
4.1  ReplayScheduler Micro-service
• New cron job (node-cron) that every 15 min:
– selects top-k episodes by salience + recency.
– feeds them to Summarizer chain (gemini summarization prompt)
– registers summary as memory (type=summary) and writes derived Reward if model judged it “useful”.

4.2  Self-Reflection
• Implement Summarizer summariseEpisodes(episode_ids[]) → summary_text, embedding.
• Attach summary artifact context://summary#<uuid> so later tools can reference.

4.3  Value Function Stub
• Add rl/valueFunction.js with an interface predictReward(embedding) => expected_return.
• Initially random; we’ll train it once we accumulate data (>1 k episodes).

────────────────────────────────────────
5. Planning & World-Model
────────────────────────────────────────
5.1  WorldModel Module
• worldModel/predict(toolObservationHistory, candidate_action) → predicted_reward, conf.
Start with a trivial heuristic (e.g., optimistic value of unseen tools) so plumbing exists.

5.2  Planner
• Given N candidate tool calls the agent can ask worldModel to rank them before execution.
• Wire this into function handler selectToolAction in geminiMemory. Keep feature flag OFF by default.

────────────────────────────────────────
6. Engineering Hygiene
────────────────────────────────────────
6.1  Migrations
• All new tables via Knex migrations (never via imperative setup scripts).
• Add npm script “db:migrate”.

6.2  Type Safety & Tests
• Migrate memoryOperations.js and new RL modules to TypeScript (ts-node works with knex).
• Unit tests for: reward calculation, episode chunking, replay scheduler (jest).

6.3  Observability
• Add winston structured logging (json) with labels: stream_id, episode_id, tool, reward.
• Expose /metrics prometheus endpoint (counter: rewards_total, gauge: active_streams).

────────────────────────────────────────
7. Roll-out & Milestones (5-Week Cadence)
────────────────────────────────────────
Week 1: Streams & Episodes (Sections 1)
Week 2: Tool catalogue + Sandbox MVP (Section 2)
Week 3: Reward pipeline & UI feedback (Section 3)
Week 4: ReplayScheduler + Summaries (Section 4)
Week 5: World-model stub, metrics, TS migration (Sections 5-6)

Definition-of-Done for Phase-1 (end of Week 5)
✓ Continuous episode logging per stream
✓ Novelty & execution-success rewards stored and queryable
✓ ReplayScheduler writes summary memories
✓ Sandbox executes user code snippets safely
✓ CI passes (jest + eslint + tsc)

Make sure each PR:
• ships DB migration + rollback
• includes unit test(s)
• updates docs/architecture.md

Let’s discuss any questions befor