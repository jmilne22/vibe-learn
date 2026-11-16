"""Tests for the doctor.py that the Python reporter brief supplies.

The doctor source arrives on stdin, so the test always checks the authored text.
"""
import contextlib
import io
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

doctor = types.ModuleType("doctor")
exec(compile(sys.stdin.read(), "authored-doctor.py", "exec"), doctor.__dict__)


class DoctorTests(unittest.TestCase):
    def check(self, flags=(), missing=(), version=(3, 13, 0), pyproject=None, rate=None):
        with tempfile.TemporaryDirectory() as folder:
            if pyproject is not None:
                Path(folder, "pyproject.toml").write_text(pyproject, encoding="utf-8")
            before = sorted(p.name for p in Path(folder).iterdir())
            out = io.StringIO()
            with patch.object(doctor.shutil, "which", side_effect=lambda n: None if n in missing else "/bin/" + n), \
                    patch.object(doctor, "run", return_value=(0, "version ok")), \
                    patch.object(doctor, "rate_limit", side_effect=rate) as limit, \
                    contextlib.redirect_stdout(out):
                status = doctor.main(list(flags), folder=folder, version=version)
            self.assertEqual(before, sorted(p.name for p in Path(folder).iterdir()))
        return status, out.getvalue(), limit

    def test_new_folder_is_next_and_stays_offline(self):
        status, text, limit = self.check()
        self.assertEqual(status, 0)
        self.assertIn("NEXT pyproject.toml: not found", text)
        self.assertNotIn("GitHub", text)
        limit.assert_not_called()

    def test_old_python_fails(self):
        status, text, _ = self.check(version=(3, 10, 12))
        self.assertEqual(status, 1)
        self.assertIn("FAIL python3: 3.10.12", text)

    def test_missing_uv_fails_but_other_checks_run(self):
        status, text, _ = self.check(missing=("uv",))
        self.assertEqual(status, 1)
        self.assertIn("FAIL uv: not found on PATH", text)
        self.assertIn("OK   task", text)
        self.assertIn("pyproject.toml", text)

    def test_missing_task_only_warns(self):
        status, text, _ = self.check(missing=("task",))
        self.assertEqual(status, 0)
        self.assertIn("WARN task: not found on PATH", text)

    def test_pyproject_packages(self):
        status, text, _ = self.check(pyproject='dependencies = ["requests>=2"]\n')
        self.assertEqual(status, 0)
        self.assertIn("OK   pyproject.toml: lists requests", text)
        self.assertIn("NEXT pyproject.toml: does not list pytest yet", text)

    def test_online_reports_the_remaining_requests(self):
        status, text, limit = self.check(flags=("--online",), rate=lambda: (55, 60))
        self.assertEqual(status, 0)
        self.assertIn("OK   GitHub: 55 of 60 requests remain", text)
        limit.assert_called_once()
        status, text, _ = self.check(flags=("--online",), rate=lambda: (3, 60))
        self.assertEqual(status, 0)
        self.assertIn("WARN GitHub: 3 of 60", text)

    def test_no_network_is_a_warning(self):
        status, text, _ = self.check(flags=("--online",), rate=OSError("no route"))
        self.assertEqual(status, 0)
        self.assertIn("WARN GitHub: no answer (no route)", text)

    def test_run_stops_slow_and_missing_commands(self):
        for error in (doctor.subprocess.TimeoutExpired("x", 10), FileNotFoundError("x")):
            with patch.object(doctor.subprocess, "run", side_effect=error):
                self.assertEqual(doctor.run(["x"])[0], 1)


if __name__ == "__main__":
    unittest.main()
