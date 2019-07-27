const fs = require('fs');
const router = require('express').Router();
const gdrive = require('../gdrive');
const analyze = require('../analyze');

router.get('/status', (req, res) => {
  res.json({ message: 'API OK' });
});

router.all('/*', async (req, res, next) => {
  let OExpenses = req.header('OExpenses');
  if (typeof OExpenses === 'undefined') {
    OExpenses = req.query.OExpenses;
  }
  const exists = await gdrive.sessionExists(OExpenses);
  if (exists) {
    next();
  } else {
    res.status('401');
    res.json({ redirect: '/oauth' });
  }
});

router.get('/list/', async (req, res) => {
  const list = await gdrive.list(req.header('OExpenses'));
  res.json(list);
});

router.get('/list/:folderId', async (req, res) => {
  const list = await gdrive.list(req.header('OExpenses'), req.params.folderId);
  res.json(list);
});

router.get('/analyze/:folderId', async (req, res) => {
  const fullList = await gdrive.pdfs(
    req.header('OExpenses'),
    req.params.folderId,
  );
  const list = fullList.filter(l => l.mimeType === 'application/pdf');
  const listNames = list.map(l => l.name);
  await analyze.setAnalyzeList(req.header('OExpenses'), listNames);
  for (let i = 0; i < list.length; i += 1) {
    const name = list[i].name.substr(0, list[i].name.length - 4);
    const txt = fullList.find(f => f.name === `${name}.txt`);
    let pdf;
    gdrive
      .download(req.header('OExpenses'), list[i].id, 'pdf')
      .then(rPdf => {
        pdf = rPdf;
        return analyze.pdfToText(pdf);
      })
      .then(dst => {
        const text = fs.readFileSync(dst);
        if (text.length < 100) {
          return analyze.pdfToVision(pdf);
        }
        return Promise.resolve(dst);
      })
      .then(async dst => {
        if (typeof txt !== 'undefined') {
          await gdrive.editFileContent(req.header('OExpenses'), dst, txt.id);
        } else {
          await gdrive.upload(
            req.header('OExpenses'),
            dst,
            `${list[i].name.substr(0, list[i].name.length - 4)}.txt`,
            req.params.folderId,
          );
        }
        await analyze.delAnalyzeElement(req.header('OExpenses'), list[i].name);
      });
  }

  res.json('ok');
});

router.get('/analyze', async (req, res) => {
  const listNames = await analyze.getAnalyzeList(req.header('OExpenses'));
  res.json(listNames);
});

router.get('/pdfs/:folderId', async (req, res) => {
  const list = await gdrive.pdfs(req.header('OExpenses'), req.params.folderId);
  res.json(list);
});

router.get('/invoice/:fileId', async (req, res) => {
  const [fileId, ext] = req.params.fileId.split('.');
  const file = await gdrive.download(req.query.OExpenses, fileId, ext);
  res.sendFile(file);
});

router.post('/invoice/:folderId/:filename', async (req, res) => {
  const tempJsonPath = `${process.env.TEMP_DIRECTORY ||
    '/tmp'}/${req.params.filename.replace(new RegExp('/', 'g'), '_')}.json`;
  fs.writeFileSync(tempJsonPath, JSON.stringify(req.body), 'utf-8');
  await gdrive.upload(
    req.header('OExpenses'),
    tempJsonPath,
    `${req.params.filename}.json`,
    req.params.folderId,
  );
  res.json(req.body);
  // res.sendFile(file);
});

router.put('/invoice/:jsonId', async (req, res) => {
  const tempJsonPath = `${process.env.TEMP_DIRECTORY || '/tmp'}/${
    req.params.jsonId
  }.json`;
  fs.writeFileSync(tempJsonPath, JSON.stringify(req.body), 'utf-8');
  await gdrive.editFileContent(
    req.header('OExpenses'),
    tempJsonPath,
    req.params.jsonId,
  );
  res.json(req.body);
  // res.sendFile(file);
});

router.get('/search/:keyword', async (req, res) => {
  const list = await gdrive.search(req.header('OExpenses'), req.params.keyword);
  res.json(list);
});

// activities.create(router);
// forms.create(router);
// users.create(router);
// pedagogy.create(router);
// events.create(router);

module.exports = router;
