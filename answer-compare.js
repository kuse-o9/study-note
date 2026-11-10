'use strict';
(function(g){
 const normal=s=>String(s??'').normalize('NFKC').replace(/[−–]/g,'-').replace(/\r\n?/g,'\n').trim().replace(/[\t ]+/g,' ');
 function numeric(s){const m=normal(s).replace(/\s/g,'').match(/^(?:([a-zA-Z])=)?([+-]?\d{1,12}(?:\.\d{1,12})?)(?:\/([+-]?\d{1,12}(?:\.\d{1,12})?))?([a-zA-Z%°℃]+[23]?)?$/);if(!m)return null;
  const fraction=t=>{const negative=t.startsWith('-');t=t.replace(/^[+-]/,'');const[a,b='']=t.split('.');return [BigInt((negative?'-':'')+a+b),10n**BigInt(b.length)];};const[n,d]=fraction(m[2]),[dn,dd]=m[3]?fraction(m[3]):[1n,1n];if(!dn)return null;return{n:n*dd,d:d*dn,variable:m[1]||'',unit:m[4]||''};
 }
 function compare(answer,expected){const a=normal(answer),e=normal(expected);if(!a||!e)return{status:'ungraded',method:'empty'};if(a===e)return{status:'correct',method:'exact'};
  const x=numeric(a),y=numeric(e);if(x&&y){const sameVariable=!x.variable||!y.variable||x.variable===y.variable;return{status:sameVariable&&x.unit===y.unit&&x.n*y.d===y.n*x.d?'correct':'incorrect',method:'numeric'};}
  // Never infer the correctness of long explanations or equations from keywords.
  if(e.length>80||/[\n。！？!?]|\s.*\s/.test(e)||/[=+*/^]/.test(e))return{status:'ungraded',method:'manual'};
  return{status:'incorrect',method:'exact'};
 }
 const api={normal,compare};if(typeof module==='object'&&module.exports)module.exports=api;else g.StudyAnswerCompare=api;
})(globalThis);
