'use strict';

const sessionRepo = require('../repositories/session.repo');
const playerRepo = require('../repositories/player.repo');
const players = require('./player.service');

async function authenticate(body = {}) {
  const steamId = players.parseSteamId(body);
  const player = await players.getOrCreate(steamId, body.displayName);

  player.profile.displayName = player.displayName;
  player.isOnline = true;
  player.lastOnline = players.now();
  await players.save(player);

  const token = await sessionRepo.create(steamId);
  console.log(`[Authen] ${player.displayName} (${steamId})`);
  return players.authResponse(player, token);
}

async function verifyToken(token) {
  if (!token) return null;
  const session = await sessionRepo.find(token);
  if (!session || session.expires < Date.now()) return null;

  const player = await playerRepo.find(session.steamId);
  if (!player || players.isBanned(player)) return null;
  return player;
}

function extractToken(req) {
  const header = String(req.headers.authorization || '');
  return header.replace(/^Bearer\s+/i, '') || req.query?.token || req.body?.session_token || req.body?.token || '';
}

module.exports = { authenticate, verifyToken, extractToken };
