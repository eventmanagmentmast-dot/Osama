import {getDocument,GlobalWorkerOptions} from './pdf-engine.mjs';
GlobalWorkerOptions.workerSrc=new URL('./pdf-worker.mjs',import.meta.url).href;
export async function readInvoicePdf(file){
 if(file.size>10*1024*1024)throw Error('PDF en fazla 10 MB olabilir.');
 const task=getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,useSystemFonts:true});
 let timer;
 try{
  return await Promise.race([(async()=>{
   const doc=await task.promise;
   if(doc.numPages>30)throw Error('Otomatik okuma en fazla 30 sayfalık faturaları destekliyor.');
   const lines=[];
   for(let i=1;i<=doc.numPages;i++){
    const content=await (await doc.getPage(i)).getTextContent();let current=[],y=null;
    for(const item of content.items){if(typeof item.str!=='string')continue;const nextY=Math.round(item.transform[5]);if(y!==null&&Math.abs(nextY-y)>3){lines.push(current.join(' '));current=[];}current.push(item.str);y=nextY;if(item.hasEOL){lines.push(current.join(' '));current=[];y=null;}}
    if(current.length)lines.push(current.join(' '));
   }
   const text=lines.join('\n');
   if(text.trim().length<15)throw Error('Bu PDF taranmış görüntü içeriyor veya metin okunamıyor. Otomatik OCR henüz yok; tutarları belgeden kontrol ederek girin.');
   return text;
  })(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('PDF okuma zaman aşımına uğradı. Tutarları elle girebilirsiniz.')),30000);})]);
 }finally{clearTimeout(timer);await task.destroy();}
}
