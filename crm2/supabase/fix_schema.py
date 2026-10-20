import re

filepath = r"C:\Users\HOME\Downloads\Tzmicha_CRM-main\Tzmicha_CRM-main\supabase\total_schema.sql"

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Fix AS followed by body without $$
# Pattern: AS (followed by newline and indented body)
content = re.sub(r'^AS $', 'AS $$', content, flags=re.MULTILINE)

# Fix END; followed by bare ; on next line
content = re.sub(r'^END;\n^;', 'END;\n$$;', content, flags=re.MULTILINE)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("Fixed AS and END; patterns")
