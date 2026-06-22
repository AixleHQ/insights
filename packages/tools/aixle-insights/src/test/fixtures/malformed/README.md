# Malformed SQLite fixtures

These fixtures intentionally contain invalid or incomplete SQLite content to
exercise reader error handling and regression behavior.

- `not-sqlite.db`: plain text payload, not a SQLite file.
- `sqlite-truncated.db`: SQLite header-like text with truncated content.

Use by copying fixture bytes into a target file named `state.vscdb` or
`cursor.db` under a temporary test directory.
