"use client";

import { useEffect, useMemo, useState } from "react";
import { CURRENCIES, CurrencyCode, formatCurrency, fromSimoleon, getRates, toSimoleon } from "../lib/currency";

type TxType = "income" | "expense";
type Tx = {
  id: string;
  date: string;
  description: string;
  type: TxType;
  amountSim: number;
  conversions: Partial<Record<CurrencyCode, number>>;
};

type EditState = { id: string; description: string; type: TxType; amountSim: number } | null;

const PAGE_SIZE = 8;
const DEFAULT_VIEWS: CurrencyCode[] = ["USD", "IDR", "EUR"];

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

  useEffect(() => {
    getRates("USD").then(setRates);
  }, []);

  useEffect(() => {
    const raw = localStorage.getItem("simoleon-bank-v2");
    if (raw) {
      const parsed = JSON.parse(raw) as { balance: number; txs: Tx[] };
      setBalance(parsed.balance);
      setTxs(parsed.txs);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("simoleon-bank-v2", JSON.stringify({ balance, txs }));
  }, [balance, txs]);

  const usdValue = useMemo(() => fromSimoleon(simoleonInput, 1), [simoleonInput]);
  const displayValue = useMemo(() => fromSimoleon(simoleonInput, rates[displayCurrency] ?? 1), [simoleonInput, rates, displayCurrency]);

  const totalPages = Math.max(1, Math.ceil(txs.length / PAGE_SIZE));
  const rows = txs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function buildConversions(amountSim: number) {
    const table: Partial<Record<CurrencyCode, number>> = {};
    for (const code of DEFAULT_VIEWS) table[code] = fromSimoleon(amountSim, rates[code] ?? 1);
    return table;
  }

  function recalcBalance(next: Tx[]) {
    return next.reduce((acc, t) => acc + (t.type === "income" ? t.amountSim : -t.amountSim), 0);
  }

  function addTransaction() {
    if (txAmountSim <= 0) return alert("Simoleon amount must be greater than 0.");
    const nextBalance = balance + (txType === "income" ? txAmountSim : -txAmountSim);
    if (nextBalance < 0) return alert("Not enough Simoleon balance.");
    const tx: Tx = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      description: desc || "Transaction",
      type: txType,
      amountSim: txAmountSim,
      conversions: buildConversions(txAmountSim)
    };
    setTxs((prev) => [tx, ...prev]);
    setBalance(nextBalance);
    setTxAmountSim(0);
  }

  function removeTx(id: string) {
    const next = txs.filter((t) => t.id !== id);
    setTxs(next);
    setBalance(recalcBalance(next));
  }

  function saveEdit() {
    if (!editState) return;
    const next = txs.map((t) => t.id === editState.id ? {
      ...t,
      description: editState.description,
      type: editState.type,
      amountSim: editState.amountSim,
      conversions: buildConversions(editState.amountSim)
    } : t);
    const nextBalance = recalcBalance(next);
    if (nextBalance < 0) return alert("Edit would make balance negative.");
    setTxs(next);
    setBalance(nextBalance);
    setEditState(null);
  }

  return (
    <div className="container">
      <header className="simsHeader">
        <h1>Simoleon World Bank</h1>
        <p>Classic Sims-style wallet tracker</p>
      </header>
      <div className="grid">
        <section className="card">
          <h2>Simoleon ⇢ Currency Converter</h2>
          <label>Simoleon Input (§)</label>
          <input type="number" value={simoleonInput} onChange={(e) => setSimoleonInput(Number(e.target.value))} />
          <label>Display Currency</label>
          <select value={displayCurrency} onChange={(e) => setDisplayCurrency(e.target.value as CurrencyCode)}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select>
          <p><strong>§{simoleonInput.toFixed(2)}</strong> = <strong>{formatCurrency(usdValue, "USD")}</strong></p>
          <p>Then to {displayCurrency}: <strong>{formatCurrency(displayValue, displayCurrency)}</strong></p>
        </section>

        <section className="card">
          <h2>Player Simoleon Account</h2>
          <p>Available Balance: <span className="badge">§{balance.toFixed(2)}</span></p>
          <label>Type</label>
          <select value={txType} onChange={(e) => setTxType(e.target.value as TxType)}><option value="income">Income</option><option value="expense">Expense</option></select>
          <label>Simoleon Amount (§)</label><input type="number" value={txAmountSim} onChange={(e) => setTxAmountSim(Number(e.target.value))} />
          <label>Description</label><input value={desc} onChange={(e) => setDesc(e.target.value)} />
          <button onClick={addTransaction}>Add Transaction</button>
        </section>
      </div>

      <section className="card" style={{ marginTop: 16 }}>
        <h2>Bank Mutation / Statement</h2>
        <table>
          <thead><tr><th>Date</th><th>Description</th><th>Type</th><th>Simoleon</th><th>USD</th><th>IDR</th><th>EUR</th><th>Action</th></tr></thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id}>
                <td>{new Date(t.date).toLocaleString()}</td>
                <td>{t.description}</td>
                <td>{t.type}</td>
                <td>{t.type === "expense" ? "-" : "+"}§{t.amountSim.toFixed(2)}</td>
                <td>{formatCurrency(t.conversions.USD ?? 0, "USD")}</td>
                <td>{formatCurrency(t.conversions.IDR ?? 0, "IDR")}</td>
                <td>{formatCurrency(t.conversions.EUR ?? 0, "EUR")}</td>
                <td>
                  <div className="rowActions">
                    <button onClick={() => setEditState({ id: t.id, description: t.description, type: t.type, amountSim: t.amountSim })}>Edit</button>
                    <button className="danger" onClick={() => removeTx(t.id)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="pager">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
          <span>Page {page}/{totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      </section>

      {editState && (
        <div className="modalBackdrop">
          <div className="modalCard">
            <h3>Edit Transaction</h3>
            <label>Type</label>
            <select value={editState.type} onChange={(e) => setEditState({ ...editState, type: e.target.value as TxType })}><option value="income">Income</option><option value="expense">Expense</option></select>
            <label>Simoleon Amount (§)</label>
            <input type="number" value={editState.amountSim} onChange={(e) => setEditState({ ...editState, amountSim: Number(e.target.value) })} />
            <label>Description</label>
            <input value={editState.description} onChange={(e) => setEditState({ ...editState, description: e.target.value })} />
            <div className="rowActions">
              <button onClick={saveEdit}>Save</button>
              <button className="secondary" onClick={() => setEditState(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
