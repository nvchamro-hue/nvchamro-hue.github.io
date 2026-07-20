from pathlib import Path
import re

path = Path('script.js')
text = path.read_text(encoding='utf-8')

pattern1 = re.compile(r"(async function editUser\(username\) \{\n\n    try \{\n\n        const response = await requestAppsScript\(\{ action: 'get_user', username: username \}\);\n\n\n)(        const result = await response\.json\(\);)(\n\n\n        if \(result\.status === 'success'\) \{)", re.M)
replacement1 = r"\1        const result = response && typeof response.json === 'function' ? await response.json() : response;\3"
text, count1 = pattern1.subn(replacement1, text, count=1)

pattern2 = re.compile(r"(                const updateResponse = await requestAppsScript\(\{ \n\n                        action: 'update_user', \n\n                        username: username,\n\n                        userData: formValues\n\n                    \}\);\n\n\n)(                const updateResult = await updateResponse\.json\(\);)(\n\n                Swal\.close\(\);)", re.M)
replacement2 = r"\1                const updateResult = updateResponse && typeof updateResponse.json === 'function'\n                    ? await updateResponse.json()\n                    : updateResponse;\3"
text, count2 = pattern2.subn(replacement2, text, count=1)

path.write_text(text, encoding='utf-8')
print(f'updated {count1} editUser block and {count2} update block')
