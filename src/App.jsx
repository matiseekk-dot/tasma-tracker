import { useState, useMemo, useRef, useEffect } from "react";

// ── Constants ────────────────────────────────────────────────────────────────
const BKM = ["Superbet","Fortuna","STS","Betclic","LVBet","Betfan","Totolotek"];
const SK="tc",BK="tb",SK2="ts",SK3="tw",SK4="tt";
const MONTHS=["Styczeń","Luty","Marzec","Kwiecień","Maj","Czerwiec","Lipiec","Sierpień","Wrzesień","Październik","Listopad","Grudzień"];
const DAYS7=["Pn","Wt","Śr","Cz","Pt","Sb","Nd"];
const DAYS_DOW=["Nd","Pn","Wt","Śr","Cz","Pt","Sb"];

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
};
const fmt = (n) => `${n>=0?"+":""}${n.toFixed(2)} zł`;
const pnl = (c, taxRate=0) => {
  const tax = taxRate/100;
  if (c.status==="cashout") {
    const co = c.cashoutAmount||0;
    const cost = c.isFreebet ? 0 : c.stake;
    const gross = co - cost;
    return gross > 0 ? gross*(1-tax) : gross;
  }
  if (c.status==="won") {
    if (c.isFreebet) {
      // SNR (stake not returned) - only profit
      const gross = c.freebetSR ? c.odds*c.stake-c.stake : (c.odds-1)*c.stake;
      return gross > 0 ? gross*(1-tax) : gross;
    }
    const gross = c.odds*c.stake - c.stake;
    return gross > 0 ? gross*(1-tax) : gross;
  }
  if (c.status==="lost") return c.isFreebet ? 0 : -c.stake;
  return 0;
};
const ls = {
  get: (k,fb) => { try { const v=localStorage.getItem(k); return v?JSON.parse(v):fb; } catch { return fb; } },
  set: (k,v) => { try { localStorage.setItem(k,JSON.stringify(v)); } catch {} },
};
const grpByDate = (arr) => {
  const g = {};
  [...arr].sort((a,b)=>b.date.localeCompare(a.date)).forEach(c => {
    if (!g[c.date]) g[c.date] = [];
    g[c.date].push(c);
  });
  return g;
};
const csvExport = (cs) => {
  const rows = [["Data","Buk","Notatka","Kurs","Stawka","Status","P&L","Freebet","Cashout"],...cs.map(c=>[c.date,c.bk,`"${c.note}"`,c.odds,c.stake,c.status,pnl(c).toFixed(2),c.isFreebet?"TAK":"",c.cashoutAmount||""])];
  const blob = new Blob([rows.map(r=>r.join(",")).join("\n")], {type:"text/csv"});
  const a = document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="tasma.csv"; a.click();
};

const jsonExport = (data) => {
  const payload = {
    version: 2,
    exportDate: new Date().toISOString(),
    coupons: data.coupons,
    bankroll: data.bankroll,
    settings: data.settings,
    withdrawals: data.withdrawals,
    templates: data.templates,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {type:"application/json"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `tasma-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
};

const jsonImport = (file, callbacks) => {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.coupons || !Array.isArray(data.coupons)) {
        alert("Nieprawidłowy plik backup — brak listy kuponów.");
        return;
      }
      if (window.confirm(`Importować ${data.coupons.length} kuponów? Aktualne dane zostaną zastąpione.`)) {
        callbacks.setCoupons(data.coupons);
        if (data.bankroll !== undefined) callbacks.setBankroll(data.bankroll);
        if (data.settings)    callbacks.setSettings(s=>({...s,...data.settings}));
        if (data.withdrawals) callbacks.setWithdrawals(data.withdrawals);
        if (data.templates)   callbacks.setTemplates(data.templates);
        alert(`✓ Zaimportowano ${data.coupons.length} kuponów z ${data.exportDate?.slice(0,10)||"?"}`);
      }
    } catch {
      alert("Błąd odczytu pliku. Upewnij się że to plik .json z Taśma Trackera.");
    }
  };
  reader.readAsText(file);
};

const SEED = [
  {id:1, date:"2026-03-23",bk:"Superbet",stake:15,odds:81.78,  legs:[],status:"lost",note:"Taśma #21 · 19 zd."},
  {id:2, date:"2026-03-22",bk:"Superbet",stake:15,odds:122.24, legs:[],status:"lost",note:"Taśma #20 · 16 zd."},
  {id:3, date:"2026-03-22",bk:"Superbet",stake:15,odds:124.17, legs:[],status:"lost",note:"Taśma #19 · 20 zd."},
  {id:4, date:"2026-03-22",bk:"Superbet",stake:15,odds:91.28,  legs:[],status:"lost",note:"Taśma #18 · 18 zd."},
  {id:5, date:"2026-03-21",bk:"Superbet",stake:15,odds:71.63,  legs:[],status:"lost",note:"Taśma #17 · 16 zd."},
  {id:6, date:"2026-03-21",bk:"STS",     stake:15,odds:125.89, legs:[],status:"lost",note:"Taśma #16 · 21 zd."},
  {id:7, date:"2026-03-19",bk:"Superbet",stake:15,odds:54.26,  legs:[],status:"lost",note:"Taśma #15 · 13 zd."},
  {id:8, date:"2026-03-18",bk:"Superbet",stake:15,odds:93.28,  legs:[],status:"lost",note:"Taśma #14 · 25 zd."},
  {id:9, date:"2026-03-18",bk:"Superbet",stake:15,odds:21.59,  legs:[],status:"lost",note:"Taśma #13 · 23 zd."},
  {id:10,date:"2026-03-17",bk:"Superbet",stake:2, odds:278460, legs:[],status:"lost",note:"Taśma #12 · 5 zd."},
  {id:11,date:"2026-03-17",bk:"Superbet",stake:15,odds:55.00,  legs:[],status:"won", note:"Taśma #11 · 28 zd."},
  {id:12,date:"2026-03-17",bk:"Superbet",stake:5, odds:2003.59,legs:[],status:"lost",note:"Taśma #10 · 32 zd."},
  {id:13,date:"2026-03-16",bk:"Superbet",stake:15,odds:586.76, legs:[],status:"lost",note:"Taśma #9 · 26 zd."},
  {id:14,date:"2026-03-15",bk:"Superbet",stake:15,odds:84.81,  legs:[],status:"lost",note:"Taśma #8 · 15 zd."},
  {id:15,date:"2026-03-15",bk:"Superbet",stake:15,odds:84.48,  legs:[],status:"lost",note:"Taśma #7 · 17 zd."},
  {id:16,date:"2026-03-14",bk:"Superbet",stake:15,odds:143.00, legs:[],status:"lost",note:"Taśma #6 · 19 zd."},
  {id:17,date:"2026-03-13",bk:"Superbet",stake:15,odds:165.00, legs:[],status:"lost",note:"Taśma #5 · 19 zd."},
  {id:18,date:"2026-03-13",bk:"Superbet",stake:15,odds:154.70, legs:[],status:"lost",note:"Taśma #4 · 22 zd."},
  {id:19,date:"2026-03-11",bk:"Superbet",stake:15,odds:112.35, legs:[],status:"lost",note:"Taśma #3 · 19 zd."},
  {id:20,date:"2026-03-12",bk:"Superbet",stake:15,odds:132.33, legs:[],status:"lost",note:"Taśma #2 · 21 zd."},
  {id:21,date:"2026-03-06",bk:"Superbet",stake:15,odds:372.56, legs:[],status:"lost",note:"Taśma #1 · 24 zd."},
];

// ── Achievements ─────────────────────────────────────────────────────────────
const ACH = [
  {id:"first",  icon:"🏆", name:"Pierwsza wygrana",     desc:"Wygrałeś swój pierwszy kupon",           check:s=>s.won>=1},
  {id:"win3",   icon:"🔥", name:"Seria 3 wygranych",     desc:"3 wygrane z rzędu",                      check:s=>s.maxWS>=3},
  {id:"win5",   icon:"💥", name:"Seria 5 wygranych",     desc:"5 wygranych z rzędu",                    check:s=>s.maxWS>=5},
  {id:"c10",    icon:"📋", name:"10 kuponów",            desc:"Łącznie 10 kuponów",                     check:s=>s.total>=10},
  {id:"c50",    icon:"📚", name:"50 kuponów",            desc:"Łącznie 50 kuponów",                     check:s=>s.total>=50},
  {id:"p500",   icon:"💰", name:"Zysk 500 zł",          desc:"Łączny zysk przekroczył 500 zł",         check:s=>s.totalPnl>=500},
  {id:"p1000",  icon:"💎", name:"Zysk 1000 zł",         desc:"Łączny zysk przekroczył 1000 zł",        check:s=>s.totalPnl>=1000},
  {id:"bigwin", icon:"🦈", name:"Duża ryba",            desc:"Jednorazowa wygrana ponad 500 zł",        check:s=>s.maxWin>=500},
  {id:"sur10",  icon:"🧊", name:"Przetrwałem",          desc:"Przeżyłeś serię 10 przegranych",          check:s=>s.maxLS>=10},
  {id:"sur20",  icon:"⛰️", name:"Twardziel",            desc:"Przeżyłeś serię 20 przegranych",          check:s=>s.maxLS>=20},
  {id:"goal",   icon:"🎯", name:"Cel osiągnięty",       desc:"Bankroll osiągnął cel",                  check:(s,st)=>s.bnow>=st.goalBankroll},
  {id:"active7",icon:"📅", name:"Tydzień aktywności",   desc:"Kupon 7 dni z rzędu",                    check:s=>s.maxAD>=7},
  {id:"odds1k", icon:"🚀", name:"Łowca kursów",         desc:"Kupon z kursem powyżej 1000",            check:s=>s.maxOdds>=1000},
  {id:"kelly",  icon:"📐", name:"Matematyk",            desc:"Sprawdziłeś kalkulator Kelly",            check:s=>s.usedKelly},
];

// ── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [coupons,     setCoupons]     = useState(() => ls.get(SK, SEED));
  const [bankroll,    setBankroll]    = useState(() => ls.get(BK, 500));
  const [settings,    setSettings]    = useState(() => ls.get(SK2, {goalBankroll:2000, dayLoss:50, weekLoss:150, taxRate:0}));
  const [withdrawals, setWithdrawals] = useState(() => ls.get(SK3, []));
  const [templates,   setTemplates]   = useState(() => ls.get(SK4, []));
  const [usedKelly,   setUsedKelly]   = useState(() => ls.get("tuk", false));

  const [view,     setView]     = useState("today");
  const [showAdd,  setShowAdd]  = useState(false);
  const [editId,   setEditId]   = useState(null);
  const [expand,   setExpand]   = useState(null);
  const [calMonth, setCalMonth] = useState(() => todayISO().slice(0,7));
  const [heatYear, setHeatYear] = useState(() => new Date().getFullYear());

  const [calcLegs, setCalcLegs] = useState("15");
  const [calcAvg,  setCalcAvg]  = useState("1.50");
  const [kOdds,    setKOdds]    = useState("50");
  const [kWinP,    setKWinP]    = useState("");

  const [wdForm,   setWdForm]   = useState({date:todayISO(), amount:"", note:""});
  const [showWd,   setShowWd]   = useState(false);
  const [tplForm,  setTplForm]  = useState({name:"", bk:"Superbet", stake:"15", odds:""});
  const [showTpl,  setShowTpl]  = useState(false);

  const firstRender = useRef(true);
  const importRef   = useRef(null);
  const stakeRef=useRef(), oddsRef=useRef(), legRef=useRef();

  // Save to localStorage
  useEffect(() => { if(firstRender.current){firstRender.current=false;return;} ls.set(SK,coupons); }, [coupons]);
  useEffect(() => { ls.set(BK,bankroll); }, [bankroll]);
  useEffect(() => { ls.set(SK2,settings); }, [settings]);
  useEffect(() => { ls.set(SK3,withdrawals); }, [withdrawals]);
  useEffect(() => { ls.set(SK4,templates); }, [templates]);
  useEffect(() => { ls.set("tuk",usedKelly); }, [usedKelly]);

  // Form
  const blank = {date:todayISO(), bk:"Superbet", stake:"15", odds:"", legs:[], note:"", status:"pending", isFreebet:false, freebetSR:false, cashoutAmount:""};
  const [form, setForm] = useState(blank);
  const [legM, setLegM] = useState("");
  const [legS, setLegS] = useState("");

  useEffect(() => { if(showAdd) setTimeout(()=>stakeRef.current?.focus(), 60); }, [showAdd]);

  const openAdd  = () => { setEditId(null); setForm(blank); setLegM(""); setLegS(""); setShowAdd(true); };
  const openEdit = (c) => { setForm({...c, stake:String(c.stake), odds:String(c.odds)}); setEditId(c.id); setShowAdd(true); };

  const saveForm = () => {
    if (!form.odds || !form.stake) return;
    const obj = {...form, stake:+form.stake, odds:+form.odds};
    if (editId) { setCoupons(p=>p.map(c=>c.id===editId?{...obj,id:editId}:c)); setEditId(null); }
    else        { setCoupons(p=>[...p, {...obj, id:Date.now()}]); }
    setForm(blank); setLegM(""); setLegS(""); setShowAdd(false);
  };

  const addLeg = () => {
    if (!legM.trim()) return;
    setForm(f=>({...f, legs:[...f.legs, {m:legM.trim(), s:legS.trim()}]}));
    setLegM(""); setLegS("");
    setTimeout(() => legRef.current?.focus(), 0);
  };

  const mark = (id,st) => setCoupons(p=>p.map(c=>c.id===id?{...c,status:st}:c));
  const del       = (id)    => setCoupons(p=>p.filter(c=>c.id!==id));
  const markCashout = (id,amt) => setCoupons(p=>p.map(c=>c.id===id?{...c,status:"cashout",cashoutAmount:amt}:c));

  const saveWd = () => {
    if (!wdForm.amount) return;
    setWithdrawals(p=>[...p, {...wdForm, id:Date.now(), amount:+wdForm.amount}]);
    setBankroll(b=>b - +wdForm.amount);
    setWdForm({date:todayISO(), amount:"", note:""});
    setShowWd(false);
  };

  const saveTpl = () => {
    if (!tplForm.name) return;
    setTemplates(p=>[...p, {...tplForm, id:Date.now(), stake:+tplForm.stake, odds:+tplForm.odds}]);
    setTplForm({name:"", bk:"Superbet", stake:"15", odds:""});
    setShowTpl(false);
  };

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const settled  = coupons.filter(c=>c.status==="won"||c.status==="lost"||c.status==="cashout");
    const wonList  = coupons.filter(c=>c.status==="won");
    const staked   = settled.reduce((s,c)=>s+c.stake, 0);
    const taxRate = settings?.taxRate||0;
    const totalPnl = settled.reduce((s,c)=>s+pnl(c,taxRate), 0);
    const roi      = staked>0 ? (totalPnl/staked)*100 : 0;
    const bnow     = bankroll + totalPnl;
    const totalW   = withdrawals.reduce((s,w)=>s+w.amount, 0);

    // Streaks & records
    let cW=0,cL=0,maxWS=0,maxLS=0,maxAD=0,cAD=0,prevD=null;
    const sorted = [...coupons].sort((a,b)=>a.date.localeCompare(b.date));
    sorted.forEach(c => {
      if(c.status==="won"){cW++;cL=0;maxWS=Math.max(maxWS,cW);}
      else if(c.status==="lost"){cL++;cW=0;maxLS=Math.max(maxLS,cL);}
      if(prevD){
        const diff=(new Date(c.date)-new Date(prevD))/86400000;
        if(diff===1){cAD++;maxAD=Math.max(maxAD,cAD+1);}else cAD=0;
      }
      prevD=c.date;
    });

    // Current streak
    let streak=0;
    for(const c of [...coupons].sort((a,b)=>b.date.localeCompare(a.date))){
      if(c.status==="pending") continue;
      if(!streak){streak=c.status==="won"?1:-1;continue;}
      if((streak>0&&c.status==="won")||(streak<0&&c.status==="lost")) streak+=streak>0?1:-1; else break;
    }

    const maxWin  = wonList.length>0 ? Math.max(...wonList.map(c=>c.odds*c.stake-c.stake)) : 0;
    const maxOdds = coupons.length>0 ? Math.max(...coupons.map(c=>c.odds)) : 0;

    const todayT  = todayISO();
    const todayPnl= coupons.filter(c=>c.date===todayT&&c.status!=="pending").reduce((s,c)=>s+pnl(c,taxRate),0);
    const wAgo    = new Date(); wAgo.setDate(wAgo.getDate()-7);
    const weekPnl = settled.filter(c=>new Date(c.date)>=wAgo).reduce((s,c)=>s+pnl(c,taxRate),0);

    // Legs buckets
    const legsBuckets={};
    settled.forEach(c=>{
      const n=c.legs.length||0;
      const b=n===0?"brak":n<=5?"1–5":n<=10?"6–10":n<=15?"11–15":n<=20?"16–20":n<=25?"21–25":"26+";
      if(!legsBuckets[b])legsBuckets[b]={w:0,t:0,p:0};
      legsBuckets[b].t++;
      if(c.status==="won")legsBuckets[b].w++;
      legsBuckets[b].p+=pnl(c,taxRate);
    });

    // Day of week
    const dow=Array(7).fill(null).map(()=>({w:0,t:0,p:0}));
    settled.forEach(c=>{const d=new Date(c.date).getDay();dow[d].t++;if(c.status==="won")dow[d].w++;dow[d].p+=pnl(c,taxRate);});

    // Monthly
    const monthly={};
    settled.forEach(c=>{
      const mo=c.date.slice(0,7);
      if(!monthly[mo])monthly[mo]={stk:0,p:0,w:0,t:0};
      monthly[mo].stk+=c.stake;monthly[mo].p+=pnl(c,taxRate);monthly[mo].t++;
      if(c.status==="won")monthly[mo].w++;
    });

    // Bankroll history
    let runBr=bankroll,runSt=0;
    const brHistory=[{v:bankroll,st:0}];
    sorted.filter(c=>c.status!=="pending").forEach(c=>{
      runBr+=pnl(c,taxRate);
      runSt=c.status==="won"?(runSt>0?runSt+1:1):(runSt<0?runSt-1:-1);
      brHistory.push({v:runBr,st:runSt});
    });

    return {
      staked,totalPnl,roi,bnow,totalW,
      won:wonList.length,lost:coupons.filter(c=>c.status==="lost").length,
      total:coupons.length,winRate:settled.length>0?(wonList.length/settled.length)*100:0,
      todayPnl,weekPnl,streak,maxWS,maxLS,maxAD,maxWin,maxOdds,usedKelly,
      legsBuckets,dow,monthly,brHistory,
    };
  }, [coupons,bankroll,withdrawals,usedKelly]);

  // Kelly
  const kelly = useMemo(()=>{
    const o=+kOdds, wp=kWinP?(+kWinP/100):(stats.winRate/100);
    if(!o||!wp) return null;
    const b=o-1,q=1-wp,f=(wp*b-q)/b;
    const fq=Math.max(0,f*0.25);
    return{full:Math.max(0,f*100).toFixed(1),quarter:(fq*100).toFixed(1),stake:(fq*stats.bnow).toFixed(2),edge:((wp*o-1)*100).toFixed(1)};
  },[kOdds,kWinP,stats]);

  const autoStake = Math.max(5, stats.bnow*0.01).toFixed(0);
  const calcOdds  = calcLegs&&calcAvg ? Math.pow(+calcAvg,+calcLegs).toFixed(2) : null;
  const payPrev   = form.odds&&form.stake ? +form.odds * +form.stake : null;
  const profPrev  = payPrev ? payPrev - +form.stake : null;

  const earned = useMemo(() => ACH.filter(a=>a.check(stats,settings)).map(a=>a.id), [stats,settings]);

  const alerts = useMemo(()=>{
    const a=[];
    if(stats.todayPnl<=-settings.dayLoss) a.push({type:"danger",msg:`⚠️ Dzienny limit (${settings.dayLoss} zł) przekroczony! Dziś: ${stats.todayPnl.toFixed(0)} zł`});
    else if(stats.todayPnl<=-settings.dayLoss*0.8) a.push({type:"warn",msg:`⚠️ Blisko dziennego limitu (${settings.dayLoss} zł). Dziś: ${stats.todayPnl.toFixed(0)} zł`});
    if(stats.weekPnl<=-settings.weekLoss) a.push({type:"danger",msg:`⚠️ Tygodniowy limit (${settings.weekLoss} zł) przekroczony!`});
    if(!coupons.some(c=>c.date===todayISO())) a.push({type:"info",msg:"🔔 Brak kuponu na dziś!"});
    return a;
  },[stats,settings,coupons]);

  // Calendar data — computed safely
  const calData = useMemo(()=>{
    const parts = calMonth.split("-");
    const y=parseInt(parts[0],10), m=parseInt(parts[1],10);
    const daysInMonth = new Date(y,m,0).getDate();
    const firstDow    = (new Date(y,m-1,1).getDay()+6)%7; // Mon=0
    const cells=[];
    for(let i=0;i<firstDow;i++) cells.push(null);
    for(let d=1;d<=daysInMonth;d++){
      const dd=String(d).padStart(2,"0"),mm=String(m).padStart(2,"0");
      const date=`${y}-${mm}-${dd}`;
      const cs=coupons.filter(c=>c.date===date);
      const hp=cs.some(c=>c.status==="pending");
      const dayPnl=cs.filter(c=>c.status!=="pending").reduce((s,c)=>s+pnl(c),0);
      cells.push({d,date,hp,dayPnl,empty:cs.length===0});
    }
    return {cells,y,m};
  },[calMonth,coupons]);

  // Heatmap data — weeks as columns, Mon–Sun as rows
  const heatWeeks = useMemo(()=>{
    const yr=heatYear;
    const dayMap={};
    coupons.forEach(c=>{
      if(!c.date.startsWith(String(yr))) return;
      if(!dayMap[c.date]) dayMap[c.date]={p:0,n:0,hp:false};
      if(c.status!=="pending") dayMap[c.date].p+=pnl(c);
      dayMap[c.date].n++;
      if(c.status==="pending") dayMap[c.date].hp=true;
    });

    // Jan 1 day of week (Mon=0)
    const jan1=new Date(yr,0,1);
    const startPad=(jan1.getDay()+6)%7;
    const totalDays=(new Date(yr,11,31)-new Date(yr,0,1))/86400000+1;

    const slots=[];
    for(let i=0;i<startPad;i++) slots.push(null);
    for(let i=0;i<totalDays;i++){
      const dt=new Date(yr,0,1+i);
      const mo=dt.getMonth();
      const dy=dt.getDate();
      const ds=`${yr}-${String(mo+1).padStart(2,"0")}-${String(dy).padStart(2,"0")}`;
      slots.push({date:ds,isNew:dy===1,month:mo,...(dayMap[ds]||{p:0,n:0,hp:false})});
    }
    // Pad to full weeks
    while(slots.length%7!==0) slots.push(null);

    // Split into weeks
    const weeks=[];
    for(let i=0;i<slots.length;i+=7) weeks.push(slots.slice(i,i+7));
    return weeks;
  },[heatYear,coupons]);

  const todayList = useMemo(()=>coupons.filter(c=>c.date===todayISO()).sort((a,b)=>b.id-a.id),[coupons]);
  const histGrp   = useMemo(()=>grpByDate(coupons.filter(c=>c.date!==todayISO())),[coupons]);

  const goalPct = settings.goalBankroll>bankroll
    ? Math.min(100,Math.max(0,((stats.bnow-bankroll)/(settings.goalBankroll-bankroll))*100))
    : 100;

  const A="#f0a500",G="#00c850",R="#dc3232";

  const inp=(s={})=>({background:"#060810",border:"1px solid #1e2535",borderRadius:8,padding:"11px 14px",color:"#d4d8e8",fontFamily:"inherit",fontSize:16,outline:"none",width:"100%",...s});
  const smInp=(s={})=>({background:"#060810",border:"1px solid #1e2535",borderRadius:7,padding:"8px 11px",color:"#d4d8e8",fontFamily:"inherit",fontSize:15,outline:"none",...s});
  const kpiBox=(v,l,c)=>(
    <div key={l} style={{background:"#0d1117",border:"1px solid #1a2030",borderRadius:10,padding:"14px 16px"}}>
      <div style={{fontSize:13,color:"#444",marginBottom:6}}>{l}</div>
      <div style={{fontSize:22,fontWeight:500,color:c}}>{v}</div>
    </div>
  );

  const Cards = ({cs}) => cs.map(c=>(
    <CouponCard key={c.id} c={c}
      expanded={expand===c.id}
      onToggle={()=>setExpand(expand===c.id?null:c.id)}
      onWon={()=>mark(c.id,"won")}
      onLost={()=>mark(c.id,"lost")}
      onPending={()=>mark(c.id,"pending")}
      onCashout={(amt)=>markCashout(c.id,amt)}
      onEdit={()=>openEdit(c)}
      onDelete={()=>del(c.id)}/>
  ));

  const DayGroup = ({date,cs}) => {
    const dp=cs.filter(c=>c.status!=="pending").reduce((s,c)=>s+pnl(c,settings.taxRate||0),0);
    const hp=cs.some(c=>c.status==="pending");
    return(
      <div>
        <div style={{fontSize:14,color:"#444",margin:"18px 0 8px",display:"flex",justifyContent:"space-between"}}>
          <span>{date} · {cs.length} kup. · {cs.reduce((s,c)=>s+c.stake,0)} zł</span>
          {!hp&&<span style={{color:dp>=0?G:R,fontWeight:600}}>{fmt(dp)}</span>}
        </div>
        <Cards cs={cs}/>
      </div>
    );
  };

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
        .tap:active{opacity:.7;}
        .ach-off{opacity:.22;filter:grayscale(1);}
        .hov:hover{background:rgba(255,255,255,.03);}
      `}</style>

      {/* ── HEADER ── */}
      <div style={{background:"#0a0d14",borderBottom:"1px solid #1a2030",position:"sticky",top:0,zIndex:99,width:"100%"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 16px 8px"}}>
          <span style={{fontSize:18,fontWeight:500,letterSpacing:".1em",color:A}}>TAŚMA·TRACKER</span>
          <button className="tap" onClick={()=>showAdd?setShowAdd(false):openAdd()}
            style={{background:showAdd?"transparent":A,color:showAdd?A:"#080b0f",border:showAdd?`1px solid ${A}`:"none",borderRadius:8,padding:"9px 18px",fontSize:15,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>
            {showAdd?"✕ ZAMKNIJ":"+ KUPON"}
          </button>
        </div>
        <div style={{display:"flex",overflowX:"auto"}}>
          {[["today","DZIŚ"],["cal","KALENDARZ"],["stats","STATSY"],["ach","OSIĄG."],["cfg","⚙"]].map(([v,l])=>(
            <button key={v} className="tap" onClick={()=>setView(v)}
              style={{flexShrink:0,background:"none",border:"none",borderBottom:view===v?`2px solid ${A}`:"2px solid transparent",color:view===v?A:"#555",padding:"10px 14px",fontSize:13,fontWeight:600,cursor:"pointer",transition:"all .15s",whiteSpace:"nowrap"}}>
              {l}{v==="ach"&&earned.length>0&&<span style={{background:A,color:"#080b0f",borderRadius:10,padding:"1px 6px",fontSize:10,marginLeft:4,fontWeight:700}}>{earned.length}</span>}
            </button>
          ))}
        </div>
      </div>

      <div style={{padding:"16px",width:"100%"}}>

        {/* Alerts */}
        {alerts.map((al,i)=>(
          <div key={i} style={{background:al.type==="danger"?"rgba(220,50,50,.12)":al.type==="warn"?"rgba(240,165,0,.1)":"rgba(0,150,255,.08)",border:`1px solid ${al.type==="danger"?R:al.type==="warn"?A:"#1a4080"}`,borderRadius:9,padding:"11px 14px",marginBottom:10,fontSize:14,color:al.type==="danger"?R:al.type==="warn"?A:"#5a9fff"}}>
            {al.msg}
          </div>
        ))}

        {/* Goal bar */}
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

            <div style={{background:"rgba(0,200,80,.05)",border:"1px solid rgba(0,200,80,.15)",borderRadius:7,padding:"8px 12px",marginBottom:12,fontSize:13,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
              <span style={{color:"#555"}}>📊 Sugerowana stawka (1% bankrolla):</span>
              <button className="tap" onClick={()=>setForm(f=>({...f,stake:autoStake}))}
                style={{background:"rgba(0,200,80,.15)",border:"1px solid rgba(0,200,80,.3)",color:G,borderRadius:6,padding:"4px 12px",fontSize:13,fontWeight:700,cursor:"pointer"}}>
                {autoStake} zł
              </button>
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
                  onKeyDown={e=>e.key==="Enter"&&legRef.current?.focus()}
                  style={inp({fontSize:22,fontWeight:500,color:A})}/>
              </div>
            </div>
            <div style={{marginBottom:12}}>
              <div style={{fontSize:12,color:"#555",marginBottom:5}}>STATUS</div>
              <select value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))} style={inp()}>
                <option value="pending">⏳ Oczekujący</option>
                <option value="won">✅ Wygrany</option>
                <option value="lost">❌ Przegrany</option>
                <option value="cashout">💰 Cashout</option>
              </select>
            </div>

            {/* Cashout amount */}
            {form.status==="cashout"&&(
              <div style={{marginBottom:12}} className="fd">
                <div style={{fontSize:12,color:"#555",marginBottom:5}}>KWOTA CASHOUT (ZŁ)</div>
                <input type="number" step="0.01" placeholder="np. 35.50" value={form.cashoutAmount}
                  onChange={e=>setForm(f=>({...f,cashoutAmount:e.target.value}))}
                  style={inp({fontSize:20,fontWeight:500,color:"#00c850"})}/>
                {form.cashoutAmount&&form.stake&&(
                  <div style={{fontSize:13,color:"#555",marginTop:6}}>
                    Zysk z cashout: <b style={{color:+form.cashoutAmount-(form.isFreebet?0:+form.stake)>=0?"#00c850":"#dc3232"}}>{fmt((+form.cashoutAmount-(form.isFreebet?0:+form.stake))*(1-(settings.taxRate||0)/100))}</b>
                  </div>
                )}
              </div>
            )}

            {/* Freebet toggle */}
            <div style={{marginBottom:12,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
              <button className="tap" onClick={()=>setForm(f=>({...f,isFreebet:!f.isFreebet}))}
                style={{background:form.isFreebet?"rgba(0,150,255,.15)":"#060810",border:`1px solid ${form.isFreebet?"#1a6fff":"#1e2535"}`,color:form.isFreebet?"#5a9fff":"#666",borderRadius:8,padding:"9px 16px",fontSize:14,fontWeight:600,cursor:"pointer",transition:"all .15s"}}>
                🎟️ FREEBET {form.isFreebet?"✓":""}
              </button>
              {form.isFreebet&&(
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  <span style={{fontSize:12,color:"#555"}}>Typ freebeta:</span>
                  <button className="tap" onClick={()=>setForm(f=>({...f,freebetSR:false}))}
                    style={{background:!form.freebetSR?"rgba(0,150,255,.15)":"#060810",border:`1px solid ${!form.freebetSR?"#1a6fff":"#1e2535"}`,color:!form.freebetSR?"#5a9fff":"#666",borderRadius:6,padding:"6px 12px",fontSize:12,cursor:"pointer"}}>
                    SNR (bez stawki)
                  </button>
                  <button className="tap" onClick={()=>setForm(f=>({...f,freebetSR:true}))}
                    style={{background:form.freebetSR?"rgba(0,150,255,.15)":"#060810",border:`1px solid ${form.freebetSR?"#1a6fff":"#1e2535"}`,color:form.freebetSR?"#5a9fff":"#666",borderRadius:6,padding:"6px 12px",fontSize:12,cursor:"pointer"}}>
                    SR (ze stawką)
                  </button>
                </div>
              )}
            </div>
            {payPrev&&form.status!=="cashout"&&(
              <div style={{background:"rgba(240,165,0,.07)",border:"1px solid rgba(240,165,0,.18)",borderRadius:8,padding:"11px 14px",marginBottom:12,fontSize:14}}>
                {form.isFreebet?(
                  <>
                    <span style={{color:"#5a9fff",fontSize:12,fontWeight:600}}>🎟️ FREEBET</span>
                    {" · "}
                    <span style={{color:"#666"}}>Zysk netto: </span>
                    <b style={{color:G}}>+{((form.freebetSR?payPrev-+form.stake:(+form.odds-1)*+form.stake)*(1-(settings.taxRate||0)/100)).toFixed(2)} zł</b>
                    {settings.taxRate>0&&<span style={{fontSize:11,color:"#444"}}> (po {settings.taxRate}% podatku)</span>}
                  </>
                ):(
                  <>
                    <span style={{color:"#666"}}>Wygrana: </span><b style={{color:A}}>{payPrev.toFixed(2)} zł</b>
                    {"   "}
                    <span style={{color:"#666"}}>Zysk: </span>
                    <b style={{color:G}}>+{(profPrev*(1-(settings.taxRate||0)/100)).toFixed(2)} zł</b>
                    {settings.taxRate>0&&<span style={{fontSize:11,color:"#444"}}> (po {settings.taxRate}% podatku)</span>}
                  </>
                )}
              </div>
            )}
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
            </div>
          )}
          <div style={{fontSize:14,color:"#444",marginBottom:10}}>
            DZIŚ · {todayList.length} kuponów
            {todayList.filter(c=>c.status==="pending").length>0&&<span style={{color:A}}> · {todayList.filter(c=>c.status==="pending").length} oczekuje</span>}
          </div>
          {todayList.length===0&&<div style={{textAlign:"center",color:"#333",padding:"32px 0",fontSize:16}}>Brak kuponu na dziś.<br/><span style={{color:A,cursor:"pointer"}} onClick={openAdd}>+ KUPON</span></div>}
          <Cards cs={todayList}/>
          {Object.entries(histGrp).slice(0,5).map(([date,cs])=><DayGroup key={date} date={date} cs={cs}/>)}
        </>}

        {/* ── KALENDARZ ── */}
        {view==="cal"&&<>
          {/* Month navigation */}
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
            <button className="tap" onClick={()=>{
              const parts=calMonth.split("-");const y=parseInt(parts[0],10),m=parseInt(parts[1],10);
              const nd=new Date(y,m-2,1);
              setCalMonth(`${nd.getFullYear()}-${String(nd.getMonth()+1).padStart(2,"0")}`);
            }} style={{background:"#0d1117",border:"1px solid #1a2030",color:"#888",borderRadius:8,padding:"9px 16px",fontSize:16,cursor:"pointer"}}>‹</button>
            <span style={{fontSize:16,fontWeight:500,color:"#d4d8e8"}}>{MONTHS[calData.m-1]} {calData.y}</span>
            <button className="tap" onClick={()=>{
              const parts=calMonth.split("-");const y=parseInt(parts[0],10),m=parseInt(parts[1],10);
              const nd=new Date(y,m,1);
              setCalMonth(`${nd.getFullYear()}-${String(nd.getMonth()+1).padStart(2,"0")}`);
            }} style={{background:"#0d1117",border:"1px solid #1a2030",color:"#888",borderRadius:8,padding:"9px 16px",fontSize:16,cursor:"pointer"}}>›</button>
          </div>

          {/* Day header row */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3,marginBottom:3}}>
            {DAYS7.map(d=><div key={d} style={{textAlign:"center",fontSize:12,color:"#444",padding:"4px 0"}}>{d}</div>)}
          </div>

          {/* Day cells */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3,marginBottom:20}}>
            {calData.cells.map((cell,i)=>{
              if(!cell) return <div key={i}/>;
              const isToday=cell.date===todayISO();
              let bg="#0d1117",bdr="1px solid #1a2030",nc="#555";
              if(!cell.empty&&!cell.hp){
                bg=cell.dayPnl>0?"rgba(0,200,80,.15)":"rgba(220,50,50,.12)";
                bdr=`1px solid ${cell.dayPnl>0?"#0d3018":"#3a1010"}`;
                nc=cell.dayPnl>0?G:R;
              } else if(cell.hp){
                bg="rgba(240,165,0,.08)";bdr="1px solid rgba(240,165,0,.3)";nc=A;
              }
              if(isToday){bdr=`2px solid ${A}`;nc=A;}
              return(
                <div key={i} style={{background:bg,border:bdr,borderRadius:8,padding:"8px 4px",textAlign:"center",minHeight:52}}>
                  <div style={{fontSize:14,fontWeight:isToday?700:400,color:nc}}>{cell.d}</div>
                  {!cell.empty&&(
                    <div style={{fontSize:10,color:cell.dayPnl>=0?G:R,marginTop:2,fontWeight:600}}>
                      {cell.hp?"?":`${cell.dayPnl>=0?"+":""}${cell.dayPnl.toFixed(0)}`}
                    </div>
                  )}
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
                      if(!day) return <div key={di} style={{width:11,height:11}}/>;
                      let bg="#0f1520";
                      if(day.n>0){
                        if(day.hp) bg="rgba(240,165,0,.55)";
                        else if(day.p>0) bg=`rgba(0,200,80,${Math.min(.9,.3+day.p/100)})`;
                        else if(day.p<0) bg=`rgba(220,50,50,${Math.min(.9,.3+Math.abs(day.p)/100)})`;
                        else bg="#2a2a2a";
                      }
                      return <div key={di} style={{width:11,height:11,borderRadius:2,background:bg,flexShrink:0}}/>;
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
              <span>dużo</span>
              <span style={{marginLeft:6,color:A}}>■ oczekuje</span>
            </div>
          </div>
        </>}

        {/* ── STATSY ── */}
        {view==="stats"&&<>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
            {kpiBox(`${stats.bnow.toFixed(2)} zł`,"Bankroll",stats.bnow>=bankroll?G:R)}
            {kpiBox(fmt(stats.totalPnl),"Łączny P&L",stats.totalPnl>=0?G:R)}
            {kpiBox(`${stats.roi>=0?"+":""}${stats.roi.toFixed(1)}%`,"ROI",stats.roi>=0?G:R)}
            {kpiBox(`${stats.winRate.toFixed(1)}%`,"Win Rate","#d4d8e8")}
            {kpiBox(`${stats.won}W / ${stats.lost}P`,"Wygrane/Przeg.","#d4d8e8")}
            {kpiBox(`${stats.staked.toFixed(0)} zł`,"Łącznie postawione","#888")}
          </div>

          {/* Bankroll vs streak */}
          {stats.brHistory.length>2&&(()=>{
            const pts=stats.brHistory;
            const vals=pts.map(p=>p.v);
            const mn=Math.min(...vals),mx=Math.max(...vals),rng=mx-mn||1;
            const H=120,W=pts.length;
            const py=v=>H-((v-mn)/rng)*(H-18)-9;
            return(
              <div style={{background:"#0d1117",border:"1px solid #1a2030",borderRadius:10,padding:"16px",marginBottom:14}}>
                <div style={{fontSize:14,color:"#444",marginBottom:3}}>📉 BANKROLL vs SERIA PRZEGRANYCH</div>
                <div style={{fontSize:11,color:"#333",marginBottom:10}}>Ciemniejsze czerwone tło = dłuższa seria przegranych</div>
                <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{height:120,display:"block"}}>
                  {pts.map((p,i)=>p.st<0?(
                    <rect key={i} x={i} y={0} width={1} height={H} fill={`rgba(220,50,50,${Math.min(.4,.04*Math.abs(p.st))})`}/>
                  ):null)}
                  <line x1="0" y1={py(bankroll)} x2={W} y2={py(bankroll)} stroke="#1a2030" strokeWidth=".5" strokeDasharray="3,3" vectorEffect="non-scaling-stroke"/>
                  {pts.map((p,i)=>i===0?null:(
                    <line key={i} x1={i-1} y1={py(pts[i-1].v)} x2={i} y2={py(p.v)}
                      stroke={p.v>=bankroll?G:R} strokeWidth="1.5" vectorEffect="non-scaling-stroke"/>
                  ))}
                </svg>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:13,color:"#444",marginTop:8}}>
                  <span>Start: {bankroll} zł</span>
                  <span style={{color:stats.bnow>=bankroll?G:R,fontWeight:600}}>Teraz: {stats.bnow.toFixed(0)} zł</span>
                </div>
              </div>
            );
          })()}

          {/* Monthly comparison */}
          {Object.keys(stats.monthly).length>0&&(()=>{
            const months=Object.entries(stats.monthly).sort((a,b)=>a[0].localeCompare(b[0]));
            const maxA=Math.max(...months.map(([,d])=>Math.abs(d.p)),1);
            return(
              <div style={{background:"#0d1117",border:"1px solid #1a2030",borderRadius:10,padding:"16px",marginBottom:14}}>
                <div style={{fontSize:14,color:"#444",marginBottom:12}}>⚖️ PORÓWNANIE MIESIĘCY</div>
                {months.map(([mo,d])=>(
                  <div key={mo} style={{marginBottom:10}}>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:4,gap:4,flexWrap:"wrap"}}>
                      <span style={{color:"#888"}}>{mo}</span>
                      <span style={{color:"#555",fontSize:12}}>{d.t} kup. · {d.w}W/{d.t-d.w}P · {d.stk.toFixed(0)} zł</span>
                      <span style={{color:d.p>=0?G:R,fontWeight:600}}>{fmt(d.p)}</span>
                    </div>
                    <div style={{background:"#060810",borderRadius:4,height:10,overflow:"hidden"}}>
                      <div style={{width:`${(Math.abs(d.p)/maxA)*100}%`,height:"100%",background:d.p>=0?G:R,borderRadius:4}}/>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Day of week */}
          <div style={{background:"#0d1117",border:"1px solid #1a2030",borderRadius:10,padding:"16px",marginBottom:14}}>
            <div style={{fontSize:14,color:"#444",marginBottom:12}}>📈 SKUTECZNOŚĆ PO DNIU TYGODNIA</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:6}}>
              {DAYS7.map((d,i)=>{
                const dd=stats.dow[(i+1)%7];
                const wr=dd.t>0?(dd.w/dd.t)*100:null;
                return(
                  <div key={d} style={{textAlign:"center"}}>
                    <div style={{fontSize:12,color:"#444",marginBottom:4}}>{DAYS7[(i)%7]}</div>
                    <div style={{background:"#060810",borderRadius:6,height:50,display:"flex",alignItems:"flex-end",justifyContent:"center",overflow:"hidden",marginBottom:4}}>
                      {dd.t>0&&<div style={{width:"70%",background:wr>=50?G:R,borderRadius:"4px 4px 0 0",height:`${Math.max(10,wr)}%`}}/>}
                    </div>
                    <div style={{fontSize:11,color:dd.t>0?(wr>=50?G:R):"#333",fontWeight:600}}>{dd.t>0?`${wr.toFixed(0)}%`:"—"}</div>
                    <div style={{fontSize:10,color:"#333"}}>{dd.t>0?`${dd.w}/${dd.t}`:""}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Legs analysis */}
          <div style={{background:"#0d1117",border:"1px solid #1a2030",borderRadius:10,padding:"16px",marginBottom:14}}>
            <div style={{fontSize:14,color:"#444",marginBottom:12}}>📊 DŁUGOŚĆ TAŚMY vs SKUTECZNOŚĆ</div>
            {Object.keys(stats.legsBuckets).length===0&&<div style={{fontSize:14,color:"#333"}}>Brak danych — dodaj zdarzenia do kuponów.</div>}
            {Object.entries(stats.legsBuckets).sort((a,b)=>a[0].localeCompare(b[0])).map(([b,d])=>{
              const wr=d.t>0?(d.w/d.t)*100:0;
              return(
                <div key={b} style={{padding:"10px 0",borderBottom:"1px solid #0f1520"}}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <span style={{fontSize:14,width:72,flexShrink:0,color:"#d4d8e8"}}>{b}</span>
                    <div style={{flex:1,background:"#060810",borderRadius:4,height:8,overflow:"hidden"}}>
                      <div style={{width:`${wr}%`,height:"100%",background:wr>=30?G:R,borderRadius:4}}/>
                    </div>
                    <span style={{fontSize:13,color:wr>=30?G:R,width:36,textAlign:"right"}}>{wr.toFixed(0)}%</span>
                    <span style={{fontSize:12,color:"#444",width:46,textAlign:"right"}}>{d.w}/{d.t}</span>
                    <span style={{fontSize:13,fontWeight:600,color:d.p>=0?G:R,minWidth:80,textAlign:"right"}}>{fmt(d.p)}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Kelly */}
          <div style={{background:"#0d1117",border:"1px solid #1a2030",borderRadius:10,padding:"16px",marginBottom:14}}>
            <div style={{fontSize:14,color:"#444",marginBottom:3}}>🧮 KALKULATOR KELLY</div>
            <div style={{fontSize:11,color:"#333",marginBottom:12}}>Domyślny win rate: historyczny ({stats.winRate.toFixed(1)}%)</div>
            <div style={{display:"flex",gap:10,marginBottom:12,flexWrap:"wrap"}}>
              <div style={{flex:1,minWidth:110}}>
                <div style={{fontSize:12,color:"#555",marginBottom:5}}>Kurs kuponu</div>
                <input type="number" step="0.01" value={kOdds} onChange={e=>{setKOdds(e.target.value);setUsedKelly(true);}} style={inp({fontSize:18,color:A})}/>
              </div>
              <div style={{flex:1,minWidth:140}}>
                <div style={{fontSize:12,color:"#555",marginBottom:5}}>P. wygranej % (opcjonalnie)</div>
                <input type="number" placeholder={`auto: ${stats.winRate.toFixed(1)}%`} value={kWinP} onChange={e=>{setKWinP(e.target.value);setUsedKelly(true);}} style={inp({fontSize:16})}/>
              </div>
            </div>
            {kelly&&(
              <div style={{background:"rgba(240,165,0,.07)",border:"1px solid rgba(240,165,0,.2)",borderRadius:8,padding:"14px"}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:kelly&&+kelly.edge<=0?10:0}}>
                  {[{l:"Pełne Kelly",v:`${kelly.full}% bankrolla`,c:A},{l:"¼ Kelly (bezpieczne)",v:`${kelly.quarter}%`,c:G},{l:"Sugerowana stawka",v:`${kelly.stake} zł`,c:G},{l:"Twoja przewaga",v:`${kelly.edge}%`,c:+kelly.edge>0?G:R}].map(({l,v,c})=>(
                    <div key={l}><div style={{fontSize:11,color:"#444",marginBottom:3}}>{l}</div><div style={{fontSize:16,fontWeight:600,color:c}}>{v}</div></div>
                  ))}
                </div>
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
            {calcOdds&&(
              <div style={{background:"rgba(240,165,0,.07)",border:"1px solid rgba(240,165,0,.2)",borderRadius:8,padding:"12px 14px"}}>
                <span style={{color:"#666"}}>Kurs łączny: </span><b style={{color:A,fontSize:22}}>{calcOdds}</b>
                <div style={{fontSize:12,color:"#444",marginTop:6}}>Przy {autoStake} zł → wygrana: <b style={{color:G}}>{(+calcOdds * +autoStake).toFixed(2)} zł</b></div>
              </div>
            )}
          </div>

          {/* Export / Import */}
          <div style={{background:"#0d1117",border:"1px solid #1a2030",borderRadius:10,padding:"16px",marginBottom:14}}>
            <div style={{fontSize:14,color:"#444",marginBottom:12}}>📤 EKSPORT / IMPORT</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              <button className="tap" onClick={()=>jsonExport({coupons,bankroll,settings,withdrawals,templates})}
                style={{flex:1,minWidth:140,background:"rgba(0,200,80,.1)",border:"1px solid rgba(0,200,80,.3)",color:"#00c850",borderRadius:8,padding:"12px",fontSize:14,fontWeight:600,cursor:"pointer"}}>
                💾 Backup JSON
              </button>
              <button className="tap" onClick={()=>csvExport(coupons)}
                style={{flex:1,minWidth:140,background:"rgba(0,150,255,.1)",border:"1px solid rgba(0,150,255,.3)",color:"#5a9fff",borderRadius:8,padding:"12px",fontSize:14,fontWeight:600,cursor:"pointer"}}>
                📊 Eksport CSV
              </button>
              <button className="tap" onClick={()=>importRef.current?.click()}
                style={{flex:1,minWidth:140,background:"rgba(240,165,0,.1)",border:"1px solid rgba(240,165,0,.3)",color:"#f0a500",borderRadius:8,padding:"12px",fontSize:14,fontWeight:600,cursor:"pointer"}}>
                📥 Import JSON
              </button>
            </div>
            <input ref={importRef} type="file" accept=".json" style={{display:"none"}}
              onChange={e=>{if(e.target.files[0])jsonImport(e.target.files[0],{setCoupons,setBankroll,setSettings,setWithdrawals,setTemplates});e.target.value="";}}/>
            <div style={{fontSize:11,color:"#333",marginTop:10}}>
              💾 Backup JSON — pełna kopia wszystkich danych (kupony, ustawienia, szablony, wypłaty)<br/>
              📊 CSV — do Excela/Arkuszy<br/>
              📥 Import — wczytaj plik .json z poprzedniego backupu
            </div>
          </div>
        </>}

        {/* ── OSIĄGNIĘCIA ── */}
        {view==="ach"&&<>
          <div style={{fontSize:14,color:"#444",marginBottom:4}}>OSIĄGNIĘCIA · {earned.length}/{ACH.length}</div>
          <div style={{background:"#060810",borderRadius:6,height:8,overflow:"hidden",marginBottom:16}}>
            <div style={{width:`${(earned.length/ACH.length)*100}%`,height:"100%",background:A,borderRadius:6,transition:"width .5s"}}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            {ACH.map(a=>{
              const done=earned.includes(a.id);
              return(
                <div key={a.id} className={done?"":"ach-off"} style={{background:done?"rgba(240,165,0,.07)":"#0d1117",border:`1px solid ${done?"rgba(240,165,0,.3)":"#1a2030"}`,borderRadius:10,padding:"14px"}}>
                  <div style={{fontSize:26,marginBottom:6}}>{a.icon}</div>
                  <div style={{fontSize:14,fontWeight:600,color:done?A:"#555",marginBottom:3}}>{a.name}</div>
                  <div style={{fontSize:12,color:"#333"}}>{a.desc}</div>
                  {done&&<div style={{fontSize:11,color:G,marginTop:6}}>✓ Odblokowane</div>}
                </div>
              );
            })}
          </div>
        </>}

        {/* ── USTAWIENIA ── */}
        {view==="cfg"&&<>
          <div style={{fontSize:16,fontWeight:500,color:"#d4d8e8",marginBottom:16}}>Ustawienia</div>

          {/* Tax rate */}
          <div style={{background:"#0d1117",border:"1px solid #1a2030",borderRadius:10,padding:"14px 16px",marginBottom:10}}>
            <div style={{fontSize:15,color:"#d4d8e8",marginBottom:3}}>🧾 Podatek od wygranej (%)</div>
            <div style={{fontSize:12,color:"#444",marginBottom:8}}>Odliczany od zysku przy obliczeniach (PL: 10% powyżej 2280 zł, ustaw 0 jeśli buk potrąca sam)</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {[0,10,12].map(v=>(
                <button key={v} className="tap" onClick={()=>setSettings(s=>({...s,taxRate:v}))}
                  style={{background:settings.taxRate===v?"rgba(240,165,0,.15)":"#060810",border:`1px solid ${settings.taxRate===v?A:"#1e2535"}`,color:settings.taxRate===v?A:"#666",borderRadius:7,padding:"8px 14px",fontSize:14,fontWeight:600,cursor:"pointer"}}>
                  {v}%
                </button>
              ))}
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <input type="number" min="0" max="99" value={settings.taxRate} onChange={e=>setSettings(s=>({...s,taxRate:+e.target.value}))}
                  style={{...smInp(),color:A,width:80,fontSize:16}}/>
                <span style={{fontSize:14,color:"#666"}}>%</span>
              </div>
            </div>
          </div>

          {[{k:"goalBankroll",l:"🎯 Cel bankrolla (zł)",d:"Do jakiej kwoty chcesz dobić"},{k:"dayLoss",l:"⚠️ Dzienny limit straty (zł)",d:"Alert gdy przekroczysz w ciągu dnia"},{k:"weekLoss",l:"⚠️ Tygodniowy limit straty (zł)",d:"Alert gdy przekroczysz w ciągu tygodnia"}].map(({k,l,d})=>(
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
            <div style={{fontSize:12,color:"#444",marginBottom:8}}>Kwota z jaką zacząłeś</div>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <input type="number" value={bankroll} onChange={e=>setBankroll(+e.target.value)} style={{...smInp(),color:A,width:130,fontSize:18}}/>
              <span style={{fontSize:15,color:"#666"}}>zł</span>
            </div>
          </div>

          {/* Withdrawals */}
          <div style={{background:"#0d1117",border:"1px solid #1a2030",borderRadius:10,padding:"14px 16px",marginBottom:10}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
              <div>
                <div style={{fontSize:15,color:"#d4d8e8"}}>💸 Historia wypłat</div>
                <div style={{fontSize:12,color:"#444",marginTop:2}}>Łącznie: <b style={{color:G}}>{stats.totalW.toFixed(2)} zł</b></div>
              </div>
              <button className="tap" onClick={()=>setShowWd(s=>!s)}
                style={{background:"rgba(0,200,80,.12)",border:"1px solid rgba(0,200,80,.3)",color:G,borderRadius:7,padding:"7px 12px",fontSize:13,fontWeight:700,cursor:"pointer"}}>+ WYPŁATA</button>
            </div>
            {showWd&&(
              <div className="fd" style={{background:"#060810",borderRadius:8,padding:"12px",marginBottom:10}}>
                <div style={{display:"flex",gap:8,marginBottom:8,flexWrap:"wrap"}}>
                  <input type="date" value={wdForm.date} onChange={e=>setWdForm(f=>({...f,date:e.target.value}))} style={smInp()}/>
                  <input type="number" placeholder="Kwota (zł)" value={wdForm.amount} onChange={e=>setWdForm(f=>({...f,amount:e.target.value}))} style={{...smInp(),color:G,width:120}}/>
                  <input placeholder="Notatka" value={wdForm.note} onChange={e=>setWdForm(f=>({...f,note:e.target.value}))} style={{...smInp(),color:"#888",flex:1}}/>
                </div>
                <button className="tap" onClick={saveWd} style={{background:G,color:"#080b0f",border:"none",borderRadius:7,padding:"9px 18px",fontSize:14,fontWeight:700,cursor:"pointer"}}>ZAPISZ</button>
              </div>
            )}
            {withdrawals.length===0&&<div style={{fontSize:13,color:"#333"}}>Brak wypłat.</div>}
            {[...withdrawals].reverse().map(w=>(
              <div key={w.id} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 0",borderBottom:"1px solid #0f1520"}}>
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
              <div style={{fontSize:15,color:"#d4d8e8"}}>⭐ Szablony kuponów</div>
              <button className="tap" onClick={()=>setShowTpl(s=>!s)}
                style={{background:"rgba(240,165,0,.12)",border:"1px solid rgba(240,165,0,.3)",color:A,borderRadius:7,padding:"7px 12px",fontSize:13,fontWeight:700,cursor:"pointer"}}>+ SZABLON</button>
            </div>
            {showTpl&&(
              <div className="fd" style={{background:"#060810",borderRadius:8,padding:"12px",marginBottom:10}}>
                <div style={{display:"flex",gap:8,marginBottom:8,flexWrap:"wrap"}}>
                  <input placeholder="Nazwa szablonu" value={tplForm.name} onChange={e=>setTplForm(f=>({...f,name:e.target.value}))} style={{...smInp(),flex:2}}/>
                  <select value={tplForm.bk} onChange={e=>setTplForm(f=>({...f,bk:e.target.value}))} style={smInp()}>
                    {BKM.map(b=><option key={b}>{b}</option>)}
                  </select>
                </div>
                <div style={{display:"flex",gap:8,marginBottom:8}}>
                  <input type="number" placeholder="Stawka" value={tplForm.stake} onChange={e=>setTplForm(f=>({...f,stake:e.target.value}))} style={{...smInp(),width:100}}/>
                  <input type="number" step="0.01" placeholder="Kurs (opcjonalnie)" value={tplForm.odds} onChange={e=>setTplForm(f=>({...f,odds:e.target.value}))} style={{...smInp(),color:A,width:140}}/>
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

          {/* Full history */}
          <div style={{background:"#0d1117",border:"1px solid #1a2030",borderRadius:10,padding:"14px 16px"}}>
            <div style={{fontSize:15,color:"#d4d8e8",marginBottom:10}}>📋 Historia · {coupons.length} kuponów</div>
            {Object.entries(grpByDate(coupons)).map(([date,cs])=><DayGroup key={date} date={date} cs={cs}/>)}
          </div>
        </>}
      </div>
    </div>
  );
}

// ── Coupon Card ───────────────────────────────────────────────────────────────
function CouponCard({c,expanded,onToggle,onWon,onLost,onPending,onCashout,onEdit,onDelete}){
  const [showCO, setShowCO] = useState(false);
  const [coAmt, setCoAmt] = useState("");
  const p=pnl(c);
  const A="#f0a500",G="#00c850",R="#dc3232";
  const co=c.status==="cashout";
  const sc={won:G,lost:R,pending:A,cashout:"#00c8c8"}[c.status]||"#555";
  const sbg={won:"rgba(0,200,80,.06)",lost:"rgba(220,50,50,.05)",pending:"rgba(240,165,0,.08)",cashout:"rgba(0,200,200,.06)"}[c.status]||"#0d1117";
  const sbd={won:"#0d2e1a",lost:"#2a1010",pending:"rgba(240,165,0,.5)",cashout:"#0d2e2e"}[c.status]||"#1a2030";
  const isPending=c.status==="pending";
  return(
    <div className={isPending?"pc":""} style={{background:sbg,border:`${isPending?"2px":"1px"} solid ${sbd}`,borderRadius:10,marginBottom:8,overflow:"hidden",width:"100%"}}>
      {isPending&&(
        <div style={{background:"rgba(240,165,0,.12)",borderBottom:"1px solid rgba(240,165,0,.25)",padding:"5px 14px",display:"flex",alignItems:"center",gap:8}}>
          <div className="pd" style={{width:7,height:7,borderRadius:"50%",background:A,flexShrink:0}}/>
          <span style={{fontSize:12,color:A,fontWeight:600,letterSpacing:".08em"}}>OCZEKUJE NA ROZLICZENIE</span>
        </div>
      )}
      <div className="hov" onClick={onToggle} style={{padding:"13px 14px",display:"flex",alignItems:"center",gap:8,cursor:"pointer"}}>
        <div style={{width:9,height:9,borderRadius:"50%",background:sc,boxShadow:`0 0 6px ${sc}80`,flexShrink:0}}/>
        <span style={{fontSize:13,color:"#555",width:c.isFreebet?50:70,flexShrink:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.bk}</span>
        {c.isFreebet&&<span style={{background:"rgba(0,150,255,.18)",color:"#5a9fff",borderRadius:4,padding:"2px 5px",fontSize:10,fontWeight:700,flexShrink:0,letterSpacing:".04em"}}>FREE</span>}
        {c.isFreebet&&<span style={{background:"rgba(0,150,255,.15)",color:"#5a9fff",borderRadius:4,padding:"1px 5px",fontSize:10,fontWeight:700,flexShrink:0}}>FB</span>}
        <span style={{flex:1,fontSize:15,color:"#7a8499",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0}}>{c.note||"—"}</span>
        <span style={{background:"rgba(240,165,0,.12)",color:A,borderRadius:6,padding:"3px 9px",fontSize:14,fontWeight:600,flexShrink:0,whiteSpace:"nowrap"}}>
          ×{c.odds>=10000?c.odds.toLocaleString():c.odds.toFixed(2)}
        </span>
        <span style={{fontSize:15,fontWeight:500,color:"#d4d8e8",flexShrink:0,width:46,textAlign:"right"}}>{c.stake}zł</span>
        {!isPending&&(
          <span style={{background:co?"rgba(0,200,200,.15)":p>0?"rgba(0,200,80,.15)":"rgba(220,50,50,.15)",color:co?"#00c8c8":p>0?G:R,borderRadius:6,padding:"3px 9px",fontSize:14,fontWeight:600,flexShrink:0,whiteSpace:"nowrap"}}>
            {co?`CO: ${(c.cashoutAmount||0)}zł`:`${p>=0?"+":""}${p.toFixed(0)}zł`}
          </span>
        )}
        <span style={{fontSize:12,color:"#333",flexShrink:0}}>{expanded?"▲":"▼"}</span>
        <button onClick={e=>{e.stopPropagation();onDelete();}} style={{background:"none",border:"none",color:"#2a2a2a",fontSize:20,cursor:"pointer",padding:"0 2px",flexShrink:0,lineHeight:1}}>✕</button>
      </div>
      {expanded&&c.legs.length>0&&c.legs.map((l,i)=>(
        <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"9px 14px",borderTop:"1px solid rgba(0,0,0,.3)"}}>
          <span style={{fontSize:13,color:"#333",width:20,textAlign:"right"}}>{i+1}.</span>
          <span style={{flex:1,fontSize:15,color:"#666"}}>{l.m}</span>
          <span style={{fontSize:15,color:A,fontWeight:600}}>{l.s}</span>
        </div>
      ))}
      {expanded&&(
        <div style={{padding:"9px 14px",borderTop:"1px solid rgba(0,0,0,.3)",display:"flex",gap:20,fontSize:14,color:"#444",flexWrap:"wrap"}}>
          <span>Wygrana: <b style={{color:A}}>{(c.odds*c.stake).toFixed(2)} zł</b></span>
          <span>Zysk: <b style={{color:G}}>+{((c.odds-1)*c.stake).toFixed(2)} zł</b></span>
          <span style={{marginLeft:"auto",color:"#333"}}>{c.date}</span>
        </div>
      )}
      <div style={{padding:"0 12px 12px",display:"flex",gap:6}}>
        {isPending&&<>
          <button onClick={onWon}  style={{flex:1,background:"rgba(0,200,80,.14)",border:"1px solid #0d3018",color:G,borderRadius:7,padding:"10px",fontSize:13,fontWeight:700,cursor:"pointer"}}>✓ WYGRANY</button>
          <button onClick={onLost} style={{flex:1,background:"rgba(220,50,50,.12)",border:"1px solid #3a1010",color:R,borderRadius:7,padding:"10px",fontSize:13,fontWeight:700,cursor:"pointer"}}>✗ PRZEGRANY</button>
          <button onClick={()=>setShowCO(s=>!s)} style={{background:showCO?"rgba(0,200,200,.25)":"rgba(0,200,200,.12)",border:"1px solid #0d2e2e",color:"#00c8c8",borderRadius:7,padding:"10px 8px",fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>💰 CO</button>
        </>}
        {!isPending&&<button onClick={onPending} style={{background:"rgba(240,165,0,.08)",border:"1px solid rgba(240,165,0,.2)",color:A,borderRadius:7,padding:"10px 14px",fontSize:14,fontWeight:600,cursor:"pointer"}}>↩ COFNIJ</button>}
        <button onClick={e=>{e.stopPropagation();onEdit();}} style={{background:"none",border:"1px solid #1a2030",color:"#555",borderRadius:7,padding:"10px 14px",fontSize:14,cursor:"pointer"}}>✏ EDYTUJ</button>
      </div>
      {showCO&&isPending&&(
        <div style={{padding:"0 12px 12px",display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          <span style={{fontSize:13,color:"#00c8c8"}}>Kwota cashout:</span>
          <input type="number" step="0.01" placeholder="np. 35.50" value={coAmt} onChange={e=>setCoAmt(e.target.value)}
            style={{background:"#060810",border:"1px solid #0d2e2e",borderRadius:7,padding:"8px 12px",color:"#00c8c8",fontFamily:"inherit",fontSize:15,outline:"none",width:120}}/>
          <button onClick={()=>{if(coAmt)onCashout(+coAmt);setShowCO(false);setCoAmt("");}}
            style={{background:"rgba(0,200,200,.2)",border:"1px solid #0d2e2e",color:"#00c8c8",borderRadius:7,padding:"8px 14px",fontFamily:"inherit",fontSize:13,fontWeight:700,cursor:"pointer"}}>
            ZATWIERDŹ
          </button>
          <span style={{fontSize:12,color:"#444"}}>Zysk: <b style={{color:+coAmt-(c.isFreebet?0:c.stake)>=0?"#00c8c8":"#dc3232"}}>{coAmt?`${(+coAmt-(c.isFreebet?0:c.stake))>=0?"+":""}${(+coAmt-(c.isFreebet?0:c.stake)).toFixed(2)} zł`:""}</b></span>
        </div>
      )}
    </div>
  );
}
