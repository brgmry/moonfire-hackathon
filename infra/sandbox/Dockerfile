FROM python:3.12-slim

# Toolchain the agents shell out to: git for clone/blame, Node 22 for most JS repos, build-essential for native deps,
# procps/iproute2/lsof so the runner can wait on and kill servers.
RUN apt-get update && apt-get install -y --no-install-recommends \
      git curl ca-certificates build-essential procps iproute2 lsof \
 && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
 && apt-get install -y --no-install-recommends nodejs \
 && rm -rf /var/lib/apt/lists/*

# The claude-agent-sdk wheel bundles the claude CLI, so no npm install of it.
COPY sandbox/requirements.txt /app/sandbox/requirements.txt
RUN npm i -g pnpm@9 yarn \
 && pip install --no-cache-dir uv pytest -r /app/sandbox/requirements.txt

# bypassPermissions refuses to run as root unless the CLI knows it is sandboxed.
ENV IS_SANDBOX=1 CI=1 PYTHONUNBUFFERED=1 COREPACK_ENABLE_DOWNLOAD_PROMPT=0

COPY sandbox/ /app/sandbox/
WORKDIR /work

# Entry is split so an execution can swap the script: --args /app/sandbox/stub.py
ENTRYPOINT ["python"]
CMD ["/app/sandbox/main.py"]
