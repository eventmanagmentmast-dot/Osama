/* Pure calculations, shared by the browser and regression tests. */
(function(root){
const round=n=>Math.round((n+Number.EPSILON)*100)/100;
function incomeTax2026(base){let tax=0,last=0;for(const [limit,rate] of [[190000,.15],[400000,.20],[1000000,.27],[5300000,.35],[Infinity,.40]]){tax+=Math.max(0,Math.min(base,limit)-last)*rate;if(base<=limit)break;last=limit;}return round(tax);}
function taxEstimate(x){
 if(x.year!=='2026')throw Error('Bu hesap yalnız 2026 dönemi içindir.');
 const keys=['revenue','cost','additions','deductions','rate','credits','withholdingBase','withholdingRate'];
 for(const k of keys)if(!Number.isFinite(Number(x[k]))||Number(x[k])<0||Number(x[k])>1e12)throw Error('Tutarları kontrol edin.');
 if(Number(x.rate)>100||Number(x.withholdingRate)>100)throw Error('Oran en fazla %100 olabilir.');
 const profit=round(Number(x.revenue)-Number(x.cost));
 const base=round(Math.max(0,profit+Number(x.additions)-Number(x.deductions)));
 const tax=['Şahıs işletmesi','Serbest meslek'].includes(x.type)?incomeTax2026(base):round(base*Number(x.rate)/100);
 return {profit,base,tax,net:round(profit-tax),payable:round(Math.max(0,tax-Number(x.credits))),excessCredit:round(Math.max(0,Number(x.credits)-tax)),withholding:round(Number(x.withholdingBase)*Number(x.withholdingRate)/100)};
}
// Only labelled, unambiguous decimal amounts are suggested; missing values stay null.
function invoiceSuggestions(text){
 const candidates={net:[],vat:[],total:[]},evidence=[],taxRates=[];
 const normalized=text.normalize('NFKC').replace(/İ/g,'I').replace(/ı/g,'i').toLowerCase();
 for(const line of normalized.split(/\r?\n/)){
  const taxKind=/tevkifat/.test(line)?'Tevkifat':/stopaj/.test(line)?'Stopaj':/kdv|katma de[ğg]er|\bvat\b/.test(line)?'KDV':null;
  if(taxKind){
   const percentages=[...line.matchAll(/%\s*(\d{1,3}(?:[.,]\d{1,2})?)|(\d{1,3}(?:[.,]\d{1,2})?)\s*%/g)].map(m=>Number((m[1]||m[2]).replace(',','.'))).filter(n=>n>=0&&n<=100);
   if(!percentages.length&&/oran[ıi]?\s*[:=]?\s*(\d{1,3}(?:[.,]\d{1,2})?)(?:\s|$)/.test(line)){const m=line.match(/oran[ıi]?\s*[:=]?\s*(\d{1,3}(?:[.,]\d{1,2})?)(?:\s|$)/);const n=Number(m[1].replace(',','.'));if(n<=100)percentages.push(n);}
   for(const n of percentages)taxRates.push(taxKind+': %'+n);
   if(taxKind==='Tevkifat'){for(const m of line.matchAll(/\b(\d+)\s*\/\s*(\d+)\b/g))if(Number(m[2])>0&&Number(m[1])<=Number(m[2]))taxRates.push('Tevkifat: '+m[1]+'/'+m[2]);}
  }
  const amounts=[...line.matchAll(/(?:\d{1,3}(?:[. ]\d{3})+|\d+),\d{2}(?!\d)|(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}(?!\d)/g)].filter(m=>!/^\s*%/.test(line.slice(m.index+m[0].length))&&!/%\s*$/.test(line.slice(0,m.index)));
  if(!amounts.length)continue;
  const s=amounts.at(-1)[0],lastComma=s.lastIndexOf(','),lastDot=s.lastIndexOf('.');
  const value=Number(lastComma>lastDot?s.replace(/[. ]/g,'').replace(',','.'):s.replace(/[, ]/g,''));
  if(!Number.isFinite(value))continue;
  let key=null;
  if(/tevkifat|stopaj|iskonto|indirim/.test(line))continue;
  if(/vergiler dahil toplam|genel toplam|ödenecek tutar|odenecek tutar|grand total|amount due/.test(line))key='total';
  else if(/hesaplanan kdv|toplam kdv|kdv tutar|vat amount/.test(line))key='vat';
  else if(/mal hizmet toplam|vergi hariç|vergi haric|kdv hariç|kdv haric|net tutar|subtotal/.test(line))key='net';
  if(key){candidates[key].push(value);evidence.push(line.trim());}
 }
 const archive=/e\s*[-–]?\s*ar[şs]iv(?:\s+fatura)?/.test(normalized),electronic=/e\s*[-–]?\s*fatura/.test(normalized);
 const out={evidence:evidence.join('\n'),taxRates:[...new Set(taxRates)],invoiceType:archive&&!electronic?'e-Arşiv Fatura':electronic&&!archive?'e-Fatura':'Belirlenmedi',net:null,vat:null,total:null};
 for(const k of ['net','vat','total']){const values=[...new Set(candidates[k])];if(values.length===1)out[k]=values[0];}
 out.warning=/tevkifat|stopaj|iskonto|indirim/.test(normalized)?'Kesinti veya indirim ifadesi var. Net ve KDV toplamının ödenecek tutarla eşleştiğini kontrol edin.':'';
 return out;
}
root.OsamaFinance={round,incomeTax2026,taxEstimate,invoiceSuggestions};
if(typeof module!=='undefined')module.exports=root.OsamaFinance;
})(globalThis);
