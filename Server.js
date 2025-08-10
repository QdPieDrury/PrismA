const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const crypto = require("crypto");
const path = require("path");
const cors = require("cors");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });
const rooms = new Map();
const EXPIRY_TIME = 20 * 60 * 1000;

app.use(cors());

app.use(express.static(path.join(__dirname, 'public')));

function resetExpiry(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  clearTimeout(room.timeout);
  room.timeout = setTimeout(() => {
    room.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.close(1000, "Room expired");
      }
    });
    rooms.delete(roomId);
  }, EXPIRY_TIME);
}

wss.on("connection", (ws, request, roomId) => {
  ws.send(`Connected to room ${roomId}`);
  resetExpiry(roomId);

  ws.on("message", (message) => {
    resetExpiry(roomId);
    rooms.get(roomId).clients.forEach(client => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(message.toString());
      }
    });
  });

  ws.on("close", () => {
    const room = rooms.get(roomId);
    if (!room) return;
    room.clients = room.clients.filter(c => c !== ws);
    if (room.clients.length === 0) {
      clearTimeout(room.timeout);
      rooms.delete(roomId);
    }
  });
});

app.get("/", (req, res) => {
  if (req.accepts('html')) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  } else {
    res.json({ message: "Welcome to prismA fetch one of our API's to get started!" });
  }
});

app.get("/create-ws", (req, res) => {
  if (req.accepts('html')) {
    res.redirect('/');
    return;
  }
  
  const roomId = crypto.randomUUID();
  rooms.set(roomId, { clients: [], timeout: null });
  resetExpiry(roomId);
  res.json({
    success: true,
    wsUrl: `wss://app.com/${roomId}`,
    id: roomId,
    disclaimer: `Keep this ID safe: ${roomId}. You will need it to close this WebSocket room using the /close-ws/:id API. By creating this socket, you agree that you are fully responsible for its use, resource consumption, and any memory leaks due to unused or idle sockets. We do not create, maintain, or manage these sockets on your behalf — you, the user, are the sole operator and controller of this connection.`
  });
});

app.post("/close-ws/:id", (req, res) => {
  const roomId = req.params.id;
  if (!rooms.has(roomId)) {
    return res.status(404).json({ success: false, message: "Room not found" });
  }
  rooms.get(roomId).clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.close(1000, "Server closed this room");
    }
  });
  clearTimeout(rooms.get(roomId).timeout);
  rooms.delete(roomId);
  res.json({ success: true, message: `Room ${roomId} closed` });
});

server.on("upgrade", (request, socket, head) => {
  const roomId = request.url.slice(1);
  if (!rooms.has(roomId)) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(request, socket, head, (ws) => {
    rooms.get(roomId).clients.push(ws);
    wss.emit("connection", ws, request, roomId);
  });
});

server.listen(3000, () => {
  console.log('Server listening on http://localhost:3000');
});
