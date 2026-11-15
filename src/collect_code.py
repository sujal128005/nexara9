#!/usr/bin/env python3
"""Copy each project's source code into the site, with secrets and personal details masked.

Usage:  python3 src/collect_code.py <folder-with-clones>

For every project below it reads the clone, keeps source files only (no images, PDFs, lock files,
vendored libraries or large data), masks anything that looks like a secret or personal detail,
and writes each file as plain text to  code/<slug>/<hash>.txt  (served as text/plain, so a browser
never runs it as a page on this site; names are short hashes of the path). It also writes src/code-index.json, which the page builder
uses to draw the clickable file tree.
"""
import hashlib, json, os, re, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'code')
INDEX = os.path.join(ROOT, 'src', 'code-index.json')

PROJECTS = {
    'udaan': 'Project-Udaan', 'moodie-foodie': 'moodie-foodie', 'nexgen': 'NexGen_Study_Guardian',
    'binance-futures-bot': 'binance-futures-trading-bot', 'finance-api': 'finance_backend', 'khata': 'khata',
    'stealth': 'bouncerkya', 'paypal-attribute': 'paypal-attribute', 'flexdrop': 'FlexDrop',
    'pixelproof': 'Qwen', 'arthanetra': 'ArthaNetra',
}

CODE_EXT = {'.py', '.ts', '.tsx', '.js', '.mjs', '.cjs', '.jsx', '.html', '.htm', '.css', '.scss', '.sql', '.json',
            '.yaml', '.yml', '.toml', '.md', '.txt', '.ino', '.cpp', '.cc', '.c', '.h', '.hpp', '.sh', '.bat', '.ps1',
            '.prisma', '.mako', '.ini', '.cfg', '.example', '.service', '.conf', '.l', '.y', '.svg'}
NAMED = {'Dockerfile', 'Makefile', 'Procfile', '.gitignore', '.env.example', 'work-flow logic', 'LICENSE'}
SKIP_DIRS = ('node_modules/', 'vendor/', '/vendor/', 'dist/', 'build/', '.next/', 'docs/images/', 'docs/screenshots/',
             'docs/deck/', 'data/demo/images/', 'models/', '__pycache__/', 'coverage/', 'public/fonts/')
SKIP_FILES = {'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'poetry.lock', 'bot.log'}
SKIP_EXT = {'.patch', '.jsonl', '.csv', '.log', '.map', '.min.js', '.lock'}
MAX_BYTES = 220_000          # anything bigger is linked to GitHub instead
SVG_MAX = 20_000

LANG = {'.py': 'python', '.ts': 'typescript', '.tsx': 'typescript', '.js': 'javascript', '.mjs': 'javascript',
        '.cjs': 'javascript', '.jsx': 'javascript', '.html': 'xml', '.htm': 'xml', '.svg': 'xml', '.css': 'css',
        '.scss': 'scss', '.sql': 'sql', '.json': 'json', '.yaml': 'yaml', '.yml': 'yaml', '.toml': 'ini',
        '.ini': 'ini', '.cfg': 'ini', '.md': 'markdown', '.ino': 'cpp', '.cpp': 'cpp', '.cc': 'cpp', '.c': 'c',
        '.h': 'cpp', '.hpp': 'cpp', '.sh': 'bash', '.bat': 'dos', '.ps1': 'powershell', '.prisma': 'typescript',
        '.l': 'cpp', '.y': 'cpp', '.conf': 'nginx', '.service': 'ini', '.mako': 'python'}
NAMED_LANG = {'Dockerfile': 'dockerfile', 'Makefile': 'makefile', 'work-flow logic': 'plaintext'}

# ---------------------------------------------------------------- masking
PLACEHOLDER_HINT = re.compile(r'(?i)(config\.|settings\.|your|xxx|example|placeholder|changeme|change_me|dummy|fake|test[_-]?key|\.\.\.|<|\$\{|process\.env|os\.environ|getenv|env\(|\*\*\*)')
RULES = [
    ('private key', re.compile(r'-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]+?-----END [A-Z ]*PRIVATE KEY-----'), '-----BEGIN PRIVATE KEY-----\nADD_YOUR_PRIVATE_KEY_HERE\n-----END PRIVATE KEY-----'),
    ('Anthropic key', re.compile(r'sk-ant-[A-Za-z0-9_\-]{12,}'), 'YOUR_ANTHROPIC_API_KEY_HERE'),
    ('OpenAI-style key', re.compile(r'\bsk-(?:proj-)?[A-Za-z0-9]{20,}'), 'YOUR_API_KEY_HERE'),
    ('Groq key', re.compile(r'\bgsk_[A-Za-z0-9]{20,}'), 'YOUR_GROQ_API_KEY_HERE'),
    ('Google key', re.compile(r'\bAIza[0-9A-Za-z_\-]{30,}'), 'YOUR_GOOGLE_API_KEY_HERE'),
    ('Razorpay key', re.compile(r'\brzp_(?:test|live)_[A-Za-z0-9]{10,}'), 'YOUR_RAZORPAY_KEY_HERE'),
    ('GitHub token', re.compile(r'\b(?:ghp|gho|ghs|ghu)_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{30,}'), 'YOUR_GITHUB_TOKEN_HERE'),
    ('AWS key', re.compile(r'\bAKIA[0-9A-Z]{16}\b'), 'YOUR_AWS_ACCESS_KEY_HERE'),
    ('Slack token', re.compile(r'\bxox[abprs]-[A-Za-z0-9-]{10,}'), 'YOUR_SLACK_TOKEN_HERE'),
    ('JWT', re.compile(r'\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}'), 'YOUR_TOKEN_HERE'),
]
ASSIGN = re.compile(r'(?i)((?:api[_-]?key|secret|token|password|passwd|pwd|client[_-]?secret|access[_-]?key|private[_-]?key|auth[_-]?key)[A-Za-z0-9_]*["\']?[ \t]*[:=][ \t]*)(["\'])([^"\'\s\[\]{}()<>]{8,})(\2)')
ENV_LINE = re.compile(r'(?m)^([A-Z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD|PASS)[A-Z0-9_]*[ \t]*=[ \t]*)([^\s#"\']{8,})[ \t]*$')
EMAIL = re.compile(r'(?<![:/\w.%+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b')
EMAIL_OK = re.compile(r'(?i)@(?:[a-z0-9-]+\.)*(?:example|test|invalid|localhost)(?:\.[a-z]+)?$|noreply|no-reply|@anthropic\.com$|@users\.noreply\.github\.com$|\.internal$|\.local$')
PHONE = re.compile(r'(?<![\w.])(?:\+91[\s-]?|0091[\s-]?)[6-9]\d{4}[\s-]?\d{5}(?!\d)|(?<=tel:)\+?\d[\d\s-]{8,}\d')

PHONE_BARE = re.compile(r'(?<![\w.+-])[6-9]\d{9}(?![\w.])')

def mask(text):
    hits = []
    for name, rx, repl in RULES:
        text, n = rx.subn(repl, text)
        if n: hits.append(f'{name} x{n}')
    def assign(m):
        if PLACEHOLDER_HINT.search(m.group(3)) or len(set(m.group(3))) < 5: return m.group(0)
        hits.append('secret value')
        return f'{m.group(1)}{m.group(2)}YOUR_SECRET_HERE{m.group(4)}'
    text = ASSIGN.sub(assign, text)
    def env(m):
        if PLACEHOLDER_HINT.search(m.group(2)): return m.group(0)
        hits.append('secret in env line')
        return f'{m.group(1)}YOUR_VALUE_HERE'
    text = ENV_LINE.sub(env, text)
    def email(m):
        if EMAIL_OK.search(m.group(0)): return m.group(0)
        hits.append('email')
        return 'name@example.com'
    text = EMAIL.sub(email, text)
    def phone(m):
        hits.append('phone')
        return '+91 XXXXX XXXXX'
    text = PHONE.sub(phone, text)
    def bare(m):
        hits.append('phone')
        return 'XXXXXXXXXX'
    text = PHONE_BARE.sub(bare, text)
    return text, hits

# ---------------------------------------------------------------- selection
def wanted(path, size):
    base = os.path.basename(path)
    low = path.lower()
    if base in SKIP_FILES or any(low.endswith(e) for e in SKIP_EXT): return False
    if any(d in ('/' + path) for d in ['/' + s if not s.startswith('/') else s for s in SKIP_DIRS]): return False
    if base == '.env' or (base.startswith('.env') and not base.endswith('.example')): return False   # never real env files
    ext = os.path.splitext(base)[1].lower()
    if base not in NAMED and ext not in CODE_EXT: return False
    if ext == '.svg' and size > SVG_MAX: return False
    return True

def collect(src, slug):
    repo_dir = os.path.join(src, PROJECTS[slug])
    files = subprocess.run(['git', '-C', repo_dir, 'ls-files'], capture_output=True, text=True, check=True).stdout.split('\n')
    branch = subprocess.run(['git', '-C', repo_dir, 'rev-parse', '--abbrev-ref', 'HEAD'], capture_output=True, text=True).stdout.strip() or 'main'
    out = []; report = []
    for path in sorted(f for f in files if f):
        full = os.path.join(repo_dir, path)
        if not os.path.isfile(full): continue
        size = os.path.getsize(full)
        if not wanted(path, size): continue
        entry = {'path': path, 'bytes': size}
        base = os.path.basename(path); ext = os.path.splitext(base)[1].lower()
        entry['lang'] = NAMED_LANG.get(base) or LANG.get(ext, 'plaintext')
        if size > MAX_BYTES:
            entry['large'] = True; out.append(entry); continue
        try:
            text = open(full, encoding='utf-8').read()
        except UnicodeDecodeError:
            continue
        text, hits = mask(text)
        if hits:
            entry['masked'] = True; report.append(f'  {path}: {", ".join(hits)}')
        entry['lines'] = text.count('\n') + (0 if text.endswith('\n') else 1)
        key = hashlib.sha1(path.encode()).hexdigest()[:16]   # plain, safe file names (no dots, brackets or spaces)
        entry['key'] = key
        dest = os.path.join(OUT, slug, key + '.txt')
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        with open(dest, 'w', encoding='utf-8') as f: f.write(text)
        out.append(entry)
    return {'repo': f'sujal128005/{PROJECTS[slug]}', 'branch': branch, 'files': out}, report

def main():
    src = sys.argv[1]
    if os.path.isdir(OUT):
        import shutil; shutil.rmtree(OUT)
    index = {}
    for slug in PROJECTS:
        index[slug], report = collect(src, slug)
        n = len(index[slug]['files']); lines = sum(f.get('lines', 0) for f in index[slug]['files'])
        print(f'{slug}: {n} files, {lines} lines' + (f', masked in {len(report)} file(s)' if report else ''))
        for r in report: print(r)
    with open(INDEX, 'w') as f: json.dump(index, f, indent=1)

if __name__ == '__main__':
    main()
