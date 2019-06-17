const router = require('express').Router();
const gdrive = require('../gdrive');

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

router.get('/pdfs/:folderId', async (req, res) => {
  const list = await gdrive.pdfs(req.header('OExpenses'), req.params.folderId);
  res.json(list);
});

router.get('/invoice/:fileId', async (req, res) => {
  if (req.params.fileId.endsWith('.pdf')) {
    const pdf = await gdrive.pdf(
      req.query.OExpenses,
      req.params.fileId.substr(0, req.params.fileId.length - 4),
    );
    res.sendFile(pdf);
  } else {
    res.json({});
  }
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
