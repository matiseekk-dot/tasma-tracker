import { useState, useMemo, useRef, useEffect } from "react";

// ─── Constants ────────────────────────────────────────────────────────────────
const BKM    = ["Superbet","Fortuna","STS","Betclic","LVBet","Betfan","Totolotek"];
const MONTHS = ["Styczeń","Luty","Marzec","Kwiecień","Maj","Czerwiec","Lipiec","Sierpień","Wrzesień","Październik","Listopad","Grudzień"];
const DAYS7  = ["Pn","Wt","Śr","Cz","Pt","Sb","Nd"];

const SK="tc2",BK="tb2",SK2="ts2",SK3="tw2",SK4="tt2",SAL="tal2";

// ─── Pure helpers ─────────────────────────────────────────────────────────────
const todayISO = () => {
  const d=new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
};
const fmt   = (n) => `${n>=0?"+":""}${n.toFixed(2)} zł`;
const fmtP  = (n) => `${n>=0?"+":""}${n.toFixed(1)}%`;
const ls    = {
  get:(k,fb)=>{ try{const v=localStorage.getItem(k);return v?JSON.parse(v):fb;}catch{return fb;} },
  set:(k,v)=>{ try{localStorage.setItem(k,JSON.stringify(v));}catch{} },
};
// Unit display helper
const toU = (stake, unitSize) => unitSize>0 ? `${(stake/unitSize).toFixed(1)}u` : null;
const dispStake = (stake, unitSize, cur="zł") => unitSize>0 ? `${(stake/unitSize).toFixed(1)}u` : `${stake} ${cur}`;

const grpByDate = (arr) => {
  const g={};
  [...arr].sort((a,b)=>b.date.localeCompare(a.date)).forEach(c=>{
    if(!g[c.date])g[c.date]=[];g[c.date].push(c);
  });
  return g;
};

// ─── P&L (with tax, freebet, cashout) ────────────────────────────────────────
const calcPnl = (c, taxRate=0) => {
  const tax=taxRate/100;
  if(c.status==="cashout"){
    const cost=c.isFreebet?0:c.stake;
    const gross=(c.cashoutAmount||0)-cost;
    return gross>0?gross*(1-tax):gross;
  }
  if(c.status==="won"){
    if(c.isFreebet){
      const gross=c.freebetSR?c.odds*c.stake-c.stake:(c.odds-1)*c.stake;
      return gross>0?gross*(1-tax):gross;
    }
    const gross=c.odds*c.stake-c.stake;
    return gross>0?gross*(1-tax):gross;
  }
  if(c.status==="lost") return c.isFreebet?0:-c.stake;
  return 0;
};

// ─── EV helpers ──────────────────────────────────────────────────────────────
const impliedProb = (odds) => odds>0 ? 1/odds : 0;
const calcEV      = (odds, prob) => (odds*prob)-1;
const calcEdge    = (odds, prob) => ((odds*prob)-1)*100;
const evStatus    = (ev) => ev>0.02?"value":ev>-0.02?"neutral":"bad";
const evColor     = (ev,A,G,R) => ev>0.02?G:ev>-0.02?A:R;

// ─── Odds range helper ───────────────────────────────────────────────────────
const oddsRange = (odds) => odds<2?"<2.0":odds<=5?"2.0–5.0":">5.0";

// ─── Rolling average ────────────────────────────────────────────────────────
const rollingAvg = (pts, window=7) => pts.map((_, i) => {
  const start=Math.max(0,i-window+1);
  const slice=pts.slice(start,i+1);
  return slice.reduce((s,v)=>s+v,0)/slice.length;
});

// ─── Export / Import ─────────────────────────────────────────────────────────
const pdfExport = (coupons, stats, settings, bankroll) => {
  const taxRate=settings.taxRate||0;
  const cur="zł";
  const settled=coupons.filter(c=>["won","lost","cashout"].includes(c.status));
  const monthly={};
  settled.forEach(c=>{
    const mo=c.date.slice(0,7);
    if(!monthly[mo])monthly[mo]={stk:0,p:0,w:0,t:0};
    monthly[mo].stk+=c.stake;monthly[mo].p+=calcPnl(c,taxRate);monthly[mo].t++;
    if(c.status==="won")monthly[mo].w++;
  });
  const rows=Object.entries(monthly).sort().map(([mo,d])=>`
    <tr><td>${mo}</td><td>${d.t}</td><td>${d.w}/${d.t}</td>
    <td>${d.stk>0?((d.w/d.t)*100).toFixed(0):0}%</td>
    <td>${d.stk>0?((d.p/d.stk)*100).toFixed(1):0}%</td>
    <td style="color:${d.p>=0?"#00a844":"#cc2222"};font-weight:600">${d.p>=0?"+":""}${d.p.toFixed(2)} ${cur}</td></tr>`).join("");
  const html=`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Taśma Tracker — Raport</title>
  <style>body{font-family:monospace;padding:32px;color:#111;max-width:800px;margin:0 auto}
  h1{font-size:20px;margin-bottom:4px}h2{font-size:14px;color:#555;margin:24px 0 8px;text-transform:uppercase;letter-spacing:.08em}
  .kpi{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:16px 0}
  .kpi div{border:1px solid #ddd;border-radius:8px;padding:12px;text-align:center}
  .kpi .lbl{font-size:11px;color:#888;margin-bottom:4px}
  .kpi .val{font-size:20px;font-weight:600}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th{background:#f5f5f5;padding:8px;text-align:left;border-bottom:2px solid #ddd}
  td{padding:7px 8px;border-bottom:1px solid #eee}
  @media print{button{display:none}}</style></head><body>
  <h1>📊 Taśma Tracker — Raport miesięczny</h1>
  <div style="font-size:12px;color:#888">Wygenerowano: ${new Date().toLocaleDateString("pl-PL")} · Bankroll startowy: ${bankroll} ${cur}</div>
  <div class="kpi">
    <div><div class="lbl">Bankroll</div><div class="val" style="color:${stats.bnow>=bankroll?"#00a844":"#cc2222"}">${stats.bnow.toFixed(0)} ${cur}</div></div>
    <div><div class="lbl">Łączny P&L</div><div class="val" style="color:${stats.totalPnl>=0?"#00a844":"#cc2222"}">${stats.totalPnl>=0?"+":""}${stats.totalPnl.toFixed(0)} ${cur}</div></div>
    <div><div class="lbl">Win Rate</div><div class="val">${stats.winRate.toFixed(1)}%</div></div>
    <div><div class="lbl">ROI</div><div class="val" style="color:${stats.roi>=0?"#00a844":"#cc2222"}">${stats.roi>=0?"+":""}${stats.roi.toFixed(1)}%</div></div>
  </div>
  <h2>Miesiąc po miesiącu</h2>
  <table><thead><tr><th>Miesiąc</th><th>Kupony</th><th>W/P</th><th>Win Rate</th><th>ROI</th><th>P&L</th></tr></thead>
  <tbody>${rows}</tbody></table>
  <h2>Ostatnie kupony</h2>
  <table><thead><tr><th>Data</th><th>Buk</th><th>Kurs</th><th>Stawka</th><th>Status</th><th>P&L</th></tr></thead>
  <tbody>${[...coupons].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,50).map(c=>`
    <tr><td>${c.date}</td><td>${c.bk}</td><td>×${c.odds.toFixed(2)}</td><td>${c.stake} ${cur}</td>
    <td>${c.status}</td><td style="color:${calcPnl(c,taxRate)>=0?"#00a844":"#cc2222"}">${calcPnl(c,taxRate)>=0?"+":""}${calcPnl(c,taxRate).toFixed(2)} ${cur}</td></tr>`).join("")}</tbody></table>
  <script>window.print()</script></body></html>`;
  const w=window.open("","_blank");w.document.write(html);w.document.close();
};

const jsonExport = (data) => {
  const blob=new Blob([JSON.stringify({version:3,exportDate:new Date().toISOString(),...data},null,2)],{type:"application/json"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);
  a.download=`tasma-backup-${todayISO()}.json`;a.click();
};
const csvExport = (cs,taxRate=0) => {
  const rows=[["Data","Buk","Notatka","Kurs","Prob%","EV","Edge%","Stawka","Status","P&L","Freebet"],
    ...cs.map(c=>{
      const prob=c.probability!=null?c.probability/100:impliedProb(c.odds);
      const ev=calcEV(c.odds,prob);
      return[c.date,c.bk,`"${c.note}"`,c.odds,(prob*100).toFixed(1),ev.toFixed(3),(calcEdge(c.odds,prob)).toFixed(1),c.stake,c.status,calcPnl(c,taxRate).toFixed(2),c.isFreebet?"TAK":""];
    })];
  const blob=new Blob([rows.map(r=>r.join(",")).join("\n")],{type:"text/csv"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="tasma.csv";a.click();
};
const jsonImport = (file,callbacks) => {
  const reader=new FileReader();
  reader.onload=(e)=>{
    try{
      const data=JSON.parse(e.target.result);
      if(!data.coupons||!Array.isArray(data.coupons)){alert("Nieprawidłowy plik backup.");return;}
      if(window.confirm(`Importować ${data.coupons.length} kuponów? Aktualne dane zostaną zastąpione.`)){
        callbacks.setCoupons(data.coupons);
        if(data.bankroll!==undefined)callbacks.setBankroll(data.bankroll);
        if(data.settings)callbacks.setSettings(s=>({...s,...data.settings}));
        if(data.withdrawals)callbacks.setWithdrawals(data.withdrawals);
        if(data.templates)callbacks.setTemplates(data.templates);
        alert(`✓ Zaimportowano ${data.coupons.length} kuponów`);
      }
    }catch{alert("Błąd odczytu pliku.");}
  };
  reader.readAsText(file);
};

// ─── Seed data ────────────────────────────────────────────────────────────────
const SEED=[
  {id:1, date:"2026-03-23",bk:"Superbet",stake:15,odds:81.78,  legs:[],status:"lost",note:"Taśma #21 · 19 zd.",isFreebet:false,probability:null},
  {id:2, date:"2026-03-22",bk:"Superbet",stake:15,odds:122.24, legs:[],status:"lost",note:"Taśma #20 · 16 zd.",isFreebet:false,probability:null},
  {id:3, date:"2026-03-22",bk:"Superbet",stake:15,odds:124.17, legs:[],status:"lost",note:"Taśma #19 · 20 zd.",isFreebet:false,probability:null},
  {id:4, date:"2026-03-22",bk:"Superbet",stake:15,odds:91.28,  legs:[],status:"lost",note:"Taśma #18 · 18 zd.",isFreebet:false,probability:null},
  {id:5, date:"2026-03-21",bk:"Superbet",stake:15,odds:71.63,  legs:[],status:"lost",note:"Taśma #17 · 16 zd.",isFreebet:false,probability:null},
  {id:6, date:"2026-03-21",bk:"STS",     stake:15,odds:125.89, legs:[],status:"lost",note:"Taśma #16 · 21 zd.",isFreebet:false,probability:null},
  {id:7, date:"2026-03-19",bk:"Superbet",stake:15,odds:54.26,  legs:[],status:"lost",note:"Taśma #15 · 13 zd.",isFreebet:false,probability:null},
  {id:8, date:"2026-03-18",bk:"Superbet",stake:15,odds:93.28,  legs:[],status:"lost",note:"Taśma #14 · 25 zd.",isFreebet:false,probability:null},
  {id:9, date:"2026-03-18",bk:"Superbet",stake:15,odds:21.59,  legs:[],status:"lost",note:"Taśma #13 · 23 zd.",isFreebet:false,probability:null},
  {id:10,date:"2026-03-17",bk:"Superbet",stake:2, odds:278460, legs:[],status:"lost",note:"Taśma #12 · 5 zd.", isFreebet:false,probability:null},
  {id:11,date:"2026-03-17",bk:"Superbet",stake:15,odds:55.00,  legs:[],status:"won", note:"Taśma #11 · 28 zd.",isFreebet:false,probability:null},
  {id:12,date:"2026-03-17",bk:"Superbet",stake:5, odds:2003.59,legs:[],status:"lost",note:"Taśma #10 · 32 zd.",isFreebet:false,probability:null},
  {id:13,date:"2026-03-16",bk:"Superbet",stake:15,odds:586.76, legs:[],status:"lost",note:"Taśma #9 · 26 zd.", isFreebet:false,probability:null},
  {id:14,date:"2026-03-15",bk:"Superbet",stake:15,odds:84.81,  legs:[],status:"lost",note:"Taśma #8 · 15 zd.", isFreebet:false,probability:null},
  {id:15,date:"2026-03-15",bk:"Superbet",stake:15,odds:84.48,  legs:[],status:"lost",note:"Taśma #7 · 17 zd.", isFreebet:false,probability:null},
  {id:16,date:"2026-03-14",bk:"Superbet",stake:15,odds:143.00, legs:[],status:"lost",note:"Taśma #6 · 19 zd.", isFreebet:false,probability:null},
  {id:17,date:"2026-03-13",bk:"Superbet",stake:15,odds:165.00, legs:[],status:"lost",note:"Taśma #5 · 19 zd.", isFreebet:false,probability:null},
  {id:18,date:"2026-03-13",bk:"Superbet",stake:15,odds:154.70, legs:[],status:"lost",note:"Taśma #4 · 22 zd.", isFreebet:false,probability:null},
  {id:19,date:"2026-03-11",bk:"Superbet",stake:15,odds:112.35, legs:[],status:"lost",note:"Taśma #3 · 19 zd.", isFreebet:false,probability:null},
  {id:20,date:"2026-03-12",bk:"Superbet",stake:15,odds:132.33, legs:[],status:"lost",note:"Taśma #2 · 21 zd.", isFreebet:false,probability:null},
  {id:21,date:"2026-03-06",bk:"Superbet",stake:15,odds:372.56, legs:[],status:"lost",note:"Taśma #1 · 24 zd.", isFreebet:false,probability:null},
];

// ─── Achievements ─────────────────────────────────────────────────────────────
const ACH=[
  {id:"first", icon:"🏆",name:"Pierwsza wygrana",    desc:"Wygrałeś pierwszy kupon",           check:s=>s.won>=1},
  {id:"win3",  icon:"🔥",name:"Seria 3 wygranych",    desc:"3 wygrane z rzędu",                 check:s=>s.maxWS>=3},
  {id:"win5",  icon:"💥",name:"Seria 5 wygranych",    desc:"5 wygranych z rzędu",               check:s=>s.maxWS>=5},
  {id:"c10",   icon:"📋",name:"10 kuponów",           desc:"Łącznie 10 kuponów",                check:s=>s.total>=10},
  {id:"c50",   icon:"📚",name:"50 kuponów",           desc:"Łącznie 50 kuponów",                check:s=>s.total>=50},
  {id:"p500",  icon:"💰",name:"Zysk 500 zł",         desc:"Łączny zysk przekroczył 500 zł",    check:s=>s.totalPnl>=500},
  {id:"bigwin",icon:"🦈",name:"Duża ryba",           desc:"Jednorazowa wygrana ponad 500 zł",   check:s=>s.maxWin>=500},
  {id:"sur10", icon:"🧊",name:"Przetrwałem",         desc:"Przeżyłeś serię 10 przegranych",     check:s=>s.maxLS>=10},
  {id:"sur20", icon:"⛰️",name:"Twardziel",           desc:"Przeżyłeś serię 20 przegranych",     check:s=>s.maxLS>=20},
  {id:"goal",  icon:"🎯",name:"Cel osiągnięty",      desc:"Bankroll osiągnął cel",              check:(s,st)=>s.bnow>=st.goalBankroll},
  {id:"value", icon:"📐",name:"Value bettor",        desc:"Znalazłeś 5 kuponów z EV > 0",      check:s=>s.valueCount>=5},
  {id:"odds1k",icon:"🚀",name:"Łowca kursów",        desc:"Kupon z kursem powyżej 1000",        check:s=>s.maxOdds>=1000},
];

// ─── Breakdown grouping ───────────────────────────────────────────────────────
const getBreakdownGroups = (coupons, taxRate=0) => {
  const settled = coupons.filter(c=>c.status==="won"||c.status==="lost"||c.status==="cashout");
  const groups  = {};
  const addTo = (key, c) => {
    if(!groups[key]) groups[key]={label:key,w:0,t:0,stk:0,p:0};
    groups[key].t++;
    if(c.status==="won")groups[key].w++;
    groups[key].stk+=c.stake;
    groups[key].p+=calcPnl(c,taxRate);
  };
  settled.forEach(c=>{
    const type = c.legs.length<=1?"Single":"AKO";
    const range = oddsRange(c.odds);
    addTo(`${type} ${range}`,c);
    addTo(`📊 ${c.bk}`,c);
  });
  return Object.values(groups).map(g=>({...g,roi:g.stk>0?(g.p/g.stk)*100:0,wr:g.t>0?(g.w/g.t)*100:0}));
};

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App(){
  const [coupons,     setCoupons]     = useState(()=>ls.get(SK,SEED));
  const [bankroll,    setBankroll]    = useState(()=>ls.get(BK,500));
  const [settings,    setSettings]    = useState(()=>ls.get(SK2,{goalBankroll:2000,dayLoss:50,weekLoss:150,taxRate:0,alertsEnabled:true,stopAfter:20,unitSize:0,dayProfitGoal:0}));
  const [withdrawals, setWithdrawals] = useState(()=>ls.get(SK3,[]));
  const [templates,   setTemplates]   = useState(()=>ls.get(SK4,[]));

  const [view,       setView]       = useState("today");
  const [showAdd,    setShowAdd]    = useState(false);
  const [editId,     setEditId]     = useState(null);
  const [expand,     setExpand]     = useState(null);
  const [calMonth,   setCalMonth]   = useState(()=>todayISO().slice(0,7));
  const [heatYear,   setHeatYear]   = useState(()=>new Date().getFullYear());
  const [selDay,     setSelDay]     = useState(null);   // calendar modal
  const [breakSort,  setBreakSort]  = useState("roi");  // "roi"|"pnl"
  const [kellyMode,  setKellyMode]  = useState("quarter"); // full|half|quarter
  const [kOdds,      setKOdds]      = useState("50");
  const [kWinP,      setKWinP]      = useState("");
  const [kSegment,   setKSegment]   = useState("all"); // all|single|ako|range_low|range_mid|range_hi
  const [calcLegs,   setCalcLegs]   = useState("15");
  const [calcAvg,    setCalcAvg]    = useState("1.50");
  const [showWd,     setShowWd]     = useState(false);
  const [wdForm,     setWdForm]     = useState({date:todayISO(),amount:"",note:""});
  const [showTpl,    setShowTpl]    = useState(false);
  const [tplForm,    setTplForm]    = useState({name:"",bk:"Superbet",stake:"15",odds:""});
  // Search & filter
  const [histSearch, setHistSearch] = useState("");
  const [filterBk,   setFilterBk]   = useState("");
  const [filterEV,   setFilterEV]   = useState("");
  const [filterSt,   setFilterSt]   = useState("");
  const [showFilter, setShowFilter] = useState(false);
  // Stats time range
  const [statsRange, setStatsRange] = useState("all");

  const firstRender = useRef(true);
  const importRef   = useRef(null);
  const stakeRef=useRef(),oddsRef=useRef(),legRef=useRef(),probRef=useRef();

  useEffect(()=>{if(firstRender.current){firstRender.current=false;return;}ls.set(SK,coupons);},[coupons]);
  useEffect(()=>{ls.set(BK,bankroll);},[bankroll]);
  useEffect(()=>{ls.set(SK2,settings);},[settings]);
  useEffect(()=>{ls.set(SK3,withdrawals);},[withdrawals]);
  useEffect(()=>{ls.set(SK4,templates);},[templates]);

  const blank={date:todayISO(),bk:"Superbet",stake:"15",odds:"",legs:[],note:"",status:"pending",
    isFreebet:false,freebetSR:false,cashoutAmount:"",probability:null,evManual:false,oddsHistory:[]};
  const [form,setForm]=useState(blank);
  const [legM,setLegM]=useState(""),legS_ref=useRef("");
  const [legS,setLegS]=useState("");

  useEffect(()=>{if(showAdd)setTimeout(()=>stakeRef.current?.focus(),60);},[showAdd]);

  const openAdd  = ()=>{setEditId(null);setForm(blank);setLegM("");setLegS("");setShowAdd(true);};
  const openEdit = (c)=>{setForm({...c,stake:String(c.stake),odds:String(c.odds),probability:c.probability!=null?String(c.probability):""});setEditId(c.id);setShowAdd(true);};
  const saveForm = ()=>{
    if(!form.odds||!form.stake)return;
    const obj={...form,stake:+form.stake,odds:+form.odds,probability:form.probability!==""&&form.probability!=null?+form.probability:null};
    if(editId){
      const prev=coupons.find(x=>x.id===editId);
      const prevOdds=prev?.odds;
      const newOdds=+form.odds;
      let hist=[...(prev?.oddsHistory||[])];
      if(prevOdds&&prevOdds!==newOdds) hist=[...hist,{date:todayISO(),odds:prevOdds}];
      setCoupons(p=>p.map(x=>x.id===editId?{...obj,id:editId,oddsHistory:hist}:x));
      setEditId(null);
    } else {
      setCoupons(p=>[...p,{...obj,id:Date.now(),oddsHistory:[]}]);
    }
    setForm(blank);setLegM("");setLegS("");setShowAdd(false);
  };
  const addLeg=()=>{if(!legM.trim())return;setForm(f=>({...f,legs:[...f.legs,{m:legM.trim(),s:legS.trim()}]}));setLegM("");setLegS("");setTimeout(()=>legRef.current?.focus(),0);};
  const mark=(id,st)=>setCoupons(p=>p.map(c=>c.id===id?{...c,status:st}:c));
  const markCashout=(id,amt)=>setCoupons(p=>p.map(c=>c.id===id?{...c,status:"cashout",cashoutAmount:amt}:c));
  const del=(id)=>setCoupons(p=>p.filter(c=>c.id!==id));
  const saveWd=()=>{if(!wdForm.amount)return;setWithdrawals(p=>[...p,{...wdForm,id:Date.now(),amount:+wdForm.amount}]);setBankroll(b=>b-+wdForm.amount);setWdForm({date:todayISO(),amount:"",note:""});setShowWd(false);};
  const saveTpl=()=>{if(!tplForm.name)return;setTemplates(p=>[...p,{...tplForm,id:Date.now(),stake:+tplForm.stake,odds:+tplForm.odds}]);setTplForm({name:"",bk:"Superbet",stake:"15",odds:""});setShowTpl(false);};

  // ── Full stats ───────────────────────────────────────────────────────────────
  const stats = useMemo(()=>{
    const taxRate=settings.taxRate||0;
    // Time range filter
    const rangeDays={"7d":7,"30d":30,"90d":90}[statsRange]||null;
    const cutoff=rangeDays?new Date(Date.now()-rangeDays*86400000):null;
    const inRange=c=>!cutoff||new Date(c.date)>=cutoff;
    const settled=coupons.filter(c=>["won","lost","cashout"].includes(c.status)&&inRange(c));
    const wonList=coupons.filter(c=>c.status==="won"&&inRange(c));
    const staked=settled.reduce((s,c)=>s+c.stake,0);
    const totalPnl=settled.reduce((s,c)=>s+calcPnl(c,taxRate),0);
    const roi=staked>0?(totalPnl/staked)*100:0;
    const bnow=bankroll+totalPnl;
    const totalW=withdrawals.reduce((s,w)=>s+w.amount,0);

    // Streaks
    let cW=0,cL=0,maxWS=0,maxLS=0,maxAD=0,cAD=0,prevD=null;
    const sorted=[...coupons].sort((a,b)=>a.date.localeCompare(b.date));
    sorted.forEach(c=>{
      if(c.status==="won"){cW++;cL=0;maxWS=Math.max(maxWS,cW);}
      else if(c.status==="lost"){cL++;cW=0;maxLS=Math.max(maxLS,cL);}
      if(prevD){const diff=(new Date(c.date)-new Date(prevD))/86400000;if(diff===1){cAD++;maxAD=Math.max(maxAD,cAD+1);}else cAD=0;}
      prevD=c.date;
    });

    // Current streak
    let streak=0;
    for(const c of [...coupons].sort((a,b)=>b.date.localeCompare(a.date))){
      if(c.status==="pending")continue;
      if(!streak){streak=c.status==="won"?1:-1;continue;}
      if((streak>0&&c.status==="won")||(streak<0&&c.status==="lost"))streak+=streak>0?1:-1;else break;
    }

    // Streak history for chart
    let runStreak=0;
    const streakHistory=sorted.filter(c=>c.status!=="pending").map(c=>{
      runStreak=c.status==="won"?(runStreak>0?runStreak+1:1):(runStreak<0?runStreak-1:-1);
      return{date:c.date,st:runStreak};
    });

    const maxWin=wonList.length>0?Math.max(...wonList.map(c=>c.odds*c.stake-c.stake)):0;
    const maxOdds=coupons.length>0?Math.max(...coupons.map(c=>c.odds)):0;
    const todayT=todayISO();
    const todayPnl=coupons.filter(c=>c.date===todayT&&c.status!=="pending").reduce((s,c)=>s+calcPnl(c,taxRate),0);
    const wAgo=new Date();wAgo.setDate(wAgo.getDate()-7);
    const weekPnl=settled.filter(c=>new Date(c.date)>=wAgo).reduce((s,c)=>s+calcPnl(c,taxRate),0);

    // Per-segment win rates for Kelly
    const segWR={};
    const segs={"all":settled,"single":settled.filter(c=>c.legs.length<=1),"ako":settled.filter(c=>c.legs.length>1),
      "range_low":settled.filter(c=>c.odds<2),"range_mid":settled.filter(c=>c.odds>=2&&c.odds<=5),"range_hi":settled.filter(c=>c.odds>5)};
    Object.entries(segs).forEach(([k,cs])=>{
      const w=cs.filter(c=>c.status==="won").length;
      segWR[k]={wr:cs.length>0?(w/cs.length)*100:0,n:cs.length,w};
    });

    // Legs buckets
    const legsBuckets={};
    settled.forEach(c=>{
      const n=c.legs.length||0;
      const b=n===0?"brak":n<=5?"1–5":n<=10?"6–10":n<=15?"11–15":n<=20?"16–20":"21+";
      if(!legsBuckets[b])legsBuckets[b]={w:0,t:0,p:0};
      legsBuckets[b].t++;if(c.status==="won")legsBuckets[b].w++;legsBuckets[b].p+=calcPnl(c,taxRate);
    });

    // Day of week
    const dow=Array(7).fill(null).map(()=>({w:0,t:0,p:0}));
    settled.forEach(c=>{const d=new Date(c.date).getDay();dow[d].t++;if(c.status==="won")dow[d].w++;dow[d].p+=calcPnl(c,taxRate);});

    // Monthly
    const monthly={};
    settled.forEach(c=>{
      const mo=c.date.slice(0,7);
      if(!monthly[mo])monthly[mo]={stk:0,p:0,w:0,t:0};
      monthly[mo].stk+=c.stake;monthly[mo].p+=calcPnl(c,taxRate);monthly[mo].t++;
      if(c.status==="won")monthly[mo].w++;
    });

    // Bankroll history
    let runBr=bankroll,runSt=0;
    const brHistory=[{v:bankroll,st:0}];
    sorted.filter(c=>c.status!=="pending").forEach(c=>{
      runBr+=calcPnl(c,taxRate);
      runSt=c.status==="won"?(runSt>0?runSt+1:1):(runSt<0?runSt-1:-1);
      brHistory.push({v:runBr,st:runSt});
    });

    // EV analysis
    const valueCount=coupons.filter(c=>{
      const prob=c.probability!=null?c.probability/100:impliedProb(c.odds);
      return evStatus(calcEV(c.odds,prob))==="value";
    }).length;

    // Avg losing streak
    const lossRuns=[];let cur=0;
    sorted.forEach(c=>{if(c.status==="lost"){cur++;}else if(c.status==="won"){if(cur>0)lossRuns.push(cur);cur=0;}});
    if(cur>0)lossRuns.push(cur);
    const avgLS=lossRuns.length>0?lossRuns.reduce((s,v)=>s+v,0)/lossRuns.length:0;

    return{staked,totalPnl,roi,bnow,totalW,won:wonList.length,lost:coupons.filter(c=>c.status==="lost").length,
      total:coupons.length,winRate:settled.length>0?(wonList.length/settled.length)*100:0,
      todayPnl,weekPnl,streak,maxWS,maxLS,maxAD,maxWin,maxOdds,
      legsBuckets,dow,monthly,brHistory,streakHistory,valueCount,segWR,avgLS};
  },[coupons,bankroll,withdrawals,settings,statsRange]);

  // ── Kelly calculation ─────────────────────────────────────────────────────
  const kelly = useMemo(()=>{
    const o=+kOdds;
    const segData=stats.segWR[kSegment]||stats.segWR["all"];
    const wp=kWinP?(+kWinP/100):(segData.wr/100);
    if(!o||!wp)return null;
    const b=o-1,q=1-wp,f=(wp*b-q)/b;
    const multiplier={full:1,half:0.5,quarter:0.25}[kellyMode]||0.25;
    const fAdj=Math.min(Math.max(0,f)*multiplier,0.05); // cap 5% bankroll
    const capped=fAdj>=0.05;
    const confidence=segData.n>=50?"alta":segData.n>=20?"media":"niskie";
    const smallSample=segData.n<20;
    return{full:Math.max(0,f*100).toFixed(1),adjusted:(fAdj*100).toFixed(2),stake:(fAdj*stats.bnow).toFixed(2),
      edge:((wp*o-1)*100).toFixed(1),capped,confidence,smallSample,sampleN:segData.n,
      wr:(wp*100).toFixed(1),mode:kellyMode};
  },[kOdds,kWinP,kellyMode,kSegment,stats]);

  // ── Streak alerts ─────────────────────────────────────────────────────────
  const streakAlerts = useMemo(()=>{
    if(!settings.alertsEnabled)return[];
    const ls=stats.streak<0?Math.abs(stats.streak):0;
    const alerts=[];
    if(ls>=20)alerts.push({level:"critical",msg:`🚨 ${ls} przegranych z rzędu!`,rec:`ZATRZYMAJ SIĘ. Przerwa min. 48h. Rozważ reset bankrolla.`});
    else if(ls>=10)alerts.push({level:"danger",msg:`⚠️ ${ls} przegranych z rzędu`,rec:`Zmniejsz stawkę o 50%. Przerwa 24h.`});
    else if(ls>=5)alerts.push({level:"warn",msg:`⚠️ ${ls} przegranych z rzędu`,rec:`Ogranicz liczbę kuponów. Sprawdź typy.`});
    if(settings.stopAfter&&ls>=settings.stopAfter)alerts.push({level:"critical",msg:`🛑 Limit serii osiągnięty (${settings.stopAfter})`,rec:"Automatyczne zatrzymanie aktywne."});
    return alerts;
  },[stats.streak,settings]);

  // ── Non-streak alerts ────────────────────────────────────────────────────
  const extraAlerts = useMemo(()=>{
    const a=[];
    if(stats.todayPnl<=-settings.dayLoss)
      a.push({level:"danger",msg:`⚠️ Dzienny limit straty (${settings.dayLoss} zł) przekroczony! Dziś: ${stats.todayPnl.toFixed(0)} zł`});
    else if(stats.todayPnl<=-settings.dayLoss*0.8)
      a.push({level:"warn",msg:`⚠️ Blisko dziennego limitu (${settings.dayLoss} zł). Dziś: ${stats.todayPnl.toFixed(0)} zł`});
    if(stats.weekPnl<=-settings.weekLoss)
      a.push({level:"danger",msg:`⚠️ Tygodniowy limit straty (${settings.weekLoss} zł) przekroczony!`});
    // Overdue pending
    const overdue=coupons.filter(c=>c.status==="pending"&&c.date<todayISO());
    if(overdue.length>0)
      a.push({level:"warn",msg:`⏰ ${overdue.length} nierozliczony/ch kupon/ów z poprzednich dni`,sub:"Otwórz Kalendarz → kliknij dzień aby rozliczyć"});
    // Daily profit goal hit
    if((settings.dayProfitGoal||0)>0&&stats.todayPnl>=(settings.dayProfitGoal||0))
      a.push({level:"profit",msg:`🎯 Dzienny cel zysku osiągnięty! Dziś: +${stats.todayPnl.toFixed(0)} zł`,sub:"Gratulacje! Rozważ zakończenie gry na dziś."});
    // No slip today
    if(!coupons.some(c=>c.date===todayISO()))
      a.push({level:"info",msg:"🔔 Brak kuponu na dziś!"});
    return a;
  },[stats,settings,coupons]);

  // ── Breakdown ─────────────────────────────────────────────────────────────
  const breakdown = useMemo(()=>{
    const taxRate=settings.taxRate||0;
    const groups=getBreakdownGroups(coupons,taxRate);
    const sorted=breakSort==="roi"?[...groups].sort((a,b)=>a.roi-b.roi):[...groups].sort((a,b)=>a.p-b.p);
    const best=sorted[sorted.length-1];
    const worst=sorted[0];
    return{groups:sorted,best,worst};
  },[coupons,settings,breakSort]);

  // ── Calendar ──────────────────────────────────────────────────────────────
  const calData = useMemo(()=>{
    const parts=calMonth.split("-");
    const y=parseInt(parts[0],10),m=parseInt(parts[1],10);
    const daysInMonth=new Date(y,m,0).getDate();
    const firstDow=(new Date(y,m-1,1).getDay()+6)%7;
    const cells=[];
    for(let i=0;i<firstDow;i++)cells.push(null);
    for(let d=1;d<=daysInMonth;d++){
      const dd=String(d).padStart(2,"0"),mm=String(m).padStart(2,"0");
      const date=`${y}-${mm}-${dd}`;
      const cs=coupons.filter(c=>c.date===date);
      const hp=cs.some(c=>c.status==="pending");
      const dayPnl=cs.filter(c=>c.status!=="pending").reduce((s,c)=>s+calcPnl(c,settings.taxRate||0),0);
      const dayStk=cs.reduce((s,c)=>s+c.stake,0);
      cells.push({d,date,hp,dayPnl,dayStk,empty:cs.length===0,count:cs.length});
    }
    return{cells,y,m};
  },[calMonth,coupons,settings]);

  // ── Heatmap ───────────────────────────────────────────────────────────────
  const heatWeeks = useMemo(()=>{
    const yr=heatYear;
    const dayMap={};
    coupons.forEach(c=>{
      if(!c.date.startsWith(String(yr)))return;
      if(!dayMap[c.date])dayMap[c.date]={p:0,n:0,hp:false,stk:0};
      if(c.status!=="pending")dayMap[c.date].p+=calcPnl(c,settings.taxRate||0);
      dayMap[c.date].n++;dayMap[c.date].stk+=c.stake;
      if(c.status==="pending")dayMap[c.date].hp=true;
    });
    const jan1=new Date(yr,0,1);
    const startPad=(jan1.getDay()+6)%7;
    const totalDays=(new Date(yr,11,31)-jan1)/86400000+1;
    const slots=[];
    for(let i=0;i<startPad;i++)slots.push(null);
    for(let i=0;i<totalDays;i++){
      const dt=new Date(yr,0,1+i);
      const mo=dt.getMonth();const dy=dt.getDate();
      const ds=`${yr}-${String(mo+1).padStart(2,"0")}-${String(dy).padStart(2,"0")}`;
      slots.push({date:ds,month:mo,...(dayMap[ds]||{p:0,n:0,hp:false,stk:0})});
    }
    while(slots.length%7!==0)slots.push(null);
    const weeks=[];
    for(let i=0;i<slots.length;i+=7)weeks.push(slots.slice(i,i+7));
    return weeks;
  },[heatYear,coupons,settings]);

  const todayList=useMemo(()=>coupons.filter(c=>c.date===todayISO()).sort((a,b)=>b.id-a.id),[coupons]);
  const histGrp=useMemo(()=>{
    const unitSize=settings.unitSize||0;
    let cs=coupons.filter(c=>c.date!==todayISO());
    if(histSearch){
      const q=histSearch.toLowerCase();
      cs=cs.filter(c=>c.note.toLowerCase().includes(q)||c.bk.toLowerCase().includes(q)||c.date.includes(q));
    }
    if(filterBk) cs=cs.filter(c=>c.bk===filterBk);
    if(filterSt) cs=cs.filter(c=>c.status===filterSt);
    if(filterEV) cs=cs.filter(c=>{
      const prob=c.probability!=null?c.probability/100:impliedProb(c.odds);
      return evStatus(calcEV(c.odds,prob))===filterEV;
    });
    return grpByDate(cs);
  },[coupons,histSearch,filterBk,filterSt,filterEV,settings]);
  const goalPct=settings.goalBankroll>bankroll?Math.min(100,Math.max(0,((stats.bnow-bankroll)/(settings.goalBankroll-bankroll))*100)):100;
  const calcOdds=calcLegs&&calcAvg?Math.pow(+calcAvg,+calcLegs).toFixed(2):null;
  const autoStake=Math.min(kelly?.stake||Math.max(5,stats.bnow*0.01),stats.bnow*0.05).toFixed(0);

  // Form EV preview
  const formProb = form.probability!==""&&form.probability!=null?(+form.probability/100):(form.odds?impliedProb(+form.odds):null);
  const formEV   = form.odds&&formProb?calcEV(+form.odds,formProb):null;
  const formEdge = formEV!=null?calcEdge(+form.odds,formProb):null;

  const A="#f0a500",G="#00c850",R="#dc3232",B="#5a9fff";
  const inp=(s={})=>({background:"#060810",border:"1px solid #1e2535",borderRadius:8,padding:"11px 14px",color:"#d4d8e8",fontFamily:"inherit",fontSize:16,outline:"none",width:"100%",...s});
  const smInp=(s={})=>({background:"#060810",border:"1px solid #1e2535",borderRadius:7,padding:"8px 11px",color:"#d4d8e8",fontFamily:"inherit",fontSize:15,outline:"none",...s});
  const kpiBox=(v,l,c)=>(
    <div key={l} style={{background:"#0d1117",border:"1px solid #1a2030",borderRadius:10,padding:"14px 16px"}}>
      <div style={{fontSize:13,color:"#444",marginBottom:6}}>{l}</div>
      <div style={{fontSize:22,fontWeight:500,color:c}}>{v}</div>
    </div>
  );

  const Cards=({cs})=>cs.map(c=>(
    <CouponCard key={c.id} c={c} expanded={expand===c.id}
      onToggle={()=>setExpand(expand===c.id?null:c.id)}
      onWon={()=>mark(c.id,"won")} onLost={()=>mark(c.id,"lost")}
      onPending={()=>mark(c.id,"pending")} onCashout={(amt)=>markCashout(c.id,amt)}
      onEdit={()=>openEdit(c)} onDelete={()=>del(c.id)}
      taxRate={settings.taxRate||0}/>
  ));
  const DayGroup=({date,cs})=>{
    const dp=cs.filter(c=>c.status!=="pending").reduce((s,c)=>s+calcPnl(c,settings.taxRate||0),0);
    const hp=cs.some(c=>c.status==="pending");
    const stk=cs.reduce((s,c)=>s+c.stake,0);
    const us=settings.unitSize||0;
    const stkLabel=us>0?`${(stk/us).toFixed(1)}u`:`${stk} zł`;
    return(
      <div>
        <div style={{fontSize:14,color:"#444",margin:"18px 0 8px",display:"flex",justifyContent:"space-between"}}>
          <span>{date} · {cs.length} kup. · {stkLabel}</span>
          {!hp&&<span style={{color:dp>=0?G:R,fontWeight:600}}>{fmt(dp)}</span>}
        </div>
        <Cards cs={cs}/>
      </div>
    );
  };

  const earned=useMemo(()=>ACH.filter(a=>a.check(stats,settings)).map(a=>a.id),[stats,settings]);

  return(
    <div style={{fontFamily:"'DM Mono','Courier New',monospace",background:"#080b0f",minHeight:"100vh",color:"#d4d8e8",width:"100%",overflowX:"hidden"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        input,select,button{font-family:inherit;}
        input:focus,select:focus{outline:none;border-color:#f0a500!important;}
        select option{background:#0d1117;}
        ::-webkit-scrollbar{width:4px;}::-webkit-scrollbar-thumb{background:#1e2535;border-radius:4px;}
        @keyframes fd{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}.fd{animation:fd .2s ease;}
        @keyframes pb{0%,100%{box-shadow:0 0 0 0 rgba(240,165,0,.4)}50%{box-shadow:0 0 0 4px rgba(240,165,0,.15)}}.pc{animation:pb 2s ease-in-out infinite;}
        @keyframes bk{0%,100%{opacity:1}50%{opacity:.4}}.pd{animation:bk 1.4s ease-in-out infinite;}
        @keyframes pulse-r{0%,100%{box-shadow:0 0 0 0 rgba(220,50,50,.5)}50%{box-shadow:0 0 0 6px rgba(220,50,50,0)}}.pulse-r{animation:pulse-r 1.5s infinite;}
        .tap:active{opacity:.7;} .hov:hover{background:rgba(255,255,255,.03);}
        .ach-off{opacity:.22;filter:grayscale(1);}
        .ovl{position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:200;display:flex;align-items:flex-end;justify-content:center;}
        .modal{background:#0d1117;border:1px solid #1a2030;border-radius:16px 16px 0 0;width:100%;max-width:680px;max-height:90vh;overflow-y:auto;padding:20px 16px;}
      `}</style>

      {/* HEADER */}
      <div style={{background:"#0a0d14",borderBottom:"1px solid #1a2030",position:"sticky",top:0,zIndex:99,width:"100%"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 16px 8px"}}>
          <span style={{fontSize:18,fontWeight:500,letterSpacing:".1em",color:A}}>TAŚMA·TRACKER</span>
          <button className="tap" onClick={()=>showAdd?setShowAdd(false):openAdd()}
            style={{background:showAdd?"transparent":A,color:showAdd?A:"#080b0f",border:showAdd?`1px solid ${A}`:"none",borderRadius:8,padding:"9px 18px",fontSize:15,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>
            {showAdd?"✕ ZAMKNIJ":"+ KUPON"}
          </button>
        </div>
        <div style={{display:"flex",overflowX:"auto"}}>
          {[["today","DZIŚ"],["cal","KALENDARZ"],["stats","STATSY"],["analysis","ANALIZA"],["ach","OSIĄG."],["cfg","⚙"]].map(([v,l])=>(
            <button key={v} className="tap" onClick={()=>setView(v)}
              style={{flexShrink:0,background:"none",border:"none",borderBottom:view===v?`2px solid ${A}`:"2px solid transparent",color:view===v?A:"#555",padding:"10px 14px",fontSize:13,fontWeight:600,cursor:"pointer",transition:"all .15s",whiteSpace:"nowrap"}}>
              {l}{v==="ach"&&earned.length>0&&<span style={{background:A,color:"#080b0f",borderRadius:10,padding:"1px 6px",fontSize:10,marginLeft:4,fontWeight:700}}>{earned.length}</span>}
            </button>
          ))}
        </div>
      </div>

      <div style={{padding:"16px",width:"100%"}}>

        {/* ── STREAK ALERTS ── */}
        {settings.alertsEnabled&&streakAlerts.map((al,i)=>(
          <div key={i} className={al.level==="critical"?"pulse-r":""} style={{background:al.level==="critical"?"rgba(220,50,50,.15)":"rgba(240,165,0,.1)",border:`1px solid ${al.level==="critical"?R:A}`,borderRadius:9,padding:"12px 14px",marginBottom:10}}>
            <div style={{fontSize:15,fontWeight:600,color:al.level==="critical"?R:A,marginBottom:4}}>{al.msg}</div>
            <div style={{fontSize:13,color:"#888"}}>{al.rec}</div>
          </div>
        ))}

        {/* ── EXTRA ALERTS (overdue, limits, profit goal) ── */}
        {extraAlerts.map((al,i)=>{
          const clr=al.level==="danger"?R:al.level==="profit"?"#00c8ff":al.level==="warn"?A:"#5a9fff";
          const bg=al.level==="danger"?"rgba(220,50,50,.1)":al.level==="profit"?"rgba(0,200,255,.08)":al.level==="warn"?"rgba(240,165,0,.09)":"rgba(0,150,255,.08)";
          return(
            <div key={i} style={{background:bg,border:`1px solid ${clr}40`,borderRadius:9,padding:"10px 14px",marginBottom:8}}>
              <div style={{fontSize:14,fontWeight:600,color:clr}}>{al.msg}</div>
              {al.sub&&<div style={{fontSize:12,color:"#555",marginTop:3}}>{al.sub}</div>}
            </div>
          );
        })}

        {/* ── GOAL BAR ── */}
        {settings.goalBankroll>bankroll&&(
          <div style={{background:"#0d1117",border:"1px solid #1a2030",borderRadius:10,padding:"14px 16px",marginBottom:14}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:8,fontSize:13}}>
              <span style={{color:"#555"}}>🎯 Cel: <b style={{color:A}}>{settings.goalBankroll} zł</b></span>
              <span style={{color:"#888"}}>{stats.bnow.toFixed(0)} / {settings.goalBankroll} zł</span>
            </div>
            <div style={{background:"#060810",borderRadius:6,height:10,overflow:"hidden"}}>
              <div style={{width:`${goalPct}%`,height:"100%",background:goalPct>=100?G:A,borderRadius:6,transition:"width .5s"}}/>
            </div>
            <div style={{fontSize:12,color:"#444",marginTop:5}}>{goalPct.toFixed(1)}% · brakuje {Math.max(0,settings.goalBankroll-stats.bnow).toFixed(0)} zł</div>
          </div>
        )}

        {/* ── ADD FORM ── */}
        {showAdd&&(
          <div className="fd" style={{background:"#0d1117",border:`1px solid ${A}`,borderRadius:12,padding:"18px",marginBottom:16}}>
            <div style={{fontSize:16,fontWeight:600,color:A,marginBottom:14}}>{editId?"✏  EDYTUJ":"⚡  NOWY KUPON"}</div>

            {/* Templates */}
            {templates.length>0&&(
              <div style={{marginBottom:12}}>
                <div style={{fontSize:12,color:"#555",marginBottom:6}}>SZABLONY</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                  {templates.map(t=>(
                    <button key={t.id} className="tap" onClick={()=>setForm(f=>({...f,bk:t.bk,stake:String(t.stake),odds:String(t.odds)}))}
                      style={{background:"rgba(240,165,0,.1)",border:"1px solid rgba(240,165,0,.3)",color:A,borderRadius:7,padding:"7px 12px",fontSize:13,cursor:"pointer"}}>
                      ⭐ {t.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Auto stake suggestion */}
            <div style={{background:"rgba(0,200,80,.05)",border:"1px solid rgba(0,200,80,.15)",borderRadius:7,padding:"8px 12px",marginBottom:12,fontSize:13,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
              <span style={{color:"#555"}}>📊 Kelly ({kellyMode === "quarter" ? "¼" : kellyMode === "half" ? "½" : "1×"}):</span>
              <button className="tap" onClick={()=>setForm(f=>({...f,stake:autoStake}))}
                style={{background:"rgba(0,200,80,.15)",border:"1px solid rgba(0,200,80,.3)",color:G,borderRadius:6,padding:"4px 12px",fontSize:13,fontWeight:700,cursor:"pointer"}}>
                {autoStake} zł
              </button>
              {kelly?.capped&&<span style={{fontSize:11,color:A}}>⚠ ucięte do 5% bankrolla</span>}
            </div>

            <div style={{marginBottom:12}}>
              <div style={{fontSize:12,color:"#555",marginBottom:5}}>DATA</div>
              <input type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} style={inp({width:"auto"})}/>
            </div>
            <div style={{marginBottom:12}}>
              <div style={{fontSize:12,color:"#555",marginBottom:6}}>BUKMACHER</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {BKM.map(b=>(
                  <button key={b} className="tap" onClick={()=>setForm(f=>({...f,bk:b}))}
                    style={{background:form.bk===b?"rgba(240,165,0,.15)":"#060810",border:`1px solid ${form.bk===b?A:"#1e2535"}`,color:form.bk===b?A:"#666",borderRadius:7,padding:"9px 13px",fontSize:15,cursor:"pointer"}}>
                    {b}
                  </button>
                ))}
              </div>
            </div>

            <div style={{display:"flex",gap:10,marginBottom:12,flexWrap:"wrap"}}>
              <div style={{flex:1,minWidth:100}}>
                <div style={{fontSize:12,color:"#555",marginBottom:5}}>STAWKA (ZŁ)</div>
                <input ref={stakeRef} type="number" placeholder="15" value={form.stake}
                  onChange={e=>setForm(f=>({...f,stake:e.target.value}))}
                  onKeyDown={e=>e.key==="Enter"&&oddsRef.current?.focus()}
                  style={inp({fontSize:22,fontWeight:500})}/>
              </div>
              <div style={{flex:1,minWidth:120}}>
                <div style={{fontSize:12,color:"#555",marginBottom:5}}>KURS ŁĄCZNY</div>
                <input ref={oddsRef} type="number" step="0.01" placeholder="85.00" value={form.odds}
                  onChange={e=>setForm(f=>({...f,odds:e.target.value}))}
                  onKeyDown={e=>e.key==="Enter"&&(form.evManual?probRef.current?.focus():legRef.current?.focus())}
                  style={inp({fontSize:22,fontWeight:500,color:A})}/>
              </div>
            </div>

            {/* EV / Probability */}
            <div style={{background:"rgba(90,159,255,.07)",border:"1px solid rgba(90,159,255,.2)",borderRadius:8,padding:"12px 14px",marginBottom:12}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                <span style={{fontSize:13,color:B,fontWeight:600}}>📐 ANALIZA EV</span>
                <div style={{display:"flex",gap:6}}>
                  <button className="tap" onClick={()=>setForm(f=>({...f,evManual:false,probability:""}))}
                    style={{background:!form.evManual?"rgba(90,159,255,.2)":"#060810",border:`1px solid ${!form.evManual?B:"#1e2535"}`,color:!form.evManual?B:"#666",borderRadius:6,padding:"5px 10px",fontSize:11,cursor:"pointer"}}>
                    AUTO
                  </button>
                  <button className="tap" onClick={()=>setForm(f=>({...f,evManual:true}))}
                    style={{background:form.evManual?"rgba(90,159,255,.2)":"#060810",border:`1px solid ${form.evManual?B:"#1e2535"}`,color:form.evManual?B:"#666",borderRadius:6,padding:"5px 10px",fontSize:11,cursor:"pointer"}}>
                    RĘCZNE
                  </button>
                </div>
              </div>
              {form.evManual?(
                <div>
                  <div style={{fontSize:12,color:"#555",marginBottom:5}}>TWOJE PRAWDOPODOBIEŃSTWO WYGRANEJ (%)</div>
                  <input ref={probRef} type="number" min="0" max="100" step="0.1" placeholder="np. 5.0"
                    value={form.probability||""} onChange={e=>setForm(f=>({...f,probability:e.target.value}))}
                    style={inp({fontSize:18,color:B})}/>
                </div>
              ):(
                <div style={{fontSize:12,color:"#444"}}>Używam implied probability = 1/kurs{form.odds?` = ${(impliedProb(+form.odds)*100).toFixed(2)}%`:""}</div>
              )}
              {formEV!=null&&form.odds&&(
                <div style={{display:"flex",gap:16,marginTop:10,flexWrap:"wrap"}}>
                  <div>
                    <div style={{fontSize:11,color:"#444",marginBottom:2}}>EV</div>
                    <div style={{fontSize:18,fontWeight:600,color:evColor(formEV,A,G,R)}}>{formEV>=0?"+":""}{formEV.toFixed(3)}</div>
                  </div>
                  <div>
                    <div style={{fontSize:11,color:"#444",marginBottom:2}}>Edge</div>
                    <div style={{fontSize:18,fontWeight:600,color:evColor(formEV,A,G,R)}}>{formEdge>=0?"+":""}{formEdge.toFixed(1)}%</div>
                  </div>
                  <div>
                    <div style={{fontSize:11,color:"#444",marginBottom:2}}>Status</div>
                    <EVBadge ev={formEV} A={A} G={G} R={R}/>
                  </div>
                  {!form.evManual&&<div style={{fontSize:11,color:"#333",alignSelf:"flex-end",paddingBottom:2}}>⚠ brak własnej estymacji</div>}
                </div>
              )}
            </div>

            {/* Status */}
            <div style={{marginBottom:12}}>
              <div style={{fontSize:12,color:"#555",marginBottom:5}}>STATUS</div>
              <select value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))} style={inp()}>
                <option value="pending">⏳ Oczekujący</option>
                <option value="won">✅ Wygrany</option>
                <option value="lost">❌ Przegrany</option>
                <option value="cashout">💰 Cashout</option>
              </select>
            </div>
            {form.status==="cashout"&&(
              <div style={{marginBottom:12}} className="fd">
                <div style={{fontSize:12,color:"#555",marginBottom:5}}>KWOTA CASHOUT (ZŁ)</div>
                <input type="number" step="0.01" placeholder="np. 35.50" value={form.cashoutAmount}
                  onChange={e=>setForm(f=>({...f,cashoutAmount:e.target.value}))}
                  style={inp({fontSize:20,fontWeight:500,color:"#00c8c8"})}/>
              </div>
            )}

            {/* Freebet */}
            <div style={{marginBottom:12,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
              <button className="tap" onClick={()=>setForm(f=>({...f,isFreebet:!f.isFreebet}))}
                style={{background:form.isFreebet?"rgba(0,150,255,.15)":"#060810",border:`1px solid ${form.isFreebet?"#1a6fff":"#1e2535"}`,color:form.isFreebet?"#5a9fff":"#666",borderRadius:8,padding:"9px 16px",fontSize:14,fontWeight:600,cursor:"pointer",transition:"all .15s"}}>
                🎟️ FREEBET {form.isFreebet?"✓":""}
              </button>
              {form.isFreebet&&(
                <div style={{display:"flex",gap:8}}>
                  <button className="tap" onClick={()=>setForm(f=>({...f,freebetSR:false}))}
                    style={{background:!form.freebetSR?"rgba(0,150,255,.15)":"#060810",border:`1px solid ${!form.freebetSR?"#1a6fff":"#1e2535"}`,color:!form.freebetSR?"#5a9fff":"#666",borderRadius:6,padding:"6px 12px",fontSize:12,cursor:"pointer"}}>
                    SNR
                  </button>
                  <button className="tap" onClick={()=>setForm(f=>({...f,freebetSR:true}))}
                    style={{background:form.freebetSR?"rgba(0,150,255,.15)":"#060810",border:`1px solid ${form.freebetSR?"#1a6fff":"#1e2535"}`,color:form.freebetSR?"#5a9fff":"#666",borderRadius:6,padding:"6px 12px",fontSize:12,cursor:"pointer"}}>
                    SR
                  </button>
                </div>
              )}
            </div>

            {/* Legs */}
            {form.legs.length>0&&(
              <div style={{border:"1px solid #1e2535",borderRadius:8,overflow:"hidden",marginBottom:10}}>
                {form.legs.map((l,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"10px 12px",background:"#060810",borderBottom:i<form.legs.length-1?"1px solid #1e2535":"none"}}>
                    <span style={{color:"#333",width:20,textAlign:"right",fontSize:13}}>{i+1}.</span>
                    <span style={{flex:1,fontSize:15,color:"#888"}}>{l.m}</span>
                    <span style={{fontSize:15,color:A,fontWeight:600,minWidth:30,textAlign:"right"}}>{l.s}</span>
                    <button onClick={()=>setForm(f=>({...f,legs:f.legs.filter((_,j)=>j!==i)}))}
                      style={{background:"none",border:"none",color:R,fontSize:20,cursor:"pointer",padding:"0 4px",lineHeight:1}}>✕</button>
                  </div>
                ))}
              </div>
            )}
            <div style={{display:"flex",gap:8,marginBottom:12}}>
              <input ref={legRef} placeholder="Zdarzenie…" value={legM}
                onChange={e=>setLegM(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addLeg()}
                style={inp({flex:3,fontSize:15})}/>
              <input placeholder="Typ" value={legS}
                onChange={e=>setLegS(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addLeg()}
                style={inp({width:70,textAlign:"center",fontSize:15,color:A})}/>
              <button className="tap" onClick={addLeg}
                style={{background:"rgba(240,165,0,.12)",border:"1px solid rgba(240,165,0,.3)",color:A,borderRadius:8,padding:"0 14px",fontSize:15,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>+LEG</button>
            </div>
            <input placeholder="Notatka…" value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))} style={inp({marginBottom:14,fontSize:15,color:"#888"})}/>
            <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
              <button className="tap" onClick={()=>setShowAdd(false)} style={{background:"none",border:"1px solid #1e2535",color:"#666",borderRadius:8,padding:"11px 18px",fontSize:15,cursor:"pointer"}}>Anuluj</button>
              <button className="tap" onClick={saveForm}
                style={{background:form.odds&&form.stake?A:"#1a1200",color:form.odds&&form.stake?"#080b0f":"#444",border:"none",borderRadius:8,padding:"11px 24px",fontSize:15,fontWeight:700,cursor:"pointer"}}>
                {editId?"ZAPISZ ZMIANY":"ZAPISZ KUPON ✓"}
              </button>
            </div>
          </div>
        )}

        {/* ── TODAY ── */}
        {view==="today"&&<>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
            {kpiBox(`${stats.bnow.toFixed(0)} zł`,"Bankroll",stats.bnow>=bankroll?G:R)}
            {kpiBox(`${stats.totalPnl>=0?"+":""}${stats.totalPnl.toFixed(0)} zł`,"Łączny P&L",stats.totalPnl>=0?G:R)}
            {kpiBox(`${stats.winRate.toFixed(0)}%`,"Win Rate","#d4d8e8")}
            {kpiBox(`${stats.roi>=0?"+":""}${stats.roi.toFixed(0)}%`,"ROI",stats.roi>=0?G:R)}
          </div>
          {!!stats.streak&&(
            <div style={{background:"#0d1117",border:`1px solid ${stats.streak>0?"#0d3018":"#2a1010"}`,borderRadius:9,padding:"13px 16px",marginBottom:14,display:"flex",alignItems:"center",gap:10,fontSize:16}}>
              <span style={{fontSize:22}}>{stats.streak>0?"🔥":"❄️"}</span>
              <span style={{color:stats.streak>0?G:R,fontWeight:600}}>{Math.abs(stats.streak)} z rzędu {stats.streak>0?"wygranych":"przegranych"}</span>
              <span style={{fontSize:12,color:"#444",marginLeft:"auto"}}>śr. seria: {stats.avgLS.toFixed(1)}</span>
            </div>
          )}
          <div style={{fontSize:14,color:"#444",marginBottom:10}}>
            DZIŚ · {todayList.length} kuponów
            {todayList.filter(c=>c.status==="pending").length>0&&<span style={{color:A}}> · {todayList.filter(c=>c.status==="pending").length} oczekuje</span>}
          </div>
          {todayList.length===0&&<div style={{textAlign:"center",color:"#333",padding:"32px 0",fontSize:16}}>Brak kuponu na dziś.<br/><span style={{color:A,cursor:"pointer"}} onClick={openAdd}>+ KUPON</span></div>}
          <Cards cs={todayList}/>
          {/* Search & Filter bar */}
          <div style={{marginBottom:10}}>
            <div style={{display:"flex",gap:8,marginBottom:showFilter?8:0}}>
              <div style={{flex:1,position:"relative"}}>
                <input placeholder="🔍 Szukaj: data, buk, notatka…" value={histSearch}
                  onChange={e=>setHistSearch(e.target.value)}
                  style={{background:"#0d1117",border:"1px solid #1e2535",borderRadius:8,padding:"9px 12px 9px 12px",color:"#d4d8e8",fontFamily:"inherit",fontSize:14,outline:"none",width:"100%"}}/>
              </div>
              <button className="tap" onClick={()=>setShowFilter(s=>!s)}
                style={{background:showFilter||filterBk||filterEV||filterSt?"rgba(240,165,0,.15)":"#0d1117",border:`1px solid ${showFilter||filterBk||filterEV||filterSt?A:"#1e2535"}`,color:showFilter||filterBk||filterEV||filterSt?A:"#666",borderRadius:8,padding:"9px 14px",fontSize:14,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap"}}>
                ⚙ Filtr{(filterBk||filterEV||filterSt)?` (${[filterBk,filterEV,filterSt].filter(Boolean).length})":""}
              </button>
              {(histSearch||filterBk||filterEV||filterSt)&&(
                <button className="tap" onClick={()=>{setHistSearch("");setFilterBk("");setFilterEV("");setFilterSt("");}}
                  style={{background:"none",border:"1px solid #1e2535",color:"#666",borderRadius:8,padding:"9px 12px",fontSize:13,cursor:"pointer"}}>✕</button>
              )}
            </div>
            {showFilter&&(
              <div className="fd" style={{background:"#0d1117",border:"1px solid #1a2030",borderRadius:9,padding:"12px",display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
                <div>
                  <div style={{fontSize:11,color:"#555",marginBottom:4}}>BUKMACHER</div>
                  <select value={filterBk} onChange={e=>setFilterBk(e.target.value)}
                    style={{background:"#060810",border:"1px solid #1e2535",borderRadius:6,padding:"6px 10px",color:"#d4d8e8",fontFamily:"inherit",fontSize:13,outline:"none"}}>
                    <option value="">Wszyscy</option>
                    {BKM.map(b=><option key={b}>{b}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{fontSize:11,color:"#555",marginBottom:4}}>STATUS</div>
                  <select value={filterSt} onChange={e=>setFilterSt(e.target.value)}
                    style={{background:"#060810",border:"1px solid #1e2535",borderRadius:6,padding:"6px 10px",color:"#d4d8e8",fontFamily:"inherit",fontSize:13,outline:"none"}}>
                    <option value="">Wszystkie</option>
                    <option value="won">✅ Wygrane</option>
                    <option value="lost">❌ Przegrane</option>
                    <option value="pending">⏳ Oczekujące</option>
                    <option value="cashout">💰 Cashout</option>
                  </select>
                </div>
                <div>
                  <div style={{fontSize:11,color:"#555",marginBottom:4}}>EV</div>
                  <select value={filterEV} onChange={e=>setFilterEV(e.target.value)}
                    style={{background:"#060810",border:"1px solid #1e2535",borderRadius:6,padding:"6px 10px",color:"#d4d8e8",fontFamily:"inherit",fontSize:13,outline:"none"}}>
                    <option value="">Wszystkie</option>
                    <option value="value">✅ Value</option>
                    <option value="neutral">⚠️ Neutral</option>
                    <option value="bad">❌ Bad</option>
                  </select>
                </div>
              </div>
            )}
          </div>
          {Object.keys(histGrp).length===0&&(histSearch||filterBk||filterEV||filterSt)&&(
            <div style={{textAlign:"center",color:"#333",padding:"24px",fontSize:14}}>Brak wyników dla tych filtrów</div>
          )}
          {Object.entries(histGrp).map(([date,cs])=><DayGroup key={date} date={date} cs={cs}/>)}
        </>}

        {/* ── KALENDARZ ── */}
        {view==="cal"&&<>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
            <button className="tap" onClick={()=>{const p=calMonth.split("-");const y=parseInt(p[0],10),m=parseInt(p[1],10);const nd=new Date(y,m-2,1);setCalMonth(`${nd.getFullYear()}-${String(nd.getMonth()+1).padStart(2,"0")}`);}} style={{background:"#0d1117",border:"1px solid #1a2030",color:"#888",borderRadius:8,padding:"9px 16px",fontSize:16,cursor:"pointer"}}>‹</button>
            <span style={{fontSize:16,fontWeight:500,color:"#d4d8e8"}}>{MONTHS[calData.m-1]} {calData.y}</span>
            <button className="tap" onClick={()=>{const p=calMonth.split("-");const y=parseInt(p[0],10),m=parseInt(p[1],10);const nd=new Date(y,m,1);setCalMonth(`${nd.getFullYear()}-${String(nd.getMonth()+1).padStart(2,"0")}`);}} style={{background:"#0d1117",border:"1px solid #1a2030",color:"#888",borderRadius:8,padding:"9px 16px",fontSize:16,cursor:"pointer"}}>›</button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3,marginBottom:3}}>
            {DAYS7.map(d=><div key={d} style={{textAlign:"center",fontSize:12,color:"#444",padding:"4px 0"}}>{d}</div>)}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3,marginBottom:20}}>
            {calData.cells.map((cell,i)=>{
              if(!cell)return<div key={i}/>;
              const isToday=cell.date===todayISO();
              let bg="#0d1117",bdr="1px solid #1a2030",nc="#555";
              if(!cell.empty&&!cell.hp){bg=cell.dayPnl>0?"rgba(0,200,80,.15)":"rgba(220,50,50,.12)";bdr=`1px solid ${cell.dayPnl>0?"#0d3018":"#3a1010"}`;nc=cell.dayPnl>0?G:R;}
              else if(cell.hp){bg="rgba(240,165,0,.08)";bdr="1px solid rgba(240,165,0,.3)";nc=A;}
              if(isToday){bdr=`2px solid ${A}`;nc=A;}
              return(
                <div key={i} onClick={()=>!cell.empty&&setSelDay(cell.date)}
                  style={{background:bg,border:bdr,borderRadius:8,padding:"8px 4px",textAlign:"center",minHeight:52,cursor:cell.empty?"default":"pointer"}}>
                  <div style={{fontSize:14,fontWeight:isToday?700:400,color:nc}}>{cell.d}</div>
                  {!cell.empty&&<div style={{fontSize:10,color:cell.dayPnl>=0?G:R,marginTop:2,fontWeight:600}}>{cell.hp?"?":`${cell.dayPnl>=0?"+":""}${cell.dayPnl.toFixed(0)}`}</div>}
                  {cell.empty&&<div style={{fontSize:10,color:"#222",marginTop:2}}>—</div>}
                </div>
              );
            })}
          </div>
          <div style={{display:"flex",gap:10,marginBottom:20,fontSize:12,color:"#444",flexWrap:"wrap"}}>
            <span>🟢 Wygrany</span><span>🔴 Przegrany</span><span style={{color:A}}>🟡 Oczekuje</span><span>— Brak</span>
          </div>

          {/* Heatmap */}
          <div style={{background:"#0d1117",border:"1px solid #1a2030",borderRadius:10,padding:"16px"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
              <span style={{fontSize:14,color:"#444"}}>📆 HEATMAPA ROCZNA</span>
              <div style={{display:"flex",gap:6,alignItems:"center"}}>
                <button className="tap" onClick={()=>setHeatYear(y=>y-1)} style={{background:"none",border:"1px solid #1a2030",color:"#666",borderRadius:6,padding:"4px 10px",fontSize:13,cursor:"pointer"}}>‹</button>
                <span style={{fontSize:13,color:"#888"}}>{heatYear}</span>
                <button className="tap" onClick={()=>setHeatYear(y=>y+1)} style={{background:"none",border:"1px solid #1a2030",color:"#666",borderRadius:6,padding:"4px 10px",fontSize:13,cursor:"pointer"}}>›</button>
              </div>
            </div>
            <div style={{overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
              <div style={{display:"flex",gap:2,paddingBottom:4}}>
                {heatWeeks.map((week,wi)=>(
                  <div key={wi} style={{display:"flex",flexDirection:"column",gap:2,flexShrink:0}}>
                    {week.map((day,di)=>{
                      if(!day)return<div key={di} style={{width:11,height:11}}/>;
                      let bg="#0f1520";
                      if(day.n>0){
                        if(day.hp)bg="rgba(240,165,0,.55)";
                        else if(day.p>0){const intensity=Math.min(.9,.3+day.stk/100);bg=`rgba(0,200,80,${intensity})`;}
                        else if(day.p<0){const intensity=Math.min(.9,.3+day.stk/100);bg=`rgba(220,50,50,${intensity})`;}
                        else bg="#2a2a2a";
                      }
                      return<div key={di} title={`${day.date}${day.n>0?`: ${day.n} kup. ${fmt(day.p)}`:" — brak"}`}
                        style={{width:11,height:11,borderRadius:2,background:bg,flexShrink:0,cursor:day.n>0?"pointer":"default"}}
                        onClick={()=>day.n>0&&setSelDay(day.date)}/>;
                    })}
                  </div>
                ))}
              </div>
            </div>
            <div style={{display:"flex",gap:6,marginTop:8,fontSize:11,color:"#333",alignItems:"center",flexWrap:"wrap"}}>
              <span>brak</span>
              {["#0f1520","rgba(220,50,50,.4)","rgba(220,50,50,.8)","rgba(0,200,80,.4)","rgba(0,200,80,.9)"].map((c,i)=>(
                <div key={i} style={{width:11,height:11,borderRadius:2,background:c,flexShrink:0}}/>
              ))}
              <span>dużo</span><span style={{marginLeft:6,color:A}}>■ oczekuje</span>
              <span style={{marginLeft:6,color:"#444"}}>Intensywność = kwota</span>
            </div>
          </div>
        </>}

        {/* ── STATSY ── */}
        {view==="stats"&&<>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
            {kpiBox(`${stats.bnow.toFixed(2)} zł`,"Bankroll",stats.bnow>=bankroll?G:R)}
            {kpiBox(fmt(stats.totalPnl),"Łączny P&L",stats.totalPnl>=0?G:R)}
            {kpiBox(fmtP(stats.roi),"ROI",stats.roi>=0?G:R)}
            {kpiBox(`${stats.winRate.toFixed(1)}%`,"Win Rate","#d4d8e8")}
            {kpiBox(`${stats.won}W / ${stats.lost}P`,"Wygrane/Przeg.","#d4d8e8")}
            {kpiBox(`${stats.staked.toFixed(0)} zł`,"Łącznie postawione","#888")}
          </div>

          {/* Time range selector */}
          <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap"}}>
            {[["all","Wszystko"],["90d","90 dni"],["30d","30 dni"],["7d","7 dni"]].map(([r,l])=>(
              <button key={r} className="tap" onClick={()=>setStatsRange(r)}
                style={{background:statsRange===r?"rgba(240,165,0,.15)":"#0d1117",border:`1px solid ${statsRange===r?A:"#1a2030"}`,color:statsRange===r?A:"#555",borderRadius:7,padding:"6px 14px",fontSize:13,fontWeight:600,cursor:"pointer"}}>
                {l}
              </button>
            ))}
            {statsRange!=="all"&&<span style={{fontSize:11,color:"#333",alignSelf:"center"}}>· statystyki przefiltrowane</span>}
          </div>

          {/* Bankroll chart */}
          {stats.brHistory.length>2&&(()=>{
            const pts=stats.brHistory;const vals=pts.map(p=>p.v);
            const mn=Math.min(...vals),mx=Math.max(...vals),rng=mx-mn||1;
            const H=120,W=pts.length;
            const py=v=>H-((v-mn)/rng)*(H-18)-9;
            const avgVals=rollingAvg(pts.map(p=>p.v),7);
            return(
              <div style={{background:"#0d1117",border:"1px solid #1a2030",borderRadius:10,padding:"16px",marginBottom:14}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:3}}>
                  <div style={{fontSize:14,color:"#444"}}>📉 BANKROLL vs SERIA PRZEGRANYCH</div>
                  <div style={{display:"flex",gap:10,fontSize:11,color:"#555",alignItems:"center"}}>
                    <span style={{display:"flex",alignItems:"center",gap:4}}><span style={{display:"inline-block",width:12,height:2,background:"rgba(255,200,0,.6)",borderRadius:1}}/> śr. 7-dniowa</span>
                  </div>
                </div>
                <div style={{fontSize:11,color:"#333",marginBottom:10}}>Ciemniejsze tło = dłuższa seria przegranych</div>
                <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{height:120,display:"block"}}>
                  {pts.map((p,i)=>p.st<0?<rect key={i} x={i} y={0} width={1} height={H} fill={`rgba(220,50,50,${Math.min(.4,.04*Math.abs(p.st))})`}/>:null)}
                  <line x1="0" y1={py(bankroll)} x2={W} y2={py(bankroll)} stroke="#1a2030" strokeWidth=".5" strokeDasharray="3,3" vectorEffect="non-scaling-stroke"/>
                  {pts.map((p,i)=>i===0?null:<line key={i} x1={i-1} y1={py(pts[i-1].v)} x2={i} y2={py(p.v)} stroke={p.v>=bankroll?G:R} strokeWidth="1.5" vectorEffect="non-scaling-stroke"/>)}
                  {avgVals.map((v,i)=>i===0?null:<line key={`a${i}`} x1={i-1} y1={py(avgVals[i-1])} x2={i} y2={py(v)} stroke="rgba(255,200,0,.55)" strokeWidth="1" vectorEffect="non-scaling-stroke"/>)}
                </svg>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:13,color:"#444",marginTop:8}}>
                  <span>Start: {bankroll} zł</span>
                  <span style={{color:stats.bnow>=bankroll?G:R,fontWeight:600}}>Teraz: {stats.bnow.toFixed(0)} zł</span>
                </div>
              </div>
            );
          })()}

          {/* Streak history chart */}
          {stats.streakHistory.length>2&&(()=>{
            const pts=stats.streakHistory;
            const vals=pts.map(p=>p.st);
            const mn=Math.min(...vals,-1),mx=Math.max(...vals,1),rng=mx-mn||1;
            const H=80,W=pts.length;
            const py=v=>H-((v-mn)/rng)*(H-8)-4;
            return(
              <div style={{background:"#0d1117",border:"1px solid #1a2030",borderRadius:10,padding:"16px",marginBottom:14}}>
                <div style={{fontSize:14,color:"#444",marginBottom:10}}>📊 HISTORIA SERII</div>
                <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{height:80,display:"block"}}>
                  <line x1="0" y1={py(0)} x2={W} y2={py(0)} stroke="#1a2030" strokeWidth=".5" strokeDasharray="2,2" vectorEffect="non-scaling-stroke"/>
                  {pts.map((p,i)=>(
                    <rect key={i} x={i} y={p.st>0?py(p.st):py(0)} width={1} height={Math.abs(py(p.st)-py(0))||1}
                      fill={p.st>0?"rgba(0,200,80,.6)":"rgba(220,50,50,.6)"}/>
                  ))}
                </svg>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"#444",marginTop:4}}>
                  <span>🔥 max seria W: {stats.maxWS}</span>
                  <span>❄️ max seria P: {stats.maxLS}</span>
                  <span>śr. seria P: {stats.avgLS.toFixed(1)}</span>
                </div>
              </div>
            );
          })()}

          {/* Monthly comparison */}
          {Object.keys(stats.monthly).length>0&&(()=>{
            const months=Object.entries(stats.monthly).sort((a,b)=>a[0].localeCompare(b[0]));
            const maxA=Math.max(...months.map(([,d])=>Math.abs(d.p)),1);
            // Month-over-month comparison
            const prevMo=(mo)=>{
              const [y,m]=mo.split("-").map(Number);
              const pd=new Date(y,m-2,1);
              return `${pd.getFullYear()}-${String(pd.getMonth()+1).padStart(2,"0")}`;
            };
            const moMap=Object.fromEntries(months);
            const curMoKey=todayISO().slice(0,7);
            // Best/worst month
            const bestMo=months.reduce((b,e)=>e[1].p>b[1].p?e:b,months[0]);
            const worstMo=months.reduce((b,e)=>e[1].p<b[1].p?e:b,months[0]);
            return(
              <div style={{background:"#0d1117",border:"1px solid #1a2030",borderRadius:10,padding:"16px",marginBottom:14}}>
                <div style={{fontSize:14,color:"#444",marginBottom:12}}>⚖️ PORÓWNANIE MIESIĘCY</div>
                {months.map(([mo,d])=>{
                  const prev=moMap[prevMo(mo)];
                  const roiDiff=prev&&prev.stk>0&&d.stk>0?((d.p/d.stk)-(prev.p/prev.stk))*100:null;
                  const pnlDiff=prev?d.p-prev.p:null;
                  const isBest=mo===bestMo[0]&&months.length>1;
                  const isWorst=mo===worstMo[0]&&months.length>1;
                  const isCurrent=mo===curMoKey;
                  return(
                    <div key={mo} style={{marginBottom:12,padding:"10px 12px",background:"#060810",borderRadius:8,border:`1px solid ${isBest?"#0d3018":isWorst?"#2a1010":"#1a2030"}`}}>
                      {/* Header row */}
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6,flexWrap:"wrap",gap:4}}>
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          <span style={{fontSize:14,color:"#d4d8e8",fontWeight:500}}>{mo}</span>
                          {isCurrent&&<span style={{background:"rgba(240,165,0,.15)",color:A,borderRadius:4,padding:"1px 6px",fontSize:10,fontWeight:700}}>TERAZ</span>}
                          {isBest&&<span style={{background:"rgba(0,200,80,.15)",color:G,borderRadius:4,padding:"1px 6px",fontSize:10,fontWeight:700}}>🏆 NAJLEPSZY</span>}
                          {isWorst&&<span style={{background:"rgba(220,50,50,.15)",color:R,borderRadius:4,padding:"1px 6px",fontSize:10,fontWeight:700}}>📉 NAJGORSZY</span>}
                        </div>
                        <span style={{color:d.p>=0?G:R,fontWeight:700,fontSize:15}}>{fmt(d.p)}</span>
                      </div>
                      {/* Stats row */}
                      <div style={{display:"flex",gap:12,fontSize:12,color:"#555",marginBottom:6,flexWrap:"wrap"}}>
                        <span>{d.t} kup.</span>
                        <span>{d.stk>0?((d.w/d.t)*100).toFixed(0):0}% WR</span>
                        <span>ROI {d.stk>0?((d.p/d.stk)*100).toFixed(1):0}%</span>
                        <span>{d.stk.toFixed(0)} zł postawione</span>
                      </div>
                      {/* Month-over-month delta */}
                      {prev&&roiDiff!==null&&(
                        <div style={{display:"flex",gap:10,fontSize:12,flexWrap:"wrap"}}>
                          <span style={{color:"#444"}}>vs {prevMo(mo)}:</span>
                          <span style={{color:roiDiff>0?G:roiDiff<0?R:"#555",fontWeight:600}}>
                            {roiDiff>0?"▲":"▼"} ROI {roiDiff>0?"+":""}{roiDiff.toFixed(1)} pp
                          </span>
                          <span style={{color:pnlDiff>0?G:pnlDiff<0?R:"#555",fontWeight:600}}>
                            {pnlDiff>=0?"+":""}{pnlDiff.toFixed(0)} zł P&L
                          </span>
                          {roiDiff>5&&<span style={{color:G}}>🔥 lepszy miesiąc!</span>}
                          {roiDiff<-5&&<span style={{color:R}}>📉 gorszy miesiąc</span>}
                        </div>
                      )}
                      {/* Bar */}
                      <div style={{background:"#0d1117",borderRadius:3,height:6,overflow:"hidden",marginTop:8}}>
                        <div style={{width:`${(Math.abs(d.p)/maxA)*100}%`,height:"100%",background:d.p>=0?G:R,borderRadius:3}}/>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* Day of week */}
          <div style={{background:"#0d1117",border:"1px solid #1a2030",borderRadius:10,padding:"16px",marginBottom:14}}>
            <div style={{fontSize:14,color:"#444",marginBottom:12}}>📈 SKUTECZNOŚĆ PO DNIU TYGODNIA</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:6}}>
              {DAYS7.map((d,i)=>{const dd=stats.dow[(i+1)%7];const wr=dd.t>0?(dd.w/dd.t)*100:null;return(
                <div key={d} style={{textAlign:"center"}}>
                  <div style={{fontSize:12,color:"#444",marginBottom:4}}>{DAYS7[i%7]}</div>
                  <div style={{background:"#060810",borderRadius:6,height:50,display:"flex",alignItems:"flex-end",justifyContent:"center",overflow:"hidden",marginBottom:4}}>
                    {dd.t>0&&<div style={{width:"70%",background:wr>=50?G:R,borderRadius:"4px 4px 0 0",height:`${Math.max(10,wr)}%`}}/>}
                  </div>
                  <div style={{fontSize:11,color:dd.t>0?(wr>=50?G:R):"#333",fontWeight:600}}>{dd.t>0?`${wr.toFixed(0)}%`:"—"}</div>
                  <div style={{fontSize:10,color:"#333"}}>{dd.t>0?`${dd.w}/${dd.t}`:""}</div>
                </div>
              );})}
            </div>
          </div>

          {/* Enhanced Kelly */}
          <div style={{background:"#0d1117",border:"1px solid #1a2030",borderRadius:10,padding:"16px",marginBottom:14}}>
            <div style={{fontSize:14,color:"#444",marginBottom:12}}>🧮 KALKULATOR KELLY</div>
            {/* Mode selector */}
            <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap"}}>
              {[["full","1× Kelly"],["half","½ Kelly"],["quarter","¼ Kelly"]].map(([m,l])=>(
                <button key={m} className="tap" onClick={()=>setKellyMode(m)}
                  style={{background:kellyMode===m?"rgba(240,165,0,.15)":"#060810",border:`1px solid ${kellyMode===m?A:"#1e2535"}`,color:kellyMode===m?A:"#666",borderRadius:7,padding:"7px 14px",fontSize:13,fontWeight:600,cursor:"pointer"}}>
                  {l}
                </button>
              ))}
            </div>
            {/* Segment selector */}
            <div style={{marginBottom:12}}>
              <div style={{fontSize:12,color:"#555",marginBottom:6}}>WIN RATE SEGMENTU</div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {[["all","Wszystkie"],["single","Single"],["ako","AKO"],["range_low","<2.0"],["range_mid","2–5"],["range_hi",">5"]].map(([k,l])=>(
                  <button key={k} className="tap" onClick={()=>setKSegment(k)}
                    style={{background:kSegment===k?"rgba(90,159,255,.15)":"#060810",border:`1px solid ${kSegment===k?B:"#1e2535"}`,color:kSegment===k?B:"#666",borderRadius:6,padding:"5px 10px",fontSize:12,cursor:"pointer"}}>
                    {l} <span style={{color:"#333",fontSize:10}}>({(stats.segWR[k]?.wr||0).toFixed(0)}%/{stats.segWR[k]?.n||0})</span>
                  </button>
                ))}
              </div>
            </div>
            {stats.segWR[kSegment]?.n<20&&(
              <div style={{background:"rgba(240,165,0,.08)",border:"1px solid rgba(240,165,0,.2)",borderRadius:7,padding:"8px 12px",marginBottom:10,fontSize:12,color:A}}>
                ⚠️ Mała próbka ({stats.segWR[kSegment]?.n} kuponów) — wynik może być losowy. Potrzeba min. 20.
              </div>
            )}
            <div style={{display:"flex",gap:10,marginBottom:12,flexWrap:"wrap"}}>
              <div style={{flex:1,minWidth:110}}>
                <div style={{fontSize:12,color:"#555",marginBottom:5}}>Kurs kuponu</div>
                <input type="number" step="0.01" value={kOdds} onChange={e=>setKOdds(e.target.value)} style={inp({fontSize:18,color:A})}/>
              </div>
              <div style={{flex:1,minWidth:140}}>
                <div style={{fontSize:12,color:"#555",marginBottom:5}}>P. wygranej % (opcjonalnie)</div>
                <input type="number" placeholder={`auto: ${(stats.segWR[kSegment]?.wr||stats.winRate).toFixed(1)}%`} value={kWinP} onChange={e=>setKWinP(e.target.value)} style={inp({fontSize:16})}/>
              </div>
            </div>
            {kelly&&(
              <div style={{background:"rgba(240,165,0,.07)",border:"1px solid rgba(240,165,0,.2)",borderRadius:8,padding:"14px"}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                  {[{l:`Kelly (${kellyMode==="full"?"pełny":kellyMode==="half"?"½":"¼"})`,v:`${kelly.adjusted}% bankrolla`,c:A},{l:"Sugerowana stawka",v:`${kelly.stake} zł`,c:G},{l:"Twoja przewaga",v:`${kelly.edge}%`,c:+kelly.edge>0?G:R},{l:"Confidence",v:kelly.confidence==="alta"?"🟢 wysoka":kelly.confidence==="media"?"🟡 średnia":"🔴 niska",c:"#d4d8e8"}].map(({l,v,c})=>(
                    <div key={l}><div style={{fontSize:11,color:"#444",marginBottom:3}}>{l}</div><div style={{fontSize:16,fontWeight:600,color:c}}>{v}</div></div>
                  ))}
                </div>
                {kelly.capped&&<div style={{fontSize:12,color:A,marginBottom:6}}>⚠ Ucięto do 5% bankrolla ({(stats.bnow*0.05).toFixed(2)} zł max)</div>}
                {+kelly.edge<=0&&<div style={{fontSize:12,color:R}}>⚠️ Ujemna przewaga — matematycznie nie opłaca się grać.</div>}
              </div>
            )}
          </div>

          {/* Tape calc */}
          <div style={{background:"#0d1117",border:"1px solid #1a2030",borderRadius:10,padding:"16px",marginBottom:14}}>
            <div style={{fontSize:14,color:"#444",marginBottom:12}}>🔢 KALKULATOR TAŚMY</div>
            <div style={{display:"flex",gap:10,marginBottom:10,flexWrap:"wrap"}}>
              <div style={{flex:1,minWidth:100}}>
                <div style={{fontSize:12,color:"#555",marginBottom:5}}>Liczba zdarzeń</div>
                <input type="number" value={calcLegs} onChange={e=>setCalcLegs(e.target.value)} style={inp({fontSize:18})}/>
              </div>
              <div style={{flex:1,minWidth:120}}>
                <div style={{fontSize:12,color:"#555",marginBottom:5}}>Średni kurs</div>
                <input type="number" step="0.01" value={calcAvg} onChange={e=>setCalcAvg(e.target.value)} style={inp({fontSize:18,color:A})}/>
              </div>
            </div>
            {calcOdds&&<div style={{background:"rgba(240,165,0,.07)",border:"1px solid rgba(240,165,0,.2)",borderRadius:8,padding:"12px 14px"}}>
              <span style={{color:"#666"}}>Kurs łączny: </span><b style={{color:A,fontSize:22}}>{calcOdds}</b>
              <div style={{fontSize:12,color:"#444",marginTop:6}}>Przy {autoStake} zł → wygrana: <b style={{color:G}}>{(+calcOdds * +autoStake).toFixed(2)} zł</b></div>
            </div>}
          </div>

          {/* Export/Import */}
          <div style={{background:"#0d1117",border:"1px solid #1a2030",borderRadius:10,padding:"16px",marginBottom:14}}>
            <div style={{fontSize:14,color:"#444",marginBottom:12}}>📤 EKSPORT / IMPORT</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              <button className="tap" onClick={()=>pdfExport(coupons,stats,settings,bankroll)}
                style={{flex:1,minWidth:120,background:"rgba(220,50,50,.1)",border:"1px solid rgba(220,50,50,.3)",color:R,borderRadius:8,padding:"12px",fontSize:14,fontWeight:600,cursor:"pointer"}}>
                📄 Eksport PDF
              </button>
              <button className="tap" onClick={()=>jsonExport({coupons,bankroll,settings,withdrawals,templates})}
                style={{flex:1,minWidth:130,background:"rgba(0,200,80,.1)",border:"1px solid rgba(0,200,80,.3)",color:G,borderRadius:8,padding:"12px",fontSize:14,fontWeight:600,cursor:"pointer"}}>
                💾 Backup JSON
              </button>
              <button className="tap" onClick={()=>csvExport(coupons,settings.taxRate||0)}
                style={{flex:1,minWidth:130,background:"rgba(0,150,255,.1)",border:"1px solid rgba(0,150,255,.3)",color:B,borderRadius:8,padding:"12px",fontSize:14,fontWeight:600,cursor:"pointer"}}>
                📊 CSV
              </button>
              <button className="tap" onClick={()=>importRef.current?.click()}
                style={{flex:1,minWidth:130,background:"rgba(240,165,0,.1)",border:"1px solid rgba(240,165,0,.3)",color:A,borderRadius:8,padding:"12px",fontSize:14,fontWeight:600,cursor:"pointer"}}>
                📥 Import JSON
              </button>
            </div>
            <input ref={importRef} type="file" accept=".json" style={{display:"none"}}
              onChange={e=>{if(e.target.files[0])jsonImport(e.target.files[0],{setCoupons,setBankroll,setSettings,setWithdrawals,setTemplates});e.target.value="";}}/>
            <div style={{fontSize:11,color:"#333",marginTop:10}}>💾 pełna kopia wszystkich danych · 📊 do Excela · 📥 wczytaj backup</div>
          </div>
        </>}

        {/* ── ANALIZA ── */}
        {view==="analysis"&&<>
          {/* Breakdown */}
          <div style={{background:"#0d1117",border:"1px solid #1a2030",borderRadius:10,padding:"16px",marginBottom:14}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,flexWrap:"wrap",gap:8}}>
              <div style={{fontSize:14,color:"#444"}}>📊 GDZIE ZARABIASZ / TRACISZ</div>
              <div style={{display:"flex",gap:6}}>
                <button className="tap" onClick={()=>setBreakSort("roi")}
                  style={{background:breakSort==="roi"?"rgba(240,165,0,.15)":"#060810",border:`1px solid ${breakSort==="roi"?A:"#1e2535"}`,color:breakSort==="roi"?A:"#666",borderRadius:6,padding:"5px 10px",fontSize:12,cursor:"pointer"}}>
                  Sort: ROI
                </button>
                <button className="tap" onClick={()=>setBreakSort("pnl")}
                  style={{background:breakSort==="pnl"?"rgba(240,165,0,.15)":"#060810",border:`1px solid ${breakSort==="pnl"?A:"#1e2535"}`,color:breakSort==="pnl"?A:"#666",borderRadius:6,padding:"5px 10px",fontSize:12,cursor:"pointer"}}>
                  Sort: Profit
                </button>
              </div>
            </div>
            {breakdown.groups.length===0&&<div style={{fontSize:14,color:"#333"}}>Brak rozliczonych kuponów.</div>}
            {breakdown.groups.map((g,i)=>{
              const isWorst=g===breakdown.worst;
              const isBest=g===breakdown.best;
              return(
                <div key={g.label} style={{background:isWorst?"rgba(220,50,50,.06)":isBest?"rgba(0,200,80,.06)":"#060810",border:`1px solid ${isWorst?"#3a1010":isBest?"#0d3018":"#1a2030"}`,borderRadius:9,padding:"12px 14px",marginBottom:8}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6,flexWrap:"wrap"}}>
                    <span style={{fontSize:15,fontWeight:600,color:"#d4d8e8",flex:1}}>{g.label}</span>
                    {isBest&&<span style={{background:"rgba(0,200,80,.2)",color:G,borderRadius:5,padding:"2px 8px",fontSize:11,fontWeight:700}}>🏆 NAJLEPSZA</span>}
                    {isWorst&&<span style={{background:"rgba(220,50,50,.2)",color:R,borderRadius:5,padding:"2px 8px",fontSize:11,fontWeight:700}}>⚠ NAJGORSZA</span>}
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
                    {[{l:"Kupony",v:`${g.t}`,c:"#888"},{l:"Win Rate",v:`${g.wr.toFixed(0)}%`,c:g.wr>=50?G:R},{l:"ROI",v:fmtP(g.roi),c:g.roi>=0?G:R},{l:"Profit",v:fmt(g.p),c:g.p>=0?G:R}].map(({l,v,c})=>(
                      <div key={l}><div style={{fontSize:10,color:"#444",marginBottom:3}}>{l}</div><div style={{fontSize:15,fontWeight:600,color:c}}>{v}</div></div>
                    ))}
                  </div>
                  <div style={{background:"#0d1117",borderRadius:4,height:6,overflow:"hidden",marginTop:8}}>
                    <div style={{width:`${Math.min(100,Math.max(0,g.wr))}%`,height:"100%",background:g.wr>=50?G:R,borderRadius:4}}/>
                  </div>
                </div>
              );
            })}
          </div>

          {/* EV analysis summary */}
          <div style={{background:"#0d1117",border:"1px solid #1a2030",borderRadius:10,padding:"16px",marginBottom:14}}>
            <div style={{fontSize:14,color:"#444",marginBottom:12}}>📐 ANALIZA EV KUPONÓW</div>
            {[["value","VALUE",G,"rgba(0,200,80,.08)","EV > 0 — przewaga bukmachera"],["neutral","NEUTRAL",A,"rgba(240,165,0,.08)","EV ≈ 0 — bez wyraźnej przewagi"],["bad","BAD",R,"rgba(220,50,50,.06)","EV < 0 — niekorzystne kursy"]].map(([evS,label,color,bg,desc])=>{
              const cs=coupons.filter(c=>{const prob=c.probability!=null?c.probability/100:impliedProb(c.odds);return evStatus(calcEV(c.odds,prob))===evS;});
              const settled=cs.filter(c=>["won","lost","cashout"].includes(c.status));
              const p=settled.reduce((s,c)=>s+calcPnl(c,settings.taxRate||0),0);
              const wr=settled.length>0?(settled.filter(c=>c.status==="won").length/settled.length)*100:0;
              return(
                <div key={evS} style={{background:bg,border:`1px solid ${color}33`,borderRadius:9,padding:"12px 14px",marginBottom:8}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                    <EVBadge ev={evS==="value"?0.1:evS==="neutral"?0:-0.1} A={A} G={G} R={R}/>
                    <span style={{fontSize:14,color:color,fontWeight:600}}>{label}</span>
                    <span style={{fontSize:13,color:"#444",flex:1}}>{cs.length} kuponów</span>
                    <span style={{fontSize:14,fontWeight:600,color:p>=0?G:R}}>{fmt(p)}</span>
                  </div>
                  <div style={{fontSize:12,color:"#444"}}>{desc}</div>
                  {settled.length>0&&<div style={{fontSize:12,color:"#555",marginTop:4}}>WR: {wr.toFixed(0)}% · {settled.length} rozliczonych</div>}
                </div>
              );
            })}
          </div>

          {/* Legs */}
          <div style={{background:"#0d1117",border:"1px solid #1a2030",borderRadius:10,padding:"16px"}}>
            <div style={{fontSize:14,color:"#444",marginBottom:12}}>📊 DŁUGOŚĆ TAŚMY</div>
            {Object.entries(stats.legsBuckets).length===0&&<div style={{fontSize:14,color:"#333"}}>Brak danych.</div>}
            {Object.entries(stats.legsBuckets).sort((a,b)=>a[0].localeCompare(b[0])).map(([b,d])=>{
              const wr=d.t>0?(d.w/d.t)*100:0;
              return(
                <div key={b} style={{padding:"10px 0",borderBottom:"1px solid #0f1520"}}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <span style={{fontSize:14,width:72,flexShrink:0,color:"#d4d8e8"}}>{b} zd.</span>
                    <div style={{flex:1,background:"#060810",borderRadius:4,height:8,overflow:"hidden"}}><div style={{width:`${wr}%`,height:"100%",background:wr>=30?G:R,borderRadius:4}}/></div>
                    <span style={{fontSize:13,color:wr>=30?G:R,width:36,textAlign:"right"}}>{wr.toFixed(0)}%</span>
                    <span style={{fontSize:12,color:"#444",width:46,textAlign:"right"}}>{d.w}/{d.t}</span>
                    <span style={{fontSize:13,fontWeight:600,color:d.p>=0?G:R,minWidth:80,textAlign:"right"}}>{fmt(d.p)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </>}

        {/* ── OSIĄGNIĘCIA ── */}
        {view==="ach"&&<>
          <div style={{fontSize:14,color:"#444",marginBottom:4}}>OSIĄGNIĘCIA · {earned.length}/{ACH.length}</div>
          <div style={{background:"#060810",borderRadius:6,height:8,overflow:"hidden",marginBottom:16}}>
            <div style={{width:`${(earned.length/ACH.length)*100}%`,height:"100%",background:A,borderRadius:6,transition:"width .5s"}}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            {ACH.map(a=>{const done=earned.includes(a.id);return(
              <div key={a.id} className={done?"":"ach-off"} style={{background:done?"rgba(240,165,0,.07)":"#0d1117",border:`1px solid ${done?"rgba(240,165,0,.3)":"#1a2030"}`,borderRadius:10,padding:"14px"}}>
                <div style={{fontSize:26,marginBottom:6}}>{a.icon}</div>
                <div style={{fontSize:14,fontWeight:600,color:done?A:"#555",marginBottom:3}}>{a.name}</div>
                <div style={{fontSize:12,color:"#333"}}>{a.desc}</div>
                {done&&<div style={{fontSize:11,color:G,marginTop:6}}>✓ Odblokowane</div>}
              </div>
            );})}
          </div>
        </>}

        {/* ── USTAWIENIA ── */}
        {view==="cfg"&&<>
          <div style={{fontSize:16,fontWeight:500,color:"#d4d8e8",marginBottom:16}}>Ustawienia</div>

          {/* Streak alerts toggle */}
          <div style={{background:"#0d1117",border:"1px solid #1a2030",borderRadius:10,padding:"14px 16px",marginBottom:10}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
              <div>
                <div style={{fontSize:15,color:"#d4d8e8"}}>🚨 Alerty serii przegranych</div>
                <div style={{fontSize:12,color:"#444",marginTop:2}}>Ostrzeżenia przy 5, 10, 20 przegranych z rzędu</div>
              </div>
              <button className="tap" onClick={()=>setSettings(s=>({...s,alertsEnabled:!s.alertsEnabled}))}
                style={{background:settings.alertsEnabled?"rgba(0,200,80,.15)":"#060810",border:`1px solid ${settings.alertsEnabled?"#0d3018":"#1e2535"}`,color:settings.alertsEnabled?G:"#666",borderRadius:8,padding:"8px 16px",fontSize:14,fontWeight:700,cursor:"pointer"}}>
                {settings.alertsEnabled?"✓ WŁĄCZONE":"WYŁĄCZONE"}
              </button>
            </div>
            <div style={{fontSize:13,color:"#555",marginBottom:6}}>Zatrzymaj po serii przegranych:</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {[5,10,15,20,0].map(v=>(
                <button key={v} className="tap" onClick={()=>setSettings(s=>({...s,stopAfter:v}))}
                  style={{background:settings.stopAfter===v?"rgba(220,50,50,.15)":"#060810",border:`1px solid ${settings.stopAfter===v?"#3a1010":"#1e2535"}`,color:settings.stopAfter===v?R:"#666",borderRadius:7,padding:"7px 12px",fontSize:13,fontWeight:600,cursor:"pointer"}}>
                  {v===0?"Brak":`${v} P`}
                </button>
              ))}
            </div>
          </div>

          {/* Tax */}
          <div style={{background:"#0d1117",border:"1px solid #1a2030",borderRadius:10,padding:"14px 16px",marginBottom:10}}>
            <div style={{fontSize:15,color:"#d4d8e8",marginBottom:3}}>🧾 Podatek od wygranej (%)</div>
            <div style={{fontSize:12,color:"#444",marginBottom:8}}>PL: 10% powyżej 2280 zł. Ustaw 0 jeśli buk potrąca sam.</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
              {[0,10,12].map(v=>(
                <button key={v} className="tap" onClick={()=>setSettings(s=>({...s,taxRate:v}))}
                  style={{background:settings.taxRate===v?"rgba(240,165,0,.15)":"#060810",border:`1px solid ${settings.taxRate===v?A:"#1e2535"}`,color:settings.taxRate===v?A:"#666",borderRadius:7,padding:"8px 14px",fontSize:14,fontWeight:600,cursor:"pointer"}}>
                  {v}%
                </button>
              ))}
              <input type="number" min="0" max="99" value={settings.taxRate} onChange={e=>setSettings(s=>({...s,taxRate:+e.target.value}))}
                style={{...smInp(),color:A,width:80,fontSize:16}}/>
              <span style={{fontSize:14,color:"#666"}}>%</span>
            </div>
          </div>

          {[{k:"goalBankroll",l:"🎯 Cel bankrolla (zł)",d:"Do jakiej kwoty chcesz dobić"},{k:"dayLoss",l:"⚠️ Dzienny limit straty (zł)",d:"Alert gdy przekroczysz"},{k:"weekLoss",l:"⚠️ Tygodniowy limit straty (zł)",d:"Alert gdy przekroczysz"}].map(({k,l,d})=>(
            <div key={k} style={{background:"#0d1117",border:"1px solid #1a2030",borderRadius:10,padding:"14px 16px",marginBottom:10}}>
              <div style={{fontSize:15,color:"#d4d8e8",marginBottom:3}}>{l}</div>
              <div style={{fontSize:12,color:"#444",marginBottom:8}}>{d}</div>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <input type="number" value={settings[k]} onChange={e=>setSettings(s=>({...s,[k]:+e.target.value}))}
                  style={{...smInp(),color:A,width:130,fontSize:18}}/>
                <span style={{fontSize:15,color:"#666"}}>zł</span>
              </div>
            </div>
          ))}

          <div style={{background:"#0d1117",border:"1px solid #1a2030",borderRadius:10,padding:"14px 16px",marginBottom:10}}>
            <div style={{fontSize:15,color:"#d4d8e8",marginBottom:3}}>💰 Bankroll startowy (zł)</div>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <input type="number" value={bankroll} onChange={e=>setBankroll(+e.target.value)} style={{...smInp(),color:A,width:130,fontSize:18}}/>
              <span style={{fontSize:15,color:"#666"}}>zł</span>
            </div>
          </div>

          {/* Units */}
          <div style={{background:"#0d1117",border:"1px solid #1a2030",borderRadius:10,padding:"14px 16px",marginBottom:10}}>
            <div style={{fontSize:15,color:"#d4d8e8",marginBottom:2}}>🎯 System jednostek</div>
            <div style={{fontSize:12,color:"#444",marginBottom:10}}>Wartość 1 jednostki (unit) w zł. Stawki będą pokazywane jako "Xu". Ustaw 0 żeby wyłączyć.</div>
            <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:14,color:"#555"}}>1u =</span>
                <input type="number" min="0" value={settings.unitSize||0} onChange={e=>setSettings(s=>({...s,unitSize:+e.target.value}))}
                  style={{...smInp(),color:A,width:100,fontSize:18}}/>
                <span style={{fontSize:14,color:"#666"}}>zł</span>
              </div>
              {(settings.unitSize||0)>0&&(
                <span style={{fontSize:13,color:"#555"}}>bankroll: <b style={{color:A}}>{(stats.bnow/(settings.unitSize||1)).toFixed(1)}u</b></span>
              )}
            </div>
          </div>

          {/* Daily profit goal */}
          <div style={{background:"#0d1117",border:"1px solid #1a2030",borderRadius:10,padding:"14px 16px",marginBottom:10}}>
            <div style={{fontSize:15,color:"#d4d8e8",marginBottom:2}}>🏆 Dzienny cel zysku</div>
            <div style={{fontSize:12,color:"#444",marginBottom:10}}>Alert gdy osiągniesz dzienny cel. Ustaw 0 żeby wyłączyć.</div>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <input type="number" min="0" value={settings.dayProfitGoal||0} onChange={e=>setSettings(s=>({...s,dayProfitGoal:+e.target.value}))}
                style={{...smInp(),color:G,width:130,fontSize:18}}/>
              <span style={{fontSize:15,color:"#666"}}>zł</span>
            </div>
          </div>

          {/* Withdrawals */}
          <div style={{background:"#0d1117",border:"1px solid #1a2030",borderRadius:10,padding:"14px 16px",marginBottom:10}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
              <div>
                <div style={{fontSize:15,color:"#d4d8e8"}}>💸 Wypłaty</div>
                <div style={{fontSize:12,color:"#444",marginTop:2}}>Łącznie: <b style={{color:G}}>{stats.totalW.toFixed(2)} zł</b></div>
              </div>
              <button className="tap" onClick={()=>setShowWd(s=>!s)}
                style={{background:"rgba(0,200,80,.12)",border:"1px solid rgba(0,200,80,.3)",color:G,borderRadius:7,padding:"7px 12px",fontSize:13,fontWeight:700,cursor:"pointer"}}>+ WYPŁATA</button>
            </div>
            {showWd&&(
              <div className="fd" style={{background:"#060810",borderRadius:8,padding:"12px",marginBottom:10}}>
                <div style={{display:"flex",gap:8,marginBottom:8,flexWrap:"wrap"}}>
                  <input type="date" value={wdForm.date} onChange={e=>setWdForm(f=>({...f,date:e.target.value}))} style={smInp()}/>
                  <input type="number" placeholder="Kwota" value={wdForm.amount} onChange={e=>setWdForm(f=>({...f,amount:e.target.value}))} style={{...smInp(),color:G,width:110}}/>
                  <input placeholder="Notatka" value={wdForm.note} onChange={e=>setWdForm(f=>({...f,note:e.target.value}))} style={{...smInp(),flex:1}}/>
                </div>
                <button className="tap" onClick={saveWd} style={{background:G,color:"#080b0f",border:"none",borderRadius:7,padding:"9px 18px",fontSize:14,fontWeight:700,cursor:"pointer"}}>ZAPISZ</button>
              </div>
            )}
            {[...withdrawals].reverse().map(w=>(
              <div key={w.id} style={{display:"flex",gap:10,padding:"9px 0",borderBottom:"1px solid #0f1520"}}>
                <span style={{fontSize:13,color:"#444",width:88}}>{w.date}</span>
                <span style={{flex:1,fontSize:14,color:"#888"}}>{w.note||"—"}</span>
                <span style={{fontSize:15,fontWeight:600,color:G}}>{fmt(w.amount)}</span>
                <button onClick={()=>setWithdrawals(p=>p.filter(x=>x.id!==w.id))} style={{background:"none",border:"none",color:"#2a2a2a",fontSize:18,cursor:"pointer"}}>✕</button>
              </div>
            ))}
          </div>

          {/* Templates */}
          <div style={{background:"#0d1117",border:"1px solid #1a2030",borderRadius:10,padding:"14px 16px",marginBottom:10}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
              <div style={{fontSize:15,color:"#d4d8e8"}}>⭐ Szablony</div>
              <button className="tap" onClick={()=>setShowTpl(s=>!s)}
                style={{background:"rgba(240,165,0,.12)",border:"1px solid rgba(240,165,0,.3)",color:A,borderRadius:7,padding:"7px 12px",fontSize:13,fontWeight:700,cursor:"pointer"}}>+ SZABLON</button>
            </div>
            {showTpl&&(
              <div className="fd" style={{background:"#060810",borderRadius:8,padding:"12px",marginBottom:10}}>
                <div style={{display:"flex",gap:8,marginBottom:8,flexWrap:"wrap"}}>
                  <input placeholder="Nazwa" value={tplForm.name} onChange={e=>setTplForm(f=>({...f,name:e.target.value}))} style={{...smInp(),flex:2}}/>
                  <select value={tplForm.bk} onChange={e=>setTplForm(f=>({...f,bk:e.target.value}))} style={smInp()}>
                    {BKM.map(b=><option key={b}>{b}</option>)}
                  </select>
                </div>
                <div style={{display:"flex",gap:8,marginBottom:8}}>
                  <input type="number" placeholder="Stawka" value={tplForm.stake} onChange={e=>setTplForm(f=>({...f,stake:e.target.value}))} style={{...smInp(),width:100}}/>
                  <input type="number" step="0.01" placeholder="Kurs" value={tplForm.odds} onChange={e=>setTplForm(f=>({...f,odds:e.target.value}))} style={{...smInp(),color:A,width:120}}/>
                </div>
                <button className="tap" onClick={saveTpl} style={{background:A,color:"#080b0f",border:"none",borderRadius:7,padding:"9px 18px",fontSize:14,fontWeight:700,cursor:"pointer"}}>ZAPISZ</button>
              </div>
            )}
            {templates.length===0&&<div style={{fontSize:13,color:"#333"}}>Brak szablonów.</div>}
            {templates.map(t=>(
              <div key={t.id} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 0",borderBottom:"1px solid #0f1520",flexWrap:"wrap"}}>
                <span>⭐</span>
                <span style={{flex:1,fontSize:14,color:"#d4d8e8"}}>{t.name}</span>
                <span style={{fontSize:13,color:"#555"}}>{t.bk}</span>
                <span style={{fontSize:13,color:A}}>×{t.odds}</span>
                <span style={{fontSize:13,color:"#888"}}>{t.stake} zł</span>
                <button onClick={()=>setTemplates(p=>p.filter(x=>x.id!==t.id))} style={{background:"none",border:"none",color:"#2a2a2a",fontSize:18,cursor:"pointer"}}>✕</button>
              </div>
            ))}
          </div>

          {/* History */}
          <div style={{background:"#0d1117",border:"1px solid #1a2030",borderRadius:10,padding:"14px 16px"}}>
            <div style={{fontSize:15,color:"#d4d8e8",marginBottom:10}}>📋 Historia · {coupons.length} kuponów</div>
            {Object.entries(grpByDate(coupons)).map(([date,cs])=><DayGroup key={date} date={date} cs={cs}/>)}
          </div>
        </>}
      </div>

      {/* ── DAY MODAL ── */}
      {selDay&&<DayModal date={selDay} coupons={coupons.filter(c=>c.date===selDay)} taxRate={settings.taxRate||0}
        onClose={()=>setSelDay(null)} onAdd={()=>{setForm({...blank,date:selDay});setShowAdd(true);setSelDay(null);}}
        onRepeat={(c)=>{setForm({...blank,date:todayISO(),bk:c.bk,stake:String(c.stake),odds:String(c.odds),note:`Repeat: ${c.note}`});setShowAdd(true);setSelDay(null);}}
        mark={mark} del={del} markCashout={markCashout}/>}
    </div>
  );
}

// ── EV Badge ─────────────────────────────────────────────────────────────────
function EVBadge({ev,A,G,R}){
  const s=typeof ev==="string"?ev:evStatus(ev);
  const [label,color,bg]={
    value:["VALUE",G,"rgba(0,200,80,.15)"],
    neutral:["NEUTRAL",A,"rgba(240,165,0,.12)"],
    bad:["BAD",R,"rgba(220,50,50,.12)"],
  }[s]||["?","#555","#0d1117"];
  return <span style={{background:bg,color,border:`1px solid ${color}44`,borderRadius:5,padding:"2px 8px",fontSize:11,fontWeight:700,letterSpacing:".05em"}}>{label}</span>;
}

// ── Day Modal ─────────────────────────────────────────────────────────────────
function DayModal({date,coupons,taxRate,onClose,onAdd,onRepeat,mark,del,markCashout}){
  const G="#00c850",R="#dc3232",A="#f0a500";
  const settled=coupons.filter(c=>["won","lost","cashout"].includes(c.status));
  const dayPnl=settled.reduce((s,c)=>s+calcPnl(c,taxRate),0);
  const dayStk=coupons.reduce((s,c)=>s+c.stake,0);
  const wr=settled.length>0?(settled.filter(c=>c.status==="won").length/settled.length)*100:0;
  const roi=dayStk>0?(dayPnl/dayStk)*100:0;
  const hp=coupons.some(c=>c.status==="pending");
  const parts=date.split("-");
  const label=`${parseInt(parts[2],10)} ${["stycznia","lutego","marca","kwietnia","maja","czerwca","lipca","sierpnia","września","października","listopada","grudnia"][parseInt(parts[1],10)-1]} ${parts[0]}`;
  const [showCO,setShowCO]=useState(null);
  const [coAmt,setCoAmt]=useState("");

  return(
    <div className="ovl" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal fd">
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
          <div>
            <div style={{fontSize:17,fontWeight:600,color:"#d4d8e8"}}>{label}</div>
            <div style={{fontSize:13,color:dayPnl>=0?G:R,marginTop:3}}>
              {coupons.length} kuponów · {dayPnl>=0?"+":""}{dayPnl.toFixed(2)} zł
              {settled.length>0&&` · ROI ${roi>=0?"+":""}${roi.toFixed(0)}%`}
              {settled.length>0&&` · WR ${wr.toFixed(0)}%`}
              {hp&&<span style={{color:A}}> · oczekuje</span>}
            </div>
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#555",fontSize:22,cursor:"pointer"}}>✕</button>
        </div>

        {/* Stats row */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:14}}>
          {[{l:"Stawki",v:`${dayStk} zł`,c:"#888"},{l:"P&L",v:fmt(dayPnl),c:dayPnl>=0?G:R},{l:"ROI",v:settled.length>0?fmtP(roi):"—",c:roi>=0?G:R},{l:"Win Rate",v:settled.length>0?`${wr.toFixed(0)}%`:"—",c:"#d4d8e8"}].map(({l,v,c})=>(
            <div key={l} style={{background:"#060810",borderRadius:8,padding:"10px 12px"}}>
              <div style={{fontSize:11,color:"#444",marginBottom:4}}>{l}</div>
              <div style={{fontSize:16,fontWeight:500,color:c}}>{v}</div>
            </div>
          ))}
        </div>

        {/* Coupons */}
        {coupons.map(c=>{
          const p=calcPnl(c,taxRate);
          const isPending=c.status==="pending";
          const sc={won:G,lost:R,pending:A,cashout:"#00c8c8"}[c.status]||"#555";
          return(
            <div key={c.id} style={{background:"#060810",border:`1px solid #1a2030`,borderRadius:9,marginBottom:8,overflow:"hidden"}}>
              {isPending&&<div style={{background:"rgba(240,165,0,.1)",borderBottom:"1px solid rgba(240,165,0,.2)",padding:"4px 12px",fontSize:11,color:A,fontWeight:600}}>⏳ OCZEKUJE</div>}
              <div style={{padding:"11px 12px",display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:sc,flexShrink:0}}/>
                <span style={{fontSize:13,color:"#555",width:66,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flexShrink:0}}>{c.bk}</span>
                <span style={{flex:1,fontSize:14,color:"#7a8499",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0}}>{c.note||"—"}</span>
                <span style={{background:"rgba(240,165,0,.12)",color:A,borderRadius:5,padding:"2px 8px",fontSize:13,fontWeight:600,flexShrink:0}}>×{c.odds>=10000?c.odds.toLocaleString():c.odds.toFixed(2)}</span>
                <span style={{fontSize:14,color:"#d4d8e8",flexShrink:0}}>{c.stake}zł</span>
                {!isPending&&<span style={{fontSize:14,fontWeight:600,color:p>=0?G:R,flexShrink:0}}>{p>=0?"+":""}{p.toFixed(0)}zł</span>}
              </div>
              {/* EV badge */}
              {(() => {
                const prob=c.probability!=null?c.probability/100:impliedProb(c.odds);
                const ev=calcEV(c.odds,prob);
                return(
                  <div style={{padding:"0 12px 8px",display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                    <EVBadge ev={ev} A={A} G={G} R={R}/>
                    <span style={{fontSize:12,color:"#444"}}>EV: <b style={{color:evColor(ev,A,G,R)}}>{ev>=0?"+":""}{ev.toFixed(3)}</b></span>
                    <span style={{fontSize:12,color:"#444"}}>Edge: <b style={{color:evColor(ev,A,G,R)}}>{calcEdge(c.odds,prob)>=0?"+":""}{calcEdge(c.odds,prob).toFixed(1)}%</b></span>
                    {c.probability==null&&<span style={{fontSize:10,color:"#333"}}>implied</span>}
                  </div>
                );
              })()}
              {/* Actions */}
              {isPending&&(
                <div style={{padding:"0 10px 10px",display:"flex",gap:5,flexWrap:"wrap"}}>
                  <button onClick={()=>mark(c.id,"won")}  style={{flex:1,background:"rgba(0,200,80,.14)",border:"1px solid #0d3018",color:G,borderRadius:7,padding:"8px",fontSize:12,fontWeight:700,cursor:"pointer"}}>✓ WYGR.</button>
                  <button onClick={()=>mark(c.id,"lost")} style={{flex:1,background:"rgba(220,50,50,.12)",border:"1px solid #3a1010",color:R,borderRadius:7,padding:"8px",fontSize:12,fontWeight:700,cursor:"pointer"}}>✗ PRZEG.</button>
                  <button onClick={()=>setShowCO(showCO===c.id?null:c.id)}
                    style={{background:"rgba(0,200,200,.12)",border:"1px solid #0d2e2e",color:"#00c8c8",borderRadius:7,padding:"8px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}}>💰 CO</button>
                  <button onClick={()=>onRepeat(c)} style={{background:"rgba(90,159,255,.1)",border:"1px solid rgba(90,159,255,.2)",color:"#5a9fff",borderRadius:7,padding:"8px 10px",fontSize:11,cursor:"pointer"}}>🔁 POWTÓRZ</button>
                  <button onClick={()=>del(c.id)} style={{background:"none",border:"1px solid #1a2030",color:"#333",borderRadius:7,padding:"8px 10px",fontSize:11,cursor:"pointer"}}>✕</button>
                </div>
              )}
              {showCO===c.id&&(
                <div style={{padding:"0 10px 10px",display:"flex",gap:8,alignItems:"center"}}>
                  <input type="number" step="0.01" placeholder="Kwota cashout" value={coAmt} onChange={e=>setCoAmt(e.target.value)}
                    style={{background:"#0d1117",border:"1px solid #0d2e2e",borderRadius:7,padding:"7px 10px",color:"#00c8c8",fontFamily:"inherit",fontSize:14,outline:"none",flex:1}}/>
                  <button onClick={()=>{if(coAmt){markCashout(c.id,+coAmt);setShowCO(null);setCoAmt("");}}}
                    style={{background:"rgba(0,200,200,.2)",border:"1px solid #0d2e2e",color:"#00c8c8",borderRadius:7,padding:"8px 12px",fontFamily:"inherit",fontSize:13,fontWeight:700,cursor:"pointer"}}>
                    ✓
                  </button>
                </div>
              )}
            </div>
          );
        })}

        <div style={{display:"flex",gap:8,marginTop:8}}>
          <button className="tap" onClick={onAdd}
            style={{flex:1,background:"rgba(240,165,0,.12)",border:"1px solid rgba(240,165,0,.3)",color:A,borderRadius:8,padding:"12px",fontSize:14,fontWeight:600,cursor:"pointer"}}>
            + Dodaj kupon do tego dnia
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Coupon Card ───────────────────────────────────────────────────────────────
function CouponCard({c,expanded,onToggle,onWon,onLost,onPending,onCashout,onEdit,onDelete,taxRate=0}){
  const [showCO,setShowCO]=useState(false);
  const [coAmt,setCoAmt]=useState("");
  const p=calcPnl(c,taxRate);
  const A="#f0a500",G="#00c850",R="#dc3232";
  const isPending=c.status==="pending";
  const isCO=c.status==="cashout";
  const sc={won:G,lost:R,pending:A,cashout:"#00c8c8"}[c.status]||"#555";
  const sbg={won:"rgba(0,200,80,.06)",lost:"rgba(220,50,50,.05)",pending:"rgba(240,165,0,.08)",cashout:"rgba(0,200,200,.06)"}[c.status]||"#0d1117";
  const sbd={won:"#0d2e1a",lost:"#2a1010",pending:"rgba(240,165,0,.5)",cashout:"#0d2e2e"}[c.status]||"#1a2030";

  // EV
  const prob=c.probability!=null?c.probability/100:impliedProb(c.odds);
  const ev=calcEV(c.odds,prob);

  return(
    <div className={isPending?"pc":""} style={{background:sbg,border:`${isPending?"2px":"1px"} solid ${sbd}`,borderRadius:10,marginBottom:8,overflow:"hidden",width:"100%"}}>
      {isPending&&<div style={{background:"rgba(240,165,0,.12)",borderBottom:"1px solid rgba(240,165,0,.25)",padding:"5px 14px",display:"flex",alignItems:"center",gap:8}}>
        <div className="pd" style={{width:7,height:7,borderRadius:"50%",background:A,flexShrink:0}}/>
        <span style={{fontSize:12,color:A,fontWeight:600,letterSpacing:".08em"}}>OCZEKUJE NA ROZLICZENIE</span>
      </div>}
      <div className="hov" onClick={onToggle} style={{padding:"13px 14px",display:"flex",alignItems:"center",gap:8,cursor:"pointer"}}>
        <div style={{width:9,height:9,borderRadius:"50%",background:sc,boxShadow:`0 0 6px ${sc}80`,flexShrink:0}}/>
        <span style={{fontSize:13,color:"#555",width:c.isFreebet?52:70,flexShrink:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.bk}</span>
        {c.isFreebet&&<span style={{background:"rgba(0,150,255,.18)",color:"#5a9fff",borderRadius:4,padding:"2px 5px",fontSize:10,fontWeight:700,flexShrink:0}}>FREE</span>}
        <span style={{flex:1,fontSize:15,color:"#7a8499",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0}}>{c.note||"—"}</span>
        {/* EV badge */}
        <EVBadge ev={ev} A={A} G={G} R={R}/>
        <span style={{background:"rgba(240,165,0,.12)",color:A,borderRadius:6,padding:"3px 9px",fontSize:14,fontWeight:600,flexShrink:0,whiteSpace:"nowrap"}}>
          ×{c.odds>=10000?c.odds.toLocaleString():c.odds.toFixed(2)}
        </span>
        <span style={{fontSize:15,fontWeight:500,color:"#d4d8e8",flexShrink:0,width:46,textAlign:"right"}}>{c.stake}zł</span>
        {!isPending&&<span style={{background:isCO?"rgba(0,200,200,.15)":p>0?"rgba(0,200,80,.15)":"rgba(220,50,50,.15)",color:isCO?"#00c8c8":p>0?G:R,borderRadius:6,padding:"3px 9px",fontSize:14,fontWeight:600,flexShrink:0,whiteSpace:"nowrap"}}>
          {isCO?`CO: ${c.cashoutAmount}zł`:`${p>=0?"+":""}${p.toFixed(0)}zł`}
        </span>}
        <span style={{fontSize:12,color:"#333",flexShrink:0}}>{expanded?"▲":"▼"}</span>
        <button onClick={e=>{e.stopPropagation();onDelete();}} style={{background:"none",border:"none",color:"#2a2a2a",fontSize:20,cursor:"pointer",padding:"0 2px",flexShrink:0,lineHeight:1}}>✕</button>
      </div>
      {expanded&&<>
        {/* EV details */}
        <div style={{padding:"8px 14px",borderTop:"1px solid rgba(0,0,0,.3)",display:"flex",gap:16,fontSize:13,color:"#444",flexWrap:"wrap"}}>
          <span>EV: <b style={{color:evColor(ev,A,G,"#dc3232")}}>{ev>=0?"+":""}{ev.toFixed(3)}</b></span>
          <span>Edge: <b style={{color:evColor(ev,A,G,"#dc3232")}}>{calcEdge(c.odds,prob)>=0?"+":""}{calcEdge(c.odds,prob).toFixed(1)}%</b></span>
          <span>Prob: <b style={{color:"#d4d8e8"}}>{(prob*100).toFixed(2)}%</b></span>
          {c.probability==null&&<span style={{color:"#333"}}>implied (brak własnej)</span>}
        </div>
        {c.legs.length>0&&c.legs.map((l,i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"9px 14px",borderTop:"1px solid rgba(0,0,0,.3)"}}>
            <span style={{fontSize:13,color:"#333",width:20,textAlign:"right"}}>{i+1}.</span>
            <span style={{flex:1,fontSize:15,color:"#666"}}>{l.m}</span>
            <span style={{fontSize:15,color:A,fontWeight:600}}>{l.s}</span>
          </div>
        ))}
        {c.oddsHistory&&c.oddsHistory.length>0&&(
          <div style={{padding:"7px 14px",borderTop:"1px solid rgba(0,0,0,.3)",display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
            <span style={{fontSize:10,color:"#444",letterSpacing:".06em",flexShrink:0}}>HISTORIA KURSU</span>
            {c.oddsHistory.map((h,i)=>(
              <span key={i} style={{fontSize:12,color:"#555"}}>
                <span style={{color:"#333"}}>{h.date}</span> ×{h.odds.toFixed(2)}
                <span style={{color:"#222",margin:"0 4px"}}>→</span>
              </span>
            ))}
            <span style={{fontSize:13,color:A,fontWeight:600}}>×{c.odds.toFixed(2)}</span>
          </div>
        )}
        <div style={{padding:"9px 14px",borderTop:"1px solid rgba(0,0,0,.3)",display:"flex",gap:20,fontSize:14,color:"#444",flexWrap:"wrap"}}>
          <span>Wygrana: <b style={{color:A}}>{(c.odds*c.stake).toFixed(2)} zł</b></span>
          <span>Zysk: <b style={{color:G}}>+{((c.odds-1)*c.stake).toFixed(2)} zł</b></span>
          <span style={{marginLeft:"auto",color:"#333"}}>{c.date}</span>
        </div>
      </>}
      <div style={{padding:"0 12px 12px",display:"flex",gap:5,flexWrap:"wrap"}}>
        {isPending&&<>
          <button onClick={onWon}  style={{flex:1,background:"rgba(0,200,80,.14)",border:"1px solid #0d3018",color:G,borderRadius:7,padding:"9px",fontSize:13,fontWeight:700,cursor:"pointer"}}>✓ WYGRANY</button>
          <button onClick={onLost} style={{flex:1,background:"rgba(220,50,50,.12)",border:"1px solid #3a1010",color:R,borderRadius:7,padding:"9px",fontSize:13,fontWeight:700,cursor:"pointer"}}>✗ PRZEGRANY</button>
          <button onClick={()=>setShowCO(s=>!s)} style={{background:showCO?"rgba(0,200,200,.25)":"rgba(0,200,200,.12)",border:"1px solid #0d2e2e",color:"#00c8c8",borderRadius:7,padding:"9px 8px",fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>💰 CO</button>
        </>}
        {!isPending&&<button onClick={onPending} style={{background:"rgba(240,165,0,.08)",border:"1px solid rgba(240,165,0,.2)",color:A,borderRadius:7,padding:"9px 14px",fontSize:13,fontWeight:600,cursor:"pointer"}}>↩ COFNIJ</button>}
        <button onClick={e=>{e.stopPropagation();onEdit();}} style={{background:"none",border:"1px solid #1a2030",color:"#555",borderRadius:7,padding:"9px 14px",fontSize:13,cursor:"pointer"}}>✏ EDYTUJ</button>
      </div>
      {showCO&&isPending&&(
        <div style={{padding:"0 12px 12px",display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          <span style={{fontSize:13,color:"#00c8c8"}}>Kwota cashout:</span>
          <input type="number" step="0.01" placeholder="np. 35.50" value={coAmt} onChange={e=>setCoAmt(e.target.value)}
            style={{background:"#060810",border:"1px solid #0d2e2e",borderRadius:7,padding:"8px 12px",color:"#00c8c8",fontFamily:"inherit",fontSize:15,outline:"none",width:130}}/>
          <button onClick={()=>{if(coAmt){onCashout(+coAmt);setShowCO(false);setCoAmt("");}}}
            style={{background:"rgba(0,200,200,.2)",border:"1px solid #0d2e2e",color:"#00c8c8",borderRadius:7,padding:"8px 14px",fontFamily:"inherit",fontSize:13,fontWeight:700,cursor:"pointer"}}>
            ZATWIERDŹ
          </button>
          <span style={{fontSize:12,color:"#444"}}>Zysk: <b style={{color:+coAmt-(c.isFreebet?0:c.stake)>=0?"#00c8c8":"#dc3232"}}>{coAmt?`${(+coAmt-(c.isFreebet?0:c.stake))>=0?"+":""}${(+coAmt-(c.isFreebet?0:c.stake)).toFixed(2)} zł`:""}</b></span>
        </div>
      )}
    </div>
  );
}
