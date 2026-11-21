'use strict';

const catalog = require('../repositories/catalog.repo');

const OBJECT_FIELDS = [
  'playerStat', 'playerRecord', 'playerRecordHunter', 'playerRecordSurvivor',
  'rankData', 'returnPlayerStatus',
];
const BOOLEAN_FIELDS = new Set(['firstPayReward', 'isNewPlayer']);
const ARRAY_FIELDS = new Set(['curseRelic']);
const CLIENT_SAVE_FIELDS = [...OBJECT_FIELDS, 'curseRelic', 'firstPayReward', 'isNewPlayer'];
const CLIENT_WRITABLE_FIELDS = [...OBJECT_FIELDS, 'firstPayReward', 'isNewPlayer'];

const SAFE_KEY = /^[A-Za-z0-9_-]{1,64}$/;
const LIMITS = { depth: 6, keys: 120, array: 200, string: 200 };

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function defaultFor(field) {
  if (ARRAY_FIELDS.has(field)) return [];
  if (BOOLEAN_FIELDS.has(field)) return false;
  return {};
}

async function ensureDefaults(player) {
  const template = await catalog.template('auth');
  const base = template?.data?.player || {};
  let changed = false;

  for (const field of OBJECT_FIELDS) {
    const value = player[field];
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      player[field] = base[field] ? clone(base[field]) : {};
      changed = true;
    }
  }
  if (!Array.isArray(player.curseRelic)) {
    player.curseRelic = []; // never seed the shared sample catalogue into every account
    changed = true;
  }
  for (const field of BOOLEAN_FIELDS) {
    if (typeof player[field] !== 'boolean') {
      player[field] = typeof base[field] === 'boolean' ? base[field] : false;
      changed = true;
    }
  }
  if (player.lastSavedAt === undefined) { player.lastSavedAt = null; changed = true; }
  if (!player.purchaseCounts || typeof player.purchaseCounts !== 'object' || Array.isArray(player.purchaseCounts)) {
    player.purchaseCounts = {};
    changed = true;
  }
  return changed;
}

function getSaveData(player) {
  const result = {};
  for (const field of CLIENT_SAVE_FIELDS) {
    const value = player[field];
    result[field] = value === undefined || value === null ? defaultFor(field) : value;
  }
  return {
    ...result,
    coin: player.coin ?? 0,
    amethyst: player.amethyst ?? 0,
    amulet: player.amulet ?? 0,
    lastSavedAt: player.lastSavedAt ? new Date(player.lastSavedAt).toISOString() : null,
  };
}

function sanitizeValue(value, depth = 0) {
  if (depth > LIMITS.depth) throw new Error('Invalid save data: nested too deep');
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Invalid save data: non-finite number');
    return value;
  }
  if (typeof value === 'string') return value.slice(0, LIMITS.string);
  if (Array.isArray(value)) {
    if (value.length > LIMITS.array) throw new Error('Invalid save data: array too long');
    return value.map((entry) => sanitizeValue(entry, depth + 1));
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length > LIMITS.keys) throw new Error('Invalid save data: too many keys');
    const clean = {};
    for (const [key, entry] of entries) {
      if (!SAFE_KEY.test(key)) throw new Error(`Invalid save data key: ${key}`);
      clean[key] = sanitizeValue(entry, depth + 1);
    }
    return clean;
  }
  throw new Error('Invalid save data: unsupported value');
}

function mergeObjects(target, patch) {
  const result = target && typeof target === 'object' && !Array.isArray(target) ? { ...target } : {};
  for (const [key, value] of Object.entries(patch)) {
    const isPlainObject = value && typeof value === 'object' && !Array.isArray(value);
    const current = result[key];
    const currentIsPlain = current && typeof current === 'object' && !Array.isArray(current);
    result[key] = isPlainObject && currentIsPlain ? mergeObjects(current, value) : value;
  }
  return result;
}

function applySaveData(player, payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Invalid save data: object required');
  }
  const updated = [];
  for (const field of CLIENT_WRITABLE_FIELDS) {
    if (payload[field] === undefined) continue;
    const clean = sanitizeValue(payload[field]);
    if (BOOLEAN_FIELDS.has(field)) {
      if (typeof clean !== 'boolean') throw new Error(`Invalid save data: ${field} must be a boolean`);
      player[field] = clean;
    } else {
      if (!clean || typeof clean !== 'object' || Array.isArray(clean)) {
        throw new Error(`Invalid save data: ${field} must be an object`);
      }
      player[field] = mergeObjects(player[field], clean);
    }
    updated.push(field);
  }
  if (updated.length === 0) throw new Error('Invalid save data: no writable fields provided');
  player.lastSavedAt = new Date().toISOString();
  return { updated, lastSavedAt: player.lastSavedAt };
}

module.exports = {
  ensureDefaults, getSaveData, applySaveData, CLIENT_WRITABLE_FIELDS,
};
