"""Command line entry used by the plan worker (Node). No network access, no AI calls.

  python run.py extract --out candidates.json [--labels labels.png] [--plan-dir DIR] FILE:KIND [FILE:KIND ...]
        KIND = dxf | dwg | pdf | image (JPG/PNG/WebP photo or scan). --plan-dir receives the normalised plan images
        of photo/scan levels (background of the correction editor).
  python run.py build --candidates candidates.json [--review review.json] --ifc model.ifc --preview preview.png --report report.json

Prints one JSON line on stdout; on failure {"error": code} and exit code 1.
"""
import argparse, json, os, sys, tempfile

sys.dont_write_bytecode = True


def main(argv=None):
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest='cmd', required=True)
    e = sub.add_parser('extract')
    e.add_argument('--out', required=True)
    e.add_argument('--labels')
    e.add_argument('--plan-dir')
    e.add_argument('inputs', nargs='+')
    b = sub.add_parser('build')
    b.add_argument('--candidates', required=True)
    b.add_argument('--review')
    b.add_argument('--ifc', required=True)
    b.add_argument('--preview', required=True)
    b.add_argument('--report', required=True)
    args = ap.parse_args(argv)
    if args.cmd == 'extract':
        from planextract.extract import extract
        inputs = []
        for item in args.inputs[:4]:
            path, _, kind = item.rpartition(':')
            if kind not in ('dxf', 'dwg', 'pdf', 'image'):
                raise SystemExit(2)
            inputs.append((path, kind))
        with tempfile.TemporaryDirectory(dir=os.path.dirname(os.path.abspath(args.out))) as work:
            result = extract(inputs, work, args.plan_dir)
        with open(args.out, 'w', encoding='utf-8') as f:
            json.dump(result, f, ensure_ascii=False, allow_nan=False)
        if args.labels and result['levels']:
            from planextract.preview import render
            render(result['levels'], args.labels, labels=True)
        print(json.dumps({'levels': len(result['levels']), 'skipped': result['skipped'],
                          'raster': sum(1 for l in result['levels'] if l['source']['kind'] == 'raster')}))
    else:
        from planextract.build import build
        with open(args.candidates, encoding='utf-8') as f:
            candidates = json.load(f)
        review = None
        if args.review:
            with open(args.review, encoding='utf-8') as f:
                review = json.load(f)
        result = build(candidates, review, args.ifc, args.preview)
        with open(args.report, 'w', encoding='utf-8') as f:
            json.dump(result, f, ensure_ascii=False, allow_nan=False)
        print(json.dumps({'ok': True, 'grade': result['quality']['grade']}))


if __name__ == '__main__':
    try:
        main()
    except SystemExit:
        raise
    except Exception as exc:
        print(json.dumps({'error': type(exc).__name__}))
        sys.exit(1)
