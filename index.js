require('dotenv').config({ path: './config/env' });

const port = process.env.OEXPENSES_PORT || 3000;
const app = require('./app/express');

const start = async () => {
  app.listen(port, () => {});
};

start();
