"""Repo code never sees a key. A fake repo's test prints its environment; nothing named like a secret may reach it.
Run: sandbox/.venv/bin/python -m unittest sandbox/tests/env_test.py (no network, no API key needed)."""
import asyncio
import os
import re
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

SECRET = re.compile(r"KEY|TOKEN|SECRET", re.I)
PLANTED = {
    "ANTHROPIC_API_KEY": "sk-ant-planted-single",
    "ANTHROPIC_API_KEYS": "allen:sk-ant-a,bergen:sk-ant-b",
    "ANTHROPIC_KEY_WEIGHTS": "allen:0.6,bergen:0.4",
    "ANTHROPIC_AUTH_TOKEN": "planted-auth",
    "INTERNAL_TOKEN": "planted-internal",
    "RUN_TOKEN": "planted-run",
    "GITHUB_TOKEN": "ghp_planted",
    "AWS_SECRET_ACCESS_KEY": "planted-aws",
    "MY_RANDOM_SECRET": "planted-random",
}
REPO_TEST = "#!/bin/sh\nenv\n"


def leaked(output: str) -> list[str]:
    names = [line.partition("=")[0] for line in output.splitlines() if "=" in line]
    return sorted(n for n in names if SECRET.search(n))


class RepoCodeSeesNoSecrets(unittest.TestCase):
    def setUp(self):
        self.saved = dict(os.environ)
        os.environ.update(PLANTED)
        self.repo = tempfile.mkdtemp()
        (Path(self.repo) / "test.sh").write_text(REPO_TEST)
        import keys
        keys._keys.clear(); keys._weights.clear()
        keys.load()

    def tearDown(self):
        os.environ.clear()
        os.environ.update(self.saved)

    def test_keys_load_leaves_no_key_in_the_process_env(self):
        self.assertEqual(leaked("\n".join(f"{k}=" for k in os.environ if k.startswith("ANTHROPIC"))), [])

    def test_k3_sh_runs_the_repo_test_with_a_clean_env(self):
        import k3common
        code, out, _ms = asyncio.run(k3common.sh("sh test.sh", self.repo, 20))
        self.assertEqual(code, 0, out)
        self.assertEqual(leaked(out), [])
        self.assertIn("PATH=", out)
        self.assertIn("CI=1", out)

    def test_orchestrator_sh_runs_install_with_a_clean_env(self):
        import orchestrator
        r = orchestrator.sh("sh test.sh", cwd=self.repo)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(leaked(r.stdout), [])
        self.assertIn("PATH=", r.stdout)

    def test_agents_get_their_key_explicitly_not_from_the_process_env(self):
        import k3common
        env = k3common.agent_env()
        self.assertIn(env.get("ANTHROPIC_API_KEY"), {"sk-ant-a", "sk-ant-b"})
        self.assertNotIn("ANTHROPIC_API_KEY", os.environ)


if __name__ == "__main__":
    unittest.main()
