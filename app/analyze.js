const path = require('path');
const cp = require('child_process');
const fs = require('fs');
const bluebird = require('bluebird');
const redis = require('redis');

bluebird.promisifyAll(redis);
const vision = require('@google-cloud/vision');
const { Storage } = require('@google-cloud/storage');

const bucketName = process.env.GOOGLE_BUCKET_NAME;
const storage = new Storage({
  projectId: process.env.GOOGLE_PROJECT_ID,
});

function pdfToText(pdf) {
  const dst = `${pdf.substr(0, pdf.length - 4)}.txt`;
  const argv = [pdf, dst];
  const child = cp.spawn('pdftotext', argv);
  return new Promise(resolve => {
    child.on('close', () => {
      resolve(dst);
    });
  });
}

async function getGVisionResult(pdf) {
  const dst = `${pdf.substr(0, pdf.length - 4)}.txt`;
  const filename = path.basename(pdf);
  const resDir = `${filename.split('.pdf')[0]}/`;
  const [files] = await storage
    .bucket(bucketName)
    .getFiles({ prefix: resDir, delimiter: '/' });
  return new Promise(async resolve => {
    if (files.length === 0) {
      setTimeout(() => {
        resolve(getGVisionResult(pdf));
      }, 1000);
    } else {
      let concatPages = '';
      for (let i = 0; i < files.length; i += 1) {
        const file = files[i];
        const [fileContent] = await file.download();
        const gvisionResult = JSON.parse(fileContent.toString('utf8'));
        // eslint-disable-next-line
        gvisionResult.responses.forEach(response => {
          concatPages += `${response.fullTextAnnotation.text}\n`;
        });
      }
      fs.writeFileSync(dst, concatPages);
    }
    resolve(dst);
  });
}

async function pdfToVision(pdf) {
  console.log(
    `${pdf} does not contains enough text, let's try google vision instead.`,
  );

  const filename = path.basename(pdf);
  const resDir = `${filename.split('.pdf')[0]}/`;
  const [fileExists] = await storage
    .bucket(bucketName)
    .file(filename)
    .exists();
  if (!fileExists) {
    console.log(`Uploading ${filename}`);
    await storage.bucket(bucketName).upload(pdf);
  }

  const gsFilename = `gs://${bucketName}/${filename}`;
  const [resFiles] = await storage
    .bucket(bucketName)
    .getFiles({ prefix: resDir });

  if (resFiles.length > 0) {
    return getGVisionResult(pdf);
  }
  const gsDst = `gs://${bucketName}/${resDir}`;
  console.log(`Start google vision analysis on ${filename}`);
  const visionClient = new vision.ImageAnnotatorClient();

  const inputConfig = {
    mimeType: 'application/pdf',
    gcsSource: {
      uri: gsFilename,
    },
  };
  const outputConfig = {
    gcsDestination: {
      uri: gsDst,
    },
  };

  await visionClient.asyncBatchAnnotateFiles({
    requests: [
      {
        inputConfig,
        features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
        outputConfig,
      },
    ],
  });

  return getGVisionResult(pdf);
}

async function setAnalyzeList(sessionId, list) {
  const client = redis.createClient(
    process.env.REDIS_PORT || 6379,
    process.env.REDIS_HOST || '127.0.0.1',
  );
  for (let i = 0; i < list.length; i += 1) {
    await client.setAsync(`OEXPENSES_ANALYZE_${sessionId}_${list[i]}`, 1);
  }

  await client.quitAsync();
}

async function getAnalyzeList(sessionId) {
  const client = redis.createClient(
    process.env.REDIS_PORT || 6379,
    process.env.REDIS_HOST || '127.0.0.1',
  );
  const list = await client.keysAsync(`OEXPENSES_ANALYZE_${sessionId}_*`);
  await client.quitAsync();
  return list.map(l =>
    l
      .split('_')
      .slice(3)
      .join('_'),
  );
}

async function delAnalyzeElement(sessionId, name) {
  const client = redis.createClient(
    process.env.REDIS_PORT || 6379,
    process.env.REDIS_HOST || '127.0.0.1',
  );
  await client.delAsync(`OEXPENSES_ANALYZE_${sessionId}_${name}`);
  await client.quitAsync();
}

module.exports = {
  pdfToText,
  setAnalyzeList,
  getAnalyzeList,
  delAnalyzeElement,
  pdfToVision,
};
