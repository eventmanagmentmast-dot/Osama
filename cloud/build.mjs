import {build} from 'esbuild';
import {mkdir,readFile,writeFile,cp} from 'node:fs/promises';
import {resolve,dirname,extname} from 'node:path';
const read=p=>readFile(p,'utf8');
await mkdir('dist/server',{recursive:true});
await mkdir('dist/.openai',{recursive:true});
const assets={};
for(const file of ['index.html','app.js','style.css','warehouse.js','business.js','qrcode.js','experience.js','experience.css','sample.json'])assets['/'+(file==='index.html'?'':file)]=await read(file);
assets['/brand-mark.png']=(await readFile('brand-mark.png')).toString('base64');
assets['/cloud-ui.js']=await read('cloud/ui.js');
assets['/']=assets['/'].replace('</head>','<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 32 32%22%3E%3Crect width=%2232%22 height=%2232%22 rx=%228%22 fill=%22%2318334c%22/%3E%3Ctext x=%227%22 y=%2224%22 fill=%22white%22 font-size=%2223%22%3EO%3C/text%3E%3C/svg%3E"></head>').replace('</body>','<script src="/cloud-ui.js"></script></body>');
assets['/app.js']=assets['/app.js'].replace(/start\(\);\s*$/,'');
await writeFile('cloud/assets.generated.json',JSON.stringify(assets));
// Resolve this small dependency graph explicitly; this also avoids native
// bundler directory traversal outside the project on restricted Windows hosts.
const result=await build({entryPoints:[resolve('cloud/worker.mjs')],tsconfigRaw:{},write:false,bundle:true,format:'esm',platform:'browser',target:'es2022',minify:false,plugins:[{name:'project-files',setup(b){b.onResolve({filter:/.*/},a=>({path:a.path==='fflate'?resolve('node_modules/fflate/esm/browser.js'):resolve(a.importer?dirname(a.importer):process.cwd(),a.path),namespace:'project'}));b.onLoad({filter:/.*/,namespace:'project'},async a=>({contents:await read(a.path),loader:extname(a.path)==='.json'?'json':'js'}));}}]});
await writeFile('dist/server/index.js',result.outputFiles[0].contents);
await cp('.openai/hosting.json','dist/.openai/hosting.json');
await cp('drizzle','dist/.openai/drizzle',{recursive:true});
