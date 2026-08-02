/* ============================================================
   红笔 HONGBI v3 · 数据库层（node:sqlite）
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = process.env.HONGBI_DB || path.join(DATA_DIR, 'hongbi.db');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    pass_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',          -- superadmin | admin | user
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS devices (
    id TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    owner_type TEXT NOT NULL,                    -- user | device
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sets (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    desc TEXT DEFAULT '',
    category TEXT DEFAULT '其他',
    tags TEXT DEFAULT '[]',
    source TEXT DEFAULT 'private',              -- official | public | pending | private
    review_status TEXT DEFAULT 'none',          -- none | pending | approved | rejected
    review_reason TEXT DEFAULT '',
    owner_id TEXT DEFAULT '',
    owner_type TEXT DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS questions (
    id TEXT PRIMARY KEY,
    set_id TEXT NOT NULL,
    idx INTEGER NOT NULL,
    q TEXT NOT NULL,
    options TEXT DEFAULT '[]',
    answer TEXT DEFAULT '',
    explanation TEXT DEFAULT '',
    type TEXT DEFAULT 'text'
  );
  CREATE INDEX IF NOT EXISTS idx_q_set ON questions(set_id);

  CREATE TABLE IF NOT EXISTS progress (
    owner_id TEXT NOT NULL,
    owner_type TEXT NOT NULL,
    question_id TEXT NOT NULL,
    state INTEGER DEFAULT 0,                    -- 1对 2错 3已掌握
    correct_count INTEGER DEFAULT 0,
    wrong_count INTEGER DEFAULT 0,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (owner_id, owner_type, question_id)
  );

  CREATE TABLE IF NOT EXISTS wrong_items (
    owner_id TEXT NOT NULL,
    owner_type TEXT NOT NULL,
    question_id TEXT NOT NULL,
    count INTEGER DEFAULT 1,
    last_at INTEGER NOT NULL,
    PRIMARY KEY (owner_id, owner_type, question_id)
  );

  CREATE TABLE IF NOT EXISTS favorites (
    owner_id TEXT NOT NULL,
    owner_type TEXT NOT NULL,
    question_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (owner_id, owner_type, question_id)
  );

  CREATE TABLE IF NOT EXISTS attempt_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id TEXT NOT NULL,
    owner_type TEXT NOT NULL,
    set_id TEXT NOT NULL,
    question_id TEXT NOT NULL,
    correct INTEGER DEFAULT 0,
    answer_text TEXT DEFAULT '',
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS stats_daily (
    owner_id TEXT NOT NULL,
    owner_type TEXT NOT NULL,
    day TEXT NOT NULL,
    answered INTEGER DEFAULT 0,
    correct INTEGER DEFAULT 0,
    PRIMARY KEY (owner_id, owner_type, day)
  );

  CREATE TABLE IF NOT EXISTS upload_jobs (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    owner_type TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_path TEXT DEFAULT '',
    status TEXT DEFAULT 'pending',              -- pending | done | failed
    format TEXT DEFAULT '',
    total INTEGER DEFAULT 0,
    skipped INTEGER DEFAULT 0,
    samples TEXT DEFAULT '[]',
    warnings TEXT DEFAULT '[]',
    questions TEXT DEFAULT '[]',
    error TEXT DEFAULT '',
    created_at INTEGER NOT NULL,
    done_at INTEGER DEFAULT 0
  );
`);

module.exports = { db };
