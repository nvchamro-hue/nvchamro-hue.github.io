from pathlib import Path
import re

path = Path('script.js')
text = path.read_text('utf-8')

# Replace direct fetch(SCRIPT_URL, { method: 'POST', body: JSON.stringify(payload) }) calls
pattern = re.compile(
    r'(?P<prefix>\bawait\s+|const\s+\w+\s*=\s+)?'
    r'fetch\(\s*SCRIPT_URL\s*,\s*\{\s*'
    r'method\s*:\s*["\']POST["\']\s*'
    r'(?:,\s*mode\s*:\s*["\'][^"\']+["\']\s*)?'
    r',\s*body\s*:\s*JSON\.stringify\(\s*(?P<payload>[^)]+?)\s*\)\s*\}\s*\)',
    re.DOTALL,
)

new_text, count = pattern.subn(lambda m: f"{m.group('prefix') or ''}requestAppsScript({m.group('payload')})", text)
print(f'Replaced {count} direct fetch(SCRIPT_URL) calls.')

path.write_text(new_text, 'utf-8')
