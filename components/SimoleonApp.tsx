"use client";

import { useEffect, useMemo, useState } from "react";
import { CURRENCIES, CurrencyCode, formatCurrency, fromSimoleon, getRates, toSimoleon } from "@/lib/currency";

type TxType = "income" | "expense";
type Tx = { id: string; date: string; description: string; type: TxType; amountSim: number; currency: CurrencyCode; amountLocal: number };

const PAGE_SIZE = 8;

export default function SimoleonApp() {
  const [base, setBase] = useState<CurrencyCode>("USD");
  const [target, setTarget] = useState<CurrencyCode>("IDR");
  const [amount, setAmount] = useState(100);
  const [rates, setRates] = useState<Record<string, number>>({ USD: 1 });
  const [balance, setBalance] = useState(1500);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [desc, setDesc] = useState("Job reward");
  const [txAmount, setTxAmount] = useState(100);
  const [txType, setTxType] = useState<TxType>("income");
  const [page, setPage] = useState(1);

  useEffect(() => {
    getRates(base).then(setRates);
  }, [base]);

  useEffect(() => {
    const raw = localStorage.getItem("simoleon-bank-v1");
    if (raw) {
      const parsed = JSON.parse(raw) as { balance: number; txs: Tx[] };
      setBalance(parsed.balance);
      setTxs(parsed.txs);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("simoleon-bank-v1", JSON.stringify({ balance, txs }));
  }, [balance, txs]);

  const simoleonResult = useMemo(() => {
    const fromRate = rates[base] ?? 1;
    return toSimoleon(amount, fromRate);
  }, [amount, base, rates]);

  const localFromSim = useMemo(() => {
    const toRate = rates[target] ?? 1;
    return fromSimoleon(simoleonResult, toRate);
  }, [simoleonResult, rates, target]);

  const totalPages = Math.max(1, Math.ceil(txs.length / PAGE_SIZE));
  const rows = txs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function addTransaction() {
    const rate = rates[target] ?? 1;
    const amountSim = toSimoleon(txAmount, rate);
    const signed = txType === "income" ? amountSim : -amountSim;
    const next = balance + signed;
    if (next < 0) return alert("Not enough Simoleon balance.");

    const tx: Tx = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      description: desc || "Transaction",
      type: txType,
      amountSim,
      currency: target,
      amountLocal: txAmount
    };

    setBalance(next);
    setTxs((prev) => [tx, ...prev]);
  }

  return (
    <div className="container">
      <h1 style={{ color: "#f5ff8f", textShadow: "2px 2px #174373" }}>Simoleon World Bank (Sims-inspired)</h1>
      <div className="grid">
        <section className="card">
          <h2>Currency ⇄ Simoleon Converter</h2>
          <label>From Currency</label>
          <select value={base} onChange={(e) => setBase(e.target.value as CurrencyCode)}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select>
          <label>Amount</label><input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
          <label>Display To</label>
          <select value={target} onChange={(e) => setTarget(e.target.value as CurrencyCode)}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select>
          <p><strong>{formatCurrency(amount, base)}</strong> ≈ <strong>§{simoleonResult.toFixed(2)}</strong></p>
          <p>Converted back to {target}: <strong>{formatCurrency(localFromSim, target)}</strong></p>
        </section>

        <section className="card">
          <h2>Player Simoleon Account</h2>
          <p>Available Balance: <span className="badge">§{balance.toFixed(2)}</span></p>
          <label>Type</label>
          <select value={txType} onChange={(e) => setTxType(e.target.value as TxType)}>
            <option value="income">Income</option><option value="expense">Expense</option>
          </select>
          <label>Currency</label>
          <select value={target} onChange={(e) => setTarget(e.target.value as CurrencyCode)}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select>
          <label>Amount</label><input type="number" value={txAmount} onChange={(e) => setTxAmount(Number(e.target.value))} />
          <label>Description</label><input value={desc} onChange={(e) => setDesc(e.target.value)} />
          <button onClick={addTransaction}>Add Transaction</button>
        </section>
      </div>

      <section className="card" style={{ marginTop: 16 }}>
        <h2>Bank Mutation / Statement</h2>
        <table>
          <thead><tr><th>Date</th><th>Description</th><th>Type</th><th>Local Amount</th><th>Simoleon</th></tr></thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id}>
                <td>{new Date(t.date).toLocaleString()}</td>
                <td>{t.description}</td>
                <td>{t.type}</td>
                <td>{formatCurrency(t.amountLocal, t.currency)}</td>
                <td>{t.type === "expense" ? "-" : "+"}§{t.amountSim.toFixed(2)}</td>
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
    </div>
  );
}
