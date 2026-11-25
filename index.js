'use strict';

const express = require('express');
const backendApp = require('./backend/src/app').app;

const app = express();
app.use(backendApp);

module.exports = app;
