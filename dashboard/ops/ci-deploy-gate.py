"""Allow only the current main SHA with successful push runs of both CI workflows."""
import json
import os
import re
import urllib.request
from pathlib import Path

WORKFLOWS = ('backend.yml', 'ios.yml')


def ready(repository, sha, get):
    if not re.fullmatch(r'[a-f0-9]{40}', sha or ''):
        return False
    base = f'/repos/{repository}'
    if get(base + '/commits/main')['sha'] != sha:
        return False
    for workflow in WORKFLOWS:
        runs = get(f'{base}/actions/workflows/{workflow}/runs?event=push&branch=main&head_sha={sha}&per_page=100')['workflow_runs']
        matching = [r for r in runs if r['head_sha'] == sha and r['head_branch'] == 'main'
                    and r['event'] == 'push' and r['head_repository']['full_name'] == repository]
        if not matching:
            return False
        latest = max(matching, key=lambda r: (r['run_number'], r.get('run_attempt', 1)))
        if latest['status'] != 'completed' or latest['conclusion'] != 'success':
            return False
    return True


def main():
    repository = os.environ['GITHUB_REPOSITORY']
    event = json.loads(Path(os.environ['GITHUB_EVENT_PATH']).read_text())
    token = os.environ['GH_TOKEN']

    def get(path):
        req = urllib.request.Request('https://api.github.com' + path, headers={
            'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28'})
        with urllib.request.urlopen(req, timeout=30) as response:
            return json.load(response)

    sha = (event.get('workflow_run') or {}).get('head_sha') or os.environ['GITHUB_SHA']
    allowed = ready(repository, sha, get)
    with open(os.environ['GITHUB_OUTPUT'], 'a') as output:
        output.write(f'ready={str(allowed).lower()}\nsha={sha if allowed else ""}\n')
    print('Current main has passed both push workflows.' if allowed else
          'Skipped: outdated commit or required main checks not yet successful.')


if __name__ == '__main__':
    main()
