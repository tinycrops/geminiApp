 # Detailed Implementation Plan: Era of Experience
 
 This document lays out a step-by-step plan to extend our Gemini agent with experiential learning capabilities, following the “Era of Experience” framework. Each phase builds on the previous to enable continual learning from self-generated experience.
 
 ---
 ## Phase 0: Preparation
 - Review existing memory schema and code in `memoryOperations.js`, `geminiMemory.js`, and `dbConfig.js`.
 - Ensure database migration workflow is in place and test environment is configured.
 
 ## Phase 1: Data Model & Schema Changes
 1. Extend the `Memories` table:
    - Add columns:
      - `episode_id` (string, not null, indexed)
      - `salience_score` (float, default = 0)
      - `type` (string enum: `raw`, `summary`)
 2. Update or create migration in `setupMemoryDatabase.js` to add these fields.
 3. (Optional) Create an `Episodes` table:
    - Columns: `id` (PK), `session_id`, `start_ts`, `end_ts`, `metadata`.
 
 ## Phase 2: Experience Capture Hooks
 1. In `geminiMemory.js` (or middleware), wrap each agent interaction:
    - Generate or retrieve `episode_id`.
    - Record `session_id`, `episode_id`, `input`, `output`, `timestamp`.
 2. In `memoryOperations.js`, add:
    ```js
    createMemory({ session_id, episode_id, content, type = 'raw', metadata })
    ```
    - Ensure embeddings are generated and stored.
 3. Write unit tests to validate memory capture.
 
 ## Phase 3: Episodic Chunking & Salience Scoring
 1. Implement `EpisodeManager`:
    - Methods: `startEpisode(session_id)`, `endEpisode(episode_id)`, `getEpisodes(session_id)`.
 2. Compute salience on episode end:
    - Novelty via embedding distance to prior episodes.
    - Success/failure or emotional valence via LLM analysis.
 3. Persist `salience_score` to `Episodes` or propagate to associated memories.
 
 ## Phase 4: Experience Replay & Prioritized Sampling
 1. Build `ReplayScheduler` service:
    - Configurable interval or cron trigger.
    - Query top-N episodes by `salience_score` or recency.
 2. For each episode:
    - Re-run through agent (e.g. `summarizeEpisode(episode_id)`).
    - Optionally update embeddings or prompts.
 3. Store distilled summaries as `type = 'summary'` in `Memories`.
 
 ## Phase 5: Meta-Reflection & Summarizer Agent
 1. Create `Summarizer` component:
    ```js
    summarize(episodeIds: string[]): Promise<string>
    ```
 2. Integrate into `ReplayScheduler` or a dedicated `ReflectionScheduler`.
 3. Persist high-level summaries as artifacts or summary memories.
 
 ## Phase 6: Intrinsic-Motivation Reward Signal
 1. Define reward metrics:
    - Novelty: distance to nearest k past embeddings.
    - Surprise: divergence between predicted vs. actual outputs.
 2. Expose scoring API:
    ```js
    scoreCuriosity(session_id: string, input: string): number
    ```
 3. Use scores to prioritize episodes in `ReplayScheduler`.
 
 ## Phase 7: Experience Graph & Knowledge-Linking
 1. Implement `ExperienceGraph` module:
    - Store nodes (episodes/summaries) and edges (`from_node`, `to_node`, `type`).
 2. On episode or summary creation:
    - Extract entities/topics via NER or clustering.
    - Create semantic edges between related nodes.
 
 ## Phase 8: Simulated “Playgrounds” for Self-Training
 1. Define sandbox services (code executor, math solver, SQL runner).
 2. Expose endpoints:
    - `/sandbox/code`
    - `/sandbox/math`
    - `/sandbox/sql`
 3. Enable agent to generate tasks, execute them, and store results as episodes.
 
 ## Phase 9: Human-in-the-Loop Annotation
 1. Build CLI or web UI to list memories/episodes.
 2. Commands:
    ```bash
    annotate-memory --id <memory_id> --score <+1|0|-1>
    ```
 3. Store annotations in `metadata.annotations` field.
 
 ## Phase 10: Adaptive Context Window
 1. Implement `ContextManager`:
    - Allocate context budget between live conversation and retrieved memories.
 2. Configuration options:
    - `max_context_tokens`
    - `memory_fraction`
 3. Dynamically select memories by salience and novelty each request.
 
 ## Phase 11: Privacy & Session Scoping
 1. Tag all records with `session_id`.
 2. Implement TTL or manual purge:
    ```bash
    cleanup-session --session_id <id>
    ```
 3. Schedule cron job to delete data older than configured retention.
 
 ---
 ## Deliverables & Acceptance Criteria
 - Migration scripts for all schema changes with accompanying tests.
 - Memory capture verified by automated tests.
 - Episodic chunking and salience scoring producing non-zero scores.
 - ReplayScheduler runs end-to-end and produces summary memories.
 - Graph edges created for related episodes.
 - CLI/Web endpoints for annotation and cleanup operational.
 - Pre-commit checks pass on all new files.
 
 ---
 ## Milestones & Timeline
 Week  | Scope
 ----- | ---------------------------------------
 1     | Phase 1–2
 2     | Phase 3–4
 3     | Phase 5–6
 4     | Phase 7–8
 5     | Phase 9–11 and final integration
 
 ---
 Begin implementation following the phases above, tracking progress via issue tickets or a kanban board.