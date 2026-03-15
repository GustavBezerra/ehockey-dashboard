import { useState, useMemo, useEffect, useCallback } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LineChart, Line, ReferenceLine, Area, AreaChart } from "recharts";

const API = "https://web-production-fd2a9.up.railway.app";

// ═══════════════════════════════════════════════════════════════
// HOOKS
// ═══════════════════════════════════════════════════════════════
function useApi(endpoint) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  useEffect(() => {
    let c = false;
    setLoading(true);
    fetch(`${API}${endpoint}`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(d => { if (!c) { setData(d); setError(null); } })
      .catch(e => { if (!c) setError(e.message); })
      .finally(() => { if (!c) setLoading(false); });
    return () => { c = true; };
  }, [endpoint]);
  return { data, loading, error };
}

function useFetch(url) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback((u) => {
    setLoading(true);
    fetch(`${API}${u}`).then(r => r.json()).then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);
  return { data, loading, load };
}

// ═══════════════════════════════════════════════════════════════
// ANALYTICS
// ═══════════════════════════════════════════════════════════════
function getH2H(matches, p1, p2) {
  return matches.filter(m => (m.nick1===p1&&m.nick2===p2)||(m.nick1===p2&&m.nick2===p1))
    .map(m => { const f=m.nick1===p1; return{...m,p1Score:f?m.score1:m.score2,p2Score:f?m.score2:m.score1,total:m.score1+m.score2}; })
    .sort((a,b) => new Date(b.date)-new Date(a.date));
}
function calcSummary(h) {
  const t=h.length; if(!t) return{total:0,p1Wins:0,p2Wins:0,draws:0,p1WR:0,p2WR:0,avgGoals:0};
  const w1=h.filter(m=>m.p1Score>m.p2Score).length,w2=h.filter(m=>m.p2Score>m.p1Score).length;
  return{total:t,p1Wins:w1,p2Wins:w2,draws:t-w1-w2,p1WR:(w1/t)*100,p2WR:(w2/t)*100,avgGoals:h.reduce((s,m)=>s+m.total,0)/t};
}
function calcStreak(h) {
  if(!h.length) return{type:"-",count:0};
  let t=h[0].p1Score>h[0].p2Score?"W":h[0].p1Score<h[0].p2Score?"L":"D",c=1;
  for(let i=1;i<h.length;i++){const ct=h[i].p1Score>h[i].p2Score?"W":h[i].p1Score<h[i].p2Score?"L":"D";if(ct===t)c++;else break;}
  return{type:t,count:c};
}
function calcIndivAvg(matches,p){let g=0,c=0;matches.forEach(m=>{if(m.nick1===p){g+=m.score1;c++;}else if(m.nick2===p){g+=m.score2;c++;}});return c?g/c:0;}
function handicapPct(h,fp1,md){if(!h.length)return 0;return(h.filter(m=>fp1?(m.p1Score-m.p2Score>=md):(m.p2Score-m.p1Score>=md)).length/h.length)*100;}
function handicapPosPct(h,fp1,handicap){if(!h.length)return 0;const maxLoss=handicap-0.5;return(h.filter(m=>{const diff=fp1?(m.p1Score-m.p2Score):(m.p2Score-m.p1Score);return diff>=-maxLoss;}).length/h.length)*100;}
function overUnder(h,lines){if(!h.length)return[];return lines.map(l=>({line:l,over:h.filter(m=>m.total>l).length/h.length*100,under:h.filter(m=>m.total<l).length/h.length*100}));}

function calcGlobalPatterns(matches){
  let gamesWithPeriods=0;
  const stats={p3AfterHighP2:{c:0,g:0},p3AfterLowP2:{c:0,g:0},p3AfterHighP1:{c:0,g:0},p3AfterLowP1:{c:0,g:0},
    afterP1Zero:{c:0,tg:0,hiP2:0,hiP3:0},leadP2:{c:0,come:0,draw:0,ext:0},blowP1:{c:0,g2:0,g3:0},closeP2:{c:0,g3:0,dec:0},
    periodAvg:[0,0,0],periodCount:0};

  matches.forEach(m=>{
    const ps=m.period_scores;if(!ps)return;
    let periods=Array.isArray(ps)?ps:(ps.periods||null);
    if(!periods||periods.length<3)return;
    gamesWithPeriods++;stats.periodCount++;
    const g1=periods[0][0]+periods[0][1],g2=periods[1][0]+periods[1][1],g3=periods[2][0]+periods[2][1];
    stats.periodAvg[0]+=g1;stats.periodAvg[1]+=g2;stats.periodAvg[2]+=g3;
    const c1h=periods[0][0],c1a=periods[0][1],c2h=c1h+periods[1][0],c2a=c1a+periods[1][1];
    // P2 high/low → P3
    if(g2>=4){stats.p3AfterHighP2.c++;stats.p3AfterHighP2.g+=g3;}else{stats.p3AfterLowP2.c++;stats.p3AfterLowP2.g+=g3;}
    if(g1>=3){stats.p3AfterHighP1.c++;stats.p3AfterHighP1.g+=g3;}else{stats.p3AfterLowP1.c++;stats.p3AfterLowP1.g+=g3;}
    // P1=0x0
    if(g1===0){stats.afterP1Zero.c++;stats.afterP1Zero.tg+=g2+g3;if(g2>=3)stats.afterP1Zero.hiP2++;if(g3>=3)stats.afterP1Zero.hiP3++;}
    // Leading P2
    const d2=c2h-c2a;
    if(d2!==0){stats.leadP2.c++;const s1=m.score1??m.p1Score??0,s2=m.score2??m.p2Score??0,fd=s1-s2;
      if((d2>0&&fd<0)||(d2<0&&fd>0))stats.leadP2.come++;else if(fd===0)stats.leadP2.draw++;else if(Math.abs(fd)>Math.abs(d2))stats.leadP2.ext++;}
    // Blowout P1
    if(Math.abs(c1h-c1a)>=3){stats.blowP1.c++;stats.blowP1.g2+=g2;stats.blowP1.g3+=g3;}
    // Close P2
    if(Math.abs(d2)<=1){stats.closeP2.c++;stats.closeP2.g3+=g3;if(g3>=3)stats.closeP2.dec++;}
  });

  const n=stats.periodCount||1;
  return{gamesWithPeriods,
    avgByPeriod:{p1:stats.periodAvg[0]/n,p2:stats.periodAvg[1]/n,p3:stats.periodAvg[2]/n},
    p3AfterHighP2:{avg:stats.p3AfterHighP2.c?stats.p3AfterHighP2.g/stats.p3AfterHighP2.c:0,count:stats.p3AfterHighP2.c},
    p3AfterLowP2:{avg:stats.p3AfterLowP2.c?stats.p3AfterLowP2.g/stats.p3AfterLowP2.c:0,count:stats.p3AfterLowP2.c},
    p3AfterHighP1:{avg:stats.p3AfterHighP1.c?stats.p3AfterHighP1.g/stats.p3AfterHighP1.c:0,count:stats.p3AfterHighP1.c},
    p3AfterLowP1:{avg:stats.p3AfterLowP1.c?stats.p3AfterLowP1.g/stats.p3AfterLowP1.c:0,count:stats.p3AfterLowP1.c},
    afterP1Zero:{count:stats.afterP1Zero.c,avgGoals:stats.afterP1Zero.c?stats.afterP1Zero.tg/stats.afterP1Zero.c:0,hiP2pct:stats.afterP1Zero.c?(stats.afterP1Zero.hiP2/stats.afterP1Zero.c)*100:0,hiP3pct:stats.afterP1Zero.c?(stats.afterP1Zero.hiP3/stats.afterP1Zero.c)*100:0},
    leadP2:{count:stats.leadP2.c,comebackPct:stats.leadP2.c?(stats.leadP2.come/stats.leadP2.c)*100:0,drawPct:stats.leadP2.c?(stats.leadP2.draw/stats.leadP2.c)*100:0,extendPct:stats.leadP2.c?(stats.leadP2.ext/stats.leadP2.c)*100:0},
    blowP1:{count:stats.blowP1.c,p2Avg:stats.blowP1.c?stats.blowP1.g2/stats.blowP1.c:0,p3Avg:stats.blowP1.c?stats.blowP1.g3/stats.blowP1.c:0},
    closeP2:{count:stats.closeP2.c,p3Avg:stats.closeP2.c?stats.closeP2.g3/stats.closeP2.c:0,p3DecPct:stats.closeP2.c?(stats.closeP2.dec/stats.closeP2.c)*100:0},
  };
}
function calcRecentForm(h,n=5){const a=calcSummary(h),r=calcSummary(h.slice(0,n)),rn=Math.min(n,h.length);return{recentN:rn,p1WR_all:a.p1WR,p2WR_all:a.p2WR,p1WR_recent:r.p1WR,p2WR_recent:r.p2WR,p1Trend:r.p1WR-a.p1WR,p2Trend:r.p2WR-a.p2WR,avgGoals_all:a.avgGoals,avgGoals_recent:rn?h.slice(0,rn).reduce((s,m)=>s+m.total,0)/rn:0};}
function calcCloseGames(h){if(!h.length)return{pct:0,count:0,total:0};const c=h.filter(m=>Math.abs(m.p1Score-m.p2Score)===1);return{pct:(c.length/h.length)*100,count:c.length,total:h.length};}
function calcExactScores(h,n=5){if(!h.length)return[];const f={};h.forEach(m=>{const k=`${m.p1Score}×${m.p2Score}`;f[k]=(f[k]||0)+1;});return Object.entries(f).map(([s,c])=>({score:s,count:c,pct:(c/h.length)*100})).sort((a,b)=>b.count-a.count).slice(0,n);}
function calcLineCoverage(h,lines){if(!h.length)return[];return lines.map(l=>{const t=Math.ceil(l),hits=h.filter(m=>m.total===t).length;return{line:l,target:t,hits,pct:(hits/h.length)*100};});}

// Kelly Criterion
function kellyStake(probPct, oddDecimal, bankroll) {
  const p = probPct / 100;
  const q = 1 - p;
  const b = oddDecimal - 1;
  if (b <= 0) return { fraction: 0, stake: 0, ev: 0, edge: 0 };
  const f = (b * p - q) / b;
  const edge = (p * oddDecimal - 1) * 100;
  const ev = (p * (oddDecimal - 1) - q) * 100;
  return {
    fraction: Math.max(0, f),
    stake: Math.max(0, f * bankroll),
    ev: ev,
    edge: edge,
  };
}

function idealOdd(pct){const p=Math.max(Math.min(pct/100,0.999),0.001);return Math.round((1/p)*20)/20;}
function fmtPct(v){return v.toFixed(1).replace(".",",")+"%";}
function fmtNum(v,d=2){return v.toFixed(d).replace(".",",");}
const OU_LINES=[5.5,6.5,7.5,8.5,9.5];

// ═══════════════════════════════════════════════════════════════
// PERIOD ANALYSIS
// ═══════════════════════════════════════════════════════════════

function parsePeriods(match) {
  // Extrai period_scores do match, retorna null se não houver
  const ps = match.period_scores;
  if (!ps) return null;
  // ps pode ser {periods:[[1,0],[2,1],...], overtime:[], ...} ou [[1,0],[2,1],...]
  if (Array.isArray(ps)) return { periods: ps, overtime: [], shootout: [], finish_type: null };
  if (ps.periods) return { periods: ps.periods || [], overtime: ps.overtime || [], shootout: ps.shootout || [], finish_type: ps.finish_type };
  return null;
}

function calcPeriodSituation(h2h) {
  // Para cada período, calcula % P1 vencendo / empate / P1 perdendo (acumulado)
  const results = { p1: [0,0,0], p2: [0,0,0], p3: [0,0,0] };
  const counts = { p1: 0, p2: 0, p3: 0 };
  const labels = ["p1","p2","p3"];

  h2h.forEach(m => {
    const pd = parsePeriods(m);
    if (!pd || !pd.periods.length) return;
    let cum1 = 0, cum2 = 0;
    pd.periods.forEach((p, idx) => {
      if (idx > 2) return;
      cum1 += p[0]; cum2 += p[1];
      const key = labels[idx];
      counts[key]++;
      if (cum1 > cum2) results[key][0]++;
      else if (cum1 === cum2) results[key][1]++;
      else results[key][2]++;
    });
  });

  return labels.map(key => ({
    label: key === "p1" ? "Fim P1" : key === "p2" ? "Fim P2" : "Fim P3",
    winning: counts[key] ? (results[key][0] / counts[key]) * 100 : 0,
    drawing: counts[key] ? (results[key][1] / counts[key]) * 100 : 0,
    losing: counts[key] ? (results[key][2] / counts[key]) * 100 : 0,
    total: counts[key],
  }));
}

function calcComebacks(h2h) {
  // Viradas: estava perdendo após P1 ou P2 e ganhou
  let losingP1won = 0, losingP2won = 0, losingP1total = 0, losingP2total = 0;
  let winningP2lost = 0, winningP2total = 0;
  // Virada por margem
  let comebackBy = {1:0, 2:0, 3:0};
  let totalComebacks = 0;
  let gamesWithPeriods = 0;

  h2h.forEach(m => {
    const pd = parsePeriods(m);
    if (!pd || pd.periods.length < 3) return;
    gamesWithPeriods++;

    const cumAfterP1_1 = pd.periods[0][0];
    const cumAfterP1_2 = pd.periods[0][1];
    const cumAfterP2_1 = pd.periods[0][0] + pd.periods[1][0];
    const cumAfterP2_2 = pd.periods[0][1] + pd.periods[1][1];
    const finalScore1 = m.p1Score;
    const finalScore2 = m.p2Score;
    const p1Won = finalScore1 > finalScore2;

    // P1 estava perdendo após P1
    if (cumAfterP1_1 < cumAfterP1_2) {
      losingP1total++;
      if (p1Won) { losingP1won++; totalComebacks++; const diff = finalScore1 - finalScore2; comebackBy[Math.min(diff, 3)]++; }
    }
    // P1 estava perdendo após P2
    if (cumAfterP2_1 < cumAfterP2_2) {
      losingP2total++;
      if (p1Won) { losingP2won++; }
    }
    // P1 estava ganhando após P2 mas perdeu
    if (cumAfterP2_1 > cumAfterP2_2) {
      winningP2total++;
      if (!p1Won && finalScore1 !== finalScore2) winningP2lost++;
    }
  });

  return {
    gamesWithPeriods,
    losingP1: { won: losingP1won, total: losingP1total, pct: losingP1total ? (losingP1won / losingP1total) * 100 : 0 },
    losingP2: { won: losingP2won, total: losingP2total, pct: losingP2total ? (losingP2won / losingP2total) * 100 : 0 },
    blownLead: { lost: winningP2lost, total: winningP2total, pct: winningP2total ? (winningP2lost / winningP2total) * 100 : 0 },
    security: { pct: winningP2total ? ((winningP2total - winningP2lost) / winningP2total) * 100 : 0 },
    comebackBy,
    totalComebacks,
  };
}

function calcGoalsPerPeriod(h2h) {
  const sums = [[0,0],[0,0],[0,0]];
  let count = 0;
  const periodTotals = [0,0,0]; // total goals per period

  h2h.forEach(m => {
    const pd = parsePeriods(m);
    if (!pd || pd.periods.length < 3) return;
    count++;
    pd.periods.forEach((p, idx) => {
      if (idx > 2) return;
      sums[idx][0] += p[0];
      sums[idx][1] += p[1];
      periodTotals[idx] += p[0] + p[1];
    });
  });

  if (!count) return { periods: [], count: 0 };

  return {
    count,
    periods: [
      { label: "P1", p1Avg: sums[0][0]/count, p2Avg: sums[0][1]/count, totalAvg: periodTotals[0]/count },
      { label: "P2", p1Avg: sums[1][0]/count, p2Avg: sums[1][1]/count, totalAvg: periodTotals[1]/count },
      { label: "P3", p1Avg: sums[2][0]/count, p2Avg: sums[2][1]/count, totalAvg: periodTotals[2]/count },
    ],
  };
}

function calcOUPerPeriod(h2h, lines=[0.5, 1.5, 2.5, 3.5]) {
  const results = [];
  let count = 0;

  // Count per period
  const periodGoals = [[],[],[]];
  h2h.forEach(m => {
    const pd = parsePeriods(m);
    if (!pd || pd.periods.length < 3) return;
    count++;
    pd.periods.forEach((p, idx) => {
      if (idx > 2) return;
      periodGoals[idx].push(p[0] + p[1]);
    });
  });

  if (!count) return [];

  ["P1","P2","P3"].forEach((label, idx) => {
    const goals = periodGoals[idx];
    const row = { label };
    lines.forEach(line => {
      row[`over_${line}`] = (goals.filter(g => g > line).length / goals.length) * 100;
      row[`under_${line}`] = (goals.filter(g => g < line).length / goals.length) * 100;
    });
    row.avg = goals.reduce((s,g) => s+g, 0) / goals.length;
    row.zero = (goals.filter(g => g === 0).length / goals.length) * 100;
    results.push(row);
  });

  return results;
}

// ═══════════════════════════════════════════════════════════════
// THEME
// ═══════════════════════════════════════════════════════════════
const T={bg:"#0a0e1a",surface:"#111827",border:"rgba(255,255,255,0.07)",borderLight:"rgba(255,255,255,0.12)",text:"rgba(255,255,255,0.92)",textMuted:"rgba(255,255,255,0.55)",textDim:"rgba(255,255,255,0.35)",accent1:"#3b82f6",accent2:"#f59e0b",green:"#34d399",yellow:"#fbbf24",red:"#f87171",cyan:"#22d3ee",purple:"#a78bfa",sidebar:"#080c16"};
function pctColor(p){return p>70?T.green:p>=50?T.yellow:T.red;}
function trendArrow(d){return d>5?{icon:"▲",color:T.green}:d<-5?{icon:"▼",color:T.red}:{icon:"■",color:T.yellow};}
const fontLink="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700;800&family=Outfit:wght@300;400;500;600;700;800;900&display=swap";

// ═══════════════════════════════════════════════════════════════
// UI COMPONENTS
// ═══════════════════════════════════════════════════════════════
function Card({children,style}){return(<div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:16,padding:"16px 18px",transition:"border-color .2s",...style}} onMouseEnter={e=>e.currentTarget.style.borderColor=T.borderLight} onMouseLeave={e=>e.currentTarget.style.borderColor=T.border}>{children}</div>);}
function KpiCard({label,value,sub,color,small}){return(<Card><div style={{fontFamily:"'Outfit'",fontSize:11,fontWeight:600,letterSpacing:"0.08em",textTransform:"uppercase",color:T.textMuted,marginBottom:6}}>{label}</div><div style={{fontFamily:"'JetBrains Mono'",fontSize:small?28:36,fontWeight:800,color:color||T.text,lineHeight:1.1}}>{value}</div>{sub&&<div style={{marginTop:8,fontSize:12,color:T.textMuted,fontFamily:"'Outfit'"}} dangerouslySetInnerHTML={{__html:sub}}/>}</Card>);}
function StreakBadge({streak}){const c={W:T.green,L:T.red,D:T.yellow}[streak.type]||T.textMuted;const l={W:"VIT",L:"DER",D:"EMP"}[streak.type]||"-";return(<span style={{display:"inline-flex",alignItems:"center",gap:5,background:`${c}18`,border:`1px solid ${c}40`,borderRadius:8,padding:"4px 10px",fontFamily:"'JetBrains Mono'",fontSize:13,fontWeight:700,color:c}}>{streak.count}{l}</span>);}
function SectionTitle({children,icon}){return(<div style={{display:"flex",alignItems:"center",gap:8,margin:"28px 0 14px",fontFamily:"'Outfit'",fontSize:16,fontWeight:700,color:T.text}}><span style={{fontSize:18}}>{icon}</span>{children}</div>);}
function TabBtn({active,children,onClick}){return(<button onClick={onClick} style={{background:active?"rgba(59,130,246,0.15)":"transparent",border:active?`1px solid rgba(59,130,246,0.3)`:`1px solid transparent`,borderRadius:10,padding:"8px 16px",cursor:"pointer",fontFamily:"'Outfit'",fontSize:13,fontWeight:active?700:500,color:active?T.accent1:T.textMuted,transition:"all .2s"}}>{children}</button>);}
function MiniBar({pct,color,height=5}){return(<div style={{width:"100%",height,background:"rgba(255,255,255,0.06)",borderRadius:3,overflow:"hidden"}}><div style={{width:`${Math.min(pct,100)}%`,height:"100%",background:color,borderRadius:3,transition:"width .6s ease"}}/></div>);}
function TrendIndicator({diff,label}){const t=trendArrow(diff);return(<div style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontFamily:"'JetBrains Mono'",fontSize:11,fontWeight:800,color:t.color}}>{t.icon}</span><span style={{fontSize:12,color:t.color,fontWeight:700}}>{diff>0?"+":""}{fmtPct(diff)}</span>{label&&<span style={{fontSize:11,color:T.textDim}}>{label}</span>}</div>);}
function Pill({text,color,bg}){return(<span style={{display:"inline-block",padding:"3px 10px",borderRadius:6,fontSize:12,fontWeight:700,fontFamily:"'JetBrains Mono'",color,background:bg}}>{text}</span>);}
function SidebarStat({label,value}){return(<div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:12,color:T.textMuted}}>{label}</span><span style={{fontFamily:"'JetBrains Mono'",fontSize:14,fontWeight:700,color:T.text}}>{value}</span></div>);}
function LegendDot({color,label,dashed}){return(<div style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:T.textMuted}}><div style={{width:dashed?14:8,height:dashed?2:8,borderRadius:dashed?0:"50%",background:dashed?"transparent":color,borderTop:dashed?`2px dashed ${color}`:"none"}}/>{label}</div>);}

function InputField({label, value, onChange, type="text", placeholder, style:st}) {
  return(<div style={{...st}}>
    {label&&<label style={{fontSize:11,fontWeight:600,color:T.textMuted,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:6,display:"block"}}>{label}</label>}
    <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
      style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,padding:"10px 14px",color:T.text,fontFamily:"'JetBrains Mono'",fontSize:14,fontWeight:600,outline:"none",width:"100%"}}/>
  </div>);
}

function LoadingScreen(){return(<div style={{minHeight:"100vh",background:T.bg,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16}}><div style={{fontSize:40}}>🏒</div><div style={{fontFamily:"'Outfit'",fontSize:16,color:T.textMuted}}>Carregando dados...</div></div>);}
function ErrorScreen({message}){return(<div style={{minHeight:"100vh",background:T.bg,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16,padding:32}}><div style={{fontSize:40}}>⚠️</div><div style={{fontFamily:"'Outfit'",fontSize:18,color:T.red,fontWeight:700}}>Erro ao conectar na API</div><div style={{fontFamily:"'JetBrains Mono'",fontSize:13,color:T.textMuted,textAlign:"center"}}>{message}</div><div style={{fontFamily:"'Outfit'",fontSize:13,color:T.textDim,textAlign:"center"}}>Verifique: <code style={{background:"rgba(255,255,255,0.06)",padding:"2px 8px",borderRadius:4}}>uvicorn api:app --reload --port 8000</code></div></div>);}

// ═══════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════
export default function App() {
  const {data:players,loading:lp,error:ep} = useApi("/players");
  const {data:stats} = useApi("/stats");
  const {data:allMatches,loading:lm,error:em} = useApi("/matches");
  const {data:eloData} = useApi("/elo");
  const {data:stages} = useApi("/stages");

  const [p1,setP1]=useState("");
  const [p2,setP2]=useState("");
  const [tab,setTab]=useState("geral");
  const [last10,setLast10]=useState(false);
  const [stageFilter,setStageFilter]=useState("");

  // Kelly inputs
  const [kellyOdd,setKellyOdd]=useState("");
  const [kellyBankroll,setKellyBankroll]=useState("1000");
  const [kellyTarget,setKellyTarget]=useState("p1_ml");

  // Time patterns
  const tp1=useFetch();
  const tp2=useFetch();

  useEffect(()=>{if(players&&players.length>=2&&!p1&&!p2){setP1(players[0]);setP2(players[1]);}},[players]);
  useEffect(()=>{if(p1)tp1.load(`/time-patterns?player=${encodeURIComponent(p1)}`);}, [p1]);
  useEffect(()=>{if(p2)tp2.load(`/time-patterns?player=${encodeURIComponent(p2)}`);}, [p2]);

  const matches=useMemo(()=>allMatches||[],[allMatches]);
  const filteredMatches=useMemo(()=>{
    if(!stageFilter) return matches;
    return matches.filter(m=>m.stage&&m.stage.toLowerCase().includes(stageFilter.toLowerCase()));
  },[matches,stageFilter]);

  const h2hAll=useMemo(()=>p1&&p2?getH2H(filteredMatches,p1,p2):[],[filteredMatches,p1,p2]);
  const h2h=last10?h2hAll.slice(0,10):h2hAll;
  const summary=useMemo(()=>calcSummary(h2h),[h2h]);
  const p1Streak=useMemo(()=>calcStreak(h2hAll),[h2hAll]);
  const p2Streak=useMemo(()=>calcStreak(h2hAll.map(m=>({...m,p1Score:m.p2Score,p2Score:m.p1Score}))),[h2hAll]);
  const p1AvgAll=useMemo(()=>calcIndivAvg(matches,p1),[matches,p1]);
  const p2AvgAll=useMemo(()=>calcIndivAvg(matches,p2),[matches,p2]);
  const p1AvgH2H=useMemo(()=>h2h.length?h2h.reduce((s,m)=>s+m.p1Score,0)/h2h.length:0,[h2h]);
  const p2AvgH2H=useMemo(()=>h2h.length?h2h.reduce((s,m)=>s+m.p2Score,0)/h2h.length:0,[h2h]);
  const ouData=useMemo(()=>overUnder(h2h,OU_LINES),[h2h]);
  const recentForm=useMemo(()=>calcRecentForm(h2hAll,5),[h2hAll]);
  const closeGames=useMemo(()=>calcCloseGames(h2h),[h2h]);
  const exactScores=useMemo(()=>calcExactScores(h2h,5),[h2h]);
  const lineCoverage=useMemo(()=>calcLineCoverage(h2h,OU_LINES),[h2h]);
  const goalHistory=useMemo(()=>[...h2h].reverse().map((m,i)=>({idx:i+1,p1:m.p1Score,p2:m.p2Score,total:m.total})),[h2h]);

  // Period analysis
  const periodSituation=useMemo(()=>calcPeriodSituation(h2h),[h2h]);
  const comebacks=useMemo(()=>calcComebacks(h2h),[h2h]);
  const goalsPerPeriod=useMemo(()=>calcGoalsPerPeriod(h2h),[h2h]);
  const ouPerPeriod=useMemo(()=>calcOUPerPeriod(h2h),[h2h]);
  const globalPatterns=useMemo(()=>calcGlobalPatterns(matches),[matches]);

  // Kelly calc
  const kellyProb = useMemo(()=>{
    if(!summary.total) return 0;
    const map = {
      p1_ml: summary.p1WR, p2_ml: summary.p2WR,
      p1_ah15: handicapPct(h2h,true,2), p1_ah25: handicapPct(h2h,true,3),
      p2_ah15: handicapPct(h2h,false,2), p2_ah25: handicapPct(h2h,false,3),
    };
    // Over/under
    OU_LINES.forEach(l => {
      map[`over_${l}`] = h2h.length ? h2h.filter(m=>m.total>l).length/h2h.length*100 : 0;
      map[`under_${l}`] = h2h.length ? h2h.filter(m=>m.total<l).length/h2h.length*100 : 0;
    });
    return map[kellyTarget] || 0;
  },[summary,h2h,kellyTarget]);

  const kellyResult = useMemo(()=>{
    const odd = parseFloat(kellyOdd.replace(",","."));
    const bank = parseFloat(kellyBankroll.replace(",","."));
    if(!odd||!bank||!kellyProb) return null;
    return kellyStake(kellyProb, odd, bank);
  },[kellyOdd,kellyBankroll,kellyProb]);

  // ELO for selected players
  const p1Elo = useMemo(()=>eloData?.find(e=>e.player===p1),[eloData,p1]);
  const p2Elo = useMemo(()=>eloData?.find(e=>e.player===p2),[eloData,p2]);

  if(lp||lm) return<><link href={fontLink} rel="stylesheet"/><LoadingScreen/></>;
  if(ep||em) return<><link href={fontLink} rel="stylesheet"/><ErrorScreen message={ep||em}/></>;
  if(!players||players.length<2) return<><link href={fontLink} rel="stylesheet"/><ErrorScreen message="Banco vazio. Rode o pipeline."/></>;

  const selSt={background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,padding:"10px 14px",color:T.text,fontFamily:"'Outfit'",fontSize:14,fontWeight:600,outline:"none",cursor:"pointer",width:"100%",appearance:"none",WebkitAppearance:"none",backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.4)' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,backgroundRepeat:"no-repeat",backgroundPosition:"right 12px center"};

  const tabs=[["geral","📊 Geral"],["periodos","⏱️ Períodos"],["padroes","🔬 Padrões"],["forma","🔥 Forma"],["ou","📈 O/U"],["kelly","💰 Simulador"],["elo","🏆 ELO"],["tempo","🕐 Horários"],["confrontos","📋 H2H"]];

  return(
    <div style={{minHeight:"100vh",background:T.bg,color:T.text,fontFamily:"'Outfit', sans-serif"}}>
      <link href={fontLink} rel="stylesheet"/>
      <style>{`*{box-sizing:border-box;margin:0;padding:0}::-webkit-scrollbar{width:6px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:3px}select option{background:${T.surface};color:${T.text}}@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}.fade-up{animation:fadeUp .45s ease both}.fade-d1{animation-delay:.05s}.fade-d2{animation-delay:.1s}`}</style>

      <div style={{display:"flex",minHeight:"100vh"}}>
        {/* SIDEBAR */}
        <aside style={{width:270,minWidth:270,background:T.sidebar,borderRight:`1px solid ${T.border}`,padding:"28px 20px",display:"flex",flexDirection:"column",gap:16,position:"sticky",top:0,height:"100vh",overflowY:"auto"}}>
          <div>
            <div style={{fontSize:22,fontWeight:900,letterSpacing:"-0.03em",color:T.text}}>🏒 eHockey</div>
            <div style={{fontSize:11,fontWeight:500,color:T.textDim,marginTop:4,letterSpacing:"0.04em",textTransform:"uppercase"}}>Analytics v4</div>
          </div>
          <div style={{height:1,background:T.border}}/>

          <div>
            <label style={{fontSize:11,fontWeight:600,color:T.textMuted,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:6,display:"block"}}>Jogador 1</label>
            <select value={p1} onChange={e=>setP1(e.target.value)} style={{...selSt,borderColor:`${T.accent1}50`}}>{players.map(p=><option key={p}>{p}</option>)}</select>
          </div>
          <div>
            <label style={{fontSize:11,fontWeight:600,color:T.textMuted,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:6,display:"block"}}>Jogador 2</label>
            <select value={p2} onChange={e=>setP2(e.target.value)} style={{...selSt,borderColor:`${T.accent2}50`}}>{players.map(p=><option key={p}>{p}</option>)}</select>
          </div>

          {/* Stage filter */}
          {stages&&stages.length>0&&(<div>
            <label style={{fontSize:11,fontWeight:600,color:T.textMuted,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:6,display:"block"}}>Filtro Fase</label>
            <select value={stageFilter} onChange={e=>setStageFilter(e.target.value)} style={selSt}>
              <option value="">Todas</option>
              {stages.map(s=><option key={s} value={s}>{s}</option>)}
            </select>
          </div>)}

          <div style={{height:1,background:T.border}}/>

          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <div style={{fontSize:11,fontWeight:600,color:T.textMuted,letterSpacing:"0.06em",textTransform:"uppercase"}}>Banco de Dados</div>
            <SidebarStat label="Partidas" value={stats?.matches??"—"}/>
            <SidebarStat label="Torneios" value={stats?.tournaments??"—"}/>
            <SidebarStat label="Jogadores" value={stats?.players??"—"}/>
            <SidebarStat label="H2H" value={h2hAll.length}/>
          </div>
          <div style={{height:1,background:T.border}}/>

          {/* ELO sidebar */}
          {p1Elo&&p2Elo&&(<div style={{display:"flex",flexDirection:"column",gap:8}}>
            <div style={{fontSize:11,fontWeight:600,color:T.textMuted,letterSpacing:"0.06em",textTransform:"uppercase"}}>ELO Rating</div>
            <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:13,color:T.accent1,fontWeight:600}}>{p1}</span><span style={{fontFamily:"'JetBrains Mono'",fontSize:15,fontWeight:800,color:p1Elo.rating>p2Elo.rating?T.green:T.red}}>{Math.round(p1Elo.rating)}</span></div>
            <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:13,color:T.accent2,fontWeight:600}}>{p2}</span><span style={{fontFamily:"'JetBrains Mono'",fontSize:15,fontWeight:800,color:p2Elo.rating>p1Elo.rating?T.green:T.red}}>{Math.round(p2Elo.rating)}</span></div>
          </div>)}
          <div style={{height:1,background:T.border}}/>

          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <div style={{fontSize:11,fontWeight:600,color:T.textMuted,letterSpacing:"0.06em",textTransform:"uppercase"}}>Streak (H2H)</div>
            <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:13,color:T.accent1,fontWeight:600}}>{p1}</span><StreakBadge streak={p1Streak}/></div>
            <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:13,color:T.accent2,fontWeight:600}}>{p2}</span><StreakBadge streak={p2Streak}/></div>
          </div>

          {h2hAll.length>=3&&(<><div style={{height:1,background:T.border}}/><div style={{display:"flex",flexDirection:"column",gap:8}}>
            <div style={{fontSize:11,fontWeight:600,color:T.textMuted,letterSpacing:"0.06em",textTransform:"uppercase"}}>Forma (Últ.{recentForm.recentN})</div>
            <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:13,color:T.accent1,fontWeight:600}}>{p1}</span><TrendIndicator diff={recentForm.p1Trend}/></div>
            <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:13,color:T.accent2,fontWeight:600}}>{p2}</span><TrendIndicator diff={recentForm.p2Trend}/></div>
          </div></>)}

          <div style={{flex:1}}/>
          <div style={{fontSize:10,color:T.textDim,textAlign:"center"}}><span style={{display:"inline-flex",alignItems:"center",gap:4}}><span style={{width:6,height:6,borderRadius:"50%",background:T.green}}/>API conectada</span></div>
        </aside>

        {/* MAIN */}
        <main style={{flex:1,padding:"28px 32px",maxWidth:1100,overflowY:"auto"}}>
          {p1===p2?(<Card><div style={{textAlign:"center",padding:40,color:T.yellow}}>Selecione dois jogadores diferentes.</div></Card>)
          :(<>
            {/* VS Header */}
            {h2hAll.length>0&&(<div className="fade-up" style={{display:"flex",alignItems:"center",justifyContent:"center",gap:24,marginBottom:24,padding:"20px 0"}}>
              <div style={{textAlign:"right",flex:1}}>
                <div style={{fontSize:28,fontWeight:900,color:T.accent1}}>{p1}</div>
                <div style={{fontSize:12,color:T.textMuted}}>{fmtPct(summary.p1WR)} WR {p1Elo&&`· ELO ${Math.round(p1Elo.rating)}`}</div>
              </div>
              <div style={{width:52,height:52,borderRadius:"50%",background:`linear-gradient(135deg, ${T.accent1}30, ${T.accent2}30)`,border:`2px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'JetBrains Mono'",fontSize:13,fontWeight:800,color:T.textMuted}}>VS</div>
              <div style={{flex:1}}>
                <div style={{fontSize:28,fontWeight:900,color:T.accent2}}>{p2}</div>
                <div style={{fontSize:12,color:T.textMuted}}>{fmtPct(summary.p2WR)} WR {p2Elo&&`· ELO ${Math.round(p2Elo.rating)}`}</div>
              </div>
            </div>)}

            {/* Tabs */}
            <div className="fade-up fade-d1" style={{display:"flex",alignItems:"center",gap:4,marginBottom:20,flexWrap:"wrap"}}>
              {tabs.map(([k,l])=><TabBtn key={k} active={tab===k} onClick={()=>setTab(k)}>{l}</TabBtn>)}
              <div style={{flex:1}}/>
              <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:12,color:T.textMuted}}>
                <input type="checkbox" checked={last10} onChange={()=>setLast10(!last10)} style={{accentColor:T.accent1}}/>Últ.10
              </label>
            </div>

            {h2hAll.length===0&&tab!=="elo"&&tab!=="tempo"&&tab!=="padroes"?(<Card><div style={{textAlign:"center",padding:40,color:T.textMuted}}>Sem H2H entre {p1} e {p2}{stageFilter?` na fase "${stageFilter}"`:""}</div></Card>)
            :(<>
              {/* ═══ GERAL ═══ */}
              {tab==="geral"&&(<div className="fade-up fade-d2">
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
                  <KpiCard label={`${p1} ML`} value={fmtPct(summary.p1WR)} color={pctColor(summary.p1WR)} sub={`Odd ideal: <b style="color:${T.text}">${fmtNum(idealOdd(summary.p1WR))}</b>`}/>
                  <KpiCard label={`${p2} ML`} value={fmtPct(summary.p2WR)} color={pctColor(summary.p2WR)} sub={`Odd ideal: <b style="color:${T.text}">${fmtNum(idealOdd(summary.p2WR))}</b>`}/>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:12,marginBottom:4}}>
                  <KpiCard label="Jogos" value={String(summary.total)} small/>
                  <KpiCard label="Empates" value={String(summary.draws)} small/>
                  <KpiCard label="Média Gols" value={fmtNum(summary.avgGoals)} small color={T.cyan}/>
                  <KpiCard label="Por 1 gol" value={fmtPct(closeGames.pct)} small color={T.purple} sub={`${closeGames.count}/${closeGames.total}`}/>
                </div>
                <SectionTitle icon="⚡">Média Individual (H2H)</SectionTitle>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                  <KpiCard label={`${p1} avg/jogo`} value={fmtNum(p1AvgH2H)} color={T.accent1} small/>
                  <KpiCard label={`${p2} avg/jogo`} value={fmtNum(p2AvgH2H)} color={T.accent2} small/>
                </div>
                <SectionTitle icon="🧮">Handicaps Negativos</SectionTitle>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
                  {[{l:`${p1} -1.5`,p:handicapPct(h2h,true,2)},{l:`${p1} -2.5`,p:handicapPct(h2h,true,3)},{l:`${p2} -1.5`,p:handicapPct(h2h,false,2)},{l:`${p2} -2.5`,p:handicapPct(h2h,false,3)}].map((h,i)=>
                    <KpiCard key={i} label={h.l} value={fmtPct(h.p)} color={pctColor(h.p)} small sub={`Odd: <b style="color:${T.text}">${fmtNum(idealOdd(h.p))}</b>`}/>)}
                </div>
                <SectionTitle icon="🧮">Handicaps Positivos</SectionTitle>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
                  {[{l:`${p1} +1.5`,p:handicapPosPct(h2h,true,1.5)},{l:`${p1} +2.5`,p:handicapPosPct(h2h,true,2.5)},{l:`${p2} +1.5`,p:handicapPosPct(h2h,false,1.5)},{l:`${p2} +2.5`,p:handicapPosPct(h2h,false,2.5)}].map((h,i)=>
                    <KpiCard key={i} label={h.l} value={fmtPct(h.p)} color={pctColor(h.p)} small sub={`Odd: <b style="color:${T.text}">${fmtNum(idealOdd(h.p))}</b>`}/>)}
                </div>
                <SectionTitle icon="🎯">Placares Frequentes</SectionTitle>
                <Card><div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                  {exactScores.map((es,i)=>(<div key={i} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,background:i===0?`${T.cyan}12`:"rgba(255,255,255,0.03)",border:`1px solid ${i===0?`${T.cyan}30`:T.border}`,borderRadius:12,padding:"12px 18px",minWidth:80}}>
                    <span style={{fontFamily:"'JetBrains Mono'",fontSize:20,fontWeight:800,color:i===0?T.cyan:T.text}}>{es.score.replace("×"," × ")}</span>
                    <span style={{fontSize:11,color:T.textMuted,fontWeight:600}}>{es.count}x ({fmtPct(es.pct)})</span>
                  </div>))}
                </div></Card>
                {goalHistory.length>1&&(<><SectionTitle icon="📉">Histórico</SectionTitle><Card>
                  <ResponsiveContainer width="100%" height={180}><LineChart data={goalHistory} margin={{top:8,right:12,left:-20,bottom:4}}>
                    <XAxis dataKey="idx" tick={{fill:T.textDim,fontSize:10}} axisLine={false} tickLine={false}/><YAxis tick={{fill:T.textDim,fontSize:10}} axisLine={false} tickLine={false}/>
                    <Tooltip contentStyle={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,fontSize:12}} labelFormatter={v=>`Jogo ${v}`}/>
                    <ReferenceLine y={summary.avgGoals} stroke={T.textDim} strokeDasharray="4 4"/>
                    <Line type="monotone" dataKey="total" stroke={T.cyan} strokeWidth={2.5} dot={{fill:T.cyan,r:3}}/>
                    <Line type="monotone" dataKey="p1" stroke={T.accent1} strokeWidth={1.5} strokeDasharray="4 2" dot={false}/>
                    <Line type="monotone" dataKey="p2" stroke={T.accent2} strokeWidth={1.5} strokeDasharray="4 2" dot={false}/>
                  </LineChart></ResponsiveContainer>
                  <div style={{display:"flex",justifyContent:"center",gap:18,marginTop:6}}><LegendDot color={T.cyan} label="Total"/><LegendDot color={T.accent1} label={p1}/><LegendDot color={T.accent2} label={p2}/><LegendDot color={T.textDim} label="Média" dashed/></div>
                </Card></>)}
              </div>)}

              {/* ═══ PERÍODOS ═══ */}
              {tab==="periodos"&&(<div className="fade-up fade-d2">

                {/* Situação ao final de cada período */}
                <SectionTitle icon="📊">Situação ao Final de Cada Período</SectionTitle>
                <Card style={{marginBottom:16}}>
                  <div style={{fontSize:12,color:T.textMuted,marginBottom:12}}>
                    Quando {p1} está vencendo, empatando ou perdendo ao final de cada período (placar acumulado).
                  </div>
                  <table style={{width:"100%",borderCollapse:"collapse"}}>
                    <thead><tr>
                      {["","Vencendo","Empate","Perdendo","Jogos"].map((h,i)=><th key={i} style={{textAlign:i===0?"left":"right",padding:"10px 8px",fontSize:11,fontWeight:600,letterSpacing:"0.06em",textTransform:"uppercase",color:T.textMuted,borderBottom:`1px solid ${T.border}`}}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {periodSituation.map((row,i)=>(
                        <tr key={i} style={{borderBottom:`1px solid rgba(255,255,255,0.04)`}}>
                          <td style={{padding:"10px 8px",fontWeight:700,fontSize:14}}>{row.label}</td>
                          <td style={{padding:"10px 8px",textAlign:"right",fontFamily:"'JetBrains Mono'",fontWeight:800,color:T.green}}>{fmtPct(row.winning)}</td>
                          <td style={{padding:"10px 8px",textAlign:"right",fontFamily:"'JetBrains Mono'",fontWeight:800,color:T.yellow}}>{fmtPct(row.drawing)}</td>
                          <td style={{padding:"10px 8px",textAlign:"right",fontFamily:"'JetBrains Mono'",fontWeight:800,color:T.red}}>{fmtPct(row.losing)}</td>
                          <td style={{padding:"10px 8px",textAlign:"right",fontFamily:"'JetBrains Mono'",fontSize:12,color:T.textMuted}}>{row.total}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {/* Stacked bar visualization */}
                  <div style={{marginTop:16}}>
                    {periodSituation.map((row,i)=>(
                      <div key={i} style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                        <span style={{width:50,fontSize:12,fontWeight:600,color:T.textMuted}}>{row.label}</span>
                        <div style={{flex:1,display:"flex",height:20,borderRadius:4,overflow:"hidden"}}>
                          <div style={{width:`${row.winning}%`,background:T.green,transition:"width .6s"}} title={`Vencendo: ${fmtPct(row.winning)}`}/>
                          <div style={{width:`${row.drawing}%`,background:T.yellow,transition:"width .6s"}} title={`Empate: ${fmtPct(row.drawing)}`}/>
                          <div style={{width:`${row.losing}%`,background:T.red,transition:"width .6s"}} title={`Perdendo: ${fmtPct(row.losing)}`}/>
                        </div>
                      </div>
                    ))}
                    <div style={{display:"flex",gap:16,marginTop:8}}>
                      <LegendDot color={T.green} label={`${p1} vencendo`}/><LegendDot color={T.yellow} label="Empate"/><LegendDot color={T.red} label={`${p1} perdendo`}/>
                    </div>
                  </div>
                </Card>

                {/* Viradas e Comebacks */}
                <SectionTitle icon="🔄">Viradas e Comebacks ({p1})</SectionTitle>
                {comebacks.gamesWithPeriods>0?(<>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:12,marginBottom:16}}>
                    <KpiCard label="Perdendo no P1 → Virou" value={fmtPct(comebacks.losingP1.pct)} color={comebacks.losingP1.pct>30?T.green:T.red} small
                      sub={`${comebacks.losingP1.won} de ${comebacks.losingP1.total}`}/>
                    <KpiCard label="Perdendo no P2 → Virou" value={fmtPct(comebacks.losingP2.pct)} color={comebacks.losingP2.pct>20?T.green:T.red} small
                      sub={`${comebacks.losingP2.won} de ${comebacks.losingP2.total}`}/>
                    <KpiCard label="Segurança (ganhou P2 → manteve)" value={fmtPct(comebacks.security.pct)} color={comebacks.security.pct>70?T.green:T.yellow} small
                      sub={`${comebacks.blownLead.total-comebacks.blownLead.lost} de ${comebacks.blownLead.total}`}/>
                    <KpiCard label="Tomou virada (P2 ganhando → perdeu)" value={fmtPct(comebacks.blownLead.pct)} color={comebacks.blownLead.pct<20?T.green:T.red} small
                      sub={`${comebacks.blownLead.lost} de ${comebacks.blownLead.total}`}/>
                  </div>

                  {/* Same for P2 player */}
                  {(()=>{
                    const cb2 = calcComebacks(h2h.map(m=>({...m, p1Score:m.p2Score, p2Score:m.p1Score, period_scores:m.period_scores?
                      (Array.isArray(m.period_scores)?m.period_scores.map(p=>[p[1],p[0]]):{...m.period_scores,periods:(m.period_scores.periods||[]).map(p=>[p[1],p[0]]),overtime:(m.period_scores.overtime||[]).map(p=>[p[1],p[0]])}):null})));
                    return(<>
                      <div style={{fontSize:13,fontWeight:700,color:T.accent2,marginBottom:10}}>Viradas de {p2}</div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:12,marginBottom:16}}>
                        <KpiCard label="Perdendo no P1 → Virou" value={fmtPct(cb2.losingP1.pct)} color={cb2.losingP1.pct>30?T.green:T.red} small sub={`${cb2.losingP1.won} de ${cb2.losingP1.total}`}/>
                        <KpiCard label="Perdendo no P2 → Virou" value={fmtPct(cb2.losingP2.pct)} color={cb2.losingP2.pct>20?T.green:T.red} small sub={`${cb2.losingP2.won} de ${cb2.losingP2.total}`}/>
                        <KpiCard label="Segurança" value={fmtPct(cb2.security.pct)} color={cb2.security.pct>70?T.green:T.yellow} small sub={`${cb2.blownLead.total-cb2.blownLead.lost} de ${cb2.blownLead.total}`}/>
                        <KpiCard label="Tomou virada" value={fmtPct(cb2.blownLead.pct)} color={cb2.blownLead.pct<20?T.green:T.red} small sub={`${cb2.blownLead.lost} de ${cb2.blownLead.total}`}/>
                      </div>
                    </>);
                  })()}
                </>):(<Card><div style={{textAlign:"center",padding:20,color:T.textMuted}}>Sem dados de período suficientes.</div></Card>)}

                {/* Gols por Período */}
                <SectionTitle icon="⚡">Média de Gols por Período</SectionTitle>
                {goalsPerPeriod.count>0?(<>
                  <Card style={{marginBottom:16}}>
                    <div style={{fontSize:12,color:T.textMuted,marginBottom:8}}>Baseado em {goalsPerPeriod.count} jogos com dados de período.</div>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={goalsPerPeriod.periods} margin={{top:8,right:8,left:-20,bottom:4}}>
                        <XAxis dataKey="label" tick={{fill:T.textMuted,fontSize:12}} axisLine={false} tickLine={false}/>
                        <YAxis tick={{fill:T.textDim,fontSize:10}} axisLine={false} tickLine={false}/>
                        <Tooltip contentStyle={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,fontSize:12}} formatter={(v,n)=>[fmtNum(v),n==="p1Avg"?p1:n==="p2Avg"?p2:"Total"]}/>
                        <Bar dataKey="p1Avg" name={p1} fill={T.accent1} radius={[4,4,0,0]} maxBarSize={40}/>
                        <Bar dataKey="p2Avg" name={p2} fill={T.accent2} radius={[4,4,0,0]} maxBarSize={40}/>
                      </BarChart>
                    </ResponsiveContainer>
                    <div style={{display:"flex",justifyContent:"center",gap:18,marginTop:6}}>
                      <LegendDot color={T.accent1} label={p1}/><LegendDot color={T.accent2} label={p2}/>
                    </div>
                  </Card>

                  {/* Gols table */}
                  <Card style={{marginBottom:16}}>
                    <table style={{width:"100%",borderCollapse:"collapse"}}>
                      <thead><tr>
                        {["Período",`${p1} avg`,`${p2} avg`,"Total avg","Período + gols"].map((h,i)=><th key={i} style={{textAlign:i===0?"left":"right",padding:"10px 8px",fontSize:11,fontWeight:600,letterSpacing:"0.06em",textTransform:"uppercase",color:T.textMuted,borderBottom:`1px solid ${T.border}`}}>{h}</th>)}
                      </tr></thead>
                      <tbody>
                        {goalsPerPeriod.periods.map((row,i)=>{
                          const maxAvg = Math.max(...goalsPerPeriod.periods.map(r=>r.totalAvg));
                          const isMax = row.totalAvg === maxAvg;
                          return(<tr key={i} style={{borderBottom:`1px solid rgba(255,255,255,0.04)`}}>
                            <td style={{padding:"10px 8px",fontWeight:700,fontSize:14}}>{row.label}</td>
                            <td style={{padding:"10px 8px",textAlign:"right",fontFamily:"'JetBrains Mono'",fontWeight:700,color:T.accent1}}>{fmtNum(row.p1Avg)}</td>
                            <td style={{padding:"10px 8px",textAlign:"right",fontFamily:"'JetBrains Mono'",fontWeight:700,color:T.accent2}}>{fmtNum(row.p2Avg)}</td>
                            <td style={{padding:"10px 8px",textAlign:"right",fontFamily:"'JetBrains Mono'",fontWeight:800,color:isMax?T.cyan:T.text}}>{fmtNum(row.totalAvg)}</td>
                            <td style={{padding:"10px 8px",textAlign:"right",fontFamily:"'JetBrains Mono'",fontSize:12,color:isMax?T.cyan:T.textMuted}}>{isMax?"🔥 Mais quente":""}</td>
                          </tr>);
                        })}
                      </tbody>
                    </table>
                  </Card>
                </>):(<Card><div style={{textAlign:"center",padding:20,color:T.textMuted}}>Sem dados de período.</div></Card>)}

                {/* Over/Under por Período */}
                <SectionTitle icon="📈">Over/Under por Período</SectionTitle>
                {ouPerPeriod.length>0?(<Card>
                  <div style={{fontSize:12,color:T.textMuted,marginBottom:12}}>% de jogos acima de cada linha, por período individual.</div>
                  <table style={{width:"100%",borderCollapse:"collapse"}}>
                    <thead><tr>
                      {["Período","O 0.5","O 1.5","O 2.5","O 3.5","Avg","0×0 %"].map((h,i)=><th key={i} style={{textAlign:i===0?"left":"right",padding:"10px 8px",fontSize:11,fontWeight:600,letterSpacing:"0.06em",textTransform:"uppercase",color:T.textMuted,borderBottom:`1px solid ${T.border}`}}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {ouPerPeriod.map((row,i)=>(
                        <tr key={i} style={{borderBottom:`1px solid rgba(255,255,255,0.04)`}}>
                          <td style={{padding:"10px 8px",fontWeight:700,fontSize:14}}>{row.label}</td>
                          <td style={{padding:"10px 8px",textAlign:"right",fontFamily:"'JetBrains Mono'",fontWeight:800,color:pctColor(row["over_0.5"])}}>{fmtPct(row["over_0.5"])}</td>
                          <td style={{padding:"10px 8px",textAlign:"right",fontFamily:"'JetBrains Mono'",fontWeight:800,color:pctColor(row["over_1.5"])}}>{fmtPct(row["over_1.5"])}</td>
                          <td style={{padding:"10px 8px",textAlign:"right",fontFamily:"'JetBrains Mono'",fontWeight:800,color:pctColor(row["over_2.5"])}}>{fmtPct(row["over_2.5"])}</td>
                          <td style={{padding:"10px 8px",textAlign:"right",fontFamily:"'JetBrains Mono'",fontWeight:800,color:pctColor(row["over_3.5"])}}>{fmtPct(row["over_3.5"])}</td>
                          <td style={{padding:"10px 8px",textAlign:"right",fontFamily:"'JetBrains Mono'",fontWeight:700,color:T.cyan}}>{fmtNum(row.avg)}</td>
                          <td style={{padding:"10px 8px",textAlign:"right",fontFamily:"'JetBrains Mono'",fontSize:12,color:row.zero>15?T.purple:T.textMuted}}>{fmtPct(row.zero)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>):(<Card><div style={{textAlign:"center",padding:20,color:T.textMuted}}>Sem dados de período.</div></Card>)}

              </div>)}

              {/* ═══ PADRÕES GLOBAIS ═══ */}
              {tab==="padroes"&&(<div className="fade-up fade-d2">
                <SectionTitle icon="🔬">Padrões Globais ({globalPatterns.gamesWithPeriods} jogos com dados de período)</SectionTitle>

                {/* Média geral por período */}
                <Card style={{marginBottom:16}}>
                  <div style={{fontSize:12,fontWeight:600,color:T.textMuted,letterSpacing:"0.04em",textTransform:"uppercase",marginBottom:12}}>Média de Gols por Período (Todos os Jogos)</div>
                  <div style={{display:"flex",gap:16}}>
                    {[{l:"P1",v:globalPatterns.avgByPeriod.p1},{l:"P2",v:globalPatterns.avgByPeriod.p2},{l:"P3",v:globalPatterns.avgByPeriod.p3}].map((p,i)=>(
                      <div key={i} style={{flex:1,textAlign:"center",padding:"12px 0",background:"rgba(255,255,255,0.03)",borderRadius:12,border:`1px solid ${T.border}`}}>
                        <div style={{fontSize:11,color:T.textDim,marginBottom:4}}>{p.l}</div>
                        <div style={{fontFamily:"'JetBrains Mono'",fontSize:28,fontWeight:800,color:p.v===Math.max(globalPatterns.avgByPeriod.p1,globalPatterns.avgByPeriod.p2,globalPatterns.avgByPeriod.p3)?T.cyan:T.text}}>{fmtNum(p.v)}</div>
                      </div>
                    ))}
                  </div>
                </Card>

                {/* P3 após P2 com muitos gols */}
                <SectionTitle icon="📉">P2 com muitos gols → Como fica o P3?</SectionTitle>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
                  <Card>
                    <div style={{fontSize:11,fontWeight:600,color:T.textMuted,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:8}}>P2 com 4+ gols → P3</div>
                    <div style={{fontFamily:"'JetBrains Mono'",fontSize:32,fontWeight:800,color:T.cyan}}>{fmtNum(globalPatterns.p3AfterHighP2.avg)}</div>
                    <div style={{fontSize:12,color:T.textMuted,marginTop:4}}>avg gols no P3 ({globalPatterns.p3AfterHighP2.count} jogos)</div>
                  </Card>
                  <Card>
                    <div style={{fontSize:11,fontWeight:600,color:T.textMuted,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:8}}>P2 com menos de 4 gols → P3</div>
                    <div style={{fontFamily:"'JetBrains Mono'",fontSize:32,fontWeight:800,color:T.text}}>{fmtNum(globalPatterns.p3AfterLowP2.avg)}</div>
                    <div style={{fontSize:12,color:T.textMuted,marginTop:4}}>avg gols no P3 ({globalPatterns.p3AfterLowP2.count} jogos)</div>
                  </Card>
                </div>

                {/* P1 impacto no P3 */}
                <SectionTitle icon="📊">P1 com muitos gols → Como fica o P3?</SectionTitle>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
                  <Card>
                    <div style={{fontSize:11,fontWeight:600,color:T.textMuted,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:8}}>P1 com 3+ gols → P3</div>
                    <div style={{fontFamily:"'JetBrains Mono'",fontSize:32,fontWeight:800,color:T.cyan}}>{fmtNum(globalPatterns.p3AfterHighP1.avg)}</div>
                    <div style={{fontSize:12,color:T.textMuted,marginTop:4}}>{globalPatterns.p3AfterHighP1.count} jogos</div>
                  </Card>
                  <Card>
                    <div style={{fontSize:11,fontWeight:600,color:T.textMuted,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:8}}>P1 com menos de 3 gols → P3</div>
                    <div style={{fontFamily:"'JetBrains Mono'",fontSize:32,fontWeight:800,color:T.text}}>{fmtNum(globalPatterns.p3AfterLowP1.avg)}</div>
                    <div style={{fontSize:12,color:T.textMuted,marginTop:4}}>{globalPatterns.p3AfterLowP1.count} jogos</div>
                  </Card>
                </div>

                {/* P1 = 0x0 */}
                <SectionTitle icon="🥶">Quando o P1 termina 0×0</SectionTitle>
                <Card style={{marginBottom:16}}>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16}}>
                    <div style={{textAlign:"center"}}>
                      <div style={{fontSize:11,color:T.textDim,marginBottom:4}}>Jogos com P1 = 0×0</div>
                      <div style={{fontFamily:"'JetBrains Mono'",fontSize:28,fontWeight:800}}>{globalPatterns.afterP1Zero.count}</div>
                    </div>
                    <div style={{textAlign:"center"}}>
                      <div style={{fontSize:11,color:T.textDim,marginBottom:4}}>Avg gols P2+P3</div>
                      <div style={{fontFamily:"'JetBrains Mono'",fontSize:28,fontWeight:800,color:T.cyan}}>{fmtNum(globalPatterns.afterP1Zero.avgGoals)}</div>
                    </div>
                    <div style={{textAlign:"center"}}>
                      <div style={{fontSize:11,color:T.textDim,marginBottom:4}}>P2 com 3+ gols</div>
                      <div style={{fontFamily:"'JetBrains Mono'",fontSize:28,fontWeight:800,color:T.green}}>{fmtPct(globalPatterns.afterP1Zero.hiP2pct)}</div>
                    </div>
                  </div>
                </Card>

                {/* Goleada no P1 */}
                <SectionTitle icon="💥">Goleada no P1 (diferença 3+)</SectionTitle>
                <Card style={{marginBottom:16}}>
                  <div style={{fontSize:12,color:T.textMuted,marginBottom:12}}>Quando um jogador abre 3+ gols no P1, o que acontece depois?</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16}}>
                    <div style={{textAlign:"center"}}>
                      <div style={{fontSize:11,color:T.textDim,marginBottom:4}}>Jogos</div>
                      <div style={{fontFamily:"'JetBrains Mono'",fontSize:28,fontWeight:800}}>{globalPatterns.blowP1.count}</div>
                    </div>
                    <div style={{textAlign:"center"}}>
                      <div style={{fontSize:11,color:T.textDim,marginBottom:4}}>Avg gols P2</div>
                      <div style={{fontFamily:"'JetBrains Mono'",fontSize:28,fontWeight:800,color:T.accent1}}>{fmtNum(globalPatterns.blowP1.p2Avg)}</div>
                    </div>
                    <div style={{textAlign:"center"}}>
                      <div style={{fontSize:11,color:T.textDim,marginBottom:4}}>Avg gols P3</div>
                      <div style={{fontFamily:"'JetBrains Mono'",fontSize:28,fontWeight:800,color:T.accent2}}>{fmtNum(globalPatterns.blowP1.p3Avg)}</div>
                    </div>
                  </div>
                </Card>

                {/* Jogo equilibrado no P2 */}
                <SectionTitle icon="⚖️">Jogo Equilibrado no P2 (diferença ≤ 1)</SectionTitle>
                <Card style={{marginBottom:16}}>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16}}>
                    <div style={{textAlign:"center"}}>
                      <div style={{fontSize:11,color:T.textDim,marginBottom:4}}>Jogos</div>
                      <div style={{fontFamily:"'JetBrains Mono'",fontSize:28,fontWeight:800}}>{globalPatterns.closeP2.count}</div>
                    </div>
                    <div style={{textAlign:"center"}}>
                      <div style={{fontSize:11,color:T.textDim,marginBottom:4}}>Avg gols P3</div>
                      <div style={{fontFamily:"'JetBrains Mono'",fontSize:28,fontWeight:800,color:T.cyan}}>{fmtNum(globalPatterns.closeP2.p3Avg)}</div>
                    </div>
                    <div style={{textAlign:"center"}}>
                      <div style={{fontSize:11,color:T.textDim,marginBottom:4}}>P3 com 3+ gols</div>
                      <div style={{fontFamily:"'JetBrains Mono'",fontSize:28,fontWeight:800,color:T.green}}>{fmtPct(globalPatterns.closeP2.p3DecPct)}</div>
                    </div>
                  </div>
                </Card>

                {/* Viradas no jogo geral */}
                <SectionTitle icon="🔄">Viradas — Quem lidera no P2 segura?</SectionTitle>
                <Card>
                  <div style={{fontSize:12,color:T.textMuted,marginBottom:12}}>De {globalPatterns.leadP2.count} jogos onde alguém liderava ao final do P2:</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
                    <div style={{textAlign:"center",padding:12,background:`${T.green}10`,borderRadius:10,border:`1px solid ${T.green}20`}}>
                      <div style={{fontSize:11,color:T.textDim,marginBottom:4}}>Ampliou vantagem</div>
                      <div style={{fontFamily:"'JetBrains Mono'",fontSize:24,fontWeight:800,color:T.green}}>{fmtPct(globalPatterns.leadP2.extendPct)}</div>
                    </div>
                    <div style={{textAlign:"center",padding:12,background:`${T.red}10`,borderRadius:10,border:`1px solid ${T.red}20`}}>
                      <div style={{fontSize:11,color:T.textDim,marginBottom:4}}>Tomou virada</div>
                      <div style={{fontFamily:"'JetBrains Mono'",fontSize:24,fontWeight:800,color:T.red}}>{fmtPct(globalPatterns.leadP2.comebackPct)}</div>
                    </div>
                    <div style={{textAlign:"center",padding:12,background:`${T.yellow}10`,borderRadius:10,border:`1px solid ${T.yellow}20`}}>
                      <div style={{fontSize:11,color:T.textDim,marginBottom:4}}>Empatou</div>
                      <div style={{fontFamily:"'JetBrains Mono'",fontSize:24,fontWeight:800,color:T.yellow}}>{fmtPct(globalPatterns.leadP2.drawPct)}</div>
                    </div>
                  </div>
                </Card>
              </div>)}

              {/* ═══ FORMA ═══ */}
              {tab==="forma"&&(<div className="fade-up fade-d2">
                <SectionTitle icon="🔥">Forma — Últ.{recentForm.recentN} vs Geral</SectionTitle>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
                  {[{name:p1,color:T.accent1,wrAll:recentForm.p1WR_all,wrR:recentForm.p1WR_recent,trend:recentForm.p1Trend},{name:p2,color:T.accent2,wrAll:recentForm.p2WR_all,wrR:recentForm.p2WR_recent,trend:recentForm.p2Trend}].map((pl,i)=>(
                    <Card key={i}><div style={{fontSize:11,fontWeight:600,letterSpacing:"0.06em",textTransform:"uppercase",color:pl.color,marginBottom:12}}>{pl.name}</div>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                        <div><div style={{fontSize:11,color:T.textDim}}>WR Geral</div><div style={{fontFamily:"'JetBrains Mono'",fontSize:24,fontWeight:800,color:T.textMuted}}>{fmtPct(pl.wrAll)}</div></div>
                        <div style={{textAlign:"right"}}><div style={{fontSize:11,color:T.textDim}}>WR Recente</div><div style={{fontFamily:"'JetBrains Mono'",fontSize:24,fontWeight:800,color:pctColor(pl.wrR)}}>{fmtPct(pl.wrR)}</div></div>
                      </div>
                      <div style={{display:"flex",justifyContent:"center"}}><TrendIndicator diff={pl.trend} label={pl.trend>5?"em alta":pl.trend<-5?"em queda":"estável"}/></div>
                      <div style={{marginTop:12}}><MiniBar pct={pl.wrR} color={pctColor(pl.wrR)} height={6}/></div>
                    </Card>))}
                </div>
              </div>)}

              {/* ═══ O/U ═══ */}
              {tab==="ou"&&(<div className="fade-up fade-d2">
                <SectionTitle icon="📈">Over / Under</SectionTitle>
                <Card><table style={{width:"100%",borderCollapse:"collapse"}}>
                  <thead><tr>{["Linha","Over","Odd","Under","Odd"].map((h,i)=><th key={i} style={{textAlign:i===0?"left":"right",padding:"10px",fontSize:11,fontWeight:600,letterSpacing:"0.06em",textTransform:"uppercase",color:T.textMuted,borderBottom:`1px solid ${T.border}`}}>{h}</th>)}</tr></thead>
                  <tbody>{ouData.map((r,i)=>(<tr key={i} style={{borderBottom:`1px solid rgba(255,255,255,0.04)`}} onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.03)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <td style={{padding:10,fontFamily:"'JetBrains Mono'",fontWeight:600,fontSize:14}}>{fmtNum(r.line,1)}</td>
                    <td style={{padding:10,textAlign:"right",fontFamily:"'JetBrains Mono'",fontWeight:800,fontSize:14,color:pctColor(r.over)}}>{fmtPct(r.over)}</td>
                    <td style={{padding:10,textAlign:"right",fontFamily:"'JetBrains Mono'",fontSize:12,color:T.textMuted}}>{fmtNum(idealOdd(r.over))}</td>
                    <td style={{padding:10,textAlign:"right",fontFamily:"'JetBrains Mono'",fontWeight:800,fontSize:14,color:pctColor(r.under)}}>{fmtPct(r.under)}</td>
                    <td style={{padding:10,textAlign:"right",fontFamily:"'JetBrains Mono'",fontSize:12,color:T.textMuted}}>{fmtNum(idealOdd(r.under))}</td>
                  </tr>))}</tbody>
                </table></Card>
                <SectionTitle icon="🎯">Cobertura de Linhas</SectionTitle>
                <Card><div style={{fontSize:12,color:T.textMuted,marginBottom:12}}>% de jogos que caíram exatamente no inteiro acima da linha.</div>
                  <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>{lineCoverage.map((lc,i)=>(<div key={i} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6,background:lc.pct>15?`${T.purple}12`:"rgba(255,255,255,0.03)",border:`1px solid ${lc.pct>15?`${T.purple}30`:T.border}`,borderRadius:12,padding:"12px 16px",minWidth:90,flex:1}}>
                    <span style={{fontSize:11,color:T.textDim,fontWeight:600}}>Linha {fmtNum(lc.line,1)}</span>
                    <span style={{fontFamily:"'JetBrains Mono'",fontSize:22,fontWeight:800,color:lc.pct>15?T.purple:T.text}}>{fmtPct(lc.pct)}</span>
                    <span style={{fontSize:11,color:T.textMuted}}>{lc.hits}x = {lc.target}</span>
                  </div>))}</div>
                </Card>
              </div>)}

              {/* ═══ KELLY SIMULATOR ═══ */}
              {tab==="kelly"&&(<div className="fade-up fade-d2">
                <SectionTitle icon="💰">Simulador de Apostas (Kelly)</SectionTitle>
                <Card style={{marginBottom:16}}>
                  <div style={{fontSize:12,color:T.textMuted,marginBottom:16,lineHeight:1.6}}>
                    Insira a odd da casa e o critério de Kelly calcula a stake ideal baseado na probabilidade histórica. O Kelly fracionário (25%) é mais conservador e recomendado.
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:16}}>
                    <div>
                      <label style={{fontSize:11,fontWeight:600,color:T.textMuted,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:6,display:"block"}}>Mercado</label>
                      <select value={kellyTarget} onChange={e=>setKellyTarget(e.target.value)} style={selSt}>
                        <option value="p1_ml">{p1} ML</option>
                        <option value="p2_ml">{p2} ML</option>
                        <option value="p1_ah15">{p1} AH -1.5</option>
                        <option value="p1_ah25">{p1} AH -2.5</option>
                        <option value="p2_ah15">{p2} AH -1.5</option>
                        <option value="p2_ah25">{p2} AH -2.5</option>
                        {OU_LINES.map(l=><option key={`o${l}`} value={`over_${l}`}>Over {l}</option>)}
                        {OU_LINES.map(l=><option key={`u${l}`} value={`under_${l}`}>Under {l}</option>)}
                      </select>
                    </div>
                    <InputField label="Odd da Casa" value={kellyOdd} onChange={setKellyOdd} placeholder="Ex: 1.85"/>
                    <InputField label="Banca (R$)" value={kellyBankroll} onChange={setKellyBankroll} placeholder="1000"/>
                  </div>

                  {/* Probability display */}
                  <div style={{display:"flex",gap:16,marginBottom:16,padding:"12px 16px",background:"rgba(255,255,255,0.03)",borderRadius:12}}>
                    <div><div style={{fontSize:11,color:T.textDim}}>Prob. Histórica</div><div style={{fontFamily:"'JetBrains Mono'",fontSize:20,fontWeight:800,color:pctColor(kellyProb)}}>{fmtPct(kellyProb)}</div></div>
                    <div><div style={{fontSize:11,color:T.textDim}}>Odd Ideal</div><div style={{fontFamily:"'JetBrains Mono'",fontSize:20,fontWeight:800,color:T.text}}>{fmtNum(idealOdd(kellyProb))}</div></div>
                    {kellyOdd&&(<div><div style={{fontSize:11,color:T.textDim}}>Odd Casa</div><div style={{fontFamily:"'JetBrains Mono'",fontSize:20,fontWeight:800,color:parseFloat(kellyOdd.replace(",","."))>idealOdd(kellyProb)?T.green:T.red}}>{kellyOdd}</div></div>)}
                  </div>

                  {kellyResult&&(<div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:12}}>
                    <div style={{textAlign:"center",padding:16,background:kellyResult.edge>0?`${T.green}10`:`${T.red}10`,borderRadius:12,border:`1px solid ${kellyResult.edge>0?`${T.green}30`:`${T.red}30`}`}}>
                      <div style={{fontSize:11,color:T.textDim,marginBottom:4}}>Edge</div>
                      <div style={{fontFamily:"'JetBrains Mono'",fontSize:22,fontWeight:800,color:kellyResult.edge>0?T.green:T.red}}>{kellyResult.edge>0?"+":""}{fmtPct(kellyResult.edge)}</div>
                    </div>
                    <div style={{textAlign:"center",padding:16,background:"rgba(255,255,255,0.03)",borderRadius:12,border:`1px solid ${T.border}`}}>
                      <div style={{fontSize:11,color:T.textDim,marginBottom:4}}>Kelly Full</div>
                      <div style={{fontFamily:"'JetBrains Mono'",fontSize:22,fontWeight:800,color:T.text}}>R$ {kellyResult.stake>0?kellyResult.stake.toFixed(0):"0"}</div>
                      <div style={{fontSize:10,color:T.textDim}}>{(kellyResult.fraction*100).toFixed(1)}% da banca</div>
                    </div>
                    <div style={{textAlign:"center",padding:16,background:`${T.cyan}10`,borderRadius:12,border:`1px solid ${T.cyan}30`}}>
                      <div style={{fontSize:11,color:T.textDim,marginBottom:4}}>Kelly 25%</div>
                      <div style={{fontFamily:"'JetBrains Mono'",fontSize:22,fontWeight:800,color:T.cyan}}>R$ {kellyResult.stake>0?(kellyResult.stake*0.25).toFixed(0):"0"}</div>
                      <div style={{fontSize:10,color:T.textDim}}>Recomendado</div>
                    </div>
                    <div style={{textAlign:"center",padding:16,background:kellyResult.edge>0?`${T.green}08`:"rgba(255,255,255,0.03)",borderRadius:12,border:`1px solid ${T.border}`}}>
                      <div style={{fontSize:11,color:T.textDim,marginBottom:4}}>Veredicto</div>
                      <div style={{fontFamily:"'JetBrains Mono'",fontSize:16,fontWeight:800,color:kellyResult.edge>0?T.green:T.red}}>{kellyResult.edge>0?"✅ VALUE":"❌ SEM VALOR"}</div>
                    </div>
                  </div>)}
                </Card>
              </div>)}

              {/* ═══ ELO ═══ */}
              {tab==="elo"&&(<div className="fade-up fade-d2">
                <SectionTitle icon="🏆">Ranking ELO</SectionTitle>
                {eloData&&(<>
                  <Card style={{marginBottom:16}}>
                    <table style={{width:"100%",borderCollapse:"collapse"}}>
                      <thead><tr>{["#","Jogador","ELO","Jogos","WR","V","D","E"].map((h,i)=><th key={i} style={{textAlign:i<2?"left":"right",padding:"10px 8px",fontSize:11,fontWeight:600,letterSpacing:"0.06em",textTransform:"uppercase",color:T.textMuted,borderBottom:`1px solid ${T.border}`}}>{h}</th>)}</tr></thead>
                      <tbody>{eloData.map((e,i)=>{
                        const isSelected=e.player===p1||e.player===p2;
                        const clr=e.player===p1?T.accent1:e.player===p2?T.accent2:T.text;
                        return(<tr key={i} style={{borderBottom:`1px solid rgba(255,255,255,0.04)`,background:isSelected?"rgba(59,130,246,0.06)":"transparent"}}>
                          <td style={{padding:"9px 8px",fontFamily:"'JetBrains Mono'",fontSize:14,fontWeight:700,color:i<3?T.yellow:T.textMuted}}>{i+1}</td>
                          <td style={{padding:"9px 8px",fontSize:14,fontWeight:700,color:clr}}>{e.player}</td>
                          <td style={{padding:"9px 8px",textAlign:"right",fontFamily:"'JetBrains Mono'",fontSize:16,fontWeight:800,color:e.rating>=1500?T.green:T.red}}>{Math.round(e.rating)}</td>
                          <td style={{padding:"9px 8px",textAlign:"right",fontFamily:"'JetBrains Mono'",fontSize:13,color:T.textMuted}}>{e.games}</td>
                          <td style={{padding:"9px 8px",textAlign:"right",fontFamily:"'JetBrains Mono'",fontSize:13,color:pctColor(e.wr)}}>{fmtPct(e.wr)}</td>
                          <td style={{padding:"9px 8px",textAlign:"right",fontSize:13,color:T.green}}>{e.wins}</td>
                          <td style={{padding:"9px 8px",textAlign:"right",fontSize:13,color:T.red}}>{e.losses}</td>
                          <td style={{padding:"9px 8px",textAlign:"right",fontSize:13,color:T.yellow}}>{e.draws}</td>
                        </tr>);
                      })}</tbody>
                    </table>
                  </Card>

                  {/* ELO history chart */}
                  {p1Elo&&p2Elo&&(<><SectionTitle icon="📈">Evolução ELO</SectionTitle><Card>
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart margin={{top:8,right:12,left:-20,bottom:4}}>
                        <XAxis dataKey="game" tick={{fill:T.textDim,fontSize:10}} axisLine={false} tickLine={false} type="number" domain={["dataMin","dataMax"]}/>
                        <YAxis tick={{fill:T.textDim,fontSize:10}} axisLine={false} tickLine={false}/>
                        <Tooltip contentStyle={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,fontSize:12}}/>
                        <ReferenceLine y={1500} stroke={T.textDim} strokeDasharray="4 4"/>
                        <Line data={p1Elo.history} dataKey="rating" name={p1} stroke={T.accent1} strokeWidth={2} dot={false}/>
                        <Line data={p2Elo.history} dataKey="rating" name={p2} stroke={T.accent2} strokeWidth={2} dot={false}/>
                      </LineChart>
                    </ResponsiveContainer>
                    <div style={{display:"flex",justifyContent:"center",gap:18,marginTop:6}}><LegendDot color={T.accent1} label={p1}/><LegendDot color={T.accent2} label={p2}/><LegendDot color={T.textDim} label="Base 1500" dashed/></div>
                  </Card></>)}
                </>)}
              </div>)}

              {/* ═══ TIME PATTERNS ═══ */}
              {tab==="tempo"&&(<div className="fade-up fade-d2">
                <SectionTitle icon="🕐">Padrões por Horário</SectionTitle>
                {[{name:p1,color:T.accent1,data:tp1.data},{name:p2,color:T.accent2,data:tp2.data}].map((pl,idx)=>pl.data&&(
                  <div key={idx} style={{marginBottom:24}}>
                    <div style={{fontSize:14,fontWeight:700,color:pl.color,marginBottom:12}}>{pl.name}</div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                      {/* By hour */}
                      <Card>
                        <div style={{fontSize:11,fontWeight:600,color:T.textMuted,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:10}}>WR% por Hora</div>
                        <ResponsiveContainer width="100%" height={140}>
                          <BarChart data={pl.data.by_hour} margin={{top:4,right:4,left:-20,bottom:4}}>
                            <XAxis dataKey="label" tick={{fill:T.textDim,fontSize:9}} axisLine={false} tickLine={false} interval={1}/>
                            <YAxis tick={{fill:T.textDim,fontSize:9}} axisLine={false} tickLine={false} domain={[0,100]}/>
                            <Tooltip contentStyle={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,fontSize:11}} formatter={(v,n)=>[`${v}%`,n==="wr"?"WR":n]}/>
                            <Bar dataKey="wr" radius={[4,4,0,0]} maxBarSize={20}>
                              {pl.data.by_hour.map((e,i)=><Cell key={i} fill={pctColor(e.wr)} fillOpacity={0.8}/>)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                        <div style={{fontSize:10,color:T.textDim,marginTop:4}}>Melhores horários destacados em verde</div>
                      </Card>
                      {/* By weekday */}
                      <Card>
                        <div style={{fontSize:11,fontWeight:600,color:T.textMuted,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:10}}>WR% por Dia</div>
                        <ResponsiveContainer width="100%" height={140}>
                          <BarChart data={pl.data.by_weekday} margin={{top:4,right:4,left:-20,bottom:4}}>
                            <XAxis dataKey="label" tick={{fill:T.textDim,fontSize:10}} axisLine={false} tickLine={false}/>
                            <YAxis tick={{fill:T.textDim,fontSize:9}} axisLine={false} tickLine={false} domain={[0,100]}/>
                            <Tooltip contentStyle={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,fontSize:11}} formatter={(v,n)=>[`${v}%`,n==="wr"?"WR":n]}/>
                            <Bar dataKey="wr" radius={[4,4,0,0]} maxBarSize={28}>
                              {pl.data.by_weekday.map((e,i)=><Cell key={i} fill={pctColor(e.wr)} fillOpacity={0.8}/>)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </Card>
                    </div>
                    {/* Best/worst summary */}
                    {pl.data.by_hour.length>0&&(()=>{
                      const best=pl.data.by_hour.filter(h=>h.games>=3).sort((a,b)=>b.wr-a.wr)[0];
                      const worst=pl.data.by_hour.filter(h=>h.games>=3).sort((a,b)=>a.wr-b.wr)[0];
                      return best&&worst?(<div style={{display:"flex",gap:12,marginTop:8}}>
                        <div style={{flex:1,padding:"8px 12px",background:`${T.green}10`,borderRadius:10,border:`1px solid ${T.green}20`,fontSize:12}}>
                          <span style={{color:T.textDim}}>Melhor hora: </span><span style={{color:T.green,fontWeight:700}}>{best.label}</span><span style={{color:T.textMuted}}> ({fmtPct(best.wr)}, {best.games} jogos)</span>
                        </div>
                        <div style={{flex:1,padding:"8px 12px",background:`${T.red}10`,borderRadius:10,border:`1px solid ${T.red}20`,fontSize:12}}>
                          <span style={{color:T.textDim}}>Pior hora: </span><span style={{color:T.red,fontWeight:700}}>{worst.label}</span><span style={{color:T.textMuted}}> ({fmtPct(worst.wr)}, {worst.games} jogos)</span>
                        </div>
                      </div>):null;
                    })()}
                  </div>
                ))}
              </div>)}

              {/* ═══ CONFRONTOS ═══ */}
              {tab==="confrontos"&&(<div className="fade-up fade-d2">
                <SectionTitle icon="📋">Confrontos</SectionTitle>
                <Card style={{padding:"8px 10px"}}><div style={{overflowX:"auto"}}>
                  <table style={{width:"100%",borderCollapse:"collapse"}}>
                    <thead><tr>{["Data",p1,"",p2,"Torneio","Fase"].map((h,i)=><th key={i} style={{textAlign:i===2?"center":"left",padding:"10px 8px",fontSize:11,fontWeight:600,letterSpacing:"0.06em",textTransform:"uppercase",color:T.textMuted,borderBottom:`1px solid ${T.border}`,whiteSpace:"nowrap"}}>{h}</th>)}</tr></thead>
                    <tbody>{h2h.map((m,i)=>{const w=m.p1Score>m.p2Score,l=m.p2Score>m.p1Score;return(<tr key={i} style={{borderBottom:`1px solid rgba(255,255,255,0.04)`}} onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.03)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                      <td style={{padding:"9px 8px",fontSize:12,color:T.textMuted,fontFamily:"'JetBrains Mono'",whiteSpace:"nowrap"}}>{m.date?.split(" ")[0]}</td>
                      <td style={{padding:"9px 8px",fontFamily:"'JetBrains Mono'",fontSize:16,fontWeight:800,color:w?T.green:l?T.red:T.yellow,textAlign:"center"}}>{m.p1Score}</td>
                      <td style={{padding:"9px 4px",textAlign:"center",color:T.textDim,fontSize:11,fontWeight:700}}>×</td>
                      <td style={{padding:"9px 8px",fontFamily:"'JetBrains Mono'",fontSize:16,fontWeight:800,color:l?T.green:w?T.red:T.yellow,textAlign:"center"}}>{m.p2Score}</td>
                      <td style={{padding:"9px 8px",fontSize:12,color:T.textMuted,whiteSpace:"nowrap"}}>{m.tournament_name||m.tournament}</td>
                      <td style={{padding:"9px 8px",fontSize:12,color:T.textDim}}>{m.stage}</td>
                    </tr>);})}</tbody>
                  </table>
                </div></Card>
              </div>)}
            </>)}
          </>)}
        </main>
      </div>
    </div>
  );
}
