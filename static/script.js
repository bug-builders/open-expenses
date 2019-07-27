(async () => {
function amount(value) {
  let newValue = value.replace(',', '.');
  newValue = newValue.replace(new RegExp(' ', 'g'), '');

  if(newValue.indexOf('.') !== -1) {
    newValue = parseFloat(newValue);
    newValue = parseInt(newValue*100)
  } else {
    newValue = parseInt(newValue);
  }
  return newValue;
}

function date(value, index = 0) {
  let newValue = moment(value);
  let i = index;
  const commonFormat = [
    'DD/MM/YYYY',
  ]
  while(!newValue.isValid() && i < commonFormat.length) {
    newValue = moment(value, commonFormat[i]);
    i += 1;
  }

  return newValue;
}

function parse() {
  const select = document.getElementById('exampleFormControlSelect1');
  const selectedTextInput = document.getElementById('selectedText');

  if(select.value.startsWith('amount_')) {
    const amount_guessed = amount(selectedTextInput.value);
    $('#exampleFormControlInput1').text((amount_guessed/100).toLocaleString('fr-FR', {style: 'currency', currency: 'EUR'}))
  } else if(select.value === 'date') {
    const date_guessed = date(selectedTextInput.value);
    $('#exampleFormControlInput1').text(date_guessed.toLocaleString('fr-FR'))
  } else {
    $('#exampleFormControlInput1').text(selectedTextInput.value)
  }
}

let wto;
$('#search').keyup(function() {
  clearTimeout(wto);
  wto = setTimeout(async function() {
    const value = $('#search').val();

    const children = $('#jstree_demo_div').jstree('get_children_dom', '#');
    children.each((id, value) => {
      $('#jstree_demo_div').jstree('delete_node', value);
    })

    if(value !== '') {
      await createList(value, 'search');
    } else {
      await createList();
    }
  }, 500);
});

$('#analyzeFolder').click(async function() {
  const folder = JSON.parse($('#folderTitle').attr('folderId'));
  const analyzeFetch = await fetch(`/v0/analyze/${folder.id}`, {headers: {OExpenses: sessionId}})
  if(analyzeFetch.status === 401) {
    const error = await analyzeFetch.json();
    location.href = error.redirect;
  }
  const analyze = await analyzeFetch.json();
  let oldListNames = [];
  const pingAnalyze = setInterval(async () => {
    const listFetch = await fetch(`/v0/analyze`, {headers: {OExpenses: sessionId}})
    const listNames = await listFetch.json();
    if(listNames.length !== oldListNames.length){
      oldListNames = listNames;
      await loadExpenses(folder);
    }
    if(listNames.length === 0) {
      clearInterval(pingAnalyze);
    }
  }, 1000);
  setTimeout(() => {
    clearInterval(pingAnalyze);
  }, 30000)
});

$('#selectFolder').click(async function() {
  const [folderId] = $('#jstree_demo_div').jstree('get_selected');
  let folder = $('#jstree_demo_div').jstree('get_node', folderId);
  if(folder === false) {
    folder = {
      text: 'root',
      id: 'root',
    }
  }
  window.localStorage.setItem('oexpenses-folderId', JSON.stringify(folder));
  await loadExpenses(folder);
})

$('#jstree_demo_div').jstree({core: {check_callback: true}, multiple: false});
$('#jstree_pdf_div').jstree({core: {check_callback: true}, multiple: false});

$('#jstree_demo_div').on("changed.jstree", async function (e, data) {
  await createList(data.selected[0])
});

$('#jstree_pdf_div').on("changed.jstree", async function (e, data) {
  const node = $('#jstree_pdf_div').jstree('get_node', data.selected[0]);
  await loadInvoice(node);
});

async function loadInvoice(node) {
  document.getElementById('invoiceFilename').value = node.text;
  document.getElementById('invoiceJSONId').value = node.data.json;

  document.getElementById('title').value = '';
  document.getElementById('description').value = '';
  document.getElementById('amount_total').value = '';
  document.getElementById('amount_taxes').value = '';
  document.getElementById('date').value = '';
  document.getElementById('invoice_id').value = '';
  document.getElementById('issuer').value = '';

  document.getElementById('embed').src = `/v0/invoice/${node.id}.pdf?OExpenses=${sessionId}`;
  if(node.data.txt){
    const txtFetch = await fetch(`/v0/invoice/${node.data.txt}.txt?OExpenses=${sessionId}`)
    const txt = await txtFetch.text();
    const text = document.getElementById('totext')
    text.value = txt;
    text.addEventListener('select', event => {
      const selectedText = (event.target.value).substring(event.target.selectionStart, event.target.selectionEnd);

      $('#exampleModalCenter').modal({backdrop: 'static', keyboard: false})
      $('#selectedText').val(selectedText)
    })
  }

  if(node.data.json){
    const jsonFetch = await fetch(`/v0/invoice/${node.data.json}.json?OExpenses=${sessionId}`)
    const json = await jsonFetch.json();
    Object.keys(json).forEach(key => {
      document.getElementById(key).value = json[key];
    })
  }
}

async function loadExpenses(folder) {
  $('#folderTitle').text(folder.text);
  $('#folderTitle').attr('folderId', JSON.stringify(folder));
  const children = $('#jstree_pdf_div').jstree('get_children_dom', '#');
  children.each((id, value) => {
    $('#jstree_pdf_div').jstree('delete_node', value);
  })
  const listFetch = await fetch(`/v0/pdfs/${folder.id}`, {headers: {OExpenses: sessionId}})
  if(listFetch.status === 401) {
    const error = await listFetch.json();
    location.href = error.redirect;
  }
  const list = await listFetch.json();

  const pdfs = list.filter(f => f.mimeType === 'application/pdf');

  for(let i = 0; i < pdfs.length; i += 1) {
    const file = pdfs[i];
    const name = file.name.substr(0, file.name.length - 4);

    const txt = list.find(f => f.name === `${name}.txt`);
    const json = list.find(f => f.name === `${name}.json`);

    let icon = 'minus';

    if(typeof(txt) !== 'undefined'){
      icon = 'tag';
    }

    if(typeof(json) !== 'undefined'){
      icon = 'pencil';
    }

    if(typeof(json) !== 'undefined' && typeof(txt) !== 'undefined'){
      icon = 'thumb-up';
    }

    $('#jstree_pdf_div').jstree('create_node', null, {id: file.id, text: name, icon: `oi oi-${icon}`, data: {txt: typeof(txt) !== 'undefined' && txt.id, json: typeof(json) !== 'undefined' && json.id}}, 'last', false, false);
  }
}

async function createList(folderId = '', type = 'list') {
  const listFetch = await fetch(`/v0/${type}/${folderId}`, {headers: {OExpenses: sessionId}})
  if(listFetch.status === 401) {
    const error = await listFetch.json();
    location.href = error.redirect;
  }
  const list = await listFetch.json();

  let parent = null;

  if(folderId !== '' && type === 'list') {
    parent = folderId;
  }

  for(let i = 0; i < list.length; i += 1) {
    const folder = list[i];
    const children = $('#jstree_demo_div').jstree('get_node', folder.id);
    $('#jstree_demo_div').jstree('delete_node', children);
    $('#jstree_demo_div').jstree('create_node', parent, {id: folder.id, text: folder.name}, parent ? 'inside' : 'last', false, true);
  }
  $('#jstree_demo_div').jstree('open_node', parent);
}

const sessionId = window.localStorage.getItem('oexpenses-sessionId');
if(typeof(sessionId) === 'undefined'){
  location.href='/oauth';
}

await createList();

const savedFolder = window.localStorage.getItem('oexpenses-folderId');
if(typeof(savedFolder) !== 'undefined'){
  await loadExpenses(JSON.parse(savedFolder));
}

$('#selectedText').keyup(parse);
$('#exampleFormControlSelect1').change(parse);
$('#saveChanges').click(function() {
  const field = $('#exampleFormControlSelect1').val();
  const value = $('#selectedText').val();
  if(field.startsWith('amount_')) {
    const amount_guessed = amount(value);
    document.getElementById(field).value = amount_guessed
  } else if(field === 'date') {
    const date_guessed = date(value);
    document.getElementById(field).value = date_guessed.format()
  } else {
    document.getElementById(field).value = value
  }
})

$('#saveJson').click(async function() {
  const folder = JSON.parse($('#folderTitle').attr('folderId'));
  if(document.getElementById('invoiceJSONId').value === 'false') {
    const res = await fetch(`/v0/invoice/${folder.id}/${encodeURIComponent(document.getElementById('invoiceFilename').value)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        OExpenses: sessionId,
      },
      body: JSON.stringify({
        title: document.getElementById('title').value,
        description: document.getElementById('description').value,
        amount_total: parseInt(document.getElementById('amount_total').value, 10),
        amount_taxes: parseInt(document.getElementById('amount_taxes').value, 10),
        date: document.getElementById('date').value,
        invoice_id: document.getElementById('invoice_id').value,
        issuer: document.getElementById('issuer').value,
      })
    })
  } else {
    const res = await fetch(`/v0/invoice/${document.getElementById('invoiceJSONId').value}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        OExpenses: sessionId,
      },
      body: JSON.stringify({
        title: document.getElementById('title').value,
        description: document.getElementById('description').value,
        amount_total: parseInt(document.getElementById('amount_total').value, 10),
        amount_taxes: parseInt(document.getElementById('amount_taxes').value, 10),
        date: document.getElementById('date').value,
        invoice_id: document.getElementById('invoice_id').value,
        issuer: document.getElementById('issuer').value,
      })
    })
  }
  await loadExpenses(JSON.parse(savedFolder));
})

})();
