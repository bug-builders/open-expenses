const fs = require('fs');
const axios = require('axios');
const bluebird = require('bluebird');
const redis = require('redis');
const { google } = require('googleapis');
const uuidv5 = require('uuid/v5');
const jwtDecode = require('jwt-decode');

bluebird.promisifyAll(redis);

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URL,
);

const scopes = ['https://www.googleapis.com/auth/drive', 'email'];

async function downloadFile(accessToken, fileId, ext = '') {
  const writer = fs.createWriteStream(
    `${process.env.TEMP_DIRECTORY || '/tmp'}/${fileId}.${ext}`,
  );
  const response = await axios({
    url: `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    responseType: 'stream',
  });

  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

const setToken = async tokens => {
  const idToken = jwtDecode(tokens.id_token);
  console.log(idToken.email);
  if(process.env.OEXPENSES_ALLOWED_USERS.split(',').indexOf(idToken.email) !== -1) {
    const sessionId = uuidv5(
      idToken.email,
      '6f70656e-2d65-7870-656e-7365732d6964',
    );
    const client = redis.createClient(
      process.env.REDIS_PORT || 6379,
      process.env.REDIS_HOST || '127.0.0.1',
    );
    await client.hmsetAsync(`OEXPENSES_${sessionId}`, {
      email: idToken.email,
      ...tokens,
    });
    await client.quitAsync();
    return sessionId;
  }
  return false;
};

oauth2Client.on('tokens', async tokens => {
  await setToken(tokens);
});

const generateAuthUrl = () => {
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
  });
};

const getToken = async code => {
  const { tokens } = await oauth2Client.getToken(code);
  return setToken(tokens);
};

const sessionExists = async sessionId => {
  const client = redis.createClient(
    process.env.REDIS_PORT || 6379,
    process.env.REDIS_HOST || '127.0.0.1',
  );
  const exists = await client.existsAsync(`OEXPENSES_${sessionId}`);
  await client.quitAsync();
  return exists === 1;
};

const list = async (sessionId, path = 'root') => {
  const client = redis.createClient(
    process.env.REDIS_PORT || 6379,
    process.env.REDIS_HOST || '127.0.0.1',
  );
  const session = await client.hgetallAsync(`OEXPENSES_${sessionId}`);
  await client.quitAsync();
  oauth2Client.setCredentials(session);
  const drive = google.drive({ version: 'v3', auth: oauth2Client });
  const driveList = await drive.files.list({
    q: `'${path}' in parents and trashed=false and mimeType = 'application/vnd.google-apps.folder'`,
    orderBy: 'name',
  });
  return driveList.data.files;
};

const pdfs = async (sessionId, path = 'root') => {
  const client = redis.createClient(
    process.env.REDIS_PORT || 6379,
    process.env.REDIS_HOST || '127.0.0.1',
  );
  const session = await client.hgetallAsync(`OEXPENSES_${sessionId}`);
  await client.quitAsync();
  oauth2Client.setCredentials(session);
  const drive = google.drive({ version: 'v3', auth: oauth2Client });
  const driveList = await drive.files.list({
    q: `'${path}' in parents and trashed=false`,
    orderBy: 'name',
  });
  return driveList.data.files;
};

const download = async (sessionId, fileId, extension = '') => {
  const client = redis.createClient(
    process.env.REDIS_PORT || 6379,
    process.env.REDIS_HOST || '127.0.0.1',
  );
  const session = await client.hgetallAsync(`OEXPENSES_${sessionId}`);
  let filePath = await client.getAsync(
    `OEXPENSES_CACHE_${sessionId}_${fileId}`,
  );

  if (filePath === null || extension === 'json' || extension === 'txt') {
    await downloadFile(session.access_token, fileId, extension);
    filePath = `${process.env.TEMP_DIRECTORY || '/tmp'}/${fileId}.${extension}`;
    await client.setexAsync(
      `OEXPENSES_CACHE_${sessionId}_${fileId}`,
      60 * 10,
      filePath,
    );
  }

  await client.quitAsync();
  return filePath;
};

const upload = async (sessionId, file, name, parentId) => {
  const client = redis.createClient(
    process.env.REDIS_PORT || 6379,
    process.env.REDIS_HOST || '127.0.0.1',
  );
  const session = await client.hgetallAsync(`OEXPENSES_${sessionId}`);
  await client.quitAsync();
  oauth2Client.setCredentials(session);
  const fileMetadata = {
    name,
    parents: [parentId],
  };
  const media = {
    mimeType: 'text/plain',
    body: fs.createReadStream(file),
  };
  const drive = google.drive({ version: 'v3', auth: oauth2Client });
  return drive.files.create({
    resource: fileMetadata,
    media,
  });
};

const editFileContent = async (sessionId, file, fileId) => {
  const client = redis.createClient(
    process.env.REDIS_PORT || 6379,
    process.env.REDIS_HOST || '127.0.0.1',
  );
  const session = await client.hgetallAsync(`OEXPENSES_${sessionId}`);
  await client.quitAsync();
  oauth2Client.setCredentials(session);
  const media = {
    mimeType: 'text/plain',
    body: fs.createReadStream(file),
  };
  const drive = google.drive({ version: 'v3', auth: oauth2Client });
  return drive.files.update({
    fileId,
    media,
  });
};

const search = async (sessionId, keyword = 'root') => {
  const client = redis.createClient(
    process.env.REDIS_PORT || 6379,
    process.env.REDIS_HOST || '127.0.0.1',
  );
  const session = await client.hgetallAsync(`OEXPENSES_${sessionId}`);
  await client.quitAsync();
  oauth2Client.setCredentials(session);
  const drive = google.drive({ version: 'v3', auth: oauth2Client });
  const driveList = await drive.files.list({
    q: `name contains '${keyword}' and trashed=false and mimeType = 'application/vnd.google-apps.folder'`,
    orderBy: 'name',
  });
  return driveList.data.files;
};

module.exports = {
  generateAuthUrl,
  getToken,
  sessionExists,
  list,
  search,
  pdfs,
  download,
  upload,
  editFileContent,
};
