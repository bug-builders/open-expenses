const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const helmet = require('helmet');
const gdrive = require('./gdrive');
const routes = require('./routes/');

function ignoreFavicon(req, res, next) {
  if (req.originalUrl === '/favicon.ico') {
    res.status(204).json({ nope: true });
  } else {
    next();
  }
}

const app = express();

app.use(ignoreFavicon);
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(helmet());
app.use(cors());

app.get('/oauth', (req, res) => {
  res.redirect(gdrive.generateAuthUrl());
});

app.get('/oauthcallback', async (req, res) => {
  const sessionId = await gdrive.getToken(req.query.code);
  if(sessionId === false) {
    res.type('text/html');
    res.status(403);
    res.send(
      'You are not allowed to use this application',
    );
  } else {
    res.type('text/html');
    res.status(200);
    res.send(
      `<script>window.localStorage.setItem('oexpenses-sessionId', '${sessionId}'); location.href='/';</script>`,
    );
  }

});

app.use('/v0/', routes);
app.use('/', express.static(path.join(__dirname, '../static')));

module.exports = app;
