const sessions = {};

function getSession(userId) {
  if (!sessions[userId]) {
    sessions[userId] = { step: "idle", data: {} };
  }
  return sessions[userId];
}

function resetSession(userId) {
  sessions[userId] = { step: "idle", data: {} };
}

module.exports = { getSession, resetSession };
