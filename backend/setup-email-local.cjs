// One-use loopback setup: never writes or prints the sending key.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const {renderEmail,makePdf,FROM,REPLY}=require('./order-email.cjs');
const {fixture}=require('./preview-order-email.cjs');
const nonce=require('node:crypto').randomBytes(24).toString('hex');let used=false;
const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Content-Security-Policy',"default-src 'none'; form-action 'self'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'");
  if(req.url!=='/'+nonce){res.writeHead(404);return res.end();}
  if(req.method==='GET'){res.setHeader('Content-Type','text/html;charset=utf-8');return res.end('<!doctype html><title>Asheerah secure email setup</title><h1>Asheerah email setup</h1><p>The key stays in memory and is installed as a Worker secret. A clearly labelled test email and PDF will be sent to shelton.fenhane@gmail.com.</p><form method="post"><label>Sending-only Resend key <input type="password" name="key" autocomplete="off" required></label><button>Configure and send test</button></form>');}
  if(req.method!=='POST'||req.headers.origin!=='http://127.0.0.1:8771'||used){res.writeHead(403);return res.end('Not allowed');}
  let data='';for await(const chunk of req){data+=chunk;if(data.length>1000){res.writeHead(413);return res.end();}}
  const apiKey=new URLSearchParams(data).get('key');if(!/^re_[A-Za-z0-9_-]{10,}$/.test(apiKey||'')){res.writeHead(400);return res.end('Invalid sending key');}used=true;
  try{
    const cli=path.resolve(__dirname,'../../asheerah-stripe-checkout-live/node_modules/wrangler/bin/wrangler.js');
    await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[cli,'secret','put','RESEND_API_KEY','--config',path.join(__dirname,'wrangler.toml')],{cwd:__dirname,windowsHide:true,stdio:['pipe','pipe','pipe']});child.stdin.end(apiKey+'\n');child.stdout.resume();child.stderr.resume();child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error('Worker secret installation failed')));});
    const order={...fixture,id:require('node:crypto').randomUUID(),createdAt:new Date().toISOString(),customer:{...fixture.customer,name:'Shelton — TESTE',email:'shelton.fenhane@gmail.com'}};
    const email=renderEmail(order);email.subject='[TESTE — SEM COMPRA] '+email.subject;email.html=email.html.replace('<body style=', '<body style=');email.html=email.html.replace('<h1 style=', '<p style="padding:16px;background:#fff3cd"><strong>TESTE — demonstração sem compra ou pagamento real.</strong></p><h1 style=');email.text='TESTE — sem compra ou pagamento real.\n\n'+email.text;
    const pdf=await makePdf(order,fs.readFileSync(path.join(__dirname,'../assets/logo-sm.png')));
    const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json','Idempotency-Key':'setup-test/'+order.id},body:JSON.stringify({from:FROM,to:['shelton.fenhane@gmail.com'],reply_to:REPLY,...email,attachments:[{filename:'TESTE-Asheerah-resumo.pdf',content:Buffer.from(pdf).toString('base64')}]})});
    const result=await response.json();if(!response.ok||!result.id)throw new Error('Test send rejected; check sender verification in Resend');
    fs.writeFileSync(path.join(__dirname,'../output/order-email/test-delivery.json'),JSON.stringify({providerId:result.id,to:'shelton.fenhane@gmail.com',acceptedAt:new Date().toISOString()},null,2));
    res.setHeader('Content-Type','text/html;charset=utf-8');res.end('<h1>Setup complete</h1><p>Worker secret installed. Test email with PDF accepted by Resend for shelton.fenhane@gmail.com. Provider acceptance is not yet inbox delivery confirmation.</p><p>Message ID: '+result.id+'</p>');console.log('Worker secret installed; test accepted: '+result.id);
  }catch(err){res.writeHead(500);res.end('Setup needs review: '+err.message);console.error(err.message);}
  finally{setTimeout(()=>server.close(),1000);}
});server.listen(8771,'127.0.0.1',()=>console.log('Setup page: http://127.0.0.1:8771/'+nonce));
