require('dotenv').config();
const http = require('http');
const express = require('express');
const axios = require('axios');
const { WebSocketServer, WebSocket } = require('ws');
const cors = require('cors');
const cloudinary = require('cloudinary').v2;
const CloudinaryStorage = require('multer-storage-cloudinary').CloudinaryStorage;
const multer = require('multer');
const logger = require('./logger');
const fs = require('fs');
const path = require('path');
const connectDB = require('./db');
const User = require('./models/user');
const Message = require('./models/message');
const MessageEvent = require('./models/messageEvent');


// --- Global Error Handlers (Safety Net) ---
// These are crucial for logging errors that would otherwise crash the server silently.
process.on('uncaughtException', (err, origin) => {
    logger.error('----- UNCAUGHT EXCEPTION -----');
    logger.error(`Caught exception: ${err}\n` + `Exception origin: ${origin}`);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('----- UNHANDLED REJECTION -----');
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});


// --- In-Memory Stores (For live data, not for persistence) ---
// messageHistory cache is removed to support infinite scroll. DB is now the source of truth.
const onlineUsers = new Map();
const typingUsers = new Map();
const adminClients = new Set();
const pendingDisconnects = new Map();

// --- Cloudinary & Multer Configuration ---
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'pulse-chat',
    resource_type: 'auto',
  },
});
const upload = multer({ storage });

// --- Server Setup ---
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const PORT = process.env.PORT || 8080;

// --- WebSocket Heartbeat (Ping/Pong) ---
const heartbeatInterval = setInterval(function ping() {
  wss.clients.forEach(function each(ws) {
    if (ws.isAlive === false) {
      logger.warn('Heartbeat: Terminating dead connection.');
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping(() => {});
  });
}, 10000);

wss.on('close', function close() {
  clearInterval(heartbeatInterval);
});

// --- Middleware ---
app.use(cors({ methods: ["GET", "POST", "DELETE"] }));
app.use(express.json());

// --- Helper Functions ---
const broadcastToAdmins = (type, data) => {
  const message = JSON.stringify({ type, data });
  logger.info(`Broadcasting to ${adminClients.size} admin client(s): ${message}`);
  adminClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    } else {
      logger.info(`Admin client not open. State: ${client.readyState}`);
    }
  });
};

const broadcastOnlineUsers = () => {
  const users = Array.from(onlineUsers.values()).map(user => ({
    ...user,
    isTyping: typingUsers.has(user.userId)
  }));
  const message = JSON.stringify({ type: 'online_users', data: users });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) client.send(message);
  });
};

const broadcast = (message) => {
    const data = JSON.stringify(message);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(data);
        }
    });
};

// Middleware for super-admin actions requiring a secret key
const adminSecretAuth = (req, res, next) => {
    const receivedSecret = req.headers['x-admin-secret'];
    const expectedSecret = process.env.ADMIN_SECRET;

    // Diagnostic logging
    logger.info(`[DIAG] Admin Secret Auth: Received length: ${receivedSecret?.length || 0}, Expected length: ${expectedSecret?.length || 0}`);
            
    if (receivedSecret && expectedSecret && receivedSecret === expectedSecret) {
        next();
    } else {
        logger.warn('Unauthorized attempt to access a secret-protected admin route. Secret mismatch.');
        res.status(403).json({ error: 'Forbidden' });
    }
};

// Middleware for admin authentication
const adminAuth = (req, res, next) => {
    const password = req.headers['x-admin-password'];
    if (password && password === process.env.ADMIN_PASSWORD) {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized' });
    }
};

// --- Main Routes ---
app.get('/health', (req, res) => {
    // A simple health check endpoint for the hosting platform (Azure) to ping.
    res.status(200).send('OK');
});

app.get('/', (req, res) => res.send('Pulse Chat Server is running!'));

// --- Client Auth Verification ---
app.post('/api/auth/verify', (req, res) => {
    const { password } = req.body;
    if (password && password === process.env.CLIENT_PASSWORD) {
        res.status(200).json({ success: true });
    } else {
        res.status(401).json({ success: false, error: 'Incorrect password.' });
    }
});

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
  
  const { userId } = req.body;
  const username = onlineUsers.get(userId)?.username || 'Unknown'; // Will be fixed in a later step

  // Create a MessageEvent for the upload
  const event = new MessageEvent({
    type: 'upload',
    file: {
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
    },
    userId,
    username,
    timestamp: new Date().toISOString(),
  });
  event.save();

  broadcastToAdmins('history', event);
  broadcastToAdmins('activity', `File '${req.file.originalname}' uploaded by '${username}'.`);

  logger.info(`File uploaded: ${req.file.originalname}`);
  res.status(200).json({
    id: req.file.filename,
    type: req.file.resource_type,
    url: req.file.path,
    originalName: req.file.originalname,
    text: req.body.text,
  });
});

app.delete('/api/delete/:id', async (req, res) => {
  try {
    const messageId = req.params.id;
    if (!messageId) return res.status(400).json({ error: 'No message ID provided.' });
    logger.info(`Delete request for message ID: ${messageId}`);
    
    // Find message to delete from DB
    const messageToDelete = await Message.findOne({ id: messageId });

    if (messageToDelete && messageToDelete.url && messageToDelete.url.includes('cloudinary')) {
        const publicId = messageToDelete.id;
        if (publicId.includes('/')) {
            await cloudinary.uploader.destroy(publicId, { resource_type: 'video', invalidate: true });
            await cloudinary.uploader.destroy(publicId, { resource_type: 'image', invalidate: true });
        }
    }
    
    await Message.deleteOne({ id: messageId });


    const deleteMessage = { type: 'delete', id: messageId };
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(deleteMessage));
    });

    res.status(200).json({ success: true, message: 'Message deleted.' });
  } catch (error) {
    logger.error('Delete error:', { message: error.message, stack: error.stack });
    res.status(500).json({ error: 'Failed to delete file.' });
  }
});

app.delete('/api/messages/all', adminSecretAuth, async (req, res) => {
    try {
        await Message.deleteMany({});
        await MessageEvent.deleteMany({});

        
        broadcast({ type: 'chat_cleared' });
        
        logger.info('All messages and events have been permanently deleted by an admin.');
        broadcastToAdmins('activity', 'All messages and events have been permanently deleted.');

        res.status(200).json({ message: 'All messages and events have been permanently deleted.' });
    } catch (error) {
        logger.error('Error clearing all messages:', { message: error.message, stack: error.stack });
        res.status(500).json({ error: 'Failed to clear all messages.' });
    }
});

// --- GIF API Routes ---
const TENOR_API_KEY = process.env.TENOR_API_KEY;
const TENOR_API_URL = 'https://tenor.googleapis.com/v2';

app.get('/api/gifs/trending', async (req, res) => {
  try {
    const response = await axios.get(`${TENOR_API_URL}/featured`, { params: { key: TENOR_API_KEY, limit: 20 } });
    const gifs = response.data.results.map((gif) => ({ id: gif.id, preview: gif.media_formats.tinygif.url, url: gif.media_formats.gif.url }));
    res.json(gifs);
  } catch (error) {
    logger.error('Error fetching trending GIFs:', { message: error.message });
    res.status(500).json({ error: 'Failed to fetch GIFs' });
  }
});

app.get('/api/gifs/search', async (req, res) => {
  try {
    const query = req.query.q;
    if (!query) return res.status(400).json({ error: 'Search query is required' });
    const response = await axios.get(`${TENOR_API_URL}/search`, { params: { key: TENOR_API_KEY, q: query, limit: 20 } });
    const gifs = response.data.results.map((gif) => ({ id: gif.id, preview: gif.media_formats.tinygif.url, url: gif.media_formats.gif.url }));
    res.json(gifs);
  } catch (error) {
    logger.error('Error searching GIFs:', { message: error.message });
    res.status(500).json({ error: 'Failed to fetch GIFs' });
  }
});

// --- Admin Routes ---
app.get('/api/admin/messages', adminAuth, async (req, res) => {
    const messages = await Message.find().sort({ createdAt: -1 }).limit(MAX_HISTORY);
    res.json(messages.reverse());
});

app.get('/api/admin/users', adminAuth, async (req, res) => {
    console.log('Online users:', Array.from(onlineUsers.values()));
    const users = Array.from(onlineUsers.values());
    res.json(users);
});

app.get('/api/admin/history', adminAuth, async (req, res) => {
    const events = await MessageEvent.find().sort({ createdAt: -1 });
    res.json(events);
});

app.get('/api/admin/server-logs', adminAuth, (req, res) => {
  const logFilePath = path.join(__dirname, 'pulse-activity.log');
  fs.readFile(logFilePath, 'utf8', (err, data) => {
    if (err) {
      logger.error('Failed to read log file:', err);
      return res.status(500).send('Could not read server logs.');
    }
    const lines = data.split('\n').slice(-200).join('\n');
    res.type('text/plain').send(lines);
  });
});

// Route for fetching paginated messages for infinite scroll
app.get('/api/messages', async (req, res) => {
    try {
        const limit = 50;
        const { before } = req.query; // 'before' will be the 'createdAt' timestamp of the oldest message client-side

        const query = {};
        if (before) {
            query.createdAt = { $lt: new Date(before) };
        }

        const messages = await Message.find(query)
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean();
        
        res.json(messages.reverse()); // Send oldest-first, so client can simply prepend
    } catch (error) {
        logger.error('Failed to fetch paginated messages:', { message: error.message, stack: error.stack });
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});

// --- WebSocket Connection Logic ---
wss.on('connection', (ws, req) => {
  // Heartbeat setup for the new connection
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  const url = new URL(req.url, `http://${req.headers.host}`);
  const isAdminConnection = url.searchParams.get('admin') === 'true';

  if (isAdminConnection) {
    // Auth is done via the first WebSocket message to keep the password out of the URL (and server logs).
    ws.once('message', (rawData) => {
      try {
        const data = JSON.parse(rawData.toString());
        if (data.type === 'admin_auth' && data.password === process.env.ADMIN_PASSWORD) {
          ws.isAdmin = true;
          adminClients.add(ws);
          logger.info('An admin client authenticated and connected!');
          broadcastToAdmins('activity', 'An admin client connected to admin channel.');
          User.find().then(allDbUsers => {
            ws.send(JSON.stringify({ type: 'users', data: allDbUsers }));
          });
          ws.on('close', () => {
            adminClients.delete(ws);
            logger.info('An admin client disconnected from admin channel.');
            broadcastToAdmins('activity', 'An admin client disconnected from admin channel.');
          });
        } else {
          logger.warn('Admin auth failed: incorrect password.');
          ws.terminate();
        }
      } catch {
        ws.terminate();
      }
    });
    return;
  }

  logger.info('A new client connected!');

  ws.on('message', async (message) => {
    const parsedMessage = JSON.parse(message.toString());
    if (parsedMessage.type !== 'admin_auth') {
      logger.info('Received message:', parsedMessage);
    }

    switch (parsedMessage.type) {
      case 'user_join': {
        const { userId, username } = parsedMessage;
        ws.userId = userId;

        if (pendingDisconnects.has(userId)) {
            clearTimeout(pendingDisconnects.get(userId));
            pendingDisconnects.delete(userId);
            logger.info(`User '${username}' rejoined (refresh).`);
        } else {
            logger.info(`User '${username}' joined.`);
            broadcast({
              type: 'system_notification',
              id: `system-${Date.now()}`,
              text: `${username} has joined the chat.`,
              timestamp: new Date().toISOString(),
            });
        }
        
        onlineUsers.set(userId, { userId, username });
        
        User.findOneAndUpdate(
          { userId },
          { userId, username, lastSeen: new Date() },
          { upsert: true, new: true }
        ).catch(err => logger.error('Failed to save user:', err));

        broadcastToAdmins('user_joined', { userId, username });
        broadcastToAdmins('activity', `User '${username}' connected.`);
        broadcastOnlineUsers();

        Message.find().sort({ createdAt: -1 }).limit(50).lean()
          .then(messages => {
            ws.send(JSON.stringify({ type: 'history', data: messages.reverse() }));
          })
          .catch(err => logger.error('Failed to send initial history:', err));
        break;
      }
      case 'react': {
        const { messageId, userId, emoji } = parsedMessage;
        const username = onlineUsers.get(userId)?.username || 'Unknown';
        // By using .lean(), we get a plain JavaScript object instead of a Mongoose document.
        // This prevents errors where Mongoose-specific types don't have standard array methods.
        const message = await Message.findOne({ id: messageId }).lean();

        if (message) {
          // Ensure reactions is a plain object.
          if (!message.reactions || typeof message.reactions !== 'object') {
            message.reactions = {};
          }

          let previousEmoji = null;
          // Find and remove any previous reaction from this user
          for (const e in message.reactions) {
            // Defensive check to ensure we're working with an array, preventing crashes from bad data.
            if (Array.isArray(message.reactions[e])) {
              const userIndex = message.reactions[e].findIndex(u => u.userId === userId);
              if (userIndex > -1) {
                previousEmoji = e;
                message.reactions[e].splice(userIndex, 1);
                if (message.reactions[e].length === 0) {
                  delete message.reactions[e];
                }
                break; // A user can only have one reaction, so we can stop.
              }
            }
          }

          // If the new reaction is not a toggle-off of the same emoji, add it.
          if (previousEmoji !== emoji) {
            if (!Array.isArray(message.reactions[emoji])) {
              message.reactions[emoji] = [];
            }
            message.reactions[emoji].push({ userId, username });
          }
          
          // Atomically update the reactions in the database.
          await Message.updateOne({ id: messageId }, { $set: { reactions: message.reactions } });

          // Broadcast the update to all clients
          wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({ type: 'update', data: { id: messageId, reactions: message.reactions } }));
            }
          });
        }
        break;
      }      case 'edit': {
        const { messageId, newText } = parsedMessage;
        
        const msg = await Message.findOne({ id: messageId });
        if (!msg) return;
        const oldText = msg.text;
        
        // Update in DB
        await Message.updateOne({ id: messageId }, { $set: { text: newText, edited: true } });

        const updatedMsgForBroadcast = {
          ...msg.toObject(),
          text: newText,
          edited: true
        };

        User.findOne({ userId: ws.userId }).then(user => {
          const username = user ? user.username : 'Unknown';
          const event = new MessageEvent({
            type: 'edit',
            messageId,
            oldText,
            newText,
            userId: ws.userId,
            username,
            timestamp: new Date().toISOString(),
          });
          event.save();
          broadcastToAdmins('history', event);
          broadcastToAdmins('activity', `Message (ID: ${messageId}) edited by '${username}'. New text: "${newText}"`);
        });

        const updateMsg = { type: 'update', data: updatedMsgForBroadcast };
        wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(JSON.stringify(updateMsg)); });
        break;
      }
      case 'start_typing': {
        if (ws.userId) typingUsers.set(ws.userId, true);
        broadcastOnlineUsers();
        break;
      }
      case 'stop_typing': {
        if (ws.userId) typingUsers.delete(ws.userId);
        broadcastOnlineUsers();
        break;
      }
      case 'delete_for_everyone': {
        const { messageId } = parsedMessage;

        try {
            const originalMessage = await Message.findOne({ id: messageId }).lean();
            if (!originalMessage) return;

            const updatedMessage = await Message.findOneAndUpdate(
                { id: messageId },
                { 
                    $set: { 
                        text: undefined, 
                        url: undefined, 
                        originalName: undefined, 
                        reactions: undefined,
                        isDeleted: true,
                        deletedBy: ws.userId 
                    },
                    $unset: {
                        replyingTo: ""
                    }
                },
                { new: true }
            ).lean();
            
            User.findOne({ userId: ws.userId }).then(user => {
              const username = user ? user.username : 'Unknown';
              const event = new MessageEvent({
                type: 'delete_everyone',
                messageId,
                deletedContent: originalMessage,
                userId: ws.userId,
                username,
                timestamp: new Date().toISOString(),
              });
              event.save();
              broadcastToAdmins('history', event);
              broadcastToAdmins('activity', `Message (ID: ${messageId}) deleted by '${username}'.`);
            });
            
            const updateMsg = { type: 'update', data: updatedMessage };
            wss.clients.forEach(c => {
                if (c.readyState === WebSocket.OPEN) {
                    c.send(JSON.stringify(updateMsg));
                }
            });

        } catch (err) {
            logger.error('Failed to delete message for everyone:', err);
        }
        break;
      }
      default: { // New text/media message
        if (ws.userId && typingUsers.has(ws.userId)) {
          typingUsers.delete(ws.userId);
          broadcastOnlineUsers();
        }
        
        const messageDoc = new Message({
            ...parsedMessage,
            id: parsedMessage.id || Date.now().toString(),
            sender: ws.userId
        });
        messageDoc.save();

        User.findOne({ userId: ws.userId }).then(user => {
            const username = user ? user.username : 'Unknown';
            const event = new MessageEvent({
              type: 'create',
              message: messageDoc.toObject(),
              userId: ws.userId,
              username,
              timestamp: new Date().toISOString(),
            });
            event.save();
            broadcastToAdmins('history', event);
            broadcastToAdmins('activity', `New message from '${username}': "${messageDoc.text || '[Media]'}"`);
        });

        wss.clients.forEach(client => {
          if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(messageDoc));
          }
        });
        break;
      }
    }
  });

  ws.on('close', () => {
    if (ws.userId && onlineUsers.has(ws.userId)) {
      const user = onlineUsers.get(ws.userId);
      logger.info(`User '${user.username}' disconnected. Starting 10s timer.`);
      
      const timerId = setTimeout(() => {
        logger.info(`User '${user.username}' truly left.`);
        onlineUsers.delete(ws.userId);
        typingUsers.delete(ws.userId);

        broadcast({
          type: 'system_notification',
          id: `system-${Date.now()}`,
          text: `${user.username} has left the chat.`,
          timestamp: new Date().toISOString(),
        });
        
        broadcastOnlineUsers();
        broadcastToAdmins('user_left', { userId: ws.userId });
        broadcastToAdmins('activity', `User '${user.username}' disconnected.`);
        pendingDisconnects.delete(ws.userId);
      }, 10000);

      pendingDisconnects.set(ws.userId, timerId);
    }
  });
  ws.on('error', (error) => logger.error('WebSocket Error:', { message: error.message }));
});

// --- Start Server ---
const startServer = async () => {
  await connectDB();
  
server.listen(PORT, () => {
    logger.info(`Server is listening on port ${PORT}`);
  });
};

startServer();


// Watch for changes in the log file and broadcast to admins
const logFilePath = path.join(__dirname, 'pulse-activity.log');

// Ensure log file exists before watching
if (!fs.existsSync(logFilePath)) {
  fs.writeFileSync(logFilePath, ''); // Create empty file
}

fs.watch(logFilePath, (eventType, filename) => {
  if (eventType === 'change') {
    fs.readFile(logFilePath, 'utf8', (err, data) => {
      if (err) {
        logger.error('Failed to read log file on change:', err);
        return;
      }
      const lines = data.split('\n').slice(-200).join('\n');
      const payload = { type: 'server_logs', data: lines };
      adminClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(payload));
        }
      });
    });
  }
});