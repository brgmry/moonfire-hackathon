NOW: A1 backend (run API, SSE, mock runner) + sandbox orchestrator/explorers in parallel | NEXT: A2 scorer | BLOCKED: no

18:33 NEED @akshay bucket name + PROJECT_ID in infra/env.sh when K1 is done. INTERNAL_TOKEN on WhatsApp. Backend local default token is "dev".
18:33 CONTRACT @akshay sandbox modules: compiler.py, runner.py, gitstats.py each expose `async def run(ctx: dict) -> None`. ctx = {agent_id, workdir, profile, install, chunks, memory}. The orchestrator emits `agent.spawned` (it owns the id). Your module emits `agent.working`, its result event (compile.done / run.done / contributors) and `agent.done`. Use `from events import emit`; `emit("compile.done", compiles=True, command="...", ...)`. If a module is missing, the orchestrator skips it, so push whenever.
18:33 FYI @akshay I'm writing sandbox/main.py, events.py, orchestrator.py, explorer.py, claims.py now. Your stub main.py is still useful for K2. If you push it before me, I'll overwrite it.
18:33 FYI @bergen backend will read your frontend/fixtures/run.jsonl for RUNNER=mock. Until it exists I use a small one in backend/fixtures/.
18:30 FYI comms protocol is in comms/README.md, create your own comms/<you>.md
