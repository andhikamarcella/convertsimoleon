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

  const [stocks, setStocks] = useState<Stock[]>(STOCKS);
  const [portfolio, setPortfolio] = useState<Record<string, Hold>>({});
  const [autoSellSec, setAutoSellSec] = useState(10);
  const [activeStock, setActiveStock] = useState<string | null>(null);
  const [chartPan, setChartPan] = useState(0);

  useEffect(() => {
    const load = () => getRates("USD").then(setRates);
    load();
    const iv = setInterval(load, 30000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const raw = localStorage.getItem("simoleon-bank-v5");
    if (raw) {
      const p = JSON.parse(raw) as { balance: number; txs: Tx[]; portfolio: Record<string, Hold>; lastEntryCurrency: CurrencyCode };
      setBalance(p.balance); setTxs(p.txs); setPortfolio(p.portfolio || {}); if (p.lastEntryCurrency) setLastEntryCurrency(p.lastEntryCurrency);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("simoleon-bank-v5", JSON.stringify({ balance, txs, portfolio, lastEntryCurrency }));
  }, [balance, txs, portfolio, lastEntryCurrency]);

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
        if (hold.qty > 0 && hold.autoSellAt && now >= hold.autoSellAt) {
          tradeStock(symbol, "sell");
          setPortfolio((p) => ({ ...p, [symbol]: { ...p[symbol], autoSellAt: undefined } }));
        }
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [portfolio, stocks]);

  const simValue = Number(simoleonInput || 0);
  const txSim = Number(txAmount || 0);
  const usdValue = fromSimoleon(simValue, 1);
  const displayValue = fromSimoleon(simValue, rates[displayCurrency] ?? 1);

  const totalPages = Math.max(1, Math.ceil(txs.length / PAGE_SIZE));
  const rows = txs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totals = useMemo(() => {
    const income = txs.filter((t) => t.type === "income").reduce((a, b) => a + b.amountSim, 0);
    const expense = txs.filter((t) => t.type === "expense").reduce((a, b) => a + b.amountSim, 0);
    const net = income - expense;
    const currencyTotals: Partial<Record<CurrencyCode, number>> = {};
    for (const tx of txs) {
      const signed = tx.type === "income" ? tx.localAmount : -tx.localAmount;
      currencyTotals[tx.localCurrency] = (currencyTotals[tx.localCurrency] ?? 0) + signed;
    }
    return { income, expense, net, currencyTotals };
  }, [txs]);


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
      setPortfolio((p) => ({ ...p, [symbol]: { qty: (p[symbol]?.qty ?? 0) + lot, avg: stock.price, autoSellAt: Date.now() + autoSellSec * 1000 } }));
      addTx("expense", cost, `Buy ${lot} ${symbol}`, lastEntryCurrency);
    } else {
      if (owned < lot) return alert("Not enough lots");
      setBalance((b) => b + cost);
      setPortfolio((p) => ({ ...p, [symbol]: { qty: Math.max(0, (p[symbol]?.qty ?? 0) - lot), avg: p[symbol]?.avg ?? stock.price } }));
      addTx("income", cost, `Sell ${lot} ${symbol}`, lastEntryCurrency);
    }
  }

  const active = stocks.find((s) => s.symbol === activeStock) || null;
  const visibleHistory = active ? active.history.slice(Math.max(0, active.history.length - 30 - chartPan), Math.max(0, active.history.length - chartPan)) : [];
  const min = visibleHistory.length ? Math.min(...visibleHistory) : 0;
  const max = visibleHistory.length ? Math.max(...visibleHistory) : 1;
  const path = visibleHistory.map((v, i) => `${i === 0 ? "M" : "L"} ${10 + i * 9} ${100 - ((v - min) / ((max - min) || 1)) * 70}`).join(" ");

  return <div className="container">
    <header className="simsHeader floatAnim"><h1>Simoleon World Bank</h1><p>Sims-inspired economy dashboard</p></header>

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
      <h2>Bank Mutation</h2>
      <div className="tableWrap"><table><thead><tr><th>Date</th><th>Description</th><th>Type</th><th>Local</th><th>Simoleon</th></tr></thead>
        <tbody>{rows.map((t) => <tr key={t.id}><td>{new Date(t.date).toLocaleDateString()}</td><td>{t.description}</td><td>{t.type}</td><td>{formatCurrency(t.localAmount, t.localCurrency)} ({t.localCurrency})</td><td>{t.type === "expense" ? "-" : "+"}§{t.amountSim.toFixed(2)}</td></tr>)}<tr className="summaryRow"><td>-</td><td>-</td><td>Total</td><td>{Object.entries(totals.currencyTotals).map(([c,v]) => <div key={c}>{c}: {formatCurrency(v ?? 0, c)}</div>)}</td><td>Income §{totals.income.toFixed(2)} / Expense §{totals.expense.toFixed(2)} / Net §{totals.net.toFixed(2)}</td></tr></tbody></table></div>
      <div className="pager"><button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button><span>Page {page}/{totalPages}</span><button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button></div>
    </section>

    <section className="card" style={{ marginTop: 16 }}>
      <h2>SimStock Live Game</h2>
      <div className="rowActions"><label>Auto Sell Timer</label><select value={autoSellSec} onChange={(e) => setAutoSellSec(Number(e.target.value))}><option value={5}>5s</option><option value={10}>10s</option><option value={30}>30s</option><option value={60}>1m</option></select><small>Stock tx currency follows your last ledger input: <b>{lastEntryCurrency}</b></small></div>
      <div className="tableWrap"><table><thead><tr><th>Stock</th><th>Price</th><th>%</th><th>Owned</th><th>Action</th></tr></thead>
        <tbody>{stocks.map((s) => <tr key={s.symbol} onClick={() => { setActiveStock(s.symbol); setChartPan(0); }} style={{ cursor: "pointer" }}><td><b>{s.symbol}</b><br />{s.name}</td><td>§{s.price.toFixed(2)}</td><td style={{ color: s.change >= 0 ? "#0b8e4b" : "#cb2f2f" }}>{s.change >= 0 ? "+" : ""}{s.change.toFixed(2)}%</td><td>{portfolio[s.symbol]?.qty ?? 0}</td><td><div className="rowActions"><button onClick={(e) => { e.stopPropagation(); tradeStock(s.symbol, "buy"); }}>Buy</button><button className="secondary" onClick={(e) => { e.stopPropagation(); tradeStock(s.symbol, "sell"); }}>Sell</button></div></td></tr>)}</tbody></table></div>
    </section>

    {active && <div className="modalBackdrop"><div className="modalCard wide"><h3>{active.name} ({active.symbol})</h3>
      <div className="rowActions"><button className="secondary" onClick={() => setChartPan((p) => Math.min(p + 5, Math.max(0, active.history.length - 30)))}>Older ◀</button><button className="secondary" onClick={() => setChartPan((p) => Math.max(0, p - 5))}>Newer ▶</button><small>Pan: {chartPan}</small></div>
      <svg viewBox="0 0 300 110" className="lineChart"><line x1="10" y1="100" x2="290" y2="100" stroke="#355" /><line x1="10" y1="10" x2="10" y2="100" stroke="#355" />{[0, 1, 2, 3, 4].map((i) => <line key={i} x1="10" y1={20 + i * 18} x2="290" y2={20 + i * 18} stroke="#abc" strokeDasharray="3 4" />)}<path d={path} stroke="#2bbb6e" strokeWidth="3" fill="none" /></svg>
      <p>Ruler (Simoleon): min §{min.toFixed(2)} | max §{max.toFixed(2)}</p>
      <div className="rowActions"><button onClick={() => tradeStock(active.symbol, "buy")}>Buy</button><button className="secondary" onClick={() => tradeStock(active.symbol, "sell")}>Sell</button><button className="secondary" onClick={() => setActiveStock(null)}>Close</button></div>
    </div></div>}

    {showCurrencyPopup && <div className="modalBackdrop"><div className="modalCard"><h3>Choose region and local currency</h3><label>Region</label><select value={region} onChange={(e) => setRegion(e.target.value as Region)}>{Object.keys(REGION_MAP).map((r) => <option key={r}>{r}</option>)}</select><label>Currency</label><select value={localCurrency} onChange={(e) => setLocalCurrency(e.target.value as CurrencyCode)}>{REGION_MAP[region].map((c) => <option key={c}>{c}</option>)}</select><div className="rowActions"><button onClick={addTransaction}>Save</button><button className="secondary" onClick={() => setShowCurrencyPopup(false)}>Cancel</button></div></div></div>}
  </div>;
}
