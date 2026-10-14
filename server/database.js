const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const databasePath = process.env.DB_PATH || path.join(__dirname, 'data', 'conversations.sqlite');
fs.mkdirSync(path.dirname(databasePath), { recursive: true });

const database = new Database(databasePath);
database.pragma('journal_mode = WAL');
database.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('chat', 'caption')),
    name TEXT NOT NULL,
    message TEXT NOT NULL,
    timestamp INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS messages_room_id_id ON messages (room_id, id);
`);

const insertMessage = database.prepare(`
  INSERT INTO messages (room_id, type, name, message, timestamp)
  VALUES (@roomId, @type, @name, @message, @timestamp)
`);

const selectRoomMessages = database.prepare(`
  SELECT id, room_id AS roomId, type, name, message, timestamp
  FROM messages
  WHERE room_id = ?
  ORDER BY id
`);

function saveMessage({ roomId, type, name, message }) {
  const timestamp = Date.now();
  const result = insertMessage.run({ roomId, type, name, message, timestamp });
  return {
    id: Number(result.lastInsertRowid),
    roomId,
    type,
    name,
    message,
    timestamp,
  };
}

function getRoomMessages(roomId) {
  return selectRoomMessages.all(roomId);
}

module.exports = { saveMessage, getRoomMessages };
