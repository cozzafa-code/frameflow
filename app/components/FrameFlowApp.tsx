"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "../lib/supabase";

const STORAGE_KEY = "frameflow-v4";

const ACTIONS_CFG = [
  { key: "sopralluogo", icon: "🔍", label: "Sopralluogo", desc: "Vai a vedere il cantiere", color: "#2563eb" },
  { key: "misure", icon: "📐", label: "Misure", desc: "Prendi le misure", color: "#d97706" },
  { key: "preventivo", icon: "💰", label: "Preventivo", desc: "Prepara preventivo", color: "#8b5cf6" },
  { key: "conferma", icon: "✍️", label: "Conferma Ordine", desc: "Firma conferma", color: "#059669" },
  { key: "fattura", icon: "🧾", label: "Fattura", desc: "Genera fattura", color: "#f59e0b" },
  { key: "posa", icon: "🔧", label: "Posa in Opera", desc: "Installazione infissi", color: "#059669" },
  { key: "riparazione", icon: "🛠️", label: "Riparazione", desc: "Intervento riparazione", color: "#dc2626" },
  { key: "followup", icon: "📞", label: "Richiama", desc: "Contatto follow-up", color: "#6b7280" },
];

const WORKFLOW_NUOVO = [
  { key: "sopralluogo", label: "Sopralluogo", icon: "🔍", color: "#2563eb" },
  { key: "misure", label: "Misure", icon: "📐", color: "#d97706" },
  { key: "preventivo", label: "Preventivo", icon: "💰", color: "#8b5cf6" },
  { key: "conferma", label: "Conferma", icon: "✍️", color: "#059669" },
  { key: "fattura", label: "Fattura", icon: "🧾", color: "#f59e0b" },
  { key: "posa", label: "Posa", icon: "🔧", color: "#10b981" },
];

const WORKFLOW_RIP = [
  { key: "sopralluogo", label: "Sopralluogo", icon: "🔍", color: "#2563eb" },
  { key: "riparazione", label: "Riparazione", icon: "🛠️", color: "#dc2626" },
  { key: "fattura", label: "Fattura", icon: "🧾", color: "#f59e0b" },
];

function getWorkflow(tipo: string) { return tipo === "riparazione" ? WORKFLOW_RIP : WORKFLOW_NUOVO; }
function getPhaseIndex(tipo: string, fase: string) { return getWorkflow(tipo).findIndex(w => w.key === fase); }
function canAdvance(pratica: any) {
  const fase = pratica.fase || "sopralluogo";
  if (fase === "sopralluogo") {
    const act = pratica.actions?.find((a: any) => a.type === "sopralluogo");
    return act ? act.tasks.every((t: any) => t.done) : false;
  }
  if (fase === "misure") return !!pratica.misure;
  if (fase === "preventivo") return !!pratica.preventivo;
  if (fase === "conferma") return !!pratica.confermaOrdine?.firmata;
  if (fase === "riparazione") return !!pratica.riparazione;
  if (fase === "fattura") return !!pratica.fattura;
  if (fase === "posa") {
    const act = pratica.actions?.find((a: any) => a.type === "posa");
    return act ? act.tasks.every((t: any) => t.done) : false;
  }
  return false;
}

const STATUS: Record<string, {label:string;color:string;bg:string;icon:string}> = {
  da_fare: { label: "Da fare", color: "#ef4444", bg: "#fef2f2", icon: "🔴" },
  in_corso: { label: "In corso", color: "#d97706", bg: "#fffbeb", icon: "🟡" },
  completato: { label: "Completato", color: "#059669", bg: "#ecfdf5", icon: "🟢" },
};

const TASKS: Record<string, string[]> = {
  sopralluogo: ["Verificare accessibilità cantiere","Foto panoramica facciata","Contare numero vani","Verificare stato vecchi infissi","Controllare cassonetti","Note per preventivo"],
  misure: ["Portare metro laser","Misurare ogni vano (L×H)","Verificare fuori squadra","Foto soglia + nodo + cassonetto","Compilare scheda misure","Far firmare il cliente"],
  posa: ["Verificare materiali consegnati","Smontaggio vecchi infissi","Installazione nuovi","Sigillature e schiuma","Regolazione ferramenta","Test apertura/chiusura","Pulizia finale","Foto prima/dopo"],
  riparazione: ["Identificare il problema","Foto del danno","Verificare ricambi necessari","Eseguire riparazione","Test funzionamento","Foto dopo intervento","Firma cliente"],
  preventivo: ["Riepilogare misure e materiali","Calcolare costi materiale","Calcolare costi manodopera","Preparare documento","Inviare al cliente"],
  followup: ["Chiamare il cliente","Annotare esito"],
};

const APERTURE = ["DX","SX","DX+SX","Fisso","Vasistas"];
const SISTEMI = ["Finestra 1 anta","Finestra 2 ante","Balcone 1 anta","Balcone 2 ante","Scorrevole","Vasistas","Fisso","Portoncino"];
const PHOTO_TYPES = [{k:"panoramica",l:"Panoram.",i:"🏠"},{k:"soglia",l:"Soglia",i:"⬇️"},{k:"nodo",l:"Nodo",i:"🔗"},{k:"cassonetto",l:"Cassone.",i:"📦"},{k:"imbotto",l:"Imbotto",i:"🔲"},{k:"contesto",l:"Contesto",i:"📸"}];
const PROBLEMI = ["Ferramenta rotta","Guarnizioni usurate","Vetro rotto","Maniglia rotta","Chiusura difettosa","Infiltrazione acqua","Infiltrazione aria","Condensa","Tapparella bloccata","Cerniera rotta","Altro"];
const URGENZE = [{k:"bassa",l:"Bassa",c:"#059669",i:"🟢"},{k:"media",l:"Media",c:"#d97706",i:"🟡"},{k:"alta",l:"Alta",c:"#ef4444",i:"🔴"},{k:"urgente",l:"Urgente",c:"#7c3aed",i:"🟣"}];

function gid() { return Date.now().toString(36) + Math.random().toString(36).substr(2,5); }
function today() { return new Date().toISOString().split("T")[0]; }
function fmtDate(d: string) {
  if (!d) return "";
  const dt = new Date(d+"T00:00:00");
  return ["Dom","Lun","Mar","Mer","Gio","Ven","Sab"][dt.getDay()] + " " + dt.getDate() + " " + ["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"][dt.getMonth()];
}
function dateLabel(d: string) {
  if (d === today()) return "📌 Oggi";
  const tom = new Date(); tom.setDate(tom.getDate()+1);
  if (d === tom.toISOString().split("T")[0]) return "Domani";
  return fmtDate(d);
}
function genPraticaNum(year: number, seq: number) {
  return `P-${year}-${String(seq).padStart(4,"0")}`;
}
function getProgress(tasks: any[]) {
  if (!tasks?.length) return 0;
  return Math.round((tasks.filter((t: any)=>t.done).length/tasks.length)*100);
}
// ==================== PRINT / PDF EXPORT ====================
function printHTML(title: string, content: string) {
  const w = window.open("", "_blank");
  if (!w) { alert("Abilita i popup per stampare/esportare PDF"); return; }
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Plus Jakarta Sans','Segoe UI',Arial,sans-serif;padding:24px;color:#1e293b;font-size:13px;line-height:1.5}
  .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #1e293b;padding-bottom:12px;margin-bottom:16px}
  .logo{font-size:20px;font-weight:800;color:#1e293b}
  .logo span{color:#2563eb}
  .doc-title{font-size:16px;font-weight:700;color:#2563eb;margin-top:4px}
  .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 20px;margin-bottom:16px;padding:12px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0}
  .info-row{display:flex;gap:6px}.info-label{font-weight:700;min-width:80px;color:#64748b;font-size:12px;text-transform:uppercase}.info-val{font-weight:600;color:#0f172a}
  .vano{border:1.5px solid #d1d5db;border-radius:8px;margin-bottom:12px;page-break-inside:avoid}
  .vano-hdr{background:#f59e0b;color:#fff;padding:8px 12px;border-radius:6px 6px 0 0;font-weight:700;font-size:14px}
  .vano-body{padding:12px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px 16px}
  .vano-field{}.vano-field .lbl{font-size:11px;color:#64748b;text-transform:uppercase;font-weight:600}.vano-field .val{font-size:14px;font-weight:700;color:#0f172a}
  .note-box{background:#fffbeb;border:1px solid #fbbf24;border-radius:8px;padding:10px 12px;margin-top:8px;font-size:13px}
  .footer{margin-top:24px;padding-top:12px;border-top:2px solid #e2e8f0;display:flex;justify-content:space-between;font-size:11px;color:#94a3b8}
  .sign-area{margin-top:24px;display:flex;gap:40px}.sign-box{flex:1;border-top:1px solid #1e293b;padding-top:6px;font-size:11px;color:#64748b;text-align:center}
  .urgenza{display:inline-block;padding:3px 12px;border-radius:12px;font-weight:700;font-size:12px}
  .problem-box{background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px;margin-bottom:12px}
  .status-badge{display:inline-block;padding:2px 10px;border-radius:10px;font-size:11px;font-weight:700}
  table{width:100%;border-collapse:collapse;margin:12px 0}
  th{background:#f1f5f9;padding:8px 10px;text-align:left;font-size:11px;text-transform:uppercase;color:#64748b;border:1px solid #e2e8f0}
  td{padding:8px 10px;border:1px solid #e2e8f0;font-size:13px}
  .no-print{position:fixed;top:12px;right:12px;display:flex;gap:8px}
  .no-print button{padding:10px 20px;border-radius:8px;border:none;font-size:14px;font-weight:700;cursor:pointer}
  .btn-print{background:#2563eb;color:#fff}.btn-close{background:#f1f5f9;color:#64748b}
  @media print{.no-print{display:none!important}body{padding:12px}}
</style></head><body>
<div class="no-print"><button class="btn-print" onclick="window.print()">🖨️ Stampa / Salva PDF</button><button class="btn-close" onclick="window.close()">✕ Chiudi</button></div>
${content}
</body></html>`);
  w.document.close();
}

function exportMisure(pratica: any, client: any) {
  const m = pratica?.misure;
  if (!m) { alert("Nessuna misura salvata"); return; }
  const vaniHTML = (m.vani||[]).map((v: any, i: number) => `
    <div class="vano">
      <div class="vano-hdr">Vano ${i+1}${v.ambiente?" — "+v.ambiente:""}</div>
      <div class="vano-body">
        <div class="vano-field"><div class="lbl">Larghezza</div><div class="val">${v.l||"—"} mm</div></div>
        <div class="vano-field"><div class="lbl">Altezza</div><div class="val">${v.h||"—"} mm</div></div>
        <div class="vano-field"><div class="lbl">Quantità</div><div class="val">${v.q||"1"}</div></div>
        <div class="vano-field"><div class="lbl">Apertura</div><div class="val">${v.apertura||"—"}</div></div>
        <div class="vano-field"><div class="lbl">Sistema</div><div class="val">${v.sistema||m.sistema||"—"}</div></div>
        <div class="vano-field"><div class="lbl">Foto</div><div class="val">${Object.values(v.photos||{}).filter(Boolean).length}/6</div></div>
      </div>
      ${v.note?`<div class="note-box">📝 ${v.note}</div>`:""}
    </div>
  `).join("");

  const content = `
    <div class="header">
      <div><div class="logo"><span>◈</span> FrameFlow</div><div class="doc-title">📐 SCHEDA MISURE</div></div>
      <div style="text-align:right"><div style="font-size:18px;font-weight:800;color:#6366f1">${pratica?.numero||""}</div><div style="font-size:12px;color:#64748b">${new Date().toLocaleDateString("it-IT")}</div></div>
    </div>
    <div class="info-grid">
      <div class="info-row"><span class="info-label">Cliente</span><span class="info-val">${client?.nome||"—"}</span></div>
      <div class="info-row"><span class="info-label">Telefono</span><span class="info-val">${client?.telefono||"—"}</span></div>
      <div class="info-row"><span class="info-label">Cantiere</span><span class="info-val">${m.cantiere||"—"}</span></div>
      <div class="info-row"><span class="info-label">Email</span><span class="info-val">${client?.email||"—"}</span></div>
      <div class="info-row"><span class="info-label">Indirizzo</span><span class="info-val">${m.indirizzo||pratica?.indirizzo||"—"}</span></div>
      <div class="info-row"><span class="info-label">Piano</span><span class="info-val">${m.piano||"—"}</span></div>
      <div class="info-row"><span class="info-label">Sistema</span><span class="info-val">${m.sistema||"—"}</span></div>
      <div class="info-row"><span class="info-label">Colore Int.</span><span class="info-val">${m.coloreInt||"—"}</span></div>
      <div class="info-row"><span class="info-label">Colore Est.</span><span class="info-val">${m.coloreEst||"—"}</span></div>
      <div class="info-row"><span class="info-label">N° Vani</span><span class="info-val">${(m.vani||[]).length}</span></div>
    </div>
    <h3 style="font-size:15px;font-weight:700;margin-bottom:10px">DETTAGLIO VANI</h3>
    ${vaniHTML}
    ${m.noteGen?`<div class="note-box" style="margin-top:16px"><strong>📝 Note Generali:</strong><br/>${m.noteGen}</div>`:""}
    <div class="sign-area"><div class="sign-box">Firma Rilevatore</div><div class="sign-box">Firma Cliente</div></div>
    <div class="footer"><span>FrameFlow — Generato il ${new Date().toLocaleString("it-IT")}</span><span>${pratica?.numero||""}</span></div>
  `;
  printHTML(`Misure ${pratica?.numero} - ${client?.nome}`, content);
}

function exportRiparazione(pratica: any, client: any) {
  const r = pratica?.riparazione;
  if (!r) { alert("Nessuna riparazione salvata"); return; }
  const urgColors: Record<string,string> = {bassa:"background:#ecfdf5;color:#059669",media:"background:#fffbeb;color:#d97706",alta:"background:#fef2f2;color:#ef4444",urgente:"background:#f5f3ff;color:#7c3aed"};
  const content = `
    <div class="header">
      <div><div class="logo"><span>◈</span> FrameFlow</div><div class="doc-title">🛠️ SCHEDA RIPARAZIONE</div></div>
      <div style="text-align:right"><div style="font-size:18px;font-weight:800;color:#6366f1">${pratica?.numero||""}</div><div style="font-size:12px;color:#64748b">${new Date().toLocaleDateString("it-IT")}</div></div>
    </div>
    <div class="info-grid">
      <div class="info-row"><span class="info-label">Cliente</span><span class="info-val">${client?.nome||"—"}</span></div>
      <div class="info-row"><span class="info-label">Telefono</span><span class="info-val">${client?.telefono||"—"}</span></div>
      <div class="info-row"><span class="info-label">Indirizzo</span><span class="info-val">${pratica?.indirizzo||"—"}</span></div>
      <div class="info-row"><span class="info-label">Email</span><span class="info-val">${client?.email||"—"}</span></div>
    </div>
    <div class="problem-box">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span style="font-size:15px;font-weight:700">Problema: ${r.problema||"—"}</span>
        <span class="urgenza" style="${urgColors[r.urgenza]||""}">${(r.urgenza||"").toUpperCase()}</span>
      </div>
      ${r.descrizione?`<p style="margin-top:6px;color:#374151">${r.descrizione}</p>`:""}
    </div>
    <div class="info-grid">
      <div class="info-row"><span class="info-label">Tipo Infisso</span><span class="info-val">${r.tipoInfisso||"—"}</span></div>
      <div class="info-row"><span class="info-label">Materiale</span><span class="info-val">${r.materiale||"—"}</span></div>
      <div class="info-row"><span class="info-label">Ricambi</span><span class="info-val">${r.ricambi||"—"}</span></div>
      <div class="info-row"><span class="info-label">Costo Stimato</span><span class="info-val">${r.costoStimato?"€ "+r.costoStimato:"—"}</span></div>
    </div>
    ${r.noteRip?`<div class="note-box"><strong>📝 Note:</strong><br/>${r.noteRip}</div>`:""}
    <div class="sign-area"><div class="sign-box">Firma Tecnico</div><div class="sign-box">Firma Cliente</div></div>
    <div class="footer"><span>FrameFlow — Generato il ${new Date().toLocaleString("it-IT")}</span><span>${pratica?.numero||""}</span></div>
  `;
  printHTML(`Riparazione ${pratica?.numero} - ${client?.nome}`, content);
}

function exportPratica(pratica: any, client: any) {
  const sc = STATUS[pratica.status];
  const actionsHTML = pratica.actions.map((a: any) => {
    const cfg = ACTIONS_CFG.find(ac=>ac.key===a.type)||{icon:"📋",label:a.type};
    const asc = STATUS[a.status];
    const tasksHTML = a.tasks.map((t: any) => `<tr><td style="width:24px">${t.done?"✅":"⬜"}</td><td style="${t.done?"text-decoration:line-through;color:#9ca3af":""}">${t.text}</td></tr>`).join("");
    return `<div style="margin-bottom:12px;border-left:4px solid ${(cfg as any).color||"#6b7280"};padding-left:12px">
      <div style="display:flex;justify-content:space-between;align-items:center"><strong>${cfg.icon} ${cfg.label}</strong><span class="status-badge" style="background:${asc.bg};color:${asc.color}">${asc.label}</span></div>
      ${tasksHTML?`<table style="margin-top:6px">${tasksHTML}</table>`:""}
    </div>`;
  }).join("");

  const content = `
    <div class="header">
      <div><div class="logo"><span>◈</span> FrameFlow</div><div class="doc-title">📋 RIEPILOGO PRATICA</div></div>
      <div style="text-align:right"><div style="font-size:18px;font-weight:800;color:#6366f1">${pratica.numero}</div><span class="status-badge" style="background:${sc.bg};color:${sc.color};font-size:13px">${sc.label}</span></div>
    </div>
    <div class="info-grid">
      <div class="info-row"><span class="info-label">Cliente</span><span class="info-val">${client?.nome||"—"}</span></div>
      <div class="info-row"><span class="info-label">Telefono</span><span class="info-val">${client?.telefono||"—"}</span></div>
      <div class="info-row"><span class="info-label">Indirizzo</span><span class="info-val">${pratica.indirizzo||"—"}</span></div>
      <div class="info-row"><span class="info-label">Email</span><span class="info-val">${client?.email||"—"}</span></div>
      <div class="info-row"><span class="info-label">Data</span><span class="info-val">${fmtDate(pratica.data)} ore ${pratica.ora}</span></div>
      <div class="info-row"><span class="info-label">N° Azioni</span><span class="info-val">${pratica.actions.length}</span></div>
    </div>
    ${pratica.note?`<div class="note-box"><strong>📝 Note:</strong> ${pratica.note}</div>`:""}
    ${pratica.actions.length>0?`<h3 style="font-size:15px;font-weight:700;margin:16px 0 10px">AZIONI</h3>${actionsHTML}`:""}
    ${pratica.misure?`<h3 style="font-size:15px;font-weight:700;margin:16px 0 10px">📐 MISURE</h3><div class="info-grid"><div class="info-row"><span class="info-label">Sistema</span><span class="info-val">${pratica.misure.sistema||"—"}</span></div><div class="info-row"><span class="info-label">N° Vani</span><span class="info-val">${(pratica.misure.vani||[]).length}</span></div><div class="info-row"><span class="info-label">Colore</span><span class="info-val">${pratica.misure.coloreInt||"—"} / ${pratica.misure.coloreEst||"—"}</span></div></div>`:""}
    ${pratica.riparazione?`<h3 style="font-size:15px;font-weight:700;margin:16px 0 10px">🛠️ RIPARAZIONE</h3><div class="info-grid"><div class="info-row"><span class="info-label">Problema</span><span class="info-val">${pratica.riparazione.problema||"—"}</span></div><div class="info-row"><span class="info-label">Urgenza</span><span class="info-val">${pratica.riparazione.urgenza||"—"}</span></div><div class="info-row"><span class="info-label">Costo</span><span class="info-val">${pratica.riparazione.costoStimato?"€ "+pratica.riparazione.costoStimato:"—"}</span></div></div>`:""}
    <div class="footer"><span>FrameFlow — Generato il ${new Date().toLocaleString("it-IT")}</span><span>${pratica.numero}</span></div>
  `;
  printHTML(`Pratica ${pratica.numero} - ${client?.nome}`, content);
}

function exportPreventivo(pratica: any, client: any, showDetails: boolean) {
  const prev = pratica?.preventivo;
  if (!prev) { alert("Nessun preventivo salvato"); return; }
  const subtotale = (prev.prodotti||[]).reduce((s: number, p: any) => s + (p.totale||0), 0);
  const scontoVal = subtotale * (prev.sconto||0) / 100;
  const imponibile = subtotale - scontoVal;
  const ivaVal = imponibile * (prev.iva||22) / 100;
  const totale = imponibile + ivaVal;

  const prodottiHTML = showDetails ? (prev.prodotti||[]).map((p: any, i: number) => `
    <tr>
      <td style="font-weight:600">${i+1}</td>
      <td><strong>${p.descrizione||"—"}</strong>${p.ambiente?`<br/><span style="font-size:11px;color:#64748b">${p.ambiente}</span>`:""}</td>
      <td style="text-align:center">${p.tipoPrezzoLabel||p.tipoPrezzo||"—"}</td>
      <td style="text-align:center">${p.quantita||1}</td>
      <td style="text-align:right">€ ${(p.prezzoUnitario||0).toFixed(2)}</td>
      <td style="text-align:right;font-weight:700">€ ${(p.totale||0).toFixed(2)}</td>
    </tr>
  `).join("") : "";

  const content = `
    <div class="header">
      <div><div class="logo"><span>◈</span> FrameFlow</div><div class="doc-title">💰 PREVENTIVO</div></div>
      <div style="text-align:right"><div style="font-size:18px;font-weight:800;color:#6366f1">${pratica?.numero||""}</div><div style="font-size:12px;color:#64748b">${new Date().toLocaleDateString("it-IT")}</div></div>
    </div>
    <div class="info-grid">
      <div class="info-row"><span class="info-label">Cliente</span><span class="info-val">${client?.nome||"—"}</span></div>
      <div class="info-row"><span class="info-label">Telefono</span><span class="info-val">${client?.telefono||"—"}</span></div>
      <div class="info-row"><span class="info-label">Indirizzo</span><span class="info-val">${pratica?.indirizzo||"—"}</span></div>
      <div class="info-row"><span class="info-label">Email</span><span class="info-val">${client?.email||"—"}</span></div>
    </div>
    ${showDetails ? `
    <table>
      <thead><tr><th>#</th><th>Descrizione</th><th>Tipo</th><th>Q.tà</th><th style="text-align:right">Prezzo Un.</th><th style="text-align:right">Totale</th></tr></thead>
      <tbody>${prodottiHTML}</tbody>
    </table>` : ""}
    <div style="margin-top:16px;border:2px solid #1e293b;border-radius:8px;padding:14px;page-break-inside:avoid">
      <div style="display:flex;justify-content:space-between;margin-bottom:6px"><span>Subtotale:</span><span style="font-weight:600">€ ${subtotale.toFixed(2)}</span></div>
      ${prev.sconto>0?`<div style="display:flex;justify-content:space-between;margin-bottom:6px;color:#dc2626"><span>Sconto ${prev.sconto}%:</span><span>- € ${scontoVal.toFixed(2)}</span></div>`:""}
      <div style="display:flex;justify-content:space-between;margin-bottom:6px"><span>Imponibile:</span><span style="font-weight:600">€ ${imponibile.toFixed(2)}</span></div>
      <div style="display:flex;justify-content:space-between;margin-bottom:6px"><span>IVA ${prev.iva||22}%:</span><span>€ ${ivaVal.toFixed(2)}</span></div>
      <div style="display:flex;justify-content:space-between;font-size:18px;font-weight:800;border-top:2px solid #1e293b;padding-top:8px;margin-top:8px"><span>TOTALE:</span><span style="color:#059669">€ ${totale.toFixed(2)}</span></div>
    </div>
    ${prev.condizioni?`<div style="margin-top:16px;padding:12px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;font-size:12px"><strong>Condizioni:</strong><br/>${prev.condizioni.replace(/\n/g,"<br/>")}</div>`:""}
    ${prev.validita?`<div style="margin-top:8px;font-size:12px;color:#64748b"><strong>Validità preventivo:</strong> ${prev.validita} giorni dalla data di emissione</div>`:""}
    <div class="sign-area"><div class="sign-box">Timbro e Firma Azienda</div><div class="sign-box">Firma Cliente per Accettazione</div></div>
    <div class="footer"><span>FrameFlow — Generato il ${new Date().toLocaleString("it-IT")}</span><span>${pratica?.numero||""}</span></div>
  `;
  printHTML(`Preventivo ${pratica?.numero} - ${client?.nome}`, content);
}

function exportConfermaOrdine(pratica: any, client: any) {
  const prev = pratica?.preventivo;
  const conf = pratica?.confermaOrdine;
  if (!prev || !conf) { alert("Nessuna conferma d'ordine"); return; }
  const subtotale = (prev.prodotti||[]).reduce((s: number, p: any) => s + (p.totale||0), 0);
  const scontoVal = subtotale * (prev.sconto||0) / 100;
  const imponibile = subtotale - scontoVal;
  const ivaVal = imponibile * (prev.iva||22) / 100;
  const totale = imponibile + ivaVal;

  const prodottiHTML = (prev.prodotti||[]).map((p: any, i: number) => `
    <tr><td>${i+1}</td><td><strong>${p.descrizione||"—"}</strong></td><td style="text-align:center">${p.quantita||1}</td><td style="text-align:right;font-weight:700">€ ${(p.totale||0).toFixed(2)}</td></tr>
  `).join("");

  const content = `
    <div class="header">
      <div><div class="logo"><span>◈</span> FrameFlow</div><div class="doc-title">✅ CONFERMA D'ORDINE</div></div>
      <div style="text-align:right"><div style="font-size:18px;font-weight:800;color:#059669">${pratica?.numero||""}</div><div style="font-size:12px;color:#64748b">Data conferma: ${new Date(conf.dataConferma).toLocaleDateString("it-IT")}</div></div>
    </div>
    <div style="background:#ecfdf5;border:2px solid #059669;border-radius:8px;padding:12px;margin-bottom:16px;text-align:center;font-weight:800;color:#059669;font-size:16px">✅ ORDINE CONFERMATO</div>
    <div class="info-grid">
      <div class="info-row"><span class="info-label">Cliente</span><span class="info-val">${client?.nome||"—"}</span></div>
      ${client?.piva?`<div class="info-row"><span class="info-label">P.IVA</span><span class="info-val">${client.piva}</span></div>`:""}
      ${client?.codiceFiscale?`<div class="info-row"><span class="info-label">C.F.</span><span class="info-val">${client.codiceFiscale}</span></div>`:""}
      <div class="info-row"><span class="info-label">Indirizzo</span><span class="info-val">${pratica?.indirizzo||client?.indirizzo||"—"}</span></div>
      <div class="info-row"><span class="info-label">Telefono</span><span class="info-val">${client?.telefono||"—"}</span></div>
    </div>
    <table><thead><tr><th>#</th><th>Descrizione</th><th>Q.tà</th><th style="text-align:right">Totale</th></tr></thead><tbody>${prodottiHTML}</tbody></table>
    <div style="margin-top:16px;border:2px solid #1e293b;border-radius:8px;padding:14px">
      <div style="display:flex;justify-content:space-between;font-size:18px;font-weight:800"><span>TOTALE ORDINE:</span><span style="color:#059669">€ ${totale.toFixed(2)}</span></div>
    </div>
    ${prev.condizioni?`<div style="margin-top:16px;padding:12px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;font-size:12px"><strong>Condizioni:</strong><br/>${prev.condizioni.replace(/\n/g,"<br/>")}</div>`:""}
    ${conf.note?`<div style="margin-top:8px;padding:12px;background:#f8fafc;border-radius:8px;font-size:12px"><strong>Note ordine:</strong> ${conf.note}</div>`:""}
    <div class="sign-area">
      <div class="sign-box">Timbro e Firma Azienda</div>
      <div class="sign-box">${conf.firmaImg?`<img src="${conf.firmaImg}" style="max-height:80px;max-width:100%" /><br/><span style="font-size:10px">Firmato digitalmente il ${new Date(conf.dataConferma).toLocaleString("it-IT")}</span>`:"Firma Cliente per Accettazione"}</div>
    </div>
    <div class="footer"><span>FrameFlow — Conferma d'Ordine del ${new Date(conf.dataConferma).toLocaleString("it-IT")}</span><span>${pratica?.numero||""}</span></div>
  `;
  printHTML(`Conferma Ordine ${pratica?.numero} - ${client?.nome}`, content);
}

function exportFattura(pratica: any, client: any) {
  const fatt = pratica?.fattura;
  const prev = pratica?.preventivo;
  if (!fatt || !prev) { alert("Nessuna fattura"); return; }
  const subtotale = (prev.prodotti||[]).reduce((s: number, p: any) => s + (p.totale||0), 0);
  const scontoVal = subtotale * (prev.sconto||0) / 100;
  const imponibile = subtotale - scontoVal;
  const ivaVal = imponibile * (prev.iva||22) / 100;
  const totale = imponibile + ivaVal;

  const prodottiHTML = (prev.prodotti||[]).map((p: any, i: number) => `
    <tr><td>${i+1}</td><td><strong>${p.descrizione||"—"}</strong>${p.ambiente?`<br/><span style="font-size:11px;color:#64748b">${p.ambiente}</span>`:""}</td><td style="text-align:center">${p.quantita||1}</td><td style="text-align:right">€ ${(p.prezzoUnitario||0).toFixed(2)}</td><td style="text-align:right;font-weight:700">€ ${(p.totale||0).toFixed(2)}</td></tr>
  `).join("");

  const pagatoLabel = fatt.statoPagamento === "pagato" ? "✅ PAGATA" : fatt.statoPagamento === "acconto" ? `⏳ ACCONTO € ${(fatt.acconto||0).toFixed(2)}` : "❌ DA PAGARE";
  const pagatoColor = fatt.statoPagamento === "pagato" ? "#059669" : fatt.statoPagamento === "acconto" ? "#d97706" : "#ef4444";
  const pagatoBg = fatt.statoPagamento === "pagato" ? "#ecfdf5" : fatt.statoPagamento === "acconto" ? "#fffbeb" : "#fef2f2";

  const content = `
    <div class="header">
      <div><div class="logo"><span>◈</span> FrameFlow</div><div class="doc-title">🧾 FATTURA DI CORTESIA</div></div>
      <div style="text-align:right"><div style="font-size:20px;font-weight:900;color:#1e293b">${fatt.numero}</div><div style="font-size:12px;color:#64748b">Data: ${new Date(fatt.data).toLocaleDateString("it-IT")}</div></div>
    </div>
    <div style="background:${pagatoBg};border:2px solid ${pagatoColor};border-radius:8px;padding:12px;margin-bottom:16px;text-align:center;font-weight:800;color:${pagatoColor};font-size:16px">${pagatoLabel}</div>
    <div class="info-grid">
      <div class="info-row"><span class="info-label">Cliente</span><span class="info-val">${client?.nome||"—"}</span></div>
      ${client?.piva?`<div class="info-row"><span class="info-label">P.IVA</span><span class="info-val">${client.piva}</span></div>`:""}
      ${client?.codiceFiscale?`<div class="info-row"><span class="info-label">C.F.</span><span class="info-val">${client.codiceFiscale}</span></div>`:""}
      <div class="info-row"><span class="info-label">Indirizzo</span><span class="info-val">${pratica?.indirizzo||client?.indirizzo||"—"}</span></div>
      <div class="info-row"><span class="info-label">Rif. Pratica</span><span class="info-val">${pratica?.numero||"—"}</span></div>
    </div>
    <table><thead><tr><th>#</th><th>Descrizione</th><th>Q.tà</th><th style="text-align:right">Prezzo Un.</th><th style="text-align:right">Totale</th></tr></thead><tbody>${prodottiHTML}</tbody></table>
    <div style="margin-top:16px;border:2px solid #1e293b;border-radius:8px;padding:14px">
      <div style="display:flex;justify-content:space-between;margin-bottom:6px"><span>Subtotale:</span><span style="font-weight:600">€ ${subtotale.toFixed(2)}</span></div>
      ${prev.sconto>0?`<div style="display:flex;justify-content:space-between;margin-bottom:6px;color:#dc2626"><span>Sconto ${prev.sconto}%:</span><span>- € ${scontoVal.toFixed(2)}</span></div>`:""}
      <div style="display:flex;justify-content:space-between;margin-bottom:6px"><span>Imponibile:</span><span>€ ${imponibile.toFixed(2)}</span></div>
      <div style="display:flex;justify-content:space-between;margin-bottom:6px"><span>IVA ${prev.iva||22}%:</span><span>€ ${ivaVal.toFixed(2)}</span></div>
      <div style="display:flex;justify-content:space-between;font-size:18px;font-weight:800;border-top:2px solid #1e293b;padding-top:8px;margin-top:8px"><span>TOTALE:</span><span style="color:#059669">€ ${totale.toFixed(2)}</span></div>
      ${fatt.statoPagamento==="acconto"?`<div style="display:flex;justify-content:space-between;margin-top:8px;padding-top:8px;border-top:1px dashed #94a3b8"><span>Acconto versato:</span><span style="color:#d97706;font-weight:700">€ ${(fatt.acconto||0).toFixed(2)}</span></div><div style="display:flex;justify-content:space-between;font-weight:700"><span>Rimanente:</span><span style="color:#ef4444">€ ${(totale-(fatt.acconto||0)).toFixed(2)}</span></div>`:""}
    </div>
    ${fatt.metodoPagamento?`<div style="margin-top:12px;font-size:12px"><strong>Metodo di pagamento:</strong> ${fatt.metodoPagamento}</div>`:""}
    ${fatt.note?`<div style="margin-top:8px;font-size:12px;padding:12px;background:#f8fafc;border-radius:8px"><strong>Note:</strong> ${fatt.note}</div>`:""}
    <p style="margin-top:16px;font-size:11px;color:#94a3b8;text-align:center">Questo documento è una fattura di cortesia. La fattura elettronica verrà inviata tramite SDI.</p>
    <div class="footer"><span>FrameFlow — Fattura del ${new Date(fatt.data).toLocaleString("it-IT")}</span><span>${fatt.numero}</span></div>
  `;
  printHTML(`Fattura ${fatt.numero} - ${client?.nome}`, content);
}

function daysFromNow(d: string) {
  const now = new Date(today()+"T00:00:00");
  const target = new Date(d+"T00:00:00");
  return Math.round((target.getTime()-now.getTime())/(1000*60*60*24));
}

function loadData() {
  if (typeof window === "undefined") return { clients: [], pratiche: [], notes: [], nextSeq: 1, settings: { nomeAzienda: "", emailAzienda: "", telefonoAzienda: "" } };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (!data.notes) data.notes = [];
      if (!data.settings) data.settings = { nomeAzienda: "", emailAzienda: "", telefonoAzienda: "" };
      return data;
    }
  } catch(e) {}
  return { clients: [], pratiche: [], notes: [], nextSeq: 1, settings: { nomeAzienda: "", emailAzienda: "", telefonoAzienda: "" } };
}

function saveData(data: any) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch(e) {}
}

// ==================== SUPABASE MAPPERS ====================
function dbToClient(row: any): any {
  return { id: row.id, nome: row.nome, telefono: row.telefono, email: row.email, indirizzo: row.indirizzo, piva: row.piva, codiceFiscale: row.codice_fiscale, note: row.note, createdAt: row.created_at };
}
function clientToDb(c: any, userId: string): any {
  return { id: c.id, user_id: userId, nome: c.nome||"", telefono: c.telefono||"", email: c.email||"", indirizzo: c.indirizzo||"", piva: c.piva||"", codice_fiscale: c.codiceFiscale||"", note: c.note||"" };
}
function dbToPratica(row: any): any {
  return { id: row.id, clientId: row.client_id, numero: row.numero, data: row.data, ora: row.ora, indirizzo: row.indirizzo, tipo: row.tipo, fase: row.fase||"sopralluogo", status: row.status, note: row.note, actions: row.actions||[], misure: row.misure, riparazione: row.riparazione, preventivo: row.preventivo, confermaOrdine: row.conferma_ordine, fattura: row.fattura, emails: row.emails||[], createdAt: row.created_at };
}
function praticaToDb(p: any, userId: string): any {
  return { id: p.id, user_id: userId, client_id: p.clientId, numero: p.numero, data: p.data||"", ora: p.ora||"", indirizzo: p.indirizzo||"", tipo: p.tipo||"nuovo_infisso", fase: p.fase||"sopralluogo", status: p.status||"da_fare", note: p.note||"", actions: p.actions||[], misure: p.misure||null, riparazione: p.riparazione||null, preventivo: p.preventivo||null, conferma_ordine: p.confermaOrdine||null, fattura: p.fattura||null, emails: p.emails||[] };
}
function dbToNote(row: any): any {
  return { id: row.id, testo: row.testo, colore: row.colore, praticaId: row.pratica_id, updatedAt: row.updated_at, createdAt: row.created_at };
}
function noteToDb(n: any, userId: string): any {
  return { id: n.id, user_id: userId, testo: n.testo||"", colore: n.colore||"#fffbeb", pratica_id: n.praticaId||"", updated_at: new Date().toISOString() };
}

// ==================== DEFAULT SETTINGS ====================
const DEFAULT_SISTEMI = [
  { id: "alluminio", nome: "Alluminio", icon: "🔷" },
  { id: "pvc", nome: "PVC", icon: "⬜" },
  { id: "legno", nome: "Legno", icon: "🟫" },
  { id: "ferro", nome: "Ferro", icon: "⬛" },
  { id: "taglio_termico", nome: "Taglio Termico", icon: "🔶" },
];
const DEFAULT_CATEGORIE = [
  { id: "finestre", nome: "Finestre", icon: "🪟" },
  { id: "porte", nome: "Porte", icon: "🚪" },
  { id: "portoncini", nome: "Portoncini", icon: "🏠" },
  { id: "scorrevoli", nome: "Scorrevoli", icon: "↔️" },
  { id: "tapparelle", nome: "Tapparelle", icon: "🔽" },
  { id: "zanzariere", nome: "Zanzariere", icon: "🦟" },
  { id: "cassonetti", nome: "Cassonetti", icon: "📦" },
  { id: "persiane", nome: "Persiane", icon: "🏛️" },
  { id: "inferriate", nome: "Inferriate", icon: "🔒" },
  { id: "accessori", nome: "Accessori", icon: "🔧" },
];
const DEFAULT_COLORI: Record<string, string[]> = {
  alluminio: ["Bianco RAL 9010","Avorio RAL 1013","Grigio RAL 7016","Marrone RAL 8017","Nero RAL 9005","Testa di Moro RAL 8019","Corten","Bronzo"],
  pvc: ["Bianco","Avorio","Quercia","Noce","Ciliegio","Grigio","Antracite","Douglas"],
  legno: ["Naturale","Noce","Castagno","Rovere","Mogano","Laccato Bianco","Laccato RAL"],
  ferro: ["Grezzo","Verniciato Nero","Verniciato Grafite","Corten","Micaceo"],
  taglio_termico: ["Bianco RAL 9010","Grigio RAL 7016","Nero RAL 9005","Bronzo","Corten","Bicolore"],
};
const DEFAULT_TIPOLOGIE = ["Finestra 1 anta","Finestra 2 ante","Balcone 1 anta","Balcone 2 ante","Scorrevole","Vasistas","Fisso","Portoncino","Porta interna","Porta blindata","Tapparella","Zanzariera","Cassonetto","Persiana","Inferriata"];

function emptyUserSettings() {
  return { sistemi: [], categorie: [], colori: {}, listino: [], tipologie: [], azienda: { nome:"", email:"", telefono:"", indirizzo:"", piva:"", cf:"" }, setupCompleted: false };
}

async function loadFromSupabase(userId: string) {
  const [cRes, pRes, nRes, sRes] = await Promise.all([
    supabase.from("clients").select("*").eq("user_id", userId),
    supabase.from("pratiche").select("*").eq("user_id", userId),
    supabase.from("notes").select("*").eq("user_id", userId),
    supabase.from("user_settings").select("*").eq("user_id", userId).single(),
  ]);
  const clients = (cRes.data||[]).map(dbToClient);
  const pratiche = (pRes.data||[]).map(dbToPratica);
  const notes = (nRes.data||[]).map(dbToNote);
  const maxSeq = pratiche.reduce((max: number, p: any) => {
    const m = p.numero?.match(/P-\d{4}-(\d{4})/);
    return m ? Math.max(max, parseInt(m[1])+1) : max;
  }, 1);
  const userSettings = sRes.data ? {
    sistemi: sRes.data.sistemi || [],
    categorie: sRes.data.categorie || [],
    colori: sRes.data.colori || {},
    listino: sRes.data.listino || [],
    tipologie: sRes.data.sistemi?.length > 0 ? (sRes.data.colori?._tipologie || DEFAULT_TIPOLOGIE) : DEFAULT_TIPOLOGIE,
    azienda: sRes.data.azienda || {},
    setupCompleted: sRes.data.setup_completed || false,
  } : emptyUserSettings();
  return { clients, pratiche, notes, nextSeq: maxSeq, settings: { nomeAzienda: "", emailAzienda: "", telefonoAzienda: "" }, userSettings };
}

// ==================== NOTIFICATION HELPER ====================
function requestNotificationPermission() {
  if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }
}
function sendNotification(title: string, body: string) {
  if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
    new Notification(title, { body, icon: "📋" });
  }
}

// ==================== MAIN APP ====================
export default function FrameFlowApp() {
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authView, setAuthView] = useState<"login"|"register">("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPass, setAuthPass] = useState("");
  const [authError, setAuthError] = useState("");
  const [authMsg, setAuthMsg] = useState("");

  const [db, setDb] = useState<any>({ clients: [], pratiche: [], notes: [], nextSeq: 1, settings: {} });
  const [userSettings, setUserSettings] = useState<any>(emptyUserSettings());
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("dashboard");
  const [selPratica, setSelPratica] = useState<string|null>(null);
  const [selClient, setSelClient] = useState<string|null>(null);
  const [filter, setFilter] = useState("tutti");
  const [search, setSearch] = useState("");
  const [calMonth, setCalMonth] = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1); });
  const [globalSearch, setGlobalSearch] = useState("");
  const [calSelDay, setCalSelDay] = useState<string|null>(null);
  const [clientSearch, setClientSearch] = useState("");
  const [clientForm, setClientForm] = useState<any>(null);
  const [actionPicker, setActionPicker] = useState<string|null>(null);
  const [misureEdit, setMisureEdit] = useState<string|null>(null);
  const [ripEdit, setRipEdit] = useState<string|null>(null);
  const [prevEdit, setPrevEdit] = useState<string|null>(null);
  const [emailDraft, setEmailDraft] = useState<string|null>(null);
  const [noteEdit, setNoteEdit] = useState<any>(null);

  // ===== AUTH =====
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // ===== LOAD DATA FROM SUPABASE =====
  useEffect(() => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    loadFromSupabase(user.id).then(data => {
      setDb(data);
      if (data.userSettings) setUserSettings(data.userSettings);
      if (data.userSettings && !data.userSettings.setupCompleted) setView("setup_wizard");
      setLoading(false);
    }).catch(() => {
      setDb(loadData());
      setLoading(false);
    });
    requestNotificationPermission();
  }, [user]);

  // Check for upcoming appointments every minute
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      db.pratiche.forEach((p: any) => {
        if (p.status === "completato") return;
        const appDate = new Date(`${p.data}T${p.ora}`);
        const diff = appDate.getTime() - now.getTime();
        const mins = Math.round(diff / 60000);
        if (mins === 30) {
          const c = db.clients.find((cl: any)=>cl.id===p.clientId);
          sendNotification(`⏰ Appuntamento tra 30 min`, `${p.numero} - ${c?.nome||""} alle ${p.ora}`);
        }
        if (mins === 0) {
          const c = db.clients.find((cl: any)=>cl.id===p.clientId);
          sendNotification(`🔔 Appuntamento ORA`, `${p.numero} - ${c?.nome||""}`);
        }
      });
    }, 60000);
    return () => clearInterval(interval);
  }, [db]);

  // ===== AUTH FUNCTIONS =====
  async function handleLogin() {
    setAuthError("");
    const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPass });
    if (error) setAuthError(error.message);
  }
  async function handleRegister() {
    setAuthError(""); setAuthMsg("");
    const { error } = await supabase.auth.signUp({ email: authEmail, password: authPass });
    if (error) setAuthError(error.message);
    else setAuthMsg("Registrazione ok! Controlla la tua email per confermare, poi fai login.");
  }
  async function handleLogout() {
    await supabase.auth.signOut();
    setUser(null);
    setDb({ clients: [], pratiche: [], notes: [], nextSeq: 1, settings: {} });
    setView("dashboard");
  }

  // ===== DATA FUNCTIONS (Supabase + local state) =====
  function getClient(id: string) { return db.clients.find((c: any)=>c.id===id); }
  function getPratica(id: string) { return db.pratiche.find((p: any)=>p.id===id); }

  function saveClient(c: any) {
    const isNew = !c.id || !db.clients.find((x: any)=>x.id===c.id);
    if (isNew) {
      c.id = gid(); c.createdAt = new Date().toISOString();
    }
    const clients = isNew ? [...db.clients, c] : db.clients.map((x: any)=>x.id===c.id?c:x);
    setDb((prev: any) => ({...prev, clients}));
    // Sync to Supabase
    if (user) {
      const row = clientToDb(c, user.id);
      supabase.from("clients").upsert(row).then(({error}) => { if(error) console.error("saveClient:", error); });
    }
    return c;
  }

  function createPratica(clientId: string, indirizzo: string, tipo: string, data: string, ora: string, note: string) {
    const year = new Date().getFullYear();
    const numero = genPraticaNum(year, db.nextSeq);
    const sopralluogoAction = {
      id: gid(), type: "sopralluogo", createdAt: new Date().toISOString(),
      status: "da_fare",
      tasks: (TASKS["sopralluogo"]||[]).map((t: string)=>({id:gid(),text:t,done:false})),
    };
    const p: any = {
      id: gid(), numero, clientId, indirizzo: indirizzo||"",
      tipo, data: data||today(), ora: ora||"09:00", note: note||"",
      fase: "sopralluogo",
      status: "da_fare", actions: [sopralluogoAction], misure: null, riparazione: null, preventivo: null,
      confermaOrdine: null, fattura: null,
      emails: [], createdAt: new Date().toISOString(),
    };
    setDb((prev: any) => ({...prev, pratiche: [...prev.pratiche, p], nextSeq: prev.nextSeq+1}));
    if (user) {
      const row = praticaToDb(p, user.id);
      supabase.from("pratiche").insert(row).then(({error}) => { if(error) console.error("createPratica:", error); });
    }
    return p;
  }

  function updatePratica(id: string, updates: any) {
    let updatedP: any = null;
    const pratiche = db.pratiche.map((p: any) => {
      if (p.id !== id) return p;
      updatedP = {...p, ...updates};
      return updatedP;
    });
    setDb((prev: any) => ({...prev, pratiche}));
    if (user && updatedP) {
      const row = praticaToDb(updatedP, user.id);
      supabase.from("pratiche").update(row).eq("id", id).then(({error}) => { if(error) console.error("updatePratica:", error); });
    }
  }

  function deletePratica(id: string) {
    setDb((prev: any) => ({...prev, pratiche: prev.pratiche.filter((p: any)=>p.id!==id)}));
    if (user) { supabase.from("pratiche").delete().eq("id", id).then(({error}) => { if(error) console.error("deletePratica:", error); }); }
    if (selPratica===id) { setSelPratica(null); setView("dashboard"); }
  }

  function addAction(praticaId: string, actionKey: string) {
    const p = getPratica(praticaId);
    if (!p) return;
    const newAct = {
      id: gid(), type: actionKey, createdAt: new Date().toISOString(),
      status: "da_fare",
      tasks: (TASKS[actionKey]||[]).map((t: string)=>({id:gid(),text:t,done:false})),
    };
    updatePratica(praticaId, { actions: [...p.actions, newAct] });
    setActionPicker(null);
    if (actionKey==="misure") { setMisureEdit(praticaId); setView("misure"); }
    else if (actionKey==="riparazione") { setRipEdit(praticaId); setView("riparazione"); }
    else if (actionKey==="preventivo") { setPrevEdit(praticaId); setView("preventivo"); }
    else { setSelPratica(praticaId); setView("pratica"); }
  }

  function advancePhase(praticaId: string) {
    const p = getPratica(praticaId);
    if (!p || !canAdvance(p)) return;
    const wf = getWorkflow(p.tipo);
    const curIdx = getPhaseIndex(p.tipo, p.fase || "sopralluogo");
    if (curIdx >= wf.length - 1) return; // already at last phase
    const nextPhase = wf[curIdx + 1];
    // Auto-create action for next phase if it has tasks
    const hasAction = p.actions.find((a: any) => a.type === nextPhase.key);
    let newActions = [...p.actions];
    if (!hasAction && TASKS[nextPhase.key]) {
      newActions.push({
        id: gid(), type: nextPhase.key, createdAt: new Date().toISOString(),
        status: "da_fare",
        tasks: (TASKS[nextPhase.key]||[]).map((t: string)=>({id:gid(),text:t,done:false})),
      });
    }
    updatePratica(praticaId, { fase: nextPhase.key, actions: newActions, status: "in_corso" });
    // Auto-open the relevant form
    if (nextPhase.key === "misure") { setMisureEdit(praticaId); setView("misure"); }
    else if (nextPhase.key === "riparazione") { setRipEdit(praticaId); setView("riparazione"); }
    else if (nextPhase.key === "preventivo") { setPrevEdit(praticaId); setView("preventivo"); }
    else { setSelPratica(praticaId); setView("pratica"); }
  }

  function toggleActionTask(praticaId: string, actionId: string, taskId: string) {
    const p = getPratica(praticaId);
    if (!p) return;
    const actions = p.actions.map((a: any) => {
      if (a.id !== actionId) return a;
      const tasks = a.tasks.map((t: any)=>t.id===taskId?{...t,done:!t.done}:t);
      const allDone = tasks.length>0 && tasks.every((t: any)=>t.done);
      const anyDone = tasks.some((t: any)=>t.done);
      let st = a.status;
      if (allDone) st="completato"; else if (anyDone && st==="da_fare") st="in_corso";
      return {...a, tasks, status: st};
    });
    const allComplete = actions.every((a: any)=>a.status==="completato");
    const anyStarted = actions.some((a: any)=>a.status!=="da_fare");
    let mainSt = p.status;
    if (allComplete && actions.length>0) mainSt="completato";
    else if (anyStarted && mainSt==="da_fare") mainSt="in_corso";
    updatePratica(praticaId, { actions, status: mainSt });
  }

  function saveMisure(praticaId: string, misureData: any) {
    updatePratica(praticaId, { misure: misureData });
    setMisureEdit(null); setSelPratica(praticaId); setView("pratica");
  }

  function saveRiparazione(praticaId: string, ripData: any) {
    updatePratica(praticaId, { riparazione: ripData });
    setRipEdit(null); setSelPratica(praticaId); setView("pratica");
  }

  function savePreventivo(praticaId: string, prevData: any) {
    updatePratica(praticaId, { preventivo: prevData });
    setPrevEdit(null); setSelPratica(praticaId); setView("pratica");
  }

  function confirmOrder(praticaId: string, firmaImg: string, note: string) {
    updatePratica(praticaId, { confermaOrdine: { firmata: true, firmaImg, dataConferma: new Date().toISOString(), note } });
  }

  function generateFattura(praticaId: string) {
    // Auto-number: FAT-YYYY-NNNN
    const year = new Date().getFullYear();
    const existing = db.pratiche.filter((p: any) => p.fattura?.numero?.startsWith(`FAT-${year}`));
    const nextNum = existing.length + 1;
    const numero = `FAT-${year}-${String(nextNum).padStart(4,"0")}`;
    updatePratica(praticaId, { fattura: { numero, data: new Date().toISOString(), statoPagamento: "non_pagato", acconto: 0, metodoPagamento: "", note: "" } });
  }

  function updateFattura(praticaId: string, fattData: any) {
    const p = getPratica(praticaId);
    if (!p?.fattura) return;
    updatePratica(praticaId, { fattura: { ...p.fattura, ...fattData } });
  }

  function addEmail(praticaId: string, emailData: any) {
    const p = getPratica(praticaId);
    if (!p) return;
    updatePratica(praticaId, { emails: [...(p.emails||[]), {...emailData, id:gid(), sentAt:new Date().toISOString()}] });
  }

  function saveNote(note: any) {
    let notes = db.notes || [];
    const isNew = !note.id || !notes.find((n: any)=>n.id===note.id);
    if (isNew) {
      note.id = gid(); note.createdAt = new Date().toISOString();
      notes = [note, ...notes];
    } else {
      notes = notes.map((n: any)=>n.id===note.id?note:n);
    }
    note.updatedAt = new Date().toISOString();
    setDb((prev: any) => ({...prev, notes}));
    if (user) {
      const row = noteToDb(note, user.id);
      supabase.from("notes").upsert(row).then(({error}) => { if(error) console.error("saveNote:", error); });
    }
  }

  function deleteNote(id: string) {
    setDb((prev: any) => ({...prev, notes: (prev.notes||[]).filter((n: any)=>n.id!==id)}));
    if (user) { supabase.from("notes").delete().eq("id", id).then(({error}) => { if(error) console.error("deleteNote:", error); }); }
  }

  async function saveUserSettingsToDb(newSettings: any) {
    setUserSettings(newSettings);
    if (!user) return;
    const row = {
      user_id: user.id,
      sistemi: newSettings.sistemi || [],
      categorie: newSettings.categorie || [],
      colori: { ...newSettings.colori, _tipologie: newSettings.tipologie || [] },
      listino: newSettings.listino || [],
      azienda: newSettings.azienda || {},
      setup_completed: newSettings.setupCompleted || false,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("user_settings").upsert(row, { onConflict: "user_id" });
    if (error) console.error("saveUserSettings:", error);
  }

  // Dynamic lists from settings
  const userSistemi = useMemo(() => userSettings.sistemi?.length > 0 ? userSettings.sistemi : DEFAULT_SISTEMI, [userSettings.sistemi]);
  const userCategorie = useMemo(() => userSettings.categorie?.length > 0 ? userSettings.categorie : DEFAULT_CATEGORIE, [userSettings.categorie]);
  const userTipologie = useMemo(() => userSettings.tipologie?.length > 0 ? userSettings.tipologie : DEFAULT_TIPOLOGIE, [userSettings.tipologie]);
  const userColori = useMemo(() => {
    const c: Record<string,string[]> = {};
    userSistemi.forEach((s: any) => { c[s.id] = userSettings.colori?.[s.id] || DEFAULT_COLORI[s.id] || []; });
    return c;
  }, [userSettings.colori, userSistemi]);
  const allColori = useMemo(() => {
    const set = new Set<string>();
    Object.values(userColori).forEach((arr: string[]) => arr.forEach(c => set.add(c)));
    return Array.from(set);
  }, [userColori]);

  // ── Computed ──
  const todayPratiche = useMemo(() => db.pratiche.filter((p: any)=>p.data===today()&&p.status!=="completato"), [db.pratiche]);
  const tomorrowPratiche = useMemo(() => {
    const tom = new Date(); tom.setDate(tom.getDate()+1);
    return db.pratiche.filter((p: any)=>p.data===tom.toISOString().split("T")[0]&&p.status!=="completato");
  }, [db.pratiche]);
  const upcomingPratiche = useMemo(() => {
    return db.pratiche.filter((p: any)=>p.status!=="completato"&&daysFromNow(p.data)>=0).sort((a: any,b: any)=>a.data.localeCompare(b.data)||a.ora.localeCompare(b.ora)).slice(0,8);
  }, [db.pratiche]);
  const overduePratiche = useMemo(() => db.pratiche.filter((p: any)=>p.status!=="completato"&&daysFromNow(p.data)<0), [db.pratiche]);
  const recentEmails = useMemo(() => {
    const allEmails: any[] = [];
    db.pratiche.forEach((p: any) => {
      (p.emails||[]).forEach((e: any) => {
        allEmails.push({...e, praticaNum: p.numero, clientId: p.clientId});
      });
    });
    return allEmails.sort((a,b)=>(b.sentAt||"").localeCompare(a.sentAt||"")).slice(0,5);
  }, [db.pratiche]);

  const counts = useMemo(() => ({
    tutti: db.pratiche.length,
    da_fare: db.pratiche.filter((p: any)=>p.status==="da_fare").length,
    in_corso: db.pratiche.filter((p: any)=>p.status==="in_corso").length,
    completato: db.pratiche.filter((p: any)=>p.status==="completato").length,
  }), [db.pratiche]);

  const pendingTasks = useMemo(() => {
    const tasks: any[] = [];
    db.pratiche.forEach((p: any) => {
      if (p.status==="completato") return;
      p.actions.forEach((a: any) => {
        a.tasks.forEach((t: any) => {
          if (!t.done) {
            const cfg = ACTIONS_CFG.find(ac=>ac.key===a.type);
            tasks.push({ ...t, praticaId: p.id, praticaNum: p.numero, actionId: a.id, actionIcon: cfg?.icon||"📋", actionLabel: cfg?.label||a.type, clientId: p.clientId });
          }
        });
      });
    });
    return tasks.slice(0, 10);
  }, [db.pratiche]);

  const filteredPratiche = useMemo(() => {
    let list = db.pratiche;
    if (filter!=="tutti") list = list.filter((p: any)=>p.status===filter);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter((p: any) => {
        const c = getClient(p.clientId);
        return p.numero.toLowerCase().includes(s) || c?.nome?.toLowerCase().includes(s) || p.indirizzo?.toLowerCase().includes(s);
      });
    }
    return [...list].sort((a: any,b: any)=>b.createdAt.localeCompare(a.createdAt));
  }, [db, filter, search]);

  const filteredClients = useMemo(() => {
    if (!clientSearch) return db.clients;
    const s = clientSearch.toLowerCase();
    return db.clients.filter((c: any) => c.nome.toLowerCase().includes(s) || c.telefono?.includes(s) || c.indirizzo?.toLowerCase().includes(s) || c.email?.toLowerCase().includes(s) || c.piva?.includes(s) || c.codiceFiscale?.toLowerCase().includes(s));
  }, [db.clients, clientSearch]);

  // ===== AUTH LOADING =====
  if (authLoading) return <div style={S.loadWrap}><p style={{color:"#fff",fontSize:18,fontWeight:800,letterSpacing:"-0.3px"}}>◈ FrameFlow</p></div>;

  // ===== LOGIN / REGISTER =====
  if (!user) {
    return (
      <div style={{...S.container,background:"linear-gradient(170deg,#1e293b 0%,#334155 50%,#1e293b 100%)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"100vh",padding:24}}>
        <h1 style={{background:"linear-gradient(135deg,#fbbf24,#f59e0b)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",fontSize:36,fontWeight:900,marginBottom:4,letterSpacing:"-1px"}}>◈ FrameFlow</h1>
        <p style={{color:"#94a3b8",fontSize:14,fontWeight:600,marginBottom:32}}>Gestione Serramenti</p>
        <div style={{width:"100%",maxWidth:380,background:"#fff",borderRadius:22,padding:28,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
          <h2 style={{fontSize:22,fontWeight:900,color:"#1e293b",margin:"0 0 4px",letterSpacing:"-0.5px"}}>{authView==="login"?"Accedi":"Registrati"}</h2>
          <p style={{fontSize:13,color:"#64748b",margin:"0 0 20px"}}>{authView==="login"?"Inserisci le tue credenziali":"Crea il tuo account"}</p>
          {authError && <div style={{background:"#fef2f2",border:"1.5px solid #ef4444",borderRadius:12,padding:"10px 14px",marginBottom:14,fontSize:13,color:"#dc2626",fontWeight:600}}>❌ {authError}</div>}
          {authMsg && <div style={{background:"#ecfdf5",border:"1.5px solid #059669",borderRadius:12,padding:"10px 14px",marginBottom:14,fontSize:13,color:"#059669",fontWeight:600}}>✅ {authMsg}</div>}
          <div style={{marginBottom:14}}>
            <label style={{fontSize:12,fontWeight:800,color:"#374151",textTransform:"uppercase",letterSpacing:"0.5px",display:"block",marginBottom:4}}>Email</label>
            <input value={authEmail} onChange={(e: any)=>setAuthEmail(e.target.value)} placeholder="nome@email.it" type="email" style={{width:"100%",padding:"14px 16px",borderRadius:14,border:"2px solid #e2e8f0",fontSize:15,outline:"none",boxSizing:"border-box",transition:"border 0.2s"}} onKeyDown={(e: any)=>e.key==="Enter"&&(authView==="login"?handleLogin():handleRegister())} />
          </div>
          <div style={{marginBottom:20}}>
            <label style={{fontSize:12,fontWeight:800,color:"#374151",textTransform:"uppercase",letterSpacing:"0.5px",display:"block",marginBottom:4}}>Password</label>
            <input value={authPass} onChange={(e: any)=>setAuthPass(e.target.value)} placeholder="••••••••" type="password" style={{width:"100%",padding:"14px 16px",borderRadius:14,border:"2px solid #e2e8f0",fontSize:15,outline:"none",boxSizing:"border-box"}} onKeyDown={(e: any)=>e.key==="Enter"&&(authView==="login"?handleLogin():handleRegister())} />
          </div>
          <button onClick={authView==="login"?handleLogin:handleRegister} disabled={!authEmail||!authPass} style={{width:"100%",padding:"15px",borderRadius:14,border:"none",background:authEmail&&authPass?"linear-gradient(135deg,#ff6b35,#ff3d71)":"#e2e8f0",color:authEmail&&authPass?"#fff":"#94a3b8",fontSize:16,fontWeight:800,cursor:authEmail&&authPass?"pointer":"default",boxShadow:authEmail&&authPass?"0 6px 20px rgba(255,107,53,0.35)":"none",letterSpacing:"-0.2px"}}>{authView==="login"?"🔑 Accedi":"📝 Registrati"}</button>
          <button onClick={()=>{setAuthView(authView==="login"?"register":"login");setAuthError("");setAuthMsg("");}} style={{width:"100%",marginTop:14,padding:"12px",borderRadius:12,border:"none",background:"transparent",color:"#ff6b35",fontSize:14,fontWeight:700,cursor:"pointer"}}>{authView==="login"?"Non hai un account? Registrati":"Hai già un account? Accedi"}</button>
        </div>
      </div>
    );
  }

  if (loading) return <div style={S.loadWrap}><p style={{color:"#fff",fontSize:18,fontWeight:800,letterSpacing:"-0.3px"}}>◈ FrameFlow</p></div>;

  // ==================== SETUP WIZARD ====================
  if (view==="setup_wizard") {
    return <SetupWizard userSettings={userSettings} onComplete={(s: any)=>{saveUserSettingsToDb({...s,setupCompleted:true});setView("dashboard");}} onSkip={()=>{saveUserSettingsToDb({...userSettings,setupCompleted:true});setView("dashboard");}} />;
  }

  // ==================== SETTINGS ====================
  if (view==="impostazioni") {
    return <SettingsView userSettings={userSettings} onSave={(s: any)=>{saveUserSettingsToDb(s);setView("dashboard");}} onBack={()=>setView("dashboard")} />;
  }

  // ==================== VIEWS ====================
  if (view==="misure" && misureEdit) {
    const p = getPratica(misureEdit); const c = getClient(p?.clientId);
    return <MisureForm pratica={p} client={c} sistemi={userSistemi} tipologie={userTipologie} coloriMap={userColori} allColori={allColori} onSave={(d: any)=>saveMisure(misureEdit,d)} onBack={()=>{setMisureEdit(null);setSelPratica(misureEdit);setView("pratica");}} />;
  }
  if (view==="riparazione" && ripEdit) {
    const p = getPratica(ripEdit); const c = getClient(p?.clientId);
    return <RipForm pratica={p} client={c} onSave={(d: any)=>saveRiparazione(ripEdit,d)} onBack={()=>{setRipEdit(null);setSelPratica(ripEdit);setView("pratica");}} />;
  }
  if (view==="preventivo" && prevEdit) {
    const p = getPratica(prevEdit); const c = getClient(p?.clientId);
    return <PreventivoForm pratica={p} client={c} userListino={userSettings.listino||[]} userCategorie={userCategorie} userSistemi={userSistemi} onSave={(d: any)=>savePreventivo(prevEdit,d)} onBack={()=>{setPrevEdit(null);setSelPratica(prevEdit);setView("pratica");}} />;
  }
  if (view==="email" && emailDraft) {
    const p = getPratica(emailDraft); const c = getClient(p?.clientId);
    return <EmailView pratica={p} client={c} settings={db.settings} onSend={(d: any)=>{addEmail(emailDraft,d);setEmailDraft(null);setSelPratica(emailDraft);setView("pratica");}} onBack={()=>{setEmailDraft(null);setSelPratica(emailDraft);setView("pratica");}} />;
  }
  if (view==="note_edit") {
    return <NoteEditor note={noteEdit} onSave={(n: any)=>{saveNote(n);setNoteEdit(null);setView("notes");}} onBack={()=>{setNoteEdit(null);setView("notes");}} />;
  }

  // ACTION PICKER
  if (view==="action_picker" && actionPicker) {
    const p = getPratica(actionPicker); const c = getClient(p?.clientId);
    return (
      <div style={S.container}>
        <div style={S.pickerHdr}>
          <div style={S.pickerCheck}>✓</div>
          <h2 style={S.pickerTitle}>Pratica Creata!</h2>
          <div style={S.pickerNum}>{p?.numero}</div>
          <p style={S.pickerClient}>{c?.nome}</p>
          {p?.indirizzo && <p style={S.pickerAddr}>📍 {p.indirizzo}</p>}
        </div>
        <h3 style={S.pickerQ}>Qual è la prossima azione?</h3>
        <div style={S.actGrid}>
          {ACTIONS_CFG.map(a=>(
            <button key={a.key} onClick={()=>addAction(actionPicker,a.key)} style={S.actCard}>
              <span style={{fontSize:30}}>{a.icon}</span>
              <span style={{fontSize:14,fontWeight:700,color:"#0f172a"}}>{a.label}</span>
              <span style={{fontSize:11,color:"#64748b",textAlign:"center"}}>{a.desc}</span>
            </button>
          ))}
        </div>
        <button onClick={()=>{setActionPicker(null);setSelPratica(actionPicker);setView("pratica");}} style={S.skipBtn}>Salta per ora →</button>
      </div>
    );
  }

  // CLIENT PICKER
  if (view==="client_pick") {
    return (
      <div style={S.container}>
        <div style={S.secHdr}><button onClick={()=>setView("dashboard")} style={S.backBtn}>← Annulla</button><h2 style={S.secTitle}>Seleziona Cliente</h2></div>
        <div style={{padding:"0 16px"}}>
          <input value={clientSearch} onChange={e=>setClientSearch(e.target.value)} placeholder="🔍 Cerca cliente..." style={S.searchInp} autoFocus />
          <button onClick={()=>{setClientForm({nome:"",telefono:"",email:"",indirizzo:"",note:""});setView("new_client");}} style={S.newClientBtn}>+ Nuovo Cliente</button>
          {filteredClients.length===0 ? <div style={S.emptyMini}>{clientSearch?"Nessun risultato":"Nessun cliente ancora"}</div>
          : filteredClients.map((c: any)=>(
            <button key={c.id} onClick={()=>{setSelClient(c.id);setClientSearch("");setView("new_pratica");}} style={S.clientRow}>
              <div style={S.clientAvatar}>{c.nome.charAt(0).toUpperCase()}</div>
              <div style={{flex:1}}>
                <div style={{fontSize:15,fontWeight:600,color:"#0f172a"}}>{c.nome}</div>
                {c.telefono && <div style={{fontSize:13,color:"#64748b"}}>📞 {c.telefono}</div>}
              </div>
              <span style={{color:"#ff6b35",fontSize:13,fontWeight:700}}>{db.pratiche.filter((p: any)=>p.clientId===c.id).length} pratiche</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // NEW CLIENT
  if (view==="new_client" && clientForm) {
    const isEdit = clientForm.id;
    return (
      <div style={S.container}>
        <div style={S.secHdr}><button onClick={()=>setView(isEdit?"clienti":"client_pick")} style={S.backBtn}>← Indietro</button><h2 style={S.secTitle}>{isEdit?"Modifica Cliente":"Nuovo Cliente"}</h2></div>
        <div style={{padding:20}}>
          <Field label="Nome / Ragione Sociale *" value={clientForm.nome} onChange={(v: string)=>setClientForm({...clientForm,nome:v})} placeholder="Nome completo" autoFocus />
          <Field label="Telefono" value={clientForm.telefono} onChange={(v: string)=>setClientForm({...clientForm,telefono:v})} placeholder="Numero" type="tel" />
          <Field label="Email" value={clientForm.email} onChange={(v: string)=>setClientForm({...clientForm,email:v})} placeholder="email@esempio.it" type="email" />
          <Field label="Indirizzo" value={clientForm.indirizzo} onChange={(v: string)=>setClientForm({...clientForm,indirizzo:v})} placeholder="Via, numero, città" />
          <Field label="P.IVA" value={clientForm.piva||""} onChange={(v: string)=>setClientForm({...clientForm,piva:v})} placeholder="12345678901" />
          <Field label="Codice Fiscale" value={clientForm.codiceFiscale||""} onChange={(v: string)=>setClientForm({...clientForm,codiceFiscale:v})} placeholder="RSSMRA80A01H501U" />
          <Field label="Note" value={clientForm.note} onChange={(v: string)=>setClientForm({...clientForm,note:v})} placeholder="Note..." textarea />
          <button onClick={()=>{
            if (!clientForm.nome.trim()) return;
            const c = saveClient({...clientForm,nome:clientForm.nome.trim()});
            if (isEdit) { setClientForm(null); setView("clienti"); }
            else { setSelClient(c.id); setClientForm(null); setView("new_pratica"); }
          }} disabled={!clientForm.nome.trim()} style={{...S.saveBtn,opacity:clientForm.nome.trim()?1:0.5}}>{isEdit?"💾 Salva Modifiche":"Salva e Continua →"}</button>
        </div>
      </div>
    );
  }

  // NEW PRATICA
  if (view==="new_pratica" && selClient) {
    const c = getClient(selClient);
    return <NewPraticaView client={c} onCreate={(ind: string,tipo: string,data: string,ora: string,note: string)=>{
      const p = createPratica(selClient,ind,tipo,data,ora,note);
      setSelClient(null); setSelPratica(p.id); setView("pratica");
    }} onBack={()=>{setSelClient(null);setView("client_pick");}} />;
  }

  // PRATICA DETAIL
  if (view==="pratica" && selPratica) {
    const p = getPratica(selPratica);
    if (!p) { setView("dashboard"); return null; }
    const c = getClient(p.clientId);
    return <PraticaDetail pratica={p} client={c}
      onBack={()=>{setSelPratica(null);setView("pratiche");}}
      onDelete={()=>{if(confirm("Eliminare pratica "+p.numero+"?"))deletePratica(p.id);}}
      onAddAction={()=>{setActionPicker(p.id);setView("action_picker");}}
      onToggleTask={(aid: string,tid: string)=>toggleActionTask(p.id,aid,tid)}
      onOpenMisure={()=>{setMisureEdit(p.id);setView("misure");}}
      onOpenRip={()=>{setRipEdit(p.id);setView("riparazione");}}
      onOpenPrev={()=>{setPrevEdit(p.id);setView("preventivo");}}
      onOpenEmail={()=>{setEmailDraft(p.id);setView("email");}}
      onStatusChange={(s: string)=>updatePratica(p.id,{status:s})}
      onConfirmOrder={(firma: string,note: string)=>confirmOrder(p.id,firma,note)}
      onGenerateFattura={()=>generateFattura(p.id)}
      onUpdateFattura={(data: any)=>updateFattura(p.id,data)}
      onAdvancePhase={()=>advancePhase(p.id)}
    />;
  }

  // ==================== BOTTOM NAV ====================
  const navItems = [
    { key: "dashboard", icon: "🏠", label: "Casa" },
    { key: "calendario", icon: "📅", label: "Agenda" },
    { key: "pratiche", icon: "📋", label: "Pratiche" },
    { key: "clienti", icon: "👤", label: "Clienti" },
    { key: "notes", icon: "📝", label: "Note" },
  ];

  // ==================== GLOBAL SEARCH ====================
  if (view === "search") {
    const q = globalSearch.toLowerCase().trim();
    const matchedClients = q ? db.clients.filter((c: any) => 
      (c.nome||"").toLowerCase().includes(q) || (c.telefono||"").includes(q) || (c.email||"").toLowerCase().includes(q) || (c.indirizzo||"").toLowerCase().includes(q) || (c.codiceFiscale||"").toLowerCase().includes(q)
    ) : [];
    const matchedPratiche = q ? db.pratiche.filter((p: any) => {
      const c = getClient(p.clientId);
      return (p.numero||"").toLowerCase().includes(q) || (c?.nome||"").toLowerCase().includes(q) || (p.indirizzo||"").toLowerCase().includes(q) || (p.note||"").toLowerCase().includes(q) || 
        (p.misure?.cantiere||"").toLowerCase().includes(q) || (p.riparazione?.problema||"").toLowerCase().includes(q);
    }) : [];
    const matchedNotes = q ? db.notes.filter((n: any) => (n.testo||"").toLowerCase().includes(q)) : [];
    const totalResults = matchedClients.length + matchedPratiche.length + matchedNotes.length;

    return (
      <div style={S.container}>
        <div style={{...S.secHdr,background:"#fff"}}>
          <button onClick={()=>{setGlobalSearch("");setView("dashboard");}} style={S.backBtn}>← Indietro</button>
          <h2 style={S.secTitle}>🔍 Cerca</h2>
        </div>
        <div style={{padding:"16px"}}>
          <input value={globalSearch} onChange={(e: any) => setGlobalSearch(e.target.value)} placeholder="Cerca cliente, pratica, indirizzo, nota..." autoFocus style={{...S.searchInp,fontSize:16,padding:"16px 20px",border:"2.5px solid #ff6b35",boxShadow:"0 4px 16px rgba(255,107,53,0.12)"}} />
          
          {q && <p style={{fontSize:13,color:"#64748b",margin:"12px 0 16px",fontWeight:600}}>{totalResults} risultat{totalResults===1?"o":"i"} per "{globalSearch}"</p>}

          {/* Clients */}
          {matchedClients.length > 0 && (
            <div style={{marginBottom:20}}>
              <h3 style={{fontSize:14,fontWeight:800,color:"#ff6b35",marginBottom:10,textTransform:"uppercase",letterSpacing:"0.5px"}}>👤 Clienti ({matchedClients.length})</h3>
              {matchedClients.map((c: any) => (
                <button key={c.id} onClick={()=>{setSearch(c.nome);setView("clienti");}} style={S.clientRow}>
                  <div style={S.clientAvatar}>{(c.nome||"?")[0]}</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:15,fontWeight:800,color:"#0f172a"}}>{c.nome}</div>
                    <div style={{fontSize:12,color:"#64748b"}}>{c.telefono||""} {c.email?`· ${c.email}`:""}</div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Pratiche */}
          {matchedPratiche.length > 0 && (
            <div style={{marginBottom:20}}>
              <h3 style={{fontSize:14,fontWeight:800,color:"#7c3aed",marginBottom:10,textTransform:"uppercase",letterSpacing:"0.5px"}}>📋 Pratiche ({matchedPratiche.length})</h3>
              {matchedPratiche.map((p: any) => {
                const c = getClient(p.clientId);
                const sc = STATUS[p.status];
                return (
                  <button key={p.id} onClick={()=>{setSelPratica(p.id);setView("pratica");}} style={S.praticaCard}>
                    <div style={S.praticaTop}>
                      <span style={S.praticaNum}>{p.numero}</span>
                      <span style={{...S.praticaStatus,background:sc.bg,color:sc.color}}>{sc.icon} {sc.label}</span>
                    </div>
                    <div style={S.praticaCliente}>{c?.nome||"—"}</div>
                    <div style={S.praticaAddr}>📍 {p.indirizzo||"—"} · {fmtDate(p.data)}</div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Notes */}
          {matchedNotes.length > 0 && (
            <div style={{marginBottom:20}}>
              <h3 style={{fontSize:14,fontWeight:800,color:"#059669",marginBottom:10,textTransform:"uppercase",letterSpacing:"0.5px"}}>📝 Note ({matchedNotes.length})</h3>
              {matchedNotes.map((n: any) => (
                <button key={n.id} onClick={()=>{setNoteEdit(n);setView("note_edit");}} style={{...S.noteCard,background:n.colore||"#fffbeb"}}>
                  <div style={{fontSize:14,fontWeight:600,color:"#1e293b"}}>{(n.testo||"").substring(0,80)}{(n.testo||"").length>80?"...":""}</div>
                </button>
              ))}
            </div>
          )}

          {q && totalResults === 0 && (
            <div style={{textAlign:"center",padding:"40px 20px"}}>
              <div style={{fontSize:48,marginBottom:12}}>🔍</div>
              <p style={{fontSize:16,fontWeight:700,color:"#374151"}}>Nessun risultato</p>
              <p style={{fontSize:14,color:"#94a3b8"}}>Prova con termini diversi</p>
            </div>
          )}

          {!q && (
            <div style={{textAlign:"center",padding:"40px 20px"}}>
              <div style={{fontSize:48,marginBottom:12}}>🔍</div>
              <p style={{fontSize:16,fontWeight:700,color:"#374151"}}>Cerca in FrameFlow</p>
              <p style={{fontSize:14,color:"#94a3b8"}}>Clienti, pratiche, indirizzi, note...</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ==================== DASHBOARD ====================
  if (view === "dashboard") {
    return (
      <div style={S.container}>
        <div style={S.header}>
          <div>
            <h1 style={S.logo}>◈ FrameFlow</h1>
            <p style={S.subtitle}>Gestione Serramenti</p>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={handleLogout} style={{background:"rgba(255,255,255,0.15)",color:"#fff",border:"none",borderRadius:14,padding:"11px 14px",fontSize:16,cursor:"pointer"}} title="Esci">🚪</button>
            <button onClick={()=>setView("impostazioni")} style={{background:"rgba(255,255,255,0.15)",color:"#fff",border:"none",borderRadius:14,padding:"11px 14px",fontSize:16,cursor:"pointer"}} title="Impostazioni">⚙️</button>
            <button onClick={()=>setView("search")} style={{background:"rgba(255,255,255,0.15)",color:"#fff",border:"none",borderRadius:14,padding:"11px 14px",fontSize:16,cursor:"pointer"}}>🔍</button>
            <button onClick={()=>{setClientSearch("");setView("client_pick");}} style={S.addBtn}>+ Nuova</button>
          </div>
        </div>

        <div style={{padding:"16px 16px 0"}}>
          {/* Greeting */}
          <div style={S.greetCard}>
            <h2 style={{fontSize:20,fontWeight:700,color:"#0f172a",margin:"0 0 4px"}}>
              {new Date().getHours()<12?"Buongiorno":"Buon pomeriggio"} 👋
            </h2>
            <p style={{fontSize:14,color:"#64748b",margin:0}}>
              {todayPratiche.length>0?`Hai ${todayPratiche.length} appuntament${todayPratiche.length>1?"i":"o"} oggi`:"Nessun appuntamento per oggi"}
              {overduePratiche.length>0?` · ${overduePratiche.length} scadut${overduePratiche.length>1?"e":"a"}`:""}</p>
          </div>

          {/* Quick Stats */}
          <div style={S.dashStats}>
            <div style={S.dashStat} onClick={()=>{setFilter("da_fare");setView("pratiche");}}>
              <span style={{fontSize:28,fontWeight:800,color:"#ef4444"}}>{counts.da_fare}</span>
              <span style={{fontSize:11,color:"#64748b"}}>Da fare</span>
            </div>
            <div style={S.dashStat} onClick={()=>{setFilter("in_corso");setView("pratiche");}}>
              <span style={{fontSize:28,fontWeight:800,color:"#d97706"}}>{counts.in_corso}</span>
              <span style={{fontSize:11,color:"#64748b"}}>In corso</span>
            </div>
            <div style={S.dashStat} onClick={()=>{setFilter("completato");setView("pratiche");}}>
              <span style={{fontSize:28,fontWeight:800,color:"#059669"}}>{counts.completato}</span>
              <span style={{fontSize:11,color:"#64748b"}}>Completate</span>
            </div>
            <div style={S.dashStat} onClick={()=>setView("clienti")}>
              <span style={{fontSize:28,fontWeight:800,color:"#ff6b35"}}>{db.clients.length}</span>
              <span style={{fontSize:11,color:"#64748b"}}>Clienti</span>
            </div>
          </div>

          {/* Overdue alert */}
          {overduePratiche.length>0 && (
            <div style={S.alertCard}>
              <span style={{fontSize:20}}>⚠️</span>
              <div style={{flex:1}}>
                <div style={{fontSize:14,fontWeight:700,color:"#dc2626"}}>{overduePratiche.length} pratich{overduePratiche.length>1?"e":"a"} scadut{overduePratiche.length>1?"e":"a"}</div>
                <div style={{fontSize:12,color:"#9ca3af"}}>
                  {overduePratiche.slice(0,3).map((p: any)=>{
                    const c = getClient(p.clientId);
                    return `${p.numero} (${c?.nome||"?"})`;
                  }).join(", ")}
                </div>
              </div>
            </div>
          )}

          {/* Today's Appointments */}
          <div style={S.dashSection}>
            <h3 style={S.dashSectionTitle}>📅 Appuntamenti di Oggi</h3>
            {todayPratiche.length===0 ? <p style={S.dashEmpty}>Nessun appuntamento oggi</p>
            : todayPratiche.map((p: any) => {
              const c = getClient(p.clientId);
              const sc = STATUS[p.status];
              return (
                <button key={p.id} onClick={()=>{setSelPratica(p.id);setView("pratica");}} style={S.appointCard}>
                  <div style={{...S.appointTime,background:sc.bg,color:sc.color}}>{p.ora}</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:14,fontWeight:600,color:"#0f172a"}}>{c?.nome||"—"}</div>
                    <div style={{fontSize:12,color:"#64748b"}}>{p.numero} {p.indirizzo?`· 📍 ${p.indirizzo}`:""}</div>
                    {p.actions.length>0 && <div style={{fontSize:11,color:"#7c3aed",marginTop:2}}>{p.actions.map((a: any)=>{const cfg=ACTIONS_CFG.find(ac=>ac.key===a.type);return cfg?.icon+" "+cfg?.label;}).join(", ")}</div>}
                  </div>
                  <span style={{fontSize:18}}>→</span>
                </button>
              );
            })}
          </div>

          {/* Tomorrow */}
          {tomorrowPratiche.length>0 && (
            <div style={S.dashSection}>
              <h3 style={S.dashSectionTitle}>📅 Domani ({tomorrowPratiche.length})</h3>
              {tomorrowPratiche.map((p: any) => {
                const c = getClient(p.clientId);
                return (
                  <button key={p.id} onClick={()=>{setSelPratica(p.id);setView("pratica");}} style={{...S.appointCard,background:"#f8fafc"}}>
                    <div style={{...S.appointTime,background:"#f1f5f9",color:"#64748b"}}>{p.ora}</div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:14,fontWeight:600,color:"#0f172a"}}>{c?.nome||"—"}</div>
                      <div style={{fontSize:12,color:"#94a3b8"}}>{p.numero}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Pending Tasks */}
          {pendingTasks.length>0 && (
            <div style={S.dashSection}>
              <h3 style={S.dashSectionTitle}>✅ Cose da Fare ({pendingTasks.length})</h3>
              {pendingTasks.map((t: any) => {
                const c = getClient(t.clientId);
                return (
                  <div key={t.id} style={S.taskDashRow}>
                    <button onClick={()=>toggleActionTask(t.praticaId,t.actionId,t.id)} style={S.taskCheck}>○</button>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13,color:"#1f2937"}}>{t.text}</div>
                      <div style={{fontSize:11,color:"#94a3b8"}}>{t.actionIcon} {t.praticaNum} · {c?.nome||""}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Recent Emails */}
          {recentEmails.length>0 && (
            <div style={S.dashSection}>
              <h3 style={S.dashSectionTitle}>✉️ Email Recenti</h3>
              {recentEmails.map((e: any) => {
                const c = getClient(e.clientId);
                return (
                  <div key={e.id} style={S.emailDashCard}>
                    <div style={{fontSize:13,fontWeight:600,color:"#0f172a"}}>{e.oggetto}</div>
                    <div style={{fontSize:12,color:"#64748b"}}>A: {e.destinatario} · {e.praticaNum}</div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Statistiche Button */}
          <button onClick={()=>setView("stats")} style={{width:"100%",padding:"16px",borderRadius:16,border:"none",background:"linear-gradient(135deg,#1e293b,#334155)",color:"#fff",fontSize:15,fontWeight:800,cursor:"pointer",marginBottom:20,boxShadow:"0 4px 16px rgba(0,0,0,0.15)",display:"flex",alignItems:"center",justifyContent:"center",gap:10,letterSpacing:"-0.2px"}}>
            📊 Statistiche e Report <span style={{fontSize:18}}>→</span>
          </button>

          {/* Quick Notes */}
          <div style={S.dashSection}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <h3 style={S.dashSectionTitle}>📝 Note Rapide</h3>
              <button onClick={()=>{setNoteEdit({testo:"",colore:"#fffbeb",praticaId:""});setView("note_edit");}} style={S.addNoteBtn}>+</button>
            </div>
            {(db.notes||[]).length===0 ? <p style={S.dashEmpty}>Nessuna nota</p>
            : (db.notes||[]).slice(0,4).map((n: any)=>(
              <button key={n.id} onClick={()=>{setNoteEdit(n);setView("note_edit");}} style={{...S.noteCard,background:n.colore||"#fffbeb"}}>
                <div style={{fontSize:13,fontWeight:600,color:"#0f172a"}}>{n.testo?.substring(0,80)||"Nota vuota"}{(n.testo?.length||0)>80?"...":""}</div>
                {n.praticaId && <div style={{fontSize:11,color:"#7c3aed",marginTop:2}}>📋 {getPratica(n.praticaId)?.numero||""}</div>}
                <div style={{fontSize:10,color:"#94a3b8",marginTop:4}}>{n.updatedAt?new Date(n.updatedAt).toLocaleString("it-IT"):""}</div>
              </button>
            ))}
          </div>
        </div>

        <BottomNav items={navItems} active={view} onNav={setView} />
      </div>
    );
  }

  // ==================== STATISTICHE ====================
  if (view === "stats") {
    const MESI_SHORT = ["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"];
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
    const lastMonth = (() => { const d = new Date(now.getFullYear(), now.getMonth()-1, 1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; })();
    
    // Pratiche per mese (ultimi 6 mesi)
    const months: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`);
    }
    const pratichePerMese = months.map(m => ({
      mese: m,
      label: MESI_SHORT[parseInt(m.split("-")[1])-1],
      totale: db.pratiche.filter((p: any) => p.data?.startsWith(m)).length,
      completate: db.pratiche.filter((p: any) => p.data?.startsWith(m) && p.status === "completato").length,
    }));
    const maxPratiche = Math.max(...pratichePerMese.map(m => m.totale), 1);

    // Totali
    const totPratiche = db.pratiche.length;
    const totCompletate = db.pratiche.filter((p: any) => p.status === "completato").length;
    const totInCorso = db.pratiche.filter((p: any) => p.status === "in_corso").length;
    const totDaFare = db.pratiche.filter((p: any) => p.status === "da_fare").length;
    const totClienti = db.clients.length;

    // Fatturato dai preventivi
    const fatturato = db.pratiche.reduce((s: number, p: any) => s + (p.preventivo?.totaleFinale || 0), 0);
    const fattThisMonth = db.pratiche.filter((p: any) => p.data?.startsWith(thisMonth)).reduce((s: number, p: any) => s + (p.preventivo?.totaleFinale || 0), 0);
    const fattLastMonth = db.pratiche.filter((p: any) => p.data?.startsWith(lastMonth)).reduce((s: number, p: any) => s + (p.preventivo?.totaleFinale || 0), 0);

    // Azioni più usate
    const actionCounts: Record<string, number> = {};
    db.pratiche.forEach((p: any) => {
      (p.actions || []).forEach((a: any) => {
        actionCounts[a.type] = (actionCounts[a.type] || 0) + 1;
      });
    });
    const topActions = Object.entries(actionCounts).sort((a, b) => b[1] - a[1]).slice(0, 6);

    // Tasso completamento
    const tasso = totPratiche > 0 ? Math.round((totCompletate / totPratiche) * 100) : 0;

    return (
      <div style={S.container}>
        <div style={{...S.secHdr,background:"linear-gradient(135deg,#1e293b,#334155)",borderRadius:"0 0 20px 20px"}}>
          <button onClick={()=>setView("dashboard")} style={{...S.backBtn,color:"#fbbf24"}}>← Indietro</button>
          <h2 style={{...S.secTitle,color:"#fff"}}>📊 Statistiche</h2>
        </div>
        <div style={{padding:"16px"}}>
          {/* KPI Cards */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10,marginBottom:20}}>
            <div style={{background:"#fff",borderRadius:18,padding:18,boxShadow:"0 4px 16px rgba(0,0,0,0.06)"}}>
              <div style={{fontSize:11,fontWeight:800,color:"#64748b",textTransform:"uppercase",letterSpacing:"0.5px"}}>Fatturato Totale</div>
              <div style={{fontSize:24,fontWeight:900,color:"#059669",letterSpacing:"-0.5px",marginTop:4}}>€ {fatturato.toFixed(0)}</div>
            </div>
            <div style={{background:"#fff",borderRadius:18,padding:18,boxShadow:"0 4px 16px rgba(0,0,0,0.06)"}}>
              <div style={{fontSize:11,fontWeight:800,color:"#64748b",textTransform:"uppercase",letterSpacing:"0.5px"}}>Questo Mese</div>
              <div style={{fontSize:24,fontWeight:900,color:"#ff6b35",letterSpacing:"-0.5px",marginTop:4}}>€ {fattThisMonth.toFixed(0)}</div>
              {fattLastMonth > 0 && <div style={{fontSize:11,color:fattThisMonth>=fattLastMonth?"#059669":"#ef4444",fontWeight:700,marginTop:2}}>
                {fattThisMonth>=fattLastMonth?"📈":"📉"} {fattLastMonth>0?Math.round(((fattThisMonth-fattLastMonth)/fattLastMonth)*100):0}% vs mese scorso
              </div>}
            </div>
            <div style={{background:"#fff",borderRadius:18,padding:18,boxShadow:"0 4px 16px rgba(0,0,0,0.06)"}}>
              <div style={{fontSize:11,fontWeight:800,color:"#64748b",textTransform:"uppercase",letterSpacing:"0.5px"}}>Pratiche Totali</div>
              <div style={{fontSize:24,fontWeight:900,color:"#7c3aed",letterSpacing:"-0.5px",marginTop:4}}>{totPratiche}</div>
              <div style={{fontSize:11,color:"#64748b",fontWeight:600,marginTop:2}}>{totClienti} clienti</div>
            </div>
            <div style={{background:"#fff",borderRadius:18,padding:18,boxShadow:"0 4px 16px rgba(0,0,0,0.06)"}}>
              <div style={{fontSize:11,fontWeight:800,color:"#64748b",textTransform:"uppercase",letterSpacing:"0.5px"}}>Completamento</div>
              <div style={{fontSize:24,fontWeight:900,color:tasso>=70?"#059669":tasso>=40?"#d97706":"#ef4444",letterSpacing:"-0.5px",marginTop:4}}>{tasso}%</div>
              <div style={{height:6,background:"#e2e8f0",borderRadius:10,marginTop:6,overflow:"hidden"}}>
                <div style={{height:"100%",borderRadius:10,width:`${tasso}%`,background:tasso>=70?"#059669":tasso>=40?"linear-gradient(90deg,#d97706,#f59e0b)":"#ef4444",transition:"width 0.4s"}} />
              </div>
            </div>
          </div>

          {/* Status Breakdown */}
          <div style={{background:"#fff",borderRadius:18,padding:18,marginBottom:20,boxShadow:"0 4px 16px rgba(0,0,0,0.06)"}}>
            <h3 style={{fontSize:15,fontWeight:900,color:"#1e293b",margin:"0 0 14px",letterSpacing:"-0.3px"}}>📋 Stato Pratiche</h3>
            {[{label:"Da fare",count:totDaFare,color:"#ef4444",bg:"#fef2f2"},{label:"In corso",count:totInCorso,color:"#d97706",bg:"#fffbeb"},{label:"Completate",count:totCompletate,color:"#059669",bg:"#ecfdf5"}].map(s => (
              <div key={s.label} style={{display:"flex",alignItems:"center",gap:12,marginBottom:10}}>
                <div style={{width:40,height:40,borderRadius:12,background:s.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:900,color:s.color}}>{s.count}</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:700,color:"#1e293b"}}>{s.label}</div>
                  <div style={{height:6,background:"#f1f5f9",borderRadius:10,marginTop:4,overflow:"hidden"}}>
                    <div style={{height:"100%",borderRadius:10,width:`${totPratiche>0?(s.count/totPratiche*100):0}%`,background:s.color,transition:"width 0.4s"}} />
                  </div>
                </div>
                <span style={{fontSize:12,fontWeight:700,color:"#64748b"}}>{totPratiche>0?Math.round(s.count/totPratiche*100):0}%</span>
              </div>
            ))}
          </div>

          {/* Monthly Chart */}
          <div style={{background:"#fff",borderRadius:18,padding:18,marginBottom:20,boxShadow:"0 4px 16px rgba(0,0,0,0.06)"}}>
            <h3 style={{fontSize:15,fontWeight:900,color:"#1e293b",margin:"0 0 16px",letterSpacing:"-0.3px"}}>📈 Pratiche per Mese</h3>
            <div style={{display:"flex",alignItems:"flex-end",gap:8,height:140}}>
              {pratichePerMese.map(m => (
                <div key={m.mese} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                  <span style={{fontSize:12,fontWeight:800,color:"#1e293b"}}>{m.totale}</span>
                  <div style={{width:"100%",display:"flex",flexDirection:"column",gap:2,alignItems:"center"}}>
                    <div style={{width:"80%",height:Math.max(4, (m.totale/maxPratiche)*100),background:"linear-gradient(180deg,#ff6b35,#ff3d71)",borderRadius:8,transition:"height 0.4s"}} />
                    {m.completate > 0 && <div style={{width:"80%",height:Math.max(2, (m.completate/maxPratiche)*100),background:"#059669",borderRadius:8,transition:"height 0.4s",opacity:0.6}} />}
                  </div>
                  <span style={{fontSize:10,fontWeight:700,color:m.mese===thisMonth?"#ff6b35":"#94a3b8"}}>{m.label}</span>
                </div>
              ))}
            </div>
            <div style={{display:"flex",gap:16,marginTop:12,justifyContent:"center"}}>
              <div style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:10,height:10,borderRadius:3,background:"linear-gradient(135deg,#ff6b35,#ff3d71)"}} /><span style={{fontSize:11,color:"#64748b",fontWeight:600}}>Totale</span></div>
              <div style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:10,height:10,borderRadius:3,background:"#059669",opacity:0.6}} /><span style={{fontSize:11,color:"#64748b",fontWeight:600}}>Completate</span></div>
            </div>
          </div>

          {/* Top Actions */}
          {topActions.length > 0 && (
            <div style={{background:"#fff",borderRadius:18,padding:18,marginBottom:20,boxShadow:"0 4px 16px rgba(0,0,0,0.06)"}}>
              <h3 style={{fontSize:15,fontWeight:900,color:"#1e293b",margin:"0 0 14px",letterSpacing:"-0.3px"}}>🔧 Azioni più utilizzate</h3>
              {topActions.map(([key, count]) => {
                const cfg = ACTIONS_CFG.find(a => a.key === key);
                const maxCount = topActions[0][1] as number;
                return (
                  <div key={key} style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                    <span style={{fontSize:20}}>{cfg?.icon||"📋"}</span>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13,fontWeight:700,color:"#1e293b"}}>{cfg?.label||key}</div>
                      <div style={{height:5,background:"#f1f5f9",borderRadius:10,marginTop:3,overflow:"hidden"}}>
                        <div style={{height:"100%",borderRadius:10,width:`${((count as number)/maxCount)*100}%`,background:cfg?.color||"#6b7280",transition:"width 0.4s"}} />
                      </div>
                    </div>
                    <span style={{fontSize:14,fontWeight:800,color:cfg?.color||"#6b7280"}}>{count as number}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ==================== CALENDARIO ====================
  if (view === "calendario") {
    const MESI = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
    const GIORNI = ["Lun","Mar","Mer","Gio","Ven","Sab","Dom"];
    const year = calMonth.getFullYear();
    const month = calMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDow = (firstDay.getDay() + 6) % 7; // Monday = 0
    const daysInMonth = lastDay.getDate();
    const todayStr = today();

    // Build map: date string -> array of pratiche
    const praticheByDate: Record<string, any[]> = {};
    db.pratiche.forEach((p: any) => {
      if (p.data) {
        if (!praticheByDate[p.data]) praticheByDate[p.data] = [];
        praticheByDate[p.data].push(p);
      }
    });

    const prevMonth = () => setCalMonth(new Date(year, month - 1, 1));
    const nextMonth = () => setCalMonth(new Date(year, month + 1, 1));
    const goToday = () => { setCalMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1)); setCalSelDay(todayStr); };

    // Calendar grid cells
    const cells: (number | null)[] = [];
    for (let i = 0; i < startDow; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);

    const selDayPratiche = calSelDay ? (praticheByDate[calSelDay] || []) : [];

    return (
      <div style={S.container}>
        <div style={{...S.header,padding:"16px 20px 12px"}}>
          <h2 style={{...S.logo,fontSize:18}}>📅 Agenda</h2>
          <button onClick={goToday} style={{...S.addBtn,padding:"8px 16px",fontSize:13}}>Oggi</button>
        </div>
        <div style={{padding:"16px 16px 0"}}>
          {/* Month Navigation */}
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
            <button onClick={prevMonth} style={{background:"#fff",border:"none",borderRadius:12,width:40,height:40,fontSize:18,cursor:"pointer",boxShadow:"0 2px 8px rgba(0,0,0,0.06)",display:"flex",alignItems:"center",justifyContent:"center"}}>←</button>
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:20,fontWeight:900,color:"#1e293b",letterSpacing:"-0.5px"}}>{MESI[month]}</div>
              <div style={{fontSize:13,color:"#64748b",fontWeight:600}}>{year}</div>
            </div>
            <button onClick={nextMonth} style={{background:"#fff",border:"none",borderRadius:12,width:40,height:40,fontSize:18,cursor:"pointer",boxShadow:"0 2px 8px rgba(0,0,0,0.06)",display:"flex",alignItems:"center",justifyContent:"center"}}>→</button>
          </div>

          {/* Day Headers */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4,marginBottom:6}}>
            {GIORNI.map(g => (
              <div key={g} style={{textAlign:"center",fontSize:11,fontWeight:800,color:"#94a3b8",textTransform:"uppercase",padding:"4px 0"}}>{g}</div>
            ))}
          </div>

          {/* Calendar Grid */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4,marginBottom:16}}>
            {cells.map((day, i) => {
              if (day === null) return <div key={`e${i}`} />;
              const dateStr = `${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
              const hasEvents = praticheByDate[dateStr]?.length > 0;
              const eventCount = praticheByDate[dateStr]?.length || 0;
              const isToday = dateStr === todayStr;
              const isSelected = dateStr === calSelDay;
              const isPast = dateStr < todayStr;
              const hasOverdue = (praticheByDate[dateStr]||[]).some((p: any) => p.status !== "completato" && dateStr < todayStr);

              return (
                <button key={dateStr} onClick={() => setCalSelDay(isSelected ? null : dateStr)} style={{
                  position:"relative",
                  background: isSelected ? "linear-gradient(135deg,#ff6b35,#ff3d71)" : isToday ? "#fff" : "transparent",
                  border: isToday && !isSelected ? "2.5px solid #ff6b35" : "none",
                  borderRadius: 14,
                  padding: "10px 2px 8px",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 3,
                  minHeight: 48,
                  boxShadow: isSelected ? "0 4px 14px rgba(255,107,53,0.35)" : isToday ? "0 2px 8px rgba(255,107,53,0.15)" : "none",
                  transition: "all 0.2s",
                }}>
                  <span style={{fontSize:15,fontWeight:isToday||isSelected?900:600,color:isSelected?"#fff":isToday?"#ff6b35":isPast?"#94a3b8":"#1e293b"}}>{day}</span>
                  {hasEvents && (
                    <div style={{display:"flex",gap:2,alignItems:"center"}}>
                      {eventCount <= 3 ? Array.from({length:eventCount}).map((_,j) => (
                        <div key={j} style={{width:5,height:5,borderRadius:"50%",background:isSelected?"rgba(255,255,255,0.8)":hasOverdue?"#ef4444":"#ff6b35"}} />
                      )) : (
                        <span style={{fontSize:10,fontWeight:800,color:isSelected?"rgba(255,255,255,0.9)":"#ff6b35"}}>{eventCount}</span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Selected Day Detail */}
          {calSelDay && (
            <div style={{marginBottom:16}}>
              <h3 style={{fontSize:16,fontWeight:900,color:"#1e293b",margin:"0 0 12px",letterSpacing:"-0.3px"}}>
                {calSelDay === todayStr ? "📌 Oggi" : fmtDate(calSelDay)} — {selDayPratiche.length} appuntament{selDayPratiche.length===1?"o":"i"}
              </h3>
              {selDayPratiche.length === 0 && (
                <div style={{background:"#fff",borderRadius:16,padding:"24px 16px",textAlign:"center",boxShadow:"0 4px 16px rgba(0,0,0,0.06)"}}>
                  <div style={{fontSize:32,marginBottom:8}}>📭</div>
                  <p style={{fontSize:14,color:"#94a3b8",fontWeight:600}}>Nessun appuntamento</p>
                  <button onClick={()=>{setClientSearch("");setView("client_pick");}} style={{marginTop:12,padding:"10px 20px",borderRadius:12,background:"linear-gradient(135deg,#ff6b35,#ff3d71)",color:"#fff",border:"none",fontSize:13,fontWeight:800,cursor:"pointer",boxShadow:"0 4px 14px rgba(255,107,53,0.3)"}}>+ Nuova Pratica</button>
                </div>
              )}
              {selDayPratiche.sort((a: any,b: any) => (a.ora||"").localeCompare(b.ora||"")).map((p: any) => {
                const c = getClient(p.clientId);
                const sc = STATUS[p.status];
                const actions = p.actions.map((a: any) => ACTIONS_CFG.find(ac=>ac.key===a.type)).filter(Boolean);
                return (
                  <button key={p.id} onClick={()=>{setSelPratica(p.id);setView("pratica");}} style={{...S.appointCard,flexDirection:"column",alignItems:"stretch",gap:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:12}}>
                      <div style={{...S.appointTime,background:sc.bg,color:sc.color}}>{p.ora||"--:--"}</div>
                      <div style={{flex:1}}>
                        <div style={{fontSize:16,fontWeight:800,color:"#0f172a",letterSpacing:"-0.3px"}}>{c?.nome||"—"}</div>
                        <div style={{fontSize:13,color:"#64748b",fontWeight:500}}>{p.numero} · 📍 {p.indirizzo||"—"}</div>
                      </div>
                      <span style={{...S.praticaStatus,background:sc.bg,color:sc.color}}>{sc.icon} {sc.label}</span>
                    </div>
                    {actions.length > 0 && (
                      <div style={{display:"flex",gap:6,marginTop:8,flexWrap:"wrap"}}>
                        {actions.map((a: any) => (
                          <span key={a.key} style={{fontSize:11,fontWeight:700,color:a.color,background:`${a.color}15`,padding:"3px 10px",borderRadius:8}}>{a.icon} {a.label}</span>
                        ))}
                      </div>
                    )}
                    {p.note && <div style={{fontSize:12,color:"#64748b",marginTop:6,fontStyle:"italic"}}>📝 {p.note}</div>}
                  </button>
                );
              })}
            </div>
          )}

          {/* Upcoming if no day selected */}
          {!calSelDay && (
            <div>
              <h3 style={{fontSize:16,fontWeight:900,color:"#1e293b",margin:"0 0 12px",letterSpacing:"-0.3px"}}>📋 Prossimi Appuntamenti</h3>
              {upcomingPratiche.length === 0 && <p style={{fontSize:13,color:"#94a3b8",fontWeight:500}}>Nessun appuntamento in programma</p>}
              {upcomingPratiche.slice(0,8).map((p: any) => {
                const c = getClient(p.clientId);
                const sc = STATUS[p.status];
                const days = daysFromNow(p.data);
                return (
                  <button key={p.id} onClick={()=>{setSelPratica(p.id);setView("pratica");}} style={S.appointCard}>
                    <div style={{...S.appointTime,background:sc.bg,color:sc.color,minWidth:60,textAlign:"center"}}>
                      <div style={{fontSize:14,fontWeight:800}}>{p.ora||"--:--"}</div>
                      <div style={{fontSize:10,fontWeight:700,marginTop:2}}>{days===0?"OGGI":days===1?"Domani":fmtDate(p.data)}</div>
                    </div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:15,fontWeight:800,color:"#0f172a"}}>{c?.nome||"—"}</div>
                      <div style={{fontSize:12,color:"#64748b",fontWeight:500}}>{p.numero} · 📍 {p.indirizzo||"—"}</div>
                    </div>
                    <span style={{fontSize:18}}>→</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <BottomNav items={navItems} active={view} onNav={setView} />
      </div>
    );
  }

  // ==================== PRATICHE LIST ====================
  if (view === "pratiche") {
    return (
      <div style={S.container}>
        <div style={{...S.header,padding:"16px 20px 12px"}}>
          <h2 style={{...S.logo,fontSize:18}}>📋 Pratiche</h2>
          <button onClick={()=>{setClientSearch("");setView("client_pick");}} style={S.addBtn}>+ Nuova</button>
        </div>
        <div style={S.stats}>
          {[{k:"tutti",l:"Totale",i:"📋"},{k:"da_fare",l:"Da fare",i:"🔴"},{k:"in_corso",l:"In corso",i:"🟡"},{k:"completato",l:"Fatti",i:"🟢"}].map(s=>(
            <button key={s.k} onClick={()=>setFilter(s.k)} style={{...S.statCard,borderBottom:filter===s.k?"3px solid #ff6b35":"3px solid transparent",background:filter===s.k?"#fff7ed":"#fff"}}>
              <span style={{fontSize:16}}>{s.i}</span>
              <span style={S.statNum}>{counts[s.k as keyof typeof counts]}</span>
              <span style={S.statLbl}>{s.l}</span>
            </button>
          ))}
        </div>
        <div style={{padding:"0 16px 8px"}}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Cerca pratica, cliente..." style={S.searchInp} />
        </div>
        {filteredPratiche.length===0 ? <div style={S.empty}><div style={{fontSize:56}}>📂</div><p style={S.emptyTitle}>Nessun risultato</p></div>
        : <div style={{padding:"0 16px"}}>{filteredPratiche.map((p: any)=>{
          const c = getClient(p.clientId); const sc = STATUS[p.status];
          const totalTasks = p.actions.reduce((s: number,a: any)=>s+a.tasks.length,0);
          const doneTasks = p.actions.reduce((s: number,a: any)=>s+a.tasks.filter((t: any)=>t.done).length,0);
          const prog = totalTasks?Math.round(doneTasks/totalTasks*100):0;
          return (
            <button key={p.id} onClick={()=>{setSelPratica(p.id);setView("pratica");}} style={S.praticaCard}>
              <div style={S.praticaTop}><span style={S.praticaNum}>{p.numero}</span><span style={{...S.praticaStatus,background:sc.bg,color:sc.color}}>{sc.label}</span></div>
              <h3 style={S.praticaCliente}>{c?.nome||"—"}</h3>
              {p.indirizzo && <p style={S.praticaAddr}>📍 {p.indirizzo}</p>}
              <div style={S.praticaMeta}>
                <span style={{fontSize:12,color:"#64748b"}}>📅 {dateLabel(p.data)} {p.ora}</span>
                {p.actions.length>0 && <span style={S.praticaActions}>{p.actions.length} azioni</span>}
              </div>
              {totalTasks>0 && <div style={S.progRow}><div style={S.progBar}><div style={{...S.progFill,width:`${prog}%`,background:prog===100?"#059669":"linear-gradient(90deg,#ff6b35,#ff3d71)"}} /></div><span style={{fontSize:12,color:"#64748b",fontWeight:600}}>{doneTasks}/{totalTasks}</span></div>}
            </button>
          );
        })}</div>}
        <BottomNav items={navItems} active={view} onNav={setView} />
      </div>
    );
  }

  // ==================== CLIENTI ====================
  if (view === "clienti") {
    const sortedClients = [...filteredClients].sort((a: any, b: any) => (a.nome||"").localeCompare(b.nome||""));
    return (
      <div style={S.container}>
        <div style={{...S.header,padding:"16px 20px 12px"}}>
          <h2 style={{...S.logo,fontSize:18}}>👤 Rubrica ({db.clients.length})</h2>
          <button onClick={()=>{setClientForm({nome:"",telefono:"",email:"",indirizzo:"",codiceFiscale:"",piva:"",note:""});setView("new_client");}} style={S.addBtn}>+ Nuovo</button>
        </div>
        <div style={{padding:"0 16px"}}>
          <input value={clientSearch} onChange={e=>setClientSearch(e.target.value)} placeholder="🔍 Cerca per nome, telefono, email, indirizzo..." style={{...S.searchInp,marginTop:12}} />
          
          {/* Summary */}
          <div style={{display:"flex",gap:8,margin:"12px 0",overflowX:"auto"}}>
            {[{l:"Tutti",v:db.clients.length,c:"#1e293b"},{l:"Con pratiche",v:db.clients.filter((c: any)=>db.pratiche.some((p: any)=>p.clientId===c.id)).length,c:"#7c3aed"},{l:"Attivi",v:db.clients.filter((c: any)=>db.pratiche.some((p: any)=>p.clientId===c.id&&p.status!=="completato")).length,c:"#ff6b35"}].map(s => (
              <div key={s.l} style={{background:"#fff",borderRadius:12,padding:"8px 14px",boxShadow:"0 2px 8px rgba(0,0,0,0.04)",whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:6}}>
                <span style={{fontSize:18,fontWeight:900,color:s.c}}>{s.v}</span>
                <span style={{fontSize:11,fontWeight:700,color:"#64748b"}}>{s.l}</span>
              </div>
            ))}
          </div>

          {sortedClients.length===0 ? <div style={S.emptyMini}>Nessun cliente trovato</div>
          : sortedClients.map((c: any)=>{
            const clientPratiche = db.pratiche.filter((p: any)=>p.clientId===c.id);
            const pCount = clientPratiche.length;
            const activeCount = clientPratiche.filter((p: any) => p.status !== "completato").length;
            const fatturato = clientPratiche.reduce((s: number, p: any) => s + (p.preventivo?.totaleFinale || 0), 0);
            const lastPratica = clientPratiche.sort((a: any, b: any) => (b.data||"").localeCompare(a.data||""))[0];
            return (
              <div key={c.id} style={{...S.clientCard,flexDirection:"column",alignItems:"stretch",gap:0,padding:"16px 18px"}}>
                <div style={{display:"flex",alignItems:"center",gap:14}}>
                  <div style={S.clientAvatar}>{c.nome.charAt(0).toUpperCase()}</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:16,fontWeight:800,color:"#0f172a",letterSpacing:"-0.2px"}}>{c.nome}</div>
                    {c.indirizzo && <div style={{fontSize:12,color:"#94a3b8",marginTop:2}}>📍 {c.indirizzo}</div>}
                  </div>
                  {activeCount > 0 && <span style={{background:"linear-gradient(135deg,#ff6b35,#ff3d71)",color:"#fff",fontSize:11,fontWeight:800,padding:"3px 10px",borderRadius:10}}>{activeCount} attiv{activeCount===1?"a":"e"}</span>}
                </div>
                
                {/* Contact row */}
                <div style={{display:"flex",gap:8,marginTop:12}}>
                  {c.telefono && <a href={`tel:${c.telefono}`} style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"9px 8px",borderRadius:12,background:"linear-gradient(135deg,#ecfdf5,#d1fae5)",color:"#059669",fontSize:13,fontWeight:700,textDecoration:"none",border:"none"}}>📞 {c.telefono}</a>}
                  {c.email && <a href={`mailto:${c.email}`} style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"9px 8px",borderRadius:12,background:"linear-gradient(135deg,#f3e8ff,#ede9fe)",color:"#7c3aed",fontSize:13,fontWeight:700,textDecoration:"none",border:"none",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>✉️ Email</a>}
                </div>

                {/* Stats row */}
                <div style={{display:"flex",gap:8,marginTop:10}}>
                  <div style={{flex:1,background:"#f8fafc",borderRadius:10,padding:"8px 10px",textAlign:"center"}}>
                    <div style={{fontSize:16,fontWeight:900,color:"#7c3aed"}}>{pCount}</div>
                    <div style={{fontSize:10,color:"#94a3b8",fontWeight:600}}>Pratiche</div>
                  </div>
                  {fatturato > 0 && <div style={{flex:1,background:"#f8fafc",borderRadius:10,padding:"8px 10px",textAlign:"center"}}>
                    <div style={{fontSize:16,fontWeight:900,color:"#059669"}}>€{fatturato.toFixed(0)}</div>
                    <div style={{fontSize:10,color:"#94a3b8",fontWeight:600}}>Fatturato</div>
                  </div>}
                  {lastPratica && <div style={{flex:1,background:"#f8fafc",borderRadius:10,padding:"8px 10px",textAlign:"center"}}>
                    <div style={{fontSize:12,fontWeight:800,color:"#1e293b"}}>{fmtDate(lastPratica.data)}</div>
                    <div style={{fontSize:10,color:"#94a3b8",fontWeight:600}}>Ultima</div>
                  </div>}
                </div>

                {/* Actions */}
                <div style={{display:"flex",gap:8,marginTop:10}}>
                  <button onClick={()=>{setSelClient(c.id);setClientSearch("");setView("new_pratica");}} style={{flex:1,padding:"9px",borderRadius:12,border:"2px solid #ff6b35",background:"#fff",color:"#ff6b35",fontSize:12,fontWeight:800,cursor:"pointer"}}>+ Pratica</button>
                  <button onClick={()=>{setClientForm({...c});setView("new_client");}} style={{flex:1,padding:"9px",borderRadius:12,border:"2px solid #94a3b8",background:"#fff",color:"#64748b",fontSize:12,fontWeight:800,cursor:"pointer"}}>✏️ Modifica</button>
                </div>

                {/* Pratiche list */}
                {clientPratiche.length > 0 && (
                  <div style={{marginTop:10,borderTop:"1.5px solid #f1f5f9",paddingTop:10}}>
                    {clientPratiche.slice(0,3).map((p: any) => {
                      const sc = STATUS[p.status];
                      return (
                        <button key={p.id} onClick={()=>{setSelPratica(p.id);setView("pratica");}} style={{width:"100%",display:"flex",alignItems:"center",gap:8,padding:"6px 0",background:"none",border:"none",cursor:"pointer",textAlign:"left"}}>
                          <span style={{fontSize:11,fontWeight:800,color:"#7c3aed"}}>{p.numero}</span>
                          <span style={{fontSize:11,color:"#64748b",flex:1}}>{p.indirizzo||"—"}</span>
                          <span style={{fontSize:10,fontWeight:700,color:sc.color,background:sc.bg,padding:"2px 8px",borderRadius:8}}>{sc.icon} {sc.label}</span>
                        </button>
                      );
                    })}
                    {clientPratiche.length > 3 && <div style={{fontSize:11,color:"#94a3b8",fontWeight:600,marginTop:4}}>+{clientPratiche.length-3} altre pratiche</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <BottomNav items={navItems} active={view} onNav={setView} />
      </div>
    );
  }

  // ==================== NOTES ====================
  if (view === "notes") {
    return (
      <div style={S.container}>
        <div style={{...S.header,padding:"16px 20px 12px"}}>
          <h2 style={{...S.logo,fontSize:18}}>📝 Note</h2>
          <button onClick={()=>{setNoteEdit({testo:"",colore:"#fffbeb",praticaId:""});setView("note_edit");}} style={S.addBtn}>+ Nuova</button>
        </div>
        <div style={{padding:"0 16px",paddingTop:12}}>
          {(db.notes||[]).length===0 ? <div style={S.empty}><div style={{fontSize:48}}>📝</div><p style={S.emptyTitle}>Nessuna nota</p><p style={S.emptySub}>Aggiungi note per ricordare cose importanti</p></div>
          : (db.notes||[]).map((n: any)=>(
            <div key={n.id} style={{...S.noteCardFull,background:n.colore||"#fffbeb"}}>
              <button onClick={()=>{setNoteEdit(n);setView("note_edit");}} style={{...S.noteCardBtn}}>
                <div style={{fontSize:14,color:"#0f172a",whiteSpace:"pre-wrap"}}>{n.testo||"Nota vuota"}</div>
                {n.praticaId && <div style={{fontSize:12,color:"#7c3aed",marginTop:6}}>📋 {getPratica(n.praticaId)?.numero||""} · {getClient(getPratica(n.praticaId)?.clientId)?.nome||""}</div>}
                <div style={{fontSize:11,color:"#94a3b8",marginTop:6}}>{n.updatedAt?new Date(n.updatedAt).toLocaleString("it-IT"):""}</div>
              </button>
              <button onClick={()=>{if(confirm("Eliminare nota?"))deleteNote(n.id);}} style={S.noteDelBtn}>🗑️</button>
            </div>
          ))}
        </div>
        <BottomNav items={navItems} active={view} onNav={setView} />
      </div>
    );
  }

  return <div style={S.container}><BottomNav items={navItems} active={view} onNav={setView} /></div>;
}

// ==================== BOTTOM NAV ====================
// ==================== SETUP WIZARD ====================
function SetupWizard({ userSettings, onComplete, onSkip }: any) {
  const [step, setStep] = useState(0);
  const [sistemi, setSistemi] = useState<any[]>(userSettings.sistemi?.length > 0 ? userSettings.sistemi : []);
  const [categorie, setCategorie] = useState<any[]>(userSettings.categorie?.length > 0 ? userSettings.categorie : []);
  const [colori, setColori] = useState<Record<string,string[]>>(userSettings.colori || {});
  const [tipologie, setTipologie] = useState<string[]>(userSettings.tipologie?.length > 0 ? userSettings.tipologie : []);
  const [azienda, setAzienda] = useState(userSettings.azienda || { nome:"", email:"", telefono:"", indirizzo:"", piva:"" });
  const [customSistema, setCustomSistema] = useState("");
  const [customColore, setCustomColore] = useState("");
  const [customTipologia, setCustomTipologia] = useState("");
  const [customCategoria, setCustomCategoria] = useState("");
  const [selectedSistemaForColors, setSelectedSistemaForColors] = useState("");

  function toggleSistema(s: any) {
    const exists = sistemi.find((x: any) => x.id === s.id);
    if (exists) setSistemi(sistemi.filter((x: any) => x.id !== s.id));
    else setSistemi([...sistemi, s]);
  }
  function toggleCategoria(c: any) {
    const exists = categorie.find((x: any) => x.id === c.id);
    if (exists) setCategorie(categorie.filter((x: any) => x.id !== c.id));
    else setCategorie([...categorie, c]);
  }
  function toggleColore(matId: string, col: string) {
    const cur = colori[matId] || [];
    if (cur.includes(col)) setColori({...colori, [matId]: cur.filter(c => c !== col)});
    else setColori({...colori, [matId]: [...cur, col]});
  }
  function toggleTipologia(t: string) {
    if (tipologie.includes(t)) setTipologie(tipologie.filter(x => x !== t));
    else setTipologie([...tipologie, t]);
  }
  function addCustomSistema() {
    if (!customSistema.trim()) return;
    const id = customSistema.trim().toLowerCase().replace(/\s+/g,"_");
    if (!sistemi.find((s: any) => s.id === id)) setSistemi([...sistemi, {id, nome: customSistema.trim(), icon:"🔹"}]);
    setCustomSistema("");
  }
  function addCustomColore(matId: string) {
    if (!customColore.trim()) return;
    const cur = colori[matId] || [];
    if (!cur.includes(customColore.trim())) setColori({...colori, [matId]: [...cur, customColore.trim()]});
    setCustomColore("");
  }
  function addCustomTipologia() {
    if (!customTipologia.trim()) return;
    if (!tipologie.includes(customTipologia.trim())) setTipologie([...tipologie, customTipologia.trim()]);
    setCustomTipologia("");
  }

  const steps = [
    { title: "Benvenuto!", icon: "👋" },
    { title: "Materiali", icon: "🔷" },
    { title: "Colori", icon: "🎨" },
    { title: "Prodotti", icon: "🪟" },
    { title: "Tipologie", icon: "📋" },
    { title: "La tua azienda", icon: "🏢" },
  ];

  return (
    <div style={{...S.container,background:"linear-gradient(180deg,#1e293b 0%,#0f172a 100%)"}}>
      <div style={{padding:"30px 20px 16px",textAlign:"center"}}>
        <div style={{fontSize:38}}>{steps[step].icon}</div>
        <h1 style={{fontSize:22,fontWeight:900,color:"#fff",margin:"8px 0 4px"}}>{steps[step].title}</h1>
        <div style={{display:"flex",gap:6,justifyContent:"center",margin:"16px 0"}}>{steps.map((_,i)=><div key={i} style={{width:i===step?24:8,height:8,borderRadius:4,background:i<=step?"#ff6b35":"rgba(255,255,255,0.2)",transition:"all 0.3s"}} />)}</div>
      </div>
      <div style={{flex:1,background:"#fff",borderRadius:"24px 24px 0 0",padding:20,overflow:"auto"}}>
        {step===0 && (
          <div style={{textAlign:"center",padding:"20px 0"}}>
            <p style={{fontSize:16,color:"#374151",lineHeight:1.6,marginBottom:20}}>Configura FrameFlow per la tua attività. Scegli i materiali, i colori e i prodotti che usi di più.</p>
            <p style={{fontSize:14,color:"#64748b",marginBottom:30}}>Puoi sempre modificare queste impostazioni dopo dal tasto ⚙️</p>
            <button onClick={()=>setStep(1)} style={{...S.saveBtn,background:"linear-gradient(135deg,#ff6b35,#ff3d71)",fontSize:18}}>Iniziamo! →</button>
            <button onClick={onSkip} style={{...S.saveBtn,background:"transparent",color:"#64748b",boxShadow:"none",marginTop:8,fontSize:14}}>Salta per ora</button>
          </div>
        )}
        {step===1 && (<>
          <p style={{fontSize:14,color:"#64748b",marginBottom:16}}>Seleziona i materiali che tratti nella tua attività:</p>
          <div style={{display:"flex",flexWrap:"wrap",gap:10}}>
            {DEFAULT_SISTEMI.map(s=><button key={s.id} onClick={()=>toggleSistema(s)} style={{...S.pill,padding:"12px 18px",fontSize:14,background:sistemi.find((x: any)=>x.id===s.id)?"#ff6b35":"#f3f4f6",color:sistemi.find((x: any)=>x.id===s.id)?"#fff":"#374151",fontWeight:700,borderRadius:14}}>{s.icon} {s.nome}</button>)}
          </div>
          <div style={{display:"flex",gap:8,marginTop:16}}>
            <input value={customSistema} onChange={e=>setCustomSistema(e.target.value)} placeholder="Aggiungi materiale..." style={{...S.input,flex:1}} onKeyDown={e=>e.key==="Enter"&&addCustomSistema()} />
            <button onClick={addCustomSistema} style={{...S.pill,background:"#ff6b35",color:"#fff",padding:"10px 16px",fontWeight:700}}>+</button>
          </div>
          {sistemi.filter((s: any)=>!DEFAULT_SISTEMI.find(d=>d.id===s.id)).map((s: any)=><div key={s.id} style={{display:"flex",alignItems:"center",gap:8,marginTop:8,padding:"8px 12px",background:"#f0f9ff",borderRadius:10}}><span>{s.icon} {s.nome}</span><button onClick={()=>setSistemi(sistemi.filter((x: any)=>x.id!==s.id))} style={{marginLeft:"auto",background:"none",border:"none",color:"#ef4444",fontSize:18,cursor:"pointer"}}>×</button></div>)}
          <div style={{marginTop:20,display:"flex",gap:10}}>
            <button onClick={()=>setStep(0)} style={{...S.saveBtn,flex:1,background:"#e2e8f0",color:"#374151",boxShadow:"none"}}>← Indietro</button>
            <button onClick={()=>{if(!selectedSistemaForColors && sistemi.length>0) setSelectedSistemaForColors(sistemi[0].id); setStep(2);}} style={{...S.saveBtn,flex:2,background:"linear-gradient(135deg,#ff6b35,#ff3d71)"}}>Avanti →</button>
          </div>
        </>)}
        {step===2 && (<>
          <p style={{fontSize:14,color:"#64748b",marginBottom:12}}>Per ogni materiale, seleziona o aggiungi i colori disponibili:</p>
          {sistemi.length===0 ? <p style={{color:"#ef4444",fontWeight:600}}>Torna indietro e seleziona almeno un materiale</p> : <>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:16}}>
              {sistemi.map((s: any)=><button key={s.id} onClick={()=>setSelectedSistemaForColors(s.id)} style={{...S.pill,padding:"10px 14px",background:selectedSistemaForColors===s.id?"#ff6b35":"#f3f4f6",color:selectedSistemaForColors===s.id?"#fff":"#374151",fontWeight:700,borderRadius:12}}>{s.icon} {s.nome}</button>)}
            </div>
            {selectedSistemaForColors && <>
              <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                {(DEFAULT_COLORI[selectedSistemaForColors]||[]).map((c: string)=><button key={c} onClick={()=>toggleColore(selectedSistemaForColors,c)} style={{...S.pill,padding:"10px 14px",background:(colori[selectedSistemaForColors]||[]).includes(c)?"#059669":"#f3f4f6",color:(colori[selectedSistemaForColors]||[]).includes(c)?"#fff":"#374151",fontWeight:600,borderRadius:10}}>{c}</button>)}
              </div>
              {(colori[selectedSistemaForColors]||[]).filter(c=>!(DEFAULT_COLORI[selectedSistemaForColors]||[]).includes(c)).map(c=><div key={c} style={{display:"inline-flex",alignItems:"center",gap:6,marginTop:6,padding:"6px 12px",background:"#ecfdf5",borderRadius:8,marginRight:6}}><span style={{fontSize:13}}>{c}</span><button onClick={()=>toggleColore(selectedSistemaForColors,c)} style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer"}}>×</button></div>)}
              <div style={{display:"flex",gap:8,marginTop:12}}>
                <input value={customColore} onChange={e=>setCustomColore(e.target.value)} placeholder="Aggiungi colore..." style={{...S.input,flex:1}} onKeyDown={e=>e.key==="Enter"&&addCustomColore(selectedSistemaForColors)} />
                <button onClick={()=>addCustomColore(selectedSistemaForColors)} style={{...S.pill,background:"#059669",color:"#fff",padding:"10px 16px",fontWeight:700}}>+</button>
              </div>
              <button onClick={()=>{const all = DEFAULT_COLORI[selectedSistemaForColors]||[]; setColori({...colori,[selectedSistemaForColors]:all});}} style={{marginTop:8,background:"none",border:"none",color:"#ff6b35",fontSize:13,fontWeight:700,cursor:"pointer"}}>Seleziona tutti i predefiniti</button>
            </>}
          </>}
          <div style={{marginTop:20,display:"flex",gap:10}}>
            <button onClick={()=>setStep(1)} style={{...S.saveBtn,flex:1,background:"#e2e8f0",color:"#374151",boxShadow:"none"}}>← Indietro</button>
            <button onClick={()=>setStep(3)} style={{...S.saveBtn,flex:2,background:"linear-gradient(135deg,#ff6b35,#ff3d71)"}}>Avanti →</button>
          </div>
        </>)}
        {step===3 && (<>
          <p style={{fontSize:14,color:"#64748b",marginBottom:12}}>Seleziona le categorie di prodotti che offri:</p>
          <div style={{display:"flex",flexWrap:"wrap",gap:10}}>
            {DEFAULT_CATEGORIE.map(c=><button key={c.id} onClick={()=>toggleCategoria(c)} style={{...S.pill,padding:"12px 18px",fontSize:14,background:categorie.find((x: any)=>x.id===c.id)?"#8b5cf6":"#f3f4f6",color:categorie.find((x: any)=>x.id===c.id)?"#fff":"#374151",fontWeight:700,borderRadius:14}}>{c.icon} {c.nome}</button>)}
          </div>
          <div style={{display:"flex",gap:8,marginTop:16}}>
            <input value={customCategoria} onChange={e=>setCustomCategoria(e.target.value)} placeholder="Aggiungi categoria..." style={{...S.input,flex:1}} onKeyDown={e=>{if(e.key==="Enter"&&customCategoria.trim()){const id=customCategoria.trim().toLowerCase().replace(/\s+/g,"_");if(!categorie.find((c: any)=>c.id===id)){setCategorie([...categorie,{id,nome:customCategoria.trim(),icon:"📦"}]);}setCustomCategoria("");}}} />
            <button onClick={()=>{if(customCategoria.trim()){const id=customCategoria.trim().toLowerCase().replace(/\s+/g,"_");if(!categorie.find((c: any)=>c.id===id)){setCategorie([...categorie,{id,nome:customCategoria.trim(),icon:"📦"}]);}setCustomCategoria("");}}} style={{...S.pill,background:"#8b5cf6",color:"#fff",padding:"10px 16px",fontWeight:700}}>+</button>
          </div>
          <div style={{marginTop:20,display:"flex",gap:10}}>
            <button onClick={()=>setStep(2)} style={{...S.saveBtn,flex:1,background:"#e2e8f0",color:"#374151",boxShadow:"none"}}>← Indietro</button>
            <button onClick={()=>setStep(4)} style={{...S.saveBtn,flex:2,background:"linear-gradient(135deg,#ff6b35,#ff3d71)"}}>Avanti →</button>
          </div>
        </>)}
        {step===4 && (<>
          <p style={{fontSize:14,color:"#64748b",marginBottom:12}}>Seleziona le tipologie infisso che usi nelle misure:</p>
          <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
            {DEFAULT_TIPOLOGIE.map(t=><button key={t} onClick={()=>toggleTipologia(t)} style={{...S.pill,padding:"10px 14px",background:tipologie.includes(t)?"#2563eb":"#f3f4f6",color:tipologie.includes(t)?"#fff":"#374151",fontWeight:600,borderRadius:10}}>{t}</button>)}
          </div>
          <div style={{display:"flex",gap:8,marginTop:12}}>
            <input value={customTipologia} onChange={e=>setCustomTipologia(e.target.value)} placeholder="Aggiungi tipologia..." style={{...S.input,flex:1}} onKeyDown={e=>e.key==="Enter"&&addCustomTipologia()} />
            <button onClick={addCustomTipologia} style={{...S.pill,background:"#2563eb",color:"#fff",padding:"10px 16px",fontWeight:700}}>+</button>
          </div>
          {tipologie.filter(t=>!DEFAULT_TIPOLOGIE.includes(t)).map(t=><div key={t} style={{display:"inline-flex",alignItems:"center",gap:6,marginTop:6,padding:"6px 12px",background:"#eff6ff",borderRadius:8,marginRight:6}}><span style={{fontSize:13}}>{t}</span><button onClick={()=>setTipologie(tipologie.filter(x=>x!==t))} style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer"}}>×</button></div>)}
          <div style={{marginTop:20,display:"flex",gap:10}}>
            <button onClick={()=>setStep(3)} style={{...S.saveBtn,flex:1,background:"#e2e8f0",color:"#374151",boxShadow:"none"}}>← Indietro</button>
            <button onClick={()=>setStep(5)} style={{...S.saveBtn,flex:2,background:"linear-gradient(135deg,#ff6b35,#ff3d71)"}}>Avanti →</button>
          </div>
        </>)}
        {step===5 && (<>
          <p style={{fontSize:14,color:"#64748b",marginBottom:12}}>Inserisci i dati della tua azienda (appariranno nei documenti):</p>
          <Field label="Nome Azienda" value={azienda.nome} onChange={(v: string)=>setAzienda({...azienda,nome:v})} placeholder="Es. Serramenti Rossi SRL" />
          <Field label="Telefono" value={azienda.telefono} onChange={(v: string)=>setAzienda({...azienda,telefono:v})} placeholder="Numero" type="tel" />
          <Field label="Email" value={azienda.email} onChange={(v: string)=>setAzienda({...azienda,email:v})} placeholder="info@azienda.it" type="email" />
          <Field label="Indirizzo" value={azienda.indirizzo} onChange={(v: string)=>setAzienda({...azienda,indirizzo:v})} placeholder="Via, Città" />
          <Field label="P.IVA" value={azienda.piva} onChange={(v: string)=>setAzienda({...azienda,piva:v})} placeholder="01234567890" />
          <div style={{marginTop:20,display:"flex",gap:10}}>
            <button onClick={()=>setStep(4)} style={{...S.saveBtn,flex:1,background:"#e2e8f0",color:"#374151",boxShadow:"none"}}>← Indietro</button>
            <button onClick={()=>onComplete({sistemi,categorie,colori,tipologie,listino:userSettings.listino||[],azienda})} style={{...S.saveBtn,flex:2,background:"linear-gradient(135deg,#ff6b35,#ff3d71)",fontSize:16}}>✅ Completa Setup</button>
          </div>
        </>)}
      </div>
    </div>
  );
}

// ==================== SETTINGS VIEW ====================
function SettingsView({ userSettings, onSave, onBack }: any) {
  const [tab, setTab] = useState("materiali");
  const [sistemi, setSistemi] = useState<any[]>(userSettings.sistemi?.length > 0 ? userSettings.sistemi : [...DEFAULT_SISTEMI]);
  const [categorie, setCategorie] = useState<any[]>(userSettings.categorie?.length > 0 ? userSettings.categorie : [...DEFAULT_CATEGORIE]);
  const [colori, setColori] = useState<Record<string,string[]>>(userSettings.colori || {...DEFAULT_COLORI});
  const [tipologie, setTipologie] = useState<string[]>(userSettings.tipologie?.length > 0 ? userSettings.tipologie : [...DEFAULT_TIPOLOGIE]);
  const [listino, setListino] = useState<any[]>(userSettings.listino || []);
  const [azienda, setAzienda] = useState(userSettings.azienda || {});
  const [customInput, setCustomInput] = useState("");
  const [selMat, setSelMat] = useState(sistemi[0]?.id || "");
  const [listinoForm, setListinoForm] = useState<any>(null);

  function removeSistema(id: string) { setSistemi(sistemi.filter((s: any) => s.id !== id)); }
  function addSistema() { if(!customInput.trim()) return; const id=customInput.trim().toLowerCase().replace(/\s+/g,"_"); if(!sistemi.find((s: any)=>s.id===id)) setSistemi([...sistemi,{id,nome:customInput.trim(),icon:"🔹"}]); setCustomInput(""); }
  function removeCategoria(id: string) { setCategorie(categorie.filter((c: any) => c.id !== id)); }
  function addCategoria() { if(!customInput.trim()) return; const id=customInput.trim().toLowerCase().replace(/\s+/g,"_"); if(!categorie.find((c: any)=>c.id===id)) setCategorie([...categorie,{id,nome:customInput.trim(),icon:"📦"}]); setCustomInput(""); }
  function addColore(matId: string, col: string) { if(!col.trim()) return; const cur=colori[matId]||[]; if(!cur.includes(col.trim())) setColori({...colori,[matId]:[...cur,col.trim()]}); setCustomInput(""); }
  function removeColore(matId: string, col: string) { setColori({...colori,[matId]:(colori[matId]||[]).filter(c=>c!==col)}); }
  function addTipologia() { if(!customInput.trim()||tipologie.includes(customInput.trim())) return; setTipologie([...tipologie,customInput.trim()]); setCustomInput(""); }
  function removeTipologia(t: string) { setTipologie(tipologie.filter(x=>x!==t)); }
  function addListinoItem() { if(!listinoForm?.descrizione?.trim()) return; setListino([...listino,{...listinoForm,id:gid()}]); setListinoForm(null); }
  function removeListinoItem(id: string) { setListino(listino.filter((l: any)=>l.id!==id)); }

  const tabs = [
    {key:"materiali",label:"Materiali",icon:"🔷"},
    {key:"colori",label:"Colori",icon:"🎨"},
    {key:"tipologie",label:"Tipologie",icon:"📋"},
    {key:"prodotti",label:"Categorie",icon:"🪟"},
    {key:"listino",label:"Listino",icon:"💰"},
    {key:"azienda",label:"Azienda",icon:"🏢"},
  ];

  return (
    <div style={S.container}>
      <div style={{...S.secHdr,background:"linear-gradient(135deg,#475569,#334155)",boxShadow:"0 4px 14px rgba(71,85,105,0.3)"}}>
        <button onClick={()=>onSave({sistemi,categorie,colori,tipologie,listino,azienda,setupCompleted:true})} style={{...S.backBtn,color:"#fff"}}>← Salva</button>
        <h2 style={{...S.secTitle,color:"#fff"}}>⚙️ Impostazioni</h2>
      </div>
      <div style={{display:"flex",gap:4,padding:"12px 12px 0",overflowX:"auto",flexShrink:0}}>
        {tabs.map(t=><button key={t.key} onClick={()=>{setTab(t.key);setCustomInput("");}} style={{padding:"8px 12px",borderRadius:12,border:"none",background:tab===t.key?"#ff6b35":"#f3f4f6",color:tab===t.key?"#fff":"#64748b",fontSize:12,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>{t.icon} {t.label}</button>)}
      </div>
      <div style={{padding:16,flex:1,overflow:"auto"}}>
        {tab==="materiali" && (<>
          <p style={{fontSize:13,color:"#64748b",marginBottom:12}}>I materiali/sistemi che tratti:</p>
          {sistemi.map((s: any)=><div key={s.id} style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",background:"#f8fafc",borderRadius:12,marginBottom:8}}><span style={{fontSize:20}}>{s.icon}</span><span style={{flex:1,fontWeight:700,fontSize:15}}>{s.nome}</span><button onClick={()=>removeSistema(s.id)} style={{background:"none",border:"none",color:"#ef4444",fontSize:20,cursor:"pointer"}}>×</button></div>)}
          <div style={{display:"flex",gap:8,marginTop:12}}><input value={customInput} onChange={e=>setCustomInput(e.target.value)} placeholder="Nuovo materiale..." style={{...S.input,flex:1}} onKeyDown={e=>e.key==="Enter"&&addSistema()} /><button onClick={addSistema} style={{...S.pill,background:"#ff6b35",color:"#fff",padding:"10px 18px",fontWeight:700}}>+</button></div>
        </>)}
        {tab==="colori" && (<>
          <p style={{fontSize:13,color:"#64748b",marginBottom:12}}>Colori per ogni materiale:</p>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14}}>
            {sistemi.map((s: any)=><button key={s.id} onClick={()=>setSelMat(s.id)} style={{...S.pill,padding:"10px 14px",background:selMat===s.id?"#ff6b35":"#f3f4f6",color:selMat===s.id?"#fff":"#374151",fontWeight:700,borderRadius:12}}>{s.icon} {s.nome}</button>)}
          </div>
          {selMat && <>
            {(colori[selMat]||[]).map((c: string)=><div key={c} style={{display:"inline-flex",alignItems:"center",gap:6,padding:"8px 14px",background:"#f0f9ff",borderRadius:10,marginBottom:6,marginRight:6}}><span style={{fontSize:13,fontWeight:600}}>{c}</span><button onClick={()=>removeColore(selMat,c)} style={{background:"none",border:"none",color:"#ef4444",fontSize:16,cursor:"pointer"}}>×</button></div>)}
            <div style={{display:"flex",gap:8,marginTop:8}}><input value={customInput} onChange={e=>setCustomInput(e.target.value)} placeholder="Nuovo colore..." style={{...S.input,flex:1}} onKeyDown={e=>e.key==="Enter"&&addColore(selMat,customInput)} /><button onClick={()=>addColore(selMat,customInput)} style={{...S.pill,background:"#059669",color:"#fff",padding:"10px 18px",fontWeight:700}}>+</button></div>
          </>}
        </>)}
        {tab==="tipologie" && (<>
          <p style={{fontSize:13,color:"#64748b",marginBottom:12}}>Tipologie infisso per le misure:</p>
          {tipologie.map(t=><div key={t} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",background:"#f8fafc",borderRadius:10,marginBottom:6}}><span style={{flex:1,fontSize:14,fontWeight:600}}>{t}</span><button onClick={()=>removeTipologia(t)} style={{background:"none",border:"none",color:"#ef4444",fontSize:18,cursor:"pointer"}}>×</button></div>)}
          <div style={{display:"flex",gap:8,marginTop:10}}><input value={customInput} onChange={e=>setCustomInput(e.target.value)} placeholder="Nuova tipologia..." style={{...S.input,flex:1}} onKeyDown={e=>e.key==="Enter"&&addTipologia()} /><button onClick={addTipologia} style={{...S.pill,background:"#2563eb",color:"#fff",padding:"10px 18px",fontWeight:700}}>+</button></div>
        </>)}
        {tab==="prodotti" && (<>
          <p style={{fontSize:13,color:"#64748b",marginBottom:12}}>Categorie di prodotti che offri:</p>
          {categorie.map((c: any)=><div key={c.id} style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",background:"#f8fafc",borderRadius:12,marginBottom:8}}><span style={{fontSize:20}}>{c.icon}</span><span style={{flex:1,fontWeight:700,fontSize:15}}>{c.nome}</span><button onClick={()=>removeCategoria(c.id)} style={{background:"none",border:"none",color:"#ef4444",fontSize:20,cursor:"pointer"}}>×</button></div>)}
          <div style={{display:"flex",gap:8,marginTop:12}}><input value={customInput} onChange={e=>setCustomInput(e.target.value)} placeholder="Nuova categoria..." style={{...S.input,flex:1}} onKeyDown={e=>e.key==="Enter"&&addCategoria()} /><button onClick={addCategoria} style={{...S.pill,background:"#8b5cf6",color:"#fff",padding:"10px 18px",fontWeight:700}}>+</button></div>
        </>)}
        {tab==="listino" && (<>
          <p style={{fontSize:13,color:"#64748b",marginBottom:12}}>Il tuo listino prezzi (usato nei preventivi):</p>
          {listino.length===0 && <div style={{textAlign:"center",padding:30,color:"#94a3b8"}}><p style={{fontSize:14}}>Nessun articolo nel listino</p></div>}
          {listino.map((l: any)=><div key={l.id} style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",background:"#f8fafc",borderRadius:12,marginBottom:8}}><div style={{flex:1}}><div style={{fontSize:14,fontWeight:700}}>{l.descrizione}</div><div style={{fontSize:12,color:"#64748b"}}>{l.categoria||"—"} · {l.tipo==="mq"?"€/mq":"€/pz"}</div></div><div style={{fontWeight:800,color:"#059669",fontSize:15}}>€{(l.prezzo||0).toFixed(2)}</div><button onClick={()=>removeListinoItem(l.id)} style={{background:"none",border:"none",color:"#ef4444",fontSize:18,cursor:"pointer"}}>×</button></div>)}
          {listinoForm ? (
            <div style={{padding:16,background:"#fffbeb",borderRadius:14,border:"2px solid #f59e0b",marginTop:12}}>
              <Field label="Descrizione" value={listinoForm.descrizione||""} onChange={(v: string)=>setListinoForm({...listinoForm,descrizione:v})} placeholder="Es. Finestra 2 ante PVC" />
              <div style={{display:"flex",gap:8}}>
                <div style={{flex:1}}><label style={S.fLabel}>Prezzo (€)</label><input type="number" value={listinoForm.prezzo||""} onChange={e=>setListinoForm({...listinoForm,prezzo:parseFloat(e.target.value)||0})} style={S.input} placeholder="0.00" /></div>
                <div style={{flex:1}}><label style={S.fLabel}>Tipo</label><select value={listinoForm.tipo||"pezzo"} onChange={e=>setListinoForm({...listinoForm,tipo:e.target.value})} style={S.input}><option value="pezzo">€/pezzo</option><option value="mq">€/mq</option><option value="ml">€/ml</option></select></div>
              </div>
              <div style={{flex:1}}><label style={S.fLabel}>Categoria</label><select value={listinoForm.categoria||""} onChange={e=>setListinoForm({...listinoForm,categoria:e.target.value})} style={S.input}><option value="">—</option>{categorie.map((c: any)=><option key={c.id} value={c.nome}>{c.nome}</option>)}</select></div>
              <div style={{display:"flex",gap:8,marginTop:10}}>
                <button onClick={()=>setListinoForm(null)} style={{...S.saveBtn,flex:1,background:"#e2e8f0",color:"#374151",boxShadow:"none"}}>Annulla</button>
                <button onClick={addListinoItem} disabled={!listinoForm.descrizione?.trim()} style={{...S.saveBtn,flex:2,background:"linear-gradient(135deg,#f59e0b,#d97706)",opacity:listinoForm.descrizione?.trim()?1:0.5}}>💾 Aggiungi</button>
              </div>
            </div>
          ) : <button onClick={()=>setListinoForm({descrizione:"",prezzo:0,tipo:"pezzo",categoria:""})} style={{...S.saveBtn,background:"linear-gradient(135deg,#f59e0b,#d97706)",marginTop:12}}>+ Aggiungi Articolo al Listino</button>}
        </>)}
        {tab==="azienda" && (<>
          <p style={{fontSize:13,color:"#64748b",marginBottom:12}}>Dati aziendali (appaiono nei documenti):</p>
          <Field label="Nome Azienda" value={azienda.nome||""} onChange={(v: string)=>setAzienda({...azienda,nome:v})} placeholder="Serramenti Rossi SRL" />
          <Field label="Telefono" value={azienda.telefono||""} onChange={(v: string)=>setAzienda({...azienda,telefono:v})} placeholder="Numero" type="tel" />
          <Field label="Email" value={azienda.email||""} onChange={(v: string)=>setAzienda({...azienda,email:v})} placeholder="info@azienda.it" type="email" />
          <Field label="Indirizzo" value={azienda.indirizzo||""} onChange={(v: string)=>setAzienda({...azienda,indirizzo:v})} placeholder="Via, Città" />
          <Field label="P.IVA" value={azienda.piva||""} onChange={(v: string)=>setAzienda({...azienda,piva:v})} placeholder="01234567890" />
          <Field label="Codice Fiscale" value={azienda.cf||""} onChange={(v: string)=>setAzienda({...azienda,cf:v})} placeholder="RSSMRA80A01H501U" />
        </>)}
      </div>
      <div style={{padding:"12px 16px 24px",borderTop:"1px solid #e2e8f0"}}>
        <button onClick={()=>onSave({sistemi,categorie,colori,tipologie,listino,azienda,setupCompleted:true})} style={{...S.saveBtn,background:"linear-gradient(135deg,#ff6b35,#ff3d71)",width:"100%"}}>💾 Salva Impostazioni</button>
      </div>
    </div>
  );
}

function BottomNav({ items, active, onNav }: any) {
  return (
    <div style={S.bottomNav}>
      {items.map((it: any) => (
        <button key={it.key} onClick={()=>onNav(it.key)} style={{...S.navItem,color:active===it.key?"#ff6b35":"#94a3b8"}}>
          <span style={{fontSize:22}}>{it.icon}</span>
          <span style={{fontSize:10,fontWeight:active===it.key?700:500}}>{it.label}</span>
        </button>
      ))}
    </div>
  );
}

// ==================== NEW PRATICA ====================
function NewPraticaView({ client, onCreate, onBack }: any) {
  const [ind, setInd] = useState(client?.indirizzo||"");
  const [tipo, setTipo] = useState("nuovo_infisso");
  const [data, setData] = useState(today());
  const [ora, setOra] = useState("09:00");
  const [note, setNote] = useState("");
  return (
    <div style={S.container}>
      <div style={S.secHdr}><button onClick={onBack} style={S.backBtn}>← Indietro</button><h2 style={S.secTitle}>Nuova Pratica</h2></div>
      <div style={{padding:20}}>
        <div style={S.clientBox}><div style={S.clientAvatar}>{client?.nome?.charAt(0)?.toUpperCase()}</div><div><div style={{fontSize:16,fontWeight:700,color:"#0f172a"}}>{client?.nome}</div>{client?.telefono && <div style={{fontSize:13,color:"#64748b"}}>{client.telefono}</div>}</div></div>
        <div style={{marginBottom:16}}>
          <label style={S.fLabel}>Tipo Pratica</label>
          <div style={{display:"flex",gap:10}}>
            <button onClick={()=>setTipo("nuovo_infisso")} style={{flex:1,padding:"16px 12px",borderRadius:16,border:tipo==="nuovo_infisso"?"3px solid #ff6b35":"2px solid #e2e8f0",background:tipo==="nuovo_infisso"?"#fff7ed":"#fff",cursor:"pointer",textAlign:"center"}}>
              <div style={{fontSize:28}}>🪟</div>
              <div style={{fontSize:14,fontWeight:800,color:tipo==="nuovo_infisso"?"#ff6b35":"#374151",marginTop:4}}>Nuovo Infisso</div>
              <div style={{fontSize:11,color:"#64748b",marginTop:2}}>Sopralluogo → Misure → Preventivo → Conferma → Fattura → Posa</div>
            </button>
            <button onClick={()=>setTipo("riparazione")} style={{flex:1,padding:"16px 12px",borderRadius:16,border:tipo==="riparazione"?"3px solid #dc2626":"2px solid #e2e8f0",background:tipo==="riparazione"?"#fef2f2":"#fff",cursor:"pointer",textAlign:"center"}}>
              <div style={{fontSize:28}}>🛠️</div>
              <div style={{fontSize:14,fontWeight:800,color:tipo==="riparazione"?"#dc2626":"#374151",marginTop:4}}>Riparazione</div>
              <div style={{fontSize:11,color:"#64748b",marginTop:2}}>Sopralluogo → Riparazione → Fattura</div>
            </button>
          </div>
        </div>
        <Field label="Indirizzo Cantiere" value={ind} onChange={setInd} placeholder="Via, numero, città" />
        <div style={{display:"flex",gap:12}}><Field label="Data" value={data} onChange={setData} type="date" style={{flex:1}} /><Field label="Ora" value={ora} onChange={setOra} type="time" style={{flex:1}} /></div>
        <Field label="Note" value={note} onChange={setNote} placeholder="Note pratica..." textarea />
        <div style={S.infoNote}>ℹ️ La pratica inizierà dalla fase Sopralluogo.</div>
        <button onClick={()=>onCreate(ind,tipo,data,ora,note)} style={{...S.saveBtn,background:tipo==="riparazione"?"linear-gradient(135deg,#ef4444,#dc2626)":"linear-gradient(135deg,#ff6b35,#ff3d71)"}}>Crea Pratica →</button>
      </div>
    </div>
  );
}

// ==================== SIGNATURE PAD ====================
function SignaturePad({ onSave, onCancel }: any) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  const getPos = (e: any) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches ? e.touches[0] : e;
    return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
  };

  const startDraw = (e: any) => {
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    setDrawing(true);
  };

  const draw = (e: any) => {
    e.preventDefault();
    if (!drawing) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    setHasDrawn(true);
  };

  const stopDraw = () => setDrawing(false);

  const clear = () => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx || !canvasRef.current) return;
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    setHasDrawn(false);
  };

  const save = () => {
    if (!canvasRef.current || !hasDrawn) return;
    onSave(canvasRef.current.toDataURL("image/png"));
  };

  return (
    <div style={{background:"#fff",borderRadius:18,padding:16,boxShadow:"0 4px 20px rgba(0,0,0,0.1)"}}>
      <h3 style={{fontSize:16,fontWeight:900,color:"#1e293b",margin:"0 0 12px"}}>✍️ Firma del Cliente</h3>
      <p style={{fontSize:13,color:"#64748b",margin:"0 0 12px"}}>Chiedi al cliente di firmare qui sotto con il dito o lo stilo</p>
      <canvas ref={canvasRef} width={460} height={180}
        onMouseDown={startDraw} onMouseMove={draw} onMouseUp={stopDraw} onMouseLeave={stopDraw}
        onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={stopDraw}
        style={{width:"100%",height:180,border:"2.5px dashed #cbd5e1",borderRadius:14,background:"#fafafa",touchAction:"none",cursor:"crosshair"}}
      />
      <div style={{display:"flex",gap:8,marginTop:12}}>
        <button onClick={clear} style={{flex:1,padding:"10px",borderRadius:12,border:"2px solid #94a3b8",background:"#fff",color:"#64748b",fontSize:13,fontWeight:800,cursor:"pointer"}}>🗑️ Cancella</button>
        <button onClick={onCancel} style={{flex:1,padding:"10px",borderRadius:12,border:"2px solid #ef4444",background:"#fff",color:"#ef4444",fontSize:13,fontWeight:800,cursor:"pointer"}}>✕ Annulla</button>
        <button onClick={save} disabled={!hasDrawn} style={{flex:2,padding:"10px",borderRadius:12,border:"none",background:hasDrawn?"linear-gradient(135deg,#059669,#0d9488)":"#e2e8f0",color:hasDrawn?"#fff":"#94a3b8",fontSize:13,fontWeight:800,cursor:hasDrawn?"pointer":"default"}}>✅ Conferma Firma</button>
      </div>
    </div>
  );
}

// ==================== PRATICA DETAIL ====================
function PraticaDetail({ pratica: p, client: c, onBack, onDelete, onAddAction, onToggleTask, onOpenMisure, onOpenRip, onOpenPrev, onOpenEmail, onStatusChange, onConfirmOrder, onGenerateFattura, onUpdateFattura, onAdvancePhase }: any) {
  const sc = STATUS[p.status];
  const totalT = p.actions.reduce((s: number,a: any)=>s+a.tasks.length,0);
  const doneT = p.actions.reduce((s: number,a: any)=>s+a.tasks.filter((t: any)=>t.done).length,0);
  const prog = totalT?Math.round(doneT/totalT*100):0;
  const [showSignPad, setShowSignPad] = useState(false);
  const [orderNote, setOrderNote] = useState("");
  const [showPaymentEdit, setShowPaymentEdit] = useState(false);
  const [payForm, setPayForm] = useState<any>({});

  const hasPreventivo = !!p.preventivo;
  const hasConferma = !!p.confermaOrdine?.firmata;
  const hasFattura = !!p.fattura;

  return (
    <div style={S.container}>
      <div style={S.detailHdr}><button onClick={onBack} style={S.backBtn}>← Indietro</button><div style={{display:"flex",gap:8}}><button onClick={onOpenEmail} style={S.emailBtn}>✉️</button><button onClick={onDelete} style={S.delBtn}>🗑️</button></div></div>
      <div style={{padding:20}}>
        <div style={S.praticaHdrCard}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}><span style={S.praticaNumBig}>{p.numero}</span><span style={{...S.statusBdg,background:sc.bg,color:sc.color,border:`1.5px solid ${sc.color}`}}>{sc.label}</span></div>
          <h2 style={S.detailName}>{c?.nome||"—"}</h2>
          <div style={S.detailInfo}>
            <InfoRow icon="📅" val={<>{dateLabel(p.data)} alle {p.ora}{p.data===today()&&<span style={S.todayChip}>OGGI</span>}</>} />
            {p.indirizzo && <InfoRow icon="📍" val={p.indirizzo} />}
            {c?.telefono && <InfoRow icon="📞" val={<a href={`tel:${c.telefono}`} style={{color:"#ff6b35",textDecoration:"none",fontWeight:600}}>{c.telefono}</a>} />}
            {c?.email && <InfoRow icon="✉️" val={c.email} />}
            {p.note && <InfoRow icon="📝" val={p.note} />}
          </div>
        </div>

        {/* ===== WORKFLOW STEPPER ===== */}
        {(() => {
          const wf = getWorkflow(p.tipo);
          const curIdx = getPhaseIndex(p.tipo, p.fase || "sopralluogo");
          const canAdv = canAdvance(p);
          const isComplete = curIdx >= wf.length - 1 && canAdv;
          return (
            <div style={{background:"linear-gradient(135deg,#1e293b,#334155)",borderRadius:18,padding:18,marginBottom:18,color:"#fff"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                <h3 style={{fontSize:16,fontWeight:900,margin:0,letterSpacing:"-0.3px"}}>{p.tipo==="riparazione"?"🛠️ Riparazione":"🪟 Nuovo Infisso"}</h3>
                {isComplete && <span style={{background:"#059669",padding:"4px 12px",borderRadius:20,fontSize:12,fontWeight:800}}>✅ COMPLETATO</span>}
              </div>
              <div style={{display:"flex",gap:2,marginBottom:16}}>
                {wf.map((phase: any,i: number) => {
                  const isDone = i < curIdx || (i === curIdx && canAdv);
                  const isCurrent = i === curIdx;
                  return (
                    <div key={phase.key} style={{flex:1,textAlign:"center"}}>
                      <div style={{width:38,height:38,borderRadius:"50%",background:isDone?"#059669":isCurrent?phase.color:"rgba(255,255,255,0.1)",margin:"0 auto 4px",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,border:isCurrent?"3px solid "+phase.color:"3px solid transparent",transition:"all 0.3s",boxShadow:isCurrent?"0 0 12px "+phase.color+"40":"none"}}>{isDone?"✅":phase.icon}</div>
                      <div style={{fontSize:9,fontWeight:800,color:isCurrent?"#fff":isDone?"#4ade80":"rgba(255,255,255,0.4)",textTransform:"uppercase",letterSpacing:"0.3px"}}>{phase.label}</div>
                    </div>
                  );
                })}
              </div>
              {!isComplete && (
                <div style={{background:"rgba(255,255,255,0.08)",borderRadius:14,padding:14}}>
                  <div style={{fontSize:15,fontWeight:800,marginBottom:8}}>{wf[curIdx]?.icon} Fase: {wf[curIdx]?.label}</div>
                  {p.fase==="sopralluogo" && (() => { const act=p.actions?.find((a: any)=>a.type==="sopralluogo"); if(!act) return null; const dn=act.tasks.filter((t: any)=>t.done).length; return (<><ProgressBar progress={act.tasks.length?Math.round(dn/act.tasks.length*100):0} done={dn} total={act.tasks.length} small />{act.tasks.map((t: any)=><TaskRow key={t.id} task={t} onToggle={()=>onToggleTask(act.id,t.id)} small />)}</>); })()}
                  {p.fase==="misure" && (<div>{p.misure?(<div style={{background:"rgba(5,150,105,0.2)",borderRadius:10,padding:12,marginBottom:8}}><div style={{fontSize:13,fontWeight:700,color:"#4ade80"}}>✅ Misure compilate</div><div style={{fontSize:12,color:"rgba(255,255,255,0.7)",marginTop:4}}>Vani: {p.misure.vani?.length||0}</div></div>):<p style={{fontSize:13,color:"rgba(255,255,255,0.7)",margin:"0 0 8px"}}>Compila la scheda misure.</p>}<button onClick={onOpenMisure} style={{width:"100%",padding:"12px",borderRadius:12,border:"none",background:"linear-gradient(135deg,#f59e0b,#d97706)",color:"#fff",fontSize:14,fontWeight:800,cursor:"pointer"}}>📐 {p.misure?"Modifica":"Compila"} Misure</button></div>)}
                  {p.fase==="preventivo" && (<div>{p.preventivo?(<div style={{background:"rgba(5,150,105,0.2)",borderRadius:10,padding:12,marginBottom:8}}><div style={{fontSize:13,fontWeight:700,color:"#4ade80"}}>✅ Preventivo compilato</div><div style={{fontSize:12,color:"rgba(255,255,255,0.7)",marginTop:4}}>Totale: € {(p.preventivo.totaleFinale||0).toFixed(2)}</div></div>):<p style={{fontSize:13,color:"rgba(255,255,255,0.7)",margin:"0 0 8px"}}>Prepara il preventivo.</p>}<button onClick={onOpenPrev} style={{width:"100%",padding:"12px",borderRadius:12,border:"none",background:"linear-gradient(135deg,#a855f7,#8b5cf6)",color:"#fff",fontSize:14,fontWeight:800,cursor:"pointer"}}>💰 {p.preventivo?"Modifica":"Compila"} Preventivo</button></div>)}
                  {p.fase==="conferma" && (<div>{p.confermaOrdine?.firmata?(<div style={{background:"rgba(5,150,105,0.2)",borderRadius:10,padding:12}}><div style={{fontSize:13,fontWeight:700,color:"#4ade80"}}>✅ Ordine confermato</div>{p.confermaOrdine.firmaImg&&<img src={p.confermaOrdine.firmaImg} alt="Firma" style={{height:40,borderRadius:6,background:"#fff",padding:3,marginTop:6}} />}</div>):(<><p style={{fontSize:13,color:"rgba(255,255,255,0.7)",margin:"0 0 8px"}}>Raccogli la firma del cliente.</p><div style={{marginBottom:10}}><input value={orderNote} onChange={(e: any)=>setOrderNote(e.target.value)} placeholder="Note ordine..." style={{width:"100%",padding:"10px 14px",borderRadius:12,border:"1.5px solid rgba(255,255,255,0.2)",background:"rgba(255,255,255,0.1)",color:"#fff",fontSize:14,outline:"none",boxSizing:"border-box"}} /></div>{!showSignPad?<button onClick={()=>setShowSignPad(true)} style={{width:"100%",padding:"14px",borderRadius:14,border:"none",background:"linear-gradient(135deg,#059669,#0d9488)",color:"#fff",fontSize:15,fontWeight:800,cursor:"pointer"}}>✍️ Firma Conferma</button>:<SignaturePad onSave={(img: string)=>{onConfirmOrder(img,orderNote);setShowSignPad(false);}} onCancel={()=>setShowSignPad(false)} />}</>)}</div>)}
                  {p.fase==="riparazione" && (<div>{p.riparazione?(<div style={{background:"rgba(5,150,105,0.2)",borderRadius:10,padding:12,marginBottom:8}}><div style={{fontSize:13,fontWeight:700,color:"#4ade80"}}>✅ Riparazione compilata</div><div style={{fontSize:12,color:"rgba(255,255,255,0.7)",marginTop:4}}>{p.riparazione.problema||"—"}</div></div>):<p style={{fontSize:13,color:"rgba(255,255,255,0.7)",margin:"0 0 8px"}}>Compila la scheda riparazione.</p>}<button onClick={onOpenRip} style={{width:"100%",padding:"12px",borderRadius:12,border:"none",background:"linear-gradient(135deg,#ef4444,#dc2626)",color:"#fff",fontSize:14,fontWeight:800,cursor:"pointer"}}>🛠️ {p.riparazione?"Modifica":"Compila"} Riparazione</button></div>)}
                  {p.fase==="fattura" && (<div>{p.fattura?(<div style={{background:"rgba(5,150,105,0.2)",borderRadius:10,padding:12}}><div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:13,fontWeight:700,color:"#4ade80"}}>✅ Fattura {p.fattura.numero}</span><span style={{fontSize:11,padding:"2px 8px",borderRadius:8,background:p.fattura.statoPagamento==="pagato"?"#059669":p.fattura.statoPagamento==="acconto"?"#d97706":"#ef4444",fontWeight:700}}>{p.fattura.statoPagamento==="pagato"?"Pagata":p.fattura.statoPagamento==="acconto"?"Acconto":"Non Pagata"}</span></div><div style={{fontSize:20,fontWeight:900,color:"#4ade80",marginTop:6}}>€ {(p.preventivo?.totaleFinale||p.riparazione?.costoStimato||0).toFixed?.(2)||"0.00"}</div><div style={{display:"flex",gap:8,marginTop:10}}><button onClick={()=>exportFattura(p,c)} style={{flex:1,padding:"10px",borderRadius:12,border:"1.5px solid rgba(255,255,255,0.3)",background:"transparent",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer"}}>📄 PDF</button><button onClick={()=>{setPayForm({stato:p.fattura.statoPagamento,acconto:p.fattura.acconto||0,metodo:p.fattura.metodoPagamento||""});setShowPaymentEdit(true);}} style={{flex:1,padding:"10px",borderRadius:12,border:"none",background:"linear-gradient(135deg,#fbbf24,#f59e0b)",color:"#1e293b",fontSize:12,fontWeight:800,cursor:"pointer"}}>💰 Pagamento</button></div>{showPaymentEdit&&(<div style={{background:"rgba(255,255,255,0.1)",borderRadius:14,padding:14,marginTop:10}}><div style={{display:"flex",gap:6,marginBottom:12}}>{[{k:"non_pagato",l:"❌ Non Pagata",c:"#ef4444"},{k:"acconto",l:"⏳ Acconto",c:"#d97706"},{k:"pagato",l:"✅ Pagata",c:"#059669"}].map(s=><button key={s.k} onClick={()=>setPayForm({...payForm,stato:s.k})} style={{flex:1,padding:"10px 4px",borderRadius:12,border:"none",fontSize:11,fontWeight:800,cursor:"pointer",background:payForm.stato===s.k?s.c:"rgba(255,255,255,0.1)",color:payForm.stato===s.k?"#fff":"rgba(255,255,255,0.7)"}}>{s.l}</button>)}</div>{payForm.stato==="acconto"&&<div style={{marginBottom:10}}><input type="number" value={payForm.acconto} onChange={(e: any)=>setPayForm({...payForm,acconto:parseFloat(e.target.value)||0})} style={{width:"100%",padding:"10px",borderRadius:12,border:"1.5px solid rgba(255,255,255,0.2)",background:"rgba(255,255,255,0.1)",color:"#fff",fontSize:16,fontWeight:800,outline:"none",boxSizing:"border-box"}} /></div>}<div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>{["Bonifico","Contanti","Assegno","Carta","Ri.Ba."].map(m=><button key={m} onClick={()=>setPayForm({...payForm,metodo:m})} style={{padding:"8px 14px",borderRadius:10,border:"none",fontSize:12,fontWeight:700,cursor:"pointer",background:payForm.metodo===m?"#ff6b35":"rgba(255,255,255,0.1)",color:payForm.metodo===m?"#fff":"rgba(255,255,255,0.7)"}}>{m}</button>)}</div><div style={{display:"flex",gap:8}}><button onClick={()=>setShowPaymentEdit(false)} style={{flex:1,padding:"10px",borderRadius:12,border:"1.5px solid rgba(255,255,255,0.3)",background:"transparent",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer"}}>Annulla</button><button onClick={()=>{onUpdateFattura({statoPagamento:payForm.stato,acconto:payForm.acconto,metodoPagamento:payForm.metodo});setShowPaymentEdit(false);}} style={{flex:2,padding:"10px",borderRadius:12,border:"none",background:"linear-gradient(135deg,#059669,#0d9488)",color:"#fff",fontSize:12,fontWeight:800,cursor:"pointer"}}>💾 Salva</button></div></div>)}</div>):(<><p style={{fontSize:13,color:"rgba(255,255,255,0.7)",margin:"0 0 8px"}}>Genera la fattura.</p><button onClick={onGenerateFattura} style={{width:"100%",padding:"14px",borderRadius:14,border:"none",background:"linear-gradient(135deg,#fbbf24,#f59e0b)",color:"#1e293b",fontSize:15,fontWeight:800,cursor:"pointer"}}>🧾 Genera Fattura</button></>)}</div>)}
                  {p.fase==="posa" && (() => { const act=p.actions?.find((a: any)=>a.type==="posa"); if(!act) return null; const dn=act.tasks.filter((t: any)=>t.done).length; return (<><ProgressBar progress={act.tasks.length?Math.round(dn/act.tasks.length*100):0} done={dn} total={act.tasks.length} small />{act.tasks.map((t: any)=><TaskRow key={t.id} task={t} onToggle={()=>onToggleTask(act.id,t.id)} small />)}</>); })()}
                  {canAdv && curIdx < wf.length-1 && <button onClick={onAdvancePhase} style={{width:"100%",marginTop:14,padding:"14px",borderRadius:14,border:"none",background:"linear-gradient(135deg,#059669,#0d9488)",color:"#fff",fontSize:15,fontWeight:800,cursor:"pointer",boxShadow:"0 4px 14px rgba(5,150,105,0.4)"}}>✅ Avanza a: {wf[curIdx+1].icon} {wf[curIdx+1].label} →</button>}
                  {!canAdv && <div style={{marginTop:10,padding:"10px 14px",background:"rgba(255,255,255,0.05)",borderRadius:10,fontSize:12,color:"rgba(255,255,255,0.5)",textAlign:"center",fontWeight:600}}>🔒 Completa questa fase per avanzare</div>}
                </div>
              )}
            </div>
          );
        })()}

        <div style={S.statusChanger}><span style={S.statusLbl}>Stato:</span><div style={{display:"flex",gap:6,flex:1}}>{Object.entries(STATUS).map(([k,v])=><button key={k} onClick={()=>onStatusChange(k)} style={{...S.statusTgl,background:p.status===k?v.color:"transparent",color:p.status===k?"#fff":v.color,border:"2px solid "+v.color}}>{v.label}</button>)}</div></div>

        {p.misure && <div style={S.dataSummary}><h4 style={S.dataSumTitle}>📐 Misure</h4><p style={S.dataSumLine}>Vani: {p.misure.vani?.length||0}</p><button onClick={onOpenMisure} style={{...S.openFormBtn,marginTop:6}}>Apri →</button></div>}
        {p.riparazione && <div style={{...S.dataSummary,borderLeftColor:"#dc2626"}}><h4 style={{...S.dataSumTitle,color:"#dc2626"}}>🛠️ Riparazione</h4><p style={S.dataSumLine}>{p.riparazione.problema||"—"}</p><button onClick={onOpenRip} style={{...S.openFormBtn,marginTop:6,background:"#fef2f2",color:"#dc2626"}}>Apri →</button></div>}
        {p.preventivo && <div style={{...S.dataSummary,borderLeftColor:"#8b5cf6"}}><h4 style={{...S.dataSumTitle,color:"#8b5cf6"}}>💰 Preventivo</h4><p style={S.dataSumLine}>€ {(p.preventivo.totaleFinale||0).toFixed(2)}</p><button onClick={onOpenPrev} style={{...S.openFormBtn,marginTop:6,background:"#f5f3ff",color:"#8b5cf6"}}>Apri →</button></div>}
        {(p.emails||[]).length>0 && <div style={{marginTop:16}}><h3 style={S.sectionTitle}>✉️ Email ({p.emails.length})</h3>{p.emails.map((e: any)=><div key={e.id} style={S.emailCard}><div style={{fontSize:13,fontWeight:600,color:"#0f172a"}}>{e.oggetto}</div><div style={{fontSize:12,color:"#64748b"}}>A: {e.destinatario} · {new Date(e.sentAt).toLocaleString("it-IT")}</div></div>)}</div>}
        <button onClick={onOpenEmail} style={S.sendEmailBtn}>✉️ Invia Email</button>
        <div style={{marginTop:16,padding:14,background:"#f8fafc",borderRadius:12,border:"1px solid #e2e8f0"}}>
          <h4 style={{fontSize:14,fontWeight:700,color:"#0f172a",margin:"0 0 10px"}}>🖨️ Esporta / Stampa</h4>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <button onClick={()=>exportPratica(p,c)} style={S.exportBtn}>📋 Riepilogo</button>
            {p.misure && <button onClick={()=>exportMisure(p,c)} style={{...S.exportBtn,background:"#fffbeb",color:"#d97706",border:"1.5px solid #d97706"}}>📐 Misure</button>}
            {p.riparazione && <button onClick={()=>exportRiparazione(p,c)} style={{...S.exportBtn,background:"#fef2f2",color:"#dc2626",border:"1.5px solid #dc2626"}}>🛠️ Riparazione</button>}
            {p.preventivo && <button onClick={()=>exportPreventivo(p,c,true)} style={{...S.exportBtn,background:"#f5f3ff",color:"#8b5cf6",border:"1.5px solid #8b5cf6"}}>💰 Preventivo</button>}
            {hasConferma && <button onClick={()=>exportConfermaOrdine(p,c)} style={{...S.exportBtn,background:"#ecfdf5",color:"#059669",border:"1.5px solid #059669"}}>✅ Conferma</button>}
            {hasFattura && <button onClick={()=>exportFattura(p,c)} style={{...S.exportBtn,background:"#fffbeb",color:"#d97706",border:"1.5px solid #d97706"}}>🧾 Fattura</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ==================== MISURE FORM ====================
function MisureForm({ pratica, client, sistemi, tipologie, coloriMap, allColori, onSave, onBack }: any) {
  const m = pratica?.misure;
  const [cantiere, setCantiere] = useState(m?.cantiere||client?.nome||"");
  const [indirizzo, setIndirizzo] = useState(m?.indirizzo||pratica?.indirizzo||"");
  const [sistema, setSistema] = useState(m?.sistema||"");
  const [materialeId, setMaterialeId] = useState(m?.materialeId||"");
  const [coloreInt, setColoreInt] = useState(m?.coloreInt||"Bianco");
  const [coloreEst, setColoreEst] = useState(m?.coloreEst||"Bianco");
  const [piano, setPiano] = useState(m?.piano||"");
  const [noteGen, setNoteGen] = useState(m?.noteGen||"");
  const [vani, setVani] = useState(m?.vani||[makeVano()]);
  const coloriPerMat = materialeId && coloriMap[materialeId] ? coloriMap[materialeId] : allColori || [];
  function makeVano() { return {id:gid(),ambiente:"",l:"",h:"",q:"1",apertura:"DX",sistema:"",note:"",photos:{}}; }
  function uv(i: number,f: string,v: any) { const n=[...vani]; n[i]={...n[i],[f]:v}; setVani(n); }
  const useTipologie = tipologie?.length > 0 ? tipologie : SISTEMI;
  return (
    <div style={S.container}>
      <div style={{...S.secHdr,background:"linear-gradient(135deg,#f59e0b,#d97706)",boxShadow:"0 4px 14px rgba(245,158,11,0.3)"}}><button onClick={onBack} style={{...S.backBtn,color:"#fff"}}>← Indietro</button><h2 style={{...S.secTitle,color:"#fff"}}>📐 Scheda Misure</h2></div>
      <div style={{padding:20}}>
        <div style={S.praticaRef}>{pratica?.numero} · {client?.nome}</div>
        <Field label="Cantiere" value={cantiere} onChange={setCantiere} placeholder="Rif. cantiere" />
        <Field label="Indirizzo" value={indirizzo} onChange={setIndirizzo} placeholder="Indirizzo" />
        <div style={{display:"flex",gap:12}}>
          <div style={{flex:1}}><label style={S.fLabel}>Materiale</label><select value={materialeId} onChange={(e: any)=>setMaterialeId(e.target.value)} style={S.input}><option value="">— Seleziona —</option>{(sistemi||DEFAULT_SISTEMI).map((s: any)=><option key={s.id} value={s.id}>{s.icon} {s.nome}</option>)}</select></div>
          <div style={{flex:1}}><label style={S.fLabel}>Piano</label><select value={piano} onChange={(e: any)=>setPiano(e.target.value)} style={S.input}><option value="">—</option>{["Terra","1°","2°","3°","4°","5°"].map(p=><option key={p}>{p}</option>)}</select></div>
        </div>
        <div style={{display:"flex",gap:12}}>
          <div style={{flex:1}}><label style={S.fLabel}>Colore Int.</label><select value={coloreInt} onChange={(e: any)=>setColoreInt(e.target.value)} style={S.input}><option value="">—</option>{coloriPerMat.map((c: string)=><option key={c}>{c}</option>)}<option value="__custom">+ Personalizzato</option></select>{coloreInt==="__custom"&&<input value="" onChange={(e: any)=>setColoreInt(e.target.value)} placeholder="Inserisci colore..." style={{...S.input,marginTop:4}} autoFocus />}</div>
          <div style={{flex:1}}><label style={S.fLabel}>Colore Est.</label><select value={coloreEst} onChange={(e: any)=>setColoreEst(e.target.value)} style={S.input}><option value="">—</option>{coloriPerMat.map((c: string)=><option key={c}>{c}</option>)}<option value="__custom">+ Personalizzato</option></select>{coloreEst==="__custom"&&<input value="" onChange={(e: any)=>setColoreEst(e.target.value)} placeholder="Inserisci colore..." style={{...S.input,marginTop:4}} autoFocus />}</div>
        </div>
        <h3 style={{...S.sectionTitle,marginTop:20}}>Vani ({vani.length})</h3>
        {vani.map((v: any,i: number)=>(
          <div key={v.id} style={S.vanoCard}>
            <div style={S.vanoHdr}><span style={S.vanoNum}>{i+1}</span><span style={{fontSize:15,fontWeight:700,flex:1}}>Vano {i+1}</span>{vani.length>1 && <button onClick={()=>setVani(vani.filter((_: any,j: number)=>j!==i))} style={S.vanoRm}>×</button>}</div>
            <Field label="Ambiente" value={v.ambiente} onChange={(val: string)=>uv(i,"ambiente",val)} placeholder="Soggiorno, Camera..." />
            <div style={{flex:1,marginBottom:8}}><label style={S.fLabel}>Tipologia</label><select value={v.sistema||sistema} onChange={(e: any)=>uv(i,"sistema",e.target.value)} style={S.input}><option value="">—</option>{useTipologie.map((s: string)=><option key={s}>{s}</option>)}</select></div>
            <div style={{display:"flex",gap:8}}><Field label="L (mm)" value={v.l} onChange={(val: string)=>uv(i,"l",val)} type="number" placeholder="Larg." style={{flex:1}} /><Field label="H (mm)" value={v.h} onChange={(val: string)=>uv(i,"h",val)} type="number" placeholder="Alt." style={{flex:1}} /><Field label="Q" value={v.q} onChange={(val: string)=>uv(i,"q",val)} type="number" style={{flex:"0 0 60px"}} /></div>
            <div style={S.fGroup}><label style={S.fLabel}>Apertura</label><div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{APERTURE.map(a=><button key={a} onClick={()=>uv(i,"apertura",a)} style={{...S.pill,background:v.apertura===a?"#d97706":"#f3f4f6",color:v.apertura===a?"#fff":"#6b7280"}}>{a}</button>)}</div></div>
            <div style={S.fGroup}><label style={S.fLabel}>Foto</label><div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{PHOTO_TYPES.map(p=><div key={p.k} style={{...S.photoPH,background:v.photos[p.k]?"#ecfdf5":"#f8fafc",borderColor:v.photos[p.k]?"#059669":"#d1d5db"}}><span style={{fontSize:14}}>{p.i}</span><span style={{fontSize:9,fontWeight:600,color:"#64748b"}}>{p.l}</span></div>)}</div></div>
            <Field label="Note" value={v.note} onChange={(val: string)=>uv(i,"note",val)} placeholder="Note vano..." />
          </div>
        ))}
        <button onClick={()=>setVani([...vani,makeVano()])} style={S.addVanoBtn}>+ Aggiungi Vano</button>
        <Field label="Note Generali" value={noteGen} onChange={setNoteGen} placeholder="Note generali..." textarea />
        <button onClick={()=>onSave({cantiere,indirizzo,sistema,materialeId,coloreInt,coloreEst,piano,noteGen,vani})} style={{...S.saveBtn,background:"linear-gradient(135deg,#f59e0b,#d97706)",boxShadow:"0 4px 14px rgba(245,158,11,0.3)"}}>💾 Salva Misure</button>
        {pratica?.misure && <button onClick={()=>exportMisure(pratica,client)} style={{...S.saveBtn,background:"#fff",color:"#d97706",border:"2px solid #d97706",boxShadow:"none",marginTop:8}}>🖨️ Stampa / PDF Misure</button>}
      </div>
    </div>
  );
}

// ==================== RIPARAZIONE ====================
function RipForm({ pratica, client, onSave, onBack }: any) {
  const r = pratica?.riparazione;
  const [problema, setProblema] = useState(r?.problema||"");
  const [descrizione, setDescrizione] = useState(r?.descrizione||"");
  const [urgenza, setUrgenza] = useState(r?.urgenza||"media");
  const [tipoInfisso, setTipoInfisso] = useState(r?.tipoInfisso||"");
  const [materiale, setMateriale] = useState(r?.materiale||"");
  const [ricambi, setRicambi] = useState(r?.ricambi||"");
  const [costoStimato, setCostoStimato] = useState(r?.costoStimato||"");
  const [noteRip, setNoteRip] = useState(r?.noteRip||"");
  return (
    <div style={S.container}>
      <div style={{...S.secHdr,background:"linear-gradient(135deg,#ef4444,#dc2626)",boxShadow:"0 4px 14px rgba(239,68,68,0.3)"}}><button onClick={onBack} style={{...S.backBtn,color:"#fff"}}>← Indietro</button><h2 style={{...S.secTitle,color:"#fff"}}>🛠️ Scheda Riparazione</h2></div>
      <div style={{padding:20}}>
        <div style={{...S.praticaRef,borderLeftColor:"#dc2626"}}>{pratica?.numero} · {client?.nome}</div>
        <div style={S.fGroup}><label style={S.fLabel}>Urgenza</label><div style={{display:"flex",gap:8}}>{URGENZE.map(u=><button key={u.k} onClick={()=>setUrgenza(u.k)} style={{...S.urgBtn,background:urgenza===u.k?u.c:"#f3f4f6",color:urgenza===u.k?"#fff":"#6b7280"}}>{u.i} {u.l}</button>)}</div></div>
        <div style={S.fGroup}><label style={S.fLabel}>Tipo Problema</label><div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{PROBLEMI.map(p=><button key={p} onClick={()=>setProblema(p)} style={{...S.pill,background:problema===p?"#dc2626":"#f3f4f6",color:problema===p?"#fff":"#6b7280"}}>{p}</button>)}</div></div>
        <Field label="Descrizione" value={descrizione} onChange={setDescrizione} placeholder="Dettagli problema..." textarea rows={4} />
        <Field label="Tipo Infisso" value={tipoInfisso} onChange={setTipoInfisso} placeholder="es. Finestra 2 ante PVC" />
        <Field label="Materiale" value={materiale} onChange={setMateriale} placeholder="PVC, Alluminio, Legno..." />
        <Field label="Ricambi" value={ricambi} onChange={setRicambi} placeholder="Pezzi necessari..." textarea />
        <Field label="Costo Stimato (€)" value={costoStimato} onChange={setCostoStimato} type="number" placeholder="0.00" />
        <Field label="Note" value={noteRip} onChange={setNoteRip} placeholder="Altre note..." textarea />
        <button onClick={()=>onSave({problema,descrizione,urgenza,tipoInfisso,materiale,ricambi,costoStimato,noteRip})} style={{...S.saveBtn,background:"linear-gradient(135deg,#ef4444,#dc2626)",boxShadow:"0 4px 14px rgba(239,68,68,0.3)"}}>💾 Salva Riparazione</button>
        {pratica?.riparazione && <button onClick={()=>exportRiparazione(pratica,client)} style={{...S.saveBtn,background:"#fff",color:"#dc2626",border:"2px solid #dc2626",boxShadow:"none",marginTop:8}}>🖨️ Stampa / PDF Riparazione</button>}
      </div>
    </div>
  );
}

// ==================== PREVENTIVO FORM ====================
function PreventivoForm({ pratica, client, userListino, userCategorie, userSistemi, onSave, onBack }: any) {
  const prev = pratica?.preventivo;
  const m = pratica?.misure;
  
  const [prodotti, setProdotti] = useState<any[]>(prev?.prodotti || []);
  const [sconto, setSconto] = useState(prev?.sconto || 0);
  const [iva, setIva] = useState(prev?.iva || 22);
  const [condizioni, setCondizioni] = useState(prev?.condizioni || "Preventivo valido 30 giorni. Prezzi IVA esclusa. Tempi di consegna: 4-6 settimane dall'ordine. Posa in opera inclusa salvo diversa indicazione.");
  const [validita, setValidita] = useState(prev?.validita || "30");
  const [noteP, setNoteP] = useState(prev?.noteP || "");
  const [listino, setListino] = useState<any[]>(prev?.listino || userListino || []);
  const [showListino, setShowListino] = useState(false);
  const [showImport, setShowImport] = useState(false);

  // Import vani da misure
  function importDaMisure() {
    if (!m?.vani?.length) { alert("Nessuna misura salvata per questa pratica"); return; }
    const nuovi = m.vani.map((v: any) => {
      const lm = parseFloat(v.l)||0;
      const hm = parseFloat(v.h)||0;
      const mq = (lm * hm) / 1000000;
      return {
        id: gid(),
        descrizione: `${v.sistema || m.sistema || "Infisso"} ${v.apertura || ""}`.trim(),
        ambiente: v.ambiente || "",
        tipoPrezzo: "mq",
        tipoPrezzoLabel: "€/mq",
        larghezza: v.l || "",
        altezza: v.h || "",
        mq: mq,
        quantita: parseInt(v.q) || 1,
        prezzoUnitario: 0,
        totale: 0,
      };
    });
    setProdotti([...prodotti, ...nuovi]);
  }

  function addProdotto() {
    setProdotti([...prodotti, {
      id: gid(), descrizione: "", ambiente: "", tipoPrezzo: "pezzo",
      tipoPrezzoLabel: "€/pezzo", larghezza: "", altezza: "", mq: 0,
      quantita: 1, prezzoUnitario: 0, totale: 0,
    }]);
  }

  function updateProdotto(i: number, field: string, value: any) {
    const n = [...prodotti];
    n[i] = { ...n[i], [field]: value };
    // Recalculate total
    const p = n[i];
    if (field === "tipoPrezzo") {
      const labels: Record<string, string> = { mq: "€/mq", pezzo: "€/pezzo", listino: "Listino", manuale: "Manuale" };
      p.tipoPrezzoLabel = labels[value] || value;
    }
    if (field === "larghezza" || field === "altezza") {
      const lm = parseFloat(p.larghezza) || 0;
      const hm = parseFloat(p.altezza) || 0;
      p.mq = (lm * hm) / 1000000;
    }
    const prezzo = parseFloat(p.prezzoUnitario) || 0;
    const qty = parseInt(p.quantita) || 1;
    if (p.tipoPrezzo === "mq") {
      p.totale = prezzo * (p.mq || 0) * qty;
    } else {
      p.totale = prezzo * qty;
    }
    setProdotti(n);
  }

  function removeProdotto(i: number) {
    setProdotti(prodotti.filter((_: any, j: number) => j !== i));
  }

  function applyFromListino(prodIndex: number, listinoItem: any) {
    const n = [...prodotti];
    n[prodIndex] = { ...n[prodIndex], descrizione: listinoItem.descrizione, prezzoUnitario: listinoItem.prezzo, tipoPrezzo: listinoItem.tipo || "pezzo", tipoPrezzoLabel: listinoItem.tipo === "mq" ? "€/mq" : "€/pezzo" };
    const p = n[prodIndex];
    const prezzo = parseFloat(p.prezzoUnitario) || 0;
    const qty = parseInt(p.quantita) || 1;
    p.totale = p.tipoPrezzo === "mq" ? prezzo * (p.mq || 0) * qty : prezzo * qty;
    setProdotti(n);
    setShowListino(false);
  }

  // Import listino from CSV/text
  function importListino(text: string) {
    const lines = text.trim().split("\n").filter(l => l.trim());
    const items: any[] = [];
    lines.forEach(line => {
      const parts = line.split(/[;\t,]/).map(s => s.trim());
      if (parts.length >= 2) {
        items.push({
          id: gid(),
          descrizione: parts[0],
          prezzo: parseFloat(parts[1].replace(",", ".")) || 0,
          tipo: parts[2] || "pezzo",
        });
      }
    });
    if (items.length > 0) {
      setListino([...listino, ...items]);
      setShowImport(false);
    } else {
      alert("Formato non valido. Usa: Descrizione;Prezzo;Tipo (uno per riga)");
    }
  }

  const subtotale = prodotti.reduce((s: number, p: any) => s + (p.totale || 0), 0);
  const scontoVal = subtotale * (sconto || 0) / 100;
  const imponibile = subtotale - scontoVal;
  const ivaVal = imponibile * (iva || 22) / 100;
  const totaleFinale = imponibile + ivaVal;

  const [listinoSearch, setListinoSearch] = useState("");
  const [listinoTarget, setListinoTarget] = useState(-1);
  const [importText, setImportText] = useState("");

  return (
    <div style={S.container}>
      <div style={{...S.secHdr,background:"linear-gradient(135deg,#a855f7,#8b5cf6)",boxShadow:"0 4px 14px rgba(139,92,246,0.3)"}}>
        <button onClick={onBack} style={{...S.backBtn,color:"#fff"}}>← Indietro</button>
        <h2 style={{...S.secTitle,color:"#fff"}}>💰 Preventivo</h2>
      </div>
      <div style={{padding:20}}>
        <div style={{...S.praticaRef,borderLeftColor:"#8b5cf6"}}>{pratica?.numero} · {client?.nome}</div>

        {/* Import da Misure */}
        {m?.vani?.length > 0 && prodotti.length === 0 && (
          <button onClick={importDaMisure} style={{...S.saveBtn,background:"#d97706",marginBottom:16}}>
            📐 Importa {m.vani.length} vani dalle Misure
          </button>
        )}
        {m?.vani?.length > 0 && prodotti.length > 0 && (
          <button onClick={importDaMisure} style={{width:"100%",padding:10,borderRadius:10,border:"2px dashed #d97706",background:"transparent",color:"#d97706",fontSize:13,fontWeight:600,cursor:"pointer",marginBottom:12}}>
            + Importa altri vani dalle Misure
          </button>
        )}

        {/* Listino */}
        <div style={{display:"flex",gap:8,marginBottom:16}}>
          <button onClick={()=>setShowImport(!showImport)} style={{flex:1,padding:10,borderRadius:10,border:"1.5px solid #8b5cf6",background:"#f5f3ff",color:"#8b5cf6",fontSize:13,fontWeight:600,cursor:"pointer"}}>
            📊 {listino.length > 0 ? `Listino (${listino.length})` : "Importa Listino"}
          </button>
          {listino.length > 0 && (
            <button onClick={()=>setShowListino(!showListino)} style={{flex:1,padding:10,borderRadius:10,border:"1.5px solid #059669",background:"#ecfdf5",color:"#059669",fontSize:13,fontWeight:600,cursor:"pointer"}}>
              📋 Sfoglia Listino
            </button>
          )}
        </div>

        {/* Import Listino Modal */}
        {showImport && (
          <div style={{background:"#f5f3ff",borderRadius:12,padding:14,marginBottom:16,border:"1.5px solid #8b5cf6"}}>
            <h4 style={{fontSize:14,fontWeight:700,color:"#8b5cf6",margin:"0 0 8px"}}>📊 Importa Listino Prezzi</h4>
            <p style={{fontSize:12,color:"#64748b",margin:"0 0 8px"}}>Incolla da Excel o scrivi una riga per prodotto nel formato:<br/><strong>Descrizione;Prezzo;Tipo</strong> (tipo = mq o pezzo)</p>
            <textarea value={importText} onChange={(e: any) => setImportText(e.target.value)} placeholder={"Finestra 2 ante PVC;350;pezzo\nPortoncino blindato;800;pezzo\nSerramento alluminio;280;mq"} style={{...S.textarea,minHeight:100,fontSize:13}} />
            <div style={{display:"flex",gap:8,marginTop:8}}>
              <button onClick={() => importListino(importText)} style={{flex:1,padding:10,borderRadius:10,background:"#8b5cf6",color:"#fff",border:"none",fontWeight:700,cursor:"pointer"}}>✓ Importa</button>
              <button onClick={() => setShowImport(false)} style={{padding:10,borderRadius:10,background:"#f1f5f9",color:"#64748b",border:"none",fontWeight:600,cursor:"pointer"}}>Annulla</button>
            </div>
          </div>
        )}

        {/* Prodotti */}
        <h3 style={{...S.sectionTitle,marginTop:4}}>Prodotti ({prodotti.length})</h3>
        {prodotti.map((p: any, i: number) => (
          <div key={p.id} style={{...S.vanoCard,borderLeftColor:"#8b5cf6"}}>
            <div style={S.vanoHdr}>
              <span style={{...S.vanoNum,background:"#8b5cf6"}}>{i + 1}</span>
              <span style={{fontSize:14,fontWeight:700,flex:1,color:"#0f172a"}}>{p.descrizione || "Nuovo prodotto"}</span>
              <button onClick={() => removeProdotto(i)} style={S.vanoRm}>×</button>
            </div>
            <Field label="Descrizione" value={p.descrizione} onChange={(v: string) => updateProdotto(i, "descrizione", v)} placeholder="es. Finestra 2 ante PVC bianco" />
            <Field label="Ambiente / Posizione" value={p.ambiente} onChange={(v: string) => updateProdotto(i, "ambiente", v)} placeholder="es. Soggiorno, Camera..." />
            
            {/* Tipo Prezzo */}
            <div style={S.fGroup}>
              <label style={S.fLabel}>Tipo Prezzo</label>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {[{k:"mq",l:"€/mq"},{k:"pezzo",l:"€/pezzo"},{k:"listino",l:"Da Listino"},{k:"manuale",l:"Manuale"}].map(t => (
                  <button key={t.k} onClick={() => {
                    updateProdotto(i, "tipoPrezzo", t.k);
                    if (t.k === "listino" && listino.length > 0) { setListinoTarget(i); setShowListino(true); }
                  }} style={{...S.pill,background:p.tipoPrezzo===t.k?"#8b5cf6":"#f3f4f6",color:p.tipoPrezzo===t.k?"#fff":"#6b7280"}}>{t.l}</button>
                ))}
              </div>
            </div>

            {/* Dimensioni per mq */}
            {p.tipoPrezzo === "mq" && (
              <div style={{display:"flex",gap:8}}>
                <Field label="L (mm)" value={p.larghezza} onChange={(v: string) => updateProdotto(i, "larghezza", v)} type="number" placeholder="Larg." style={{flex:1}} />
                <Field label="H (mm)" value={p.altezza} onChange={(v: string) => updateProdotto(i, "altezza", v)} type="number" placeholder="Alt." style={{flex:1}} />
                <div style={{flex:"0 0 70px"}}><label style={S.fLabel}>MQ</label><div style={{...S.input,background:"#f8fafc",color:"#059669",fontWeight:700}}>{(p.mq||0).toFixed(2)}</div></div>
              </div>
            )}

            <div style={{display:"flex",gap:8}}>
              <Field label="Quantità" value={p.quantita} onChange={(v: string) => updateProdotto(i, "quantita", v)} type="number" style={{flex:"0 0 80px"}} />
              <Field label={p.tipoPrezzo === "mq" ? "Prezzo €/mq" : "Prezzo €/pz"} value={p.prezzoUnitario} onChange={(v: string) => updateProdotto(i, "prezzoUnitario", v)} type="number" placeholder="0.00" style={{flex:1}} />
              <div style={{flex:"0 0 100px"}}><label style={S.fLabel}>Totale</label><div style={{...S.input,background:"#ecfdf5",color:"#059669",fontWeight:800,fontSize:16}}>€ {(p.totale||0).toFixed(2)}</div></div>
            </div>
          </div>
        ))}

        <div style={{display:"flex",gap:8,marginBottom:16}}>
          <button onClick={addProdotto} style={{...S.addVanoBtn,borderColor:"#8b5cf6",color:"#8b5cf6",flex:1}}>+ Aggiungi Prodotto</button>
        </div>

        {/* Listino Browser */}
        {showListino && listino.length > 0 && (
          <div style={{background:"#f5f3ff",borderRadius:12,padding:14,marginBottom:16,border:"1.5px solid #8b5cf6"}}>
            <h4 style={{fontSize:14,fontWeight:700,color:"#8b5cf6",margin:"0 0 8px"}}>📋 Listino Prezzi ({listino.length} prodotti)</h4>
            <input value={listinoSearch} onChange={(e: any) => setListinoSearch(e.target.value)} placeholder="🔍 Cerca nel listino..." style={{...S.searchInp,marginBottom:8}} />
            <div style={{maxHeight:250,overflowY:"auto"}}>
              {listino.filter((l: any) => !listinoSearch || l.descrizione.toLowerCase().includes(listinoSearch.toLowerCase())).map((l: any) => (
                <button key={l.id} onClick={() => {
                  if (listinoTarget >= 0) { applyFromListino(listinoTarget, l); setListinoTarget(-1); }
                  else if (prodotti.length > 0) { applyFromListino(prodotti.length - 1, l); }
                }} style={{display:"flex",justifyContent:"space-between",alignItems:"center",width:"100%",padding:"8px 10px",background:"#fff",borderRadius:8,border:"1px solid #e2e8f0",marginBottom:4,cursor:"pointer",textAlign:"left"}}>
                  <span style={{fontSize:13,fontWeight:600,color:"#0f172a"}}>{l.descrizione}</span>
                  <span style={{fontSize:14,fontWeight:700,color:"#059669"}}>€ {l.prezzo.toFixed(2)}/{l.tipo||"pz"}</span>
                </button>
              ))}
            </div>
            <button onClick={() => { setShowListino(false); setListinoTarget(-1); }} style={{marginTop:8,padding:"8px 16px",borderRadius:8,background:"#f1f5f9",border:"none",color:"#64748b",fontWeight:600,cursor:"pointer",width:"100%"}}>Chiudi Listino</button>
          </div>
        )}

        {/* Riepilogo Totali */}
        {prodotti.length > 0 && (
          <div style={{background:"#fff",borderRadius:14,padding:16,border:"2px solid #8b5cf6",marginBottom:16}}>
            <h4 style={{fontSize:15,fontWeight:700,color:"#8b5cf6",margin:"0 0 12px"}}>📊 Riepilogo</h4>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:6,fontSize:14}}><span>Subtotale:</span><span style={{fontWeight:600}}>€ {subtotale.toFixed(2)}</span></div>
            <div style={{display:"flex",gap:8,marginBottom:8}}>
              <Field label="Sconto %" value={sconto} onChange={(v: string) => setSconto(parseFloat(v) || 0)} type="number" style={{flex:1}} />
              <Field label="IVA %" value={iva} onChange={(v: string) => setIva(parseFloat(v) || 0)} type="number" style={{flex:1}} />
            </div>
            {sconto > 0 && <div style={{display:"flex",justifyContent:"space-between",marginBottom:4,fontSize:13,color:"#dc2626"}}><span>Sconto {sconto}%:</span><span>- € {scontoVal.toFixed(2)}</span></div>}
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:4,fontSize:13}}><span>Imponibile:</span><span style={{fontWeight:600}}>€ {imponibile.toFixed(2)}</span></div>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:8,fontSize:13}}><span>IVA {iva}%:</span><span>€ {ivaVal.toFixed(2)}</span></div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:22,fontWeight:800,borderTop:"2px solid #8b5cf6",paddingTop:10}}><span>TOTALE:</span><span style={{color:"#059669"}}>€ {totaleFinale.toFixed(2)}</span></div>
          </div>
        )}

        {/* Condizioni */}
        <Field label="Condizioni" value={condizioni} onChange={setCondizioni} placeholder="Condizioni del preventivo..." textarea rows={4} />
        <div style={{display:"flex",gap:8}}>
          <Field label="Validità (giorni)" value={validita} onChange={setValidita} type="number" style={{flex:"0 0 120px"}} />
          <Field label="Note aggiuntive" value={noteP} onChange={setNoteP} placeholder="Note..." style={{flex:1}} />
        </div>

        <button onClick={() => onSave({ prodotti, sconto, iva, condizioni, validita, noteP, listino, totaleFinale })} style={{...S.saveBtn,background:"linear-gradient(135deg,#a855f7,#8b5cf6)",boxShadow:"0 4px 14px rgba(139,92,246,0.3)"}}>💾 Salva Preventivo</button>
        {pratica?.preventivo && (
          <div style={{display:"flex",gap:8,marginTop:8}}>
            <button onClick={() => exportPreventivo(pratica, client, true)} style={{...S.saveBtn,background:"#fff",color:"#8b5cf6",border:"2px solid #8b5cf6",boxShadow:"none",flex:1}}>🖨️ Dettagliato</button>
            <button onClick={() => exportPreventivo(pratica, client, false)} style={{...S.saveBtn,background:"#fff",color:"#8b5cf6",border:"2px solid #8b5cf6",boxShadow:"none",flex:1}}>🖨️ Solo Totale</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ==================== EMAIL VIEW ====================
function EmailView({ pratica, client, settings, onSend, onBack }: any) {
  const [dest, setDest] = useState(client?.email||"");
  const [oggetto, setOggetto] = useState(`Pratica ${pratica?.numero} - ${client?.nome||""}`);
  const firma = settings?.nomeAzienda ? `\n\n${settings.nomeAzienda}${settings.telefonoAzienda?"\nTel: "+settings.telefonoAzienda:""}${settings.emailAzienda?"\n"+settings.emailAzienda:""}` : "\n\nCordiali saluti";
  const [corpo, setCorpo] = useState(`Gentile ${client?.nome||"Cliente"},\n\nIn riferimento alla pratica ${pratica?.numero}${pratica?.indirizzo?` per l'immobile in ${pratica.indirizzo}`:""}, Le comunichiamo che...\n${firma}`);
  const templates = [
    { l: "📅 Conferma Appuntamento", t: `Gentile ${client?.nome},\n\nLe confermiamo l'appuntamento per il giorno ${dateLabel(pratica?.data)} alle ore ${pratica?.ora}${pratica?.indirizzo?` presso ${pratica.indirizzo}`:""}.\n\nPer qualsiasi necessità non esiti a contattarci.\n${firma}` },
    { l: "💰 Invio Preventivo", t: `Gentile ${client?.nome},\n\nIn allegato trova il preventivo relativo alla pratica ${pratica?.numero}.\n\nIl preventivo ha validità 30 giorni.\n\nRestiamo a disposizione per chiarimenti.\n${firma}` },
    { l: "📦 Conferma Ordine", t: `Gentile ${client?.nome},\n\nLe confermiamo che l'ordine (pratica ${pratica?.numero}) è stato inoltrato al produttore.\n\nTempi di consegna stimati: circa [X] settimane.\n${firma}` },
    { l: "🔧 Data Posa", t: `Gentile ${client?.nome},\n\nLa posa in opera (pratica ${pratica?.numero}) è programmata per il giorno [DATA] alle ore [ORA].\n\nLa preghiamo di assicurarsi che l'accesso sia libero.\n${firma}` },
    { l: "✅ Lavoro Completato", t: `Gentile ${client?.nome},\n\nLe comunichiamo che i lavori relativi alla pratica ${pratica?.numero} sono stati completati.\n\nPer qualsiasi segnalazione non esiti a contattarci.\n${firma}` },
  ];
  return (
    <div style={S.container}>
      <div style={{...S.secHdr,background:"linear-gradient(135deg,#6366f1,#a855f7)",boxShadow:"0 4px 14px rgba(99,102,241,0.3)"}}><button onClick={onBack} style={{...S.backBtn,color:"#fff"}}>← Indietro</button><h2 style={{...S.secTitle,color:"#fff"}}>✉️ Email</h2></div>
      <div style={{padding:20}}>
        <div style={{...S.praticaRef,borderLeftColor:"#6366f1"}}>{pratica?.numero} · {client?.nome}</div>
        <div style={S.fGroup}><label style={S.fLabel}>Template Rapidi</label><div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{templates.map((t,i)=><button key={i} onClick={()=>{setOggetto(`${t.l.replace(/^[^ ]+ /,"")} - Pratica ${pratica?.numero}`);setCorpo(t.t);}} style={S.templateBtn}>{t.l}</button>)}</div></div>
        <Field label="Destinatario" value={dest} onChange={setDest} placeholder="email@esempio.it" type="email" />
        <Field label="Oggetto" value={oggetto} onChange={setOggetto} placeholder="Oggetto email" />
        <div style={S.fGroup}><label style={S.fLabel}>Messaggio</label><textarea value={corpo} onChange={(e: any)=>setCorpo(e.target.value)} style={{...S.textarea,minHeight:200}} /></div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>{if(!dest.trim())return;const url=`mailto:${encodeURIComponent(dest)}?subject=${encodeURIComponent(oggetto)}&body=${encodeURIComponent(corpo)}`;window.open(url,"_blank");onSend({destinatario:dest,oggetto,corpo});}} disabled={!dest.trim()} style={{...S.saveBtn,background:"#7c3aed",flex:1,opacity:dest.trim()?1:0.5}}>📨 Mailto</button>
          <button onClick={()=>{if(!dest.trim())return;const url=`https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(dest)}&su=${encodeURIComponent(oggetto)}&body=${encodeURIComponent(corpo)}`;window.open(url,"_blank");onSend({destinatario:dest,oggetto,corpo,via:"gmail"});}} disabled={!dest.trim()} style={{...S.saveBtn,background:"#ea4335",flex:1,opacity:dest.trim()?1:0.5}}>Gmail</button>
        </div>
        <p style={{fontSize:12,color:"#94a3b8",textAlign:"center",marginTop:8}}>Scegli Mailto per email predefinita o Gmail per Google</p>
      </div>
    </div>
  );
}

// ==================== NOTE EDITOR ====================
function NoteEditor({ note, onSave, onBack }: any) {
  const [testo, setTesto] = useState(note?.testo||"");
  const [colore, setColore] = useState(note?.colore||"#fffbeb");
  const [praticaId, setPraticaId] = useState(note?.praticaId||"");
  const colors = ["#fffbeb","#ecfdf5","#eff6ff","#fef2f2","#f5f3ff","#fff7ed"];
  return (
    <div style={S.container}>
      <div style={S.secHdr}><button onClick={onBack} style={S.backBtn}>← Annulla</button><h2 style={S.secTitle}>{note?.id?"Modifica":"Nuova"} Nota</h2></div>
      <div style={{padding:20}}>
        <div style={S.fGroup}><label style={S.fLabel}>Colore</label><div style={{display:"flex",gap:8}}>{colors.map(c=><button key={c} onClick={()=>setColore(c)} style={{width:36,height:36,borderRadius:10,background:c,border:colore===c?"3px solid #2563eb":"2px solid #d1d5db",cursor:"pointer"}} />)}</div></div>
        <div style={S.fGroup}><label style={S.fLabel}>Nota</label><textarea value={testo} onChange={(e: any)=>setTesto(e.target.value)} placeholder="Scrivi la tua nota..." style={{...S.textarea,minHeight:200,background:colore}} autoFocus /></div>
        <button onClick={()=>onSave({...note,testo,colore,praticaId})} style={S.saveBtn}>💾 Salva Nota</button>
      </div>
    </div>
  );
}

// ==================== SHARED ====================
function Field({ label, value, onChange, placeholder, type, style, autoFocus, textarea, rows }: any) {
  return (<div style={{...S.fGroup,...style}}><label style={S.fLabel}>{label}</label>
    {textarea ? <textarea value={value} onChange={(e: any)=>onChange(e.target.value)} placeholder={placeholder} style={S.textarea} rows={rows||3} />
    : <input type={type||"text"} value={value} onChange={(e: any)=>onChange(e.target.value)} placeholder={placeholder} style={S.input} autoFocus={autoFocus} />}</div>);
}
function InfoRow({ icon, val }: any) { return <div style={{display:"flex",alignItems:"flex-start",gap:10}}><span style={{fontSize:16,width:24,textAlign:"center",flexShrink:0}}>{icon}</span><span style={{fontSize:15,color:"#374151",lineHeight:1.4}}>{val}</span></div>; }
function TaskRow({ task, onToggle, small }: any) {
  return (<div style={{display:"flex",alignItems:"center",gap:10,padding:small?"7px 10px":"10px 12px",borderRadius:10,marginBottom:4,border:"1px solid #e2e8f0",background:task.done?"#f0fdf4":"#fff"}}>
    <button onClick={onToggle} style={{width:small?22:26,height:small?22:26,borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:13,fontWeight:700,flexShrink:0,background:task.done?"#059669":"#fff",border:task.done?"2px solid #059669":"2px solid #d1d5db",color:task.done?"#fff":"transparent"}}>✓</button>
    <span style={{flex:1,fontSize:small?13:14,textDecoration:task.done?"line-through":"none",color:task.done?"#9ca3af":"#1f2937"}}>{task.text}</span></div>);
}
function ProgressBar({ progress, done, total, small }: any) {
  return (<div style={{marginBottom:small?6:12,background:"#f8fafc",borderRadius:10,padding:small?"6px 10px":"10px 14px"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}><span style={{fontSize:small?12:14,fontWeight:600,color:"#374151"}}>Progresso</span><span style={{fontSize:small?13:16,fontWeight:800,color:progress===100?"#059669":"#2563eb"}}>{progress}%</span></div>
    <div style={{height:small?5:8,background:"#e2e8f0",borderRadius:10,overflow:"hidden"}}><div style={{height:"100%",borderRadius:10,width:`${progress}%`,background:progress===100?"#059669":"#2563eb",transition:"width 0.4s"}} /></div>
    <span style={{fontSize:11,color:"#64748b"}}>{done}/{total}</span></div>);
}

// ==================== STYLES ====================
const S: Record<string, React.CSSProperties> = {
  container:{maxWidth:540,margin:"0 auto",minHeight:"100vh",background:"linear-gradient(170deg,#fdf6ee 0%,#eef6fb 35%,#f3eefb 65%,#fef0f0 100%)",fontFamily:"'Plus Jakarta Sans','Segoe UI',system-ui,sans-serif",paddingBottom:88},
  loadWrap:{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:"linear-gradient(135deg,#ff6b35,#ff3d71,#7c3aed)"},
  header:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"22px 20px 16px",background:"linear-gradient(135deg,#1e293b 0%,#334155 50%,#1e293b 100%)",color:"#fff",boxShadow:"0 8px 30px rgba(0,0,0,0.25)",borderRadius:"0 0 24px 24px"},
  logo:{fontSize:24,fontWeight:900,margin:0,letterSpacing:"-0.5px",background:"linear-gradient(135deg,#fbbf24,#f59e0b)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"},
  subtitle:{fontSize:10,color:"rgba(255,255,255,0.5)",margin:"2px 0 0",letterSpacing:"2px",textTransform:"uppercase",fontWeight:600},
  addBtn:{background:"linear-gradient(135deg,#fbbf24,#f59e0b)",color:"#1e293b",border:"none",borderRadius:14,padding:"11px 20px",fontSize:14,fontWeight:800,cursor:"pointer",boxShadow:"0 4px 16px rgba(251,191,36,0.4)",letterSpacing:"-0.3px"},

  // Dashboard
  greetCard:{background:"#fff",borderRadius:20,padding:"20px 18px",marginBottom:14,border:"none",boxShadow:"0 4px 20px rgba(0,0,0,0.06)",position:"relative",overflow:"hidden"},
  dashStats:{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:16},
  dashStat:{display:"flex",flexDirection:"column",alignItems:"center",gap:4,background:"#fff",borderRadius:16,padding:"16px 4px",border:"none",cursor:"pointer",boxShadow:"0 4px 16px rgba(0,0,0,0.06)",transition:"transform 0.2s,box-shadow 0.2s"},
  alertCard:{display:"flex",alignItems:"center",gap:12,background:"linear-gradient(135deg,#fff1f2,#ffe4e6)",borderRadius:16,padding:"14px 16px",marginBottom:14,border:"none",boxShadow:"0 4px 16px rgba(239,68,68,0.12)"},
  dashSection:{marginBottom:20},
  dashSectionTitle:{fontSize:16,fontWeight:800,color:"#1e293b",margin:"0 0 12px",letterSpacing:"-0.3px"},
  dashEmpty:{fontSize:13,color:"#94a3b8",margin:"4px 0"},
  appointCard:{display:"flex",alignItems:"center",gap:14,width:"100%",textAlign:"left",padding:"14px 16px",background:"#fff",borderRadius:16,border:"none",marginBottom:10,cursor:"pointer",boxShadow:"0 4px 16px rgba(0,0,0,0.06)",transition:"transform 0.2s"},
  appointTime:{padding:"10px 14px",borderRadius:12,fontSize:14,fontWeight:800,flexShrink:0,letterSpacing:"-0.3px"},
  taskDashRow:{display:"flex",alignItems:"center",gap:10,padding:"12px 16px",background:"#fff",borderRadius:14,border:"none",marginBottom:8,boxShadow:"0 3px 12px rgba(0,0,0,0.05)"},
  taskCheck:{width:26,height:26,borderRadius:8,border:"2.5px solid #d1d5db",background:"#fff",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:14,color:"#d1d5db",flexShrink:0,transition:"all 0.2s"},
  emailDashCard:{background:"#fff",borderRadius:14,padding:"12px 16px",border:"none",marginBottom:8,boxShadow:"0 3px 12px rgba(0,0,0,0.05)"},
  noteCard:{display:"block",width:"100%",textAlign:"left",borderRadius:14,padding:"14px 16px",border:"none",marginBottom:10,cursor:"pointer",boxShadow:"0 4px 16px rgba(0,0,0,0.06)"},
  addNoteBtn:{width:36,height:36,borderRadius:12,background:"linear-gradient(135deg,#ff6b35,#ff3d71)",color:"#fff",border:"none",fontSize:20,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 4px 14px rgba(255,107,53,0.35)"},

  // Bottom Nav
  bottomNav:{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:540,display:"flex",background:"#fff",borderTop:"none",padding:"10px 0 8px",boxShadow:"0 -6px 30px rgba(0,0,0,0.1)",zIndex:100,borderRadius:"22px 22px 0 0"},
  navItem:{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3,background:"none",border:"none",cursor:"pointer",padding:"6px 0",transition:"all 0.2s"},

  // Shared
  stats:{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,padding:"14px 16px 10px"},
  statCard:{display:"flex",flexDirection:"column",alignItems:"center",gap:4,background:"#fff",borderRadius:16,padding:"12px 4px",border:"none",cursor:"pointer",boxShadow:"0 4px 16px rgba(0,0,0,0.06)"},
  statNum:{fontSize:24,fontWeight:900,color:"#1e293b",letterSpacing:"-0.5px"},
  statLbl:{fontSize:10,color:"#64748b",textTransform:"uppercase",fontWeight:700,letterSpacing:"0.5px"},
  searchInp:{width:"100%",padding:"14px 18px",borderRadius:16,border:"2.5px solid #e2e8f0",fontSize:15,color:"#1e293b",outline:"none",boxSizing:"border-box",background:"#fff",boxShadow:"0 4px 16px rgba(0,0,0,0.04)",transition:"border-color 0.2s,box-shadow 0.2s"},
  praticaCard:{display:"block",width:"100%",textAlign:"left",background:"#fff",borderRadius:18,padding:"18px 20px",marginBottom:12,border:"none",cursor:"pointer",boxShadow:"0 4px 20px rgba(0,0,0,0.07)",transition:"transform 0.2s,box-shadow 0.2s"},
  praticaTop:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6},
  praticaNum:{fontSize:13,fontWeight:800,color:"#7c3aed",background:"linear-gradient(135deg,#f3e8ff,#ede9fe)",padding:"4px 14px",borderRadius:10,letterSpacing:"-0.2px"},
  praticaStatus:{fontSize:11,fontWeight:800,padding:"5px 14px",borderRadius:20,letterSpacing:"-0.2px"},
  praticaCliente:{fontSize:18,fontWeight:800,color:"#0f172a",margin:"6px 0 2px",letterSpacing:"-0.3px"},
  praticaAddr:{fontSize:13,color:"#64748b",margin:"2px 0 0",fontWeight:500},
  praticaMeta:{display:"flex",alignItems:"center",gap:10,marginTop:10},
  praticaActions:{fontSize:11,fontWeight:700,color:"#7c3aed",background:"linear-gradient(135deg,#f3e8ff,#ede9fe)",padding:"4px 12px",borderRadius:10},
  progRow:{display:"flex",alignItems:"center",gap:8,marginTop:10},
  progBar:{flex:1,height:7,background:"#e2e8f0",borderRadius:10,overflow:"hidden"},
  progFill:{height:"100%",borderRadius:10,transition:"width 0.4s ease"},
  empty:{textAlign:"center",padding:"50px 20px"},
  emptyTitle:{fontSize:19,fontWeight:800,color:"#374151",margin:"12px 0 6px",letterSpacing:"-0.3px"},
  emptySub:{fontSize:14,color:"#9ca3af",fontWeight:500},
  emptyMini:{textAlign:"center",padding:"30px 20px",fontSize:14,color:"#9ca3af",fontWeight:500},
  clientRow:{display:"flex",alignItems:"center",gap:14,width:"100%",padding:"16px 18px",background:"#fff",borderRadius:16,border:"none",marginBottom:10,cursor:"pointer",textAlign:"left",boxShadow:"0 4px 16px rgba(0,0,0,0.06)",transition:"transform 0.2s"},
  clientCard:{display:"flex",alignItems:"center",gap:14,padding:"16px 18px",background:"#fff",borderRadius:16,border:"none",marginBottom:10,boxShadow:"0 4px 16px rgba(0,0,0,0.06)"},
  clientAvatar:{width:46,height:46,borderRadius:14,background:"linear-gradient(135deg,#ff6b35,#ff3d71)",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:800,flexShrink:0,boxShadow:"0 4px 14px rgba(255,107,53,0.3)"},
  clientCount:{fontSize:22,fontWeight:900,color:"#ff6b35",letterSpacing:"-0.5px"},
  clientBox:{display:"flex",alignItems:"center",gap:14,background:"#fff",borderRadius:16,padding:"16px 18px",marginBottom:16,border:"none",boxShadow:"0 4px 16px rgba(0,0,0,0.06)"},
  newClientBtn:{width:"100%",padding:"15px",borderRadius:16,border:"2.5px dashed #ff6b35",background:"linear-gradient(135deg,#fff7ed,#fff1e3)",color:"#ff6b35",fontSize:15,fontWeight:800,cursor:"pointer",marginBottom:14,letterSpacing:"-0.2px"},
  secHdr:{display:"flex",alignItems:"center",gap:12,padding:"22px 20px 16px",background:"#fff",borderBottom:"none",boxShadow:"0 4px 16px rgba(0,0,0,0.05)",borderRadius:"0 0 20px 20px"},
  secTitle:{fontSize:19,fontWeight:900,color:"#0f172a",margin:0,letterSpacing:"-0.3px"},
  backBtn:{background:"none",border:"none",fontSize:15,color:"#ff6b35",cursor:"pointer",fontWeight:800,padding:"6px 0"},
  fGroup:{marginBottom:16},
  fLabel:{display:"block",fontSize:11,fontWeight:800,color:"#64748b",marginBottom:6,textTransform:"uppercase",letterSpacing:"0.8px"},
  input:{width:"100%",padding:"13px 16px",borderRadius:14,border:"2.5px solid #e2e8f0",fontSize:15,color:"#1e293b",outline:"none",boxSizing:"border-box",background:"#fff",transition:"border-color 0.2s,box-shadow 0.2s"},
  textarea:{width:"100%",padding:"13px 16px",borderRadius:14,border:"2.5px solid #e2e8f0",fontSize:15,color:"#1e293b",outline:"none",resize:"vertical",boxSizing:"border-box",fontFamily:"inherit",background:"#fff",transition:"border-color 0.2s"},
  saveBtn:{width:"100%",padding:"16px",borderRadius:16,border:"none",background:"linear-gradient(135deg,#ff6b35,#ff3d71)",color:"#fff",fontSize:16,fontWeight:800,cursor:"pointer",boxShadow:"0 6px 20px rgba(255,107,53,0.35)",marginTop:10,letterSpacing:"-0.2px",transition:"transform 0.2s,box-shadow 0.2s"},
  infoNote:{background:"linear-gradient(135deg,#fff7ed,#fff1e3)",borderRadius:14,padding:"14px 16px",fontSize:13,color:"#c2410c",marginBottom:16,border:"1px solid #fed7aa",fontWeight:600},
  pill:{padding:"8px 18px",borderRadius:20,border:"none",fontSize:13,fontWeight:800,cursor:"pointer",transition:"all 0.2s",letterSpacing:"-0.2px"},
  pickerHdr:{textAlign:"center",padding:"32px 20px 24px",background:"linear-gradient(135deg,#059669,#0d9488,#0891b2)"},
  pickerCheck:{width:60,height:60,borderRadius:"50%",background:"rgba(255,255,255,0.2)",color:"#fff",fontSize:28,fontWeight:800,display:"inline-flex",alignItems:"center",justifyContent:"center",marginBottom:14,backdropFilter:"blur(10px)"},
  pickerTitle:{fontSize:24,fontWeight:900,color:"#fff",margin:"0 0 10px",letterSpacing:"-0.5px"},
  pickerNum:{display:"inline-block",background:"rgba(255,255,255,0.2)",color:"#fff",padding:"5px 18px",borderRadius:12,fontSize:16,fontWeight:800,marginBottom:10,backdropFilter:"blur(10px)"},
  pickerClient:{fontSize:17,color:"rgba(255,255,255,0.9)",fontWeight:700,margin:0},
  pickerAddr:{fontSize:13,color:"rgba(255,255,255,0.6)",margin:"4px 0 0",fontWeight:500},
  pickerQ:{fontSize:19,fontWeight:900,color:"#0f172a",padding:"22px 20px 14px",letterSpacing:"-0.3px"},
  actGrid:{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:12,padding:"0 16px"},
  actCard:{display:"flex",flexDirection:"column",alignItems:"center",gap:8,padding:"22px 12px",background:"#fff",borderRadius:18,border:"none",cursor:"pointer",boxShadow:"0 4px 20px rgba(0,0,0,0.07)",transition:"transform 0.2s,box-shadow 0.2s"},
  skipBtn:{display:"block",width:"calc(100% - 32px)",margin:"16px auto",padding:"13px",background:"transparent",border:"2.5px solid #d1d5db",borderRadius:16,fontSize:14,fontWeight:800,color:"#6b7280",cursor:"pointer",textAlign:"center"},
  detailHdr:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"18px 20px",background:"#fff",borderBottom:"none",boxShadow:"0 4px 16px rgba(0,0,0,0.05)",borderRadius:"0 0 20px 20px"},
  emailBtn:{background:"linear-gradient(135deg,#f3e8ff,#ede9fe)",border:"none",borderRadius:12,padding:"9px 16px",fontSize:14,cursor:"pointer",color:"#7c3aed",fontWeight:800},
  delBtn:{background:"linear-gradient(135deg,#fff1f2,#ffe4e6)",border:"none",borderRadius:12,padding:"9px 14px",fontSize:14,cursor:"pointer"},
  praticaHdrCard:{background:"#fff",borderRadius:20,padding:20,border:"none",marginBottom:18,boxShadow:"0 4px 20px rgba(0,0,0,0.07)"},
  praticaNumBig:{fontSize:18,fontWeight:900,color:"#7c3aed",background:"linear-gradient(135deg,#f3e8ff,#ede9fe)",padding:"6px 18px",borderRadius:12,letterSpacing:"-0.3px"},
  statusBdg:{padding:"6px 18px",borderRadius:20,fontSize:13,fontWeight:800},
  detailName:{fontSize:26,fontWeight:900,color:"#0f172a",margin:"12px 0 16px",letterSpacing:"-0.5px"},
  detailInfo:{display:"flex",flexDirection:"column",gap:10},
  todayChip:{background:"linear-gradient(135deg,#ff6b35,#ff3d71)",color:"#fff",fontSize:10,fontWeight:800,padding:"3px 12px",borderRadius:10,marginLeft:8,boxShadow:"0 2px 8px rgba(255,107,53,0.3)"},
  statusChanger:{display:"flex",alignItems:"center",gap:12,marginBottom:18,padding:"16px 0",borderTop:"1.5px solid #f1f5f9",borderBottom:"1.5px solid #f1f5f9"},
  statusLbl:{fontSize:13,fontWeight:800,color:"#6b7280",textTransform:"uppercase",minWidth:48,letterSpacing:"0.3px"},
  statusTgl:{flex:1,padding:"9px 4px",borderRadius:12,fontSize:12,fontWeight:800,cursor:"pointer",transition:"all 0.2s"},
  sectionTitle:{fontSize:17,fontWeight:900,color:"#0f172a",margin:"0 0 14px",letterSpacing:"-0.3px"},
  actionBlock:{background:"#fff",borderRadius:16,padding:16,marginBottom:12,border:"none",boxShadow:"0 4px 16px rgba(0,0,0,0.06)"},
  openFormBtn:{width:"100%",padding:"12px",borderRadius:14,border:"none",background:"linear-gradient(135deg,#fff7ed,#fff1e3)",color:"#ff6b35",fontSize:14,fontWeight:800,cursor:"pointer",marginBottom:10,textAlign:"center",boxShadow:"0 2px 8px rgba(255,107,53,0.1)"},
  addActionBtn:{width:"100%",padding:"15px",borderRadius:16,border:"2.5px dashed #cbd5e1",background:"transparent",fontSize:15,fontWeight:800,color:"#94a3b8",cursor:"pointer",marginTop:18},
  sendEmailBtn:{width:"100%",padding:"15px",borderRadius:16,border:"none",background:"linear-gradient(135deg,#7c3aed,#a855f7)",color:"#fff",fontSize:15,fontWeight:800,cursor:"pointer",marginTop:12,boxShadow:"0 6px 20px rgba(124,58,237,0.3)",letterSpacing:"-0.2px"},
  dataSummary:{background:"#fff",borderRadius:16,padding:16,marginTop:14,borderLeft:"5px solid #ff6b35",boxShadow:"0 4px 16px rgba(0,0,0,0.05)"},
  dataSumTitle:{fontSize:16,fontWeight:800,color:"#ff6b35",margin:"0 0 6px",letterSpacing:"-0.2px"},
  dataSumLine:{fontSize:13,color:"#64748b",margin:"0 0 2px",fontWeight:500},
  praticaRef:{background:"linear-gradient(135deg,#f3e8ff,#ede9fe)",borderRadius:14,padding:"14px 18px",borderLeft:"5px solid #7c3aed",marginBottom:18,fontSize:16,fontWeight:800,color:"#7c3aed",letterSpacing:"-0.2px"},
  vanoCard:{background:"#fff",borderRadius:16,padding:16,marginBottom:12,border:"none",borderLeft:"5px solid #f59e0b",boxShadow:"0 4px 16px rgba(0,0,0,0.06)"},
  vanoHdr:{display:"flex",alignItems:"center",gap:10,marginBottom:14},
  vanoNum:{width:32,height:32,borderRadius:10,background:"linear-gradient(135deg,#fbbf24,#f59e0b)",color:"#fff",fontSize:15,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 4px 12px rgba(251,191,36,0.35)"},
  vanoRm:{background:"linear-gradient(135deg,#fff1f2,#ffe4e6)",border:"none",borderRadius:10,width:32,height:32,fontSize:18,color:"#ef4444",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.2s"},
  addVanoBtn:{width:"100%",padding:"13px",borderRadius:14,border:"2.5px dashed #f59e0b",background:"transparent",color:"#d97706",fontSize:14,fontWeight:800,cursor:"pointer",marginBottom:16},
  photoPH:{width:72,height:72,borderRadius:14,border:"2.5px dashed",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2},
  urgBtn:{flex:1,padding:"11px 4px",borderRadius:14,border:"none",fontSize:12,fontWeight:800,cursor:"pointer",textAlign:"center",transition:"all 0.2s"},
  emailCard:{background:"#fff",borderRadius:14,padding:"12px 16px",border:"none",marginBottom:8,boxShadow:"0 3px 12px rgba(0,0,0,0.05)"},
  templateBtn:{padding:"9px 16px",borderRadius:14,border:"2.5px solid #7c3aed",background:"#fff",color:"#7c3aed",fontSize:13,fontWeight:800,cursor:"pointer"},
  exportBtn:{padding:"12px 18px",borderRadius:14,border:"2.5px solid #ff6b35",background:"linear-gradient(135deg,#fff7ed,#fff1e3)",color:"#ff6b35",fontSize:13,fontWeight:800,cursor:"pointer",flex:1,textAlign:"center",boxShadow:"0 2px 8px rgba(255,107,53,0.1)"} as React.CSSProperties,
  noteCardFull:{display:"flex",alignItems:"flex-start",gap:10,borderRadius:16,padding:"16px 18px",border:"none",marginBottom:10,boxShadow:"0 4px 16px rgba(0,0,0,0.06)"},
  noteCardBtn:{flex:1,background:"none",border:"none",textAlign:"left",cursor:"pointer",padding:0},
  noteDelBtn:{background:"none",border:"none",fontSize:16,cursor:"pointer",padding:4,flexShrink:0},
};
