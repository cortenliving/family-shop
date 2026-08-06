-- Migration: family member roster for shared-list status
CREATE TABLE IF NOT EXISTS family_members (
  id TEXT NOT NULL,
  family_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  last_seen_at INTEGER NOT NULL,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (family_id, id),
  FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_members_family ON family_members(family_id);
