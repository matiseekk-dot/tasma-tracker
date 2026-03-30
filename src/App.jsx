import { useState, useMemo, useRef, useEffect } from "react";

const BOOKMAKERS = ["Superbet","Fortuna","STS","Betclic","LVBet","Betfan","Totolotek"];
const SK  = "tasma_coupons";
const BK  = "tasma_bankroll";
const SK2 = "tasma_settings";
const today = () => new Date().toISOString().slice(0,10);
const fmtPLN = (n) => `${n>=0?"+":""}${n.toFixed(2)} zł`;
const calcPnl = (c) => c.status==="won" ? c.odds*c.stake-c.stake : c.status==="lost" ? -c.stake : 0;
const DAY_NAMES = ["Nd","Pn","Wt","Śr","Cz","Pt","Sb"];

const SEED = [
  {id:1,  date:"2026-03-23",bk:"Superbet",stake:15,odds:81.78,  legs:[],status:"lost",note:"Taśma #21 · 19 zd."},
  {id:2,  date:"2026-03-22",bk:"Superbet",stake:15,odds:122.24, legs:[],status:"lost",note:"Taśma #20 · 16 zd."},
  {id:3,  date:"2026-03-22",bk:"Superbet",stake:15,odds:124.17, legs:[],status:"lost",note:"Taśma #19 · 20 zd."},
  {id:4,  date:"2026-03-22",bk:"Superbet",stake:15,odds:91.28,  legs:[],status:"lost",note:"Taśma #18 · 18 zd."},
  {id:5,  date:"2026-03-21",bk:"Superbet",stake:15,odds:71.63,  legs:[],status:"lost",note:"Taśma #17 · 16 zd."},
  {id:6,  date:"2026-03-21",bk:"STS",     stake:15,odds:125.89, legs:[],status:"lost",note:"Taśma #16 · 21 zd."},
  {id:7,  date:"2026-03-19",bk:"Superbet",stake:15,odds:54.26,  legs:[],status:"lost",note:"Taśma #15 · 13 zd."},
  {id:8,  date:"2026-03-18",bk:"Superbet",stake:15,odds:93.28,  legs:[],status:"lost",note:"Taśma #14 · 25 zd."},
  {id:9,  date:"2026-03-18",bk:"Superbet",stake:15,odds:21.59,  legs:[],status:"lost",note:"Taśma #13 · 23 zd."},
  {id:10, date:"2026-03-17",bk:"Superbet",stake:2, odds:278460, legs:[],status:"lost",note:"Taśma #12 · 5 zd."},
  {id:11, date:"2026-03-17",bk:"Superbet",stake:15,odds:55.00,  legs:[],status:"won", note:"Taśma #11 · 28 zd."},
  {id:12, date:"2026-03-17",bk:"Superbet",stake:5, odds:2003.59,legs:[],status:"lost",note:"Taśma #10 · 32 zd."},
  {id:13, date:"2026-03-16",bk:"Superbet",stake:15,odds:586.76, legs:[],status:"lost",note:"Taśma #9 · 26 zd."},
  {id:14, date:"2026-03-15",bk:"Superbet",stake:15,odds:84.81,  legs:[],status:"lost",note:"Taśma #8 · 15 zd."},
  {id:15, date:"2026-03-15",bk:"Superbet",stake:15,odds:84.48,  legs:[],status:"lost",note:"Taśma #7 · 17 zd."},
  {id:16, date:"2026-03-14",bk:"Superbet",stake:15,odds:143.00, legs:[],status:"lost",note:"Taśma #6 · 19 zd."},
  {id:17, date:"2026-03-13",bk:"Superbet",stake:15,odds:165.00, legs:[],status:"lost",note:"Taśma #5 · 19 zd."},
  {id:18, date:"2026-03-13",bk:"Superbet",stake:15,odds:154.70, legs:[],status:"lost",note:"Taśma #4 · 22 zd."},
  {id:19, date:"2026-03-11",bk:"Superbet",stake:15,odds:112.35, legs:[],status:"lost",note:"Taśma #3 · 19 zd."},
  {id:20, date:"2026-03-12",bk:"Superbet",stake:15,odds:132.33, legs:[],status:"lost",note:"Taśma #2 · 21 zd."},
  {id:21, date:"2026-03-06",bk:"Superbet",stake:15,odds:372.56, legs:[],status:"lost",note:"Taśma #1 · 24 zd."},
];

// localStorage helpers
const lsGet = (key, fallback) => {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
};
const lsSet = (key, val) => {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
};

const grp = (arr) => {
  const g = {};
  [...arr].sort((a,b)=>b.date.localeCompare(a.date)).forEach(c=>{
    if(!g[c.date]) g[c.date]=[];
    g[c.date].push(c);
  });
  return g;
};

const exportCSV = (coupons) => {
  const header = "Data,Bukmacher,Notatka,Kurs,Stawka,Status,P&L";
  const rows = coupons.map(c =>
    [c.date, c.bk, `"${c.note}"`, c.odds, c.stake, c.status, calcPnl(c).toFixed(2)].join(",")
  );
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], {type:"text/csv;charset=utf-8;"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href=url; a.download="tasma_tracker.csv"; a.click();
  URL.revokeObjectURL(url);
};

export default function App() {
  const [coupons,  setCoupons]  = useState(() => lsGet(SK, SEED));
  const [bankroll, setBankroll] = useState(() => lsGet(BK, 500));
  const [settings, setSettings] = useState(() => lsGet(SK2, { goalBankroll:2000, dayLossLimit:50, weekLossLimit:150 }));
  const [view,     setView]     = useState("today");
  const [showAdd,  setShowAdd]  = useState(false);
  const [editId,   setEditId]   = useState(null);
  const [expand,   setExpand]   = useState(null);
  const [calMonth, setCalMonth] = useState(today().slice(0,7));
  const [calcLegs, setCalcLegs] = useState("10");
  const [calcAvg,  setCalcAvg]  = useState("1.50");

  const isFirst = useRef(true);

  // Save on change (skip very first render)
  useEffect(() => {
    if (isFirst.current) { isFirst.current = false; return; }
    lsSet(SK, coupons);
  }, [coupons]);
  useEffect(() => { lsSet(BK,  bankroll);  }, [bankroll]);
  useEffect(() => { lsSet(SK2, settings);  }, [settings]);

  const blank = { date:today(), bk:"Superbet", stake:"15", odds:"", legs:[], note:"", status:"pending" };
  const [form, setForm] = useState(blank);
  const [legM, setLegM] = useState(""); const [legS, setLegS] = useState("");
  const stakeRef=useRef(); const oddsRef=useRef(); const legRef=useRef();

  useEffect(()=>{ if(showAdd) setTimeout(()=>stakeRef.current?.focus(),60); },[showAdd]);

  const openAdd  = ()=>{ setEditId(null); setForm(blank); setLegM(""); setLegS(""); setShowAdd(true); };
  const openEdit = (c)=>{ setForm({...c,stake:String(c.stake),odds:String(c.odds)}); setEditId(c.id); setShowAdd(true); };
  const saveForm = ()=>{
    if(!form.odds||!form.stake) return;
    const obj={...form,stake:+form.stake,odds:+form.odds};
    if(editId){setCoupons(p=>p.map(c=>c.id===editId?{...obj,id:editId}:c));setEditId(null);}
    else{setCoupons(p=>[...p,{...obj,id:Date.now()}]);}
    setForm(blank);setLegM("");setLegS("");setShowAdd(false);
  };
  const addLeg=()=>{
    if(!legM.trim())return;
    setForm(f=>({...f,legs:[...f.legs,{m:legM.trim(),s:legS.trim()}]}));
    setLegM("");setLegS("");setTimeout(()=>legRef.current?.focus(),0);
  };
  const mark=(id,st)=>setCoupons(p=>p.map(c=>c.id===id?{...c,status:st}:c));
  const del=(id)=>setCoupons(p=>p.filter(c=>c.id!==id));

  const stats = useMemo(()=>{
    const settled=coupons.filter(c=>c.status!=="pending");
    const won=coupons.filter(c=>c.status==="won");
    const staked=settled.reduce((s,c)=>s+c.stake,0);
    const totalPnl=settled.reduce((s,c)=>s+calcPnl(c),0);
    const roi=staked>0?(totalPnl/staked)*100:0;
    const bnow=bankroll+totalPnl;
    const todayCs=coupons.filter(c=>c.date===today()&&c.status!=="pending");
    const todayPnl=todayCs.reduce((s,c)=>s+calcPnl(c),0);
    const weekAgo=new Date(); weekAgo.setDate(weekAgo.getDate()-7);
    const weekCs=settled.filter(c=>new Date(c.date)>=weekAgo);
    const weekPnl=weekCs.reduce((s,c)=>s+calcPnl(c),0);
    let streak=0;
    for(const c of [...coupons].sort((a,b)=>b.date.localeCompare(a.date))){
      if(c.status==="pending") continue;
      if(!streak){streak=c.status==="won"?1:-1;continue;}
      if((streak>0&&c.status==="won")||(streak<0&&c.status==="lost"))streak+=streak>0?1:-1; else break;
    }
    const legsData={};
    settled.forEach(c=>{
      const n=c.legs.length||0;
      const bucket=n===0?"brak danych":n<=5?"1–5":n<=10?"6–10":n<=15?"11–15":n<=20?"16–20":n<=25?"21–25":"26+";
      if(!legsData[bucket])legsData[bucket]={won:0,total:0,pnl:0};
      legsData[bucket].total++;
      if(c.status==="won")legsData[bucket].won++;
      legsData[bucket].pnl+=calcPnl(c);
    });
    const dowData=Array(7).fill(null).map(()=>({won:0,total:0,pnl:0}));
    settled.forEach(c=>{
      const dow=new Date(c.date).getDay();
      dowData[dow].total++;
      if(c.status==="won")dowData[dow].won++;
      dowData[dow].pnl+=calcPnl(c);
    });
    return {staked,totalPnl,roi,bnow,won:won.length,lost:coupons.filter(c=>c.status==="lost").length,
      pending:coupons.filter(c=>c.status==="pending").length,
      winRate:settled.length>0?(won.length/settled.length)*100:0,
      todayPnl,weekPnl,streak,legsData,dowData};
  },[coupons,bankroll]);

  const alerts = useMemo(()=>{
    const a=[];
    if(stats.todayPnl<=-settings.dayLossLimit)
      a.push({type:"danger",msg:`⚠️ Dzienny limit straty (${settings.dayLossLimit} zł) przekroczony! Dziś: ${stats.todayPnl.toFixed(0)} zł`});
    else if(stats.todayPnl<=-settings.dayLossLimit*0.8)
      a.push({type:"warn",msg:`⚠️ Blisko dziennego limitu (${settings.dayLossLimit} zł). Dziś: ${stats.todayPnl.toFixed(0)} zł`});
    if(stats.weekPnl<=-settings.weekLossLimit)
      a.push({type:"danger",msg:`⚠️ Tygodniowy limit straty (${settings.weekLossLimit} zł) przekroczony!`});
    if(!coupons.some(c=>c.date===today()))
      a.push({type:"info",msg:"🔔 Nie masz jeszcze kuponu na dziś — pamiętaj wpisać taśmę!"});
    return a;
  },[stats,settings,coupons]);

  const calData = useMemo(()=>{
    const [y,m]=calMonth.split("-").map(Number);
    const daysInMonth=new Date(y,m,0).getDate();
    const startDow=(new Date(y,m-1,1).getDay()+6)%7;
    const cells=[];
    for(let i=0;i<startDow;i++) cells.push(null);
    for(let d=1;d<=daysInMonth;d++){
      const date=`${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
      const cs=coupons.filter(c=>c.date===date);
      const hasPending=cs.some(c=>c.status==="pending");
      const pnl=cs.filter(c=>c.status!=="pending").reduce((s,c)=>s+calcPnl(c),0);
      cells.push({d,date,cs,pnl,hasPending,isEmpty:cs.length===0});
    }
    return {cells,y,m};
  },[calMonth,coupons]);

  const chartPts=useMemo(()=>{
    let r=0;
    return [...coupons].filter(c=>c.status!=="pending")
      .sort((a,b)=>a.date.localeCompare(b.date))
      .map(c=>{r+=calcPnl(c);return r;});
  },[coupons]);

  const todayList=useMemo(()=>coupons.filter(c=>c.date===today()).sort((a,b)=>b.id-a.id),[coupons]);
  const histGrp=useMemo(()=>grp(coupons.filter(c=>c.date!==today())),[coupons]);
  const payPrev=form.odds&&form.stake?+form.odds * +form.stake:null;
  const profPrev=payPrev?payPrev - +form.stake:null;
  const calcOdds=calcLegs&&calcAvg?(Math.pow(+calcAvg,+calcLegs)).toFixed(2):null;

  const A="#f0a500",G="#00c850",R="#dc3232";
  const goalPct=settings.goalBankroll>bankroll?Math.min(100,Math.max(0,((stats.bnow-bankroll)/(settings.goalBankroll-bankroll))*100)):100;
  const inp=(s={})=>({background:"#060810",border:"1px solid #1e2535",borderRadius:8,padding:"11px 14px",color:"#d4d8e8",fontFamily:"inherit",fontSize:16,outline:"none",width:"100%",...s});

  return (
    <div style={{fontFamily:"'DM Mono','Courier New',monospace",background:"#080b0f",minHeight:"100vh",color:"#d4d8e8",width:"100%",overflowX:"hidden"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        input,select,button{font-family:inherit;}
        input:focus,select:focus{outline:none;border-color:#f0a500!important;}
        select option{background:#0d1117;}
        ::-webkit-scrollbar{width:4px;}
        ::-webkit-scrollbar-thumb{background:#1e2535;border-radius:4px;}
        @keyframes fd{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}
        .fd{animation:fd 0.2s ease;}
        .tap:active{opacity:0.7;}
        @keyframes pulse-border{0%,100%{box-shadow:0 0 0 0 rgba(240,165,0,0.4)}50%{box-shadow:0 0 0 4px rgba(240,165,0,0.15)}}
        .pending-card{animation:pulse-border 2s ease-in-out infinite;}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:0.4}}
        .pending-dot{animation:blink 1.4s ease-in-out infinite;}
      `}</style>

      {/* HEADER */}
      <div style={{background:"#0a0d14",borderBottom:"1px solid #1a2030",position:"sticky",top:0,zIndex:99,width:"100%"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 16px 8px"}}>
          <span style={{fontSize:18,fontWeight:500,letterSpacing:"0.1em",color:A}}>TAŚMA·TRACKER</span>
          <button className="tap" onClick={()=>showAdd?setShowAdd(false):openAdd()}
            style={{background:showAdd?"transparent":A,color:showAdd?A:"#080b0f",border:showAdd?`1px solid ${A}`:"none",borderRadius:8,padding:"9px 18px",fontSize:15,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>
            {showAdd?"✕ ZAMKNIJ":"+ KUPON"}
          </button>
        </div>
        <div style={{display:"flex"}}>
          {[["today","DZIŚ"],["cal","KALENDARZ"],["stats","STATSY"],["settings","⚙"]].map(([v,l])=>(
            <button key={v} className="tap" onClick={()=>setView(v)}
              style={{flex:v==="settings"?0:1,background:"none",border:"none",borderBottom:view===v?`2px solid ${A}`:"2px solid transparent",color:view===v?A:"#555",padding:"10px 12px",fontSize:14,fontWeight:600,cursor:"pointer",transition:"all 0.15s",whiteSpace:"nowrap"}}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <div style={{padding:"16px",width:"100%"}}>

        {/* ALERTS */}
        {alerts.map((al,i)=>(
          <div key={i} style={{background:al.type==="danger"?"rgba(220,50,50,0.12)":al.type==="warn"?"rgba(240,165,0,0.1)":"rgba(0,150,255,0.08)",border:`1px solid ${al.type==="danger"?R:al.type==="warn"?A:"#1a4080"}`,borderRadius:9,padding:"11px 14px",marginBottom:10,fontSize:14,color:al.type==="danger"?R:al.type==="warn"?A:"#5a9fff"}}>
            {al.msg}
          </div>
        ))}

        {/* GOAL */}
        {settings.goalBankroll>bankroll&&(
          <div style={{background:"#0d1117",border:"1px solid #1a2030",borderRadius:10,padding:"14px 16px",marginBottom:14}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:8,fontSize:13}}>
              <span style={{color:"#555"}}>🎯 Cel: <b style={{color:A}}>{settings.goalBankroll} zł</b></span>
              <span style={{color:stats.bnow>=settings.goalBankroll?G:"#888"}}>{stats.bnow.toFixed(0)} / {settings.goalBankroll} zł</span>
            </div>
            <div style={{background:"#060810",borderRadius:6,height:10,overflow:"hidden"}}>
              <div style={{width:`${goalPct}%`,height:"100%",background:goalPct>=100?G:A,borderRadius:6,transition:"width 0.5s ease"}}/>
            </div>
            <div style={{fontSize:12,color:"#444",marginTop:5}}>{goalPct.toFixed(1)}% celu osiągnięte</div>
          </div>
        )}

        {/* ADD FORM */}
        {showAdd&&(
          <div className="fd" style={{background:"#0d1117",border:`1px solid ${A}`,borderRadius:12,padding:"18px",marginBottom:16}}>
            <div style={{fontSize:16,fontWeight:600,color:A,marginBottom:14}}>{editId?"✏  EDYTUJ KUPON":"⚡  NOWY KUPON"}</div>
            <div style={{marginBottom:12}}>
              <div style={{fontSize:12,color:"#555",marginBottom:5}}>DATA</div>
              <input type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} style={inp({width:"auto"})}/>
            </div>
            <div style={{marginBottom:12}}>
              <div style={{fontSize:12,color:"#555",marginBottom:6}}>BUKMACHER</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {BOOKMAKERS.map(b=>(
                  <button key={b} className="tap" onClick={()=>setForm(f=>({...f,bk:b}))}
                    style={{background:form.bk===b?"rgba(240,165,0,0.15)":"#060810",border:`1px solid ${form.bk===b?A:"#1e2535"}`,color:form.bk===b?A:"#666",borderRadius:7,padding:"9px 13px",fontSize:15,cursor:"pointer"}}>
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
              </select>
            </div>
            {payPrev&&(
              <div style={{background:"rgba(240,165,0,0.07)",border:"1px solid rgba(240,165,0,0.18)",borderRadius:8,padding:"11px 14px",marginBottom:12,fontSize:16}}>
                <span style={{color:"#666"}}>Wygrana: </span><b style={{color:A}}>{payPrev.toFixed(2)} zł</b>{"   "}
                <span style={{color:"#666"}}>Zysk: </span><b style={{color:G}}>+{profPrev.toFixed(2)} zł</b>
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
                style={{background:"rgba(240,165,0,0.12)",border:"1px solid rgba(240,165,0,0.3)",color:A,borderRadius:8,padding:"0 14px",fontSize:15,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>
                +LEG
              </button>
            </div>
            <input placeholder="Notatka…" value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))}
              style={inp({marginBottom:14,fontSize:15,color:"#888"})}/>
            <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
              <button className="tap" onClick={()=>setShowAdd(false)} style={{background:"none",border:"1px solid #1e2535",color:"#666",borderRadius:8,padding:"11px 18px",fontSize:15,cursor:"pointer"}}>Anuluj</button>
              <button className="tap" onClick={saveForm}
                style={{background:form.odds&&form.stake?A:"#1a1200",color:form.odds&&form.stake?"#080b0f":"#444",border:"none",borderRadius:8,padding:"11px 24px",fontSize:15,fontWeight:700,cursor:"pointer"}}>
                {editId?"ZAPISZ ZMIANY":"ZAPISZ KUPON ✓"}
              </button>
            </div>
          </div>
        )}

        {/* TODAY */}
        {view==="today"&&<>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
            {[
              {l:"Bankroll",   v:`${stats.bnow.toFixed(0)} zł`,c:stats.bnow>=bankroll?G:R},
              {l:"Łączny P&L", v:`${stats.totalPnl>=0?"+":""}${stats.totalPnl.toFixed(0)} zł`,c:stats.totalPnl>=0?G:R},
              {l:"Win Rate",   v:`${stats.winRate.toFixed(0)}%`,c:"#d4d8e8"},
              {l:"ROI",        v:`${stats.roi>=0?"+":""}${stats.roi.toFixed(0)}%`,c:stats.roi>=0?G:R},
            ].map(({l,v,c})=>(
              <div key={l} style={{background:"#0d1117",border:"1px solid #1a2030",borderRadius:10,padding:"14px 16px"}}>
                <div style={{fontSize:13,color:"#444",marginBottom:6}}>{l}</div>
                <div style={{fontSize:24,fontWeight:500,color:c}}>{v}</div>
              </div>
            ))}
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
          {todayList.map(c=><Card key={c.id} c={c} expanded={expand===c.id} onToggle={()=>setExpand(expand===c.id?null:c.id)} onWon={()=>mark(c.id,"won")} onLost={()=>mark(c.id,"lost")} onPending={()=>mark(c.id,"pending")} onEdit={()=>openEdit(c)} onDelete={()=>del(c.id)}/>)}
          {Object.entries(histGrp).slice(0,5).map(([date,cs])=>{
            const dp=cs.filter(c=>c.status!=="pending").reduce((s,c)=>s+calcPnl(c),0);
            const hp=cs.some(c=>c.status==="pending");
            return <div key={date}>
              <div style={{fontSize:14,color:"#444",margin:"18px 0 8px",display:"flex",justifyContent:"space-between"}}>
                <span>{date} · {cs.length} kup. · {cs.reduce((s,c)=>s+c.stake,0)} zł</span>
                {!hp&&<span style={{color:dp>=0?G:R,fontWeight:600}}>{fmtPLN(dp)}</span>}
              </div>
              {cs.map(c=><Card key={c.id} c={c} expanded={expand===c.id} onToggle={()=>setExpand(expand===c.id?null:c.id)} onWon={()=>mark(c.id,"won")} onLost={()=>mark(c.id,"lost")} onPending={()=>mark(c.id,"pending")} onEdit={()=>openEdit(c)} onDelete={()=>del(c.id)}/>)}
            </div>;
          })}
        </>}

        {/* KALENDARZ */}
        {view==="cal"&&<>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
            <button className="tap" onClick={()=>{const[y,m]=calMonth.split("-").map(Number);const d=new Date(y,m-2,1);setCalMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`);}}
              style={{background:"#0d1117",border:"1px solid #1a2030",color:"#888",borderRadius:8,padding:"9px 16px",fontSize:16,cursor:"pointer"}}>‹</button>
            <span style={{fontSize:16,fontWeight:500}}>{new Date(calData.y,calData.m-1).toLocaleDateString("pl-PL",{month:"long",year:"numeric"})}</span>
            <button className="tap" onClick={()=>{const[y,m]=calMonth.split("-").map(Number);const d=new Date(y,m,1);setCalMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`);}}
              style={{background:"#0d1117",border:"1px solid #1a2030",color:"#888",borderRadius:8,padding:"9px 16px",fontSize:16,cursor:"pointer"}}>›</button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3,marginBottom:3}}>
            {["Pn","Wt","Śr","Cz","Pt","Sb","Nd"].map(d=><div key={d} style={{textAlign:"center",fontSize:12,color:"#444",padding:"4px 0"}}>{d}</div>)}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3}}>
            {calData.cells.map((cell,i)=>{
              if(!cell) return <div key={i}/>;
              const isToday=cell.date===today();
              let bg="#0d1117",border="1px solid #1a2030",numColor="#555";
              if(!cell.isEmpty&&!cell.hasPending){
                bg=cell.pnl>0?"rgba(0,200,80,0.15)":"rgba(220,50,50,0.12)";
                border=`1px solid ${cell.pnl>0?"#0d3018":"#3a1010"}`;
                numColor=cell.pnl>0?G:R;
              } else if(cell.hasPending){
                bg="rgba(240,165,0,0.08)";border=`1px solid rgba(240,165,0,0.3)`;numColor=A;
              }
              if(isToday){border=`2px solid ${A}`;numColor=A;}
              return (
                <div key={i} style={{background:bg,border,borderRadius:8,padding:"8px 4px",textAlign:"center",minHeight:52}}>
                  <div style={{fontSize:14,fontWeight:isToday?700:400,color:numColor}}>{cell.d}</div>
                  {!cell.isEmpty&&<div style={{fontSize:10,color:cell.pnl>=0?G:R,marginTop:2,fontWeight:600}}>{cell.hasPending?"?":fmtPLN(cell.pnl).replace("zł","").trim()}</div>}
                  {cell.isEmpty&&<div style={{fontSize:10,color:"#222",marginTop:2}}>—</div>}
                </div>
              );
            })}
          </div>
          <div style={{display:"flex",gap:12,marginTop:12,fontSize:12,color:"#444",flexWrap:"wrap"}}>
            <span>🟢 Wygrany dzień</span><span>🔴 Przegrany dzień</span><span style={{color:A}}>🟡 Oczekuje</span><span>— Brak kuponu</span>
          </div>
        </>}

        {/* STATSY */}
        {view==="stats"&&<>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
            {[
              {l:"Bankroll",v:`${stats.bnow.toFixed(2)} zł`,c:stats.bnow>=bankroll?G:R},
              {l:"Łączny P&L",v:fmtPLN(stats.totalPnl),c:stats.totalPnl>=0?G:R},
              {l:"ROI",v:`${stats.roi>=0?"+":""}${stats.roi.toFixed(1)}%`,c:stats.roi>=0?G:R},
              {l:"Win Rate",v:`${stats.winRate.toFixed(1)}%`,c:"#d4d8e8"},
              {l:"Wygrane/Przegrane",v:`${stats.won}W / ${stats.lost}P`,c:"#d4d8e8"},
              {l:"Łącznie postawione",v:`${stats.staked.toFixed(0)} zł`,c:"#888"},
            ].map(({l,v,c})=>(
              <div key={l} style={{background:"#0d1117",border:"1px solid #1a2030",borderRadius:10,padding:"14px 16px"}}>
                <div style={{fontSize:13,color:"#444",marginBottom:6}}>{l}</div>
                <div style={{fontSize:20,fontWeight:500,color:c}}>{v}</div>
              </div>
            ))}
          </div>
          {chartPts.length>1&&(()=>{
            const H=110,n=chartPts.length;
            const mn=Math.min(...chartPts,0),mx=Math.max(...chartPts,0),rng=mx-mn||1;
            const py=v=>H-((v-mn)/rng)*(H-18)-9;
            const isPos=chartPts[n-1]>=0;
            return (
              <div style={{background:"#0d1117",border:"1px solid #1a2030",borderRadius:10,padding:"16px",marginBottom:14}}>
                <div style={{fontSize:14,color:"#444",marginBottom:10}}>KRZYWA P&L · {n} rozliczonych</div>
                <svg width="100%" viewBox={`0 0 ${n} ${H}`} preserveAspectRatio="none" style={{height:110,display:"block"}}>
                  <line x1="0" y1={py(0)} x2={n} y2={py(0)} stroke="#1a2030" strokeWidth="0.6" strokeDasharray="3,3" vectorEffect="non-scaling-stroke"/>
                  {chartPts.map((v,i)=>i===0?null:(<line key={i} x1={i-0.5} y1={py(chartPts[i-1])} x2={i+0.5} y2={py(v)} stroke={isPos?G:R} strokeWidth="1.5" vectorEffect="non-scaling-stroke"/>))}
                </svg>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:14,color:"#444",marginTop:8}}>
                  <span>Start</span><span style={{color:isPos?G:R,fontWeight:600}}>{fmtPLN(chartPts[n-1])}</span>
                </div>
              </div>
            );
          })()}
          <div style={{background:"#0d1117",border:"1px solid #1a2030",borderRadius:10,padding:"16px",marginBottom:14}}>
            <div style={{fontSize:14,color:"#444",marginBottom:12}}>📈 SKUTECZNOŚĆ PO DNIU TYGODNIA</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:6}}>
              {DAY_NAMES.map((d,i)=>{
                const dd=stats.dowData[(i+1)%7];
                const wr=dd.total>0?(dd.won/dd.total)*100:null;
                return (
                  <div key={d} style={{textAlign:"center"}}>
                    <div style={{fontSize:12,color:"#444",marginBottom:4}}>{DAY_NAMES[(i+1)%7]}</div>
                    <div style={{background:"#060810",borderRadius:6,height:50,display:"flex",alignItems:"flex-end",justifyContent:"center",overflow:"hidden",marginBottom:4}}>
                      {dd.total>0&&<div style={{width:"70%",background:wr>=50?G:R,borderRadius:"4px 4px 0 0",height:`${Math.max(10,wr||10)}%`}}/>}
                    </div>
                    <div style={{fontSize:11,color:dd.total>0?(wr>=50?G:R):"#333",fontWeight:600}}>{dd.total>0?`${wr.toFixed(0)}%`:"—"}</div>
                    <div style={{fontSize:10,color:"#333"}}>{dd.total>0?`${dd.won}/${dd.total}`:""}</div>
                  </div>
                );
              })}
            </div>
          </div>
          <div style={{background:"#0d1117",border:"1px solid #1a2030",borderRadius:10,padding:"16px",marginBottom:14}}>
            <div style={{fontSize:14,color:"#444",marginBottom:12}}>📊 ANALIZA: DŁUGOŚĆ TAŚMY vs SKUTECZNOŚĆ</div>
            {Object.entries(stats.legsData).length===0&&<div style={{fontSize:14,color:"#333"}}>Brak danych — dodaj zdarzenia do kuponów.</div>}
            {Object.entries(stats.legsData).sort((a,b)=>a[0].localeCompare(b[0])).map(([bucket,d])=>{
              const wr=d.total>0?(d.won/d.total)*100:0;
              return (
                <div key={bucket} style={{padding:"10px 0",borderBottom:"1px solid #0f1520"}}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <span style={{fontSize:14,width:80,flexShrink:0,color:"#d4d8e8"}}>{bucket} zd.</span>
                    <div style={{flex:1,background:"#060810",borderRadius:4,height:8,overflow:"hidden"}}>
                      <div style={{width:`${wr}%`,height:"100%",background:wr>=30?G:R,borderRadius:4}}/>
                    </div>
                    <span style={{fontSize:13,color:wr>=30?G:R,width:36,textAlign:"right"}}>{wr.toFixed(0)}%</span>
                    <span style={{fontSize:12,color:"#444",width:50,textAlign:"right"}}>{d.won}/{d.total}</span>
                    <span style={{fontSize:13,fontWeight:600,color:d.pnl>=0?G:R,minWidth:80,textAlign:"right"}}>{fmtPLN(d.pnl)}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{background:"#0d1117",border:"1px solid #1a2030",borderRadius:10,padding:"16px",marginBottom:14}}>
            <div style={{fontSize:14,color:"#444",marginBottom:12}}>🔢 KALKULATOR TAŚMY</div>
            <div style={{display:"flex",gap:10,marginBottom:10,flexWrap:"wrap"}}>
              <div style={{flex:1,minWidth:100}}>
                <div style={{fontSize:12,color:"#555",marginBottom:5}}>Liczba zdarzeń</div>
                <input type="number" value={calcLegs} onChange={e=>setCalcLegs(e.target.value)} style={inp({fontSize:18})}/>
              </div>
              <div style={{flex:1,minWidth:120}}>
                <div style={{fontSize:12,color:"#555",marginBottom:5}}>Średni kurs zdarzenia</div>
                <input type="number" step="0.01" value={calcAvg} onChange={e=>setCalcAvg(e.target.value)} style={inp({fontSize:18,color:A})}/>
              </div>
            </div>
            {calcOdds&&(
              <div style={{background:"rgba(240,165,0,0.07)",border:"1px solid rgba(240,165,0,0.2)",borderRadius:8,padding:"12px 14px",fontSize:16}}>
                <span style={{color:"#666"}}>Kurs łączny: </span><b style={{color:A,fontSize:22}}>{calcOdds}</b>
                <div style={{fontSize:12,color:"#444",marginTop:6}}>
                  Przy 15 zł → wygrana: <b style={{color:G}}>{(+calcOdds*15).toFixed(2)} zł</b> · zysk: <b style={{color:G}}>{((+calcOdds-1)*15).toFixed(2)} zł</b>
                </div>
              </div>
            )}
          </div>
          <button className="tap" onClick={()=>exportCSV(coupons)}
            style={{width:"100%",background:"#0d1117",border:"1px solid #1a2030",color:"#888",borderRadius:10,padding:"14px",fontSize:15,cursor:"pointer",marginBottom:14}}>
            📤 Eksportuj do CSV
          </button>
        </>}

        {/* USTAWIENIA */}
        {view==="settings"&&<>
          <div style={{fontSize:16,fontWeight:500,color:"#d4d8e8",marginBottom:16}}>Ustawienia</div>
          {[
            {key:"goalBankroll",label:"🎯 Cel bankrolla (zł)",desc:"Do jakiej kwoty chcesz dobić"},
            {key:"dayLossLimit",label:"⚠️ Dzienny limit straty (zł)",desc:"Alert gdy przekroczysz w ciągu dnia"},
            {key:"weekLossLimit",label:"⚠️ Tygodniowy limit straty (zł)",desc:"Alert gdy przekroczysz w ciągu tygodnia"},
          ].map(({key,label,desc})=>(
            <div key={key} style={{background:"#0d1117",border:"1px solid #1a2030",borderRadius:10,padding:"14px 16px",marginBottom:10}}>
              <div style={{fontSize:15,color:"#d4d8e8",marginBottom:3}}>{label}</div>
              <div style={{fontSize:12,color:"#444",marginBottom:8}}>{desc}</div>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <input type="number" value={settings[key]} onChange={e=>setSettings(s=>({...s,[key]:+e.target.value}))}
                  style={{background:"#060810",border:"1px solid #1e2535",borderRadius:7,padding:"9px 12px",color:A,width:130,fontSize:18,outline:"none",fontFamily:"inherit"}}/>
                <span style={{fontSize:15,color:"#666"}}>zł</span>
              </div>
            </div>
          ))}
          <div style={{background:"#0d1117",border:"1px solid #1a2030",borderRadius:10,padding:"14px 16px",marginBottom:10}}>
            <div style={{fontSize:15,color:"#d4d8e8",marginBottom:3}}>💰 Bankroll startowy (zł)</div>
            <div style={{fontSize:12,color:"#444",marginBottom:8}}>Kwota z jaką zacząłeś</div>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <input type="number" value={bankroll} onChange={e=>setBankroll(+e.target.value)}
                style={{background:"#060810",border:"1px solid #1e2535",borderRadius:7,padding:"9px 12px",color:A,width:130,fontSize:18,outline:"none",fontFamily:"inherit"}}/>
              <span style={{fontSize:15,color:"#666"}}>zł</span>
            </div>
          </div>
          <div style={{background:"#0d1117",border:"1px solid #1a2030",borderRadius:10,padding:"14px 16px",marginBottom:10}}>
            <div style={{fontSize:15,color:"#d4d8e8",marginBottom:10}}>📋 Historia · {coupons.length} kuponów</div>
            {Object.entries(grp(coupons)).map(([date,cs])=>{
              const dp=cs.filter(c=>c.status!=="pending").reduce((s,c)=>s+calcPnl(c),0);
              const hp=cs.some(c=>c.status==="pending");
              return <div key={date}>
                <div style={{fontSize:13,color:"#444",margin:"14px 0 6px",display:"flex",justifyContent:"space-between"}}>
                  <span>{date} · {cs.length} kup.</span>
                  {!hp&&<span style={{color:dp>=0?G:R,fontWeight:600}}>{fmtPLN(dp)}</span>}
                </div>
                {cs.map(c=><Card key={c.id} c={c} expanded={expand===c.id} onToggle={()=>setExpand(expand===c.id?null:c.id)} onWon={()=>mark(c.id,"won")} onLost={()=>mark(c.id,"lost")} onPending={()=>mark(c.id,"pending")} onEdit={()=>openEdit(c)} onDelete={()=>del(c.id)}/>)}
              </div>;
            })}
          </div>
        </>}
      </div>
    </div>
  );
}

function Card({c,expanded,onToggle,onWon,onLost,onPending,onEdit,onDelete}){
  const p=calcPnl(c);
  const A="#f0a500",G="#00c850",R="#dc3232";
  const sc={won:G,lost:R,pending:A}[c.status];
  const sbg={won:"rgba(0,200,80,0.06)",lost:"rgba(220,50,50,0.05)",pending:"rgba(240,165,0,0.08)"}[c.status];
  const sbd={won:"#0d2e1a",lost:"#2a1010",pending:"rgba(240,165,0,0.5)"}[c.status];
  const isPending=c.status==="pending";
  return (
    <div className={isPending?"pending-card":""} style={{background:sbg,border:`${isPending?"2px":"1px"} solid ${sbd}`,borderRadius:10,marginBottom:8,overflow:"hidden",width:"100%"}}>
      {isPending&&(
        <div style={{background:"rgba(240,165,0,0.12)",borderBottom:"1px solid rgba(240,165,0,0.25)",padding:"5px 14px",display:"flex",alignItems:"center",gap:8}}>
          <div className="pending-dot" style={{width:7,height:7,borderRadius:"50%",background:A,flexShrink:0}}/>
          <span style={{fontSize:12,color:A,fontWeight:600,letterSpacing:"0.08em"}}>OCZEKUJE NA ROZLICZENIE</span>
        </div>
      )}
      <div onClick={onToggle} style={{padding:"13px 14px",display:"flex",alignItems:"center",gap:8,cursor:"pointer"}}>
        <div style={{width:9,height:9,borderRadius:"50%",background:sc,boxShadow:`0 0 6px ${sc}80`,flexShrink:0}}/>
        <span style={{fontSize:13,color:"#555",width:70,flexShrink:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.bk}</span>
        <span style={{flex:1,fontSize:15,color:"#7a8499",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0}}>{c.note||"—"}</span>
        <span style={{background:"rgba(240,165,0,0.12)",color:A,borderRadius:6,padding:"3px 9px",fontSize:14,fontWeight:600,flexShrink:0,whiteSpace:"nowrap"}}>
          ×{c.odds>=10000?c.odds.toLocaleString("pl-PL",{maximumFractionDigits:0}):c.odds.toFixed(2)}
        </span>
        <span style={{fontSize:15,fontWeight:500,color:"#d4d8e8",flexShrink:0,width:46,textAlign:"right"}}>{c.stake}zł</span>
        {c.status!=="pending"&&(
          <span style={{background:p>0?"rgba(0,200,80,0.15)":"rgba(220,50,50,0.15)",color:p>0?G:R,borderRadius:6,padding:"3px 9px",fontSize:14,fontWeight:600,flexShrink:0,whiteSpace:"nowrap"}}>
            {p>=0?"+":""}{p.toFixed(0)}zł
          </span>
        )}
        <span style={{fontSize:12,color:"#333",flexShrink:0}}>{expanded?"▲":"▼"}</span>
        <button onClick={e=>{e.stopPropagation();onDelete();}} style={{background:"none",border:"none",color:"#2a2a2a",fontSize:20,cursor:"pointer",padding:"0 2px",flexShrink:0,lineHeight:1}}>✕</button>
      </div>
      {expanded&&c.legs.length>0&&c.legs.map((l,i)=>(
        <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"9px 14px",borderTop:"1px solid rgba(0,0,0,0.3)"}}>
          <span style={{fontSize:13,color:"#333",width:20,textAlign:"right"}}>{i+1}.</span>
          <span style={{flex:1,fontSize:15,color:"#666"}}>{l.m}</span>
          <span style={{fontSize:15,color:A,fontWeight:600}}>{l.s}</span>
        </div>
      ))}
      {expanded&&(
        <div style={{padding:"9px 14px",borderTop:"1px solid rgba(0,0,0,0.3)",display:"flex",gap:20,fontSize:14,color:"#444",flexWrap:"wrap"}}>
          <span>Wygrana: <b style={{color:A}}>{(c.odds*c.stake).toFixed(2)} zł</b></span>
          <span>Zysk: <b style={{color:G}}>+{((c.odds-1)*c.stake).toFixed(2)} zł</b></span>
          <span style={{marginLeft:"auto",color:"#333"}}>{c.date}</span>
        </div>
      )}
      <div style={{padding:"0 12px 12px",display:"flex",gap:6}}>
        {c.status==="pending"&&<>
          <button onClick={onWon}  style={{flex:1,background:"rgba(0,200,80,0.14)",border:"1px solid #0d3018",color:G,borderRadius:7,padding:"10px",fontSize:14,fontWeight:700,cursor:"pointer"}}>✓ WYGRANY</button>
          <button onClick={onLost} style={{flex:1,background:"rgba(220,50,50,0.12)",border:"1px solid #3a1010",color:R,borderRadius:7,padding:"10px",fontSize:14,fontWeight:700,cursor:"pointer"}}>✗ PRZEGRANY</button>
        </>}
        {c.status!=="pending"&&(
          <button onClick={onPending} style={{background:"rgba(240,165,0,0.08)",border:"1px solid rgba(240,165,0,0.2)",color:A,borderRadius:7,padding:"10px 14px",fontSize:14,fontWeight:600,cursor:"pointer"}}>↩ COFNIJ</button>
        )}
        <button onClick={e=>{e.stopPropagation();onEdit();}} style={{background:"none",border:"1px solid #1a2030",color:"#555",borderRadius:7,padding:"10px 14px",fontSize:14,cursor:"pointer"}}>✏ EDYTUJ</button>
      </div>
    </div>
  );
}
