/* Conservative e-ticket extraction: ambiguous values stay empty for manual review. */
function parseCustomerDetailsFromText(text) {
  // PDF columns often put several labeled fields on the same visual row.
  const fields = 'Passenger Name|Airline Name|Operating Airline|Marketing Airline|Airline|Carrier|Flight Number|Flight No\\.?|Airline PNR|PNR|Booking Reference|Ticket Numbers?|Ticket No\\.?|E[ -]?Ticket(?: Number| No\\.?)?|Departure Airport|Departure City|Departure Date|Departure|Departing From|Arrival Airport|Arrival City|Arrival Date|Arrival|Destination|Origin|From|To|Return Date|Travel Date|Issue Date|Date of Birth|Trip Type|Grand Total|Total Fare|Mobile';
  const normalized = String(text || '').replace(/\r/g,'').replace(/\u00a0/g,' ')
    .replace(new RegExp('(^|[ \\t]+)((?:'+fields+')\\s*[:#])','gim'),(_,space,label)=>(space?'\n':'')+label);
  const lines = normalized.split('\n').map(s=>s.replace(/\s+/g,' ').trim()).filter(Boolean);
  const raw = lines.join('\n');
  const read = labels => {
    const pattern = new RegExp('^(?:'+labels+')\\s*(?::|#|–|\\s-\\s)\\s*(.*)$','i');
    const heading = new RegExp('^(?:'+labels+')\\s*:?$','i');
    for (let i=0;i<lines.length;i++) {
      const m=lines[i].match(pattern);
      if (m?.[1]) return m[1].trim();
      if (heading.test(lines[i])) return lines[i+1] || '';
      const unpunctuated=lines[i].match(new RegExp('^(?:'+labels+')\\s+(.+)$','i'));
      if(unpunctuated && !/^[^:#]+[:#]/.test(lines[i])) return unpunctuated[1].trim();
    }
    return '';
  };
  const months = {jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
  function date(value) {
    let m=String(value).match(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/), y,mo,d;
    if(m) [,y,mo,d]=m;
    else if((m=String(value).match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})\b/))) [,d,mo,y]=m;
    else if((m=String(value).match(/\b(\d{1,2})[ -]*([A-Za-z]{3,9})[ ,.-]*(\d{4}|\d{2})\b/))) {d=m[1];mo=months[m[2].slice(0,3).toLowerCase()];y=m[3];}
    else if((m=String(value).match(/\b([A-Za-z]{3,9})[ .-]*(\d{1,2})[ ,.-]*(\d{4}|\d{2})\b/))) {d=m[2];mo=months[m[1].slice(0,3).toLowerCase()];y=m[3];}
    if (!y || !mo || !d) return '';
    if (String(y).length===2) y='20'+y;
    const check=new Date(Date.UTC(+y,+mo-1,+d));
    return check.getUTCFullYear()===+y && check.getUTCMonth()===+mo-1 && check.getUTCDate()===+d
      ? `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}` : '';
  }
  const knownCodes=new Set(airportIndex().map(a=>a.code));
  const code = value => {
    const text=String(value||'').trim(), upper=text.toUpperCase();
    const explicit=upper.match(/\(([A-Z]{3})\)/);
    if(explicit && knownCodes.has(explicit[1])) return explicit[1];
    if (/^[A-Z]{3}$/.test(upper) && knownCodes.has(upper)) return upper;
    const edge=upper.match(/^([A-Z]{3})(?:\s*[-–,]|\s+AIRPORT\b)/) || upper.match(/\b([A-Z]{3})$/);
    if(edge && knownCodes.has(edge[1])) return edge[1];
    const city=text.replace(/\s*[,;-]?\s*terminal\b.*$/i,'').replace(/\s+(?:international|intl\.?|domestic)?\s*airport\b.*$/i,'').trim();
    const cityKey=city.toLowerCase().replace(/[^a-z]/g,'');
    if(AIRPORT_ALIASES[cityKey]) return AIRPORT_ALIASES[cityKey];
    const normalized=text.toLowerCase().replace(/[^a-z]/g,'');
    if(AIRPORT_ALIASES[normalized]) return AIRPORT_ALIASES[normalized];
    const matches=airportIndex().filter(a=>[normalized,cityKey].includes(a.city.toLowerCase().replace(/[^a-z]/g,'')));
    const popular=matches.filter(a=>AIRPORT_POPULAR[a.code]);
    return matches.length===1 ? matches[0].code : popular.length===1 ? popular[0].code : '';
  };
  let from=code(read('Departure Airport|Departure City|Departure Name|Departure From|Departing From|From|Origin|Boarding')) || code(read('Departure'));
  let to=code(read('Arrival Airport|Arrival City|Arrival Name|Arrival At|Arriving At|To|Destination')) || code(read('Arrival'));
  const segments=[];
  for(const line of lines) {
    const route=line.match(/\b([A-Z]{3})\s*(?:→|->|–|—|-|\/|\bto\b)\s*([A-Z]{3})\b/i);
    if(route && knownCodes.has(route[1].toUpperCase()) && knownCodes.has(route[2].toUpperCase())) {
      segments.push({from:route[1].toUpperCase(),to:route[2].toUpperCase(),date:date(line)});
    }
  }
  if(segments.length) { from=from||segments[0].from; to=to||segments[0].to; }
  const labeledRoute=read('Route|Sector');
  if(labeledRoute && (!from||!to)) {
    const parts=labeledRoute.split(/\s+(?:to|–|—|->|→|-)\s+|\s*\/\s*/i);
    if(parts.length===2) {from=from||code(parts[0]);to=to||code(parts[1]);}
  }
  if(from===to) to='';
  const depart=date(read('Departure Date|Depart Date|Date of Departure|Travel Date|Journey Date|Onward Date|Outbound Date|Flight Date|Departure')) || segments[0]?.date || '';
  let ret=date(read('Return Date|Return Journey|Inbound Date|Date of Return|Inbound'));
  const returnSegment=segments.find((s,i)=>i>0 && s.from===to && s.to===from);
  if (!ret && returnSegment?.date) ret=returnSegment.date;
  const type=read('Trip Type|Journey Type');
  let tripType=/^(?:one[ -]?way|single journey)$/i.test(type) || lines.some(l=>/^one[ -]?way$/i.test(l)) ? 'One way'
    : ret || returnSegment || /^(?:return|round[ -]?trip)$/i.test(type) || lines.some(l=>/^(return|round[ -]?trip)$/i.test(l)) ? 'Return' : '';
  if(tripType==='One way' || (depart && ret && ret<depart)) ret='';
  function passenger(value) {
    const name=String(value).replace(/\s+\d{3}[- ]?\d{10}\b.*$/, '').replace(/^\d+[).:-]\s*/,'').replace(/\s*\((?:ADT|CHD|INF|ADULT|CHILD|INFANT)\)\s*$/i,'').trim();
    if (!/^[\p{L}][\p{L} ./'’()-]{2,79}$/u.test(name)) return '';
    if(/\b(itinerary|ticket|booking|invoice|flight|airline|amount|total|fare|tax|pnr|sector|departure|arrival|baggage|terminal|seat|class|status|reference)\b/i.test(name)) return '';
    if(/^(passengers?|name|passenger name|adult|child|infant)$/i.test(name)) return '';
    return name.toUpperCase();
  }
  const passengers=[];
  const passengerIdentities=new Set();
  const add=value=>{
    const n=passenger(value);
    const ticket=String(value).match(/\b\d{3}[- ]?\d{10}\b/);
    const identity=n+'|'+(ticket?ticket[0].replace(/[- ]/g,''):'');
    if(n && !passengerIdentities.has(identity)){passengerIdentities.add(identity);passengers.push(n);}
  };
  for(let i=0;i<lines.length;i++) {
    const m=lines[i].match(/^(?:Passenger(?:\s*(?:Name)?s?|\s*\d+)|Pax Names?|Travell?er Names?|Name of Passenger)\s*:\s*(.*)$/i);
    if(m?.[1]) m[1].split(/\s*[;|]\s*|\s+(?=\d+[).]\s)/).forEach(add);
    else if(/^(?:Passengers?(?: Names?)?|Pax Names?|Travell?er Names?)(?:\s+Ticket\s+(?:Numbers?|No\.?))?\s*:?$/i.test(lines[i])) {
      for(let j=i+1;j<Math.min(lines.length,lines.length);j++) { if(!passenger(lines[j])) break; add(lines[j]); }
    } else if(/^(?:\d+[).]\s+)?(?:MR|MRS|MS|MISS|MSTR|DR)\.?\s+\p{L}/iu.test(lines[i]) || /^[A-Z][A-Z' -]+\/[A-Z][A-Z' -]+$/.test(lines[i])) add(lines[i]);
  }
  const count=read('No\\.? of Passengers|No\\.? of Pax|Total Passengers|Pax|Passengers').match(/^\d{1,3}\b/);
  const paxCount=count && +count[0]>0 && +count[0]<=999 ? +count[0] : passengers.length || null;
  const reference=read('Airline PNR|PNR|Booking Reference|Booking Ref|Reservation Code|Record Locator').match(/^([A-Z0-9]{5,8})\b/i)
    || raw.match(/\b(?:PNR|Booking Reference|Record Locator)\s+([A-Z0-9]{5,8})\b/i);
  const pnr=reference && !/^(NUMBER|STATUS|REFERENCE)$/i.test(reference[1]) ? reference[1].toUpperCase() : '';
  const ticketPattern=/\b\d{3}[ -]?\d{3}[ -]?\d{4}[ -]?\d{3}\b/g;
  const ticketValues=[];
  for(let i=0;i<lines.length;i++) {
    if(/\b(?:e[ -]?ticket|ticket\s*(?:no\.?|numbers?|#)|document\s*(?:no\.?|numbers?))\b/i.test(lines[i])) {
      const value=lines[i]+' '+(lines[i+1]||'');
      for(const match of value.matchAll(ticketPattern)) ticketValues.push(match[0].replace(/ /g,''));
    }
  }
  const ticketNo=[...new Set(ticketValues)].join(' | ');
  let airline=read('Airline Name|Operating Airline|Marketing Airline|Airline|Carrier').split(/\s+(?:Flight|PNR|Class|Ticket)\b/i)[0];
  if(!airline) airline=['Air India Express','Air India','Emirates','Qatar Airways','Etihad Airways','IndiGo','SpiceJet','Akasa Air','Air Arabia','flydubai','Oman Air','Saudia','Kuwait Airways','Gulf Air','Singapore Airlines','British Airways','Lufthansa','Thai Airways','Malaysia Airlines','Cathay Pacific','Air Canada','Qantas','Turkish Airlines','SriLankan Airlines'].find(a=>raw.toLowerCase().includes(a.toLowerCase())) || '';
  const amount=read('Grand Total|Total Price|Client Price|Total Fare|Total Amount|Invoice Total');
  const currency=read('Currency');
  // All application prices are INR. Never import a net fare, balance or foreign amount as a client price.
  const foreign=/\b(USD|AED|SGD|GBP|EUR|SAR|OMR|KWD|QAR|BHD)\b|[$£€]/i.test(amount+' '+currency);
  const money=amount.match(/(?:INR|Rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)|^([\d,]+(?:\.\d{1,2})?)\s*(?:INR|Rs\.?|₹)$/i)
    || (/^INR$/i.test(currency) ? amount.match(/^([\d,]+(?:\.\d{1,2})?)$/) : null);
  const number=money ? Number((money[1]||money[2]).replace(/,/g,'')) : 0;
  const payment=!foreign && Number.isFinite(number) && number>0 && number<10000000 ? String(number) : '';
  const mobileRaw=read('Mobile(?: Number| No\\.?)?|Contact Number|Phone(?: Number)?');
  const mobile=/^\+?[\d ()-]{10,18}$/.test(mobileRaw)?mobileRaw:'';
  return {passengers,clientName:passengers[0]||passenger(read('Customer Name|Client Name|Lead Passenger|Contact Name')),mobile,paxCount,from,to,depart,ret,tripType,airline,pnr,ticketNo,payment};
}

async function extractTextFromPdfFile(file) {
  if (!window.pdfjsLib?.getDocument) throw new Error('PDF reader unavailable. Check your connection and reload.');
  window.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const pdf=await window.pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise;
  try {
    if(pdf.numPages>20) throw new Error('Please upload an e-ticket with no more than 20 pages.');
    const pages=[];
    for(let i=1;i<=pdf.numPages;i++) {
      const page=await pdf.getPage(i), content=await page.getTextContent();
      const rows=[];
      for(const item of content.items) {
        if(!item.str?.trim()) continue;
        const y=item.transform?.[5]||0, x=item.transform?.[4]||0;
        let row=rows.find(r=>Math.abs(r.y-y)<3);
        if(!row) {row={y,items:[]};rows.push(row);}
        row.items.push({x,str:item.str});
      }
      pages.push(rows.sort((a,b)=>b.y-a.y).map(r=>r.items.sort((a,b)=>a.x-b.x).map(i=>i.str).join(' ')).join('\n'));
    }
    return pages.join('\n');
  } finally { await pdf.destroy(); }
}

function applyParsedCustomerDetails(p,fileId) {
  if (fileId!==currentEditingFileId || !requireBooking(fileId) || !canEditDetails(DB.bookings.find(b=>b.id===fileId))) return [];
  const applied=[];
  const set=(id,value,label,defaultValue)=>{
    const el=document.getElementById(id);
    if(!el || el.disabled || value==null || value==='') return;
    if(String(el.value).trim() && el.value!==defaultValue) return;
    if(el.value===String(value)) return;
    el.value=value; el.dispatchEvent(new Event('input',{bubbles:true}));
    el.dispatchEvent(new Event('change',{bubbles:true})); applied.push(label);
  };
  set('bf-client',p.clientName,'Client Name'); set('bf-mobile',p.mobile,'Mobile');
  const airportLabel=code=>{const airport=airportIndex().find(a=>a.code===code);return airport ? airport.city+' ('+airport.code+')' : code;};
  set('bf-from',airportLabel(p.from),'Departure Airport');set('bf-to',airportLabel(p.to),'Arrival Airport');set('bf-depart',p.depart,'Departure Date');set('bf-airline',p.airline,'Airline');
  if(can('ticketing')) {set('bf-pnr',p.pnr,'PNR');set('bf-ticketno',p.ticketNo,'Ticket Number');}
  if(canEditPrice(DB.bookings.find(b=>b.id===fileId))) set('bf-sell',p.payment,'Client Price','0');
  const trip=document.getElementById('bf-triptype');
  const ret=document.getElementById('bf-ret');
  // An explicit manual selection or return date always takes precedence.
  if(p.tripType && trip && !trip.dataset.manual && !ret?.value) {
    trip.value=p.tripType; onFlightTripTypeChange(p.tripType); applied.push('Trip Type');
  }
  if(trip?.value==='Return') set('bf-ret',p.ret,'Return Date');
  if(p.passengers?.length) {
    const wrap=document.getElementById('bf-paxnames-list');
    if(wrap) {
      const existing=collectPassengerRows();
      const counts=new Map();existing.forEach(name=>{const key=name.trim().toUpperCase();counts.set(key,(counts.get(key)||0)+1);});
      if(!existing.length)wrap.innerHTML='';
      let added=0;
      p.passengers.forEach(name=>{const key=name.trim().toUpperCase(),count=counts.get(key)||0;if(count)counts.set(key,count-1);else {addPassengerRow(name);added++;}});
      if(added)applied.push('Passenger Names');
      const pax=document.getElementById('bf-pax');if(pax)pax.value=String(Math.max(+pax.value||1,collectPassengerRows().length,p.paxCount||0));
    }
  }
  set('bf-pax',p.paxCount,'Passenger Count','1');
  if(applied.length) __bookingDirty=true;
  return [...new Set(applied)];
}
