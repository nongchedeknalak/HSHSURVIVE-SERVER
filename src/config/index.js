'use strict';

const path = require('path');

const ROOT = path.resolve(__dirname, '../..');

module.exports = {
  root: ROOT,
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 18080,
  host: process.env.HOST || '0.0.0.0',

  mongo: {
    uri: process.env.MONGODB_URI || process.env.MONGO_URI || '',
    dbName: process.env.MONGO_DB_NAME || 'hshs_obt2',
  },

  db: {
    driver: String(process.env.DB_DRIVER || 'mongo').toLowerCase(),
  },

  adminKey: process.env.ADMIN_KEY || 'hshs-admin',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  sessionTtlMs: 7 * 24 * 60 * 60 * 1000,

  paths: {
    data: path.join(ROOT, 'data'),
    static: path.join(ROOT, 'data', 'static'),
    custom: path.join(ROOT, 'data', 'custom'),
    public: path.join(ROOT, 'public'),
  },

  store: {
    currencyByType: { 1: 'coin', 2: 'amethyst', 4: 'amulet' },
    currencyType: { coin: 1, amethyst: 2, amulet: 4 },
    maxQuantity: 99,
  },
};
