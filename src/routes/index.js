'use strict';

const fs = require('fs');
const express = require('express');
const config = require('../config');

const playerRoutes = require('./player.routes');
const storeRoutes = require('./store.routes');
const extrasRoutes = require('./extras.routes');
const systemRoutes = require('./system.routes');

module.exports = function mountRoutes(app) {
  // Every game endpoint is available both bare and under /hshs.
  for (const prefix of ['', '/hshs']) {
    const at = (suffix) => `${prefix}${suffix}`;
    app.use(at('/live/player'), playerRoutes);
    app.use(at('/live'), storeRoutes);
    app.use(prefix || '/', extrasRoutes);
    app.use(at('/api'), systemRoutes);
  }

  const publicDir = config.paths.public;
  if (fs.existsSync(publicDir)) {
    app.use(express.static(publicDir)); // eslint-disable-line global-require
  }

  app.get('/', (req, res) => res.json({
    service: 'HSH Survive OBT2 API',
    health: '/api/health',
    prefix: '/hshs also supported',
  }));
};
