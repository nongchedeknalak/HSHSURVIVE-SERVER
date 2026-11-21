'use strict';

const express = require('express');
const router = express.Router();

const authService = require('../services/auth.service');
const players = require('../services/player.service');
const savedata = require('../services/savedata.service');
const catalogRepo = require('../repositories/catalog.repo');
const playerRepo = require('../repositories/player.repo');
const settingsRepo = require('../repositories/settings.repo');
const sessionRepo = require('../repositories/session.repo');
const { requireGame } = require('../middlewares/auth');
const { ok, fail } = require('../utils/response');
const { asyncHandler, read } = require('../utils/async');

router.post('/authen', asyncHandler(async (req, res) => {
  return res.status(200).json(await authService.authenticate(req.body || {}));
}));

read(router, '/inventory/getAll', async (req, res) => {
  return ok(res, players.inventoryState(req.player));
}, requireGame);

router.post('/inventory/addItem', requireGame, asyncHandler(async (req, res) => {
  const { itemId } = req.body;
  if (!itemId) return fail(res, 400, 'itemId is required');
  const quantity = Math.max(1, Math.min(9999, Number(req.body.quantity) || 1));
  players.grantItem(req.player, itemId, quantity);
  await players.save(req.player);
  return ok(res, { success: true, itemId, quantity, session_token: req.token });
}));

router.post('/inventory/removeItem', requireGame, asyncHandler(async (req, res) => {
  const { itemId } = req.body;
  if (!itemId) return fail(res, 400, 'itemId is required');
  const removed = players.removeItem(req.player, itemId);
  if (removed) await players.save(req.player);
  return ok(res, { success: removed, itemId, session_token: req.token });
}));

read(router, '/characterslot/get', async (req, res) => {
  return ok(res, {
    session_token: req.token,
    slots: players.characterSlotData(req.player),
    role: req.player.role,
  });
}, requireGame);

router.post('/characterslot/edit', requireGame, asyncHandler(async (req, res) => {
  const body = req.body || {};
  const incoming = body.slots || body;
  const slot = req.player.characterSlot || {};
  for (const key of ['hunterSlot', 'survivorSlot', 'characterhunteritem', 'characteritem']) {
    if (incoming[key] !== undefined) slot[key] = incoming[key];
  }
  if (['hunter', 'survivor'].includes(body.role)) req.player.role = body.role;
  slot.updatedAt = players.now();
  req.player.characterSlot = slot;
  await players.save(req.player);
  return ok(res, {
    session_token: req.token,
    slots: players.characterSlotData(req.player),
    role: req.player.role,
  });
}));

router.post('/profile/edit', requireGame, asyncHandler(async (req, res) => {
  const body = req.body || {};
  const input = body.profile || body;
  const profileId = typeof input === 'string' ? input : input.display;
  if (profileId && profileId !== 'None') {
    req.player.profile.display = String(profileId).slice(0, 80);
    if (typeof input === 'object' && input.displayName) {
      req.player.displayName = String(input.displayName).slice(0, 40);
      req.player.profile.displayName = req.player.displayName;
    }
  }
  req.player.profile.updatedAt = players.now();
  await players.save(req.player);
  return ok(res, { profile: req.player.profile, session_token: req.token });
}));

router.post('/sticker/edit', requireGame, asyncHandler(async (req, res) => {
  const input = req.body?.stickerInfo || req.body || {};
  const slot = req.player.stickerSlot || {};
  if (input.stickerpreset !== undefined) slot.stickerpreset = input.stickerpreset;
  if (Array.isArray(input.stickerSet)) slot.stickerSet = input.stickerSet;
  slot.updatedAt = players.now();
  req.player.stickerSlot = slot;
  await players.save(req.player);
  return ok(res, { stickerSlot: slot, session_token: req.token });
}));

read(router, '/playerstat/get', async (req, res) => {
  const p = req.player;
  return ok(res, {
    playerStat: p.playerStat,
    playerRecord: p.playerRecord,
    playerRecordHunter: p.playerRecordHunter,
    playerRecordSurvivor: p.playerRecordSurvivor,
    rankData: p.rankData,
    returnPlayerStatus: p.returnPlayerStatus,
    coin: p.coin,
    amethyst: p.amethyst,
    amulet: p.amulet,
  });
}, requireGame);

read(router, '/getban', async (req, res) => {
  const steamId = players.parseSteamId(req.body || {});
  const player = await playerRepo.find(steamId);
  return ok(res, players.banStatus(player || {}));
});

router.post('/savedata/get', requireGame, asyncHandler(async (req, res) => {
  return ok(res, { saveData: savedata.getSaveData(req.player), session_token: req.token });
}));

router.post('/savedata/save', requireGame, asyncHandler(async (req, res) => {
  const body = req.body || {};
  const payload = body.saveData ?? body.data ?? body.SaveData ?? body;
  try {
    const result = savedata.applySaveData(req.player, payload);
    await players.save(req.player);
    return ok(res, {
      ...result,
      saveData: savedata.getSaveData(req.player),
      session_token: req.token,
    });
  } catch (error) {
    const invalid = String(error.message).startsWith('Invalid save data');
    return fail(res, invalid ? 400 : 500, error.message);
  }
}));

read(router, '/curserelic/get', async (req, res) => {
  const base = await catalogRepo.template('curserelic');
  const owned = req.player.curseRelic || [];
  const response = players.clone(base || { status: 1, data: {} });
  if (owned.length) response.data = { ...(response.data || {}), curseRelic: owned };
  return res.status(200).json(response);
}, requireGame);

read(router, '/gameplay/checkversion', async (req, res) => {
  const settings = await settingsRepo.get();
  return ok(res, {
    serverInfo: {
      correctversion: true,
      serverVersion: settings.serverVersion,
      ServerDevVersion: settings.ServerDevVersion,
      IsOnline: settings.IsOnline,
      IsDevOnline: settings.IsDevOnline,
    },
  });
});

read(router, '/gameplay/authenstatus', async (req, res) => {
  const game = req.player.gameplay || {};
  return ok(res, {
    steamId: req.player.steamId,
    status: game.status || 'offline',
    matchId: game.matchId || null,
    authenAt: game.authenAt || null,
    isOnline: true,
  });
}, requireGame);

read(router, '/gameplay/endgamestatus', async (req, res) => {
  const game = req.player.gameplay || {};
  return ok(res, {
    status: game.status || 'offline',
    lastResult: game.lastResult || null,
    matchId: game.matchId || null,
  });
}, requireGame);

router.post('/gameplay/callback', requireGame, asyncHandler(async (req, res) => {
  req.player.gameplay = req.player.gameplay || {};
  req.player.gameplay.callback = req.body;
  await players.save(req.player);
  return ok(res, { accepted: true });
}));

router.post('/gameplay/endgameresult', requireGame, asyncHandler(async (req, res) => {
  const body = req.body || {};
  const player = req.player;
  player.gameplay = player.gameplay || {};
  player.gameplay.lastResult = body;
  player.gameplay.status = 'finished';
  for (const key of ['coin', 'amethyst', 'amulet']) {
    if (body[key] !== undefined) player[key] = Math.max(0, (Number(player[key]) || 0) + Number(body[key]));
  }
  await players.save(player);
  return ok(res, { accepted: true, coin: player.coin, amethyst: player.amethyst, amulet: player.amulet });
}));

// Logout is an extra convenience endpoint (removes the session from MongoDB).
router.post('/logout', asyncHandler(async (req, res) => {
  const token = authService.extractToken(req);
  if (token) await sessionRepo.remove(token);
  return ok(res, { loggedOut: true });
}));

module.exports = router;
