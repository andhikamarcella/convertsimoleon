"use client";
import { useEffect, useMemo, useState } from "react";
import { CURRENCIES, CurrencyCode, formatCurrency, fromSimoleon, getRates } from "../lib/currency";

type TxType = "income" | "expense";
type Region = "Americas" | "Europe" | "Asia-Pacific";
type Tx = { id: string; date: string; description: string; type: TxType; amountSim: number; localCurrency: CurrencyCode; localAmount: number };
type Stock = { symbol: string; name: string; price: number; change: number; history: number[] };
type Hold = { qty: number; avg: number; autoSellAt?: number };

const PAGE_SIZE = 5;
const REGION_MAP: Record<Region, CurrencyCode[]> = {
  Americas: ["USD", "CAD", "MXN", "BRL"],
  Europe: ["EUR", "GBP", "CHF", "SEK", "NOK"],
  "Asia-Pacific": ["IDR", "JPY", "SGD", "AUD", "NZD", "CNY", "INR", "KRW", "THB", "MYR", "PHP"]
};

const STOCKS: Stock[] = [
  ["PLMB", "Plumbob Dynamics"], ["SULS", "Sul Sul Studio"], ["BLDR", "Build Mode Works"], ["CASA", "CAS Atelier"],
  ["WOOH", "WooHoo Resorts"], ["GNOM", "Gnome Garden Co"], ["SIMC", "SimCity Utility"], ["LAMA", "Llama Transit"],
  ["POOL", "No-Ladder Pools"], ["GRIM", "Grim Reaper Insure"], ["BUNY", "Bunny Social"], ["NANN", "Nanny Agency"],
  ["BURG", "Burger Barons"], ["PLNT", "PlantSim Bio"], ["WITC", "Witchcraft Labs"]
].map((x, i) => ({ symbol: x[0], name: x[1], price: 20 + i * 4, change: 0, history: [20 + i * 4] }));

export default function SimoleonApp() {
  const [rates, setRates] = useState<Record<string, number>>({ USD: 1 });
  const [displayCurrency, setDisplayCurrency] = useState<CurrencyCode>("IDR");
  const [simoleonInput, setSimoleonInput] = useState("");
  const [balance, setBalance] = useState(0);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [txAmount, setTxAmount] = useState("");
  const [txType, setTxType] = useState<TxType>("income");
  const [desc, setDesc] = useState("First salary");
  const [region, setRegion] = useState<Region>("Asia-Pacific");
  const [localCurrency, setLocalCurrency] = useState<CurrencyCode>("IDR");
  const [lastEntryCurrency, setLastEntryCurrency] = useState<CurrencyCode>("IDR");
  const [showCurrencyPopup, setShowCurrencyPopup] = useState(false);
  const [page, setPage] = useState(1);
  const [filterText, setFilterText] = useState("");
  const [filterType, setFilterType] = useState<"all" | TxType>("all");
  const [filterCurrency, setFilterCurrency] = useState<"all" | CurrencyCode>("all");
  const [savingGoal, setSavingGoal] = useState("5000");
  const [theme, setTheme] = useState<"classic"|"night">("classic");

  const [stocks, setStocks] = useState<Stock[]>(STOCKS);
  const [portfolio, setPortfolio] = useState<Record<string, Hold>>({});
  const [activeStock, setActiveStock] = useState<string | null>(null);
  const [chartPan, setChartPan] = useState(0);
  const [targetLineInput, setTargetLineInput] = useState("4");
  const [lotInput, setLotInput] = useState("10");
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  const simValue = Number(simoleonInput || 0);
  const txSim = Number(txAmount || 0);
  const lotSize = Math.max(1, Number(lotInput || 0));
  const targetLinePct = Math.max(0.1, Number(targetLineInput || 0));

  useEffect(() => {
    const load = () => getRates("USD").then(setRates);
    load();
    const iv = setInterval(load, 30000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const raw = localStorage.getItem("simoleon-bank-v5");
    if (raw) {
      const p = JSON.parse(raw) as { balance: number; txs: Tx[]; portfolio: Record<string, Hold>; lastEntryCurrency: CurrencyCode; savingGoal?: string; theme?: "classic"|"night" };
      setBalance(p.balance); setTxs(p.txs); setPortfolio(p.portfolio || {}); if (p.lastEntryCurrency) setLastEntryCurrency(p.lastEntryCurrency); if (p.savingGoal) setSavingGoal(p.savingGoal); if (p.theme) setTheme(p.theme);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("simoleon-bank-v5", JSON.stringify({ balance, txs, portfolio, lastEntryCurrency, savingGoal, theme }));
  }, [balance, txs, portfolio, lastEntryCurrency, savingGoal, theme]);

  useEffect(() => {
    const first = REGION_MAP[region][0];
    if (!REGION_MAP[region].includes(localCurrency)) setLocalCurrency(first);
  }, [region, localCurrency]);

  useEffect(() => {
    const iv = setInterval(() => {
      setStocks((prev) => prev.map((s) => {
        const drift = (Math.random() - 0.5) * 0.08;
        const next = Math.max(1, s.price * (1 + drift));
        const ch = ((next - s.price) / s.price) * 100;
        return { ...s, price: next, change: ch, history: [...s.history, next].slice(-120) };
      }));
    }, 1500);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const iv = setInterval(() => {
      const now = Date.now();
      Object.entries(portfolio).forEach(([symbol, hold]) => {
        const stock = stocks.find((st) => st.symbol === symbol);
        if (!stock || hold.qty <= 0) return;
        const up = hold.avg * (1 + targetLinePct / 100);
        const down = hold.avg * (1 - targetLinePct / 100);
        if (stock.price >= up || stock.price <= down) {
          tradeStock(symbol, "sell");
        }
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [portfolio, stocks, targetLinePct]);

  const usdValue = fromSimoleon(simValue, 1);
  const displayValue = fromSimoleon(simValue, rates[displayCurrency] ?? 1);

  const filteredTxs = useMemo(() => txs.filter((t) => {
    if (filterType !== "all" && t.type !== filterType) return false;
    if (filterCurrency !== "all" && t.localCurrency !== filterCurrency) return false;
    if (filterText && !t.description.toLowerCase().includes(filterText.toLowerCase())) return false;
    return true;
  }), [txs, filterText, filterType, filterCurrency]);

  const totalPages = Math.max(1, Math.ceil(filteredTxs.length / PAGE_SIZE));
  const rows = filteredTxs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totals = useMemo(() => {
    const income = filteredTxs.filter((t) => t.type === "income").reduce((a, b) => a + b.amountSim, 0);
    const expense = filteredTxs.filter((t) => t.type === "expense").reduce((a, b) => a + b.amountSim, 0);
    const net = income - expense;
    const currencyTotals: Partial<Record<CurrencyCode, number>> = {};
    for (const tx of filteredTxs) {
      const signed = tx.type === "income" ? tx.localAmount : -tx.localAmount;
      currencyTotals[tx.localCurrency] = (currencyTotals[tx.localCurrency] ?? 0) + signed;
    }
    return { income, expense, net, currencyTotals };
  }, [filteredTxs]);


  function addTx(type: TxType, amountSim: number, description: string, currency: CurrencyCode) {
    const safeRate = rates[currency] ?? 1;
    const tx: Tx = { id: crypto.randomUUID(), date: new Date().toISOString(), description, type, amountSim, localCurrency: currency, localAmount: fromSimoleon(amountSim, safeRate) };
    setTxs((prev) => [tx, ...prev]);
  }

  function addTransaction() {
    if (txSim <= 0) return alert("Simoleon amount must be greater than 0");
    const next = balance + (txType === "income" ? txSim : -txSim);
    if (next < 0) return alert("Not enough balance");
    setBalance(next);
    addTx(txType, txSim, desc || "(No description)", localCurrency);
    setLastEntryCurrency(localCurrency);
    setTxAmount("");
    setShowCurrencyPopup(false);
  }

  function tradeStock(symbol: string, mode: "buy" | "sell") {
    const stock = stocks.find((s) => s.symbol === symbol);
    if (!stock) return;
    const lot = 10;
    const cost = stock.price * lot;
    const owned = portfolio[symbol]?.qty ?? 0;
    if (mode === "buy") {
      if (balance < cost) return alert("Balance not enough");
      setBalance((b) => b - cost);
      setPortfolio((p) => ({ ...p, [symbol]: { qty: (p[symbol]?.qty ?? 0) + lot, avg: stock.price } }));
      addTx("expense", cost, `Buy ${lot} ${symbol}`, lastEntryCurrency);
    } else {
      if (owned < lot) return alert("Not enough lots");
      setBalance((b) => b + cost);
      setPortfolio((p) => ({ ...p, [symbol]: { qty: Math.max(0, (p[symbol]?.qty ?? 0) - lot), avg: p[symbol]?.avg ?? stock.price } }));
      addTx("income", cost, `Sell ${lot} ${symbol}`, lastEntryCurrency);
    }
  }


  function exportCsv() {
    const rows = filteredTxs.map((t) => [t.date, t.description, t.type, t.localCurrency, t.localAmount.toFixed(2), t.amountSim.toFixed(2)]);
    const csv = ["date,description,type,currency,local_amount,simoleon", ...rows.map((r) => r.map((x) => `"${String(x).replaceAll('\"', '\\\"')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "bank-mutation.csv"; a.click(); URL.revokeObjectURL(url);
  }


  const goalValue = Number(savingGoal || 0);
  const goalProgress = goalValue > 0 ? Math.min(100, (balance / goalValue) * 100) : 0;
  const today = new Date().toDateString();
  const todayTxCount = txs.filter((t) => new Date(t.date).toDateString() === today).length;

  function exportBackup() {
    const blob = new Blob([JSON.stringify({ balance, txs, portfolio, lastEntryCurrency, savingGoal, theme }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "simoleon-backup.json"; a.click(); URL.revokeObjectURL(url);
  }

  function resetAllData() {
    if (!confirm("Reset all data?")) return;
    setBalance(0); setTxs([]); setPortfolio({}); setLastEntryCurrency("IDR");
  }

  const active = stocks.find((s) => s.symbol === activeStock) || null;
  const visibleHistory = active ? active.history.slice(Math.max(0, active.history.length - 30 - chartPan), Math.max(0, active.history.length - chartPan)) : [];
  const min = visibleHistory.length ? Math.min(...visibleHistory) : 0;
  const max = visibleHistory.length ? Math.max(...visibleHistory) : 1;
  const path = visibleHistory.map((v, i) => `${i === 0 ? "M" : "L"} ${10 + i * 9} ${100 - ((v - min) / ((max - min) || 1)) * 70}`).join(" ");
  const buyRef = active && portfolio[active.symbol]?.avg ? portfolio[active.symbol].avg : (visibleHistory[0] ?? 0);
  const targetUp = buyRef * (1 + targetLinePct / 100);
  const targetDown = buyRef * (1 - targetLinePct / 100);
  const toY = (v:number)=> 100 - ((v - min) / ((max - min) || 1)) * 70;
  const portfolioValue = stocks.reduce((acc, st) => acc + ((portfolio[st.symbol]?.qty ?? 0) * st.price), 0);
  const totalWealth = balance + portfolioValue;

  return <div className={`container ${theme === "night" ? "nightMode" : ""}`}>
    <header className="simsHeader floatAnim"><h1>Simoleon World Bank</h1><p>Sims-inspired economy dashboard</p></header><section className="card" style={{marginBottom:14}}><div className="rowActions"><label>Theme</label><select value={theme} onChange={(e)=>setTheme(e.target.value as "classic"|"night")} style={{maxWidth:130}}><option value="classic">Classic</option><option value="night">Night</option></select><label>Saving Goal (§)</label><input type="number" value={savingGoal} onChange={(e)=>setSavingGoal(e.target.value)} style={{maxWidth:150}}/><small>Today Tx: <b>{todayTxCount}</b></small><button className="secondary" onClick={exportBackup}>Backup JSON</button><button className="secondary" onClick={resetAllData}>Reset All</button></div><div className="progressBar"><span style={{width:`${goalProgress}%`}}/></div><small>Goal Progress: {goalProgress.toFixed(1)}%</small></section>

    <div className="grid">
      <section className="card">
        <h2>Simoleon ⇢ Currency Converter</h2>
        <label>Simoleon Input (§)</label><input type="number" value={simoleonInput} onChange={(e) => setSimoleonInput(e.target.value)} />
        <label>Display Currency</label>
        <select value={displayCurrency} onChange={(e) => setDisplayCurrency(e.target.value as CurrencyCode)}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select>
        <p>§{simValue.toFixed(2)} = {formatCurrency(usdValue, "USD")}</p><p>To {displayCurrency}: <strong>{formatCurrency(displayValue, displayCurrency)}</strong></p>
      </section>
      <section className="card">
        <h2>Player Simoleon Account</h2><p>Available Balance: <span className="badge">§{balance.toFixed(2)}</span></p>
        <label>Type</label><select value={txType} onChange={(e) => setTxType(e.target.value as TxType)}><option value="income">Income</option><option value="expense">Expense</option></select>
        <label>Simoleon Amount (§)</label><input type="number" value={txAmount} onChange={(e) => setTxAmount(e.target.value)} />
        <label>Description</label><input value={desc} onChange={(e) => setDesc(e.target.value)} />
        <button onClick={() => setShowCurrencyPopup(true)}>Choose Local Currency + Add</button>
      </section>
    </div>

    <section className="card" style={{ marginTop: 16 }}>
      <h2>Bank Mutation</h2><div className="rowActions"><input placeholder="Filter description" value={filterText} onChange={(e) => { setFilterText(e.target.value); setPage(1); }} /><select value={filterType} onChange={(e) => { setFilterType(e.target.value as "all" | TxType); setPage(1); }}><option value="all">All Types</option><option value="income">Income</option><option value="expense">Expense</option></select><select value={filterCurrency} onChange={(e) => { setFilterCurrency(e.target.value as "all" | CurrencyCode); setPage(1); }}><option value="all">All Currency</option>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select><button className="secondary" onClick={() => { setFilterText(""); setFilterType("all"); setFilterCurrency("all"); setPage(1); }}>Reset Filter</button><button className="secondary" onClick={exportCsv}>Export CSV</button></div>
      <div className="tableWrap"><table><thead><tr><th>Date</th><th>Description</th><th>Type</th><th>Local</th><th>Simoleon</th></tr></thead>
        <tbody>{rows.map((t) => <tr key={t.id}><td>{new Date(t.date).toLocaleDateString()}</td><td>{t.description}</td><td>{t.type}</td><td>{formatCurrency(t.localAmount, t.localCurrency)} ({t.localCurrency})</td><td>{t.type === "expense" ? "-" : "+"}§{t.amountSim.toFixed(2)}</td></tr>)}<tr className="summaryRow"><td>-</td><td>-</td><td>Total</td><td>{Object.entries(totals.currencyTotals).map(([c,v]) => <div key={c}>{c}: {formatCurrency(v ?? 0, c)}</div>)}</td><td>Income §{totals.income.toFixed(2)} / Expense §{totals.expense.toFixed(2)} / Net §{totals.net.toFixed(2)}</td></tr></tbody></table></div>
      <div className="pager"><button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button><span>Page {page}/{totalPages}</span><button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button></div>
    </section>

    <section className="card" style={{ marginTop: 16 }}>
      <h2>SimStock Live Game</h2>
      <div className="stockControls"><div><label>Custom Lot</label><input type="number" value={lotInput} onChange={(e)=>setLotInput(e.target.value)} /></div><div><label>Auto Sell ±% </label><input type="number" value={targetLineInput} onChange={(e)=>setTargetLineInput(e.target.value)} /></div><div className="statBlock"><small>Trade currency: <b>{lastEntryCurrency}</b></small><small>Total saham: <b>§{portfolioValue.toFixed(2)}</b></small><small>Total aset: <b>§{totalWealth.toFixed(2)}</b></small></div></div>
      <div className="tableWrap"><table><thead><tr><th>Stock</th><th>Price</th><th>%</th><th>Owned</th><th>Action</th></tr></thead>
        <tbody>{stocks.map((s) => <tr key={s.symbol} onClick={() => { setActiveStock(s.symbol); setChartPan(0); }} style={{ cursor: "pointer" }}><td><b>{s.symbol}</b><br />{s.name}</td><td>§{s.price.toFixed(2)}</td><td style={{ color: s.change >= 0 ? "#0b8e4b" : "#cb2f2f" }}>{s.change >= 0 ? "+" : ""}{s.change.toFixed(2)}%</td><td>{portfolio[s.symbol]?.qty ?? 0}</td><td><div className="rowActions"><button onClick={(e) => { e.stopPropagation(); tradeStock(s.symbol, "buy"); }}>Buy</button><button className="secondary" onClick={(e) => { e.stopPropagation(); tradeStock(s.symbol, "sell"); }}>Sell</button></div></td></tr>)}</tbody></table></div>
    </section>

    {active && <div className="modalBackdrop"><div className="modalCard wide"><h3>{active.name} ({active.symbol})</h3>
      <div className="rowActions"><button className="secondary" onClick={() => setChartPan((p) => Math.min(p + 5, Math.max(0, active.history.length - 30)))}>Older ◀</button><button className="secondary" onClick={() => setChartPan((p) => Math.max(0, p - 5))}>Newer ▶</button><small>Pan: {chartPan}</small></div>
      <svg viewBox="0 0 300 110" className="lineChart" onTouchStart={(e)=>setTouchStartX(e.touches[0].clientX)} onTouchMove={(e)=>{ if(touchStartX===null) return; const dx=e.touches[0].clientX-touchStartX; if(Math.abs(dx)>18){ setChartPan((p)=> dx<0?Math.min(p+2,Math.max(0,(active?.history.length ?? 30)-30)):Math.max(0,p-2)); setTouchStartX(e.touches[0].clientX);} }} onTouchEnd={()=>setTouchStartX(null)}><line x1="10" y1="100" x2="290" y2="100" stroke="#355" /><line x1="10" y1="10" x2="10" y2="100" stroke="#355" />{[0, 1, 2, 3, 4].map((i) => <line key={i} x1="10" y1={20 + i * 18} x2="290" y2={20 + i * 18} stroke="#abc" strokeDasharray="3 4" />)}<line x1="10" y1={toY(buyRef)} x2="290" y2={toY(buyRef)} stroke="#4b4b4b" strokeDasharray="4 4" /><line x1="10" y1={toY(targetUp)} x2="290" y2={toY(targetUp)} stroke="#0a9f45" strokeDasharray="6 4" /><line x1="10" y1={toY(targetDown)} x2="290" y2={toY(targetDown)} stroke="#d03939" strokeDasharray="6 4" /><path d={path} stroke="#2bbb6e" strokeWidth="3" fill="none" /></svg>
      <p>Ruler: min §{min.toFixed(2)} | buy §{buyRef.toFixed(2)} | target up §{targetUp.toFixed(2)} | target down §{targetDown.toFixed(2)} | max §{max.toFixed(2)}</p>
      <p style={{color:(visibleHistory[visibleHistory.length-1]??0)>=targetUp?"#0a9f45":(visibleHistory[visibleHistory.length-1]??0)<=targetDown?"#c22":"#333"}}>P/L Status: {(visibleHistory[visibleHistory.length-1]??0)>=targetUp?"PROFIT ZONE":(visibleHistory[visibleHistory.length-1]??0)<=targetDown?"LOSS ZONE":"NEUTRAL"} (Δ §{((visibleHistory[visibleHistory.length-1]??buyRef)-buyRef).toFixed(2)})</p>
      <div className="rowActions"><button onClick={() => tradeStock(active.symbol, "buy")}>Buy</button><button className="secondary" onClick={() => tradeStock(active.symbol, "sell")}>Sell</button><button className="secondary" onClick={() => setActiveStock(null)}>Close</button></div>
    </div></div>}

    {showCurrencyPopup && <div className="modalBackdrop"><div className="modalCard"><h3>Choose region and local currency</h3><label>Region</label><select value={region} onChange={(e) => setRegion(e.target.value as Region)}>{Object.keys(REGION_MAP).map((r) => <option key={r}>{r}</option>)}</select><label>Currency</label><select value={localCurrency} onChange={(e) => setLocalCurrency(e.target.value as CurrencyCode)}>{REGION_MAP[region].map((c) => <option key={c}>{c}</option>)}</select><div className="rowActions"><button onClick={addTransaction}>Save</button><button className="secondary" onClick={() => setShowCurrencyPopup(false)}>Cancel</button></div></div></div>}
  </div>;
}