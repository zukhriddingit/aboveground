#!/usr/bin/env python3
"""Add a weather control to the built Pocket City pages (AboveGround addition, run after build.py).

    python3 experiments/pocket-city/add_weather.py frontend/public/pocket/*.html

Each page gets, under its season buttons:
  - a Weather picker: Season's weather (what the season draws), Live (Boston right now), Clear, Drizzle, Rain,
    Snow, Heavy snow, Fog;
  - a Night toggle;
  - in Live mode, a line with the reading it is drawing and its source.

Live reads the latest observation at Logan Airport from the National Weather Service (api.weather.gov, free, no key)
and falls back to Open-Meteo for the plate's own coordinates. Night follows the sun in Live mode. A page can be opened
with ?weather=live (or clear, rain, ...) and &night=1 or &night=0.

The drawing runs in workers built from the page's text blocks, so the patch sends "<kind>|<night>" with every frame
request; the worker re-applies the season when that changes and lays the weather over it. Pages that already have the
patch are skipped. Standard library only.
"""
import sys
from pathlib import Path

MARK = "AboveGround weather (add_weather.py)"

# ---------------------------------------------------------------- worker side (the engine text blocks)

WORKER_FN = """/* AboveGround weather (add_weather.py): the page sends m.wx = "<kind>|<night>". An empty kind keeps the season's
   own weather; night is 'night', 'day' or '' (the season or occasion decides). */
let WX_KEY='';
function applyWeather(S,w){
  const [kind='',night='']=String(w||'').split('|');
  if(kind){
    const wet=kind==='rain'||kind==='drizzle',snow=kind==='snow'||kind==='heavysnow';
    S.wx=wet||snow?kind:'none';S.wet=wet;S.umbrellas=wet;S.haze=kind==='fog';S.fog=kind==='fog';S.overcast=wet;
    if(snow){S.snow=true;S.coats=true;S.cafes=false}
    if(wet&&S.cafes)S.cafes='closed';
    if(wet||snow)S.petals=false;
    S.crowd=(S.crowd??1)*({rain:.75,drizzle:.9,snow:.8,heavysnow:.55,fog:.9}[kind]??1);
  }
  if(night==='night')S.night=true;else if(night==='day')S.night=false;
}
function setSeason(id,w){"""

WORKER_REPLACEMENTS = [
    ("function setSeason(id){", WORKER_FN),
    ("SEASON={...st};SEASON_ID=st.id;", "SEASON={...st};SEASON_ID=st.id;WX_KEY=w||'';applyWeather(SEASON,w);"),
    ("if(SEASON_ID!==m.season)setSeason(m.season);",
     "if(SEASON_ID!==m.season||WX_KEY!==(m.wx||''))setSeason(m.season,m.wx);"),
    # the frame's cache key: a weather change repaints the ground and the people
    ("m.season,m.finish", "m.season,m.wx,m.finish"),
    # fog is a cool grey veil, rain a light blue-grey overcast; the season's haze stays the warm summer haze
    ("if(SEASON.haze){", "if(SEASON.haze||SEASON.overcast){"),
    ("g.fillStyle='rgba(224,207,176,.38)'",
     "g.fillStyle=SEASON.fog?'rgba(226,230,235,.52)':SEASON.haze?'rgba(224,207,176,.38)':'rgba(92,108,138,.16)'"),
    # the kit's rain is a hairline that vanishes at the app's zoom; draw it heavier and denser
    ("  rain:    { n: 320, v: 12, len: 2.4, w: .85, col: '#5f7bb0', op: .6, top: 30 },",
     "  rain:    { n: 560, v: 12, len: 3.4, w: 2.1, col: '#5a77ad', op: .7, top: 30 },"),
    ("  drizzle: { n: 420, v: 7,  len: 1.8, w: .7,  col: '#6a82b4', op: .55, top: 26 },",
     "  drizzle: { n: 640, v: 7,  len: 2.2, w: 1.5, col: '#6782b6', op: .62, top: 26 },"),
]

# ---------------------------------------------------------------- page side

ICON_CLOUD = ('<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" '
              'stroke-linecap="round" stroke-linejoin="round"><path d="M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.2 9.1 '
              '4.5 4.5 0 0 0 7 18Z"/><path d="M9 21l1-1.5M13 21l1-1.5" /></svg>')
ICON_CHEVRON = ('<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" '
                'stroke-linecap="round" stroke-linejoin="round"><path d="m5 9 7 7 7-7"/></svg>')
ICON_MOON = ('<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" '
             'stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" '
             'fill="#d9d6ea"/></svg>')

WX_ROW = ('<div class="events" id="wxRow"><div class="select-wrap">' + ICON_CLOUD +
          '<select id="weather" aria-label="Weather"></select>' + ICON_CHEVRON + '</div>'
          '<button class="chip" id="nightBtn" aria-pressed="false">' + ICON_MOON + ' Night</button></div>')

NOTE_ANCHOR = '</div><div class="note" id="note" aria-live="polite"></div>'
NOTE_NEW = (WX_ROW + '</div><div class="note" id="note" aria-live="polite"></div>'
            '<div class="note" id="wxNote" aria-live="polite" hidden></div>')

CSS = """
/* AboveGround weather (add_weather.py) */
#wxNote[hidden]{display:none}
#nightBtn svg{color:#6c6890}
@media(min-width:761px){#wxRow{margin-top:6px}}
"""

MAIN_JS = r"""
/* ---------- weather (AboveGround weather (add_weather.py)) ----------
   Season's weather keeps what the season draws. Live reads the latest observation at Logan Airport (National Weather
   Service), falling back to Open-Meteo for this plate, and turns night on after sunset. */
const WX_KINDS=[['','Season’s weather'],['live','Live · Boston now'],['clear','Clear'],['drizzle','Drizzle'],['rain','Rain'],['snow','Snow'],['heavysnow','Heavy snow'],['fog','Fog']];
const wxQ=new URLSearchParams(location.search);
let wxChoice=WX_KINDS.some(([k])=>k===wxQ.get('weather'))?wxQ.get('weather'):'';
let wxNight=wxQ.get('night')==='1'?'night':wxQ.get('night')==='0'?'day':'';   // '' = the season or occasion (or, in Live, the sun) decides
let wxLive=null,wxLiveFailed=false,wxLastSent='';
const wxSel=$('weather'),nightBtn=$('nightBtn'),wxNote=$('wxNote');
wxSel.replaceChildren(...WX_KINDS.map(([k,l])=>new Option(l,k)));

/* The sun's altitude in degrees (NOAA's low-precision formulas, good to about a degree). */
function sunAltitude(lat,lon,date=new Date()){
  const rad=Math.PI/180,d=date.getTime()/864e5-10957.5;   // days from J2000.0
  const g=(357.529+.98560028*d)*rad,q=280.459+.98564736*d;
  const L=(q+1.915*Math.sin(g)+.02*Math.sin(2*g))*rad,e=(23.439-3.6e-7*d)*rad;
  const ra=Math.atan2(Math.cos(e)*Math.sin(L),Math.cos(L)),dec=Math.asin(Math.sin(e)*Math.sin(L));
  const gmst=((18.697374558+24.06570982441908*d)%24+24)%24,ha=(gmst*15+lon)*rad-ra;
  return Math.asin(Math.sin(lat*rad)*Math.sin(dec)+Math.cos(lat*rad)*Math.cos(dec)*Math.cos(ha))/rad;
}
const sunDown=()=>sunAltitude(META.lat,META.lon)<-4;
const sceneNight=()=>!!(SEASONS.concat(OCCASIONS).find(x=>x.id===season)||{}).night;
function wxMsg(){
  const live=wxChoice==='live';
  const kind=live?(wxLive?wxLive.kind:''):wxChoice;
  const night=wxNight||(live&&sunDown()?'night':'');
  return kind+'|'+night;
}
function wxText(t){const s=String(t||'').trim();return s?s[0].toLowerCase()+s.slice(1):''}
/* An NWS description ("Light Rain and Fog/Mist", "Mostly Cloudy") to a kind the page draws. */
function wxFromText(text,present){
  const t=(String(text||'')+' '+(present||[]).map(w=>(w.intensity||'')+' '+(w.weather||'')).join(' ')).toLowerCase();
  if(!t.trim())return null;
  if(/snow|sleet|ice pellets|flurr/.test(t))return /heavy/.test(t)?'heavysnow':'snow';
  if(/thunder|rain|shower/.test(t))return /heavy|thunder/.test(t)?'rain':/light/.test(t)?'drizzle':'rain';
  if(/drizzle/.test(t))return 'drizzle';
  if(/fog|mist|haze|smoke/.test(t))return 'fog';
  return 'clear';
}
/* A WMO weather code (Open-Meteo) to [kind, words]. */
function wxFromCode(c){
  if(c===0)return['clear','Clear'];if(c<=2)return['clear','Partly cloudy'];if(c===3)return['clear','Overcast'];
  if(c===45||c===48)return['fog','Fog'];if(c>=51&&c<=57)return['drizzle','Drizzle'];
  if(c===61||c===80)return['drizzle','Light rain'];if((c>=62&&c<=67)||c===81||c===82)return['rain','Rain'];
  if(c===75||c===86)return['heavysnow','Heavy snow'];if((c>=71&&c<=77)||c===85)return['snow','Snow'];
  if(c>=95)return['rain','Thunderstorm'];return['clear','Clear'];
}
async function fetchLive(){
  const f=c=>Math.round(c*9/5+32);
  try{
    const r=await fetch('https://api.weather.gov/stations/KBOS/observations/latest');
    if(!r.ok)throw new Error('NWS '+r.status);
    const p=(await r.json()).properties||{};
    const kind=wxFromText(p.textDescription,p.presentWeather);
    if(!kind)throw new Error('NWS: no description');
    return{kind,text:p.textDescription||'Clear',tempF:p.temperature&&p.temperature.value!=null?f(p.temperature.value):null,
      at:new Date(p.timestamp),where:'Logan Airport',source:'National Weather Service',url:'https://forecast.weather.gov/data/obhistory/KBOS.html'};
  }catch(e){
    const u='https://api.open-meteo.com/v1/forecast?latitude='+META.lat.toFixed(4)+'&longitude='+META.lon.toFixed(4)+'&current=temperature_2m,weather_code&temperature_unit=fahrenheit';
    const r=await fetch(u);if(!r.ok)throw new Error('Open-Meteo '+r.status);
    const c=(await r.json()).current;const [kind,text]=wxFromCode(c.weather_code);
    return{kind,text,tempF:Math.round(c.temperature_2m),at:new Date(c.time+'Z'),where:CITY.name,source:'Open-Meteo',url:'https://open-meteo.com/'};
  }
}
function wxUi(){
  wxSel.value=wxChoice;wxSel.parentElement.classList.toggle('on',!!wxChoice);
  const night=wxMsg().split('|')[1];
  nightBtn.setAttribute('aria-pressed',String(night==='night'||(night===''&&sceneNight())));
  if(wxChoice!=='live'){wxNote.hidden=true;return}
  wxNote.hidden=false;
  if(!wxLive){wxNote.textContent=wxLiveFailed?'Live weather is unavailable right now, so this is the season’s weather.':'Checking the weather in Boston…';return}
  const a=document.createElement('a');a.href=wxLive.url;a.target='_blank';a.rel='noopener';a.textContent=wxLive.source+' ↗';
  const at=isNaN(wxLive.at)?'':', '+wxLive.at.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZone:'America/New_York'});
  wxNote.replaceChildren(document.createTextNode('Live at '+wxLive.where+': '+(wxLive.tempF!=null?wxLive.tempF+'°F, ':'')+wxText(wxLive.text)+at+(sunDown()?', after dark':'')+'. '),a);
}
function wxApply(){const k=wxMsg();if(k!==wxLastSent){wxLastSent=k;generation++;redraw()}wxUi()}
async function wxRefresh(){
  try{wxLive=await fetchLive();wxLiveFailed=false}catch(e){console.warn('Live weather:',e);wxLiveFailed=!wxLive}
  wxApply();
}
function wxSet(choice){
  wxChoice=choice;
  if(choice==='live'){if(season!==months[localMonth-1])selectSeason(months[localMonth-1]);if(!wxLive)wxRefresh()}
  wxApply();
}
wxSel.onchange=e=>wxSet(e.target.value);
nightBtn.onclick=()=>{const on=nightBtn.getAttribute('aria-pressed')==='true';wxNight=on?'day':'night';wxApply()};
setInterval(()=>{if(wxChoice==='live'&&!document.hidden)wxRefresh()},10*60*1000);   // a fresh reading every 10 minutes
setInterval(()=>{if(wxChoice==='live')wxApply()},60*1000);                           // and dusk on time
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&wxChoice==='live')wxRefresh()});
$('chips').addEventListener('click',()=>setTimeout(wxUi));$('event').addEventListener('change',()=>setTimeout(wxUi));
wxSet(wxChoice);
"""

MAIN_REPLACEMENTS = [
    ("finish,season,seq:++seq,generation};", "finish,season,wx:wxMsg(),seq:++seq,generation};"),
    ("selectSeason(season);setPlay(playing);requestAnimationFrame(tick);",
     MAIN_JS.strip() + "\nselectSeason(season);setPlay(playing);requestAnimationFrame(tick);\nwxUi();"),
]


def patch(path: Path) -> str:
    s = path.read_text(encoding="utf-8")
    if MARK in s:
        return "already patched"
    for old, new in WORKER_REPLACEMENTS + MAIN_REPLACEMENTS + [(NOTE_ANCHOR, NOTE_NEW)]:
        n = s.count(old)
        if n != 1:
            raise SystemExit(f"{path}: expected one '{old[:50]}', found {n} (was the page built by a different kit version?)")
        s = s.replace(old, new)
    s = s.replace("</style>", CSS + "</style>", 1)
    path.write_text(s, encoding="utf-8")
    return "patched"


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    for arg in sys.argv[1:]:
        p = Path(arg)
        if p.name == "index.html":
            continue
        print(f"{p.name}: {patch(p)}")
