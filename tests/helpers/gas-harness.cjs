const fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
function gasHarness(secret = 'test-gas-secret', codeSource = fs.readFileSync(require.resolve('../../backend/Code.gs'),'utf8')) {
  const sheets = {
    Orders: [
      ['Timestamp', 'Order', 'Customer', 'Email', 'Phone', 'Method', 'Items', 'Subtotal €', 'Shipping €', 'Total €', 'COGS €', 'Fee €', 'Profit €']
    ],
    Messages: [
      ['Timestamp', 'Name', 'Email', 'Phone', 'Comment']
    ],
    Subscribers: [
      ['Timestamp', 'Email']
    ],
    'Chatbot Log': [
      ['Timestamp', 'Session', 'Page', 'Question', 'Route', 'Tier', 'Reason', 'Matched Q&A', 'Transcript', 'Status', 'Owner answer', 'Add to KB', 'Reviewed']
    ]
  };

  const getSheet = name => {
    if (!sheets[name]) sheets[name] = [];
    const rows = sheets[name];
    return {
      getDataRange: () => ({ getValues: () => rows.map(r => r.slice()) }),
      appendRow: r => rows.push(r.slice()),
      getRange: (r, c) => ({
        setValue: v => { rows[r - 1][c - 1] = v; },
        setFontWeight: () => ({ setBackground: () => ({ setFontColor: () => {} }) })
      }),
      setFrozenRows: () => {}
    };
  };

  const mails = [];
  const context = {
    OWNER_EMAIL: 'owner@example.com',
    SHEET_NAME: 'Orders',
    ORDERS_HEADER: sheets.Orders[0],
    MSG_HEADER: sheets.Messages[0],
    CHAT_HEADER: sheets['Chatbot Log'][0],
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    MailApp: { sendEmail: m => mails.push(m) },
    CacheService: { getScriptCache: () => ({ get: () => null, put() {} }) },
    Session: { getScriptTimeZone: () => 'UTC', getActiveUser: () => ({ getEmail: () => 'owner@example.com' }) },
    Utilities: {
      formatDate: () => '2026-10-23 12:00',
      computeDigest: (alg, val) => Buffer.from(crypto.createHash('sha256').update(String(val)).digest()),
      base64EncodeWebSafe: b => Buffer.from(b).toString('base64url'),
      computeHmacSha256Signature: (b, k) => Array.from(crypto.createHmac('sha256', k).update(b).digest()),
      DigestAlgorithm: { SHA_256: 'SHA_256' }
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: k => k === 'WORKER_GAS_SECRET' ? secret : null,
        setProperty: () => {}
      })
    },
    ContentService: {
      createTextOutput: content => ({
        setMimeType: () => JSON.parse(content)
      }),
      MimeType: { JSON: 'JSON' }
    },
    getSheet_: getSheet,
    getSpreadsheet_: () => ({
      getSheetByName: name => getSheet(name),
      insertSheet: name => getSheet(name),
      getId: () => 'mock-ss-id'
    }),
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({
        getSheetByName: name => getSheet(name),
        insertSheet: name => getSheet(name),
        getId: () => 'mock-ss-id'
      })
    }
  };

  vm.createContext(context);
  vm.runInContext(codeSource, context);
  context.getSheet_ = getSheet;
  return { context, sheets, mails };
}


module.exports={gasHarness};
