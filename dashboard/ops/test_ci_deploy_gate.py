import copy
import importlib.util
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

OPS = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('gate', OPS / 'ci-deploy-gate.py')
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)
SHA = 'a' * 40
REPO = 'owner/project'


class GateTests(unittest.TestCase):
    def setUp(self):
        self.run = dict(head_sha=SHA, head_branch='main', event='push',
                        head_repository={'full_name': REPO}, run_number=10,
                        run_attempt=1, status='completed', conclusion='success')
        self.runs = {w: [copy.deepcopy(self.run)] for w in gate.WORKFLOWS}
        self.main = SHA

    def get(self, path):
        if path.endswith('/commits/main'):
            return {'sha': self.main}
        for workflow in gate.WORKFLOWS:
            if '/' + workflow + '/' in path:
                return {'workflow_runs': self.runs[workflow]}
        raise AssertionError(path)

    def test_only_current_main_with_both_successful_push_runs(self):
        self.assertTrue(gate.ready(REPO, SHA, self.get))
        self.main = 'b' * 40
        self.assertFalse(gate.ready(REPO, SHA, self.get))

    def test_missing_pending_failed_and_cancelled_never_publish(self):
        for state, conclusion in [('queued', None), ('in_progress', None),
                                  ('completed', 'failure'), ('completed', 'cancelled')]:
            with self.subTest(state=state, conclusion=conclusion):
                self.runs['ios.yml'][0].update(status=state, conclusion=conclusion)
                self.assertFalse(gate.ready(REPO, SHA, self.get))
        self.runs['ios.yml'] = []
        self.assertFalse(gate.ready(REPO, SHA, self.get))

    def test_pr_runs_forks_other_branches_and_other_commits_do_not_count(self):
        for field, value in [('event', 'pull_request'), ('head_branch', 'feature'),
                             ('head_sha', 'b' * 40), ('head_repository', {'full_name': 'fork/project'})]:
            with self.subTest(field=field):
                self.runs['ios.yml'] = [{**self.run, field: value}]
                self.assertFalse(gate.ready(REPO, SHA, self.get))

    def test_newer_failed_or_pending_run_wins_over_old_success(self):
        for extra in [dict(run_number=11, status='queued', conclusion=None),
                      dict(run_attempt=2, conclusion='failure')]:
            self.runs['ios.yml'] = [self.run, {**self.run, **extra}]
            self.assertFalse(gate.ready(REPO, SHA, self.get))

    def test_invalid_commit_cannot_be_interpolated_into_ssh(self):
        for sha in ['', 'main', SHA + ';whoami', 'A' * 40, '\n' + SHA]:
            self.assertFalse(gate.ready(REPO, sha, lambda _: self.fail('must reject before API request')))

    def test_forced_ssh_command_rejects_shells_arguments_and_forwarded_commands(self):
        for command in ['', 'bash', 'deploy main', 'deploy ' + SHA + '; id',
                        'deploy ' + SHA + ' extra', 'deploy ' + 'A' * 40]:
            result = subprocess.run(['sh', str(OPS / 'auto-deploy-command.sh')],
                                    env={**os.environ, 'SSH_ORIGINAL_COMMAND': command}, capture_output=True)
            self.assertEqual(result.returncode, 64, command)


class DeploymentTests(unittest.TestCase):
    def run_deploy(self, fail=''):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / 'repo/dashboard').mkdir(parents=True)
            (root / 'bin').mkdir()
            source = (OPS / 'deploy.sh').read_text()
            for directory in ['/var/lock', '/var/backups/d21', '/var/lib/d21-deploy']:
                destination = root / directory.lstrip('/')
                destination.mkdir(parents=True, exist_ok=True)
                source = source.replace(directory, str(destination))
            (root / 'deploy.sh').write_text(source)
            # All external operations are recorded; no server, database or network is touched.
            fake = '''#!/bin/sh
name=${0##*/}
printf '%s %s\n' "$name" "$*" >> "$CALLS"
case "$name $*" in
  'git rev-parse FETCH_HEAD') printf '%s\n' "$TARGET" ;;
  'docker-compose -p d21 ps -q db') echo existing-database ;;
  'docker-compose -p d21 exec -T db sh -c '*) [ "$FAIL" != backup ] || exit 1; echo backup ;;
  'docker-compose -p d21 exec -T db pg_restore --list') [ "$FAIL" != verify ] ;;
  'docker-compose -p d21 build') [ "$FAIL" != build ] ;;
  'docker-compose -p d21 ps -q '*) echo application ;;
  'docker inspect '*) if [ "$FAIL" = worker ]; then echo false; else echo true; fi ;;
  'curl '*) [ "$FAIL" != health ] ;;
esac
'''
            for name in ['git', 'docker-compose', 'docker', 'flock', 'curl', 'sleep']:
                executable = root / 'bin' / name
                executable.write_text(fake)
                executable.chmod(0o700)
            env = {**os.environ, 'PATH': str(root / 'bin') + ':' + os.environ['PATH'],
                   'CALLS': str(root / 'calls'), 'FAIL': fail, 'TARGET': SHA,
                   'D21_REPO_DIR': str(root / 'repo'),
                   'D21_DEPLOY_COMMIT': 'b' * 40 if fail == 'outdated' else SHA}
            result = subprocess.run(['sh', str(root / 'deploy.sh')], env=env, capture_output=True)
            calls = (root / 'calls').read_text()
            marker = root / 'var/lib/d21-deploy/last-successful-commit'
            return result, calls, marker.read_text() if marker.exists() else None

    def test_backup_and_build_precede_app_replacement_database_never_recreated(self):
        result, calls, marker = self.run_deploy()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertLess(calls.index('pg_dump'), calls.index('pg_restore'))
        self.assertLess(calls.index('pg_restore'), calls.index('d21 build'))
        self.assertLess(calls.index('d21 build'), calls.index('rm -sf'))
        self.assertIn('up --no-build --no-deps -d api web plan-worker ifc-worker', calls)
        self.assertNotIn('down', calls)
        self.assertEqual(marker.strip(), SHA)

    def test_failed_backup_verification_or_build_preserves_running_apps(self):
        for failure in ['backup', 'verify', 'build']:
            with self.subTest(failure=failure):
                result, calls, marker = self.run_deploy(failure)
                self.assertNotEqual(result.returncode, 0)
                self.assertNotIn('rm -sf', calls)
                self.assertIsNone(marker)

    def test_obsolete_commit_skips_before_backup_or_build(self):
        result, calls, marker = self.run_deploy('outdated')
        self.assertEqual(result.returncode, 0)
        self.assertIn(b'SKIPPED', result.stdout)
        self.assertNotIn('docker-compose', calls)
        self.assertIsNone(marker)

    def test_failed_health_or_stopped_worker_never_marks_release_successful(self):
        for failure in ['health', 'worker']:
            result, calls, marker = self.run_deploy(failure)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('pg_restore', calls)
            self.assertIsNone(marker)


if __name__ == '__main__':
    unittest.main()
