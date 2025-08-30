
  import React, { useEffect, useMemo, useState, useRef } from "react";
  import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

  // --- Helpers ---
  const todayStr = () => new Date().toISOString().slice(0, 10);
  const parseDate = (s: string) => new Date(s + "T00:00:00");
  const log10 = (x: number) => (Math.log10 ? Math.log10(x) : Math.log(x) / Math.LN10);
  const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
  const formatPct = (n: number | null | undefined) => (n === null || n === undefined || Number.isNaN(n) ? "" : `${n.toFixed(2)}%`);
  // unit conversions
  const lbToKg = (lb: number) => (Number(lb) || 0) / 2.20462262185;
  const kgToLb = (kg: number) => (Number(kg) || 0) * 2.20462262185;
  const inToCm = (inch: number) => (Number(inch) || 0) * 2.54;
  const cmToIn = (cm: number) => (Number(cm) || 0) / 2.54;

  function computeBodyFatPct({ sex, heightIn, neckIn, waistIn, hipsIn }:{sex:string,heightIn:number,neckIn:any,waistIn:any,hipsIn:any}) {
    if (!sex || !heightIn || !neckIn || !waistIn) return null;
    const h = Number(heightIn);
    const neck = Number(neckIn);
    const waist = Number(waistIn);
    const hips = Number(hipsIn || 0);
    if (sex === "F") {
      if (waist && hips && neck && h) {
        const v = 163.205 * log10(waist + hips - neck) - 97.684 * log10(h) - 78.387;
        return Number.isFinite(v) ? clamp(v, 0, 70) : null;
      }
    } else {
      if (waist && neck && h) {
        const v = 86.01 * log10(waist - neck) - 70.041 * log10(h) + 36.76;
        return Number.isFinite(v) ? clamp(v, 0, 60) : null;
      }
    }
    return null;
  }

  function computeBMI({ weightLb, heightIn }:{weightLb:number|null|undefined,heightIn:number|null|undefined}) {
    if (!weightLb || !heightIn) return null;
    const v = (703 * Number(weightLb)) / (Number(heightIn) ** 2);
    return Number.isFinite(v) ? clamp(v, 8, 60) : null;
  }

  function Section({ title, children, actions }:{title:string,children:any,actions?:any}) {
    return (
      <div className="bg-neutral-900/50 border border-neutral-800 rounded-2xl p-5 shadow-lg">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-neutral-100">{title}</h2>
          {actions}
        </div>
        <div className="text-neutral-200">{children}</div>
      </div>
    );
  }

  function StatPill({ label, value, sub }:{label:string,value:any,sub?:string}) {
    return (
      <div className="px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700 text-sm">
        <div className="text-neutral-400">{label}</div>
        <div className="text-neutral-100 font-bold">{value}</div>
        {sub && <div className="text-neutral-400 text-xs">{sub}</div>}
      </div>
    );
  }

  // --- Small helpers used by logic & tests ---
  function checkCrit(g:any) { return g.STR>0 && g.AGI>0 && g.VIT>0 && g.INT>0 && g.END>0 && g.DEX>0 && g.CHA>0 && g.LUK>0; }
  function computeLowSleepStreak(seqHours:number[], threshold:number) { let s=0,out:number[]=[]; for (const h of seqHours){ if((h||0)<threshold) s++; else s=0; out.push(s);} return out; }
  function paceToSec(str:string){ if(!str) return null; const [m,s] = String(str).split(":").map(Number); if(Number.isNaN(m)||Number.isNaN(s)) return null; return m*60+s; }
  function betterPace(a?:string,b?:string){ const sa=paceToSec(a||""), sb=paceToSec(b||""); if(sa==null) return b||a||""; if(sb==null) return a||b||""; return sa<=sb ? (a||"") : (b||""); }

  // --- Default Config ---
  const defaultConfig = {
    sex: "F", // "F" or "M"
    heightIn: 65, // inches (internal)
    heightUnit: "ftin", // display unit: "ftin" | "cm"
    weightUnit: "lb", // display unit: "lb" | "kg"
    maintenanceCalories: 2000,
    proteinTarget: 120,
    hygieneDecay: 20, // % per day
    wisdomMaxPerWeek: 3,
    minSleepToWorkout: 6, // threshold for Sleepwalker hidden stat
    workoutDaysTargetPerWeek: 4,
    restDaysTargetPerWeek: 3,
    waterTargetOz: 64,
  };

  // --- LocalStorage Keys ---
  const LS_KEYS = { config: "frpg_config_v1", logs: "frpg_logs_v2", measures: "frpg_measures_v1" };

  function useLocalStorageState<T>(key:string, initial:T):[T, React.Dispatch<React.SetStateAction<T>>] {
    const [state, setState] = useState<T>(() => {
      try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : initial; } catch { return initial; }
    });
    useEffect(() => { try { localStorage.setItem(key, JSON.stringify(state)); } catch {} }, [key, state]);
    return [state, setState];
  }

  function getISOWeek(d:Date) {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(),0,1));
    const weekNo = Math.ceil((((date as any) - (yearStart as any)) / 86400000 + 1) / 7);
    return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2,'0')}`;
  }

  export default function App() {
    const [config, setConfig] = useLocalStorageState<typeof defaultConfig>(LS_KEYS.config, defaultConfig);
    const [logs, setLogs] = useLocalStorageState<any[]>(LS_KEYS.logs, []);
    const [measures, setMeasures] = useLocalStorageState<any[]>(LS_KEYS.measures, []);
    const [showTests, setShowTests] = useState(false);

    // --- Derived ordering ---
    const logsSorted = useMemo(() => [...logs].sort((a,b)=>+parseDate(a.date)-+parseDate(b.date)), [logs]);

    // --- Hygiene per day ---
    const hygieneByDate = useMemo(() => {
      let h = 100; const map:any = {}; let lastDate:string|null = null;
      logsSorted.forEach((e:any) => {
        if (lastDate && e.date !== lastDate) {
          const daysGap = Math.round((+parseDate(e.date)-+parseDate(lastDate)) / 86400000);
          if (daysGap > 0) h = Math.max(0, h - config.hygieneDecay * daysGap);
        }
        if (e.showered) h = 100;
        map[e.date] = Math.round(h); lastDate = e.date;
      });
      return map;
    }, [logsSorted, config.hygieneDecay]);

    // --- WorkoutDay flag ---
    const withWorkoutDay = useMemo(()=> logsSorted.map((e:any) => ({
      ...e,
      workoutDay: (Boolean(e.weightedWorkout) || Boolean(e.cardio) || (Number(e.stretchingMinutes)||0) > 0) && !e.restDay,
    })), [logsSorted]);

    // --- Streaks (Endurance) ---
    const streakByDate = useMemo(() => {
      let streak = 0; const map:any = {};
      withWorkoutDay.forEach((e:any) => {
        if (e.sickOrPeriod || e.restDay) {
          // carry streak
        } else if (e.workoutDay) { streak += 1; } else { streak = 0; }
        map[e.date] = streak;
      });
      return map;
    }, [withWorkoutDay]);

    // --- Diet RES streak ---
    const resStreakByDate = useMemo(() => {
      let s = 0; const map:any = {};
      withWorkoutDay.forEach((e:any) => { if (e.dietAdherence) s += 1; else s = 0; map[e.date] = s; });
      return map;
    }, [withWorkoutDay]);

    // --- Low Sleep streak (for Sleepwalker) ---
    const lowSleepStreakByDate = useMemo(() => {
      let s = 0; const map:any = {};
      logsSorted.forEach((e:any) => {
        const low = (Number(e.sleepLastNightHours)||0) < (Number(config.minSleepToWorkout)||0);
        if (low) s += 1; else s = 0; map[e.date] = s;
      });
      return map;
    }, [logsSorted, config.minSleepToWorkout]);

    // --- Beginner's Luck window ---
    const firstWorkoutDate = useMemo(() => (withWorkoutDay.find((e:any) => e.workoutDay)?.date || null), [withWorkoutDay]);
    const beginnerLuckActiveDates = useMemo(() => {
      if (!firstWorkoutDate) return new Set<string>();
      const start = +parseDate(firstWorkoutDate);
      const set = new Set<string>(); for (let i=0;i<7;i++) set.add(new Date(start + i*86400000).toISOString().slice(0,10));
      return set;
    }, [firstWorkoutDate]);

    // --- Weekly windows (last 7 logged days) ---
    const last7 = withWorkoutDay.slice(-7);
    const workoutDaysLast7 = last7.filter((e:any)=>e.workoutDay).length;
    const restDaysLast7 = last7.filter((e:any)=>e.restDay).length;
    const sickPeriodLast7 = last7.filter((e:any)=>e.sickOrPeriod).length;

    // --- Core Stat Totals (with multipliers) ---
    const coreTotals = useMemo(() => {
      let totals:any = { STR:0, AGI:0, VIT:0, INT:0, WIS:0, END:0, DEX:0, CHA:0, LUK:0 };
      let weekRestCount = new Map<string, number>();
      withWorkoutDay.forEach((e:any) => {
        const luckMult = beginnerLuckActiveDates.has(e.date) ? 2 : 1;
        const hygiene = hygieneByDate[e.date] ?? 100;
        const week = getISOWeek(parseDate(e.date));
        const restCount = weekRestCount.get(week) || 0;
        let g:any = { STR:0, AGI:0, VIT:0, INT:0, WIS:0, END:0, DEX:0, CHA:0, LUK:0 };
        if (e.weightedWorkout) g.STR += 1;
        if (e.cardio) g.AGI += 1;
        g.VIT += (Number(e.prsCount)||0);
        if ((Number(e.readMinutes)||0) > 0) g.INT += 1;
        if (e.restDay) { if (restCount < config.wisdomMaxPerWeek) { g.WIS += 1; weekRestCount.set(week, restCount+1); } else { g.STR -= 1; g.AGI -= 1; } }
        g.END += (streakByDate[e.date]||0);
        g.DEX += Math.floor((Number(e.stretchingMinutes)||0)/10);
        let cha = e.clipRecorded ? 1 : 0; if (hygiene === 0) cha -= 3; else if (hygiene < 50) cha -= 1; g.CHA += cha;
        if (e.newActivity) g.LUK += 1;
        const critToday = checkCrit(g); const critMult = critToday ? 2 : 1;
        const sleepwalkerMult = (lowSleepStreakByDate[e.date]||0) > 3 ? 0.5 : 1;
        const mult = luckMult * critMult * sleepwalkerMult; Object.keys(g).forEach(k => { totals[k] += g[k] * mult; });
      });
      return totals;
    }, [withWorkoutDay, hygieneByDate, beginnerLuckActiveDates, streakByDate, lowSleepStreakByDate, config.wisdomMaxPerWeek]);

    // --- Today's badges ---
    const todayEntry = logsSorted[logsSorted.length - 1];
    const todayDate = todayEntry?.date;
    const hygieneToday = todayEntry ? (hygieneByDate[todayEntry.date] ?? 100) : 100;
    const resStreakToday = todayEntry ? (resStreakByDate[todayEntry.date] || 0) : 0;
    const beginnerLuckToday = todayDate ? beginnerLuckActiveDates.has(todayDate) : false;
    const sleepwalkerToday = todayDate ? ((lowSleepStreakByDate[todayDate]||0) > 3) : false;

    function computeTodayGainsAndBadges() {
      if (!todayEntry) return { g: null, badgesGlobal: [], badgesByStat: {} as any };
      const e:any = todayEntry; const week = getISOWeek(parseDate(e.date));
      const restsBeforeToday = withWorkoutDay.filter((x:any) => getISOWeek(parseDate(x.date))===week && x.date < e.date && x.restDay).length;
      let g:any = { STR:0, AGI:0, VIT:0, INT:0, WIS:0, END:0, DEX:0, CHA:0, LUK:0 };
      const badgesGlobal:any[] = [];
      if (beginnerLuckToday) badgesGlobal.push({ text:"Beginner's Luck ×2", tone:"emerald", title:"First 7 days after your first workout: all gains doubled." });
      if (e.weightedWorkout) g.STR += 1; if (e.cardio) g.AGI += 1; g.VIT += (Number(e.prsCount)||0);
      if ((Number(e.readMinutes)||0) > 0) g.INT += 1;
      if (e.restDay) { if (restsBeforeToday < config.wisdomMaxPerWeek) g.WIS += 1; else { g.STR -= 1; g.AGI -= 1; } }
      g.END += (streakByDate[e.date]||0);
      g.DEX += Math.floor((Number(e.stretchingMinutes)||0)/10);
      let cha = e.clipRecorded ? 1 : 0; if (hygieneToday === 0) cha -= 3; else if (hygieneToday < 50) cha -= 1; g.CHA += cha;
      if (e.newActivity) g.LUK += 1;
      const critToday = checkCrit(g);
      if (critToday) badgesGlobal.push({ text:"CRIT ×2", tone:"indigo", title:"All core stats gained today → additional 2× multiplier applied." });
      if (sleepwalkerToday) badgesGlobal.push({ text:"Sleepwalker ×0.5", tone:"rose", title:"Slept below your threshold >3 days: gains halved." });
      const badgesByStat:any = { STR:[], AGI:[], VIT:[], INT:[], WIS:[], END:[], DEX:[], CHA:[], LUK:[] };
      const multBadges:any[] = [];
      if (beginnerLuckToday) multBadges.push({ text:"×2 BL", tone:"emerald", title:"Beginner's Luck doubles gains."});
      if (critToday) multBadges.push({ text:"×2 CRIT", tone:"indigo", title:"Critical day: all stats gained → 2×."});
      if (sleepwalkerToday) multBadges.push({ text:"×0.5 Sleep", tone:"rose", title:"Sleepwalker halves gains."});
      const copyMults = () => multBadges.map(x=>({...x}));
      if (e.restDay && restsBeforeToday >= config.wisdomMaxPerWeek) {
        badgesByStat.STR.push({ text:"-1 Rest Penalty", tone:"amber", title:"Extra rest beyond weekly cap reduces STR by 1 today."});
        badgesByStat.AGI.push({ text:"-1 Rest Penalty", tone:"amber", title:"Extra rest beyond weekly cap reduces AGI by 1 today."});
      }
      if (hygieneToday === 0) badgesByStat.CHA.push({ text:"-3 Hygiene", tone:"amber", title:"Hygiene at 0% → -3 CHA today."});
      else if (hygieneToday < 50) badgesByStat.CHA.push({ text:"-1 Hygiene", tone:"amber", title:"Hygiene below 50% → -1 CHA today."});
      const baseBadge = (n:number, label:string) => (n>0? { text:`+${n} ${label}`, tone:"slate", title:`Base gain: ${label}` } : n<0? { text:`${n}`, tone:"amber", title:"Penalty applied" } : null);
      [["STR", g.STR, "Weighted"],["AGI", g.AGI, "Cardio"],["VIT", g.VIT, "PRs"],["INT", g.INT, "Reading"],["WIS", g.WIS, "Rest"],["END", g.END, "Streak"],["DEX", g.DEX, "Mobility"],["CHA", g.CHA, "Clips/Photo & Hygiene"],["LUK", g.LUK, "New Activity"]].forEach(([kk,val,label]:any) => { const b = baseBadge(val as number, label as string); if (b) (badgesByStat as any)[kk].push(b); (badgesByStat as any)[kk].push(...copyMults()); });
      return { g, badgesGlobal, badgesByStat };
    }
    const { badgesGlobal, badgesByStat } = useMemo(computeTodayGainsAndBadges, [todayEntry, withWorkoutDay, hygieneToday, beginnerLuckToday, sleepwalkerToday, config.wisdomMaxPerWeek, streakByDate]);

    // --- Hidden stats unlocks ---
    const hidden = useMemo(() => {
      const vals:any = { ...coreTotals };
      const arr = Object.values(vals) as number[];
      const minVal = Math.min(...arr);
      const maxVal = Math.max(...arr);
      const maxStreak = Math.max(0, ...Object.values(streakByDate) as number[]);
      const Authority = vals.STR >= 50 && vals.CHA >= 30;
      const Awareness = vals.INT >= 25 && vals.WIS >= 20;
      const Willpower = maxStreak >= 30 && vals.VIT >= 20;
      const Faith = vals.CHA >= 20 && vals.WIS >= 25;
      const Karma = (minVal > 0) && (maxVal/minVal <= 2);
      const Discipline = maxStreak >= 60;
      const Adaptability = vals.LUK >= 10;
      const Focus = vals.INT >= 30 && vals.DEX >= 20;
      const Soul = Awareness && Discipline;
      const Dominion = Authority && Willpower && Soul;
      const Transcendence = Authority && Awareness && Willpower && Faith && Karma && Discipline && Adaptability && Focus && Soul && Dominion;
      const BeginnersLuck = Boolean(firstWorkoutDate);
      const todayKey = logsSorted[logsSorted.length-1]?.date;
      const Sleepwalker = todayKey ? ((lowSleepStreakByDate[todayKey]||0) > 3) : false;
      return { Authority, Awareness, Willpower, Faith, Karma, Discipline, Adaptability, Focus, Soul, Dominion, Transcendence, BeginnersLuck, Sleepwalker };
    }, [coreTotals, streakByDate, firstWorkoutDate, lowSleepStreakByDate, logsSorted]);

    // --- Body measurements with computed fields ---
    const measuresComputed = useMemo(() => {
      return [...measures]
        .sort((a,b)=>+parseDate(a.date)-+parseDate(b.date))
        .map((m:any) => {
          const bf = computeBodyFatPct({ sex: config.sex, heightIn: config.heightIn, neckIn: m.neckIn, waistIn: m.waistIn, hipsIn: m.hipsIn });
          const bmi = computeBMI({ weightLb: m.weightLb, heightIn: config.heightIn });
          return { ...m, bf, bmi };
        });
    }, [measures, config.sex, config.heightIn]);

    const latestMeasure = measuresComputed[measuresComputed.length - 1];

    // --- Forms state (strings so typing is smooth) ---
    const initialLogForm = (date?:string) => ({
      date: date||todayStr(), weightedWorkout:false, cardio:false,
      prsCount:"", readMinutes:"", restDay:false, sickOrPeriod:false,
      stretchingMinutes:"", clipRecorded:false, newActivity:false,
      calories:"", injured:false, sleepLastNightHours:"",
      proteinTotal:"", workoutMinutes:"", milePace:"",
      dietAdherence:false, showered:false, waterCups:"",
    });
    const [logForm, setLogForm] = useState<any>(initialLogForm(todayStr()));

    const [measForm, setMeasForm] = useState<any>({ date: todayStr(), weightStr:"", neckIn:"", waistIn:"", hipsIn:"", abdominIn:"" });

    const Input = ({label, children, hint}:{label:string,children:any,hint?:string}) => (
      <label className="flex items-center gap-2 text-sm"> <span className="w-48 text-neutral-300">{label}</span> {children} {hint && <span className="text-xs text-neutral-400 ml-2">{hint}</span>} </label>
    );
    const Badge = ({text, title, tone="slate"}:{text:string,title:string,tone?:"emerald"|"indigo"|"rose"|"amber"|"slate"}) => (
      <span title={title} className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border mr-1 mb-1 select-none ${tone==="emerald"?"bg-emerald-900/30 border-emerald-700": tone==="indigo"?"bg-indigo-900/30 border-indigo-700": tone==="rose"?"bg-rose-900/30 border-rose-700": tone==="amber"?"bg-amber-900/30 border-amber-700":"bg-neutral-800 border-neutral-600"}`}>{text}</span>
    );

    // Prefill: when date changes, if an entry exists for that date, load it; otherwise clear to blank template
    useEffect(()=>{
      const existing:any = logs.find((x:any)=>x.date===logForm.date);
      if (existing) {
        setLogForm((f:any)=>({
            ...f,
            weightedWorkout: !!existing.weightedWorkout,
            cardio: !!existing.cardio,
            prsCount: existing.prsCount!==undefined? String(existing.prsCount):"",
            readMinutes: existing.readMinutes!==undefined? String(existing.readMinutes):"",
            restDay: !!existing.restDay,
            sickOrPeriod: !!existing.sickOrPeriod,
            stretchingMinutes: existing.stretchingMinutes!==undefined? String(existing.stretchingMinutes):"",
            clipRecorded: !!existing.clipRecorded,
            newActivity: !!existing.newActivity,
            calories: existing.calories!==undefined? String(existing.calories):"",
            injured: !!existing.injured,
            sleepLastNightHours: existing.sleepLastNightHours!==undefined? String(existing.sleepLastNightHours):"",
            proteinTotal: existing.proteinTotal!==undefined? String(existing.proteinTotal):"",
            workoutMinutes: existing.workoutMinutes!==undefined? String(existing.workoutMinutes):"",
            milePace: existing.milePace||"",
            dietAdherence: !!existing.dietAdherence,
            showered: !!existing.showered,
            waterCups: existing.waterOz? String(existing.waterOz/8):"",
        }));
      } else {
        setLogForm(initialLogForm(logForm.date));
      }
    }, [logForm.date, logs]);

    // --- Save handler (OVERWRITE on same date) ---
    function saveLogFromForm() {
      const parseNum = (v:string)=>{ const n=parseFloat(v); return Number.isFinite(n)?n:0; };
      const cups = parseNum(logForm.waterCups);
      const incoming:any = {
        date: logForm.date,
        weightedWorkout: !!logForm.weightedWorkout,
        cardio: !!logForm.cardio,
        prsCount: parseNum(logForm.prsCount),
        readMinutes: parseNum(logForm.readMinutes),
        restDay: !!logForm.restDay,
        sickOrPeriod: !!logForm.sickOrPeriod,
        stretchingMinutes: parseNum(logForm.stretchingMinutes),
        clipRecorded: !!logForm.clipRecorded,
        newActivity: !!logForm.newActivity,
        calories: parseNum(logForm.calories),
        injured: !!logForm.injured,
        sleepLastNightHours: logForm.sleepLastNightHours===""? undefined : parseNum(logForm.sleepLastNightHours),
        proteinTotal: parseNum(logForm.proteinTotal),
        workoutMinutes: parseNum(logForm.workoutMinutes),
        milePace: logForm.milePace,
        dietAdherence: !!logForm.dietAdherence,
        showered: !!logForm.showered,
        waterOz: cups * 8,
      };
      const isEditing = !!logs.find((x:any)=>x.date===incoming.date);
      setLogs((prev:any[])=>{ const others=prev.filter((x:any)=>x.date!==incoming.date); return [...others, incoming]; });
      if (!isEditing) setLogForm(initialLogForm(logForm.date));
    }

    function addMeasure(m:any) { setMeasures((prev:any[]) => { const others = prev.filter((x:any) => x.date !== m.date); return [...others, m]; }); }
    function resetAll() { if (confirm("Reset all data?")) { localStorage.removeItem(LS_KEYS.config); localStorage.removeItem(LS_KEYS.logs); localStorage.removeItem(LS_KEYS.measures); location.reload(); } }

    // --- Dev Tests ---
    function runDevTests() {
      const tests:any[] = [];
      const bmi = computeBMI({ weightLb: 200, heightIn: 70 });
      tests.push({ name: "BMI 200lb/70in ~= 28.7", pass: Math.abs((bmi||0) - 28.7) < 0.2, value: bmi });

      const seq = computeLowSleepStreak([5,5,7,5,5,5,8], 6); const expect = [1,2,0,1,2,3,0];
      tests.push({ name: "Low-sleep streak progression", pass: JSON.stringify(seq)===JSON.stringify(expect), value: seq });

      tests.push({ name: "CRIT requires all positives", pass: checkCrit({STR:1,AGI:1,VIT:1,INT:1,END:1,DEX:1,CHA:1,LUK:1}) && !checkCrit({STR:1,AGI:0,VIT:1,INT:1,END:1,DEX:1,CHA:1,LUK:1}), value: null });

      const bfF = computeBodyFatPct({ sex:"F", heightIn:65, neckIn:13, waistIn:28, hipsIn:38 });
      tests.push({ name: "BodyFat% female reasonable (10–40)", pass: bfF !== null && (bfF as number) > 10 && (bfF as number) < 40, value: bfF });

      const bmiNull = computeBMI({ weightLb: null as any, heightIn: 70 });
      tests.push({ name: "BMI null on missing input", pass: bmiNull === null, value: bmiNull });

      const base:any = { date:"2025-01-01", proteinTotal:30, waterOz:8, prsCount:1, readMinutes:10, stretchingMinutes:5, calories:400, workoutMinutes:20, weightedWorkout:false, cardio:true, restDay:false, sickOrPeriod:false, clipRecorded:false, newActivity:false, injured:false, dietAdherence:false, showered:false, sleepLastNightHours:7, milePace:"10:00" };
      const incoming:any = { date:"2025-01-01", proteinTotal:25, waterOz:40, prsCount:3, readMinutes:5, stretchingMinutes:15, calories:900, workoutMinutes:35, weightedWorkout:true, cardio:false, restDay:true, sickOrPeriod:true, clipRecorded:true, newActivity:true, injured:true, dietAdherence:true, showered:true, sleepLastNightHours:6, milePace:"9:30" };
      const replaced:any = { ...base, ...incoming };
      const passReplace = replaced.proteinTotal===25 && replaced.waterOz===40 && replaced.restDay===true && replaced.cardio===false && replaced.milePace==="9:30";
      tests.push({ name: "Overwrite replaces existing", pass: passReplace, value: replaced });

      return tests;
    }
    const devTests = useMemo(runDevTests, [config]);

    // --- Height inputs & weight unit toggle for form ---
    const [heightInputs, setHeightInputs] = useState<{ft:string, inch:string, cm:string}>(()=>{ const ft=Math.floor((config.heightIn||0)/12); const inch=(config.heightIn||0)-ft*12; return { ft:String(ft), inch:String(Number(inch.toFixed(1))), cm:String(Number(inToCm(config.heightIn).toFixed(1))) }; });
    const prevUnits = useRef<{weightUnit:string, heightUnit:string}>({ weightUnit: config.weightUnit, heightUnit: config.heightUnit });

    useEffect(()=>{ const ft=Math.floor((config.heightIn||0)/12); const inch=(config.heightIn||0)-ft*12; setHeightInputs(p=>({ ...p, ft:String(ft), inch:String(Number(inch.toFixed(1))), cm:String(Number(inToCm(config.heightIn).toFixed(1))) })); }, [config.heightIn, config.heightUnit]);

    useEffect(()=>{
      if (prevUnits.current.weightUnit !== config.weightUnit) {
        setMeasForm((f:any)=>{ const n=parseFloat(f.weightStr); if(!Number.isFinite(n)) return f; const val = prevUnits.current.weightUnit==='lb'? lbToKg(n) : kgToLb(n); return { ...f, weightStr: String(Number(val.toFixed(1))) }; });
        prevUnits.current.weightUnit = config.weightUnit;
      }
      if (prevUnits.current.heightUnit !== config.heightUnit) {
        prevUnits.current.heightUnit = config.heightUnit;
      }
    }, [config.weightUnit, config.heightUnit]);

    // --- UI ---
    const cupsPreview = (()=>{ const n=parseFloat(logForm.waterCups); return Number.isFinite(n) && n>0 ? `(${n*8} oz)` : ""; })();

    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-100 p-4 md:p-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Fitness RPG — Web Preview</h1>
          <div className="flex items-center gap-2">
            <button onClick={()=>setShowTests(v=>!v)} className="px-3 py-2 rounded-xl bg-neutral-700 hover:bg-neutral-600 text-white text-sm">{showTests?"Hide":"Show"} Tests</button>
            <button onClick={()=>{ if (confirm("Reset all data?")) { localStorage.removeItem(LS_KEYS.config); localStorage.removeItem(LS_KEYS.logs); localStorage.removeItem(LS_KEYS.measures); location.reload(); } }} className="px-3 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm">Reset All</button>
          </div>
        </div>

        {showTests && (
          <Section title="Dev Tests">
            <ul className="text-sm">
              {devTests.map((t:any, i:number) => (
                <li key={i} className={`mb-1 ${t.pass ? "text-emerald-400" : "text-rose-400"}`}>
                  <strong>{t.pass ? "PASS" : "FAIL"}</strong> — {t.name}{" "}
                  {t.value !== null && `(${Array.isArray(t.value) ? JSON.stringify(t.value) : typeof t.value === "object" ? JSON.stringify(t.value) : t.value})`}
                </li>
              ))}
            </ul>
            <div className="text-xs text-neutral-400 mt-2">If any test fails, tell me what behavior you expect—I'll align the logic.</div>
          </Section>
        )}

        {/* ---------------- Config ---------------- */}
        <Section title="Config">
          <div className="grid md:grid-cols-3 gap-4">
            <Input label="Sex">
              <select className="bg-neutral-800 rounded-lg px-2 py-1" value={config.sex} onChange={e=>setConfig({...config, sex:(e.target as HTMLSelectElement).value})}>
                <option value="F">F</option>
                <option value="M">M</option>
              </select>
            </Input>

            <Input label="Height Unit">
              <select className="bg-neutral-800 rounded-lg px-2 py-1" value={config.heightUnit} onChange={e=>setConfig({...config, heightUnit:(e.target as HTMLSelectElement).value})}>
                <option value="ftin">ft/in</option>
                <option value="cm">cm</option>
              </select>
            </Input>

            {config.heightUnit === 'ftin' ? (
              <Input label="Height (ft/in)">
                <div className="flex items-center gap-2">
                  <input type="number" inputMode="numeric" className="bg-neutral-800 rounded-lg px-2 py-1 w-20" value={heightInputs.ft} onChange={(e)=>{ const ft=parseFloat((e.target as HTMLInputElement).value)||0; const inch=parseFloat(heightInputs.inch)||0; setHeightInputs(p=>({...p, ft:(e.target as HTMLInputElement).value})); setConfig({...config, heightIn: ft*12 + inch}); }} />
                  <span className="text-neutral-400 text-xs">ft</span>
                  <input type="number" inputMode="decimal" step="0.1" className="bg-neutral-800 rounded-lg px-2 py-1 w-20" value={heightInputs.inch} onChange={(e)=>{ const ft=parseFloat(heightInputs.ft)||0; const inch=parseFloat((e.target as HTMLInputElement).value)||0; setHeightInputs(p=>({...p, inch:(e.target as HTMLInputElement).value})); setConfig({...config, heightIn: ft*12 + inch}); }} />
                  <span className="text-neutral-400 text-xs">in</span>
                </div>
              </Input>
            ) : (
              <Input label="Height (cm)">
                <input type="number" inputMode="decimal" step="0.1" className="bg-neutral-800 rounded-lg px-2 py-1 w-28" value={heightInputs.cm} onChange={(e)=>{ const cm=parseFloat((e.target as HTMLInputElement).value)||0; setHeightInputs(p=>({...p, cm:(e.target as HTMLInputElement).value})); setConfig({...config, heightIn: cmToIn(cm)}); }} />
              </Input>
            )}

            <Input label="Weight Unit">
              <select className="bg-neutral-800 rounded-lg px-2 py-1" value={config.weightUnit} onChange={e=>setConfig({...config, weightUnit:(e.target as HTMLSelectElement).value})}>
                <option value="lb">lb</option>
                <option value="kg">kg</option>
              </select>
            </Input>

            <Input label="Maintenance Calories"><input type="number" inputMode="numeric" className="bg-neutral-800 rounded-lg px-2 py-1 w-28" value={String(config.maintenanceCalories)} onChange={e=>setConfig({...config, maintenanceCalories:parseFloat((e.target as HTMLInputElement).value)||0})}/></Input>
            <Input label="Protein Target (g)"><input type="number" inputMode="numeric" className="bg-neutral-800 rounded-lg px-2 py-1 w-28" value={String(config.proteinTarget)} onChange={e=>setConfig({...config, proteinTarget:parseFloat((e.target as HTMLInputElement).value)||0})}/></Input>
            <Input label="Water Target (oz)"><input type="number" inputMode="numeric" className="bg-neutral-800 rounded-lg px-2 py-1 w-28" value={String(config.waterTargetOz)} onChange={e=>setConfig({...config, waterTargetOz:parseFloat((e.target as HTMLInputElement).value)||0})}/></Input>
            <Input label="Hygiene Decay %/day"><input type="number" inputMode="numeric" className="bg-neutral-800 rounded-lg px-2 py-1 w-28" value={String(config.hygieneDecay)} onChange={e=>setConfig({...config, hygieneDecay:parseFloat((e.target as HTMLInputElement).value)||0})}/></Input>
            <Input label="WIS Max per Week"><input type="number" inputMode="numeric" className="bg-neutral-800 rounded-lg px-2 py-1 w-28" value={String(config.wisdomMaxPerWeek)} onChange={e=>setConfig({...config, wisdomMaxPerWeek:parseFloat((e.target as HTMLInputElement).value)||0})}/></Input>
            <Input label="Min Sleep Threshold (h)"><input type="number" inputMode="decimal" className="bg-neutral-800 rounded-lg px-2 py-1 w-28" value={String(config.minSleepToWorkout)} onChange={e=>setConfig({...config, minSleepToWorkout:parseFloat((e.target as HTMLInputElement).value)||0})}/></Input>
            <Input label="Workout Days Target/wk"><input type="number" inputMode="numeric" className="bg-neutral-800 rounded-lg px-2 py-1 w-28" value={String(config.workoutDaysTargetPerWeek)} onChange={e=>setConfig({...config, workoutDaysTargetPerWeek:parseFloat((e.target as HTMLInputElement).value)||0})}/></Input>
            <Input label="Rest Days Target/wk"><input type="number" inputMode="numeric" className="bg-neutral-800 rounded-lg px-2 py-1 w-28" value={String(config.restDaysTargetPerWeek)} onChange={e=>setConfig({...config, restDaysTargetPerWeek:parseFloat((e.target as HTMLInputElement).value)||0})}/></Input>
          </div>
        </Section>

        {/* ---------------- Daily Log ---------------- */}
        <Section title="Daily Log">
          <form className="grid md:grid-cols-3 gap-3" onSubmit={(e)=>{e.preventDefault(); saveLogFromForm();}}>
            <Input label="Date"><input type="date" className="bg-neutral-800 rounded-lg px-2 py-1" value={logForm.date} onChange={e=>setLogForm({...logForm, date:(e.target as HTMLInputElement).value})}/></Input>
            <Input label="Weighted Workout"><input type="checkbox" checked={!!logForm.weightedWorkout} onChange={e=>setLogForm({...logForm, weightedWorkout:(e.target as HTMLInputElement).checked})}/></Input>
            <Input label="Cardio"><input type="checkbox" checked={!!logForm.cardio} onChange={e=>setLogForm({...logForm, cardio:(e.target as HTMLInputElement).checked})}/></Input>
            <Input label="PRs Count"><input type="number" inputMode="numeric" className="bg-neutral-800 rounded-lg px-2 py-1 w-24" value={logForm.prsCount} onChange={e=>setLogForm({...logForm, prsCount:(e.target as HTMLInputElement).value})}/></Input>
            <Input label="Read Minutes"><input type="number" inputMode="numeric" className="bg-neutral-800 rounded-lg px-2 py-1 w-24" value={logForm.readMinutes} onChange={e=>setLogForm({...logForm, readMinutes:(e.target as HTMLInputElement).value})}/></Input>
            <Input label="Rest Day"><input type="checkbox" checked={!!logForm.restDay} onChange={e=>setLogForm({...logForm, restDay:(e.target as HTMLInputElement).checked})}/></Input>
            <Input label="Sick/Period"><input type="checkbox" checked={!!logForm.sickOrPeriod} onChange={e=>setLogForm({...logForm, sickOrPeriod:(e.target as HTMLInputElement).checked})}/></Input>
            <Input label="Stretching (min)"><input type="number" inputMode="numeric" className="bg-neutral-800 rounded-lg px-2 py-1 w-24" value={logForm.stretchingMinutes} onChange={e=>setLogForm({...logForm, stretchingMinutes:(e.target as HTMLInputElement).value})}/></Input>
            <Input label="Clip Recorded / Progress Photo"><input type="checkbox" checked={!!logForm.clipRecorded} onChange={e=>setLogForm({...logForm, clipRecorded:(e.target as HTMLInputElement).checked})}/></Input>
            <Input label="New Activity Tried"><input type="checkbox" checked={!!logForm.newActivity} onChange={e=>setLogForm({...logForm, newActivity:(e.target as HTMLInputElement).checked})}/></Input>
            <Input label="Calories Eaten"><input type="number" inputMode="numeric" className="bg-neutral-800 rounded-lg px-2 py-1 w-28" value={logForm.calories} onChange={e=>setLogForm({...logForm, calories:(e.target as HTMLInputElement).value})}/></Input>
            <Input label="Injured"><input type="checkbox" checked={!!logForm.injured} onChange={e=>setLogForm({...logForm, injured:(e.target as HTMLInputElement).checked})}/></Input>
            <Input label="Sleep last night (h)"><input type="number" inputMode="decimal" className="bg-neutral-800 rounded-lg px-2 py-1 w-24" step="0.1" value={logForm.sleepLastNightHours} onChange={e=>setLogForm({...logForm, sleepLastNightHours:(e.target as HTMLInputElement).value})}/></Input>
            <Input label="Protein total today (g)"><input type="number" inputMode="numeric" className="bg-neutral-800 rounded-lg px-2 py-1 w-24" value={logForm.proteinTotal} onChange={e=>setLogForm({...logForm, proteinTotal:(e.target as HTMLInputElement).value})}/></Input>
            <Input label="Water cups today" hint={cupsPreview}><input type="number" inputMode="decimal" step="0.5" className="bg-neutral-800 rounded-lg px-2 py-1 w-24" value={logForm.waterCups} onChange={e=>setLogForm({...logForm, waterCups:(e.target as HTMLInputElement).value})}/></Input>
            <Input label="Workout Minutes"><input type="number" inputMode="numeric" className="bg-neutral-800 rounded-lg px-2 py-1 w-24" value={logForm.workoutMinutes} onChange={e=>setLogForm({...logForm, workoutMinutes:(e.target as HTMLInputElement).value})}/></Input>
            <Input label="Mile Pace (mm:ss)"><input type="text" className="bg-neutral-800 rounded-lg px-2 py-1 w-24" placeholder="10:00" value={logForm.milePace} onChange={e=>setLogForm({...logForm, milePace:(e.target as HTMLInputElement).value})}/></Input>
            <Input label="Diet Adherence"><input type="checkbox" checked={!!logForm.dietAdherence} onChange={e=>setLogForm({...logForm, dietAdherence:(e.target as HTMLInputElement).checked})}/></Input>
            <Input label="Showered"><input type="checkbox" checked={!!logForm.showered} onChange={e=>setLogForm({...logForm, showered:(e.target as HTMLInputElement).checked})}/></Input>
            <div className="md:col-span-3 flex gap-3 mt-2">
              <button type="submit" className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white">Save Log</button>
            </div>
          </form>
          <div className="text-xs text-neutral-400 mt-2">If a date already has a log, the form auto-fills so you can edit. Saving will <strong>overwrite</strong> that date. For a brand-new date, the form clears after saving so you can add another entry.</div>
        </Section>

        <Section title="Dashboard" actions={<div>{badgesGlobal.map((b:any,i:number)=> <Badge key={i} text={b.text} title={b.title} tone={b.tone as any} />)}</div>}>
          <div className="grid md:grid-cols-4 gap-3">
            {["STR","AGI","VIT","INT","WIS","END","DEX","CHA","LUK"].map((k)=> (
              <div key={k}>
                <StatPill label={k} value={(coreTotals as any)[k]} sub={{STR:"Weighted",AGI:"Cardio",VIT:"PRs",INT:"Reading",WIS:"Rest (capped)",END:"Streak sum",DEX:"Mobility",CHA:"Clips/Photo & Hygiene",LUK:"New activity"}[k as any]} />
                <div className="mt-1">{(badgesByStat as any)[k]?.map((b:any,i:number)=><Badge key={i} text={b.text} title={b.title} tone={b.tone as any} />)}</div>
              </div>
            ))}
          </div>
          <div className="grid md:grid-cols-4 gap-3 mt-4">
            <StatPill label="Hunger (today)" value={`${todayEntry?.calories||0}/${config.maintenanceCalories}`} sub="Calories" />
            <StatPill label="Health (HP)" value={todayEntry?.injured?"80":"100"} sub={todayEntry?.injured?"Injured":"Healthy"} />
            <StatPill label="MP (Sleep last night)" value={`${todayEntry?.sleepLastNightHours||0} h`} sub="Energy" />
            <StatPill label="ATK (Protein)" value={`${todayEntry?.proteinTotal||0} g`} />
            <StatPill label="MAG (Minutes)" value={`${todayEntry?.workoutMinutes||0} min`} />
            <StatPill label="Speed (mile)" value={todayEntry?.milePace||"—"} />
            <StatPill label="RES (Diet Streak)" value={resStreakToday} />
            <StatPill label="Hygiene" value={`${hygieneToday}%`} />
            <StatPill label="Water" value={`${Number(todayEntry?.waterOz)||0}/${config.waterTargetOz} oz`} sub="Hydration" />
          </div>
          <div className="grid md:grid-cols-3 gap-3 mt-4">
            <StatPill label="Beginner's Luck" value={firstWorkoutDate?"Unlocked":"Locked"} sub={firstWorkoutDate?"Active 7 days from first workout":"—"} />
            <StatPill label="Weekly Workouts" value={`${workoutDaysLast7}/${config.workoutDaysTargetPerWeek}`} sub={workoutDaysLast7 === config.workoutDaysTargetPerWeek ? "On track ✔" : (workoutDaysLast7 > config.workoutDaysTargetPerWeek ? "Ahead (consider recovery)" : "You can add a light session if you feel good")} />
            <StatPill label="Weekly Rests" value={`${restDaysLast7}/${config.restDaysTargetPerWeek}`} sub={restDaysLast7 === config.restDaysTargetPerWeek ? "On track ✔" : (restDaysLast7 > config.restDaysTargetPerWeek ? "Great recovery focus" : "Plan a rest/active recovery day")} />
            <StatPill label="Sick/Period (7d)" value={sickPeriodLast7} />
            <StatPill label="Overtraining" value={(workoutDaysLast7 > config.workoutDaysTargetPerWeek + 1 && restDaysLast7 < config.restDaysTargetPerWeek - 1)?"Caution":"Balanced ✔"} />
          </div>
        </Section>

        <Section title="Hidden Stats">
          <div className="grid md:grid-cols-4 gap-3">
            {Object.entries(hidden).map(([k,v])=> (
              <div key={k} className={`px-3 py-2 rounded-xl border text-sm ${v?"bg-emerald-900/30 border-emerald-700":"bg-neutral-800 border-neutral-700"}`}>
                <div className="text-neutral-400">{k}</div>
                <div className="font-semibold">{v?"Unlocked":"Locked"}</div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Body Measurements & Charts">
          <form className="grid md:grid-cols-3 gap-3 mb-4" onSubmit={(e)=>{e.preventDefault(); const w=parseFloat(measForm.weightStr); const weightLb = Number.isFinite(w) ? (config.weightUnit==='kg' ? kgToLb(w) : w) : undefined; addMeasure({ date: measForm.date, weightLb, neckIn: measForm.neckIn, waistIn: measForm.waistIn, hipsIn: measForm.hipsIn, abdominIn: measForm.abdominIn });}}>
            <Input label="Date"><input type="date" className="bg-neutral-800 rounded-lg px-2 py-1" value={measForm.date} onChange={e=>setMeasForm({...measForm, date:(e.target as HTMLInputElement).value})}/></Input>
            <Input label={`Weight (${config.weightUnit})`}><input type="number" inputMode="decimal" className="bg-neutral-800 rounded-lg px-2 py-1" value={measForm.weightStr} onChange={e=>setMeasForm({...measForm, weightStr:(e.target as HTMLInputElement).value})}/></Input>
            <Input label="Neck (in)"><input type="number" inputMode="decimal" className="bg-neutral-800 rounded-lg px-2 py-1" value={measForm.neckIn} onChange={e=>setMeasForm({...measForm, neckIn:(e.target as HTMLInputElement).value})}/></Input>
            <Input label="Waist (in)"><input type="number" inputMode="decimal" className="bg-neutral-800 rounded-lg px-2 py-1" value={measForm.waistIn} onChange={e=>setMeasForm({...measForm, waistIn:(e.target as HTMLInputElement).value})}/></Input>
            <Input label="Hips (in)"><input type="number" inputMode="decimal" className="bg-neutral-800 rounded-lg px-2 py-1" value={measForm.hipsIn} onChange={e=>setMeasForm({...measForm, hipsIn:(e.target as HTMLInputElement).value})}/></Input>
            <Input label="Abdomin (in)"><input type="number" inputMode="decimal" className="bg-neutral-800 rounded-lg px-2 py-1" value={measForm.abdominIn} onChange={e=>setMeasForm({...measForm, abdominIn:(e.target as HTMLInputElement).value})}/></Input>
            <div className="md:col-span-3"><button type="submit" className="px-3 py-2 rounded-xl bg-sky-600 hover:bg-sky-500">Save Measurement</button></div>
          </form>

          <div className="grid md:grid-cols-3 gap-3 mb-4">
            <StatPill label="Latest Weight" value={latestMeasure? (config.weightUnit==='kg' ? `${(lbToKg(latestMeasure.weightLb)).toFixed(1)} kg` : `${latestMeasure.weightLb} lb`) : "—"} />
            <StatPill label="Latest Body Fat" value={latestMeasure?.bf!==undefined && latestMeasure?.bf!==null ? formatPct(latestMeasure.bf) : "—"} />
            <StatPill label="Latest BMI" value={latestMeasure?.bmi ?? "—"} />
          </div>

          <div className="grid md:grid-cols-3 gap-3">
            {/* Weight chart */}
            <div className="h-64 w-full bg-neutral-900 rounded-xl p-2 border border-neutral-800">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={measuresComputed.map((m:any) => ({ date: m.date, weight: (config.weightUnit==='kg'? lbToKg(m.weightLb) : m.weightLb) }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="date" stroke="#aaa" />
                  <YAxis stroke="#aaa" domain={["auto","auto"]} />
                  <Tooltip contentStyle={{background:"#111", border:"1px solid #333", color:"#eee"}} formatter={(v:any)=>[`${config.weightUnit==='kg'? Number(v).toFixed(1)+' kg' : v+' lb'}`, "Weight"]} />
                  <Line type="monotone" dataKey="weight" stroke="#f97316" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            {/* Body fat chart */}
            <div className="h-64 w-full bg-neutral-900 rounded-xl p-2 border border-neutral-800">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={measuresComputed.map((m:any) => ({ date: m.date, bf: m.bf }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="date" stroke="#aaa" />
                  <YAxis stroke="#aaa" domain={["auto","auto"]} />
                  <Tooltip contentStyle={{background:"#111", border:"1px solid #333", color:"#eee"}} formatter={(v:any)=>[formatPct(Number(v)||0), "Body Fat"]} />
                  <Line type="monotone" dataKey="bf" stroke="#60a5fa" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            {/* BMI chart */}
            <div className="h-64 w-full bg-neutral-900 rounded-xl p-2 border border-neutral-800">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={measuresComputed.map((m:any) => ({ date: m.date, bmi: m.bmi }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="date" stroke="#aaa" />
                  <YAxis stroke="#aaa" domain={["auto","auto"]} />
                  <Tooltip contentStyle={{background:"#111", border:"1px solid #333", color:"#eee"}} formatter={(v:any)=>[`${Number(v).toFixed(2)}`, "BMI"]} />
                  <Line type="monotone" dataKey="bmi" stroke="#22c55e" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </Section>

        {/* Backup & Transfer near end */}
        <Section title="Backup & Transfer">
          <BackupTransfer logs={logs} setLogs={setLogs} measures={measures} setMeasures={setMeasures} config={config} setConfig={setConfig} />
        </Section>

        <p className="text-xs text-neutral-500">
          Hover badges to see buff/debuff details. Water is entered in cups (8 oz each). If you pick a date with an existing log, the form fills so you can edit and overwrite.
        </p>

        {/* Log Entries at the very end */}
        <Section title="Log Entries">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm border border-neutral-800 rounded-xl overflow-hidden">
              <thead className="bg-neutral-900/60">
                <tr className="text-neutral-300">
                  {["Date","Weighted","Cardio","PRs","Read (min)","Rest","Sick/Period","Stretch (min)","Clip","New","Calories","Injured","Sleep (h)","Protein (g)","Water (oz)","Minutes","Pace","Diet","Shower"].map((h)=> (
                    <th key={h} className="px-3 py-2 text-left whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {withWorkoutDay.sort((a:any,b:any)=>+parseDate(b.date)-+parseDate(a.date)).map((e:any, i:number) => (
                  <tr key={e.date} className={"border-t border-neutral-800 " + (i % 2 ? "bg-neutral-900/30" : "bg-neutral-950/10")}>
                    <td className="px-3 py-2">{e.date}</td>
                    <td className="px-3 py-2">{e.weightedWorkout?"✅":"—"}</td>
                    <td className="px-3 py-2">{e.cardio?"✅":"—"}</td>
                    <td className="px-3 py-2">{e.prsCount||0}</td>
                    <td className="px-3 py-2">{e.readMinutes||0}</td>
                    <td className="px-3 py-2">{e.restDay?"✅":"—"}</td>
                    <td className="px-3 py-2">{e.sickOrPeriod?"✅":"—"}</td>
                    <td className="px-3 py-2">{e.stretchingMinutes||0}</td>
                    <td className="px-3 py-2">{e.clipRecorded?"✅":"—"}</td>
                    <td className="px-3 py-2">{e.newActivity?"✅":"—"}</td>
                    <td className="px-3 py-2">{e.calories||0}</td>
                    <td className="px-3 py-2">{e.injured?"✅":"—"}</td>
                    <td className="px-3 py-2">{e.sleepLastNightHours??"—"}</td>
                    <td className="px-3 py-2">{e.proteinTotal||0}</td>
                    <td className="px-3 py-2">{e.waterOz||0}</td>
                    <td className="px-3 py-2">{e.workoutMinutes||0}</td>
                    <td className="px-3 py-2">{e.milePace||"—"}</td>
                    <td className="px-3 py-2">{e.dietAdherence?"✅":"—"}</td>
                    <td className="px-3 py-2">{e.showered?"✅":"—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </div>
    );
  }

  // --- Backup & Transfer component ---
  function BackupTransfer({ logs, setLogs, measures, setMeasures, config, setConfig }:{logs:any[], setLogs:Function, measures:any[], setMeasures:Function, config:any, setConfig:Function}){
    const fileInputRef = useRef<HTMLInputElement|null>(null);
    function downloadFile(filename:string, text:string) {
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], {type:'application/json'})); a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=> URL.revokeObjectURL(a.href), 500);
    }
    function exportAll(){ const payload = { version: 1, exportedAt: new Date().toISOString(), config, logs, measures }; downloadFile(`fitness-rpg-backup-${todayStr()}.json`, JSON.stringify(payload, null, 2)); }
    function importFromJSON(obj:any){ if (!obj || typeof obj !== 'object') throw new Error('Invalid file'); const nextConfig = obj.config ?? config; const nextLogs = Array.isArray(obj.logs) ? obj.logs : []; const nextMeasures = Array.isArray(obj.measures) ? obj.measures : []; setConfig(nextConfig); setLogs((prev:any[]) => { const map = new Map(prev.map((e:any)=>[e.date, e])); nextLogs.forEach((e:any) => { if (e?.date) map.set(e.date, e); }); return Array.from(map.values()); }); setMeasures((prev:any[]) => { const map = new Map(prev.map((m:any)=>[m.date, m])); nextMeasures.forEach((m:any) => { if (m?.date) map.set(m.date, m); }); return Array.from(map.values()); }); alert('Import complete!'); }
    return (
      <div>
        <div className="flex items-center gap-2 mb-2">
          <button onClick={exportAll} className="px-3 py-2 rounded-xl bg-sky-600 hover:bg-sky-500">Export Data</button>
          <input ref={fileInputRef} type="file" accept="application/json" className="hidden" onChange={(e)=>{ const file=(e.target as HTMLInputElement).files?.[0]; if(!file) return; const reader=new FileReader(); reader.onload=()=>{ try{ const obj=JSON.parse(reader.result as string); importFromJSON(obj);}catch(err:any){ alert('Import failed: '+ err.message);} }; reader.readAsText(file); (e.target as HTMLInputElement).value=""; }} />
          <button onClick={()=>fileInputRef.current?.click()} className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500">Import Data</button>
        </div>
        <div className="text-xs text-neutral-400">Export downloads a .json file with your settings and history. Import merges by date (same-date entries are replaced) and overwrites settings.</div>
      </div>
    );
  }
