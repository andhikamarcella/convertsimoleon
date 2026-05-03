"use client";

import { useEffect, useMemo, useState } from "react";
import { CURRENCIES, CurrencyCode, formatCurrency, fromSimoleon, getRates } from "../lib/currency";

type TxType = "income" | "expense";
type Region = "Americas" | "Europe" | "Asia-Pacific";
type Tx = {
  id: string;
  date: string;
  description: string;
  type: TxType;
  amountSim: number;
  localCurrency: CurrencyCode;
  localAmount: number;
  conversions: Partial<Record<CurrencyCode, number>>;
};

type EditState = { id: string; description: string; type: TxType; amountSim: number } | null;

const PAGE_SIZE = 5;
const REGION_MAP: Record<Region, CurrencyCode[]> = {
  Americas: ["USD", "CAD", "MXN", "BRL"],
  Europe: ["EUR", "GBP", "CHF", "SEK", "NOK"],
  "Asia-Pacific": ["IDR", "JPY", "SGD", "AUD", "NZD", "CNY", "INR", "KRW", "THB", "MYR", "PHP"]
};

export default function SimoleonApp() {
  const [displayCurrency, setDisplayCurrency] = useState<CurrencyCode>("IDR");
  const [simoleonInput, setSimoleonInput] = useState(100);
  const [rates, setRates] = useState<Record<string, number>>({ USD: 1 });
  const [balance, setBalance] = useState(0);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [desc, setDesc] = useState("First salary");
  const [txAmountSim, setTxAmountSim] = useState(50);
  const [txType, setTxType] = useState<TxType>("income");
  const [page, setPage] = useState(1);
  const [editState, setEditState] = useState<EditState>(null);
  const [region, setRegion] = useState<Region>("Asia-Pacific");
  const [localCurrency, setLocalCurrency] = useState<CurrencyCode>("IDR");
  const [showCurrencyPopup, setShowCurrencyPopup] = useState(false);

  const [filterType, setFilterType] = useState<"all" | TxType>("all");
  const [filterCurrency, setFilterCurrency] = useState<"all" | CurrencyCode>("all");
  const [filterText, setFilterText] = useState("");

  useEffect(() => { getRates("USD").then(setRates); }, []);
  useEffect(() => {
    const raw = localStorage.getItem("simoleon-bank-v3");
    if (raw) {
      const parsed = JSON.parse(raw) as { balance: number; txs: Tx[] };
      setBalance(parsed.balance);
      setTxs(parsed.txs);
    }
  }, []);
  useEffect(() => { localStorage.setItem("simoleon-bank-v3", JSON.stringify({ balance, txs })); }, [balance, txs]);

  useEffect(() => {
    const first = REGION_MAP[region][0];
    if (!REGION_MAP[region].includes(localCurrency)) setLocalCurrency(first);
  }, [region, localCurrency]);

  const usdValue = useMemo(() => fromSimoleon(simoleonInput, 1), [simoleonInput]);
  const displayValue = useMemo(() => fromSimoleon(simoleonInput, rates[displayCurrency] ?? 1), [simoleonInput, rates, displayCurrency]);

  const filteredTxs = useMemo(() => txs.filter((t) => {
    if (filterType !== "all" && t.type !== filterType) return false;
    if (filterCurrency !== "all" && t.localCurrency !== filterCurrency) return false;
    if (filterText && !t.description.toLowerCase().includes(filterText.toLowerCase())) return false;
    return true;
  }), [txs, filterType, filterCurrency, filterText]);

  const totalPages = Math.max(1, Math.ceil(filteredTxs.length / PAGE_SIZE));
  const rows = filteredTxs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const totals = useMemo(() => {
    const income = filteredTxs.filter((t) => t.type === "income").reduce((a, b) => a + b.amountSim, 0);
    const expense = filteredTxs.filter((t) => t.type === "expense").reduce((a, b) => a + b.amountSim, 0);
    const totalSim = filteredTxs.reduce((a, b) => a + (b.type === "income" ? b.amountSim : -b.amountSim), 0);
    const currencyTotals: Partial<Record<CurrencyCode, number>> = {};
    for (const tx of filteredTxs) {
      const signed = tx.type === "income" ? tx.localAmount : -tx.localAmount;
      currencyTotals[tx.localCurrency] = (currencyTotals[tx.localCurrency] ?? 0) + signed;
    }
    return { income, expense, totalSim, currencyTotals };
  }, [filteredTxs]);

  function recalcBalance(next: Tx[]) { return next.reduce((acc, t) => acc + (t.type === "income" ? t.amountSim : -t.amountSim), 0); }

  function addTransaction() {
    if (txAmountSim <= 0 || Number.isNaN(txAmountSim)) return alert("Simoleon amount must be greater than 0.");
    const nextBalance = balance + (txType === "income" ? txAmountSim : -txAmountSim);
    if (nextBalance < 0) return alert("Not enough Simoleon balance.");
    const safeRate = rates[localCurrency] ?? 1;
    const tx: Tx = {
      id: crypto.randomUUID(), date: new Date().toISOString(), description: desc.trim() || "(No description)", type: txType, amountSim: txAmountSim,
      localCurrency, localAmount: fromSimoleon(txAmountSim, safeRate), conversions: { USD: fromSimoleon(txAmountSim, 1), IDR: fromSimoleon(txAmountSim, rates.IDR ?? 1), EUR: fromSimoleon(txAmountSim, rates.EUR ?? 1) }
    };
    setTxs((prev) => [tx, ...prev]); setBalance(nextBalance); setTxAmountSim(0); setShowCurrencyPopup(false);
  }

  return <div className="container">
    <header className="simsHeader floatAnim"><h1>Simoleon World Bank</h1><p>Mobile + desktop friendly ledger</p></header>
    <div className="grid">
      <section className="card">
        <h2>Simoleon ⇢ Currency Converter</h2>
        <label>Simoleon Input (§)</label><input type="number" value={simoleonInput} onChange={(e) => setSimoleonInput(Number(e.target.value || 0))} />
        <label>Display Currency</label>
        <select value={displayCurrency} onChange={(e) => setDisplayCurrency(e.target.value as CurrencyCode)}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select>
        <p><strong>§{simoleonInput.toFixed(2)}</strong> = <strong>{formatCurrency(usdValue, "USD")}</strong></p>
        <p>To {displayCurrency}: <strong>{formatCurrency(displayValue, displayCurrency)}</strong></p>
      </section>
      <section className="card">
        <h2>Player Simoleon Account</h2>
        <p>Available Balance: <span className="badge">§{balance.toFixed(2)}</span></p>
        <label>Type</label><select value={txType} onChange={(e) => setTxType(e.target.value as TxType)}><option value="income">Income</option><option value="expense">Expense</option></select>
        <label>Simoleon Amount (§)</label><input type="number" value={txAmountSim} onChange={(e) => setTxAmountSim(Number(e.target.value || 0))} />
        <label>Description</label><input value={desc} onChange={(e) => setDesc(e.target.value)} />
        <button onClick={() => setShowCurrencyPopup(true)}>Choose Local Currency + Add</button>
      </section>
    </div>

    <section className="card" style={{ marginTop: 16 }}>
      <h2>Bank Mutation / Statement</h2>
      <div className="filterGrid">
        <input placeholder="Filter description..." value={filterText} onChange={(e) => { setFilterText(e.target.value); setPage(1); }} />
        <select value={filterType} onChange={(e) => { setFilterType(e.target.value as "all" | TxType); setPage(1); }}><option value="all">All Types</option><option value="income">Income</option><option value="expense">Expense</option></select>
        <select value={filterCurrency} onChange={(e) => { setFilterCurrency(e.target.value as "all" | CurrencyCode); setPage(1); }}><option value="all">All Currencies</option>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select>
      </div>
      <div className="tableWrap"><table>
        <thead><tr><th>Date</th><th>Description</th><th>Type</th><th>Local Amount</th><th>Simoleon</th></tr></thead>
        <tbody>
          {rows.map((t) => <tr key={t.id}><td>{new Date(t.date).toLocaleDateString()}</td><td>{t.description}</td><td>{t.type}</td><td>{formatCurrency(t.localAmount, t.localCurrency)} ({t.localCurrency})</td><td>{t.type === "expense" ? "-" : "+"}§{t.amountSim.toFixed(2)}</td></tr>)}
          <tr className="summaryRow"><td>-</td><td>-</td><td>Total Income/Expense</td><td>{Object.entries(totals.currencyTotals).map(([c,v]) => <div key={c}>{c}: {formatCurrency(v ?? 0, c)}</div>)}</td><td>Income §{totals.income.toFixed(2)} / Expense §{totals.expense.toFixed(2)} / Net §{totals.totalSim.toFixed(2)}</td></tr>
        </tbody>
      </table></div>
      <div className="pager"><button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button><span>Page {page}/{totalPages} (5 rows)</span><button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button></div>
    </section>

    {showCurrencyPopup && <div className="modalBackdrop"><div className="modalCard"><h3>Choose Conversion Region & Currency</h3><label>Region</label><select value={region} onChange={(e) => setRegion(e.target.value as Region)}>{Object.keys(REGION_MAP).map((r) => <option key={r}>{r}</option>)}</select><label>Currency</label><select value={localCurrency} onChange={(e) => setLocalCurrency(e.target.value as CurrencyCode)}>{REGION_MAP[region].map((c) => <option key={c}>{c}</option>)}</select><div className="rowActions"><button onClick={addTransaction}>Save Transaction</button><button className="secondary" onClick={() => setShowCurrencyPopup(false)}>Cancel</button></div></div></div>}

    {editState && <div className="modalBackdrop"><div className="modalCard"><h3>Edit Transaction</h3><p>Coming from previous version: edit popup kept available for future per-row edit extension.</p><button className="secondary" onClick={() => setEditState(null)}>Close</button></div></div>}
  </div>;
}
