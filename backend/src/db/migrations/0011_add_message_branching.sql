ALTER TABLE messages ADD COLUMN parent_message_id TEXT REFERENCES messages(id) ON DELETE SET NULL;

CREATE INDEX messages_parent_message_id_idx ON messages(parent_message_id);

-- Backfill: link each message to its chronological predecessor within the same conversation
WITH ordered AS (
  SELECT id, LAG(id) OVER (PARTITION BY conversation_id ORDER BY created_at) AS prev_id
  FROM messages
)
UPDATE messages SET parent_message_id = ordered.prev_id
FROM ordered WHERE messages.id = ordered.id;
