/* Read-only vocabulary overview; shared by the browser and regression tests. */
(function(root){
 function recentRatings(card){
  return [...(Array.isArray(card.history)?card.history:[]),...(Array.isArray(card.practiceHistory)?card.practiceHistory:[])]
   .filter(h=>h&&['again','hard','good','easy'].includes(h.rating))
   .sort((a,b)=>(Number(a.at)||0)-(Number(b.at)||0)).slice(-3);
 }
 function learningState(card){
  return card.state||(!(Number(card.reps)>0)?'new':Number(card.intervalDays)>=21?'mature':'learning');
 }
 function assessment(card){
  const state=learningState(card),recent=recentRatings(card);
  if(state==='new')return 'Neu im SRS';
  if(state==='relearning'||recent.some(h=>h.rating==='again'||h.rating==='hard'))return 'Besondere Aufmerksamkeit';
  if(recent.length>=2&&Number(card.intervalDays)>=5)return 'Gut im Aufbau';
  return 'Noch festigen';
 }
 function cell(value){
  return String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
   .replace(/\\/g,'\\\\').replace(/\|/g,'\\|').replace(/`/g,'\\`').replace(/[\r\n]+/g,'; ').trim()||'—';
 }
 function intervalLabel(days){
  const n=Number(days);if(!Number.isFinite(n)||n<=0)return '—';
  if(n<1)return Math.max(1,Math.round(n*1440))+' Min.';
  return Number(n.toFixed(2)).toLocaleString('de-DE')+' Tage';
 }
 function build(save,at=new Date()){
  const cards=Array.isArray(save?.cards)?save.cards:[];
  const order=['Neu im SRS','Besondere Aufmerksamkeit','Noch festigen','Gut im Aufbau'];
  const states={new:'Neu',learning:'Lernend',relearning:'Wiederlernen',mature:'Reif'};
  const ratings={again:'Nochmal',hard:'Schwer',good:'Gut',easy:'Leicht'};
  const rows=cards.map((card,index)=>({card,index,level:assessment(card)}))
   .sort((a,b)=>order.indexOf(a.level)-order.indexOf(b.level)||a.index-b.index);
  const counts=order.map(level=>level+': '+rows.filter(r=>r.level===level).length).join(' · ');
  const header=[
   '# Mein Vokabelstand – Kotodama',
   'Erstellt: '+at.toLocaleString('de-DE')+' ('+Intl.DateTimeFormat().resolvedOptions().timeZone+'). Quelle: aktueller Spielstand auf diesem Gerät.',
   cards.length+' Karten · '+counts,
   '',
   'Einschätzung: Neu = noch neu im SRS; besondere Aufmerksamkeit = Wiederlernen oder Schwer/Nochmal unter den letzten 3 Bewertungen; gut im Aufbau = mindestens 2 Bewertungen, die letzten bis zu 3 nur Gut/Leicht, Intervall mindestens 5 Tage; sonst noch festigen. Dies ist keine Garantie für sichere Beherrschung.',
   'Bewertungen stammen aus SRS und freiem Training (alt → neu). Adventure ist nicht eingerechnet. JP→DE und DE→JP sind darin nicht getrennt erfasst. Intervall = gespeicherter Wiederholungsabstand, keine verbleibende Wartezeit. Bedeutungen und Lesungen sind unverändert aus meinen Karten übernommen.',
   '',
   '| Vokabel | Lesung | Bedeutung | Einschätzung | SRS-Status | Letzte Bewertungen | Intervall |',
   '|---|---|---|---|---|---|---|'
  ];
  for(const {card,level} of rows)header.push('| '+[card.front,card.reading,card.back,level,states[learningState(card)]||learningState(card),recentRatings(card).map(h=>ratings[h.rating]).join(' → '),intervalLabel(card.intervalDays)].map(cell).join(' | ')+' |');
  if(!cards.length)header.push('', 'Noch keine Karten vorhanden.');
  return header.join('\n');
 }
 const api={build,assessment,recentRatings};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 else root.KotodamaLearningExport=api;
})(typeof window!=='undefined'?window:globalThis);
