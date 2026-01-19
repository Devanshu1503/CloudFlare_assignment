CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT,
  content TEXT,
  summary TEXT,
  summarized INTEGER DEFAULT 0,
  created_at TEXT
);
