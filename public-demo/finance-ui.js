names.taxScenarios='Vergi ve net kâr';uxTitles.taxScenarios=names.taxScenarios;
uxGroups.find(g=>g[0]==='Finans')[1].push('taxScenarios');
const previousFinanceRender=render;
render=function(...args){if(page==='taxScenarios'&&schema.taxScenarios)return taxView();return previousFinanceRender(...args);};
const previousFinanceInvoiceView=invoiceView;
invoiceView=function(){previousFinanceInvoiceView();const add=$('#invoice-add');if(!writable.includes('expenses')){add.remove();document.querySelectorAll('[data-invoice-edit],[data-invoice-file]').forEach(b=>b.remove());return;}add.onclick=()=>invoiceEntry();const pdf=document.createElement('button');pdf.className='primary';pdf.textContent='PDF’den fatura oku';pdf.onclick=()=>invoiceEntry(true);add.after(pdf);};
function invoiceEntry(wantsPdf=false,review=null){
 const invoiceFields=(schema.expenses||schema.invoiceSubmissions.filter(f=>['event','vendor','description','net','vat','document','number','due','taxRates','invoiceType'].includes(f[0])));
 let pendingFile=null,reading=false,saving=false,submitted=false,savedId=null,readSequence=0;
 const fields=invoiceFields.map(([key,label,t])=>({key,label,value:review?.[key]??(key==='invoiceType'?'Belirlenmedi':key==='document'?'Faturalı':key==='event'?(selected==='all'?'':selected):undefined),required:!t.startsWith('opt'),type:t==='money'?'number':t==='date'?'date':'text',options:key==='invoiceType'?['Belirlenmedi','e-Fatura','e-Arşiv Fatura','Diğer / kâğıt fatura'].map(v=>[v,v]):t.includes('ref:')?[['','İş seçin'],...rows(t.split(':')[1]).map(r=>[r.id,labelRef(t.split(':')[1],r.id)])]:t.startsWith('enum:')?t.slice(5).split(',').map(v=>[v,v]):undefined}));
 fields.push({key:'checkedTotal',label:'Belgedeki genel toplam TL · kontrol için',type:'number',value:review?review.net+review.vat:undefined});
 form('Gelen fatura · kontrol ve onay',fields,async input=>{
  if(submitted)throw Error('Kayıt zaten gönderildi. Formu kapatıp kayıtları yenileyin.');
  if(reading||saving)throw Error('İşlem sürüyor, lütfen bekleyin.');
  if(!$('#invoice-confirm').checked)throw Error('Fatura bilgilerini kontrol edip onaylayın.');
  const record=Object.fromEntries(invoiceFields.map(([key,,type])=>[key,type==='money'?Number(input[key]):input[key]]));
  if(Math.abs(OsamaFinance.round(record.net+record.vat)-Number(input.checkedTotal))>.011)throw Error('Net + KDV, kontrol toplamına eşit olmalı. Tevkifatlı veya farklı kesintili faturalar bu formda henüz desteklenmiyor.');
  if(record.number&&rows('expenses').some(r=>r.id!==savedId&&r.number===record.number&&r.vendor.trim().toLocaleLowerCase('tr')===record.vendor.trim().toLocaleLowerCase('tr')))throw Error('Bu tedarikçi ve fatura numarası zaten kayıtlı. Mevcut faturayı düzenleyin.');
  saving=true;submit.disabled=true;
  try{
   let file=null;if(pendingFile){const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=()=>reject(Error('Belge okunamadı'));reader.readAsDataURL(pendingFile);});file={name:pendingFile.name,data};}
   const action=review?.status==='Onay bekliyor'?'approve':'submit';
   if(demo){const rid=review?.id||crypto.randomUUID(),submission={...record,id:rid,owner:review?.owner||user.name,status:action==='approve'?'Onaylandı':'Onay bekliyor',submittedAt:review?.submittedAt||new Date().toISOString(),reviewer:action==='approve'?user.name:'',reviewedAt:action==='approve'?new Date().toISOString():'',reviewNote:'',expense:action==='approve'?crypto.randomUUID():''};if(action==='approve')rows('expenses').push({...record,id:submission.expense});const list=rows('invoiceSubmissions'),i=list.findIndex(r=>r.id===rid);if(i<0)list.push(submission);else list[i]=submission;app();notice(action==='approve'?'Örnek fatura onaylandı.':'Onay kuyruğuna gönderildi. Demo belgeleri saklanmaz.');}
   else{await api('invoice-approval',{action,id:review?.id,record,...(file&&action==='submit'?{file}:{})});submitted=true;await load();notice(action==='approve'?'Onaylandı ve giderlere işlendi.':'Muhasebe / yönetici onayına gönderildi.');}
  }
  finally{saving=false;submit.disabled=false;}
 });
 const dlg=$('#dialog'),submit=dlg.querySelector('button.primary');submit.textContent=review?.status==='Onay bekliyor'?'Onayla ve giderlere işle':'Girişi tamamla ve onaya gönder';
 // Re-enable disabled fields for a retry's FormData without allowing edits after partial save.
 const originalSubmit=dlg.querySelector('form').onsubmit;
 dlg.querySelector('form').onsubmit=e=>{const disabled=[...dlg.querySelectorAll('.fields :disabled')];disabled.forEach(el=>el.disabled=false);const result=originalSubmit(e);disabled.forEach(el=>el.disabled=true);return result;};
 const section=document.createElement('section');section.innerHTML='<label>PDF fatura seç · en fazla 10 MB<input id="invoice-pdf" type="file" accept="application/pdf,.pdf"></label><p id="invoice-reading" role="status">PDF bu cihazda okunur. Okunan tutarlar öneridir; kaydetmeden önce kontrol edin.</p><details><summary>Okunan metin ve tutar dayanakları</summary><pre id="invoice-evidence" style="white-space:pre-wrap;max-height:220px;overflow:auto"></pre></details>';
 dlg.querySelector('.fields').before(section);
 const confirmLabel=document.createElement('label');confirmLabel.innerHTML='<input id="invoice-confirm" type="checkbox" required> Tedarikçi, iş, fatura numarası, net tutar, KDV ve genel toplamı belgeyle karşılaştırdım.';dlg.querySelector('.actions').before(confirmLabel);
 dlg.querySelector('.fields').addEventListener('input',()=>{$('#invoice-confirm').checked=false;});
 if(!review)dlg.querySelector('[name=document]').value='Faturalı';
 $('#invoice-pdf').onchange=async e=>{
  const sequence=++readSequence,file=e.target.files[0];pendingFile=null;reading=false;submit.disabled=false;dlg.querySelector('[name=invoiceType]').value='Belirlenmedi';$('#invoice-confirm').checked=false;
  for(const k of ['net','vat','checkedTotal','taxRates'])dlg.querySelector('[name='+k+']').value='';
  if(!file)return;
  if(!/\.pdf$/i.test(file.name)||file.size>10*1024*1024){$('#invoice-reading').textContent='En fazla 10 MB PDF seçin.';e.target.value='';return;}
  pendingFile=file;reading=true;submit.disabled=true;$('#invoice-reading').textContent='PDF okunuyor…';
  try{const {readInvoicePdf}=await import('./pdf-reader.mjs');const text=await readInvoicePdf(file);if(sequence!==readSequence||!dlg.open)return;const result=OsamaFinance.invoiceSuggestions(text);dlg.querySelector('[name=invoiceType]').value=result.invoiceType;dlg.querySelector('[name=taxRates]').value=result.taxRates.join('; ');for(const [k,value] of Object.entries({net:result.net,vat:result.vat,checkedTotal:result.total}))if(value!==null)dlg.querySelector('[name='+k+']').value=value;$('#invoice-evidence').textContent=text.slice(0,30000);$('#invoice-reading').textContent=(result.warning?result.warning+' ':'')+'Öneriler dolduruldu. Boş kalan alanları girin; tüm tutarları PDF ile karşılaştırıp onaylayın.';}
  catch(error){if(sequence===readSequence&&dlg.open)$('#invoice-reading').textContent=error.message;}
  finally{if(sequence===readSequence){reading=false;submit.disabled=false;}}
 };
 if(wantsPdf)$('#invoice-pdf').focus();
}
function taxView(){
 const rs=rows('taxScenarios');
 $('#content').innerHTML='<div class="page-heading"><div><p class="eyebrow">ŞİRKET BAZINDA · 2026</p><h2>Vergi ve net kâr</h2><p>Her şirket ve yıllık dönem için ayrı hesap senaryosu.</p></div>'+(writable.includes('taxScenarios')?'<button class="primary" id="tax-add">+ Şirket hesabı ekle</button>':'')+'</div><section><p>Şirketlerin tüm yıllık gelir ve giderlerini KDV hariç girin. Etkinlik filtresi bu paneli etkilemez; iş kayıtları henüz şirketlere bağlı olmadığı için tutarlar kendiliğinden aktarılmaz.</p><p>Sonuç tahminidir. Kurumlar vergisi oranını ve mali düzeltmeleri mali müşavirinizin teyit ettiği değerlerle girin. Asgari kurumlar vergisi, istisnalar, özel teşvikler ve kâr dağıtımı ayrıca değerlendirilmelidir.</p></section>'+rs.map(r=>{const t=OsamaFinance.taxEstimate(r);return '<section><div class="section-heading"><div><h3>'+esc(r.company)+'</h3><p>'+esc(r.type)+' · '+esc(r.year)+'</p></div>'+(writable.includes('taxScenarios')?'<button data-tax-edit="'+esc(r.id)+'">Düzenle</button>':'')+'</div>'+taxResult(t)+'<p>'+esc(r.note||'')+'</p></section>';}).join('')+(rs.length?'':'<section>Henüz şirket hesabı yok. İlk şirketi ekleyerek hesaplamayı başlatın.</section>')+'<p><a target="_blank" rel="noopener" href="https://cdn.gib.gov.tr/api/gibportal-file/file/getFileResources?objectKey=arsiv/yardim-kaynaklar/yararli-bilgiler/gelir-vergisi-tarifeleri/gelir-vergisi-tarifesi-2026.pdf">Kaynak: GİB 2026 gelir vergisi tarifesi (ücret dışı)</a> · Kontrol: 16.09.2026</p>';
 if($('#tax-add'))$('#tax-add').onclick=()=>taxEdit();document.querySelectorAll('[data-tax-edit]').forEach(b=>b.onclick=()=>taxEdit(find('taxScenarios',b.dataset.taxEdit)));
}
function taxResult(t){return cards([['Vergi öncesi kâr / zarar',money(t.profit)],['Vergi matrahı · tahmini',money(t.base)],['Hesaplanan yıllık vergi',money(t.tax)],['Vergi sonrası kâr · tahmini',money(t.net)],['Mahsup sonrası vergi bakiyesi',money(t.payable)],['İncelenecek fazla mahsup',money(t.excessCredit)],['Başkası adına ödenecek stopaj',money(t.withholding)]])+'<p>Mahsup, vergi bakiyesini azaltır; kârdan ikinci kez düşülmez. Fazla mahsup otomatik iade sayılmaz. Başkası adına stopaj, brüt gider içinde zaten yer alıyorsa kârdan tekrar düşülmez. KDV bu kâr hesabına dahil değildir.</p>';}
function taxEdit(r){let saving=false;form('Şirketin yıllık vergi ve kâr hesabı',schema.taxScenarios.map(([key,label,type])=>({key,label,value:r?.[key]??(key==='year'?'2026':type==='money'&&key!=='rate'?0:undefined),required:type!=='optional',type:type==='money'?'number':'text',options:type.startsWith('enum:')?type.slice(5).split(',').map(v=>[v,v]):undefined})),async record=>{if(saving)return;for(const [key,,type] of schema.taxScenarios)if(type==='money')record[key]=Number(record[key]);OsamaFinance.taxEstimate(record);saving=true;try{await businessSave('taxScenarios',{...record,id:r?.id||crypto.randomUUID()});}finally{saving=false;}});
 const output=document.createElement('div');output.setAttribute('aria-live','polite');$('#dialog .fields').after(output);
 const update=()=>{const record=Object.fromEntries(new FormData($('#dialog form'))),rate=$('#dialog [name=rate]'),individual=['Şahıs işletmesi','Serbest meslek'].includes(record.type);rate.required=!individual;rate.closest('label').style.display=individual?'none':'';if(individual)record.rate=0;try{if(!individual&&record.rate==='')throw Error('Kurumlar vergisi oranını girin.');output.innerHTML=taxResult(OsamaFinance.taxEstimate(record));}catch(error){output.textContent=error.message;}};
 $('#dialog form').addEventListener('input',update);$('#dialog form').addEventListener('change',update);update();
 const submit=$('#dialog form').onsubmit;$('#dialog form').onsubmit=e=>{if(['Şahıs işletmesi','Serbest meslek'].includes($('#dialog [name=type]').value))$('#dialog [name=rate]').value=0;return submit(e);};
}

const typeInvoiceView=invoiceView;invoiceView=function(){typeInvoiceView();const list=visible('expenses').filter(e=>e.document==='Faturalı'),panel=document.createElement('section');panel.innerHTML='<h3>Fatura türleri</h3>'+cards(['e-Fatura','e-Arşiv Fatura','Diğer / kâğıt fatura','Belirlenmedi'].map(t=>[t,list.filter(r=>(r.invoiceType||'Belirlenmedi')===t).length]));$('#content').append(panel);};
