#!/usr/bin/env python3
import json
import sqlite3
import sys

request = json.load(sys.stdin)
connection = sqlite3.connect(sys.argv[1])
try:
    cursor = connection.execute(request['sql'], request.get('params', []))
    rows = [list(row) for row in cursor.fetchall()] if cursor.description else []
    connection.commit()
    print(json.dumps({'rows': rows, 'changes': cursor.rowcount}))
finally:
    connection.close()
