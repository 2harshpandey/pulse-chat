// --- Admin Routes Aggregator ---
// Submodules:
//  - ./admin/rooms.js: Super admin room control and room deletion
//  - ./admin/messages.js: Message logs, history, export, and bulk actions
//  - ./admin/tempLinks.js: Temporary access link generation & revocation
//  - ./admin/users.js: User moderation, active tracking, block/unblock, force logout, reports
//  - ./admin/security.js: Server activity logs, audit log queries, and login lockdowns

const express = require('express');
const roomsRoutes = require('./admin/rooms');
const messagesRoutes = require('./admin/messages');
const tempLinksRoutes = require('./admin/tempLinks');
const usersRoutes = require('./admin/users');
const securityRoutes = require('./admin/security');

module.exports = (wss, broadcasts) => {
  const router = express.Router();

  router.use('/', roomsRoutes(wss, broadcasts));
  router.use('/', messagesRoutes(wss, broadcasts));
  router.use('/', tempLinksRoutes(wss, broadcasts));
  router.use('/', usersRoutes(wss, broadcasts));
  router.use('/', securityRoutes(wss, broadcasts));

  return router;
};
