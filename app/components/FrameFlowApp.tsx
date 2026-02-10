"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "../lib/supabase";

// ==================== PHOTO UTILITIES ====================
async function compressImage(file: File, maxWidth = 1200): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ratio = Math.min(maxWidth / img.width, 1);
        canvas.width = img.width * ratio;
        canvas.height = img.height * ratio;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => blob ? resolve(blob) : reject("Compress failed"), "image/jpeg", 0.7);
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function uploadPhotoToStorage(file: File, userId: string, folder: string): Promise<string | null> {
  try {
    const compressed = await compressImage(file);
    const path = `${userId}/${folder}/${Date.now()}_${Math.random().toString(36).substr(2,5)}.jpg`;
    const { error } = await supabase.storage.from("photos").upload(path, compressed, { contentType: "image/jpeg", upsert: true });
    if (error) { console.error("Upload error:", error); return null; }
    const { data } = supabase.storage.from("photos").getPublicUrl(path);
    return data.publicUrl;
  } catch (err) { console.error("Photo upload failed:", err); return null; }
}

async function deletePhotoFromStorage(url: string) {
  try {
    const parts = url.split("/photos/");
    if (parts[1]) { const path = decodeURIComponent(parts[1]); await supabase.storage.from("photos").remove([path]); }
  } catch (err) { console.error("Delete photo failed:", err); }
}

const STORAGE_KEY = "frameflow-v4";

const ACTIONS_CFG = [
  { key: "sopralluogo", icon: ">", label: "Sopralluogo", desc: "Vai a vedere il cantiere", color: "#2563eb" },
  { key: "misure", icon: "+", label: "Misure", desc: "Prendi le misure", color: "#d97706" },
  { key: "preventivo", icon: "€", label: "Preventivo", desc: "Prepara preventivo", color: "#8b5cf6" },
  { key: "conferma", icon: "OK", label: "Conferma Ordine", desc: "Firma conferma", color: "#059669" },
  { key: "fattura", icon: "#", label: "Fattura", desc: "Genera fattura", color: "#f59e0b" },
  { key: "posa", icon: "==", label: "Posa in Opera", desc: "Installazione infissi", color: "#059669" },
  { key: "riparazione", icon: "*", label: "Riparazione", desc: "Intervento riparazione", color: "#dc2626" },
  { key: "followup", icon: "<<", label: "Richiama", desc: "Contatto follow-up", color: "#6b7280" },
];

const WORKFLOW_NUOVO = [
  { key: "sopralluogo", label: "Sopralluogo", icon: ">", color: "#2563eb" },
  { key: "misure", label: "Misure", icon: "+", color: "#d97706" },
  { key: "preventivo", label: "Preventivo", icon: "€", color: "#8b5cf6" },
  { key: "conferma", label: "Conferma", icon: "OK", color: "#059669" },
  { key: "fattura", label: "Fattura", icon: "#", color: "#f59e0b" },
  { key: "posa", label: "Posa", icon: "==", color: "#10b981" },
  { key: "chiusura", label: "Chiusura", icon: "X", color: "#1a1a2e" },
];

const WORKFLOW_RIP = [
  { key: "sopralluogo", label: "Sopralluogo", icon: ">", color: "#2563eb" },
  { key: "riparazione", label: "Riparazione", icon: "*", color: "#dc2626" },
  { key: "fattura", label: "Fattura", icon: "#", color: "#f59e0b" },
  { key: "chiusura", label: "Chiusura", icon: "X", color: "#1a1a2e" },
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
  if (fase === "chiusura") return true;
  return false;
}

const STATUS: Record<string, {label:string;color:string;bg:string;icon:string}> = {
  da_fare: { label: "Da fare", color: "#ef4444", bg: "#fef2f2", icon: "O" },
  in_corso: { label: "In corso", color: "#d97706", bg: "#fffbeb", icon: "~" },
  completato: { label: "Completato", color: "#059669", bg: "#ecfdf5", icon: "X" },
};

const DEFAULT_TASKS: Record<string, string[]> = {
  sopralluogo: ["Verificare accessibilità cantiere","Foto panoramica facciata","Contare numero vani","Verificare stato vecchi infissi","Controllare cassonetti","Note per preventivo"],
  misure: ["Portare metro laser","Misurare ogni vano (L×H)","Verificare fuori squadra","Foto soglia + nodo + cassonetto","Compilare scheda misure","Far firmare il cliente"],
  posa: ["Verificare materiali consegnati","Smontaggio vecchi infissi","Installazione nuovi","Sigillature e schiuma","Regolazione ferramenta","Test apertura/chiusura","Pulizia finale","Foto prima/dopo"],
  riparazione: ["Identificare il problema","Foto del danno","Verificare ricambi necessari","Eseguire riparazione","Test funzionamento","Foto dopo intervento","Firma cliente"],
  preventivo: ["Riepilogare misure e materiali","Calcolare costi materiale","Calcolare costi manodopera","Preparare documento","Inviare al cliente"],
  followup: ["Chiamare il cliente","Annotare esito"],
};
const TASKS = DEFAULT_TASKS;

const APERTURE = ["DX","SX","DX+SX","Fisso","Vasistas","Anta/Ribalta","Bilico"];

const ROLES: Record<string,{label:string;icon:string;color:string;bg:string;permessi:string[];desc:string;canSee:string[]}> = {
  admin: { label:"Admin", icon:"ADM", color:"#92400e", bg:"#fef3c7", permessi:["sopralluogo","misure","preventivo","conferma","fattura","posa","riparazione","clienti","impostazioni","team","note","email"], desc:"Accesso completo a tutto", canSee:["dashboard","appuntamenti","calendario","pratiche","clienti","team"] },
  geometra: { label:"Geometra", icon:"GEO", color:"#1d4ed8", bg:"#dbeafe", permessi:["sopralluogo","misure"], desc:"Sopralluogo e misure", canSee:["dashboard","appuntamenti","calendario","pratiche"] },
  posatore: { label:"Posatore", icon:"POS", color:"#065f46", bg:"#d1fae5", permessi:["posa"], desc:"Fase posa e foto", canSee:["dashboard","appuntamenti","pratiche"] },
  segretaria: { label:"Segretaria", icon:"SEG", color:"#7c2d12", bg:"#ffedd5", permessi:["preventivo","conferma","fattura","clienti","email","note"], desc:"Preventivi, fatture, clienti, email", canSee:["dashboard","appuntamenti","calendario","pratiche","clienti"] },
};
const SISTEMI = ["Finestra 1 anta","Finestra 2 ante","Balcone 1 anta","Balcone 2 ante","Scorrevole","Vasistas","Fisso","Portoncino","Vetrata composta","Vetrata fissa","Lamiera","Cassonetto"];
const PHOTO_TYPES = [{k:"panoramica",l:"Panoram.",i:"[P]"},{k:"soglia",l:"Soglia",i:"[S]"},{k:"nodo",l:"Nodo",i:"[N]"},{k:"cassonetto",l:"Cassone.",i:"[C]"},{k:"imbotto",l:"Imbotto",i:"[I]"},{k:"contesto",l:"Contesto",i:"[X]"}];
const PROBLEMI = ["Ferramenta rotta","Guarnizioni usurate","Vetro rotto","Maniglia rotta","Chiusura difettosa","Infiltrazione acqua","Infiltrazione aria","Condensa","Tapparella bloccata","Cerniera rotta","Altro"];
const URGENZE = [{k:"bassa",l:"Bassa",c:"#059669",i:"v"},{k:"media",l:"Media",c:"#d97706",i:"-"},{k:"alta",l:"Alta",c:"#ef4444",i:"^"},{k:"urgente",l:"Urgente",c:"#7c3aed",i:"!"}];

function gid() { return Date.now().toString(36) + Math.random().toString(36).substr(2,5); }
function today() { return new Date().toISOString().split("T")[0]; }
function fmtDate(d: string) {
  if (!d) return "";
  const dt = new Date(d+"T00:00:00");
  return ["Dom","Lun","Mar","Mer","Gio","Ven","Sab"][dt.getDay()] + " " + dt.getDate() + " " + ["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"][dt.getMonth()];
}
function dateLabel(d: string) {
  if (d === today()) return " Oggi";
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
  // Try to load azienda info from settings
  let az: any = {};
  try { const raw = localStorage.getItem("ff-settings"); if (raw) { const s = JSON.parse(raw); az = s.azienda || {}; } } catch(e) {}
  const azHeader = az.ragioneSociale ? `<div style="text-align:right;font-size:11px;color:#5c6370;margin-bottom:12px;font-family:monospace;border-bottom:1px solid #d5d8de;padding-bottom:8px">
    <div style="font-weight:700;font-size:13px;color:#1a1a2e">${az.ragioneSociale}</div>
    ${az.indirizzo?`<div>${az.indirizzo}</div>`:""}
    ${az.piva?`<div>P.IVA: ${az.piva}</div>`:""}
    ${az.telefono?`<div>Tel: ${az.telefono}</div>`:""}${az.email?` <span>Email: ${az.email}</span>`:""}
  </div>` : "";
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'DM Sans','Segoe UI',system-ui,sans-serif;padding:24px;color:#1a1a2e;font-size:13px;line-height:1.5}
  .az-header{text-align:right;font-size:11px;color:#5c6370;margin-bottom:12px;font-family:'JetBrains Mono','SF Mono',monospace;border-bottom:1px solid #d5d8de;padding-bottom:8px}
  .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #1a1a2e;padding-bottom:12px;margin-bottom:16px}
  .logo{font-size:16px;font-weight:800;color:#1a1a2e;letter-spacing:2px;text-transform:uppercase;font-family:'JetBrains Mono','SF Mono',monospace}
  .doc-title{font-size:14px;font-weight:700;color:#e07a2f;margin-top:4px;letter-spacing:1px;text-transform:uppercase;font-family:'JetBrains Mono','SF Mono',monospace}
  .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px 20px;margin-bottom:16px;padding:12px;background:#fafbfc;border:1px solid #d5d8de}
  .info-row{display:flex;gap:6px}.info-label{font-weight:700;min-width:90px;color:#5c6370;font-size:11px;text-transform:uppercase;font-family:'JetBrains Mono','SF Mono',monospace;letter-spacing:0.5px}.info-val{font-weight:600;color:#1a1a2e}
  .vano{border:1.5px solid #d5d8de;margin-bottom:12px;page-break-inside:avoid}
  .vano-hdr{background:#d4820e;color:#fff;padding:8px 12px;font-weight:700;font-size:13px;font-family:'JetBrains Mono','SF Mono',monospace;letter-spacing:0.5px;text-transform:uppercase}
  .vano-body{padding:12px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px 16px}
  .vano-field{}.vano-field .lbl{font-size:10px;color:#5c6370;text-transform:uppercase;font-weight:700;font-family:'JetBrains Mono','SF Mono',monospace;letter-spacing:0.5px}.vano-field .val{font-size:14px;font-weight:700;color:#1a1a2e;font-family:'JetBrains Mono','SF Mono',monospace}
  .note-box{background:#fdf3eb;border-left:4px solid #e07a2f;padding:10px 12px;margin-top:8px;font-size:13px}
  .footer{margin-top:24px;padding-top:12px;border-top:2px solid #d5d8de;display:flex;justify-content:space-between;font-size:10px;color:#7a8194;font-family:'JetBrains Mono','SF Mono',monospace}
  .sign-area{margin-top:24px;display:flex;gap:40px}.sign-box{flex:1;border-top:1px solid #1a1a2e;padding-top:6px;font-size:11px;color:#5c6370;text-align:center}
  .urgenza{display:inline-block;padding:3px 12px;font-weight:700;font-size:12px;font-family:'JetBrains Mono','SF Mono',monospace;text-transform:uppercase}
  .problem-box{background:#fef2f2;border-left:4px solid #dc2626;padding:12px;margin-bottom:12px}
  .status-badge{display:inline-block;padding:2px 10px;font-size:11px;font-weight:700;font-family:'JetBrains Mono','SF Mono',monospace;text-transform:uppercase}
  table{width:100%;border-collapse:collapse;margin:12px 0}
  th{background:#f0f1f3;padding:8px 10px;text-align:left;font-size:10px;text-transform:uppercase;color:#5c6370;border:1px solid #d5d8de;font-family:'JetBrains Mono','SF Mono',monospace;letter-spacing:0.5px}
  td{padding:8px 10px;border:1px solid #d5d8de;font-size:13px}
  .totals-box{margin-top:16px;border:2px solid #1a1a2e;padding:14px;page-break-inside:avoid}
  .totals-row{display:flex;justify-content:space-between;margin-bottom:6px;font-size:13px}
  .totals-final{display:flex;justify-content:space-between;font-size:18px;font-weight:800;border-top:2px solid #1a1a2e;padding-top:8px;margin-top:8px}
  h3{font-size:13px;font-weight:700;margin:16px 0 10px;letter-spacing:1px;text-transform:uppercase;font-family:'JetBrains Mono','SF Mono',monospace;color:#1a1a2e}
  .print-bar{position:fixed;top:0;left:0;right:0;background:#1a1a2e;padding:10px 20px;display:flex;justify-content:space-between;align-items:center;z-index:9999}
  .print-bar button{padding:8px 20px;border:none;border-radius:4px;font-weight:700;font-size:13px;cursor:pointer;font-family:'JetBrains Mono',monospace}
  @media print{.print-bar{display:none!important}body{padding:12px}}
</style></head><body>
<div class="print-bar">
  <button onclick="window.print()" style="background:#e07a2f;color:#fff">STAMPA / PDF</button>
  <button onclick="window.close()" style="background:#555;color:#fff">CHIUDI</button>
</div>
<div style="margin-top:50px">
${azHeader}
${content}
</div>
</body></html>`;
  // Use blob URL in new tab - most reliable cross-browser method
  try {
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, "_blank");
    if (!w) {
      alert("Abilita i popup per stampare. Vai in Impostazioni browser → Popup → Consenti per questo sito.");
      URL.revokeObjectURL(url);
      return;
    }
    // Clean up blob URL after page loads
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  } catch(e) {
    alert("Errore generazione documento: " + (e as any)?.message);
  }
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
        <div class="vano-field"><div class="lbl">Vetro</div><div class="val">${v.vetro||m.vetro||"—"}</div></div>
        <div class="vano-field"><div class="lbl">Foto</div><div class="val">${Object.values(v.photos||{}).filter(Boolean).length}/6</div></div>
      </div>
      ${v.note?`<div class="note-box"> ${v.note}</div>`:""}
      ${v.freehandData?`<div style="margin-top:8px;text-align:center"><p style="font-size:10px;font-weight:700;color:#2563eb;margin-bottom:4px">DISEGNO A MANO</p><img src="${v.freehandData}" style="max-width:100%;max-height:200px;border:1px solid #d1d5db;" /></div>`:""}
      ${v.lamieraData?`<div style="margin-top:8px;text-align:center"><p style="font-size:10px;font-weight:700;color:#d97706;margin-bottom:4px">DISEGNO LAMIERA</p><img src="${v.lamieraData}" style="max-width:100%;max-height:200px;border:1px solid #d1d5db;" /></div>`:""}
    </div>
  `).join("");

  const content = `
    <div class="header">
      <div><div class="logo">FRAMEFLOW</div><div class="doc-title">SCHEDA MISURE</div></div>
      <div style="text-align:right"><div style="font-size:18px;font-weight:800;color:#3a7bd5">${pratica?.numero||""}</div><div style="font-size:12px;color:#64748b">${new Date().toLocaleDateString("it-IT")}</div></div>
    </div>
    <div class="info-grid">
      <div class="info-row"><span class="info-label">Cliente</span><span class="info-val">${client?.nome||"—"}</span></div>
      <div class="info-row"><span class="info-label">Telefono</span><span class="info-val">${client?.telefono||"—"}</span></div>
      <div class="info-row"><span class="info-label">Cantiere</span><span class="info-val">${m.cantiere||"—"}</span></div>
      <div class="info-row"><span class="info-label">Email</span><span class="info-val">${client?.email||"—"}</span></div>
      <div class="info-row"><span class="info-label">Indirizzo</span><span class="info-val">${m.indirizzo||pratica?.indirizzo||"—"}</span></div>
      <div class="info-row"><span class="info-label">Piano</span><span class="info-val">${m.piano||"—"}</span></div>
      <div class="info-row"><span class="info-label">Mezzi di Salita</span><span class="info-val">${m.mezziSalita||"—"}</span></div>
      <div class="info-row"><span class="info-label">Sistema</span><span class="info-val">${m.sistema||"—"}</span></div>
      <div class="info-row"><span class="info-label">Colore Int.</span><span class="info-val">${m.coloreInt||"—"}</span></div>
      <div class="info-row"><span class="info-label">Colore Est.</span><span class="info-val">${m.coloreEst||"—"}</span></div>
      <div class="info-row"><span class="info-label">Vetro</span><span class="info-val">${m.vetro||"—"}</span></div>
      <div class="info-row"><span class="info-label">N° Vani</span><span class="info-val">${(m.vani||[]).length}</span></div>
    </div>
    <h3 style="font-size:15px;font-weight:700;margin-bottom:10px">DETTAGLIO VANI</h3>
    ${vaniHTML}
    ${m.noteGen?`<div class="note-box" style="margin-top:16px"><strong> Note Generali:</strong><br/>${m.noteGen}</div>`:""}
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
      <div><div class="logo">FRAMEFLOW</div><div class="doc-title">SCHEDA RIPARAZIONE</div></div>
      <div style="text-align:right"><div style="font-size:18px;font-weight:800;color:#3a7bd5">${pratica?.numero||""}</div><div style="font-size:12px;color:#64748b">${new Date().toLocaleDateString("it-IT")}</div></div>
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
    ${r.noteRip?`<div class="note-box"><strong> Note:</strong><br/>${r.noteRip}</div>`:""}
    <div class="sign-area"><div class="sign-box">Firma Tecnico</div><div class="sign-box">Firma Cliente</div></div>
    <div class="footer"><span>FrameFlow — Generato il ${new Date().toLocaleString("it-IT")}</span><span>${pratica?.numero||""}</span></div>
  `;
  printHTML(`Riparazione ${pratica?.numero} - ${client?.nome}`, content);
}

function exportPratica(pratica: any, client: any) {
  const sc = STATUS[pratica?.status] || {bg:"#f0f0f0",color:"#333",label:"—"};
  const actions = pratica?.actions || [];
  const actionsHTML = actions.map((a: any) => {
    const cfg = ACTIONS_CFG.find(ac=>ac.key===a.type)||{icon:"",label:a.type};
    const asc = STATUS[a.status] || {bg:"#f0f0f0",color:"#333",label:"—"};
    const tasksHTML = (a.tasks||[]).map((t: any) => `<tr><td style="width:24px">${t.done?"":"⬜"}</td><td style="${t.done?"text-decoration:line-through;color:#9ca3af":""}">${t.text}</td></tr>`).join("");
    return `<div style="margin-bottom:12px;border-left:4px solid ${(cfg as any).color||"#6b7280"};padding-left:12px">
      <div style="display:flex;justify-content:space-between;align-items:center"><strong>${cfg.icon} ${cfg.label}</strong><span class="status-badge" style="background:${asc.bg};color:${asc.color}">${asc.label}</span></div>
      ${tasksHTML?`<table style="margin-top:6px">${tasksHTML}</table>`:""}
    </div>`;
  }).join("");

  const content = `
    <div class="header">
      <div><div class="logo">FRAMEFLOW</div><div class="doc-title">RIEPILOGO PRATICA</div></div>
      <div style="text-align:right"><div style="font-size:18px;font-weight:800;color:#3a7bd5">${pratica?.numero||""}</div><span class="status-badge" style="background:${sc.bg};color:${sc.color};font-size:13px">${sc.label}</span></div>
    </div>
    <div class="info-grid">
      <div class="info-row"><span class="info-label">Cliente</span><span class="info-val">${client?.nome||"—"}</span></div>
      <div class="info-row"><span class="info-label">Telefono</span><span class="info-val">${client?.telefono||"—"}</span></div>
      <div class="info-row"><span class="info-label">Indirizzo</span><span class="info-val">${pratica?.indirizzo||"—"}</span></div>
      <div class="info-row"><span class="info-label">Email</span><span class="info-val">${client?.email||"—"}</span></div>
      <div class="info-row"><span class="info-label">Data</span><span class="info-val">${fmtDate(pratica?.data||"")} ore ${pratica?.ora||""}</span></div>
      <div class="info-row"><span class="info-label">N° Azioni</span><span class="info-val">${actions.length}</span></div>
    </div>
    ${pratica?.note?`<div class="note-box"><strong> Note:</strong> ${pratica.note}</div>`:""}
    ${actions.length>0?`<h3 style="font-size:15px;font-weight:700;margin:16px 0 10px">AZIONI</h3>${actionsHTML}`:""}
    ${pratica?.misure?`<h3 style="font-size:15px;font-weight:700;margin:16px 0 10px"> MISURE</h3><div class="info-grid"><div class="info-row"><span class="info-label">Sistema</span><span class="info-val">${pratica.misure.sistema||"—"}</span></div><div class="info-row"><span class="info-label">N° Vani</span><span class="info-val">${(pratica.misure.vani||[]).length}</span></div><div class="info-row"><span class="info-label">Colore</span><span class="info-val">${pratica.misure.coloreInt||"—"} / ${pratica.misure.coloreEst||"—"}</span></div></div>`:""}
    ${pratica?.riparazione?`<h3 style="font-size:15px;font-weight:700;margin:16px 0 10px"> RIPARAZIONE</h3><div class="info-grid"><div class="info-row"><span class="info-label">Problema</span><span class="info-val">${pratica.riparazione.problema||"—"}</span></div><div class="info-row"><span class="info-label">Urgenza</span><span class="info-val">${pratica.riparazione.urgenza||"—"}</span></div><div class="info-row"><span class="info-label">Costo</span><span class="info-val">${pratica.riparazione.costoStimato?"€ "+pratica.riparazione.costoStimato:"—"}</span></div></div>`:""}
    <div class="footer"><span>FrameFlow — Generato il ${new Date().toLocaleString("it-IT")}</span><span>${pratica?.numero||""}</span></div>
  `;
  printHTML(`Pratica ${pratica?.numero||""} - ${client?.nome||""}`, content);
}

function exportPreventivo(pratica: any, client: any, showDetails: boolean) {
  const prev = pratica?.preventivo;
  if (!prev) { alert("Nessun preventivo salvato"); return; }
  const subtotale = (prev.prodotti||[]).reduce((s: number, p: any) => s + (parseFloat(p.totale)||0), 0);
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
      <td style="text-align:right">€ ${(parseFloat(p.prezzoUnitario)||0).toFixed(2)}</td>
      <td style="text-align:right;font-weight:700">€ ${(parseFloat(p.totale)||0).toFixed(2)}</td>
    </tr>
  `).join("") : "";

  const content = `
    <div class="header">
      <div><div class="logo">FRAMEFLOW</div><div class="doc-title">PREVENTIVO</div></div>
      <div style="text-align:right"><div style="font-size:16px;font-weight:800;color:#3a7bd5;font-family:'JetBrains Mono','SF Mono',monospace">${pratica?.numero||""}</div><div style="font-size:11px;color:#5c6370">${new Date().toLocaleDateString("it-IT")}</div></div>
    </div>
    <div class="info-grid">
      <div class="info-row"><span class="info-label">Cliente</span><span class="info-val">${client?.nome||"—"}</span></div>
      <div class="info-row"><span class="info-label">Telefono</span><span class="info-val">${client?.telefono||"—"}</span></div>
      ${client?.piva?`<div class="info-row"><span class="info-label">P.IVA</span><span class="info-val">${client.piva}</span></div>`:""}
      ${client?.codiceFiscale?`<div class="info-row"><span class="info-label">C.F.</span><span class="info-val">${client.codiceFiscale}</span></div>`:""}
      <div class="info-row"><span class="info-label">Indirizzo</span><span class="info-val">${pratica?.indirizzo||client?.indirizzo||"—"}</span></div>
      <div class="info-row"><span class="info-label">Email</span><span class="info-val">${client?.email||"—"}</span></div>
      ${pratica?.misure?`<div class="info-row"><span class="info-label">Piano</span><span class="info-val">${pratica.misure.piano||"—"}</span></div>
      <div class="info-row"><span class="info-label">Mezzi Salita</span><span class="info-val">${pratica.misure.mezziSalita||"—"}</span></div>
      <div class="info-row"><span class="info-label">Sistema</span><span class="info-val">${pratica.misure.sistema||"—"}</span></div>
      <div class="info-row"><span class="info-label">N° Vani</span><span class="info-val">${(pratica.misure.vani||[]).length}</span></div>
      <div class="info-row"><span class="info-label">Colore Int.</span><span class="info-val">${pratica.misure.coloreInt||"—"}</span></div>
      <div class="info-row"><span class="info-label">Colore Est.</span><span class="info-val">${pratica.misure.coloreEst||"—"}</span></div>`:""}
    </div>
    ${showDetails ? `
    <table>
      <thead><tr><th>#</th><th>Descrizione</th><th>Tipo</th><th>Q.tà</th><th style="text-align:right">Prezzo Un.</th><th style="text-align:right">Totale</th></tr></thead>
      <tbody>${prodottiHTML}</tbody>
    </table>` : ""}
    <div class="totals-box">
      <div style="display:flex;justify-content:space-between;margin-bottom:6px"><span>Subtotale:</span><span style="font-weight:600">€ ${subtotale.toFixed(2)}</span></div>
      ${prev.sconto>0?`<div style="display:flex;justify-content:space-between;margin-bottom:6px;color:#dc2626"><span>Sconto ${prev.sconto}%:</span><span>- € ${scontoVal.toFixed(2)}</span></div>`:""}
      <div style="display:flex;justify-content:space-between;margin-bottom:6px"><span>Imponibile:</span><span style="font-weight:600">€ ${imponibile.toFixed(2)}</span></div>
      <div style="display:flex;justify-content:space-between;margin-bottom:6px"><span>IVA ${prev.iva||22}%:</span><span>€ ${ivaVal.toFixed(2)}</span></div>
      <div style="display:flex;justify-content:space-between;font-size:18px;font-weight:800;border-top:2px solid #1e293b;padding-top:8px;margin-top:8px"><span>TOTALE:</span><span style="color:#059669">€ ${totale.toFixed(2)}</span></div>
    </div>
    ${prev.condizioni?`<div style="margin-top:16px;padding:12px;background:#f8fafc;;border:1px solid #e2e8f0;font-size:12px"><strong>Condizioni:</strong><br/>${prev.condizioni.replace(/\n/g,"<br/>")}</div>`:""}
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
  const subtotale = (prev.prodotti||[]).reduce((s: number, p: any) => s + (parseFloat(p.totale)||0), 0);
  const scontoVal = subtotale * (prev.sconto||0) / 100;
  const imponibile = subtotale - scontoVal;
  const ivaVal = imponibile * (prev.iva||22) / 100;
  const totale = imponibile + ivaVal;

  const prodottiHTML = (prev.prodotti||[]).map((p: any, i: number) => `
    <tr><td>${i+1}</td><td><strong>${p.descrizione||"—"}</strong></td><td style="text-align:center">${p.quantita||1}</td><td style="text-align:right;font-weight:700">€ ${(parseFloat(p.totale)||0).toFixed(2)}</td></tr>
  `).join("");

  const content = `
    <div class="header">
      <div><div class="logo">FRAMEFLOW</div><div class="doc-title">CONFERMA D'ORDINE</div></div>
      <div style="text-align:right"><div style="font-size:18px;font-weight:800;color:#059669">${pratica?.numero||""}</div><div style="font-size:12px;color:#64748b">Data conferma: ${new Date(conf.dataConferma).toLocaleDateString("it-IT")}</div></div>
    </div>
    <div style="background:#ecfdf5;border:2px solid #059669;;padding:12px;margin-bottom:16px;text-align:center;font-weight:800;color:#059669;font-size:16px"> ORDINE CONFERMATO</div>
    <div class="info-grid">
      <div class="info-row"><span class="info-label">Cliente</span><span class="info-val">${client?.nome||"—"}</span></div>
      ${client?.piva?`<div class="info-row"><span class="info-label">P.IVA</span><span class="info-val">${client.piva}</span></div>`:""}
      ${client?.codiceFiscale?`<div class="info-row"><span class="info-label">C.F.</span><span class="info-val">${client.codiceFiscale}</span></div>`:""}
      <div class="info-row"><span class="info-label">Indirizzo</span><span class="info-val">${pratica?.indirizzo||client?.indirizzo||"—"}</span></div>
      <div class="info-row"><span class="info-label">Telefono</span><span class="info-val">${client?.telefono||"—"}</span></div>
    </div>
    <table><thead><tr><th>#</th><th>Descrizione</th><th>Q.tà</th><th style="text-align:right">Totale</th></tr></thead><tbody>${prodottiHTML}</tbody></table>
    <div style="margin-top:16px;border:2px solid #1e293b;;padding:14px">
      <div style="display:flex;justify-content:space-between;font-size:18px;font-weight:800"><span>TOTALE ORDINE:</span><span style="color:#059669">€ ${totale.toFixed(2)}</span></div>
    </div>
    ${prev.condizioni?`<div style="margin-top:16px;padding:12px;background:#f8fafc;;border:1px solid #e2e8f0;font-size:12px"><strong>Condizioni:</strong><br/>${prev.condizioni.replace(/\n/g,"<br/>")}</div>`:""}
    ${conf.note?`<div style="margin-top:8px;padding:12px;background:#f8fafc;;font-size:12px"><strong>Note ordine:</strong> ${conf.note}</div>`:""}
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
  const subtotale = (prev.prodotti||[]).reduce((s: number, p: any) => s + (parseFloat(p.totale)||0), 0);
  const scontoVal = subtotale * (prev.sconto||0) / 100;
  const imponibile = subtotale - scontoVal;
  const ivaVal = imponibile * (prev.iva||22) / 100;
  const totale = imponibile + ivaVal;

  const prodottiHTML = (prev.prodotti||[]).map((p: any, i: number) => `
    <tr><td>${i+1}</td><td><strong>${p.descrizione||"—"}</strong>${p.ambiente?`<br/><span style="font-size:11px;color:#64748b">${p.ambiente}</span>`:""}</td><td style="text-align:center">${p.quantita||1}</td><td style="text-align:right">€ ${(parseFloat(p.prezzoUnitario)||0).toFixed(2)}</td><td style="text-align:right;font-weight:700">€ ${(parseFloat(p.totale)||0).toFixed(2)}</td></tr>
  `).join("");

  const pagatoLabel = fatt.statoPagamento === "pagato" ? " PAGATA" : fatt.statoPagamento === "acconto" ? `⏳ ACCONTO € ${(parseFloat(fatt.acconto)||0).toFixed(2)}` : " DA PAGARE";
  const pagatoColor = fatt.statoPagamento === "pagato" ? "#059669" : fatt.statoPagamento === "acconto" ? "#d97706" : "#ef4444";
  const pagatoBg = fatt.statoPagamento === "pagato" ? "#ecfdf5" : fatt.statoPagamento === "acconto" ? "#fffbeb" : "#fef2f2";

  const content = `
    <div class="header">
      <div><div class="logo">FRAMEFLOW</div><div class="doc-title">FATTURA DI CORTESIA</div></div>
      <div style="text-align:right"><div style="font-size:20px;font-weight:900;color:#1e293b">${fatt.numero}</div><div style="font-size:12px;color:#64748b">Data: ${new Date(fatt.data).toLocaleDateString("it-IT")}</div></div>
    </div>
    <div style="background:${pagatoBg};border:2px solid ${pagatoColor};;padding:12px;margin-bottom:16px;text-align:center;font-weight:800;color:${pagatoColor};font-size:16px">${pagatoLabel}</div>
    <div class="info-grid">
      <div class="info-row"><span class="info-label">Cliente</span><span class="info-val">${client?.nome||"—"}</span></div>
      ${client?.piva?`<div class="info-row"><span class="info-label">P.IVA</span><span class="info-val">${client.piva}</span></div>`:""}
      ${client?.codiceFiscale?`<div class="info-row"><span class="info-label">C.F.</span><span class="info-val">${client.codiceFiscale}</span></div>`:""}
      <div class="info-row"><span class="info-label">Indirizzo</span><span class="info-val">${pratica?.indirizzo||client?.indirizzo||"—"}</span></div>
      <div class="info-row"><span class="info-label">Rif. Pratica</span><span class="info-val">${pratica?.numero||"—"}</span></div>
    </div>
    <table><thead><tr><th>#</th><th>Descrizione</th><th>Q.tà</th><th style="text-align:right">Prezzo Un.</th><th style="text-align:right">Totale</th></tr></thead><tbody>${prodottiHTML}</tbody></table>
    <div style="margin-top:16px;border:2px solid #1e293b;;padding:14px">
      <div style="display:flex;justify-content:space-between;margin-bottom:6px"><span>Subtotale:</span><span style="font-weight:600">€ ${subtotale.toFixed(2)}</span></div>
      ${prev.sconto>0?`<div style="display:flex;justify-content:space-between;margin-bottom:6px;color:#dc2626"><span>Sconto ${prev.sconto}%:</span><span>- € ${scontoVal.toFixed(2)}</span></div>`:""}
      <div style="display:flex;justify-content:space-between;margin-bottom:6px"><span>Imponibile:</span><span>€ ${imponibile.toFixed(2)}</span></div>
      <div style="display:flex;justify-content:space-between;margin-bottom:6px"><span>IVA ${prev.iva||22}%:</span><span>€ ${ivaVal.toFixed(2)}</span></div>
      <div style="display:flex;justify-content:space-between;font-size:18px;font-weight:800;border-top:2px solid #1e293b;padding-top:8px;margin-top:8px"><span>TOTALE:</span><span style="color:#059669">€ ${totale.toFixed(2)}</span></div>
      ${fatt.statoPagamento==="acconto"?`<div style="display:flex;justify-content:space-between;margin-top:8px;padding-top:8px;border-top:1px dashed #94a3b8"><span>Acconto versato:</span><span style="color:#d97706;font-weight:700">€ ${(parseFloat(fatt.acconto)||0).toFixed(2)}</span></div><div style="display:flex;justify-content:space-between;font-weight:700"><span>Rimanente:</span><span style="color:#ef4444">€ ${(totale-(parseFloat(fatt.acconto)||0)).toFixed(2)}</span></div>`:""}
    </div>
    ${fatt.metodoPagamento?`<div style="margin-top:12px;font-size:12px"><strong>Metodo di pagamento:</strong> ${fatt.metodoPagamento}</div>`:""}
    ${fatt.note?`<div style="margin-top:8px;font-size:12px;padding:12px;background:#f8fafc;"><strong>Note:</strong> ${fatt.note}</div>`:""}
    <p style="margin-top:16px;font-size:11px;color:#94a3b8;text-align:center">Questo documento è una fattura di cortesia. La fattura elettronica verrà inviata tramite SDI.</p>
    <div class="footer"><span>FrameFlow — Fattura del ${new Date(fatt.data).toLocaleString("it-IT")}</span><span>${fatt.numero}</span></div>
  `;
  printHTML(`Fattura ${fatt.numero} - ${client?.nome}`, content);
}

function exportStampaCantiere(pratica: any, client: any) {
  const m = pratica?.misure;
  const prev = pratica?.preventivo;
  const vaniHTML = (m?.vani||[]).map((v: any, i: number) => `
    <div style="border:2px solid #000;margin-bottom:8px;page-break-inside:avoid">
      <div style="background:#000;color:#fff;padding:6px 10px;font-weight:700;font-size:14px;font-family:monospace">VANO ${i+1} ${v.ambiente?("— "+v.ambiente):""}</div>
      <div style="padding:8px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px">
        <div><span style="font-size:10px;color:#666">L</span><br/><strong style="font-size:16px">${v.l||"—"}</strong></div>
        <div><span style="font-size:10px;color:#666">H</span><br/><strong style="font-size:16px">${v.h||"—"}</strong></div>
        <div><span style="font-size:10px;color:#666">Q.tà</span><br/><strong style="font-size:16px">${v.q||"1"}</strong></div>
        <div><span style="font-size:10px;color:#666">APERTURA</span><br/><strong>${v.apertura||"—"}</strong></div>
        <div><span style="font-size:10px;color:#666">SISTEMA</span><br/><strong>${v.sistema||m?.sistema||"—"}</strong></div>
        <div><span style="font-size:10px;color:#666">VETRO</span><br/><strong>${v.vetro||m?.vetro||"—"}</strong></div>
      </div>
      ${v.note?`<div style="padding:4px 8px;background:#fff3cd;font-size:12px;border-top:1px solid #ddd">${v.note}</div>`:""}
      ${v.freehandData?`<div style="text-align:center;padding:4px"><img src="${v.freehandData}" style="max-width:100%;max-height:150px" /></div>`:""}
      ${v.lamieraData?`<div style="text-align:center;padding:4px"><img src="${v.lamieraData}" style="max-width:100%;max-height:150px" /></div>`:""}
    </div>
  `).join("");

  const prodottiHTML = (prev?.prodotti||[]).map((p: any, i: number) => `
    <tr><td style="border:1px solid #ddd;padding:4px;font-weight:700">${i+1}</td><td style="border:1px solid #ddd;padding:4px">${p.descrizione||"—"}</td><td style="border:1px solid #ddd;padding:4px;text-align:center">${p.quantita||1}</td></tr>
  `).join("");

  const content = `
    <div style="border-bottom:4px solid #000;padding-bottom:8px;margin-bottom:12px;display:flex;justify-content:space-between">
      <div>
        <div style="font-size:20px;font-weight:900;font-family:monospace;letter-spacing:2px">SCHEDA CANTIERE</div>
        <div style="font-size:14px;font-weight:700;margin-top:2px">${pratica?.numero||""}</div>
      </div>
      <div style="text-align:right;font-size:12px">
        <div style="font-weight:700">${new Date().toLocaleDateString("it-IT")}</div>
        <div>Ore: ${pratica?.ora||"—"}</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;margin-bottom:12px;font-size:13px">
      <div><strong>CLIENTE:</strong> ${client?.nome||"—"}</div>
      <div><strong>TEL:</strong> ${client?.telefono||"—"}</div>
      <div><strong>INDIRIZZO:</strong> ${pratica?.indirizzo||m?.indirizzo||"—"}</div>
      <div><strong>CANTIERE:</strong> ${m?.cantiere||"—"}</div>
      <div><strong>PIANO:</strong> ${m?.piano||"—"}</div>
      <div><strong>MEZZI SALITA:</strong> ${m?.mezziSalita||"—"}</div>
      <div><strong>COLORE INT:</strong> ${m?.coloreInt||"—"}</div>
      <div><strong>COLORE EST:</strong> ${m?.coloreEst||"—"}</div>
      <div><strong>SISTEMA:</strong> ${m?.sistema||"—"}</div>
      <div><strong>VETRO:</strong> ${m?.vetro||"—"}</div>
    </div>
    ${(m?.vani||[]).length>0?`<h3 style="font-size:14px;font-weight:900;margin:12px 0 8px;font-family:monospace;border-bottom:2px solid #000;padding-bottom:4px">VANI (${m.vani.length})</h3>${vaniHTML}`:""}
    ${(prev?.prodotti||[]).length>0?`<h3 style="font-size:14px;font-weight:900;margin:12px 0 8px;font-family:monospace;border-bottom:2px solid #000;padding-bottom:4px">PRODOTTI</h3>
    <table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr><th style="border:1px solid #ddd;padding:4px;background:#f0f0f0">#</th><th style="border:1px solid #ddd;padding:4px;background:#f0f0f0">Descrizione</th><th style="border:1px solid #ddd;padding:4px;background:#f0f0f0">Q.tà</th></tr></thead><tbody>${prodottiHTML}</tbody></table>`:""}
    ${m?.noteGen?`<div style="margin-top:12px;padding:8px;background:#fff3cd;border:2px solid #000;font-size:13px"><strong>NOTE:</strong> ${m.noteGen}</div>`:""}
    <div style="margin-top:20px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;font-size:11px;color:#666">
      <div style="border-top:1px solid #000;padding-top:4px;text-align:center">Firma Posatore</div>
      <div style="border-top:1px solid #000;padding-top:4px;text-align:center">Firma Cliente</div>
      <div style="border-top:1px solid #000;padding-top:4px;text-align:center">Note Cantiere</div>
    </div>
  `;
  printHTML(`Cantiere ${pratica?.numero} - ${client?.nome}`, content);
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
  const photos = row.photos || {};
  return { id: row.id, clientId: row.client_id, numero: row.numero, data: row.data, ora: row.ora, indirizzo: row.indirizzo, tipo: row.tipo, fase: row.fase||"sopralluogo", status: row.status, note: row.note, actions: row.actions||[], misure: row.misure, riparazione: row.riparazione, preventivo: row.preventivo, confermaOrdine: row.conferma_ordine, fattura: row.fattura, emails: row.emails||[], fotoSopralluogo: photos.sopralluogo||[], fotoPosaInizio: photos.posaInizio||[], fotoPosaFine: photos.posaFine||[], fotoPosaVani: photos.posaVani||{}, messaggi: row.actions?.__messaggi||photos.messaggi||[], assegnatoA: row.assegnato_a||null, orgId: row.org_id||null, firmaPosa: row.misure?.firmaPosa||photos.firmaPosa||null, createdAt: row.created_at, log: photos._log||row.log||[], completedAt: photos._completedAt||row.completed_at||null, praticaCollegata: photos._praticaCollegata||null };
}
function praticaToDb(p: any, userId: string): any {
  return { id: p.id, user_id: userId, client_id: p.clientId, numero: p.numero, data: p.data??"", ora: p.ora??"", indirizzo: p.indirizzo??"", tipo: p.tipo??"nuovo_infisso", fase: p.fase??"sopralluogo", status: p.status??"da_fare", note: p.note??"", actions: p.actions??[], misure: p.misure??null, riparazione: p.riparazione??null, preventivo: p.preventivo??null, conferma_ordine: p.confermaOrdine??null, fattura: p.fattura??null, emails: p.emails??[], photos: { sopralluogo: p.fotoSopralluogo??[], posaInizio: p.fotoPosaInizio??[], posaFine: p.fotoPosaFine??[], posaVani: p.fotoPosaVani??{}, firmaPosa: p.firmaPosa??null, messaggi: p.messaggi??[], _log: p.log??[], _completedAt: p.completedAt??null, _praticaCollegata: p.praticaCollegata??null }, assegnato_a: p.assegnatoA??null, org_id: p.orgId??null };
}
function dbToNote(row: any): any {
  return { id: row.id, testo: row.testo, colore: row.colore, praticaId: row.pratica_id, updatedAt: row.updated_at, createdAt: row.created_at };
}
function noteToDb(n: any, userId: string): any {
  return { id: n.id, user_id: userId, testo: n.testo||"", colore: n.colore||"#fffbeb", pratica_id: n.praticaId||"", updated_at: new Date().toISOString() };
}

// ==================== DEFAULT SETTINGS ====================
const DEFAULT_SISTEMI = [
  { id: "alluminio", nome: "Alluminio", icon: "" },
  { id: "pvc", nome: "PVC", icon: "⬜" },
  { id: "legno", nome: "Legno", icon: "[L]" },
  { id: "ferro", nome: "Ferro", icon: "⬛" },
  { id: "taglio_termico", nome: "Taglio Termico", icon: "[T]" },
];
const DEFAULT_CATEGORIE = [
  { id: "finestre", nome: "Finestre", icon: "" },
  { id: "porte", nome: "Porte", icon: "[P]" },
  { id: "portoncini", nome: "Portoncini", icon: "" },
  { id: "scorrevoli", nome: "Scorrevoli", icon: "[SC]" },
  { id: "tapparelle", nome: "Tapparelle", icon: "🔽" },
  { id: "zanzariere", nome: "Zanzariere", icon: "🦟" },
  { id: "cassonetti", nome: "Cassonetti", icon: "" },
  { id: "persiane", nome: "Persiane", icon: "🏛️" },
  { id: "inferriate", nome: "Inferriate", icon: "" },
  { id: "accessori", nome: "Accessori", icon: "" },
];
const DEFAULT_COLORI: Record<string, string[]> = {
  alluminio: ["Bianco RAL 9010","Avorio RAL 1013","Grigio RAL 7016","Marrone RAL 8017","Nero RAL 9005","Testa di Moro RAL 8019","Corten","Bronzo"],
  pvc: ["Bianco","Avorio","Quercia","Noce","Ciliegio","Grigio","Antracite","Douglas"],
  legno: ["Naturale","Noce","Castagno","Rovere","Mogano","Laccato Bianco","Laccato RAL"],
  ferro: ["Grezzo","Verniciato Nero","Verniciato Grafite","Corten","Micaceo"],
  taglio_termico: ["Bianco RAL 9010","Grigio RAL 7016","Nero RAL 9005","Bronzo","Corten","Bicolore"],
};
const DEFAULT_TIPOLOGIE = ["Finestra 1 anta","Finestra 2 ante","Balcone 1 anta","Balcone 2 ante","Scorrevole","Vasistas","Fisso","Portoncino","Porta interna","Porta blindata","Tapparella","Zanzariera","Cassonetto","Persiana","Inferriata","Vetrata composta","Vetrata fissa","Lamiera","Sopraluce","Sottoluce","Pannello fisso"];
const DEFAULT_VETRI = [
  "4/16/4 Basso Emissivo","4/20/4 Basso Emissivo","4/16/4 Standard","4/12/4/12/4 Triplo",
  "33.1/16/4 Basso Emissivo","44.2/16/4 Antisfondamento","33.1/14/33.1 Stratificato",
  "Vetro Singolo 4mm","Vetro Singolo 6mm","Vetro Temperato 8mm","Vetro Temperato 10mm",
  "Satinato 4/16/4","Opaco 4/16/4","Specchiato","Vetro Stampato","Vetro Retinato",
  "Vetrocamera Fonoisolante","Vetro Blindato","Pannello Pieno","Pannello Tamburato",
];

function emptyUserSettings() {
  return { sistemi: [], categorie: [], colori: {}, listino: [], tipologie: [], vetri: [], checklists: {}, azienda: { nome:"", email:"", telefono:"", indirizzo:"", piva:"", cf:"" }, setupCompleted: false };
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
    vetri: sRes.data.colori?._vetri || DEFAULT_VETRI,
    checklists: sRes.data.colori?._checklists || {},
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
    new Notification(title, { body, icon: "" });
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
  const [saveError, setSaveError] = useState<string|null>(null);
  const [appTheme, setAppTheme] = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem("ff-theme") || "classic";
    return "classic";
  });
  S = getThemeStyles(appTheme);
  function changeTheme(key: string) {
    setAppTheme(key);
    localStorage.setItem("ff-theme", key);
  }
  const [selPratica, setSelPratica] = useState<string|null>(null);
  const [selClient, setSelClient] = useState<string|null>(null);
  const [filter, setFilter] = useState("tutti");
  const [filterFase, setFilterFase] = useState("tutte");
  const [filterTipo, setFilterTipo] = useState("tutti");
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
  // TEAM
  const [org, setOrg] = useState<any>(null);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [myMember, setMyMember] = useState<any>(null);
  // NOTIFICATIONS & APPUNTAMENTI
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const [appuntamenti, setAppuntamenti] = useState<any[]>([]);
  const [appForm, setAppForm] = useState<any>(null);

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

  // ===== GLOBAL MOBILE CSS =====
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `
      html, body { overflow-x: hidden !important; width: 100% !important; max-width: 100vw !important; -webkit-text-size-adjust: 100%; }
      * { box-sizing: border-box !important; }
      input, select, textarea { max-width: 100% !important; font-size: 16px !important; }
      img { max-width: 100% !important; height: auto !important; }
      table { max-width: 100% !important; }
      button { max-width: 100%; }
      @media (max-width: 400px) {
        body { font-size: 14px; }
        [style*="padding: 20px"], [style*="padding:20"] { padding: 12px !important; }
      }
      ${AUTOFLOW_CSS}
    `;
    // Ensure viewport meta is correct
    let viewport = document.querySelector('meta[name="viewport"]');
    if (!viewport) {
      viewport = document.createElement("meta");
      viewport.setAttribute("name", "viewport");
      document.head.appendChild(viewport);
    }
    viewport.setAttribute("content", "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover");
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  // ===== LOAD DATA FROM SUPABASE =====
  useEffect(() => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    loadFromSupabase(user.id).then(data => {
      setDb(data);
      if (data.userSettings) {
        setUserSettings(data.userSettings);
        try { localStorage.setItem("ff-settings", JSON.stringify({azienda: data.userSettings.azienda||{}})); } catch(e) {}
      }
      if (data.userSettings && !data.userSettings.setupCompleted) setView("setup_wizard");
      setLoading(false);
    }).catch(() => {
      setDb(loadData());
      setLoading(false);
    });
    // Load team data
    loadTeamData(user);
    // Load notifications
    loadNotifications(user);
    // Load appuntamenti
    loadAppuntamenti(user);
    requestNotificationPermission();
    // Cleanup old localStorage keys
    try { localStorage.removeItem("ff-view"); localStorage.removeItem("ff-sel-pratica"); } catch(e) {}
  }, [user]);

  async function loadTeamData(u: any) {
    if (!u) return;
    try {
      // Find my membership
      const { data: myMemberships, error: tmError } = await supabase.from("team_members").select("*").eq("user_id", u.id).eq("attivo", true);
      if (tmError) { console.warn("team_members not available:", tmError.message); return; }
      if (myMemberships && myMemberships.length > 0) {
        const membership = myMemberships[0];
        setMyMember(membership);
        // Load org
        const { data: orgData } = await supabase.from("organizations").select("*").eq("id", membership.org_id).single();
        if (orgData) setOrg(orgData);
        // Load all team members
        const { data: members } = await supabase.from("team_members").select("*").eq("org_id", membership.org_id).eq("attivo", true);
        if (members) setTeamMembers(members);
      } else {
        // Check if user has an org as creator
        const { data: orgs } = await supabase.from("organizations").select("*").eq("created_by", u.id);
        if (orgs && orgs.length > 0) {
          setOrg(orgs[0]);
          const { data: members } = await supabase.from("team_members").select("*").eq("org_id", orgs[0].id).eq("attivo", true);
          if (members) setTeamMembers(members);
          const me = members?.find((m: any) => m.user_id === u.id);
          if (me) setMyMember(me);
        }
      }
    } catch (err) { console.warn("Load team skipped:", err); }
  }

  async function loadNotifications(u: any) {
    if (!u) return;
    try {
      const { data } = await supabase.from("notifications").select("*").eq("user_id", u.id).order("created_at", { ascending: false }).limit(50);
      if (data) setNotifications(data);
    } catch(e) { console.warn("Notifications not available:", e); }
  }

  async function addNotification(userId: string, tipo: string, titolo: string, messaggio: string, praticaId?: string) {
    try {
      const row = { user_id: userId, org_id: org?.id || null, tipo, titolo, messaggio, pratica_id: praticaId || null, letto: false };
      const { data } = await supabase.from("notifications").insert(row).select().single();
      // If it's for the current user, update local state
      if (userId === user?.id && data) setNotifications(prev => [data, ...prev]);
    } catch(e) { console.warn("Add notification failed:", e); }
  }

  async function markNotifRead(id: string) {
    setNotifications(prev => prev.map(n => n.id === id ? {...n, letto: true} : n));
    await supabase.from("notifications").update({ letto: true }).eq("id", id);
  }
  async function markAllNotifsRead() {
    setNotifications(prev => prev.map(n => ({...n, letto: true})));
    await supabase.from("notifications").update({ letto: true }).eq("user_id", user?.id).eq("letto", false);
  }

  async function loadAppuntamenti(u: any) {
    if (!u) return;
    try {
      const { data } = await supabase.from("appuntamenti").select("*").order("data", { ascending: true });
      if (data) setAppuntamenti(data);
    } catch(e) { console.warn("Appuntamenti not available:", e); }
  }

  async function saveAppuntamento(app: any) {
    if (!user) return;
    const row = { ...app, user_id: user.id, org_id: org?.id || null };
    if (app.id) {
      await supabase.from("appuntamenti").update(row).eq("id", app.id);
      setAppuntamenti(prev => prev.map(a => a.id === app.id ? {...a, ...row} : a));
    } else {
      const { data } = await supabase.from("appuntamenti").insert(row).select().single();
      if (data) setAppuntamenti(prev => [...prev, data]);
    }
  }

  async function deleteAppuntamento(id: string) {
    setAppuntamenti(prev => prev.filter(a => a.id !== id));
    await supabase.from("appuntamenti").delete().eq("id", id);
  }

  async function convertAppToPratica(app: any) {
    const c = db.clients.find((cl: any) => cl.id === app.client_id);
    const seq = db.nextSeq || 1;
    const numero = genPraticaNum(new Date().getFullYear(), seq);
    const newPratica: any = {
      id: gid(), clientId: app.client_id, numero, data: app.data, ora: app.ora,
      indirizzo: app.indirizzo || c?.indirizzo || "", tipo: app.tipo === "riparazione" ? "riparazione" : "nuovo_infisso",
      fase: app.tipo || "sopralluogo", status: "da_fare", note: app.note || "",
      actions: [], misure: null, riparazione: null, preventivo: null, confermaOrdine: null,
      fattura: null, emails: [], fotoSopralluogo: [], fotoPosaInizio: [], fotoPosaFine: [],
      fotoPosaVani: {}, messaggi: [], assegnatoA: app.assegnato_a || null, log: [],
    };
    // Save pratica to Supabase
    const dbRow = praticaToDb(newPratica, user?.id||"");
    const { data: saved, error } = await supabase.from("pratiche").insert(dbRow).select().single();
    if (error) { alert("Errore creazione pratica: " + error.message); return; }
    const fullPratica = saved ? dbToPratica(saved) : newPratica;
    setDb((prev: any) => ({...prev, pratiche: [...prev.pratiche, fullPratica], nextSeq: seq + 1}));
    // Mark appointment as converted
    await supabase.from("appuntamenti").update({ stato: "convertito", pratica_id: fullPratica.id }).eq("id", app.id);
    setAppuntamenti(prev => prev.map(a => a.id === app.id ? {...a, stato: "convertito", pratica_id: fullPratica.id} : a));
    // Navigate to the new pratica
    setSelPratica(fullPratica.id);
    setView("pratica");
    alert(`✅ Pratica ${numero} creata da appuntamento!`);
  }

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
          sendNotification(` Appuntamento tra 30 min`, `${p.numero} - ${c?.nome||""} alle ${p.ora}`);
        }
        if (mins === 0) {
          const c = db.clients.find((cl: any)=>cl.id===p.clientId);
          sendNotification(` Appuntamento ORA`, `${p.numero} - ${c?.nome||""}`);
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
  // Custom checklists: use user's custom if available, else default
  function getTasksForPhase(phase: string): string[] {
    const custom = userSettings?.checklists?.[phase];
    if (custom && custom.length > 0) return custom;
    return DEFAULT_TASKS[phase] || [];
  }

  function saveClient(c: any) {
    const isNew = !c.id || !db.clients.find((x: any)=>x.id===c.id);
    if (isNew) {
      c.id = gid(); c.createdAt = new Date().toISOString();
    }
    setDb((prev: any) => {
      const clients = isNew ? [...prev.clients, c] : prev.clients.map((x: any)=>x.id===c.id?c:x);
      const next = {...prev, clients};
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch(e) {}
      return next;
    });
    if (user) {
      const row = clientToDb(c, user.id);
      if (org?.id) row.org_id = org.id;
      supabase.from("clients").upsert(row).then(({error}) => { 
        if(error) { 
          console.error("saveClient:", error);
          if (!error.message?.includes("infinite recursion")) {
            setSaveError("Errore salvataggio cliente: " + error.message);
            setTimeout(()=>setSaveError(null), 4000);
          }
        }
      });
    }
    return c;
  }

  function createPratica(clientId: string, indirizzo: string, tipo: string, data: string, ora: string, note: string, praticaCollegata?: string) {
    const year = new Date().getFullYear();
    const numero = genPraticaNum(year, db.nextSeq);
    const sopralluogoAction = {
      id: gid(), type: "sopralluogo", createdAt: new Date().toISOString(),
      status: "da_fare",
      tasks: getTasksForPhase("sopralluogo").map((t: string)=>({id:gid(),text:t,done:false})),
    };
    const p: any = {
      id: gid(), numero, clientId, indirizzo: indirizzo||"",
      tipo, data: data||today(), ora: ora||"09:00", note: note||"",
      fase: "sopralluogo",
      status: "da_fare", actions: [sopralluogoAction], misure: null, riparazione: null, preventivo: null,
      confermaOrdine: null, fattura: null,
      emails: [], orgId: org?.id||null, createdAt: new Date().toISOString(),
      praticaCollegata: praticaCollegata||null,
      log: [{ ts: new Date().toISOString(), msg: `Pratica creata (${tipo})${praticaCollegata ? " — collegata a pratica esistente" : ""}`, by: user?.email || "system" }],
    };
    setDb((prev: any) => {
      const next = {...prev, pratiche: [...prev.pratiche, p], nextSeq: prev.nextSeq+1};
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch(e) {}
      return next;
    });
    if (user) {
      const row = praticaToDb(p, user.id);
      supabase.from("pratiche").insert(row).then(({error}) => { 
        if(error) { 
          console.error("createPratica:", error);
          if (!error.message?.includes("infinite recursion")) {
            setSaveError("Errore creazione pratica: " + error.message);
            setTimeout(()=>setSaveError(null), 4000);
          }
        }
      });
    }
    return p;
  }

  function updatePratica(id: string, updates: any) {
    let updatedP: any = null;
    setDb((prev: any) => {
      const pratiche = prev.pratiche.map((p: any) => {
        if (p.id !== id) return p;
        updatedP = {...p, ...updates};
        return updatedP;
      });
      const next = {...prev, pratiche};
      // Backup to localStorage immediately
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch(e) {}
      return next;
    });
    // Save to Supabase immediately (no setTimeout)
    if (user && updatedP) {
      try {
        const row = praticaToDb(updatedP, user.id);
        supabase.from("pratiche").update(row).eq("id", id).then(({error}) => { 
          if(error) { 
            console.error("updatePratica:", error.message, error.details);
            if (!error.message?.includes("infinite recursion")) {
              setSaveError("Errore salvataggio: " + error.message);
              setTimeout(()=>setSaveError(null), 4000);
            }
          }
        });
      } catch(e) { console.error("updatePratica serialize error:", e); }
    }
  }

  function deletePratica(id: string) {
    setDb((prev: any) => {
      const next = {...prev, pratiche: prev.pratiche.filter((p: any)=>p.id!==id)};
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch(e) {}
      return next;
    });
    if (user) { supabase.from("pratiche").delete().eq("id", id).then(({error}) => { if(error) console.error("deletePratica:", error); }); }
    if (selPratica===id) { setSelPratica(null); setView("dashboard"); }
  }

  function duplicaPratica(id: string) {
    const orig = getPratica(id);
    if (!orig) return;
    const seq = db.nextSeq || (db.pratiche.length + 1);
    const dup: any = {
      ...JSON.parse(JSON.stringify(orig)),
      id: gid(),
      numero: `FF-${String(seq).padStart(4,"0")}`,
      status: "da_fare",
      fase: orig.tipo === "riparazione" ? "sopralluogo" : "sopralluogo",
      createdAt: new Date().toISOString(),
      data: today(),
      actions: [],
      confermaOrdine: null,
      fattura: null,
      emails: [],
      log: [{ ts: new Date().toISOString(), msg: `Duplicata da ${orig.numero}`, by: user?.email || "system" }],
    };
    // Keep misure and preventivo as reference, clear signatures
    if (dup.confermaOrdine) delete dup.confermaOrdine;
    setDb((prev: any) => {
      const next = {...prev, pratiche: [...prev.pratiche, dup], nextSeq: seq + 1};
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch(e) {}
      return next;
    });
    if (user) {
      const row = praticaToDb(dup, user.id);
      supabase.from("pratiche").insert(row).then(({error}) => { if(error) console.error("duplicaPratica:", error); });
    }
    setSelPratica(dup.id); setView("pratica");
  }

  function logActivity(praticaId: string, msg: string) {
    const entry = { ts: new Date().toISOString(), msg, by: user?.email || "system" };
    updatePratica(praticaId, { log: [...(getPratica(praticaId)?.log || []), entry] });
  }

  function exportBackup() {
    const data = { clients: db.clients, pratiche: db.pratiche, notes: db.notes || [], settings: userSettings, exportedAt: new Date().toISOString(), version: "frameflow-v4" };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `frameflow-backup-${today()}.json`; a.click();
    URL.revokeObjectURL(url);
  }

  function importBackup(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        if (!data.clients || !data.pratiche) { alert("File non valido"); return; }
        if (!confirm(`Importare ${data.clients.length} clienti e ${data.pratiche.length} pratiche? I dati attuali verranno SOSTITUITI.`)) return;
        const newDb = { clients: data.clients, pratiche: data.pratiche, notes: data.notes || [], nextSeq: Math.max(...data.pratiche.map((p: any) => parseInt(p.numero?.replace("FF-","")||"0")), 0) + 1, settings: db.settings };
        setDb(newDb);
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(newDb)); } catch(e2) {}
        if (data.settings) { saveUserSettingsToDb(data.settings); }
        // Re-save all to Supabase
        if (user) {
          data.clients.forEach((c: any) => { supabase.from("clients").upsert({ ...c, user_id: user.id }).then(() => {}); });
          data.pratiche.forEach((p: any) => { supabase.from("pratiche").upsert(praticaToDb(p, user.id)).then(() => {}); });
        }
        alert(`Importati: ${data.clients.length} clienti, ${data.pratiche.length} pratiche`);
      } catch(err) { alert("Errore nel file: " + err); }
    };
    reader.readAsText(file);
  }

  function addAction(praticaId: string, actionKey: string) {
    const p = getPratica(praticaId);
    if (!p) return;
    const newAct = {
      id: gid(), type: actionKey, createdAt: new Date().toISOString(),
      status: "da_fare",
      tasks: getTasksForPhase(actionKey).map((t: string)=>({id:gid(),text:t,done:false})),
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
    if (curIdx >= wf.length - 1) return;
    const nextPhase = wf[curIdx + 1];
    const hasAction = p.actions.find((a: any) => a.type === nextPhase.key);
    let newActions = [...p.actions];
    if (!hasAction && getTasksForPhase(nextPhase.key).length > 0) {
      newActions.push({
        id: gid(), type: nextPhase.key, createdAt: new Date().toISOString(),
        status: "da_fare",
        tasks: getTasksForPhase(nextPhase.key).map((t: string)=>({id:gid(),text:t,done:false})),
      });
    }
    const logEntry = { ts: new Date().toISOString(), msg: `Fase → ${nextPhase.label}`, by: user?.email || "system" };
    updatePratica(praticaId, { fase: nextPhase.key, actions: newActions, status: "in_corso", log: [...(p.log || []), logEntry] });
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
    let mainSt = p.status;
    const anyStarted = actions.some((a: any)=>a.status!=="da_fare");
    if (anyStarted && mainSt==="da_fare") mainSt="in_corso";
    updatePratica(praticaId, { actions, status: mainSt });
  }

  function addTaskToAction(praticaId: string, actionId: string, text: string) {
    const p = getPratica(praticaId);
    if (!p || !text.trim()) return;
    const actions = p.actions.map((a: any) => {
      if (a.id !== actionId) return a;
      return {...a, tasks: [...a.tasks, {id: gid(), text: text.trim(), done: false}]};
    });
    updatePratica(praticaId, { actions });
  }

  function removeTaskFromAction(praticaId: string, actionId: string, taskId: string) {
    const p = getPratica(praticaId);
    if (!p) return;
    const actions = p.actions.map((a: any) => {
      if (a.id !== actionId) return a;
      return {...a, tasks: a.tasks.filter((t: any) => t.id !== taskId)};
    });
    updatePratica(praticaId, { actions });
  }

  function saveMisure(praticaId: string, misureData: any) {
    const p = getPratica(praticaId);
    const logEntry = { ts: new Date().toISOString(), msg: `Misure salvate (${(misureData.vani||[]).length} vani)`, by: user?.email || "system" };
    updatePratica(praticaId, { misure: misureData, log: [...(p?.log || []), logEntry] });
    setMisureEdit(null); setSelPratica(praticaId); setView("pratica");
  }

  function saveRiparazione(praticaId: string, ripData: any) {
    const p = getPratica(praticaId);
    const logEntry = { ts: new Date().toISOString(), msg: `Riparazione salvata: ${ripData.problema||""}`, by: user?.email || "system" };
    updatePratica(praticaId, { riparazione: ripData, log: [...(p?.log || []), logEntry] });
    setRipEdit(null); setSelPratica(praticaId); setView("pratica");
  }

  function savePreventivo(praticaId: string, prevData: any) {
    const p = getPratica(praticaId);
    const logEntry = { ts: new Date().toISOString(), msg: `Preventivo ${prevData.totaleFinale ? "salvato" : "aggiornato"}`, by: user?.email || "system" };
    updatePratica(praticaId, { preventivo: prevData, log: [...(p?.log || []), logEntry] });
    setPrevEdit(null); setSelPratica(praticaId); setView("pratica");
  }

  function confirmOrder(praticaId: string, firmaImg: string, note: string) {
    const p = getPratica(praticaId);
    const logEntry = { ts: new Date().toISOString(), msg: "Ordine confermato con firma", by: user?.email || "system" };
    updatePratica(praticaId, { 
      confermaOrdine: { firmata: true, firmaImg, dataConferma: new Date().toISOString(), note },
      log: [...(p?.log || []), logEntry]
    });
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
    // Cache azienda for PDF export
    try { localStorage.setItem("ff-settings", JSON.stringify({azienda: newSettings.azienda||{}})); } catch(e) {}
    if (!user) return;
    const row = {
      user_id: user.id,
      sistemi: newSettings.sistemi || [],
      categorie: newSettings.categorie || [],
      colori: { ...newSettings.colori, _tipologie: newSettings.tipologie || [], _vetri: newSettings.vetri || [], _checklists: newSettings.checklists || {} },
      listino: newSettings.listino || [],
      azienda: newSettings.azienda || {},
      setup_completed: newSettings.setupCompleted || false,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("user_settings").upsert(row, { onConflict: "user_id" });
    if (error) console.error("saveUserSettings:", error);
  }

  // ===== TEAM FUNCTIONS =====
  const isAdmin = myMember?.ruolo === "admin" || (org && org.created_by === user?.id) || !myMember;
  const myRole = myMember?.ruolo || "admin";
  const myRoleCfg = ROLES[myRole] || ROLES.admin;
  const myPermissions: string[] = myMember?.permessi || myRoleCfg.permessi;
  const canSeeNav: string[] = myRoleCfg.canSee;

  async function createOrganization(orgData: any) {
    if (!user) return;
    const nome = typeof orgData === "string" ? orgData : orgData.nome;
    const { data: orgRow, error } = await supabase.from("organizations").insert({
      nome, created_by: user.id,
      email: orgData.email || user.email,
      telefono: orgData.telefono || "",
      indirizzo: orgData.indirizzo || "",
      piva: orgData.piva || "",
    }).select().single();
    if (error) { console.error("Create org:", error); return; }
    // Add self as admin
    const { data: memberData, error: mErr } = await supabase.from("team_members").insert({
      org_id: orgRow.id, user_id: user.id, nome: user.email?.split("@")[0] || "Admin",
      email: user.email, ruolo: "admin", permessi: ROLES.admin.permessi,
      invite_accepted: true,
    }).select().single();
    if (mErr) { console.error("Add admin:", mErr); return; }
    setOrg(orgRow);
    setMyMember(memberData);
    setTeamMembers([memberData]);
    // Update existing pratiche and clients with org_id
    await supabase.from("pratiche").update({ org_id: orgRow.id }).eq("user_id", user.id);
    await supabase.from("clients").update({ org_id: orgRow.id }).eq("user_id", user.id);
  }

  async function addTeamMember(nome: string, email: string, ruolo: string, permessi: string[]) {
    if (!org || !isAdmin) return;
    const token = Math.random().toString(36).substr(2, 12);
    const { data, error } = await supabase.from("team_members").insert({
      org_id: org.id, nome, email, ruolo, permessi, invite_token: token, invite_accepted: false,
    }).select().single();
    if (error) { console.error("Add member:", error); alert("Errore: " + error.message); return; }
    setTeamMembers(prev => [...prev, data]);
    return data;
  }

  async function updateTeamMember(memberId: string, updates: any) {
    if (!isAdmin) return;
    const { error } = await supabase.from("team_members").update(updates).eq("id", memberId);
    if (error) { console.error("Update member:", error); return; }
    setTeamMembers(prev => prev.map(m => m.id === memberId ? { ...m, ...updates } : m));
  }

  async function removeTeamMember(memberId: string) {
    if (!isAdmin) return;
    const { error } = await supabase.from("team_members").update({ attivo: false }).eq("id", memberId);
    if (error) { console.error("Remove member:", error); return; }
    setTeamMembers(prev => prev.filter(m => m.id !== memberId));
  }

  async function assignPratica(praticaId: string, memberId: string | null) {
    updatePratica(praticaId, { assegnatoA: memberId });
    await supabase.from("pratiche").update({ assegnato_a: memberId }).eq("id", praticaId);
    // Create notification for assigned member
    if (memberId) {
      const member = teamMembers.find(m => m.id === memberId);
      const pratica = db.pratiche.find((p: any) => p.id === praticaId);
      const client = db.clients.find((c: any) => c.id === pratica?.clientId);
      const myName = myMember?.nome || user?.email?.split("@")[0] || "Admin";
      
      // Build linked pratica history for repairs
      let linkedInfo = "";
      if (pratica?.praticaCollegata) {
        const linked = db.pratiche.find((p: any) => p.id === pratica.praticaCollegata);
        if (linked) {
          const linkedClient = db.clients.find((c: any) => c.id === linked.clientId);
          linkedInfo += `\n\n--- PRATICA ORIGINALE: ${linked.numero} ---`;
          linkedInfo += `\nCliente: ${linkedClient?.nome || "—"}`;
          linkedInfo += `\nIndirizzo: ${linked.indirizzo || "—"}`;
          linkedInfo += `\nData pratica originale: ${fmtDate(linked.data||"")}`;
          linkedInfo += `\nStato: ${linked.status} — Fase: ${linked.fase}`;
          // Infissi montati
          const vani = linked.misure?.vani || [];
          if (vani.length > 0) {
            linkedInfo += `\n\nINFISSI MONTATI (${vani.length}):`;
            vani.forEach((v: any, i: number) => {
              linkedInfo += `\n  ${i+1}. ${v.sistema||"Infisso"} ${v.l||0}×${v.h||0}mm`;
              if (v.ambiente) linkedInfo += ` — ${v.ambiente}`;
              if (v.apertura) linkedInfo += ` (${v.apertura})`;
              if (v.colore) linkedInfo += ` — Colore: ${v.colore}`;
              if (v.vetro) linkedInfo += ` — Vetro: ${v.vetro}`;
            });
          }
          // Preventivo
          const prev = linked.preventivo;
          if (prev?.prodotti?.length > 0) {
            const totale = prev.prodotti.reduce((s: number, pr: any) => s + (parseFloat(pr.totale)||0), 0);
            linkedInfo += `\n\nPREVENTIVO: €${totale.toFixed(2)}`;
            prev.prodotti.forEach((pr: any, i: number) => {
              linkedInfo += `\n  ${i+1}. ${pr.descrizione||"Prodotto"} ${pr.larghezza&&pr.altezza?`(${pr.larghezza}×${pr.altezza})`:""}  €${parseFloat(pr.totale||0).toFixed(2)} ×${pr.quantita||1}`;
            });
          }
          // Log
          const logs = linked.log || [];
          if (logs.length > 0) {
            linkedInfo += `\n\nCRONOLOGIA:`;
            logs.slice(-5).forEach((l: any) => {
              linkedInfo += `\n  ${new Date(l.ts).toLocaleDateString("it-IT")} — ${l.msg}`;
            });
          }
          linkedInfo += `\n---`;
        }
      }

      if (member?.user_id) {
        const notifMsg = pratica?.praticaCollegata 
          ? `${myName} ti ha assegnato la riparazione ${pratica?.numero || ""} — ${client?.nome || "Cliente"} (${pratica?.indirizzo || ""}). Collegata a pratica originale, vedi dettagli in app.`
          : `${myName} ti ha assegnato la pratica ${pratica?.numero || ""} — ${client?.nome || "Cliente"} (${pratica?.indirizzo || ""})`;
        await addNotification(
          member.user_id,
          "assegnazione",
          pratica?.praticaCollegata ? `🔧 Riparazione assegnata` : `Pratica assegnata a te`,
          notifMsg,
          praticaId
        );
        // Browser notification
        sendNotification(pratica?.praticaCollegata ? "Riparazione assegnata" : "Pratica assegnata", `${pratica?.numero} - ${client?.nome||""}`);
        // Email notification (opens mailto)
        if (member.email) {
          const isRepair = !!pratica?.praticaCollegata;
          const subject = isRepair 
            ? `FrameFlow: 🔧 Riparazione ${pratica?.numero || ""} — ${client?.nome || ""}`
            : `FrameFlow: Pratica ${pratica?.numero || ""} assegnata a te`;
          const body = `Ciao ${member.nome},\n\n${myName} ti ha assegnato ${isRepair?"la riparazione":"la pratica"} ${pratica?.numero || ""}.\n\nCliente: ${client?.nome || "—"}\nIndirizzo: ${pratica?.indirizzo || "—"}\nData: ${fmtDate(pratica?.data||"")} ore ${pratica?.ora||""}\nNote: ${pratica?.note || "—"}${linkedInfo}\n\nApri FrameFlow per tutti i dettagli.\n\nFrameFlow`;
          window.open(`mailto:${member.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, "_blank");
        }
      }
    }
  }

  // Dynamic lists from settings
  const userSistemi = useMemo(() => userSettings.sistemi?.length > 0 ? userSettings.sistemi : DEFAULT_SISTEMI, [userSettings.sistemi]);
  const userCategorie = useMemo(() => userSettings.categorie?.length > 0 ? userSettings.categorie : DEFAULT_CATEGORIE, [userSettings.categorie]);
  const userTipologie = useMemo(() => userSettings.tipologie?.length > 0 ? userSettings.tipologie : DEFAULT_TIPOLOGIE, [userSettings.tipologie]);
  const userVetri = useMemo(() => userSettings.vetri?.length > 0 ? userSettings.vetri : DEFAULT_VETRI, [userSettings.vetri]);
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
  const myPratiche = useMemo(() => {
    if (isAdmin || !myMember) return db.pratiche;
    return db.pratiche.filter((p: any) => p.assegnatoA === myMember.id);
  }, [db.pratiche, isAdmin, myMember]);
  const todayPratiche = useMemo(() => myPratiche.filter((p: any)=>p.data===today()&&p.status!=="completato"), [myPratiche]);
  const tomorrowPratiche = useMemo(() => {
    const tom = new Date(); tom.setDate(tom.getDate()+1);
    return myPratiche.filter((p: any)=>p.data===tom.toISOString().split("T")[0]&&p.status!=="completato");
  }, [myPratiche]);
  const upcomingPratiche = useMemo(() => {
    return myPratiche.filter((p: any)=>p.status!=="completato"&&daysFromNow(p.data)>=0).sort((a: any,b: any)=>a.data.localeCompare(b.data)||a.ora.localeCompare(b.ora)).slice(0,8);
  }, [myPratiche]);
  const overduePratiche = useMemo(() => myPratiche.filter((p: any)=>p.status!=="completato"&&daysFromNow(p.data)<0), [myPratiche]);
  const recentEmails = useMemo(() => {
    const allEmails: any[] = [];
    myPratiche.forEach((p: any) => {
      (p.emails||[]).forEach((e: any) => {
        allEmails.push({...e, praticaNum: p.numero, clientId: p.clientId});
      });
    });
    return allEmails.sort((a,b)=>(b.sentAt||"").localeCompare(a.sentAt||"")).slice(0,5);
  }, [myPratiche]);

  const counts = useMemo(() => ({
    tutti: myPratiche.length,
    da_fare: myPratiche.filter((p: any)=>p.status==="da_fare").length,
    in_corso: myPratiche.filter((p: any)=>p.status==="in_corso").length,
    completato: myPratiche.filter((p: any)=>p.status==="completato").length,
  }), [myPratiche]);

  // KPI calculations
  const kpi = useMemo(() => {
    const now = new Date();
    const thisMonth = now.getFullYear()+"-"+String(now.getMonth()+1).padStart(2,"0");
    const prevMonth = now.getMonth()===0 ? (now.getFullYear()-1)+"-12" : now.getFullYear()+"-"+String(now.getMonth()).padStart(2,"0");
    // Fatturato
    let fattMese = 0, fattPrec = 0, fattTot = 0;
    const conPrev = myPratiche.filter((p: any)=>p.preventivo);
    const conConferma = myPratiche.filter((p: any)=>p.confermaOrdine?.firmata);
    myPratiche.forEach((p: any) => {
      const tot = p.preventivo?.totaleFinale || 0;
      if (p.confermaOrdine?.firmata) {
        fattTot += tot;
        const d = (p.confermaOrdine.dataConferma||"").substring(0,7);
        if (d===thisMonth) fattMese += tot;
        if (d===prevMonth) fattPrec += tot;
      }
    });
    // Conversion rate
    const convRate = conPrev.length > 0 ? Math.round((conConferma.length/conPrev.length)*100) : 0;
    // Overdue
    const td = today();
    const overdue = myPratiche.filter((p: any)=>p.status!=="completato"&&p.data<td).length;
    // Average days to complete
    const completed = myPratiche.filter((p: any)=>p.status==="completato"&&p.completedAt&&p.createdAt);
    const avgDays = completed.length>0 ? Math.round(completed.reduce((s: number,p: any)=> {
      const d1 = new Date(p.createdAt).getTime(); const d2 = new Date(p.completedAt).getTime();
      return s + (d2-d1)/(1000*60*60*24);
    },0)/completed.length) : 0;
    // Pagamenti
    const pagato = myPratiche.filter((p: any)=>p.fattura?.statoPagamento==="pagato").reduce((s: number,p: any)=>s+(p.preventivo?.totaleFinale||0),0);
    const daPagare = fattTot - pagato;
    return { fattMese, fattPrec, fattTot, convRate, conPrev: conPrev.length, conConferma: conConferma.length, overdue, avgDays, pagato, daPagare };
  }, [myPratiche]);

  const [taskSort, setTaskSort] = useState<string>("fase");
  const pendingTasks = useMemo(() => {
    const tasks: any[] = [];
    myPratiche.forEach((p: any) => {
      if (p.status==="completato") return;
      p.actions.forEach((a: any) => {
        a.tasks.forEach((t: any) => {
          if (!t.done) {
            const cfg = ACTIONS_CFG.find(ac=>ac.key===a.type);
            tasks.push({ ...t, praticaId: p.id, praticaNum: p.numero, praticaData: p.data, praticaFase: p.fase, praticaStatus: p.status, actionId: a.id, actionIcon: cfg?.icon||"", actionLabel: cfg?.label||a.type, clientId: p.clientId });
          }
        });
      });
    });
    // Sort
    if (taskSort === "data") tasks.sort((a,b) => (a.praticaData||"").localeCompare(b.praticaData||""));
    else if (taskSort === "urgenza") tasks.sort((a,b) => { const ord: Record<string,number> = {urgente:0,alta:1,media:2,bassa:3}; return (ord[a.praticaStatus]??2) - (ord[b.praticaStatus]??2); });
    else if (taskSort === "cliente") tasks.sort((a,b) => { const ca = getClient(a.clientId)?.nome||""; const cb = getClient(b.clientId)?.nome||""; return ca.localeCompare(cb); });
    // fase sort (default)
    else tasks.sort((a,b) => { const faseOrd = ["sopralluogo","preventivo","misure","ordine","produzione","posa","chiusura"]; return faseOrd.indexOf(a.praticaFase) - faseOrd.indexOf(b.praticaFase); });
    return tasks.slice(0, 20);
  }, [db.pratiche, taskSort]);

  const filteredPratiche = useMemo(() => {
    let list = db.pratiche;
    if (!isAdmin && myMember) {
      list = list.filter((p: any) => p.assegnatoA === myMember.id);
    }
    if (filter!=="tutti") list = list.filter((p: any)=>p.status===filter);
    if (filterFase!=="tutte") list = list.filter((p: any)=>p.fase===filterFase);
    if (filterTipo!=="tutti") list = list.filter((p: any)=>p.tipo===filterTipo);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter((p: any) => {
        const c = getClient(p.clientId);
        return p.numero.toLowerCase().includes(s) || c?.nome?.toLowerCase().includes(s) || p.indirizzo?.toLowerCase().includes(s) || (p.note||"").toLowerCase().includes(s);
      });
    }
    return [...list].sort((a: any,b: any)=>b.createdAt.localeCompare(a.createdAt));
  }, [db, filter, filterFase, filterTipo, search, isAdmin, myMember]);

  const filteredClients = useMemo(() => {
    if (!clientSearch) return db.clients;
    const s = clientSearch.toLowerCase();
    return db.clients.filter((c: any) => c.nome.toLowerCase().includes(s) || c.telefono?.includes(s) || c.indirizzo?.toLowerCase().includes(s) || c.email?.toLowerCase().includes(s) || c.piva?.includes(s) || c.codiceFiscale?.toLowerCase().includes(s));
  }, [db.clients, clientSearch]);

  // ===== AUTH LOADING =====
  if (authLoading) return <div style={S.loadWrap}><p style={{color:"#fff",fontSize:18,fontWeight:800,letterSpacing:"-0.3px"}}>FRAMEFLOW</p></div>;

  // ===== LOGIN / REGISTER =====
  if (!user) {
    return (
      <div style={{...S.container,background:"#1a1a2e",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"100vh",padding:24}}>
        <h1 style={{color:"#e07a2f",fontSize:28,fontWeight:800,marginBottom:4,letterSpacing:"3px",fontFamily:"'JetBrains Mono','SF Mono',monospace",textTransform:"uppercase"}}>FRAMEFLOW</h1>
        <p style={{color:"#5c6370",fontSize:12,fontWeight:600,marginBottom:32,letterSpacing:"2px",fontFamily:"'JetBrains Mono','SF Mono',monospace",textTransform:"uppercase"}}>Gestione Serramenti</p>
        <div style={{width:"100%",maxWidth:380,background:"#fff",borderRadius:2,padding:28,boxShadow:"0 2px 8px rgba(0,0,0,0.12)",border:"1px solid #d5d8de"}}>
          <h2 style={{fontSize:22,fontWeight:900,color:"#1e293b",margin:"0 0 4px",letterSpacing:"-0.5px"}}>{authView==="login"?"Accedi":"Registrati"}</h2>
          <p style={{fontSize:13,color:"#64748b",margin:"0 0 20px"}}>{authView==="login"?"Inserisci le tue credenziali":"Crea il tuo account"}</p>
          {authError && <div style={{background:"#fef2f2",border:"1.5px solid #ef4444",borderRadius:2,padding:"10px 14px",marginBottom:14,fontSize:13,color:"#dc2626",fontWeight:600}}> {authError}</div>}
          {authMsg && <div style={{background:"#ecfdf5",border:"1.5px solid #059669",borderRadius:2,padding:"10px 14px",marginBottom:14,fontSize:13,color:"#059669",fontWeight:600}}> {authMsg}</div>}
          <div style={{marginBottom:14}}>
            <label style={{fontSize:12,fontWeight:800,color:"#374151",textTransform:"uppercase",letterSpacing:"0.5px",display:"block",marginBottom:4}}>Email</label>
            <input value={authEmail} onChange={(e: any)=>setAuthEmail(e.target.value)} placeholder="nome@email.it" type="email" style={{width:"100%",padding:"14px 16px",borderRadius:2,border:"2px solid #e2e8f0",fontSize:15,outline:"none",boxSizing:"border-box",transition:"border 0.2s"}} onKeyDown={(e: any)=>e.key==="Enter"&&(authView==="login"?handleLogin():handleRegister())} />
          </div>
          <div style={{marginBottom:20}}>
            <label style={{fontSize:12,fontWeight:800,color:"#374151",textTransform:"uppercase",letterSpacing:"0.5px",display:"block",marginBottom:4}}>Password</label>
            <input value={authPass} onChange={(e: any)=>setAuthPass(e.target.value)} placeholder="••••••••" type="password" style={{width:"100%",padding:"14px 16px",borderRadius:2,border:"2px solid #e2e8f0",fontSize:15,outline:"none",boxSizing:"border-box"}} onKeyDown={(e: any)=>e.key==="Enter"&&(authView==="login"?handleLogin():handleRegister())} />
          </div>
          <button onClick={authView==="login"?handleLogin:handleRegister} disabled={!authEmail||!authPass} style={{width:"100%",padding:"15px",borderRadius:2,border:"none",background:authEmail&&authPass?"#e07a2f":"#e2e8f0",color:authEmail&&authPass?"#fff":"#94a3b8",fontSize:14,fontWeight:700,cursor:authEmail&&authPass?"pointer":"default",letterSpacing:"1px",textTransform:"uppercase",fontFamily:"'JetBrains Mono','SF Mono',monospace"}}>{authView==="login"?"ACCEDI":"REGISTRATI"}</button>
          <button onClick={()=>{setAuthView(authView==="login"?"register":"login");setAuthError("");setAuthMsg("");}} style={{width:"100%",marginTop:14,padding:"12px",borderRadius:2,border:"none",background:"transparent",color:"#e07a2f",fontSize:13,fontWeight:700,cursor:"pointer"}}>{authView==="login"?"Non hai un account? Registrati":"Hai già un account? Accedi"}</button>
        </div>
      </div>
    );
  }

  if (loading) return <div style={S.loadWrap}><p style={{color:"#fff",fontSize:18,fontWeight:800,letterSpacing:"-0.3px"}}>FRAMEFLOW</p></div>;

  // ==================== SETUP WIZARD ====================
  if (view==="setup_wizard") {
    return <SetupWizard userSettings={userSettings} onComplete={(s: any)=>{saveUserSettingsToDb({...s,setupCompleted:true});setView("dashboard");}} onSkip={()=>{saveUserSettingsToDb({...userSettings,setupCompleted:true});setView("dashboard");}} />;
  }

  // ==================== SETTINGS ====================
  if (view==="impostazioni") {
    return <SettingsView userSettings={userSettings} appTheme={appTheme} onChangeTheme={changeTheme} onSave={(s: any)=>{saveUserSettingsToDb(s);setView("dashboard");}} onBack={()=>setView("dashboard")} />;
  }

  // ==================== VIEWS ====================
  if (view==="misure" && misureEdit) {
    const p = getPratica(misureEdit); const c = getClient(p?.clientId);
    return <MisureForm pratica={p} client={c} sistemi={userSistemi} tipologie={userTipologie} vetri={userVetri} coloriMap={userColori} allColori={allColori} userId={user?.id} onSave={(d: any)=>saveMisure(misureEdit,d)} onBack={()=>{setMisureEdit(null);setSelPratica(misureEdit);setView("pratica");}} />;
  }
  if (view==="riparazione" && ripEdit) {
    const p = getPratica(ripEdit); const c = getClient(p?.clientId);
    return <RipForm pratica={p} client={c} userId={user?.id} onSave={(d: any)=>saveRiparazione(ripEdit,d)} onBack={()=>{setRipEdit(null);setSelPratica(ripEdit);setView("pratica");}} />;
  }
  if (view==="preventivo" && prevEdit) {
    const p = getPratica(prevEdit); const c = getClient(p?.clientId);
    return <PreventivoForm pratica={p} client={c} userListino={userSettings.listino||[]} userCategorie={userCategorie} userSistemi={userSistemi} onSave={(d: any)=>savePreventivo(prevEdit,d)} onBack={()=>{setPrevEdit(null);setSelPratica(prevEdit);setView("pratica");}} />;
  }
  if (view==="email" && emailDraft) {
    const p = getPratica(emailDraft); const c = getClient(p?.clientId);
    return <EmailView pratica={p} client={c} settings={db.settings} onSend={(d: any)=>{
      const pid = emailDraft;
      try { addEmail(pid, d); } catch(e) { console.error("Email send error:", e); }
      setEmailDraft(null); setSelPratica(pid); setView("pratica");
    }} onBack={()=>{setEmailDraft(null);setSelPratica(emailDraft);setView("pratica");}} />;
  }
  if (view==="note_edit") {
    return <NoteEditor note={noteEdit} pratiche={db.pratiche} clients={db.clients} onSave={(n: any)=>{saveNote(n);setNoteEdit(null);setView("notes");}} onBack={()=>{setNoteEdit(null);setView("notes");}} />;
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
          {p?.indirizzo && <p style={S.pickerAddr}> {p.indirizzo}</p>}
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
          <input value={clientSearch} onChange={e=>setClientSearch(e.target.value)} placeholder=" Cerca cliente..." style={S.searchInp} autoFocus />
          <button onClick={()=>{setClientForm({nome:"",telefono:"",email:"",indirizzo:"",note:""});setView("new_client");}} style={S.newClientBtn}>+ Nuovo Cliente</button>
          {filteredClients.length===0 ? <div style={S.emptyMini}>{clientSearch?"Nessun risultato":"Nessun cliente ancora"}</div>
          : filteredClients.map((c: any)=>(
            <button key={c.id} onClick={()=>{setSelClient(c.id);setClientSearch("");setView("new_pratica");}} style={S.clientRow}>
              <div style={S.clientAvatar}>{c.nome.charAt(0).toUpperCase()}</div>
              <div style={{flex:1}}>
                <div style={{fontSize:15,fontWeight:600,color:"#0f172a"}}>{c.nome}</div>
                {c.telefono && <div style={{fontSize:13,color:"#64748b"}}> {c.telefono}</div>}
              </div>
              <span style={{color:"#e07a2f",fontSize:13,fontWeight:700}}>{db.pratiche.filter((p: any)=>p.clientId===c.id).length} pratiche</span>
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
          }} disabled={!clientForm.nome.trim()} style={{...S.saveBtn,opacity:clientForm.nome.trim()?1:0.5}}>{isEdit?" Salva Modifiche":"Salva e Continua →"}</button>
        </div>
      </div>
    );
  }

  // NEW PRATICA
  if (view==="new_pratica" && selClient) {
    const c = getClient(selClient);
    return <NewPraticaView client={c} pratiche={db.pratiche} clients={db.clients} onCreate={(ind: string,tipo: string,data: string,ora: string,note: string,praticaCollegata?: string)=>{
      const p = createPratica(selClient,ind,tipo,data,ora,note,praticaCollegata);
      setSelClient(null); setSelPratica(p.id); setView("pratica");
    }} onBack={()=>{setSelClient(null);setView("client_pick");}} />;
  }

  // PRATICA DETAIL
  if (view==="pratica" && selPratica) {
    const p = getPratica(selPratica);
    if (!p) {
      // Auto-recover: pratica not found, go back
      setTimeout(() => { setSelPratica(null); setView("pratiche"); }, 0);
      return <div style={S.container}><div style={{padding:40,textAlign:"center"}}><p style={{color:"#5c6370",fontSize:14}}>Caricamento...</p></div></div>;
    }
    const c = getClient(p.clientId);
    return <PraticaDetail pratica={p} client={c} userId={user?.id} teamMembers={teamMembers} isAdmin={isAdmin} permissions={myPermissions}
      onBack={()=>{setSelPratica(null);setView("pratiche");}}
      onDelete={()=>{if(confirm("Eliminare pratica "+p.numero+"?"))deletePratica(p.id);}}
      onAddAction={()=>{setActionPicker(p.id);setView("action_picker");}}
      onToggleTask={(aid: string,tid: string)=>toggleActionTask(p.id,aid,tid)}
      onAddTask={(aid: string,text: string)=>addTaskToAction(p.id,aid,text)}
      onRemoveTask={(aid: string,tid: string)=>removeTaskFromAction(p.id,aid,tid)}
      onOpenMisure={()=>{setMisureEdit(p.id);setView("misure");}}
      onOpenRip={()=>{setRipEdit(p.id);setView("riparazione");}}
      onOpenPrev={()=>{setPrevEdit(p.id);setView("preventivo");}}
      onOpenEmail={()=>{setEmailDraft(p.id);setView("email");}}
      onStatusChange={(s: string)=>{
        const p2 = getPratica(p.id);
        const updates: any = {status:s};
        if (s==="completato") updates.completedAt = new Date().toISOString();
        const logEntry = { ts: new Date().toISOString(), msg: `Stato → ${STATUS[s]?.label||s}`, by: user?.email || "system" };
        updates.log = [...(p2?.log || []), logEntry];
        updatePratica(p.id, updates);
      }}
      onConfirmOrder={(firma: string,note: string)=>confirmOrder(p.id,firma,note)}
      onGenerateFattura={()=>generateFattura(p.id)}
      onUpdateFattura={(data: any)=>updateFattura(p.id,data)}
      onAdvancePhase={()=>advancePhase(p.id)}
      onUpdatePratica={(data: any)=>updatePratica(p.id,data)}
      onAssign={(memberId: string|null)=>assignPratica(p.id,memberId)}
      onDuplica={()=>duplicaPratica(p.id)}
      onStampaCantiere={()=>exportStampaCantiere(p,c)}
      allPratiche={db.pratiche}
      allClients={db.clients}
      onOpenPratica={(id: string)=>{setSelPratica(id);setView("pratica");}}
    />;
  }

  // ==================== BOTTOM NAV ====================
  const allNavItems = [
    { key: "dashboard", icon: "🏠", label: "Home" },
    { key: "appuntamenti", icon: "📅", label: "App." },
    { key: "calendario", icon: "📆", label: "Agenda" },
    { key: "pratiche", icon: "📋", label: "Pratiche" },
    { key: "clienti", icon: "👤", label: "Clienti" },
    { key: "team", icon: "👥", label: "Team" },
  ];
  const navItems = allNavItems.filter(n => canSeeNav.includes(n.key));

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
          <h2 style={S.secTitle}> Cerca</h2>
        </div>
        <div style={{padding:"16px"}}>
          <input value={globalSearch} onChange={(e: any) => setGlobalSearch(e.target.value)} placeholder="Cerca cliente, pratica, indirizzo, nota..." autoFocus style={{...S.searchInp,fontSize:16,padding:"16px 20px",border:"2.5px solid #e07a2f",boxShadow:"0 4px 16px rgba(255,107,53,0.12)"}} />
          
          {q && <p style={{fontSize:13,color:"#64748b",margin:"12px 0 16px",fontWeight:600}}>{totalResults} risultat{totalResults===1?"o":"i"} per "{globalSearch}"</p>}

          {/* Clients */}
          {matchedClients.length > 0 && (
            <div style={{marginBottom:20}}>
              <h3 style={{fontSize:14,fontWeight:800,color:"#e07a2f",marginBottom:10,textTransform:"uppercase",letterSpacing:"0.5px"}}> Clienti ({matchedClients.length})</h3>
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
              <h3 style={{fontSize:14,fontWeight:800,color:"#7c3aed",marginBottom:10,textTransform:"uppercase",letterSpacing:"0.5px"}}> Pratiche ({matchedPratiche.length})</h3>
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
                    <div style={S.praticaAddr}> {p.indirizzo||"—"} · {fmtDate(p.data)}</div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Notes */}
          {matchedNotes.length > 0 && (
            <div style={{marginBottom:20}}>
              <h3 style={{fontSize:14,fontWeight:800,color:"#059669",marginBottom:10,textTransform:"uppercase",letterSpacing:"0.5px"}}> Note ({matchedNotes.length})</h3>
              {matchedNotes.map((n: any) => (
                <button key={n.id} onClick={()=>{setNoteEdit(n);setView("note_edit");}} style={{...S.noteCard,background:n.colore||"#fffbeb"}}>
                  <div style={{fontSize:14,fontWeight:600,color:"#1e293b"}}>{(n.testo||"").substring(0,80)}{(n.testo||"").length>80?"...":""}</div>
                </button>
              ))}
            </div>
          )}

          {q && totalResults === 0 && (
            <div style={{textAlign:"center",padding:"40px 20px"}}>
              <div style={{fontSize:48,marginBottom:12}}></div>
              <p style={{fontSize:16,fontWeight:700,color:"#374151"}}>Nessun risultato</p>
              <p style={{fontSize:14,color:"#94a3b8"}}>Prova con termini diversi</p>
            </div>
          )}

          {!q && (
            <div style={{textAlign:"center",padding:"40px 20px"}}>
              <div style={{fontSize:48,marginBottom:12}}></div>
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
          <div style={{minWidth:0}}>
            <h1 style={{...S.logo,fontSize:16}}>FRAMEFLOW</h1>
            <p style={S.subtitle}>Gestione Serramenti</p>
          </div>
          <div style={{display:"flex",gap:3,alignItems:"center",flexShrink:0}}>
            <button onClick={()=>setShowNotifPanel(!showNotifPanel)} style={{background:showNotifPanel?"#e07a2f":"rgba(255,255,255,0.12)",color:"#fff",border:"none",borderRadius:2,padding:"7px 8px",fontSize:14,cursor:"pointer",position:"relative"}}>
              🔔{notifications.filter(n=>!n.letto).length>0 && <span style={{position:"absolute",top:2,right:2,width:8,height:8,borderRadius:"50%",background:"#ef4444"}}/>}
            </button>
            <button onClick={()=>setView("search")} style={{background:"rgba(255,255,255,0.12)",color:"#fff",border:"none",borderRadius:2,padding:"7px 8px",fontSize:14,cursor:"pointer"}}>🔍</button>
            {isAdmin && <button onClick={()=>setView("impostazioni")} style={{background:"rgba(255,255,255,0.12)",color:"#fff",border:"none",borderRadius:2,padding:"7px 8px",fontSize:14,cursor:"pointer"}}>⚙️</button>}
            {(isAdmin || myPermissions.includes("note")) && <button onClick={()=>setView("notes")} style={{background:"rgba(255,255,255,0.12)",color:"#fff",border:"none",borderRadius:2,padding:"7px 8px",fontSize:14,cursor:"pointer"}}>📝</button>}
            <button onClick={handleLogout} style={{background:"rgba(255,255,255,0.12)",color:"#fff",border:"none",borderRadius:2,padding:"7px 8px",fontSize:9,cursor:"pointer",fontWeight:700,fontFamily:"'JetBrains Mono','SF Mono',monospace"}}>ESCI</button>
          </div>
        </div>
        {/* Floating new button */}
        {isAdmin && <div style={{padding:"0 16px"}}>
          <button onClick={()=>{setClientSearch("");setView("client_pick");}} style={{width:"100%",padding:"14px",borderRadius:2,border:"none",background:"#e07a2f",color:"#fff",fontSize:15,fontWeight:800,cursor:"pointer",letterSpacing:"1px",textTransform:"uppercase",fontFamily:"'JetBrains Mono','SF Mono',monospace",marginTop:12}}>+ NUOVA PRATICA</button>
        </div>}

        <div style={{padding:"16px 16px 0"}}>
          {/* Notification Panel */}
          {showNotifPanel && <div style={{background:"#fff",borderRadius:2,border:"2px solid #e07a2f",marginBottom:16,maxHeight:350,overflowY:"auto",boxShadow:"0 8px 24px rgba(0,0,0,0.15)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 14px",borderBottom:"1px solid #e2e8f0"}}>
              <span style={{fontSize:14,fontWeight:800,color:"#1a1a2e"}}>🔔 Notifiche</span>
              {notifications.filter(n=>!n.letto).length>0 && <button onClick={markAllNotifsRead} style={{background:"none",border:"none",color:"#e07a2f",fontSize:11,fontWeight:700,cursor:"pointer"}}>Segna tutte lette</button>}
            </div>
            {notifications.length===0 ? <div style={{padding:20,textAlign:"center",color:"#94a3b8",fontSize:13}}>Nessuna notifica</div> :
              notifications.slice(0,20).map((n: any)=><div key={n.id} onClick={()=>{markNotifRead(n.id);if(n.pratica_id){setSelPratica(n.pratica_id);setView("pratica");setShowNotifPanel(false);}}} style={{padding:"10px 14px",borderBottom:"1px solid #f1f5f9",background:n.letto?"#fff":"#fffbeb",cursor:n.pratica_id?"pointer":"default"}}>
                <div style={{fontSize:13,fontWeight:n.letto?400:700,color:"#0f172a"}}>{n.titolo}</div>
                <div style={{fontSize:11,color:"#64748b",marginTop:2}}>{n.messaggio}</div>
                <div style={{fontSize:10,color:"#94a3b8",marginTop:4}}>{new Date(n.created_at).toLocaleString("it-IT",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})}</div>
              </div>)
            }
          </div>}
          {/* Greeting */}
          <div style={S.greetCard}>
            <h2 style={{fontSize:18,fontWeight:700,color:"#1a1a2e",margin:"0 0 4px",fontFamily:"'DM Sans',system-ui"}}>
              {new Date().getHours()<12?"Buongiorno":new Date().getHours()<18?"Buon pomeriggio":"Buonasera"}
            </h2>
            <p style={{fontSize:13,color:"#5c6370",margin:0}}>
              {todayPratiche.length>0?`${todayPratiche.length} appuntament${todayPratiche.length>1?"i":"o"} oggi`:"Nessun appuntamento"}
              {overduePratiche.length>0?` · ${overduePratiche.length} scadut${overduePratiche.length>1?"e":"a"}`:""}</p>
            {!isAdmin && myMember && <div style={{marginTop:8,padding:"4px 12px",borderRadius:2,background:myRoleCfg.bg,display:"inline-flex",alignItems:"center",gap:6}}><span style={{fontSize:11,fontWeight:700,color:myRoleCfg.color,fontFamily:"'JetBrains Mono',monospace"}}>{myRoleCfg.icon} {myRoleCfg.label}</span></div>}
          </div>

          {/* KPI Cards */}
          {isAdmin && <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
            <div style={{padding:12,background:"#fff",border:"1px solid #d5d8de",borderRadius:2}}>
              <div style={{fontSize:10,fontWeight:700,color:"#5c6370",textTransform:"uppercase",letterSpacing:"0.5px",fontFamily:"'JetBrains Mono',monospace"}}>FATTURATO MESE</div>
              <div style={{fontSize:22,fontWeight:800,color:"#2d8a4e",fontFamily:"'JetBrains Mono',monospace"}}>€ {kpi.fattMese.toFixed(0)}</div>
              {kpi.fattPrec>0 && <div style={{fontSize:10,color:kpi.fattMese>=kpi.fattPrec?"#2d8a4e":"#c44040"}}>{kpi.fattMese>=kpi.fattPrec?"+":""}{ kpi.fattPrec>0?Math.round(((kpi.fattMese-kpi.fattPrec)/kpi.fattPrec)*100):0}% vs mese prec.</div>}
            </div>
            <div style={{padding:12,background:"#fff",border:"1px solid #d5d8de",borderRadius:2}}>
              <div style={{fontSize:10,fontWeight:700,color:"#5c6370",textTransform:"uppercase",letterSpacing:"0.5px",fontFamily:"'JetBrains Mono',monospace"}}>CONV. PREV→ORD</div>
              <div style={{fontSize:22,fontWeight:800,color:"#3a7bd5",fontFamily:"'JetBrains Mono',monospace"}}>{kpi.convRate}%</div>
              <div style={{fontSize:10,color:"#5c6370"}}>{kpi.conConferma}/{kpi.conPrev} confermati</div>
            </div>
            <div style={{padding:12,background:"#fff",border:"1px solid #d5d8de",borderRadius:2}}>
              <div style={{fontSize:10,fontWeight:700,color:"#5c6370",textTransform:"uppercase",letterSpacing:"0.5px",fontFamily:"'JetBrains Mono',monospace"}}>DA INCASSARE</div>
              <div style={{fontSize:22,fontWeight:800,color:kpi.daPagare>0?"#c44040":"#2d8a4e",fontFamily:"'JetBrains Mono',monospace"}}>€ {kpi.daPagare.toFixed(0)}</div>
              <div style={{fontSize:10,color:"#5c6370"}}>Tot. € {kpi.fattTot.toFixed(0)}</div>
            </div>
            <div style={{padding:12,background:"#fff",border:"1px solid #d5d8de",borderRadius:2}}>
              <div style={{fontSize:10,fontWeight:700,color:"#5c6370",textTransform:"uppercase",letterSpacing:"0.5px",fontFamily:"'JetBrains Mono',monospace"}}>SCADUTE / MEDIA GG</div>
              <div style={{fontSize:22,fontWeight:800,color:kpi.overdue>0?"#c44040":"#2d8a4e",fontFamily:"'JetBrains Mono',monospace"}}>{kpi.overdue} <span style={{fontSize:14,color:"#5c6370"}}>/ {kpi.avgDays}gg</span></div>
              <div style={{fontSize:10,color:"#5c6370"}}>Pratiche in ritardo / tempo medio</div>
            </div>
          </div>}

          {/* Quick Stats */}
          <div style={S.dashStats}>
            <div style={S.dashStat} onClick={()=>{setFilter("da_fare");setView("pratiche");}}>
              <span style={{fontSize:28,fontWeight:800,color:"#c44040"}}>{counts.da_fare}</span>
              <span style={{fontSize:11,color:"#5c6370"}}>Da fare</span>
            </div>
            <div style={S.dashStat} onClick={()=>{setFilter("in_corso");setView("pratiche");}}>
              <span style={{fontSize:28,fontWeight:800,color:"#d4820e"}}>{counts.in_corso}</span>
              <span style={{fontSize:11,color:"#5c6370"}}>In corso</span>
            </div>
            <div style={S.dashStat} onClick={()=>{setFilter("completato");setView("pratiche");}}>
              <span style={{fontSize:28,fontWeight:800,color:"#2d8a4e"}}>{counts.completato}</span>
              <span style={{fontSize:11,color:"#5c6370"}}>Fatte</span>
            </div>
            <div style={S.dashStat} onClick={()=>setView("clienti")}>
              <span style={{fontSize:28,fontWeight:800,color:"#e07a2f"}}>{db.clients.length}</span>
              <span style={{fontSize:11,color:"#5c6370"}}>Clienti</span>
            </div>
          </div>

          {/* Overdue alert */}
          {overduePratiche.length>0 && (
            <div style={S.alertCard}>
              <span style={{fontSize:20}}></span>
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

          {/* Upcoming Appuntamenti (not yet converted) */}
          {(()=>{
            const upcoming = appuntamenti.filter(a => a.stato !== "convertito" && a.stato !== "annullato" && a.data >= today()).sort((a:any,b:any)=>a.data.localeCompare(b.data));
            if(upcoming.length === 0) return null;
            return <div style={{marginBottom:12}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <h3 style={S.dashSectionTitle}>📅 Prossimi Appuntamenti</h3>
                <button onClick={()=>setView("appuntamenti")} style={{background:"none",border:"none",color:"#7c3aed",fontSize:11,fontWeight:700,cursor:"pointer"}}>Vedi tutti →</button>
              </div>
              {upcoming.slice(0,3).map((a: any) => {
                const client = db.clients.find((c: any) => c.id === a.client_id);
                return <div key={a.id} onClick={()=>setView("appuntamenti")} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",background:"#faf5ff",borderRadius:2,border:"1px solid #e9d5ff",marginBottom:4,cursor:"pointer"}}>
                  <div style={{padding:"6px 10px",borderRadius:2,background:"#7c3aed",color:"#fff",fontSize:11,fontWeight:800,textAlign:"center",minWidth:50}}>
                    <div>{fmtDate(a.data).split(" ").slice(1).join(" ")}</div>
                    <div>{a.ora}</div>
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:700,color:"#0f172a"}}>{client?.nome||"—"}</div>
                    <div style={{fontSize:11,color:"#7c3aed",fontWeight:600,textTransform:"capitalize"}}>{a.tipo}</div>
                  </div>
                  <span style={{fontSize:11,color:"#059669",fontWeight:700}}>➡️</span>
                </div>;
              })}
            </div>;
          })()}

          {/* Today's Appointments */}
          <div style={S.dashSection}>
            <h3 style={S.dashSectionTitle}> Appuntamenti di Oggi</h3>
            {todayPratiche.length===0 ? <p style={S.dashEmpty}>Nessun appuntamento oggi</p>
            : todayPratiche.map((p: any) => {
              const c = getClient(p.clientId);
              const sc = STATUS[p.status];
              return (
                <button key={p.id} onClick={()=>{setSelPratica(p.id);setView("pratica");}} style={S.appointCard}>
                  <div style={{...S.appointTime,background:sc.bg,color:sc.color}}>{p.ora}</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:14,fontWeight:600,color:"#0f172a"}}>{c?.nome||"—"}</div>
                    <div style={{fontSize:12,color:"#64748b"}}>{p.numero} {p.indirizzo?`·  ${p.indirizzo}`:""}</div>
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
              <h3 style={S.dashSectionTitle}> Domani ({tomorrowPratiche.length})</h3>
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
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <h3 style={S.dashSectionTitle}> Cose da Fare ({pendingTasks.length})</h3>
              </div>
              <div style={{display:"flex",gap:4,marginBottom:10,flexWrap:"wrap"}}>
                {([["fase","Per fase"],["data","Per data"],["cliente","Per cliente"],["urgenza","Per urgenza"]] as [string,string][]).map(([k,l])=>
                  <button key={k} onClick={()=>setTaskSort(k)} style={{padding:"5px 10px",borderRadius:2,border:"none",background:taskSort===k?"#1a1a2e":"#e2e8f0",color:taskSort===k?"#fff":"#64748b",fontSize:10,fontWeight:700,cursor:"pointer"}}>{l}</button>
                )}
              </div>
              {pendingTasks.map((t: any) => {
                const c = getClient(t.clientId);
                return (
                  <div key={t.id} style={S.taskDashRow}>
                    <button onClick={()=>toggleActionTask(t.praticaId,t.actionId,t.id)} style={S.taskCheck}>○</button>
                    <div style={{flex:1}} onClick={()=>{setSelPratica(t.praticaId);setView("pratica");}}>
                      <div style={{fontSize:13,color:"#1f2937",cursor:"pointer"}}>{t.text}</div>
                      <div style={{fontSize:11,color:"#94a3b8"}}>{t.actionIcon} {t.praticaNum} · {c?.nome||""} {t.praticaData ? `· ${fmtDate(t.praticaData)}` : ""}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Recent Emails */}
          {recentEmails.length>0 && (
            <div style={S.dashSection}>
              <h3 style={S.dashSectionTitle}> Email Recenti</h3>
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

          {/* Statistiche + Backup */}
          <div style={{display:"flex",gap:8,marginBottom:12}}>
            <button onClick={()=>setView("stats")} style={{flex:2,padding:"14px",borderRadius:2,border:"none",background:"#1a1a2e",color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,fontFamily:"'JetBrains Mono',monospace",letterSpacing:"0.5px"}}>
              STATISTICHE →
            </button>
            <button onClick={exportBackup} style={{flex:1,padding:"14px",borderRadius:2,border:"1px solid #d5d8de",background:"#fff",color:"#1a1a2e",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'JetBrains Mono',monospace"}}>
              BACKUP
            </button>
            <label style={{flex:1,padding:"14px",borderRadius:2,border:"1px solid #d5d8de",background:"#fff",color:"#1a1a2e",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'JetBrains Mono',monospace",textAlign:"center"}}>
              IMPORT
              <input type="file" accept=".json" onChange={(e: any)=>{if(e.target.files[0])importBackup(e.target.files[0]);}} style={{display:"none"}} />
            </label>
          </div>

          {/* Quick Notes */}
          <div style={S.dashSection}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <h3 style={S.dashSectionTitle}> Note Rapide</h3>
              <button onClick={()=>{setNoteEdit({testo:"",colore:"#fffbeb",praticaId:""});setView("note_edit");}} style={S.addNoteBtn}>+</button>
            </div>
            {(db.notes||[]).length===0 ? <p style={S.dashEmpty}>Nessuna nota</p>
            : (db.notes||[]).slice(0,4).map((n: any)=>(
              <button key={n.id} onClick={()=>{setNoteEdit(n);setView("note_edit");}} style={{...S.noteCard,background:n.colore||"#fffbeb"}}>
                <div style={{fontSize:13,fontWeight:600,color:"#0f172a"}}>{n.testo?.substring(0,80)||"Nota vuota"}{(n.testo?.length||0)>80?"...":""}</div>
                {n.praticaId && <div style={{fontSize:11,color:"#7c3aed",marginTop:2}}> {getPratica(n.praticaId)?.numero||""}</div>}
                <div style={{fontSize:10,color:"#94a3b8",marginTop:4}}>{n.updatedAt?new Date(n.updatedAt).toLocaleString("it-IT"):""}</div>
              </button>
            ))}
          </div>
        </div>

        {saveError&&<div style={{position:"fixed",top:20,left:"50%",transform:"translateX(-50%)",background:"#dc2626",color:"#fff",padding:"10px 20px",borderRadius:2,fontSize:13,fontWeight:700,zIndex:9999,boxShadow:"0 4px 20px rgba(0,0,0,0.3)",maxWidth:340,textAlign:"center"}}>{saveError}</div>}
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
        <div style={{...S.secHdr,background:"#1a1a2e",borderRadius:"0 0 20px 20px"}}>
          <button onClick={()=>setView("dashboard")} style={{...S.backBtn,color:"#fbbf24"}}>← Indietro</button>
          <h2 style={{...S.secTitle,color:"#fff"}}> Statistiche</h2>
        </div>
        <div style={{padding:"16px"}}>
          {/* KPI Cards */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10,marginBottom:20}}>
            <div style={{background:"#fff",borderRadius:2,padding:18,boxShadow:"0 4px 16px rgba(0,0,0,0.06)"}}>
              <div style={{fontSize:11,fontWeight:800,color:"#64748b",textTransform:"uppercase",letterSpacing:"0.5px"}}>Fatturato Totale</div>
              <div style={{fontSize:24,fontWeight:900,color:"#059669",letterSpacing:"-0.5px",marginTop:4}}>€ {fatturato.toFixed(0)}</div>
            </div>
            <div style={{background:"#fff",borderRadius:2,padding:18,boxShadow:"0 4px 16px rgba(0,0,0,0.06)"}}>
              <div style={{fontSize:11,fontWeight:800,color:"#64748b",textTransform:"uppercase",letterSpacing:"0.5px"}}>Questo Mese</div>
              <div style={{fontSize:24,fontWeight:900,color:"#e07a2f",letterSpacing:"-0.5px",marginTop:4}}>€ {fattThisMonth.toFixed(0)}</div>
              {fattLastMonth > 0 && <div style={{fontSize:11,color:fattThisMonth>=fattLastMonth?"#059669":"#ef4444",fontWeight:700,marginTop:2}}>
                {fattThisMonth>=fattLastMonth?"📈":"📉"} {fattLastMonth>0?Math.round(((fattThisMonth-fattLastMonth)/fattLastMonth)*100):0}% vs mese scorso
              </div>}
            </div>
            <div style={{background:"#fff",borderRadius:2,padding:18,boxShadow:"0 4px 16px rgba(0,0,0,0.06)"}}>
              <div style={{fontSize:11,fontWeight:800,color:"#64748b",textTransform:"uppercase",letterSpacing:"0.5px"}}>Pratiche Totali</div>
              <div style={{fontSize:24,fontWeight:900,color:"#7c3aed",letterSpacing:"-0.5px",marginTop:4}}>{totPratiche}</div>
              <div style={{fontSize:11,color:"#64748b",fontWeight:600,marginTop:2}}>{totClienti} clienti</div>
            </div>
            <div style={{background:"#fff",borderRadius:2,padding:18,boxShadow:"0 4px 16px rgba(0,0,0,0.06)"}}>
              <div style={{fontSize:11,fontWeight:800,color:"#64748b",textTransform:"uppercase",letterSpacing:"0.5px"}}>Completamento</div>
              <div style={{fontSize:24,fontWeight:900,color:tasso>=70?"#059669":tasso>=40?"#d97706":"#ef4444",letterSpacing:"-0.5px",marginTop:4}}>{tasso}%</div>
              <div style={{height:6,background:"#e2e8f0",borderRadius:2,marginTop:6,overflow:"hidden"}}>
                <div style={{height:"100%",borderRadius:2,width:`${tasso}%`,background:tasso>=70?"#059669":tasso>=40?"#d4820e":"#ef4444",transition:"width 0.4s"}} />
              </div>
            </div>
          </div>

          {/* Status Breakdown */}
          <div style={{background:"#fff",borderRadius:2,padding:18,marginBottom:20,boxShadow:"0 4px 16px rgba(0,0,0,0.06)"}}>
            <h3 style={{fontSize:15,fontWeight:900,color:"#1e293b",margin:"0 0 14px",letterSpacing:"-0.3px"}}> Stato Pratiche</h3>
            {[{label:"Da fare",count:totDaFare,color:"#ef4444",bg:"#fef2f2"},{label:"In corso",count:totInCorso,color:"#d97706",bg:"#fffbeb"},{label:"Completate",count:totCompletate,color:"#059669",bg:"#ecfdf5"}].map(s => (
              <div key={s.label} style={{display:"flex",alignItems:"center",gap:12,marginBottom:10}}>
                <div style={{width:40,height:40,borderRadius:2,background:s.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:900,color:s.color}}>{s.count}</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:700,color:"#1e293b"}}>{s.label}</div>
                  <div style={{height:6,background:"#f1f5f9",borderRadius:2,marginTop:4,overflow:"hidden"}}>
                    <div style={{height:"100%",borderRadius:2,width:`${totPratiche>0?(s.count/totPratiche*100):0}%`,background:s.color,transition:"width 0.4s"}} />
                  </div>
                </div>
                <span style={{fontSize:12,fontWeight:700,color:"#64748b"}}>{totPratiche>0?Math.round(s.count/totPratiche*100):0}%</span>
              </div>
            ))}
          </div>

          {/* Monthly Chart */}
          <div style={{background:"#fff",borderRadius:2,padding:18,marginBottom:20,boxShadow:"0 4px 16px rgba(0,0,0,0.06)"}}>
            <h3 style={{fontSize:15,fontWeight:900,color:"#1e293b",margin:"0 0 16px",letterSpacing:"-0.3px"}}>📈 Pratiche per Mese</h3>
            <div style={{display:"flex",alignItems:"flex-end",gap:8,height:140}}>
              {pratichePerMese.map(m => (
                <div key={m.mese} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                  <span style={{fontSize:12,fontWeight:800,color:"#1e293b"}}>{m.totale}</span>
                  <div style={{width:"100%",display:"flex",flexDirection:"column",gap:2,alignItems:"center"}}>
                    <div style={{width:"80%",height:Math.max(4, (m.totale/maxPratiche)*100),background:"#e07a2f",borderRadius:2,transition:"height 0.4s"}} />
                    {m.completate > 0 && <div style={{width:"80%",height:Math.max(2, (m.completate/maxPratiche)*100),background:"#059669",borderRadius:2,transition:"height 0.4s",opacity:0.6}} />}
                  </div>
                  <span style={{fontSize:10,fontWeight:700,color:m.mese===thisMonth?"#e07a2f":"#94a3b8"}}>{m.label}</span>
                </div>
              ))}
            </div>
            <div style={{display:"flex",gap:16,marginTop:12,justifyContent:"center"}}>
              <div style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:10,height:10,borderRadius:3,background:"#e07a2f"}} /><span style={{fontSize:11,color:"#64748b",fontWeight:600}}>Totale</span></div>
              <div style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:10,height:10,borderRadius:3,background:"#059669",opacity:0.6}} /><span style={{fontSize:11,color:"#64748b",fontWeight:600}}>Completate</span></div>
            </div>
          </div>

          {/* Top Actions */}
          {topActions.length > 0 && (
            <div style={{background:"#fff",borderRadius:2,padding:18,marginBottom:20,boxShadow:"0 4px 16px rgba(0,0,0,0.06)"}}>
              <h3 style={{fontSize:15,fontWeight:900,color:"#1e293b",margin:"0 0 14px",letterSpacing:"-0.3px"}}> Azioni più utilizzate</h3>
              {topActions.map(([key, count]) => {
                const cfg = ACTIONS_CFG.find(a => a.key === key);
                const maxCount = topActions[0][1] as number;
                return (
                  <div key={key} style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                    <span style={{fontSize:20}}>{cfg?.icon||""}</span>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13,fontWeight:700,color:"#1e293b"}}>{cfg?.label||key}</div>
                      <div style={{height:5,background:"#f1f5f9",borderRadius:2,marginTop:3,overflow:"hidden"}}>
                        <div style={{height:"100%",borderRadius:2,width:`${((count as number)/maxCount)*100}%`,background:cfg?.color||"#6b7280",transition:"width 0.4s"}} />
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
    myPratiche.forEach((p: any) => {
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
          <h2 style={{...S.logo,fontSize:18}}> Agenda</h2>
          <button onClick={goToday} style={{...S.addBtn,padding:"8px 16px",fontSize:13}}>Oggi</button>
        </div>
        <div style={{padding:"16px 16px 0"}}>
          {/* Month Navigation */}
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
            <button onClick={prevMonth} style={{background:"#fff",border:"none",borderRadius:2,width:40,height:40,fontSize:18,cursor:"pointer",boxShadow:"0 2px 8px rgba(0,0,0,0.06)",display:"flex",alignItems:"center",justifyContent:"center"}}>←</button>
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:20,fontWeight:900,color:"#1e293b",letterSpacing:"-0.5px"}}>{MESI[month]}</div>
              <div style={{fontSize:13,color:"#64748b",fontWeight:600}}>{year}</div>
            </div>
            <button onClick={nextMonth} style={{background:"#fff",border:"none",borderRadius:2,width:40,height:40,fontSize:18,cursor:"pointer",boxShadow:"0 2px 8px rgba(0,0,0,0.06)",display:"flex",alignItems:"center",justifyContent:"center"}}>→</button>
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
                  background: isSelected ? "#e07a2f" : isToday ? "#fff" : "transparent",
                  border: isToday && !isSelected ? "2.5px solid #e07a2f" : "none",
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
                  <span style={{fontSize:15,fontWeight:isToday||isSelected?900:600,color:isSelected?"#fff":isToday?"#e07a2f":isPast?"#94a3b8":"#1e293b"}}>{day}</span>
                  {hasEvents && (
                    <div style={{display:"flex",gap:2,alignItems:"center"}}>
                      {eventCount <= 3 ? Array.from({length:eventCount}).map((_,j) => (
                        <div key={j} style={{width:5,height:5,borderRadius:"50%",background:isSelected?"rgba(255,255,255,0.8)":hasOverdue?"#ef4444":"#e07a2f"}} />
                      )) : (
                        <span style={{fontSize:10,fontWeight:800,color:isSelected?"rgba(255,255,255,0.9)":"#e07a2f"}}>{eventCount}</span>
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
                {calSelDay === todayStr ? " Oggi" : fmtDate(calSelDay)} — {selDayPratiche.length} appuntament{selDayPratiche.length===1?"o":"i"}
              </h3>
              {selDayPratiche.length === 0 && (
                <div style={{background:"#fff",borderRadius:2,padding:"24px 16px",textAlign:"center",boxShadow:"0 4px 16px rgba(0,0,0,0.06)"}}>
                  <div style={{fontSize:32,marginBottom:8}}>📭</div>
                  <p style={{fontSize:14,color:"#94a3b8",fontWeight:600}}>Nessun appuntamento</p>
                  <button onClick={()=>{setClientSearch("");setView("client_pick");}} style={{marginTop:12,padding:"10px 20px",borderRadius:2,background:"#e07a2f",color:"#fff",border:"none",fontSize:13,fontWeight:800,cursor:"pointer"}}>+ Nuova Pratica</button>
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
                        <div style={{fontSize:13,color:"#64748b",fontWeight:500}}>{p.numero} ·  {p.indirizzo||"—"}</div>
                      </div>
                      <span style={{...S.praticaStatus,background:sc.bg,color:sc.color}}>{sc.icon} {sc.label}</span>
                    </div>
                    {actions.length > 0 && (
                      <div style={{display:"flex",gap:6,marginTop:8,flexWrap:"wrap"}}>
                        {actions.map((a: any) => (
                          <span key={a.key} style={{fontSize:11,fontWeight:700,color:a.color,background:`${a.color}15`,padding:"3px 10px",borderRadius:2}}>{a.icon} {a.label}</span>
                        ))}
                      </div>
                    )}
                    {p.note && <div style={{fontSize:12,color:"#64748b",marginTop:6,fontStyle:"italic"}}> {p.note}</div>}
                  </button>
                );
              })}
            </div>
          )}

          {/* Upcoming if no day selected */}
          {!calSelDay && (
            <div>
              <h3 style={{fontSize:16,fontWeight:900,color:"#1e293b",margin:"0 0 12px",letterSpacing:"-0.3px"}}> Prossimi Appuntamenti</h3>
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
                      <div style={{fontSize:12,color:"#64748b",fontWeight:500}}>{p.numero} ·  {p.indirizzo||"—"}</div>
                    </div>
                    <span style={{fontSize:18}}>→</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        {saveError&&<div style={{position:"fixed",top:20,left:"50%",transform:"translateX(-50%)",background:"#dc2626",color:"#fff",padding:"10px 20px",borderRadius:2,fontSize:13,fontWeight:700,zIndex:9999,boxShadow:"0 4px 20px rgba(0,0,0,0.3)",maxWidth:340,textAlign:"center"}}>{saveError}</div>}
        <BottomNav items={navItems} active={view} onNav={setView} />
      </div>
    );
  }

  // ==================== APPUNTAMENTI ====================
  if (view === "appuntamenti") {
    const TIPI_APP = ["sopralluogo","misure","posa","riparazione","consulenza","altro"];
    const activeApps = appuntamenti.filter(a => a.stato !== "convertito" && a.stato !== "annullato");
    const pastApps = appuntamenti.filter(a => a.stato === "convertito");
    const sortedApps = activeApps.sort((a: any, b: any) => a.data.localeCompare(b.data) || (a.ora||"").localeCompare(b.ora||""));
    return (
      <div style={S.container}>
        <div style={{...S.secHdr,background:"#7c3aed"}}>
          <button onClick={()=>setView("dashboard")} style={{...S.backBtn,color:"#fff"}}>← Home</button>
          <h2 style={{...S.secTitle,color:"#fff"}}>📅 Appuntamenti</h2>
          <button onClick={()=>setAppForm({data:today(),ora:"09:00",tipo:"sopralluogo",client_id:"",indirizzo:"",note:"",assegnato_a:""})} style={{background:"rgba(255,255,255,0.2)",border:"none",color:"#fff",borderRadius:2,padding:"8px 14px",fontSize:12,fontWeight:700,cursor:"pointer"}}>+ NUOVO</button>
        </div>
        <div style={{padding:16}}>
          {/* New/Edit Appuntamento Form */}
          {appForm && <div data-vano="appuntamento" style={{background:"#faf5ff",borderRadius:2,border:"2px solid #7c3aed",padding:16,marginBottom:16}}>
            <h4 style={{fontSize:14,fontWeight:800,color:"#7c3aed",margin:"0 0 12px"}}>{appForm.id ? "Modifica" : "Nuovo"} Appuntamento</h4>
            <div style={{display:"flex",gap:8,marginBottom:8,flexWrap:"wrap"}}>
              <div style={{flex:"1 1 120px",minWidth:0}}><label style={S.fLabel}>Data</label><input type="date" value={appForm.data} onChange={e=>setAppForm({...appForm,data:e.target.value})} style={S.input} /></div>
              <div style={{flex:"1 1 100px",minWidth:0}}><label style={S.fLabel}>Ora</label><input type="time" value={appForm.ora} onChange={e=>setAppForm({...appForm,ora:e.target.value})} style={S.input} /></div>
            </div>
            <div style={{marginBottom:8}}>
              <label style={S.fLabel}>Tipo</label>
              <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                {TIPI_APP.map(t=><button key={t} onClick={()=>setAppForm({...appForm,tipo:t})} style={{padding:"8px 12px",borderRadius:2,border:"none",background:appForm.tipo===t?"#7c3aed":"#e2e8f0",color:appForm.tipo===t?"#fff":"#374151",fontSize:12,fontWeight:700,cursor:"pointer",textTransform:"capitalize"}}>{t}</button>)}
              </div>
            </div>
            <div style={{marginBottom:8}}>
              <label style={S.fLabel}>Cliente</label>
              <select value={appForm.client_id} onChange={e=>{setAppForm({...appForm,client_id:e.target.value,indirizzo:db.clients.find((c:any)=>c.id===e.target.value)?.indirizzo||appForm.indirizzo});autoAdvanceField(e.target);}} style={S.input}>
                <option value="">— Seleziona cliente —</option>
                {db.clients.map((c: any)=><option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
            <div style={{marginBottom:8}}><label style={S.fLabel}>Indirizzo</label><input value={appForm.indirizzo} onChange={e=>setAppForm({...appForm,indirizzo:e.target.value})} style={S.input} placeholder="Via..." /></div>
            {teamMembers.length > 1 && <div style={{marginBottom:8}}>
              <label style={S.fLabel}>Assegnato a</label>
              <select value={appForm.assegnato_a||""} onChange={e=>{setAppForm({...appForm,assegnato_a:e.target.value||null});autoAdvanceField(e.target);}} style={S.input}>
                <option value="">— Non assegnato —</option>
                {teamMembers.map((m: any)=><option key={m.id} value={m.id}>{m.nome} ({(ROLES[m.ruolo]||ROLES.admin).label})</option>)}
              </select>
            </div>}
            <div style={{marginBottom:10}}><label style={S.fLabel}>Note</label><textarea value={appForm.note} onChange={e=>setAppForm({...appForm,note:e.target.value})} style={{...S.input,height:60,resize:"vertical"}} placeholder="Note opzionali..." /></div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setAppForm(null)} style={{...S.saveBtn,flex:1,background:"#e2e8f0",color:"#374151",boxShadow:"none"}}>Annulla</button>
              <button onClick={()=>{if(!appForm.client_id){alert("Seleziona un cliente");return;}saveAppuntamento(appForm);setAppForm(null);}} style={{...S.saveBtn,flex:2,background:"#7c3aed"}}>💾 Salva</button>
            </div>
          </div>}

          {/* Active Appointments */}
          {sortedApps.length === 0 && !appForm && <div style={{textAlign:"center",padding:40,color:"#94a3b8"}}>
            <div style={{fontSize:32,marginBottom:8}}>📅</div>
            <p style={{fontSize:14}}>Nessun appuntamento programmato</p>
            <button onClick={()=>setAppForm({data:today(),ora:"09:00",tipo:"sopralluogo",client_id:"",indirizzo:"",note:"",assegnato_a:""})} style={{...S.saveBtn,background:"#7c3aed",marginTop:12}}>+ Nuovo Appuntamento</button>
          </div>}

          {sortedApps.map((a: any) => {
            const client = db.clients.find((c: any) => c.id === a.client_id);
            const assignedTo = teamMembers.find(m => m.id === a.assegnato_a);
            const isPast = a.data < today();
            return <div key={a.id} style={{padding:14,background:isPast?"#fef2f2":"#fff",borderRadius:2,border:`1.5px solid ${isPast?"#fecaca":"#e2e8f0"}`,marginBottom:8}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div>
                  <div style={{fontSize:15,fontWeight:800,color:"#0f172a"}}>{client?.nome || "—"}</div>
                  <div style={{fontSize:12,color:"#64748b",marginTop:2}}>
                    {fmtDate(a.data)} ore {a.ora} · <span style={{color:"#7c3aed",fontWeight:700,textTransform:"capitalize"}}>{a.tipo}</span>
                  </div>
                  {a.indirizzo && <div style={{fontSize:11,color:"#94a3b8",marginTop:2}}>📍 {a.indirizzo}</div>}
                  {assignedTo && <div style={{fontSize:11,color:"#4338ca",marginTop:2,fontWeight:600}}>👤 {assignedTo.nome}</div>}
                  {a.note && <div style={{fontSize:11,color:"#64748b",marginTop:4,fontStyle:"italic"}}>{a.note}</div>}
                </div>
                <div style={{display:"flex",gap:4,flexShrink:0}}>
                  <button onClick={()=>setAppForm({...a})} style={{background:"none",border:"1px solid #e2e8f0",borderRadius:2,padding:"6px 8px",fontSize:11,cursor:"pointer",color:"#64748b"}}>✏️</button>
                  <button onClick={()=>{if(confirm("Eliminare appuntamento?"))deleteAppuntamento(a.id);}} style={{background:"none",border:"1px solid #fecaca",borderRadius:2,padding:"6px 8px",fontSize:11,cursor:"pointer",color:"#ef4444"}}>🗑</button>
                </div>
              </div>
              {/* Convert to Pratica button */}
              {a.client_id && <button onClick={()=>{if(confirm(`Convertire appuntamento in pratica per ${client?.nome}?`))convertAppToPratica(a);}} style={{marginTop:10,width:"100%",padding:"10px",borderRadius:2,border:"2px solid #059669",background:"#ecfdf5",color:"#059669",fontSize:13,fontWeight:800,cursor:"pointer"}}>
                ➡️ CONVERTI IN PRATICA
              </button>}
            </div>;
          })}

          {/* Converted (past) */}
          {pastApps.length > 0 && <>
            <div style={{fontSize:12,fontWeight:800,color:"#94a3b8",marginTop:20,marginBottom:8,textTransform:"uppercase"}}>Convertiti in pratica ({pastApps.length})</div>
            {pastApps.slice(0,5).map((a: any) => {
              const client = db.clients.find((c: any) => c.id === a.client_id);
              return <div key={a.id} style={{padding:10,background:"#f8fafc",borderRadius:2,border:"1px solid #e2e8f0",marginBottom:4,opacity:0.6}}>
                <span style={{fontSize:12,color:"#64748b"}}>{fmtDate(a.data)} · {client?.nome||"—"} · <span style={{color:"#059669",fontWeight:700}}>✅ Convertito</span></span>
              </div>;
            })}
          </>}
        </div>
        <BottomNav items={navItems} active={view} onNav={setView} />
      </div>
    );
  }

  // ==================== PRATICHE LIST ====================
  if (view === "pratiche") {
    const FASI = [{k:"tutte",l:"Tutte"},{k:"sopralluogo",l:"Sopralluogo"},{k:"preventivo",l:"Preventivo"},{k:"misure",l:"Misure"},{k:"ordine",l:"Ordine"},{k:"produzione",l:"Produzione"},{k:"posa",l:"Posa"},{k:"chiusura",l:"Chiusura"}];
    const TIPI = [{k:"tutti",l:"Tutti"},{k:"nuovo",l:"Nuovo"},{k:"sostituzione",l:"Sostituz."},{k:"riparazione",l:"Riparaz."}];
    return (
      <div style={S.container}>
        <div style={{...S.header,padding:"16px 20px 12px"}}>
          <h2 style={{...S.logo,fontSize:18}}>PRATICHE</h2>
          <button onClick={()=>{setClientSearch("");setView("client_pick");}} style={S.addBtn}>+ NUOVA</button>
        </div>
        <div style={S.stats}>
          {[{k:"tutti",l:"Tot",c:"#5c6370"},{k:"da_fare",l:"Da fare",c:"#c44040"},{k:"in_corso",l:"In corso",c:"#d4820e"},{k:"completato",l:"Fatti",c:"#2d8a4e"}].map(s=>(
            <button key={s.k} onClick={()=>setFilter(s.k)} style={{...S.statCard,borderBottom:filter===s.k?`3px solid ${s.c}`:"3px solid transparent",background:filter===s.k?"#f0f1f3":"#fff"}}>
              <span style={{...S.statNum,color:s.c}}>{counts[s.k as keyof typeof counts]}</span>
              <span style={S.statLbl}>{s.l}</span>
            </button>
          ))}
        </div>
        {/* Filtri avanzati */}
        <div style={{padding:"0 16px 6px",display:"flex",gap:6,flexWrap:"wrap"}}>
          <select value={filterFase} onChange={e=>setFilterFase(e.target.value)} style={{...S.input,flex:1,fontSize:12,padding:"8px 10px",fontWeight:600}}>
            {FASI.map(f=><option key={f.k} value={f.k}>{f.l}</option>)}
          </select>
          <select value={filterTipo} onChange={e=>setFilterTipo(e.target.value)} style={{...S.input,flex:1,fontSize:12,padding:"8px 10px",fontWeight:600}}>
            {TIPI.map(t=><option key={t.k} value={t.k}>{t.l}</option>)}
          </select>
          {(filterFase!=="tutte"||filterTipo!=="tutti") && <button onClick={()=>{setFilterFase("tutte");setFilterTipo("tutti");}} style={{padding:"8px 12px",border:"none",background:"#c44040",color:"#fff",borderRadius:2,fontSize:11,fontWeight:700,cursor:"pointer"}}>RESET</button>}
        </div>
        <div style={{padding:"0 16px 8px"}}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Cerca pratica, cliente, indirizzo..." style={S.searchInp} />
        </div>
        {filteredPratiche.length===0 ? <div style={S.empty}><p style={S.emptyTitle}>Nessun risultato</p><p style={{fontSize:13,color:"#7a8194"}}>Prova a cambiare i filtri</p></div>
        : <div style={{padding:"0 16px"}}>{filteredPratiche.map((p: any)=>{
          const c = getClient(p.clientId); const sc = STATUS[p.status];
          const totalTasks = p.actions.reduce((s: number,a: any)=>s+a.tasks.length,0);
          const doneTasks = p.actions.reduce((s: number,a: any)=>s+a.tasks.filter((t: any)=>t.done).length,0);
          const prog = totalTasks?Math.round(doneTasks/totalTasks*100):0;
          const wf = getWorkflow(p.tipo); const curPhase = wf.find((w: any)=>w.key===p.fase) || wf[0];
          return (
            <button key={p.id} onClick={()=>{setSelPratica(p.id);setView("pratica");}} style={S.praticaCard}>
              <div style={S.praticaTop}>
                <span style={S.praticaNum}>{p.numero}</span>
                <div style={{display:"flex",gap:4,alignItems:"center"}}>
                  <span style={{fontSize:10,padding:"2px 8px",borderRadius:2,background:"#f0f1f3",color:"#5c6370",fontWeight:700,fontFamily:"'JetBrains Mono','SF Mono',monospace",textTransform:"uppercase"}}>{curPhase?.label||p.fase||"—"}</span>
                  <span style={{...S.praticaStatus,background:sc.bg,color:sc.color}}>{sc.label}</span>
                </div>
              </div>
              <h3 style={S.praticaCliente}>{c?.nome||"—"}</h3>
              {p.indirizzo && <p style={S.praticaAddr}>{p.indirizzo}</p>}
              <div style={S.praticaMeta}>
                <span style={{fontSize:12,color:"#7a8194"}}>{dateLabel(p.data)} {p.ora}</span>
                {p.preventivo?.totaleFinale && <span style={{fontSize:12,color:"#2d8a4e",fontWeight:700}}>€ {p.preventivo.totaleFinale.toFixed(0)}</span>}
                {p.actions.length>0 && <span style={S.praticaActions}>{p.actions.length} az.</span>}
              </div>
              {totalTasks>0 && <div style={S.progRow}><div style={S.progBar}><div style={{...S.progFill,width:`${prog}%`,background:prog===100?"#2d8a4e":"#e07a2f"}} /></div><span style={{fontSize:12,color:"#7a8194",fontWeight:600}}>{doneTasks}/{totalTasks}</span></div>}
            </button>
          );
        })}</div>}
        {saveError&&<div style={{position:"fixed",top:20,left:"50%",transform:"translateX(-50%)",background:"#dc2626",color:"#fff",padding:"10px 20px",borderRadius:2,fontSize:13,fontWeight:700,zIndex:9999,boxShadow:"0 4px 20px rgba(0,0,0,0.3)",maxWidth:340,textAlign:"center"}}>{saveError}</div>}
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
          <h2 style={{...S.logo,fontSize:18}}> Rubrica ({db.clients.length})</h2>
          <button onClick={()=>{setClientForm({nome:"",telefono:"",email:"",indirizzo:"",codiceFiscale:"",piva:"",note:""});setView("new_client");}} style={S.addBtn}>+ Nuovo</button>
        </div>
        <div style={{padding:"0 16px"}}>
          <input value={clientSearch} onChange={e=>setClientSearch(e.target.value)} placeholder=" Cerca per nome, telefono, email, indirizzo..." style={{...S.searchInp,marginTop:12}} />
          
          {/* Summary */}
          <div style={{display:"flex",gap:8,margin:"12px 0",overflowX:"auto"}}>
            {[{l:"Tutti",v:db.clients.length,c:"#1e293b"},{l:"Con pratiche",v:db.clients.filter((c: any)=>db.pratiche.some((p: any)=>p.clientId===c.id)).length,c:"#7c3aed"},{l:"Attivi",v:db.clients.filter((c: any)=>db.pratiche.some((p: any)=>p.clientId===c.id&&p.status!=="completato")).length,c:"#e07a2f"}].map(s => (
              <div key={s.l} style={{background:"#fff",borderRadius:2,padding:"8px 14px",boxShadow:"0 2px 8px rgba(0,0,0,0.04)",whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:6}}>
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
                    {c.indirizzo && <div style={{fontSize:12,color:"#94a3b8",marginTop:2}}> {c.indirizzo}</div>}
                  </div>
                  {activeCount > 0 && <span style={{background:"#e07a2f",color:"#fff",fontSize:11,fontWeight:800,padding:"3px 10px",borderRadius:2}}>{activeCount} attiv{activeCount===1?"a":"e"}</span>}
                </div>
                
                {/* Contact row */}
                <div style={{display:"flex",gap:8,marginTop:12}}>
                  {c.telefono && <a href={`tel:${c.telefono}`} style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"9px 8px",borderRadius:2,background:"#ecfdf5",color:"#059669",fontSize:13,fontWeight:700,textDecoration:"none",border:"none"}}> {c.telefono}</a>}
                  {c.email && <a href={`mailto:${c.email}`} style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"9px 8px",borderRadius:2,background:"#eaf1fb",color:"#7c3aed",fontSize:13,fontWeight:700,textDecoration:"none",border:"none",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}> Email</a>}
                </div>

                {/* Stats row */}
                <div style={{display:"flex",gap:8,marginTop:10}}>
                  <div style={{flex:1,background:"#f8fafc",borderRadius:2,padding:"8px 10px",textAlign:"center"}}>
                    <div style={{fontSize:16,fontWeight:900,color:"#7c3aed"}}>{pCount}</div>
                    <div style={{fontSize:10,color:"#94a3b8",fontWeight:600}}>Pratiche</div>
                  </div>
                  {fatturato > 0 && <div style={{flex:1,background:"#f8fafc",borderRadius:2,padding:"8px 10px",textAlign:"center"}}>
                    <div style={{fontSize:16,fontWeight:900,color:"#059669"}}>€{fatturato.toFixed(0)}</div>
                    <div style={{fontSize:10,color:"#94a3b8",fontWeight:600}}>Fatturato</div>
                  </div>}
                  {lastPratica && <div style={{flex:1,background:"#f8fafc",borderRadius:2,padding:"8px 10px",textAlign:"center"}}>
                    <div style={{fontSize:12,fontWeight:800,color:"#1e293b"}}>{fmtDate(lastPratica.data)}</div>
                    <div style={{fontSize:10,color:"#94a3b8",fontWeight:600}}>Ultima</div>
                  </div>}
                </div>

                {/* Actions */}
                <div style={{display:"flex",gap:8,marginTop:10}}>
                  <button onClick={()=>{setSelClient(c.id);setClientSearch("");setView("new_pratica");}} style={{flex:1,padding:"9px",borderRadius:2,border:"2px solid #e07a2f",background:"#fff",color:"#e07a2f",fontSize:12,fontWeight:800,cursor:"pointer"}}>+ Pratica</button>
                  <button onClick={()=>{setClientForm({...c});setView("new_client");}} style={{flex:1,padding:"9px",borderRadius:2,border:"2px solid #94a3b8",background:"#fff",color:"#64748b",fontSize:12,fontWeight:800,cursor:"pointer"}}>✏️ Modifica</button>
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
                          <span style={{fontSize:10,fontWeight:700,color:sc.color,background:sc.bg,padding:"2px 8px",borderRadius:2}}>{sc.icon} {sc.label}</span>
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
        {saveError&&<div style={{position:"fixed",top:20,left:"50%",transform:"translateX(-50%)",background:"#dc2626",color:"#fff",padding:"10px 20px",borderRadius:2,fontSize:13,fontWeight:700,zIndex:9999,boxShadow:"0 4px 20px rgba(0,0,0,0.3)",maxWidth:340,textAlign:"center"}}>{saveError}</div>}
        <BottomNav items={navItems} active={view} onNav={setView} />
      </div>
    );
  }

  // ==================== NOTES ====================
  if (view === "notes") {
    return (
      <div style={S.container}>
        <div style={{...S.header,padding:"16px 20px 12px"}}>
          <h2 style={{...S.logo,fontSize:18}}> Note</h2>
          <button onClick={()=>{setNoteEdit({testo:"",colore:"#fffbeb",praticaId:""});setView("note_edit");}} style={S.addBtn}>+ Nuova</button>
        </div>
        <div style={{padding:"0 16px",paddingTop:12}}>
          {(db.notes||[]).length===0 ? <div style={S.empty}><div style={{fontSize:48}}></div><p style={S.emptyTitle}>Nessuna nota</p><p style={S.emptySub}>Aggiungi note per ricordare cose importanti</p></div>
          : (db.notes||[]).map((n: any)=>(
            <div key={n.id} style={{...S.noteCardFull,background:n.colore||"#fffbeb"}}>
              <button onClick={()=>{setNoteEdit(n);setView("note_edit");}} style={{...S.noteCardBtn}}>
                <div style={{fontSize:14,color:"#0f172a",whiteSpace:"pre-wrap"}}>{n.testo||"Nota vuota"}</div>
                {n.praticaId && <div style={{fontSize:12,color:"#7c3aed",marginTop:6}}> {getPratica(n.praticaId)?.numero||""} · {getClient(getPratica(n.praticaId)?.clientId)?.nome||""}</div>}
                <div style={{fontSize:11,color:"#94a3b8",marginTop:6}}>{n.updatedAt?new Date(n.updatedAt).toLocaleString("it-IT"):""}</div>
              </button>
              <button onClick={()=>{if(confirm("Eliminare nota?"))deleteNote(n.id);}} style={S.noteDelBtn}></button>
            </div>
          ))}
        </div>
        {saveError&&<div style={{position:"fixed",top:20,left:"50%",transform:"translateX(-50%)",background:"#dc2626",color:"#fff",padding:"10px 20px",borderRadius:2,fontSize:13,fontWeight:700,zIndex:9999,boxShadow:"0 4px 20px rgba(0,0,0,0.3)",maxWidth:340,textAlign:"center"}}>{saveError}</div>}
        <BottomNav items={navItems} active={view} onNav={setView} />
      </div>
    );
  }

  // ==================== TEAM VIEW ====================
  if (view === "team") {
    return (
      <div style={S.container}>
        <div style={{...S.header,padding:"16px 20px 12px"}}>
          <h2 style={{...S.logo,fontSize:18}}> Team</h2>
          {org && isAdmin && <button onClick={()=>setView("team_add")} style={S.addBtn}>+ Membro</button>}
        </div>
        <div style={{padding:"0 16px",paddingTop:12}}>
          {!org ? (
            <TeamSetup onCreate={createOrganization} userName={user?.email} />
          ) : (
            <>
              {/* Org header */}
              <div style={{background:"#3a7bd5",borderRadius:2,padding:20,marginBottom:16,color:"#fff"}}>
                <div style={{fontSize:18,fontWeight:800}}>{org.nome}</div>
                <div style={{fontSize:13,opacity:0.8,marginTop:4}}>{teamMembers.length} membri · Piano {org.piano||"free"}</div>
                {myMember && <div style={{fontSize:12,marginTop:8,background:"rgba(255,255,255,0.2)",padding:"4px 12px",borderRadius:2,display:"inline-block"}}>Il tuo ruolo: <b>{ROLES[myMember.ruolo]?.icon||"👷"} {ROLES[myMember.ruolo]?.label||myMember.ruolo}</b></div>}
              </div>

              {/* I miei permessi */}
              {!isAdmin && myPermissions.length > 0 && (
                <div style={{background:"#f8fafc",borderRadius:2,padding:14,marginBottom:16,border:"1px solid #e2e8f0"}}>
                  <div style={{fontSize:12,fontWeight:800,color:"#374151",marginBottom:8}}>I TUOI COMPITI</div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    {myPermissions.map((p: string) => {
                      const phase = [...WORKFLOW_NUOVO, ...WORKFLOW_RIP].find(w => w.key === p);
                      return phase ? <span key={p} style={{padding:"6px 12px",borderRadius:2,background:"#eff6ff",color:"#2563eb",fontSize:12,fontWeight:700}}>{phase.icon} {phase.label}</span> : null;
                    })}
                  </div>
                </div>
              )}

              {/* Team members list */}
              <div style={{fontSize:13,fontWeight:800,color:"#374151",marginBottom:10,textTransform:"uppercase",letterSpacing:"0.5px"}}>Membri del Team</div>
              {teamMembers.map((m: any) => (
                <div key={m.id} style={{display:"flex",alignItems:"center",gap:12,padding:14,background:"#fff",borderRadius:2,marginBottom:10,boxShadow:"0 4px 16px rgba(0,0,0,0.06)"}}>
                  <div style={{width:44,height:44,borderRadius:"50%",background:ROLES[m.ruolo]?`${ROLES[m.ruolo].color}`:"#3a7bd5",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:18,fontWeight:800,flexShrink:0}}>{m.nome?.charAt(0)?.toUpperCase()}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:15,fontWeight:700,color:"#0f172a"}}>{m.nome}</div>
                    <div style={{fontSize:12,color:"#64748b"}}>{m.email}</div>
                    <div style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:4}}>
                      <span style={{fontSize:10,padding:"2px 8px",borderRadius:2,background:ROLES[m.ruolo]?.bg||"#eff6ff",color:ROLES[m.ruolo]?.color||"#1e40af",fontWeight:700}}>{ROLES[m.ruolo]?.icon||"👷"} {ROLES[m.ruolo]?.label||m.ruolo}</span>
                      {!m.invite_accepted && <span style={{fontSize:10,padding:"2px 8px",borderRadius:2,background:"#fef2f2",color:"#dc2626",fontWeight:700}}>⏳ In attesa</span>}
                    </div>
                  </div>
                  {isAdmin && m.user_id !== user?.id && (
                    <div style={{display:"flex",flexDirection:"column",gap:4,alignItems:"flex-end"}}>
                      <select value={m.ruolo} onChange={(e: any)=>{updateTeamMember(m.id,{ruolo:e.target.value,permessi:ROLES[e.target.value]?.permessi||[]});}} style={{padding:"4px 8px",borderRadius:2,border:"1.5px solid #c4b5fd",fontSize:11,fontWeight:700,outline:"none",cursor:"pointer"}}>
                        {Object.entries(ROLES).map(([k,r])=><option key={k} value={k}>{r.icon} {r.label}</option>)}
                      </select>
                      <button onClick={()=>{if(confirm(`Rimuovere ${m.nome}?`))removeTeamMember(m.id);}} style={{width:28,height:28,borderRadius:2,background:"#fef2f2",border:"none",color:"#dc2626",fontSize:12,cursor:"pointer"}}></button>
                    </div>
                  )}
                </div>
              ))}

              {/* Le mie pratiche assegnate (per operatori) */}
              {!isAdmin && (
                <div style={{marginTop:20}}>
                  <div style={{fontSize:13,fontWeight:800,color:"#374151",marginBottom:10,textTransform:"uppercase"}}>Le Mie Pratiche</div>
                  {db.pratiche.filter((p: any) => p.assegnatoA === myMember?.id).length === 0 
                    ? <div style={{fontSize:13,color:"#94a3b8",textAlign:"center",padding:20}}>Nessuna pratica assegnata</div>
                    : db.pratiche.filter((p: any) => p.assegnatoA === myMember?.id).map((p: any) => {
                        const c = getClient(p.clientId);
                        const wf = getWorkflow(p.tipo);
                        const phaseIdx = getPhaseIndex(p.tipo, p.fase);
                        const phase = wf[phaseIdx];
                        return (
                          <button key={p.id} onClick={()=>{setSelPratica(p.id);setView("pratica");}} style={{display:"flex",alignItems:"center",gap:12,width:"100%",textAlign:"left",padding:14,background:"#fff",borderRadius:2,border:"none",marginBottom:10,cursor:"pointer",boxShadow:"0 4px 16px rgba(0,0,0,0.06)"}}>
                            <span style={{fontSize:22}}>{phase?.icon||""}</span>
                            <div style={{flex:1}}>
                              <div style={{fontSize:14,fontWeight:700,color:"#0f172a"}}>{p.numero}</div>
                              <div style={{fontSize:12,color:"#64748b"}}>{c?.nome} · {phase?.label}</div>
                            </div>
                          </button>
                        );
                      })
                  }
                </div>
              )}
            </>
          )}
        </div>
        {saveError&&<div style={{position:"fixed",top:20,left:"50%",transform:"translateX(-50%)",background:"#dc2626",color:"#fff",padding:"10px 20px",borderRadius:2,fontSize:13,fontWeight:700,zIndex:9999,boxShadow:"0 4px 20px rgba(0,0,0,0.3)",maxWidth:340,textAlign:"center"}}>{saveError}</div>}
        <BottomNav items={navItems} active={view} onNav={setView} />
      </div>
    );
  }

  // ==================== TEAM ADD MEMBER ====================
  if (view === "team_add") {
    return <TeamAddMember onAdd={async (nome: string, email: string, ruolo: string, permessi: string[]) => {
      await addTeamMember(nome, email, ruolo, permessi);
      setView("team");
    }} onBack={()=>setView("team")} />;
  }

  return <div style={S.container}>{saveError&&<div style={{position:"fixed",top:20,left:"50%",transform:"translateX(-50%)",background:"#dc2626",color:"#fff",padding:"10px 20px",borderRadius:2,fontSize:13,fontWeight:700,zIndex:9999,boxShadow:"0 4px 20px rgba(0,0,0,0.3)",maxWidth:340,textAlign:"center"}}>{saveError}</div>}
        <BottomNav items={navItems} active={view} onNav={setView} /></div>;
}

// ==================== FIRMA CORRETTA POSA ====================
function FirmaCorrettaPosa({ onSave }: any) {
  const [nonConformita, setNonConformita] = useState("");
  const [noteFinali, setNoteFinali] = useState("");
  const [showSign, setShowSign] = useState(false);
  return (
    <div>
      <p style={{fontSize:12,color:"#374151",marginBottom:10}}>Il cliente firma per confermare la corretta posa in opera degli infissi.</p>
      <div style={{marginBottom:10}}>
        <label style={{fontSize:11,fontWeight:700,color:"#374151",display:"block",marginBottom:4}}> Non conformità (se presenti)</label>
        <textarea value={nonConformita} onChange={(e: any)=>setNonConformita(e.target.value)} placeholder="Nessuna non conformità rilevata" style={{width:"100%",padding:"10px 12px",borderRadius:2,border:"1.5px solid #d1d5db",fontSize:13,resize:"vertical",minHeight:50,outline:"none",boxSizing:"border-box"}} />
      </div>
      <div style={{marginBottom:10}}>
        <label style={{fontSize:11,fontWeight:700,color:"#374151",display:"block",marginBottom:4}}> Note finali</label>
        <textarea value={noteFinali} onChange={(e: any)=>setNoteFinali(e.target.value)} placeholder="Note sulla posa..." style={{width:"100%",padding:"10px 12px",borderRadius:2,border:"1.5px solid #d1d5db",fontSize:13,resize:"vertical",minHeight:50,outline:"none",boxSizing:"border-box"}} />
      </div>
      {!showSign ? (
        <button onClick={()=>setShowSign(true)} style={{width:"100%",padding:"14px",borderRadius:2,border:"none",background:"#2d8a4e",color:"#fff",fontSize:15,fontWeight:800,cursor:"pointer"}}> Firma del Cliente</button>
      ) : (
        <SignaturePad onSave={(img: string) => { onSave({ firma: img, nonConformita, noteFinali }); setShowSign(false); }} onCancel={() => setShowSign(false)} />
      )}
    </div>
  );
}

// ==================== TEAM SETUP (create org) ====================
function TeamSetup({ onCreate, userName }: any) {
  const [nome, setNome] = useState("");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  const [indirizzo, setIndirizzo] = useState("");
  const [piva, setPiva] = useState("");
  return (
    <div style={{padding:"20px 0"}}>
      <div style={{textAlign:"center",marginBottom:20}}>
        <div style={{fontSize:56,marginBottom:12}}></div>
        <h3 style={{fontSize:20,fontWeight:800,color:"#0f172a",marginBottom:6}}>Crea la tua Organizzazione</h3>
        <p style={{fontSize:13,color:"#64748b"}}>Per usare il team, crea prima l'azienda. Potrai invitare dipendenti e assegnare compiti.</p>
      </div>
      <div style={{background:"#fff",borderRadius:2,padding:16,boxShadow:"0 4px 16px rgba(0,0,0,0.06)"}}>
        <Field label="Nome Azienda *" value={nome} onChange={setNome} placeholder="es. Walter Cozza Serramenti SRL" autoFocus />
        <Field label="Telefono" value={telefono} onChange={setTelefono} placeholder="+39 0984 ..." type="tel" />
        <Field label="Email Azienda" value={email} onChange={setEmail} placeholder="info@azienda.it" type="email" />
        <Field label="Indirizzo Sede" value={indirizzo} onChange={setIndirizzo} placeholder="Via Roma 1, Cosenza" />
        <Field label="P.IVA" value={piva} onChange={setPiva} placeholder="IT01234567890" />
      </div>
      <button onClick={()=>{if(nome.trim())onCreate({nome:nome.trim(),telefono,email,indirizzo,piva});}} disabled={!nome.trim()} style={{width:"100%",padding:"16px",borderRadius:2,border:"none",background:nome.trim()?"#3a7bd5":"#e2e8f0",color:nome.trim()?"#fff":"#94a3b8",fontSize:16,fontWeight:800,cursor:nome.trim()?"pointer":"default",marginTop:16}}> Crea Organizzazione</button>
    </div>
  );
}

// ==================== TEAM ADD MEMBER ====================
function TeamAddMember({ onAdd, onBack }: any) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [ruolo, setRuolo] = useState("geometra");
  const [permessi, setPermessi] = useState<string[]>(ROLES.geometra.permessi);
  const allPermessi = [
    { key: "sopralluogo", label: " Sopralluogo" },
    { key: "misure", label: " Misure" },
    { key: "preventivo", label: " Preventivo" },
    { key: "conferma", label: " Conferma" },
    { key: "fattura", label: " Fattura" },
    { key: "posa", label: " Posa" },
    { key: "riparazione", label: " Riparazione" },
    { key: "clienti", label: " Clienti" },
    { key: "email", label: " Email" },
    { key: "note", label: " Note" },
  ];
  function selectRole(key: string) {
    setRuolo(key);
    setPermessi([...(ROLES[key]?.permessi || [])]);
  }
  function togglePerm(key: string) {
    setPermessi(prev => prev.includes(key) ? prev.filter(p=>p!==key) : [...prev, key]);
  }
  return (
    <div style={S.container}>
      <div style={{...S.secHdr,background:"#3a7bd5"}}><button onClick={onBack} style={{...S.backBtn,color:"#fff"}}>← Indietro</button><h2 style={{...S.secTitle,color:"#fff"}}> Nuovo Membro</h2></div>
      <div style={{padding:20}}>
        <Field label="Nome" value={nome} onChange={setNome} placeholder="Mario Rossi" autoFocus />
        <Field label="Email" value={email} onChange={setEmail} placeholder="mario@esempio.it" type="email" />
        <div style={S.fGroup}>
          <label style={S.fLabel}>Ruolo</label>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            {Object.entries(ROLES).map(([key, r]) => (
              <button key={key} onClick={()=>selectRole(key)} style={{padding:"14px 10px",borderRadius:2,border:ruolo===key?`3px solid ${r.color}`:"2px solid #e2e8f0",background:ruolo===key?r.bg:"#fff",cursor:"pointer",textAlign:"center"}}>
                <div style={{fontSize:24}}>{r.icon}</div>
                <div style={{fontSize:13,fontWeight:700,color:ruolo===key?r.color:"#374151",marginTop:4}}>{r.label}</div>
                <div style={{fontSize:10,color:"#94a3b8"}}>{r.desc}</div>
              </button>
            ))}
          </div>
        </div>
        {ruolo !== "admin" && (
          <div style={S.fGroup}>
            <label style={S.fLabel}>Personalizza Permessi</label>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {allPermessi.map(p => (
                <button key={p.key} onClick={()=>togglePerm(p.key)} style={{padding:"10px 14px",borderRadius:2,border:permessi.includes(p.key)?"2px solid #3a7bd5":"2px solid #e2e8f0",background:permessi.includes(p.key)?"#eff6ff":"#fff",color:permessi.includes(p.key)?"#4338ca":"#64748b",fontSize:13,fontWeight:700,cursor:"pointer"}}>{p.label}</button>
              ))}
            </div>
          </div>
        )}
        <div style={{background:"#f0fdf4",borderRadius:2,padding:14,marginBottom:16,border:"1px solid #86efac"}}>
          <div style={{fontSize:12,fontWeight:700,color:"#166534",marginBottom:4}}>📩 Come invitare</div>
          <div style={{fontSize:12,color:"#374151"}}>Il membro dovrà registrarsi su FrameFlow con la stessa email <b>{email||"..."}</b>. Appena accede, vedrà solo le pratiche assegnate e le funzioni del suo ruolo.</div>
        </div>
        <button onClick={()=>{if(nome.trim()&&email.trim())onAdd(nome.trim(),email.trim(),ruolo,ruolo==="admin"?allPermessi.map(p=>p.key):permessi);}} disabled={!nome.trim()||!email.trim()} style={{width:"100%",padding:"16px",borderRadius:2,border:"none",background:nome.trim()&&email.trim()?"#3a7bd5":"#e2e8f0",color:nome.trim()&&email.trim()?"#fff":"#94a3b8",fontSize:16,fontWeight:800,cursor:nome.trim()&&email.trim()?"pointer":"default"}}> Aggiungi al Team</button>
      </div>
    </div>
  );
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
    { title: "Materiali", icon: "" },
    { title: "Colori", icon: "" },
    { title: "Prodotti", icon: "" },
    { title: "Tipologie", icon: "" },
    { title: "La tua azienda", icon: "" },
  ];

  return (
    <div style={{...S.container,background:"#1a1a2e"}}>
      <div style={{padding:"30px 20px 16px",textAlign:"center"}}>
        <div style={{fontSize:38}}>{steps[step].icon}</div>
        <h1 style={{fontSize:22,fontWeight:900,color:"#fff",margin:"8px 0 4px"}}>{steps[step].title}</h1>
        <div style={{display:"flex",gap:6,justifyContent:"center",margin:"16px 0"}}>{steps.map((_,i)=><div key={i} style={{width:i===step?24:8,height:8,borderRadius:4,background:i<=step?"#e07a2f":"rgba(255,255,255,0.2)",transition:"all 0.3s"}} />)}</div>
      </div>
      <div style={{flex:1,background:"#fff",borderRadius:"24px 24px 0 0",padding:20,overflow:"auto"}}>
        {step===0 && (
          <div style={{textAlign:"center",padding:"20px 0"}}>
            <p style={{fontSize:16,color:"#374151",lineHeight:1.6,marginBottom:20}}>Configura FrameFlow per la tua attività. Scegli i materiali, i colori e i prodotti che usi di più.</p>
            <p style={{fontSize:14,color:"#64748b",marginBottom:30}}>Puoi sempre modificare queste impostazioni dopo dal tasto </p>
            <button onClick={()=>setStep(1)} style={{...S.saveBtn,background:"#e07a2f",fontSize:18}}>Iniziamo! →</button>
            <button onClick={onSkip} style={{...S.saveBtn,background:"transparent",color:"#64748b",boxShadow:"none",marginTop:8,fontSize:14}}>Salta per ora</button>
          </div>
        )}
        {step===1 && (<>
          <p style={{fontSize:14,color:"#64748b",marginBottom:16}}>Seleziona i materiali che tratti nella tua attività:</p>
          <div style={{display:"flex",flexWrap:"wrap",gap:10}}>
            {DEFAULT_SISTEMI.map(s=><button key={s.id} onClick={()=>toggleSistema(s)} style={{...S.pill,padding:"12px 18px",fontSize:14,background:sistemi.find((x: any)=>x.id===s.id)?"#e07a2f":"#f3f4f6",color:sistemi.find((x: any)=>x.id===s.id)?"#fff":"#374151",fontWeight:700,borderRadius:2}}>{s.icon} {s.nome}</button>)}
          </div>
          <div style={{display:"flex",gap:8,marginTop:16}}>
            <input value={customSistema} onChange={e=>setCustomSistema(e.target.value)} placeholder="Aggiungi materiale..." style={{...S.input,flex:1}} onKeyDown={e=>e.key==="Enter"&&addCustomSistema()} />
            <button onClick={addCustomSistema} style={{...S.pill,background:"#e07a2f",color:"#fff",padding:"10px 16px",fontWeight:700}}>+</button>
          </div>
          {sistemi.filter((s: any)=>!DEFAULT_SISTEMI.find(d=>d.id===s.id)).map((s: any)=><div key={s.id} style={{display:"flex",alignItems:"center",gap:8,marginTop:8,padding:"8px 12px",background:"#f0f9ff",borderRadius:2}}><span>{s.icon} {s.nome}</span><button onClick={()=>setSistemi(sistemi.filter((x: any)=>x.id!==s.id))} style={{marginLeft:"auto",background:"none",border:"none",color:"#ef4444",fontSize:18,cursor:"pointer"}}>×</button></div>)}
          <div style={{marginTop:20,display:"flex",gap:10}}>
            <button onClick={()=>setStep(0)} style={{...S.saveBtn,flex:1,background:"#e2e8f0",color:"#374151",boxShadow:"none"}}>← Indietro</button>
            <button onClick={()=>{if(!selectedSistemaForColors && sistemi.length>0) setSelectedSistemaForColors(sistemi[0].id); setStep(2);}} style={{...S.saveBtn,flex:2,background:"#e07a2f"}}>Avanti →</button>
          </div>
        </>)}
        {step===2 && (<>
          <p style={{fontSize:14,color:"#64748b",marginBottom:12}}>Per ogni materiale, seleziona o aggiungi i colori disponibili:</p>
          {sistemi.length===0 ? <p style={{color:"#ef4444",fontWeight:600}}>Torna indietro e seleziona almeno un materiale</p> : <>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:16}}>
              {sistemi.map((s: any)=><button key={s.id} onClick={()=>setSelectedSistemaForColors(s.id)} style={{...S.pill,padding:"10px 14px",background:selectedSistemaForColors===s.id?"#e07a2f":"#f3f4f6",color:selectedSistemaForColors===s.id?"#fff":"#374151",fontWeight:700,borderRadius:2}}>{s.icon} {s.nome}</button>)}
            </div>
            {selectedSistemaForColors && <>
              <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                {(DEFAULT_COLORI[selectedSistemaForColors]||[]).map((c: string)=><button key={c} onClick={()=>toggleColore(selectedSistemaForColors,c)} style={{...S.pill,padding:"10px 14px",background:(colori[selectedSistemaForColors]||[]).includes(c)?"#059669":"#f3f4f6",color:(colori[selectedSistemaForColors]||[]).includes(c)?"#fff":"#374151",fontWeight:600,borderRadius:2}}>{c}</button>)}
              </div>
              {(colori[selectedSistemaForColors]||[]).filter(c=>!(DEFAULT_COLORI[selectedSistemaForColors]||[]).includes(c)).map(c=><div key={c} style={{display:"inline-flex",alignItems:"center",gap:6,marginTop:6,padding:"6px 12px",background:"#ecfdf5",borderRadius:2,marginRight:6}}><span style={{fontSize:13}}>{c}</span><button onClick={()=>toggleColore(selectedSistemaForColors,c)} style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer"}}>×</button></div>)}
              <div style={{display:"flex",gap:8,marginTop:12}}>
                <input value={customColore} onChange={e=>setCustomColore(e.target.value)} placeholder="Aggiungi colore..." style={{...S.input,flex:1}} onKeyDown={e=>e.key==="Enter"&&addCustomColore(selectedSistemaForColors)} />
                <button onClick={()=>addCustomColore(selectedSistemaForColors)} style={{...S.pill,background:"#059669",color:"#fff",padding:"10px 16px",fontWeight:700}}>+</button>
              </div>
              <button onClick={()=>{const all = DEFAULT_COLORI[selectedSistemaForColors]||[]; setColori({...colori,[selectedSistemaForColors]:all});}} style={{marginTop:8,background:"none",border:"none",color:"#e07a2f",fontSize:13,fontWeight:700,cursor:"pointer"}}>Seleziona tutti i predefiniti</button>
            </>}
          </>}
          <div style={{marginTop:20,display:"flex",gap:10}}>
            <button onClick={()=>setStep(1)} style={{...S.saveBtn,flex:1,background:"#e2e8f0",color:"#374151",boxShadow:"none"}}>← Indietro</button>
            <button onClick={()=>setStep(3)} style={{...S.saveBtn,flex:2,background:"#e07a2f"}}>Avanti →</button>
          </div>
        </>)}
        {step===3 && (<>
          <p style={{fontSize:14,color:"#64748b",marginBottom:12}}>Seleziona le categorie di prodotti che offri:</p>
          <div style={{display:"flex",flexWrap:"wrap",gap:10}}>
            {DEFAULT_CATEGORIE.map(c=><button key={c.id} onClick={()=>toggleCategoria(c)} style={{...S.pill,padding:"12px 18px",fontSize:14,background:categorie.find((x: any)=>x.id===c.id)?"#8b5cf6":"#f3f4f6",color:categorie.find((x: any)=>x.id===c.id)?"#fff":"#374151",fontWeight:700,borderRadius:2}}>{c.icon} {c.nome}</button>)}
          </div>
          <div style={{display:"flex",gap:8,marginTop:16}}>
            <input value={customCategoria} onChange={e=>setCustomCategoria(e.target.value)} placeholder="Aggiungi categoria..." style={{...S.input,flex:1}} onKeyDown={e=>{if(e.key==="Enter"&&customCategoria.trim()){const id=customCategoria.trim().toLowerCase().replace(/\s+/g,"_");if(!categorie.find((c: any)=>c.id===id)){setCategorie([...categorie,{id,nome:customCategoria.trim(),icon:""}]);}setCustomCategoria("");}}} />
            <button onClick={()=>{if(customCategoria.trim()){const id=customCategoria.trim().toLowerCase().replace(/\s+/g,"_");if(!categorie.find((c: any)=>c.id===id)){setCategorie([...categorie,{id,nome:customCategoria.trim(),icon:""}]);}setCustomCategoria("");}}} style={{...S.pill,background:"#8b5cf6",color:"#fff",padding:"10px 16px",fontWeight:700}}>+</button>
          </div>
          <div style={{marginTop:20,display:"flex",gap:10}}>
            <button onClick={()=>setStep(2)} style={{...S.saveBtn,flex:1,background:"#e2e8f0",color:"#374151",boxShadow:"none"}}>← Indietro</button>
            <button onClick={()=>setStep(4)} style={{...S.saveBtn,flex:2,background:"#e07a2f"}}>Avanti →</button>
          </div>
        </>)}
        {step===4 && (<>
          <p style={{fontSize:14,color:"#64748b",marginBottom:12}}>Seleziona le tipologie infisso che usi nelle misure:</p>
          <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
            {DEFAULT_TIPOLOGIE.map(t=><button key={t} onClick={()=>toggleTipologia(t)} style={{...S.pill,padding:"10px 14px",background:tipologie.includes(t)?"#2563eb":"#f3f4f6",color:tipologie.includes(t)?"#fff":"#374151",fontWeight:600,borderRadius:2}}>{t}</button>)}
          </div>
          <div style={{display:"flex",gap:8,marginTop:12}}>
            <input value={customTipologia} onChange={e=>setCustomTipologia(e.target.value)} placeholder="Aggiungi tipologia..." style={{...S.input,flex:1}} onKeyDown={e=>e.key==="Enter"&&addCustomTipologia()} />
            <button onClick={addCustomTipologia} style={{...S.pill,background:"#2563eb",color:"#fff",padding:"10px 16px",fontWeight:700}}>+</button>
          </div>
          {tipologie.filter(t=>!DEFAULT_TIPOLOGIE.includes(t)).map(t=><div key={t} style={{display:"inline-flex",alignItems:"center",gap:6,marginTop:6,padding:"6px 12px",background:"#eff6ff",borderRadius:2,marginRight:6}}><span style={{fontSize:13}}>{t}</span><button onClick={()=>setTipologie(tipologie.filter(x=>x!==t))} style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer"}}>×</button></div>)}
          <div style={{marginTop:20,display:"flex",gap:10}}>
            <button onClick={()=>setStep(3)} style={{...S.saveBtn,flex:1,background:"#e2e8f0",color:"#374151",boxShadow:"none"}}>← Indietro</button>
            <button onClick={()=>setStep(5)} style={{...S.saveBtn,flex:2,background:"#e07a2f"}}>Avanti →</button>
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
            <button onClick={()=>onComplete({sistemi,categorie,colori,tipologie,listino:userSettings.listino||[],azienda})} style={{...S.saveBtn,flex:2,background:"#e07a2f",fontSize:16}}> Completa Setup</button>
          </div>
        </>)}
      </div>
    </div>
  );
}

// ==================== SETTINGS VIEW ====================
function SettingsView({ userSettings, appTheme, onChangeTheme, onSave, onBack }: any) {
  const [tab, setTab] = useState("materiali");
  const [sistemi, setSistemi] = useState<any[]>(userSettings.sistemi?.length > 0 ? userSettings.sistemi : [...DEFAULT_SISTEMI]);
  const [categorie, setCategorie] = useState<any[]>(userSettings.categorie?.length > 0 ? userSettings.categorie : [...DEFAULT_CATEGORIE]);
  const [colori, setColori] = useState<Record<string,string[]>>(userSettings.colori || {...DEFAULT_COLORI});
  const [tipologie, setTipologie] = useState<string[]>(userSettings.tipologie?.length > 0 ? userSettings.tipologie : [...DEFAULT_TIPOLOGIE]);
  const [vetri, setVetri] = useState<string[]>(userSettings.vetri?.length > 0 ? userSettings.vetri : [...DEFAULT_VETRI]);
  const [listino, setListino] = useState<any[]>(userSettings.listino || []);
  const [azienda, setAzienda] = useState(userSettings.azienda || {});
  const [checklists, setChecklists] = useState<Record<string,string[]>>(() => {
    const c = userSettings.checklists || {};
    // Initialize with defaults if empty
    const merged: Record<string,string[]> = {};
    Object.keys(DEFAULT_TASKS).forEach(k => { merged[k] = c[k]?.length > 0 ? [...c[k]] : [...DEFAULT_TASKS[k]]; });
    return merged;
  });
  const [selPhase, setSelPhase] = useState("sopralluogo");
  const [customInput, setCustomInput] = useState("");
  const [selMat, setSelMat] = useState(sistemi[0]?.id || "");
  const [listinoForm, setListinoForm] = useState<any>(null);
  const [editingGridId, setEditingGridId] = useState<string|null>(null);
  const [gridView, setGridView] = useState<"auto"|"manual"|"csv">("auto");
  const [csvText, setCsvText] = useState("");

  function removeSistema(id: string) { setSistemi(sistemi.filter((s: any) => s.id !== id)); }
  function addSistema() { if(!customInput.trim()) return; const id=customInput.trim().toLowerCase().replace(/\s+/g,"_"); if(!sistemi.find((s: any)=>s.id===id)) setSistemi([...sistemi,{id,nome:customInput.trim(),icon:"🔹"}]); setCustomInput(""); }
  function removeCategoria(id: string) { setCategorie(categorie.filter((c: any) => c.id !== id)); }
  function addCategoria() { if(!customInput.trim()) return; const id=customInput.trim().toLowerCase().replace(/\s+/g,"_"); if(!categorie.find((c: any)=>c.id===id)) setCategorie([...categorie,{id,nome:customInput.trim(),icon:""}]); setCustomInput(""); }
  function addColore(matId: string, col: string) { if(!col.trim()) return; const cur=colori[matId]||[]; if(!cur.includes(col.trim())) setColori({...colori,[matId]:[...cur,col.trim()]}); setCustomInput(""); }
  function removeColore(matId: string, col: string) { setColori({...colori,[matId]:(colori[matId]||[]).filter(c=>c!==col)}); }
  function addTipologia() { if(!customInput.trim()||tipologie.includes(customInput.trim())) return; setTipologie([...tipologie,customInput.trim()]); setCustomInput(""); }
  function removeTipologia(t: string) { setTipologie(tipologie.filter(x=>x!==t)); }
  function addVetro() { if(!customInput.trim()||vetri.includes(customInput.trim())) return; setVetri([...vetri,customInput.trim()]); setCustomInput(""); }
  function removeVetro(v: string) { setVetri(vetri.filter(x=>x!==v)); }
  function addListinoItem() {
    if(!listinoForm?.descrizione?.trim()) return;
    const item = {...listinoForm, id: gid()};
    if(item.tipo === "griglia" && item.griglia) {
      // Ensure griglia has prezzi object
      if(!item.griglia.prezzi) item.griglia.prezzi = {};
    }
    setListino([...listino, item]);
    setListinoForm(null);
  }
  function removeListinoItem(id: string) { setListino(listino.filter((l: any)=>l.id!==id)); setEditingGridId(null); }
  function updateListinoItem(id: string, updates: any) {
    setListino(listino.map((l: any) => l.id === id ? {...l, ...updates} : l));
  }
  function autoGenerateGrid(item: any) {
    const g = item.griglia;
    if(!g || !g.minL || !g.maxL || !g.minH || !g.maxH || !g.stepL || !g.stepH) return item;
    const prezzi: Record<string, number> = {};
    for(let l = g.minL; l <= g.maxL; l += g.stepL) {
      for(let h = g.minH; h <= g.maxH; h += g.stepH) {
        const stepsL = Math.round((l - g.minL) / g.stepL);
        const stepsH = Math.round((h - g.minH) / g.stepH);
        prezzi[`${l}x${h}`] = Math.round(((g.prezzoBase||0) + stepsL * (g.incL||0) + stepsH * (g.incH||0)) * 100) / 100;
      }
    }
    return {...item, griglia: {...g, prezzi}};
  }
  function importGridCSV(itemId: string, text: string) {
    const lines = text.trim().split("\n").map(l => l.split(/[,;\t]/));
    if(lines.length < 2) return;
    const item = listino.find((l: any) => l.id === itemId);
    if(!item?.griglia) return;
    const heights = lines[0].slice(1).map(h => parseInt(h.trim())).filter(h => !isNaN(h));
    const widths: number[] = [];
    const prezzi: Record<string, number> = {};
    for(let r = 1; r < lines.length; r++) {
      const w = parseInt(lines[r][0]?.trim());
      if(isNaN(w)) continue;
      widths.push(w);
      for(let c = 1; c < lines[r].length; c++) {
        const h = heights[c-1];
        const p = parseFloat(lines[r][c]?.trim().replace(",","."));
        if(!isNaN(h) && !isNaN(p)) prezzi[`${w}x${h}`] = p;
      }
    }
    // Auto-detect grid dimensions from imported data
    const sortedW = [...widths].sort((a,b)=>a-b);
    const sortedH = [...heights].sort((a,b)=>a-b);
    const autoStepL = sortedW.length >= 2 ? sortedW[1] - sortedW[0] : 100;
    const autoStepH = sortedH.length >= 2 ? sortedH[1] - sortedH[0] : 100;
    const newGriglia = {
      ...item.griglia,
      prezzi,
      minL: sortedW[0] || item.griglia.minL,
      maxL: sortedW[sortedW.length-1] || item.griglia.maxL,
      stepL: autoStepL || item.griglia.stepL,
      minH: sortedH[0] || item.griglia.minH,
      maxH: sortedH[sortedH.length-1] || item.griglia.maxH,
      stepH: autoStepH || item.griglia.stepH,
    };
    updateListinoItem(itemId, {griglia: newGriglia});
    return {w: widths.length, h: heights.length, total: Object.keys(prezzi).length};
  }
  function handleFileUpload(itemId: string, file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if(!text) return;
      const result = importGridCSV(itemId, text);
      if(result) alert(`✅ Importati ${result.total} prezzi (${result.w} larghezze × ${result.h} altezze)`);
      else alert("❌ Formato non riconosciuto. Assicurati che la prima riga contenga le altezze e la prima colonna le larghezze.");
    };
    reader.readAsText(file);
  }
  function getGridPrice(item: any, l: number, h: number): number|null {
    if(!item?.griglia?.prezzi) return null;
    const g = item.griglia;
    // Find nearest step
    const snapL = Math.round(l / g.stepL) * g.stepL;
    const snapH = Math.round(h / g.stepH) * g.stepH;
    const clampL = Math.max(g.minL, Math.min(g.maxL, snapL));
    const clampH = Math.max(g.minH, Math.min(g.maxH, snapH));
    return g.prezzi[`${clampL}x${clampH}`] ?? null;
  }

  const tabs = [
    {key:"tema",label:"Tema",icon:""},
    {key:"materiali",label:"Materiali",icon:""},
    {key:"colori",label:"Colori",icon:""},
    {key:"tipologie",label:"Tipologie",icon:""},
    {key:"vetri",label:"Vetri",icon:""},
    {key:"prodotti",label:"Categorie",icon:""},
    {key:"listino",label:"Listino",icon:""},
    {key:"checklists",label:"Checklist",icon:""},
    {key:"azienda",label:"Azienda",icon:""},
  ];

  return (
    <div style={S.container}>
      <div style={{...S.secHdr,background:"#1a1a2e",borderBottom:"3px solid #e07a2f"}}>
        <button onClick={()=>onSave({sistemi,categorie,colori,tipologie,vetri,listino,checklists,azienda,setupCompleted:true})} style={{...S.backBtn,color:"#e07a2f"}}>← SALVA</button>
        <h2 style={{...S.secTitle,color:"#fff",fontFamily:"'JetBrains Mono','SF Mono',monospace",letterSpacing:'1px',textTransform:'uppercase',fontSize:14}}>IMPOSTAZIONI</h2>
      </div>
      <div style={{display:"flex",gap:4,padding:"12px 12px 0",overflowX:"auto",flexShrink:0}}>
        {tabs.map(t=><button key={t.key} onClick={()=>{setTab(t.key);setCustomInput("");}} style={{padding:"8px 12px",borderRadius:2,border:"none",background:tab===t.key?(THEMES[appTheme]?.primary||"#e07a2f"):"#f3f4f6",color:tab===t.key?"#fff":"#64748b",fontSize:12,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>{t.icon} {t.label}</button>)}
      </div>
      <div style={{padding:16,flex:1,overflow:"auto"}}>
        {tab==="tema" && (<>
          <p style={{fontSize:13,color:"#5c6370",marginBottom:12}}>Scegli il tema dell'app:</p>
          <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8}}>
            {Object.entries(THEMES).map(([key, theme]) => (
              <button key={key} onClick={()=>onChangeTheme(key)} style={{padding:14,borderRadius:2,border:appTheme===key?`3px solid ${theme.primary}`:"1px solid #d5d8de",background:theme.bg,cursor:"pointer",textAlign:"center",position:"relative",overflow:"hidden",transition:"all 0.15s"}}>
                <div style={{fontSize:13,fontWeight:800,color:theme.primary,fontFamily:"'JetBrains Mono','SF Mono',monospace",textTransform:"uppercase",letterSpacing:"1px"}}>{theme.name}</div>
                <div style={{display:"flex",gap:4,justifyContent:"center",marginTop:8}}>
                  <div style={{width:14,height:14,borderRadius:2,background:theme.primary}} />
                  <div style={{width:14,height:14,borderRadius:2,background:theme.secondary}} />
                  <div style={{width:14,height:14,borderRadius:2,background:theme.accent}} />
                </div>
                {appTheme===key && <div style={{position:"absolute",top:4,right:4,background:theme.primary,color:"#fff",borderRadius:2,padding:"2px 8px",fontSize:9,fontWeight:700,fontFamily:"'JetBrains Mono','SF Mono',monospace"}}>ATTIVO</div>}
              </button>
            ))}
          </div>
          <div style={{marginTop:14,padding:12,background:THEMES[appTheme]?.primaryLight||"#f0f0f0",borderRadius:2,border:`1.5px solid ${THEMES[appTheme]?.primary||"#666"}33`}}>
            <div style={{fontSize:11,fontWeight:700,color:THEMES[appTheme]?.primary||"#333",fontFamily:"'JetBrains Mono','SF Mono',monospace"}}>TEMA: {THEMES[appTheme]?.name}</div>
            <div style={{fontSize:11,color:"#64748b",marginTop:4}}>Il tema viene applicato immediatamente a tutta l'app.</div>
          </div>
        </>)}
        {tab==="materiali" && (<>
          <p style={{fontSize:13,color:"#64748b",marginBottom:12}}>I materiali/sistemi che tratti:</p>
          {sistemi.map((s: any)=><div key={s.id} style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",background:"#f8fafc",borderRadius:2,marginBottom:8}}><span style={{fontSize:20}}>{s.icon}</span><span style={{flex:1,fontWeight:700,fontSize:15}}>{s.nome}</span><button onClick={()=>removeSistema(s.id)} style={{background:"none",border:"none",color:"#ef4444",fontSize:20,cursor:"pointer"}}>×</button></div>)}
          <div style={{display:"flex",gap:8,marginTop:12}}><input value={customInput} onChange={e=>setCustomInput(e.target.value)} placeholder="Nuovo materiale..." style={{...S.input,flex:1}} onKeyDown={e=>e.key==="Enter"&&addSistema()} /><button onClick={addSistema} style={{...S.pill,background:"#e07a2f",color:"#fff",padding:"10px 18px",fontWeight:700}}>+</button></div>
        </>)}
        {tab==="colori" && (<>
          <p style={{fontSize:13,color:"#64748b",marginBottom:12}}>Colori per ogni materiale:</p>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14}}>
            {sistemi.map((s: any)=><button key={s.id} onClick={()=>setSelMat(s.id)} style={{...S.pill,padding:"10px 14px",background:selMat===s.id?"#e07a2f":"#f3f4f6",color:selMat===s.id?"#fff":"#374151",fontWeight:700,borderRadius:2}}>{s.icon} {s.nome}</button>)}
          </div>
          {selMat && <>
            {(colori[selMat]||[]).map((c: string)=><div key={c} style={{display:"inline-flex",alignItems:"center",gap:6,padding:"8px 14px",background:"#f0f9ff",borderRadius:2,marginBottom:6,marginRight:6}}><span style={{fontSize:13,fontWeight:600}}>{c}</span><button onClick={()=>removeColore(selMat,c)} style={{background:"none",border:"none",color:"#ef4444",fontSize:16,cursor:"pointer"}}>×</button></div>)}
            <div style={{display:"flex",gap:8,marginTop:8}}><input value={customInput} onChange={e=>setCustomInput(e.target.value)} placeholder="Nuovo colore..." style={{...S.input,flex:1}} onKeyDown={e=>e.key==="Enter"&&addColore(selMat,customInput)} /><button onClick={()=>addColore(selMat,customInput)} style={{...S.pill,background:"#059669",color:"#fff",padding:"10px 18px",fontWeight:700}}>+</button></div>
          </>}
        </>)}
        {tab==="tipologie" && (<>
          <p style={{fontSize:13,color:"#64748b",marginBottom:12}}>Tipologie infisso per le misure:</p>
          {tipologie.map(t=><div key={t} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",background:"#f8fafc",borderRadius:2,marginBottom:6}}><span style={{flex:1,fontSize:14,fontWeight:600}}>{t}</span><button onClick={()=>removeTipologia(t)} style={{background:"none",border:"none",color:"#ef4444",fontSize:18,cursor:"pointer"}}>×</button></div>)}
          <div style={{display:"flex",gap:8,marginTop:10}}><input value={customInput} onChange={e=>setCustomInput(e.target.value)} placeholder="Nuova tipologia..." style={{...S.input,flex:1}} onKeyDown={e=>e.key==="Enter"&&addTipologia()} /><button onClick={addTipologia} style={{...S.pill,background:"#2563eb",color:"#fff",padding:"10px 18px",fontWeight:700}}>+</button></div>
        </>)}
        {tab==="vetri" && (<>
          <p style={{fontSize:13,color:"#64748b",marginBottom:12}}>Tipi di vetro disponibili:</p>
          {vetri.map(v=><div key={v} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",background:"#f8fafc",borderRadius:2,marginBottom:6}}><span style={{flex:1,fontSize:14,fontWeight:600}}>{v}</span><button onClick={()=>removeVetro(v)} style={{background:"none",border:"none",color:"#ef4444",fontSize:18,cursor:"pointer"}}>×</button></div>)}
          <div style={{display:"flex",gap:8,marginTop:10}}><input value={customInput} onChange={e=>setCustomInput(e.target.value)} placeholder="Nuovo tipo vetro (es. 4/20/4 BE)..." style={{...S.input,flex:1}} onKeyDown={e=>e.key==="Enter"&&addVetro()} /><button onClick={addVetro} style={{...S.pill,background:"#0891b2",color:"#fff",padding:"10px 18px",fontWeight:700}}>+</button></div>
        </>)}
        {tab==="prodotti" && (<>
          <p style={{fontSize:13,color:"#64748b",marginBottom:12}}>Categorie di prodotti che offri:</p>
          {categorie.map((c: any)=><div key={c.id} style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",background:"#f8fafc",borderRadius:2,marginBottom:8}}><span style={{fontSize:20}}>{c.icon}</span><span style={{flex:1,fontWeight:700,fontSize:15}}>{c.nome}</span><button onClick={()=>removeCategoria(c.id)} style={{background:"none",border:"none",color:"#ef4444",fontSize:20,cursor:"pointer"}}>×</button></div>)}
          <div style={{display:"flex",gap:8,marginTop:12}}><input value={customInput} onChange={e=>setCustomInput(e.target.value)} placeholder="Nuova categoria..." style={{...S.input,flex:1}} onKeyDown={e=>e.key==="Enter"&&addCategoria()} /><button onClick={addCategoria} style={{...S.pill,background:"#8b5cf6",color:"#fff",padding:"10px 18px",fontWeight:700}}>+</button></div>
        </>)}
        {tab==="listino" && (<>
          <p style={{fontSize:13,color:"#64748b",marginBottom:12}}>Il tuo listino prezzi (usato nei preventivi). Supporta prezzi a pezzo, al mq/ml, o <strong>griglia L×H</strong>.</p>
          
          {/* Product List */}
          {listino.length===0 && <div style={{textAlign:"center",padding:30,color:"#94a3b8"}}><p style={{fontSize:14}}>Nessun articolo nel listino</p></div>}
          {listino.map((l: any)=><div key={l.id} style={{padding:"12px 14px",background:editingGridId===l.id?"#fffbeb":"#f8fafc",borderRadius:2,marginBottom:8,border:editingGridId===l.id?"2px solid #f59e0b":"1px solid #e2e8f0"}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{flex:1}}>
                <div style={{fontSize:14,fontWeight:700}}>{l.descrizione}</div>
                <div style={{fontSize:12,color:"#64748b",marginTop:2}}>
                  {l.categoria||"—"} · 
                  {l.tipo==="griglia" ? <span style={{color:"#8b5cf6",fontWeight:700}}> 📊 Griglia L×H</span> : 
                   l.tipo==="mq" ? "€/mq" : l.tipo==="ml" ? "€/ml" : "€/pz"}
                  {l.minimoFatt ? ` · Min. €${l.minimoFatt}` : ""}
                </div>
              </div>
              {l.tipo!=="griglia" && <div style={{fontWeight:800,color:"#059669",fontSize:15}}>€{(parseFloat(l.prezzo)||0).toFixed(2)}</div>}
              {l.tipo==="griglia" && <button onClick={()=>setEditingGridId(editingGridId===l.id?null:l.id)} style={{padding:"6px 12px",borderRadius:2,border:"1.5px solid #8b5cf6",background:editingGridId===l.id?"#8b5cf6":"transparent",color:editingGridId===l.id?"#fff":"#8b5cf6",fontSize:11,fontWeight:700,cursor:"pointer"}}>{editingGridId===l.id?"CHIUDI":"GRIGLIA"}</button>}
              <button onClick={()=>removeListinoItem(l.id)} style={{background:"none",border:"none",color:"#ef4444",fontSize:18,cursor:"pointer"}}>×</button>
            </div>
            
            {/* Grid Editor (expanded) */}
            {editingGridId===l.id && l.tipo==="griglia" && l.griglia && (()=>{
              const g = l.griglia;
              const widths: number[] = [];
              const heights: number[] = [];
              if(g.minL && g.maxL && g.stepL) for(let w=g.minL; w<=g.maxL; w+=g.stepL) widths.push(w);
              if(g.minH && g.maxH && g.stepH) for(let h=g.minH; h<=g.maxH; h+=g.stepH) heights.push(h);
              const cellCount = Object.keys(g.prezzi||{}).length;
              return <div style={{marginTop:12,borderTop:"1px solid #e2e8f0",paddingTop:12}}>
                {/* Minimo Fatturazione */}
                <div style={{display:"flex",gap:8,marginBottom:10}}>
                  <div style={{flex:1}}><label style={{fontSize:10,fontWeight:700,color:"#64748b"}}>MINIMO FATTURAZIONE €</label><input type="number" value={l.minimoFatt||""} onChange={e=>updateListinoItem(l.id,{minimoFatt:parseFloat(e.target.value)||0})} style={S.input} placeholder="0" /></div>
                </div>
                {/* Grid Config */}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:10}}>
                  <div><label style={{fontSize:10,fontWeight:700,color:"#64748b"}}>LARG. MIN</label><input type="number" value={g.minL||""} onChange={e=>{const v=parseInt(e.target.value)||0;updateListinoItem(l.id,{griglia:{...g,minL:v}});}} style={S.input} /></div>
                  <div><label style={{fontSize:10,fontWeight:700,color:"#64748b"}}>LARG. MAX</label><input type="number" value={g.maxL||""} onChange={e=>{const v=parseInt(e.target.value)||0;updateListinoItem(l.id,{griglia:{...g,maxL:v}});}} style={S.input} /></div>
                  <div><label style={{fontSize:10,fontWeight:700,color:"#64748b"}}>STEP L (mm)</label><input type="number" value={g.stepL||""} onChange={e=>{const v=parseInt(e.target.value)||0;updateListinoItem(l.id,{griglia:{...g,stepL:v}});}} style={S.input} /></div>
                  <div><label style={{fontSize:10,fontWeight:700,color:"#64748b"}}>ALT. MIN</label><input type="number" value={g.minH||""} onChange={e=>{const v=parseInt(e.target.value)||0;updateListinoItem(l.id,{griglia:{...g,minH:v}});}} style={S.input} /></div>
                  <div><label style={{fontSize:10,fontWeight:700,color:"#64748b"}}>ALT. MAX</label><input type="number" value={g.maxH||""} onChange={e=>{const v=parseInt(e.target.value)||0;updateListinoItem(l.id,{griglia:{...g,maxH:v}});}} style={S.input} /></div>
                  <div><label style={{fontSize:10,fontWeight:700,color:"#64748b"}}>STEP H (mm)</label><input type="number" value={g.stepH||""} onChange={e=>{const v=parseInt(e.target.value)||0;updateListinoItem(l.id,{griglia:{...g,stepH:v}});}} style={S.input} /></div>
                </div>
                
                {/* Mode tabs */}
                <div style={{display:"flex",gap:4,marginBottom:10}}>
                  {([["auto","⚡ Auto-genera"],["manual","✏️ Manuale"],["csv","📋 Importa CSV"]] as [string,string][]).map(([k,lab])=>
                    <button key={k} onClick={()=>setGridView(k as any)} style={{flex:1,padding:"8px 6px",borderRadius:2,border:"none",background:gridView===k?"#1a1a2e":"#e2e8f0",color:gridView===k?"#fff":"#374151",fontSize:11,fontWeight:700,cursor:"pointer"}}>{lab}</button>
                  )}
                </div>
                
                {/* Auto-generate */}
                {gridView==="auto" && <div style={{padding:12,background:"#f0fdf4",borderRadius:2,border:"1px solid #bbf7d0"}}>
                  <p style={{fontSize:12,color:"#166534",marginBottom:8,fontWeight:600}}>Imposta prezzo base e incremento per ogni scaglione:</p>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
                    <div><label style={{fontSize:10,fontWeight:700,color:"#166534"}}>PREZZO BASE €</label><input type="number" value={g.prezzoBase||""} onChange={e=>updateListinoItem(l.id,{griglia:{...g,prezzoBase:parseFloat(e.target.value)||0}})} style={S.input} placeholder="180" /></div>
                    <div><label style={{fontSize:10,fontWeight:700,color:"#166534"}}>+€ PER STEP L</label><input type="number" value={g.incL||""} onChange={e=>updateListinoItem(l.id,{griglia:{...g,incL:parseFloat(e.target.value)||0}})} style={S.input} placeholder="5" /></div>
                    <div><label style={{fontSize:10,fontWeight:700,color:"#166534"}}>+€ PER STEP H</label><input type="number" value={g.incH||""} onChange={e=>updateListinoItem(l.id,{griglia:{...g,incH:parseFloat(e.target.value)||0}})} style={S.input} placeholder="5" /></div>
                  </div>
                  <button onClick={()=>{const updated=autoGenerateGrid(l);updateListinoItem(l.id,{griglia:updated.griglia});}} style={{...S.saveBtn,background:"#059669",marginTop:10,width:"100%"}}>⚡ GENERA GRIGLIA ({widths.length}×{heights.length} = {widths.length*heights.length} prezzi)</button>
                </div>}
                
                {/* Manual grid edit */}
                {gridView==="manual" && <div style={{overflowX:"auto",maxHeight:400}}>
                  {widths.length>0 && heights.length>0 ? (
                    <table style={{borderCollapse:"collapse",fontSize:11,width:"100%"}}>
                      <thead><tr>
                        <th style={{padding:"6px 4px",background:"#1a1a2e",color:"#e07a2f",fontSize:10,fontWeight:700,position:"sticky",top:0,left:0,zIndex:2,fontFamily:"monospace"}}>L↓ H→</th>
                        {heights.map(h=><th key={h} style={{padding:"6px 4px",background:"#1a1a2e",color:"#fff",fontSize:10,fontWeight:700,position:"sticky",top:0,zIndex:1,fontFamily:"monospace",textAlign:"center"}}>{h}</th>)}
                      </tr></thead>
                      <tbody>{widths.map(w=><tr key={w}>
                        <td style={{padding:"4px 6px",background:"#f1f5f9",fontWeight:800,fontSize:11,position:"sticky",left:0,fontFamily:"monospace",borderRight:"2px solid #1a1a2e"}}>{w}</td>
                        {heights.map(h=>{
                          const key=`${w}x${h}`;
                          const val = g.prezzi?.[key];
                          return <td key={h} style={{padding:0,border:"1px solid #d1d5db"}}>
                            <input type="number" value={val??""} onChange={e=>{const p=parseFloat(e.target.value);const newP={...(g.prezzi||{})}; if(!isNaN(p))newP[key]=p; else delete newP[key]; updateListinoItem(l.id,{griglia:{...g,prezzi:newP}});}} style={{width:60,padding:"4px 3px",border:"none",background:val!==undefined?"#ecfdf5":"#fff",textAlign:"center",fontSize:11,fontWeight:600,outline:"none"}} placeholder="—" />
                          </td>;
                        })}
                      </tr>)}</tbody>
                    </table>
                  ) : <p style={{fontSize:12,color:"#94a3b8",textAlign:"center",padding:20}}>Configura prima min/max e step sopra</p>}
                </div>}
                
                {/* CSV Import */}
                {gridView==="csv" && <div style={{padding:12,background:"#eff6ff",borderRadius:2,border:"1px solid #bfdbfe"}}>
                  <p style={{fontSize:12,color:"#1e40af",marginBottom:4,fontWeight:600}}>Importa da file CSV o incolla da Excel:</p>
                  <p style={{fontSize:11,color:"#64748b",marginBottom:8}}>Prima riga = altezze, prima colonna = larghezze. Le dimensioni della griglia si configurano automaticamente.<br/>
                  <code style={{fontSize:10,background:"#dbeafe",padding:"2px 4px"}}>_;1000;1100;1200↵800;180;185;190↵900;185;190;195</code></p>
                  
                  {/* File Upload */}
                  <div style={{display:"flex",gap:8,marginBottom:8}}>
                    <label style={{flex:1,padding:"10px",borderRadius:2,border:"2px dashed #93c5fd",background:"#f0f9ff",textAlign:"center",cursor:"pointer",fontSize:12,fontWeight:700,color:"#2563eb"}}>
                      📁 CARICA FILE CSV
                      <input type="file" accept=".csv,.txt,.tsv" style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0];if(f)handleFileUpload(l.id,f);e.target.value="";}} />
                    </label>
                  </div>
                  
                  <textarea value={csvText} onChange={e=>setCsvText(e.target.value)} style={{width:"100%",height:120,padding:8,border:"1.5px solid #93c5fd",borderRadius:2,fontFamily:"monospace",fontSize:11,resize:"vertical",boxSizing:"border-box"}} placeholder={"_\t1000\t1100\t1200\n800\t180\t185\t190\n900\t185\t190\t195"} />
                  <button onClick={()=>{const result=importGridCSV(l.id,csvText);setCsvText("");if(result)alert(`✅ Importati ${result.total} prezzi (${result.w}×${result.h})`);}} disabled={!csvText.trim()} style={{...S.saveBtn,background:"#2563eb",marginTop:8,width:"100%",opacity:csvText.trim()?1:0.5}}>📋 IMPORTA DA TESTO</button>
                </div>}
                
                {/* Grid stats */}
                <div style={{marginTop:8,fontSize:11,color:"#64748b",display:"flex",gap:12}}>
                  <span>📊 {cellCount} prezzi inseriti</span>
                  {widths.length>0 && <span>↔ L: {g.minL}–{g.maxL}mm</span>}
                  {heights.length>0 && <span>↕ H: {g.minH}–{g.maxH}mm</span>}
                </div>
              </div>;
            })()}
          </div>)}
          
          {/* Add new product form */}
          {listinoForm ? (
            <div style={{padding:16,background:"#fffbeb",borderRadius:2,border:"2px solid #f59e0b",marginTop:12}}>
              <Field label="Descrizione" value={listinoForm.descrizione||""} onChange={(v: string)=>setListinoForm({...listinoForm,descrizione:v})} placeholder="Es. Finestra 2 ante PVC" />
              <div style={{marginBottom:8}}>
                <label style={S.fLabel}>Tipo Prezzo</label>
                <div style={{display:"flex",gap:4}}>
                  {([["pezzo","€/pezzo"],["mq","€/mq"],["ml","€/ml"],["griglia","📊 Griglia L×H"]] as [string,string][]).map(([k,lab])=>
                    <button key={k} onClick={()=>{
                      const upd: any = {tipo:k};
                      if(k==="griglia") upd.griglia = {minL:600,maxL:1800,stepL:100,minH:600,maxH:1600,stepH:100,prezzoBase:0,incL:0,incH:0,prezzi:{}};
                      else upd.griglia = undefined;
                      setListinoForm({...listinoForm,...upd});
                    }} style={{flex:1,padding:"10px 6px",borderRadius:2,border:"none",background:listinoForm.tipo===k?"#1a1a2e":"#e2e8f0",color:listinoForm.tipo===k?"#fff":"#374151",fontSize:11,fontWeight:700,cursor:"pointer"}}>{lab}</button>
                  )}
                </div>
              </div>
              {listinoForm.tipo!=="griglia" && <div style={{display:"flex",gap:8}}>
                <div style={{flex:1}}><label style={S.fLabel}>Prezzo (€)</label><input type="number" value={listinoForm.prezzo||""} onChange={e=>setListinoForm({...listinoForm,prezzo:parseFloat(e.target.value)||0})} style={S.input} placeholder="0.00" /></div>
                <div style={{flex:1}}><label style={S.fLabel}>Minimo Fatt. (€)</label><input type="number" value={listinoForm.minimoFatt||""} onChange={e=>setListinoForm({...listinoForm,minimoFatt:parseFloat(e.target.value)||0})} style={S.input} placeholder="Opzionale" /></div>
              </div>}
              {listinoForm.tipo==="griglia" && <div style={{display:"flex",gap:8}}>
                <div style={{flex:1}}><label style={S.fLabel}>Minimo Fatt. (€)</label><input type="number" value={listinoForm.minimoFatt||""} onChange={e=>setListinoForm({...listinoForm,minimoFatt:parseFloat(e.target.value)||0})} style={S.input} placeholder="Opzionale" /></div>
              </div>}
              <div style={{flex:1}}><label style={S.fLabel}>Categoria</label><select value={listinoForm.categoria||""} onChange={e=>setListinoForm({...listinoForm,categoria:e.target.value})} style={S.input}><option value="">—</option>{categorie.map((c: any)=><option key={c.id} value={c.nome}>{c.nome}</option>)}</select></div>
              {listinoForm.tipo==="griglia" && <div style={{padding:10,background:"#f5f3ff",borderRadius:2,border:"1px solid #c4b5fd",marginTop:8}}>
                <p style={{fontSize:11,color:"#6d28d9",fontWeight:700,marginBottom:6}}>Dopo aver aggiunto, clicca GRIGLIA per configurare dimensioni e prezzi.</p>
              </div>}
              <div style={{display:"flex",gap:8,marginTop:10}}>
                <button onClick={()=>setListinoForm(null)} style={{...S.saveBtn,flex:1,background:"#e2e8f0",color:"#374151",boxShadow:"none"}}>Annulla</button>
                <button onClick={addListinoItem} disabled={!listinoForm.descrizione?.trim()} style={{...S.saveBtn,flex:2,background:"#d4820e",opacity:listinoForm.descrizione?.trim()?1:0.5}}>Aggiungi</button>
              </div>
            </div>
          ) : <button onClick={()=>setListinoForm({descrizione:"",prezzo:0,tipo:"pezzo",categoria:"",minimoFatt:0})} style={{...S.saveBtn,background:"#d4820e",marginTop:12}}>+ Aggiungi Articolo al Listino</button>}
        </>)}
        {tab==="checklists" && (<>
          <p style={{fontSize:13,color:"#64748b",marginBottom:12}}>Personalizza le checklist per ogni fase. Aggiungi, rimuovi o riordina i task.</p>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14}}>
            {[{k:"sopralluogo",l:" Sopralluogo"},{k:"misure",l:" Misure"},{k:"preventivo",l:" Preventivo"},{k:"posa",l:" Posa"},{k:"riparazione",l:" Riparazione"},{k:"followup",l:" Follow-up"}].map(ph=>
              <button key={ph.k} onClick={()=>setSelPhase(ph.k)} style={{padding:"10px 14px",borderRadius:2,border:"none",background:selPhase===ph.k?"#059669":"#f3f4f6",color:selPhase===ph.k?"#fff":"#374151",fontWeight:700,fontSize:13,cursor:"pointer"}}>{ph.l} ({(checklists[ph.k]||[]).length})</button>
            )}
          </div>
          {selPhase && <>
            <div style={{marginBottom:12}}>
              {(checklists[selPhase]||[]).map((task: string, idx: number) => (
                <div key={idx} style={{display:"flex",alignItems:"center",gap:8,padding:"10px 14px",background:"#f8fafc",borderRadius:2,marginBottom:6,border:"1px solid #e2e8f0"}}>
                  <span style={{fontSize:14,color:"#94a3b8",fontWeight:700,width:24,textAlign:"center"}}>{idx+1}</span>
                  <span style={{flex:1,fontSize:14,fontWeight:600,color:"#1f2937"}}>{task}</span>
                  <button onClick={()=>{
                    if(idx>0){const n=[...(checklists[selPhase]||[])];[n[idx-1],n[idx]]=[n[idx],n[idx-1]];setChecklists({...checklists,[selPhase]:n});}
                  }} disabled={idx===0} style={{background:"none",border:"none",color:idx>0?"#3a7bd5":"#d1d5db",fontSize:16,cursor:idx>0?"pointer":"default",padding:"2px 6px"}}>↑</button>
                  <button onClick={()=>{
                    const arr=checklists[selPhase]||[];if(idx<arr.length-1){const n=[...arr];[n[idx],n[idx+1]]=[n[idx+1],n[idx]];setChecklists({...checklists,[selPhase]:n});}
                  }} disabled={idx>=(checklists[selPhase]||[]).length-1} style={{background:"none",border:"none",color:idx<(checklists[selPhase]||[]).length-1?"#3a7bd5":"#d1d5db",fontSize:16,cursor:idx<(checklists[selPhase]||[]).length-1?"pointer":"default",padding:"2px 6px"}}>↓</button>
                  <button onClick={()=>{setChecklists({...checklists,[selPhase]:(checklists[selPhase]||[]).filter((_: any,i: number)=>i!==idx)});}} style={{background:"none",border:"none",color:"#ef4444",fontSize:18,cursor:"pointer",padding:"2px 6px"}}>×</button>
                </div>
              ))}
              {(checklists[selPhase]||[]).length===0 && <div style={{textAlign:"center",padding:20,color:"#94a3b8",fontSize:13}}>Nessun task. Aggiungi il primo!</div>}
            </div>
            <div style={{display:"flex",gap:8}}><input value={customInput} onChange={e=>setCustomInput(e.target.value)} placeholder="Nuovo task..." style={{...S.input,flex:1}} onKeyDown={e=>{if(e.key==="Enter"&&customInput.trim()){setChecklists({...checklists,[selPhase]:[...(checklists[selPhase]||[]),customInput.trim()]});setCustomInput("");}}} /><button onClick={()=>{if(customInput.trim()){setChecklists({...checklists,[selPhase]:[...(checklists[selPhase]||[]),customInput.trim()]});setCustomInput("");}}} style={{...S.pill,background:"#059669",color:"#fff",padding:"10px 18px",fontWeight:700}}>+</button></div>
            <button onClick={()=>{if(confirm("Ripristinare i task predefiniti per questa fase?"))setChecklists({...checklists,[selPhase]:[...(DEFAULT_TASKS[selPhase]||[])]});}} style={{marginTop:10,padding:"8px 14px",borderRadius:2,border:"1.5px solid #d1d5db",background:"#fff",color:"#64748b",fontSize:12,fontWeight:600,cursor:"pointer",width:"100%"}}>🔄 Ripristina Predefiniti</button>
          </>}
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
        <button onClick={()=>onSave({sistemi,categorie,colori,tipologie,vetri,listino,checklists,azienda,setupCompleted:true})} style={{...S.saveBtn,background:"#e07a2f",width:"100%"}}> Salva Impostazioni</button>
      </div>
    </div>
  );
}

// ==================== AUTO-FLOW HELPERS ====================
// Flash animation for next task/field highlight
const AUTOFLOW_CSS = `
@keyframes ff-flash { 0%{background:#fef3c7;transform:scale(1.02)} 50%{background:#fde68a;transform:scale(1.02)} 100%{background:#fff;transform:scale(1)} }
.ff-flash { animation: ff-flash 0.8s ease-out !important; }
@keyframes ff-pulse { 0%{box-shadow:0 0 0 0 rgba(224,122,47,0.5)} 70%{box-shadow:0 0 0 8px rgba(224,122,47,0)} 100%{box-shadow:0 0 0 0 rgba(224,122,47,0)} }
.ff-pulse { animation: ff-pulse 0.6s ease-out !important; }
`;

function scrollToNextUndone(currentEl: HTMLElement) {
  if (typeof document === "undefined") return;
  // Find all task rows in the same container
  const container = currentEl.closest("[data-tasks]");
  if (!container) return;
  const allRows = Array.from(container.querySelectorAll("[data-task-done='false']")) as HTMLElement[];
  if (allRows.length === 0) return;
  // Get the first undone task that comes after current
  const currentIdx = Array.from(container.querySelectorAll("[data-task-id]")).indexOf(currentEl);
  const nextUndone = allRows.find(el => {
    const idx = Array.from(container.querySelectorAll("[data-task-id]")).indexOf(el);
    return idx > currentIdx;
  }) || allRows[0]; // wrap to first undone if none after
  
  if (nextUndone) {
    setTimeout(() => {
      nextUndone.scrollIntoView({ behavior: "smooth", block: "center" });
      nextUndone.classList.add("ff-flash");
      setTimeout(() => nextUndone.classList.remove("ff-flash"), 900);
    }, 150);
  }
}

function autoAdvanceField(currentEl: HTMLElement) {
  if (typeof document === "undefined") return;
  const container = currentEl.closest("[data-vano]");
  if (!container) return;
  const fields = Array.from(container.querySelectorAll("input:not([type=hidden]):not([type=file]):not([type=checkbox]), select, textarea")) as HTMLElement[];
  const idx = fields.indexOf(currentEl);
  if (idx >= 0 && idx < fields.length - 1) {
    setTimeout(() => {
      fields[idx + 1].focus();
      fields[idx + 1].scrollIntoView({ behavior: "smooth", block: "center" });
      fields[idx + 1].classList.add("ff-pulse");
      setTimeout(() => fields[idx + 1].classList.remove("ff-pulse"), 700);
    }, 80);
  }
}

function BottomNav({ items, active, onNav }: any) {
  return (
    <div style={S.bottomNav}>
      {items.map((it: any) => {
        const isActive = active===it.key;
        const color = isActive ? (THEMES[typeof window!=="undefined"?localStorage.getItem("ff-theme")||"classic":"classic"]||THEMES.classic).primary : "#7a8194";
        return (
        <button key={it.key} onClick={()=>onNav(it.key)} style={{...S.navItem,color}}>
          <span style={{fontSize:18,lineHeight:"22px"}}>{it.icon}</span>
          <span style={{fontSize:8,fontWeight:isActive?700:500,letterSpacing:"0.3px",textTransform:"uppercase",fontFamily:"'DM Sans',system-ui,sans-serif",whiteSpace:"nowrap"}}>{it.label}</span>
        </button>
        );
      })}
    </div>
  );
}

// ==================== NEW PRATICA ====================
function NewPraticaView({ client, pratiche, clients, onCreate, onBack }: any) {
  const [ind, setInd] = useState(client?.indirizzo||"");
  const [tipo, setTipo] = useState("nuovo_infisso");
  const [data, setData] = useState(today());
  const [ora, setOra] = useState("09:00");
  const [note, setNote] = useState("");
  const [praticaCollegata, setPraticaCollegata] = useState("");
  // Pratiche dello stesso cliente (per collegamento riparazione)
  const clientPratiche = (pratiche||[]).filter((p: any) => p.clientId === client?.id && p.tipo !== "riparazione");
  return (
    <div style={S.container}>
      <div style={S.secHdr}><button onClick={onBack} style={S.backBtn}>← Indietro</button><h2 style={S.secTitle}>Nuova Pratica</h2></div>
      <div style={{padding:20}}>
        <div style={S.clientBox}><div style={S.clientAvatar}>{client?.nome?.charAt(0)?.toUpperCase()}</div><div><div style={{fontSize:16,fontWeight:700,color:"#0f172a"}}>{client?.nome}</div>{client?.telefono && <div style={{fontSize:13,color:"#64748b"}}>{client.telefono}</div>}</div></div>
        <div style={{marginBottom:16}}>
          <label style={S.fLabel}>Tipo Pratica</label>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <button onClick={()=>{setTipo("nuovo_infisso");setPraticaCollegata("");}} style={{flex:"1 1 140px",padding:"14px 10px",borderRadius:2,border:tipo==="nuovo_infisso"?"3px solid #e07a2f":"2px solid #e2e8f0",background:tipo==="nuovo_infisso"?"#fff7ed":"#fff",cursor:"pointer",textAlign:"center",minWidth:0}}>
              <div style={{fontSize:24}}></div>
              <div style={{fontSize:13,fontWeight:800,color:tipo==="nuovo_infisso"?"#e07a2f":"#374151",marginTop:4}}>Nuovo Infisso</div>
              <div style={{fontSize:10,color:"#64748b",marginTop:2}}>Sopralluogo → Posa</div>
            </button>
            <button onClick={()=>setTipo("riparazione")} style={{flex:"1 1 140px",padding:"14px 10px",borderRadius:2,border:tipo==="riparazione"?"3px solid #dc2626":"2px solid #e2e8f0",background:tipo==="riparazione"?"#fef2f2":"#fff",cursor:"pointer",textAlign:"center",minWidth:0}}>
              <div style={{fontSize:24}}></div>
              <div style={{fontSize:13,fontWeight:800,color:tipo==="riparazione"?"#dc2626":"#374151",marginTop:4}}>Riparazione</div>
              <div style={{fontSize:10,color:"#64748b",marginTop:2}}>Sopralluogo → Riparazione</div>
            </button>
          </div>
        </div>

        {/* Collega a pratica esistente (solo per riparazioni) */}
        {tipo === "riparazione" && clientPratiche.length > 0 && (
          <div style={{marginBottom:16,padding:14,background:"#fef2f2",borderRadius:2,border:"1.5px solid #fecaca"}}>
            <label style={{fontSize:11,fontWeight:800,color:"#dc2626",textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:6,display:"block"}}>🔗 Collega a pratica originale</label>
            <p style={{fontSize:11,color:"#64748b",marginBottom:8}}>Se questa riparazione riguarda infissi già montati, seleziona la pratica originale.</p>
            <select value={praticaCollegata} onChange={e=>setPraticaCollegata(e.target.value)} style={{...S.input,borderColor:"#fca5a5"}}>
              <option value="">— Nessun collegamento —</option>
              {clientPratiche.map((p: any) => {
                const cl = (clients||[]).find((c: any) => c.id === p.clientId);
                return <option key={p.id} value={p.id}>{p.numero} — {p.indirizzo||cl?.nome||"—"} ({p.fase})</option>;
              })}
            </select>
          </div>
        )}

        <Field label="Indirizzo Cantiere" value={ind} onChange={setInd} placeholder="Via, numero, città" />
        <div style={{display:"flex",gap:12}}><Field label="Data" value={data} onChange={setData} type="date" style={{flex:1}} /><Field label="Ora" value={ora} onChange={setOra} type="time" style={{flex:1}} /></div>
        <Field label="Note" value={note} onChange={setNote} placeholder="Note pratica..." textarea />
        <div style={S.infoNote}>ℹ️ La pratica inizierà dalla fase Sopralluogo.</div>
        <button onClick={()=>onCreate(ind,tipo,data,ora,note,praticaCollegata||undefined)} style={{...S.saveBtn,background:tipo==="riparazione"?"#c44040":"#e07a2f"}}>Crea Pratica →</button>
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
    <div style={{background:"#fff",borderRadius:2,padding:16,boxShadow:"0 4px 20px rgba(0,0,0,0.1)"}}>
      <h3 style={{fontSize:16,fontWeight:900,color:"#1e293b",margin:"0 0 12px"}}> Firma del Cliente</h3>
      <p style={{fontSize:13,color:"#64748b",margin:"0 0 12px"}}>Chiedi al cliente di firmare qui sotto con il dito o lo stilo</p>
      <canvas ref={canvasRef} width={460} height={180}
        onMouseDown={startDraw} onMouseMove={draw} onMouseUp={stopDraw} onMouseLeave={stopDraw}
        onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={stopDraw}
        style={{width:"100%",height:180,border:"2.5px dashed #cbd5e1",borderRadius:2,background:"#fafafa",touchAction:"none",cursor:"crosshair"}}
      />
      <div style={{display:"flex",gap:8,marginTop:12}}>
        <button onClick={clear} style={{flex:1,padding:"10px",borderRadius:2,border:"2px solid #94a3b8",background:"#fff",color:"#64748b",fontSize:13,fontWeight:800,cursor:"pointer"}}> Cancella</button>
        <button onClick={onCancel} style={{flex:1,padding:"10px",borderRadius:2,border:"2px solid #ef4444",background:"#fff",color:"#ef4444",fontSize:13,fontWeight:800,cursor:"pointer"}}>✕ Annulla</button>
        <button onClick={save} disabled={!hasDrawn} style={{flex:2,padding:"10px",borderRadius:2,border:"none",background:hasDrawn?"#2d8a4e":"#e2e8f0",color:hasDrawn?"#fff":"#94a3b8",fontSize:13,fontWeight:800,cursor:hasDrawn?"pointer":"default"}}> Conferma Firma</button>
      </div>
    </div>
  );
}

// ==================== PRATICA DETAIL ====================
function PraticaDetail({ pratica: p, client: c, userId, teamMembers, isAdmin, permissions, allPratiche, allClients, onBack, onDelete, onDuplica, onAddAction, onToggleTask, onAddTask, onRemoveTask, onOpenMisure, onOpenRip, onOpenPrev, onOpenEmail, onStatusChange, onConfirmOrder, onGenerateFattura, onUpdateFattura, onAdvancePhase, onUpdatePratica, onAssign, onStampaCantiere, onOpenPratica }: any) {
  const [newTaskText, setNewTaskText] = useState("");
  const [msgText, setMsgText] = useState("");
  const [msgDest, setMsgDest] = useState("");
  const perms: string[] = permissions || [];
  const canDo = (p: string) => isAdmin || perms.includes(p);
  function sendMsg() {
    if (!msgText.trim()) return;
    const myName = teamMembers?.find((m: any)=>m.userId===userId)?.nome || "Admin";
    const destName = msgDest ? teamMembers?.find((m: any)=>m.id===msgDest)?.nome : "";
    const msg = { id: Date.now().toString(), userId, autore: myName, destinatarioId: msgDest||null, destinatario: destName||"Tutti", testo: msgText.trim(), data: new Date().toISOString() };
    onUpdatePratica({ messaggi: [...(p.messaggi||[]), msg] });
    setMsgText("");
  }
  const sc = STATUS[p.status] || {bg:"#f0f0f0",color:"#333",label:"—"};
  const totalT = (p.actions||[]).reduce((s: number,a: any)=>s+(a.tasks||[]).length,0);
  const doneT = (p.actions||[]).reduce((s: number,a: any)=>s+(a.tasks||[]).filter((t: any)=>t.done).length,0);
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
      <div style={S.detailHdr}><button onClick={onBack} style={S.backBtn}>←</button><div style={{display:"flex",gap:4,flexWrap:"wrap",justifyContent:"flex-end"}}>{canDo("email") && <button onClick={onOpenEmail} style={S.emailBtn}>EMAIL</button>}{isAdmin && <button onClick={onDuplica} style={{...S.emailBtn,background:"#3a7bd5",color:"#fff"}}>DUPLICA</button>}{<button onClick={onStampaCantiere} style={{...S.emailBtn,background:"#1a1a2e",color:"#fff"}}>CANTIERE</button>}{isAdmin && <button onClick={onDelete} style={S.delBtn}>ELIM</button>}</div></div>
      <div style={{padding:20}}>
        <div style={S.praticaHdrCard}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}><span style={S.praticaNumBig}>{p.numero}</span><span style={{...S.statusBdg,background:sc.bg,color:sc.color,border:`1.5px solid ${sc.color}`}}>{sc.label}</span></div>
          <h2 style={S.detailName}>{c?.nome||"—"}</h2>
          <div style={S.detailInfo}>
            <InfoRow icon="" val={<>{dateLabel(p.data)} alle {p.ora}{p.data===today()&&<span style={S.todayChip}>OGGI</span>}</>} />
            {p.indirizzo && <InfoRow icon="" val={p.indirizzo} />}
            {c?.telefono && <InfoRow icon="" val={<a href={`tel:${c.telefono}`} style={{color:"#e07a2f",textDecoration:"none",fontWeight:600}}>{c.telefono}</a>} />}
            {c?.email && <InfoRow icon="" val={c.email} />}
            {p.note && <InfoRow icon="" val={p.note} />}
          </div>
        </div>

        {/* PRATICA COLLEGATA — con storia completa */}
        {p.praticaCollegata && (()=>{
          const linked = (allPratiche||[]).find((pr: any) => pr.id === p.praticaCollegata);
          if (!linked) return null;
          const linkedClient = (allClients||[]).find((cl: any) => cl.id === linked.clientId);
          const mis = linked.misure;
          const prev = linked.preventivo;
          const vani = mis?.vani || [];
          const posaAction = (linked.actions||[]).find((a: any) => a.type === "posa");
          const posaDone = posaAction?.tasks?.every((t: any) => t.done);
          return <div style={{background:"#fef2f2",borderRadius:2,border:"2px solid #fecaca",marginBottom:14,overflow:"hidden"}}>
            {/* Header cliccabile */}
            <div onClick={()=>onOpenPratica?.(linked.id)} style={{padding:12,display:"flex",alignItems:"center",gap:10,cursor:"pointer",borderBottom:"1px solid #fecaca"}}>
              <span style={{fontSize:18}}>🔗</span>
              <div style={{flex:1}}>
                <div style={{fontSize:11,fontWeight:800,color:"#dc2626",textTransform:"uppercase"}}>Pratica originale</div>
                <div style={{fontSize:14,fontWeight:700,color:"#0f172a"}}>{linked.numero} — {linkedClient?.nome||"—"}</div>
                <div style={{fontSize:11,color:"#64748b"}}>{linked.indirizzo||""} · Creata: {fmtDate(linked.data||"")} · Stato: {linked.status}</div>
              </div>
              <span style={{color:"#dc2626",fontWeight:700}}>→</span>
            </div>
            {/* Storia / Riepilogo infissi montati */}
            <div style={{padding:12}}>
              <div style={{fontSize:11,fontWeight:800,color:"#991b1b",textTransform:"uppercase",marginBottom:8}}>📋 Riepilogo lavori eseguiti</div>
              
              {/* Vani / Infissi montati */}
              {vani.length > 0 ? <div style={{marginBottom:10}}>
                <div style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:4}}>Infissi montati ({vani.length}):</div>
                {vani.map((v: any, i: number) => (
                  <div key={i} style={{padding:"6px 10px",background:"#fff",borderRadius:2,border:"1px solid #fecaca",marginBottom:3,fontSize:12}}>
                    <span style={{fontWeight:700,color:"#0f172a"}}>{v.sistema || "Infisso"}</span>
                    <span style={{color:"#64748b"}}> — {v.l||0}×{v.h||0}mm</span>
                    {v.ambiente && <span style={{color:"#94a3b8"}}> · {v.ambiente}</span>}
                    {v.apertura && <span style={{color:"#94a3b8"}}> · {v.apertura}</span>}
                    {v.colore && <span style={{color:"#94a3b8"}}> · {v.colore}</span>}
                    {v.vetro && <span style={{color:"#94a3b8"}}> · {v.vetro}</span>}
                  </div>
                ))}
              </div> : <div style={{fontSize:12,color:"#94a3b8",marginBottom:8}}>Nessuna misura registrata</div>}

              {/* Preventivo */}
              {prev?.prodotti?.length > 0 && <div style={{marginBottom:10}}>
                <div style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:4}}>Preventivo:</div>
                {prev.prodotti.slice(0,5).map((pr: any, i: number) => (
                  <div key={i} style={{fontSize:12,color:"#374151",padding:"3px 0"}}>
                    • {pr.descrizione||"Prodotto"} {pr.larghezza&&pr.altezza ? `(${pr.larghezza}×${pr.altezza})` : ""} — <span style={{fontWeight:700,color:"#059669"}}>€{parseFloat(pr.totale||0).toFixed(2)}</span> ×{pr.quantita||1}
                  </div>
                ))}
                <div style={{fontSize:13,fontWeight:800,color:"#059669",marginTop:4}}>Totale preventivo: €{(prev.prodotti.reduce((s: number, pr: any) => s + (parseFloat(pr.totale)||0), 0)).toFixed(2)}</div>
              </div>}

              {/* Posa */}
              {posaAction && <div style={{marginBottom:6}}>
                <div style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:2}}>Posa:</div>
                <div style={{fontSize:12,color:posaDone?"#059669":"#d97706",fontWeight:600}}>{posaDone ? "✅ Completata" : "⏳ In corso"}</div>
              </div>}

              {/* Log / Timeline sintetica */}
              {(linked.log||[]).length > 0 && <div>
                <div style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:4,marginTop:6}}>Cronologia:</div>
                {(linked.log||[]).slice(-5).map((l: any, i: number) => (
                  <div key={i} style={{fontSize:11,color:"#94a3b8",padding:"2px 0"}}>
                    {new Date(l.ts).toLocaleDateString("it-IT",{day:"2-digit",month:"short"})} — {l.msg}
                  </div>
                ))}
              </div>}
            </div>
          </div>;
        })()}

        {/* Riparazioni collegate (per pratiche originali) */}
        {(()=>{
          const linked = (allPratiche||[]).filter((pr: any) => pr.praticaCollegata === p.id);
          if (linked.length === 0) return null;
          return <div style={{padding:12,background:"#fff7ed",borderRadius:2,border:"2px solid #fed7aa",marginBottom:14}}>
            <div style={{fontSize:11,fontWeight:800,color:"#ea580c",textTransform:"uppercase",marginBottom:6}}>🔧 Riparazioni collegate ({linked.length})</div>
            {linked.map((rp: any) => {
              const rpClient = (allClients||[]).find((cl: any) => cl.id === rp.clientId);
              return <div key={rp.id} onClick={()=>onOpenPratica?.(rp.id)} style={{padding:8,background:"#fff",borderRadius:2,border:"1px solid #fed7aa",marginBottom:4,cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontSize:13,fontWeight:700,color:"#0f172a"}}>{rp.numero}</div>
                  <div style={{fontSize:11,color:"#64748b"}}>{fmtDate(rp.data)} · {rp.fase} · {rp.status}</div>
                </div>
                <span style={{color:"#ea580c"}}>→</span>
              </div>;
            })}
          </div>;
        })()}

        {/* ===== WORKFLOW STEPPER ===== */}
        {(() => {
          const wf = getWorkflow(p.tipo);
          const curIdx = getPhaseIndex(p.tipo, p.fase || "sopralluogo");
          const canAdv = canAdvance(p);
          const isComplete = p.fase === "chiusura" && p.status === "completato";
          return (
            <div style={{background:"#1a1a2e",borderRadius:2,padding:18,marginBottom:18,color:"#fff"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                <h3 style={{fontSize:16,fontWeight:900,margin:0,letterSpacing:"-0.3px"}}>{p.tipo==="riparazione"?" Riparazione":" Nuovo Infisso"}</h3>
                {isComplete && <span style={{background:"#059669",padding:"4px 12px",borderRadius:2,fontSize:12,fontWeight:800}}> COMPLETATO</span>}
              </div>
              <div style={{display:"flex",gap:2,marginBottom:16}}>
                {wf.map((phase: any,i: number) => {
                  const isDone = i < curIdx || (i === curIdx && canAdv);
                  const isCurrent = i === curIdx;
                  return (
                    <div key={phase.key} style={{flex:1,textAlign:"center"}}>
                      <div style={{width:38,height:38,borderRadius:"50%",background:isDone?"#059669":isCurrent?phase.color:"rgba(255,255,255,0.1)",margin:"0 auto 4px",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,border:isCurrent?"3px solid "+phase.color:"3px solid transparent",transition:"all 0.3s",boxShadow:isCurrent?"0 0 12px "+phase.color+"40":"none"}}>{isDone?"":phase.icon}</div>
                      <div style={{fontSize:9,fontWeight:800,color:isCurrent?"#fff":isDone?"#4ade80":"rgba(255,255,255,0.4)",textTransform:"uppercase",letterSpacing:"0.3px"}}>{phase.label}</div>
                    </div>
                  );
                })}
              </div>
              {isComplete && <div style={{padding:"14px",background:"rgba(5,150,105,0.2)",borderRadius:2,textAlign:"center",marginBottom:14}}><div style={{fontSize:16,fontWeight:900,color:"#4ade80",fontFamily:"'JetBrains Mono',monospace"}}>PRATICA CHIUSA</div></div>}
              <div style={{background:"rgba(255,255,255,0.08)",borderRadius:2,padding:14}}>
                  <div style={{fontSize:15,fontWeight:800,marginBottom:8}}>{wf[curIdx]?.icon} Fase: {wf[curIdx]?.label}</div>
                  {p.fase==="sopralluogo" && (() => { const act=p.actions?.find((a: any)=>a.type==="sopralluogo"); if(!act) return null; const dn=act.tasks.filter((t: any)=>t.done).length; return (<><ProgressBar progress={act.tasks.length?Math.round(dn/act.tasks.length*100):0} done={dn} total={act.tasks.length} small /><div data-tasks="sopralluogo">{act.tasks.map((t: any)=><TaskRow key={t.id} task={t} onToggle={()=>onToggleTask(act.id,t.id)} onDelete={()=>{if(confirm("Rimuovere '"+t.text+"'?"))onRemoveTask(act.id,t.id);}} small />)}</div><div style={{display:"flex",gap:6,marginTop:8}}><input value={newTaskText} onChange={(e: any)=>setNewTaskText(e.target.value)} onKeyDown={(e: any)=>{if(e.key==="Enter"&&newTaskText.trim()){onAddTask(act.id,newTaskText);setNewTaskText("");}}} placeholder="+ Aggiungi task..." style={{flex:1,padding:"8px 12px",borderRadius:2,border:"1.5px solid rgba(255,255,255,0.2)",background:"rgba(255,255,255,0.1)",color:"#fff",fontSize:13,outline:"none"}} /><button onClick={()=>{if(newTaskText.trim()){onAddTask(act.id,newTaskText);setNewTaskText("");}}} style={{padding:"8px 14px",borderRadius:2,border:"none",background:"#059669",color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer"}}>+</button></div>{userId && <div style={{marginTop:12}}><PhotoGallery photos={p.fotoSopralluogo||[]} label=" Foto Sopralluogo" userId={userId} folder={`sopralluogo/${p.id}`} onUpdate={(photos: string[])=>onUpdatePratica({fotoSopralluogo:photos})} /></div>}</>); })()}
                  {p.fase==="misure" && (<div>{p.misure?(<div style={{background:"rgba(5,150,105,0.2)",borderRadius:2,padding:12,marginBottom:8}}><div style={{fontSize:13,fontWeight:700,color:"#4ade80"}}> Misure compilate</div><div style={{fontSize:12,color:"rgba(255,255,255,0.7)",marginTop:4}}>Vani: {p.misure.vani?.length||0}</div></div>):<p style={{fontSize:13,color:"rgba(255,255,255,0.7)",margin:"0 0 8px"}}>Compila la scheda misure.</p>}<button onClick={onOpenMisure} style={{width:"100%",padding:"12px",borderRadius:2,border:"none",background:"#d4820e",color:"#fff",fontSize:14,fontWeight:800,cursor:"pointer"}}> {p.misure?"Modifica":"Compila"} Misure</button></div>)}
                  {p.fase==="preventivo" && (<div>{p.preventivo?(<div style={{background:"rgba(5,150,105,0.2)",borderRadius:2,padding:12,marginBottom:8}}><div style={{fontSize:13,fontWeight:700,color:"#4ade80"}}> Preventivo compilato</div><div style={{fontSize:12,color:"rgba(255,255,255,0.7)",marginTop:4}}>Totale: € {(p.preventivo.totaleFinale||0).toFixed(2)}</div></div>):<p style={{fontSize:13,color:"rgba(255,255,255,0.7)",margin:"0 0 8px"}}>Prepara il preventivo.</p>}<button onClick={onOpenPrev} style={{width:"100%",padding:"12px",borderRadius:2,border:"none",background:"#6b4c8a",color:"#fff",fontSize:14,fontWeight:800,cursor:"pointer"}}> {p.preventivo?"Modifica":"Compila"} Preventivo</button></div>)}
                  {p.fase==="conferma" && (<div>{p.confermaOrdine?.firmata?(<div style={{background:"rgba(5,150,105,0.2)",borderRadius:2,padding:12}}><div style={{fontSize:13,fontWeight:700,color:"#4ade80"}}> Ordine confermato</div>{p.confermaOrdine.firmaImg&&<img src={p.confermaOrdine.firmaImg} alt="Firma" style={{height:40,borderRadius:6,background:"#fff",padding:3,marginTop:6}} />}</div>):(<><p style={{fontSize:13,color:"rgba(255,255,255,0.7)",margin:"0 0 8px"}}>Raccogli la firma del cliente.</p><div style={{marginBottom:10}}><input value={orderNote} onChange={(e: any)=>setOrderNote(e.target.value)} placeholder="Note ordine..." style={{width:"100%",padding:"10px 14px",borderRadius:2,border:"1.5px solid rgba(255,255,255,0.2)",background:"rgba(255,255,255,0.1)",color:"#fff",fontSize:14,outline:"none",boxSizing:"border-box"}} /></div>{!showSignPad?<button onClick={()=>setShowSignPad(true)} style={{width:"100%",padding:"14px",borderRadius:2,border:"none",background:"#2d8a4e",color:"#fff",fontSize:15,fontWeight:800,cursor:"pointer"}}> Firma Conferma</button>:<SignaturePad onSave={(img: string)=>{onConfirmOrder(img,orderNote);setShowSignPad(false);}} onCancel={()=>setShowSignPad(false)} />}</>)}</div>)}
                  {p.fase==="riparazione" && (<div>{p.riparazione?(<div style={{background:"rgba(5,150,105,0.2)",borderRadius:2,padding:12,marginBottom:8}}><div style={{fontSize:13,fontWeight:700,color:"#4ade80"}}> Riparazione compilata</div><div style={{fontSize:12,color:"rgba(255,255,255,0.7)",marginTop:4}}>{p.riparazione.problema||"—"}</div></div>):<p style={{fontSize:13,color:"rgba(255,255,255,0.7)",margin:"0 0 8px"}}>Compila la scheda riparazione.</p>}<button onClick={onOpenRip} style={{width:"100%",padding:"12px",borderRadius:2,border:"none",background:"#c44040",color:"#fff",fontSize:14,fontWeight:800,cursor:"pointer"}}> {p.riparazione?"Modifica":"Compila"} Riparazione</button></div>)}
                  {p.fase==="fattura" && (<div>{p.fattura?(<div style={{background:"rgba(5,150,105,0.2)",borderRadius:2,padding:12}}><div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:13,fontWeight:700,color:"#4ade80"}}> Fattura {p.fattura.numero}</span><span style={{fontSize:11,padding:"2px 8px",borderRadius:2,background:p.fattura.statoPagamento==="pagato"?"#059669":p.fattura.statoPagamento==="acconto"?"#d97706":"#ef4444",fontWeight:700}}>{p.fattura.statoPagamento==="pagato"?"Pagata":p.fattura.statoPagamento==="acconto"?"Acconto":"Non Pagata"}</span></div><div style={{fontSize:20,fontWeight:900,color:"#4ade80",marginTop:6}}>€ {(p.preventivo?.totaleFinale||p.riparazione?.costoStimato||0).toFixed?.(2)||"0.00"}</div><div style={{display:"flex",gap:8,marginTop:10}}><button onClick={()=>exportFattura(p,c)} style={{flex:1,padding:"10px",borderRadius:2,border:"1.5px solid rgba(255,255,255,0.3)",background:"transparent",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer"}}> PDF</button><button onClick={()=>{setPayForm({stato:p.fattura.statoPagamento,acconto:p.fattura.acconto||0,metodo:p.fattura.metodoPagamento||""});setShowPaymentEdit(true);}} style={{flex:1,padding:"10px",borderRadius:2,border:"none",background:"#e07a2f",color:"#1e293b",fontSize:12,fontWeight:800,cursor:"pointer"}}> Pagamento</button></div>{showPaymentEdit&&(<div style={{background:"rgba(255,255,255,0.1)",borderRadius:2,padding:14,marginTop:10}}><div style={{display:"flex",gap:6,marginBottom:12}}>{[{k:"non_pagato",l:" Non Pagata",c:"#ef4444"},{k:"acconto",l:"⏳ Acconto",c:"#d97706"},{k:"pagato",l:" Pagata",c:"#059669"}].map(s=><button key={s.k} onClick={()=>setPayForm({...payForm,stato:s.k})} style={{flex:1,padding:"10px 4px",borderRadius:2,border:"none",fontSize:11,fontWeight:800,cursor:"pointer",background:payForm.stato===s.k?s.c:"rgba(255,255,255,0.1)",color:payForm.stato===s.k?"#fff":"rgba(255,255,255,0.7)"}}>{s.l}</button>)}</div>{payForm.stato==="acconto"&&<div style={{marginBottom:10}}><input type="number" value={payForm.acconto} onChange={(e: any)=>setPayForm({...payForm,acconto:parseFloat(e.target.value)||0})} style={{width:"100%",padding:"10px",borderRadius:2,border:"1.5px solid rgba(255,255,255,0.2)",background:"rgba(255,255,255,0.1)",color:"#fff",fontSize:16,fontWeight:800,outline:"none",boxSizing:"border-box"}} /></div>}<div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>{["Bonifico","Contanti","Assegno","Carta","Ri.Ba."].map(m=><button key={m} onClick={()=>setPayForm({...payForm,metodo:m})} style={{padding:"8px 14px",borderRadius:2,border:"none",fontSize:12,fontWeight:700,cursor:"pointer",background:payForm.metodo===m?"#e07a2f":"rgba(255,255,255,0.1)",color:payForm.metodo===m?"#fff":"rgba(255,255,255,0.7)"}}>{m}</button>)}</div><div style={{display:"flex",gap:8}}><button onClick={()=>setShowPaymentEdit(false)} style={{flex:1,padding:"10px",borderRadius:2,border:"1.5px solid rgba(255,255,255,0.3)",background:"transparent",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer"}}>Annulla</button><button onClick={()=>{onUpdateFattura({statoPagamento:payForm.stato,acconto:payForm.acconto,metodoPagamento:payForm.metodo});setShowPaymentEdit(false);}} style={{flex:2,padding:"10px",borderRadius:2,border:"none",background:"#2d8a4e",color:"#fff",fontSize:12,fontWeight:800,cursor:"pointer"}}> Salva</button></div></div>)}</div>):(<><p style={{fontSize:13,color:"rgba(255,255,255,0.7)",margin:"0 0 8px"}}>Genera la fattura.</p><button onClick={onGenerateFattura} style={{width:"100%",padding:"14px",borderRadius:2,border:"none",background:"#e07a2f",color:"#1e293b",fontSize:15,fontWeight:800,cursor:"pointer"}}> Genera Fattura</button></>)}</div>)}
                  {p.fase==="posa" && (() => { const act=p.actions?.find((a: any)=>a.type==="posa"); if(!act) return null; const dn=act.tasks.filter((t: any)=>t.done).length; const vani=p.misure?.vani||[]; return (<><ProgressBar progress={act.tasks.length?Math.round(dn/act.tasks.length*100):0} done={dn} total={act.tasks.length} small /><div data-tasks="posa">{act.tasks.map((t: any)=><TaskRow key={t.id} task={t} onToggle={()=>onToggleTask(act.id,t.id)} onDelete={()=>{if(confirm("Rimuovere '"+t.text+"'?"))onRemoveTask(act.id,t.id);}} small />)}</div><div style={{display:"flex",gap:6,marginTop:8}}><input value={newTaskText} onChange={(e: any)=>setNewTaskText(e.target.value)} onKeyDown={(e: any)=>{if(e.key==="Enter"&&newTaskText.trim()){onAddTask(act.id,newTaskText);setNewTaskText("");}}} placeholder="+ Aggiungi task..." style={{flex:1,padding:"8px 12px",borderRadius:2,border:"1.5px solid rgba(255,255,255,0.2)",background:"rgba(255,255,255,0.1)",color:"#fff",fontSize:13,outline:"none"}} /><button onClick={()=>{if(newTaskText.trim()){onAddTask(act.id,newTaskText);setNewTaskText("");}}} style={{padding:"8px 14px",borderRadius:2,border:"none",background:"#059669",color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer"}}>+</button></div>{userId && <>{vani.length>0 ? vani.map((v: any,vi: number)=>(<div key={vi} style={{marginTop:12,background:"rgba(255,255,255,0.06)",borderRadius:2,padding:10}}><div style={{fontSize:12,fontWeight:700,color:"#fbbf24",marginBottom:6}}> Vano {vi+1}{v.ambiente?" — "+v.ambiente:""} ({v.sistema||"Infisso"} {v.l}×{v.h})</div><PhotoGallery photos={(p.fotoPosaVani||{})[`${vi}_inizio`]||[]} label={` Prima - Vano ${vi+1}`} userId={userId} folder={`posa/${p.id}/vano${vi}/inizio`} onUpdate={(photos: string[])=>onUpdatePratica({fotoPosaVani:{...(p.fotoPosaVani||{}), [`${vi}_inizio`]:photos}})} /><PhotoGallery photos={(p.fotoPosaVani||{})[`${vi}_dopo`]||[]} label={` Dopo - Vano ${vi+1}`} userId={userId} folder={`posa/${p.id}/vano${vi}/dopo`} onUpdate={(photos: string[])=>onUpdatePratica({fotoPosaVani:{...(p.fotoPosaVani||{}), [`${vi}_dopo`]:photos}})} /></div>)) : <><div style={{marginTop:12}}><PhotoGallery photos={p.fotoPosaInizio||[]} label=" Foto Inizio Lavori" userId={userId} folder={`posa/${p.id}/inizio`} onUpdate={(photos: string[])=>onUpdatePratica({fotoPosaInizio:photos})} /></div><PhotoGallery photos={p.fotoPosaFine||[]} label=" Foto Fine Lavori" userId={userId} folder={`posa/${p.id}/fine`} onUpdate={(photos: string[])=>onUpdatePratica({fotoPosaFine:photos})} /></>}</>}</>); })()}
                  {p.fase==="chiusura" && (<div style={{textAlign:"center",padding:"10px 0"}}>
                    {p.status==="completato" ? (
                      <div style={{padding:16,background:"rgba(5,150,105,0.2)",borderRadius:2}}>
                        <div style={{fontSize:18,fontWeight:900,color:"#4ade80",marginBottom:6,fontFamily:"'JetBrains Mono',monospace"}}>PRATICA CHIUSA</div>
                        <div style={{fontSize:12,color:"rgba(255,255,255,0.7)"}}>Completata il {p.completedAt ? new Date(p.completedAt).toLocaleDateString("it-IT") : "—"}</div>
                        <div style={{display:"flex",gap:8,justifyContent:"center",marginTop:12}}>
                          <button onClick={()=>exportPratica(p,c)} style={{padding:"10px 20px",borderRadius:2,border:"1.5px solid rgba(255,255,255,0.3)",background:"transparent",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'JetBrains Mono',monospace"}}>STAMPA RIEPILOGO</button>
                          <button onClick={onStampaCantiere} style={{padding:"10px 20px",borderRadius:2,border:"1.5px solid rgba(255,255,255,0.3)",background:"transparent",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'JetBrains Mono',monospace"}}>SCHEDA CANTIERE</button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <p style={{fontSize:13,color:"rgba(255,255,255,0.7)",margin:"0 0 12px"}}>Tutte le fasi sono completate. Chiudi la pratica per archiviarla.</p>
                        <button onClick={()=>{onStatusChange("completato");}} style={{width:"100%",padding:"16px",borderRadius:2,border:"none",background:"#2d8a4e",color:"#fff",fontSize:16,fontWeight:900,cursor:"pointer",letterSpacing:"0.5px",fontFamily:"'JetBrains Mono',monospace"}}>CHIUDI PRATICA</button>
                      </div>
                    )}
                  </div>)}
                  {canAdv && curIdx < wf.length-1 && <button onClick={onAdvancePhase} style={{width:"100%",marginTop:14,padding:"14px",borderRadius:2,border:"none",background:"#2d8a4e",color:"#fff",fontSize:15,fontWeight:800,cursor:"pointer"}}> Avanza a: {wf[curIdx+1].icon} {wf[curIdx+1].label} →</button>}
                  {!canAdv && !isComplete && <div style={{marginTop:10,padding:"10px 14px",background:"rgba(255,255,255,0.05)",borderRadius:2,fontSize:12,color:"rgba(255,255,255,0.5)",textAlign:"center",fontWeight:600}}> Completa questa fase per avanzare</div>}
                </div>
            </div>
          );
        })()}

        {isAdmin && <div style={S.statusChanger}><span style={S.statusLbl}>Stato:</span><div style={{display:"flex",gap:6,flex:1}}>{Object.entries(STATUS).map(([k,v])=><button key={k} onClick={()=>onStatusChange(k)} style={{...S.statusTgl,background:p.status===k?v.color:"transparent",color:p.status===k?"#fff":v.color,border:"2px solid "+v.color}}>{v.label}</button>)}</div></div>}

        {p.misure && canDo("misure") && <div style={S.dataSummary}><h4 style={S.dataSumTitle}> Misure</h4><p style={S.dataSumLine}>Vani: {p.misure.vani?.length||0}</p><button onClick={onOpenMisure} style={{...S.openFormBtn,marginTop:6}}>Apri →</button></div>}
        {p.riparazione && canDo("riparazione") && <div style={{...S.dataSummary,borderLeftColor:"#dc2626"}}><h4 style={{...S.dataSumTitle,color:"#dc2626"}}> Riparazione</h4><p style={S.dataSumLine}>{p.riparazione.problema||"—"}</p><button onClick={onOpenRip} style={{...S.openFormBtn,marginTop:6,background:"#fef2f2",color:"#dc2626"}}>Apri →</button></div>}
        {p.preventivo && canDo("preventivo") && <div style={{...S.dataSummary,borderLeftColor:"#8b5cf6"}}><h4 style={{...S.dataSumTitle,color:"#8b5cf6"}}> Preventivo</h4><p style={S.dataSumLine}>€ {(p.preventivo.totaleFinale||0).toFixed(2)}</p><button onClick={onOpenPrev} style={{...S.openFormBtn,marginTop:6,background:"#f5f3ff",color:"#8b5cf6"}}>Apri →</button></div>}
        {(p.emails||[]).length>0 && <div style={{marginTop:16}}><h3 style={S.sectionTitle}> Email ({p.emails.length})</h3>{p.emails.map((e: any)=><div key={e.id} style={S.emailCard}><div style={{fontSize:13,fontWeight:600,color:"#0f172a"}}>{e.oggetto}</div><div style={{fontSize:12,color:"#64748b"}}>A: {e.destinatario} · {new Date(e.sentAt).toLocaleString("it-IT")}</div></div>)}</div>}
        {canDo("email") && <button onClick={onOpenEmail} style={S.sendEmailBtn}> Invia Email</button>}

        {/* ASSEGNA A MEMBRO TEAM */}
        {teamMembers && teamMembers.length > 0 && isAdmin && (
          <div style={{marginTop:16,padding:14,background:"#f5f3ff",borderRadius:2,border:"2px solid #c4b5fd"}}>
            <div style={{fontSize:12,fontWeight:800,color:"#4338ca",textTransform:"uppercase",marginBottom:8}}> Assegna Pratica</div>
            <select value={p.assegnatoA||""} onChange={(e: any)=>onAssign(e.target.value||null)} style={{width:"100%",padding:"12px 14px",borderRadius:2,border:"2px solid #c4b5fd",fontSize:14,fontWeight:600,background:"#fff",outline:"none"}}>
              <option value="">— Non assegnata —</option>
              {teamMembers.map((m: any)=><option key={m.id} value={m.id}>{m.nome} ({m.ruolo})</option>)}
            </select>
            {p.assegnatoA && (() => {
              const member = teamMembers.find((m: any) => m.id === p.assegnatoA);
              return member ? <div style={{fontSize:12,color:"#3a7bd5",marginTop:6,fontWeight:600}}> Assegnata a: {member.nome}</div> : null;
            })()}
          </div>
        )}

        {/* FIRMA CORRETTA POSA */}
        {p.fase === "posa" && (
          <div style={{marginTop:16,padding:16,background:"#ecfdf5",borderRadius:2,border:"2px solid #059669"}}>
            <div style={{fontSize:14,fontWeight:800,color:"#065f46",marginBottom:10}}> Firma Corretta Posa</div>
            {p.firmaPosa ? (
              <div>
                <div style={{fontSize:13,color:"#059669",fontWeight:700,marginBottom:6}}> Documento firmato dal cliente</div>
                {p.firmaPosa.firma && <img src={p.firmaPosa.firma} alt="Firma" style={{height:50,borderRadius:2,background:"#fff",padding:4,border:"1px solid #d1d5db"}} />}
                <div style={{fontSize:11,color:"#64748b",marginTop:4}}>Firmato il: {p.firmaPosa.data ? new Date(p.firmaPosa.data).toLocaleString("it-IT") : "—"}</div>
                {p.firmaPosa.nonConformita && <div style={{fontSize:12,color:"#dc2626",marginTop:6,fontWeight:600}}> Non conformità: {p.firmaPosa.nonConformita}</div>}
              </div>
            ) : (
              <FirmaCorrettaPosa onSave={(data: any) => onUpdatePratica({ firmaPosa: { ...data, data: new Date().toISOString() } })} />
            )}
          </div>
        )}

        {/* MESSAGGI INTERNI PRATICA */}
        {teamMembers && teamMembers.length > 0 && (
          <div style={{marginTop:16,padding:14,background:"#f0f9ff",borderRadius:2,border:"2px solid #93c5fd"}}>
            <div style={{fontSize:12,fontWeight:800,color:"#1d4ed8",textTransform:"uppercase",marginBottom:8}}> Messaggi Pratica</div>
            {(p.messaggi||[]).length > 0 && (
              <div style={{maxHeight:250,overflowY:"auto",marginBottom:10}}>
                {(p.messaggi||[]).map((msg: any)=>(
                  <div key={msg.id} style={{padding:"8px 12px",borderRadius:2,marginBottom:6,background:msg.userId===userId?"#dbeafe":"#fff",border:"1px solid #e2e8f0"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:2}}>
                      <span style={{fontSize:11,fontWeight:700,color:"#1d4ed8"}}>{msg.autore||"Utente"}</span>
                      {msg.destinatario && <span style={{fontSize:10,color:"#6b7280"}}>→ {msg.destinatario}</span>}
                    </div>
                    <div style={{fontSize:13,color:"#0f172a"}}>{msg.testo}</div>
                    <div style={{fontSize:10,color:"#94a3b8",marginTop:2}}>{msg.data?new Date(msg.data).toLocaleString("it-IT"):""}</div>
                  </div>
                ))}
              </div>
            )}
            <div style={{display:"flex",gap:6}}>
              <select value={msgDest} onChange={(e: any)=>setMsgDest(e.target.value)} style={{flex:"0 0 120px",padding:"8px",borderRadius:2,border:"1.5px solid #93c5fd",fontSize:12,outline:"none"}}>
                <option value="">Tutti</option>
                {teamMembers.map((m: any)=><option key={m.id} value={m.id}>{m.nome}</option>)}
              </select>
              <input value={msgText} onChange={(e: any)=>setMsgText(e.target.value)} onKeyDown={(e: any)=>{if(e.key==="Enter"&&msgText.trim()){sendMsg();}}} placeholder="Scrivi messaggio..." style={{flex:1,padding:"8px 12px",borderRadius:2,border:"1.5px solid #93c5fd",fontSize:13,outline:"none"}} />
              <button onClick={sendMsg} disabled={!msgText.trim()} style={{padding:"8px 14px",borderRadius:2,border:"none",background:msgText.trim()?"#2563eb":"#cbd5e1",color:"#fff",fontSize:14,fontWeight:700,cursor:msgText.trim()?"pointer":"default"}}>↑</button>
            </div>
          </div>
        )}

        <div style={{marginTop:16,padding:14,background:"#f8fafc",borderRadius:2,border:"1px solid #e2e8f0"}}>
          <h4 style={{fontSize:12,fontWeight:700,color:"#1a1a2e",margin:"0 0 10px",fontFamily:"'JetBrains Mono',monospace",textTransform:"uppercase",letterSpacing:"0.5px"}}>ESPORTA / STAMPA</h4>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            <button onClick={()=>exportPratica(p,c)} style={S.exportBtn}>Riepilogo</button>
            {p.misure && <button onClick={()=>exportMisure(p,c)} style={{...S.exportBtn,background:"#fffbeb",color:"#d97706",border:"1.5px solid #d97706"}}>Misure</button>}
            {p.riparazione && <button onClick={()=>exportRiparazione(p,c)} style={{...S.exportBtn,background:"#fef2f2",color:"#dc2626",border:"1.5px solid #dc2626"}}>Riparazione</button>}
            {p.preventivo && <button onClick={()=>exportPreventivo(p,c,true)} style={{...S.exportBtn,background:"#f5f3ff",color:"#8b5cf6",border:"1.5px solid #8b5cf6"}}>Preventivo</button>}
            {hasConferma && <button onClick={()=>exportConfermaOrdine(p,c)} style={{...S.exportBtn,background:"#ecfdf5",color:"#059669",border:"1.5px solid #059669"}}>Conferma</button>}
            {hasFattura && <button onClick={()=>exportFattura(p,c)} style={{...S.exportBtn,background:"#fffbeb",color:"#d97706",border:"1.5px solid #d97706"}}>Fattura</button>}
            <button onClick={onStampaCantiere} style={{...S.exportBtn,background:"#1a1a2e",color:"#fff",border:"1.5px solid #1a1a2e"}}>Scheda Cantiere</button>
          </div>
          {/* WhatsApp Share */}
          {c?.telefono && <div style={{marginTop:8}}>
            <a href={`https://wa.me/${c.telefono.replace(/[^0-9+]/g,"").replace(/^0/,"+39")}?text=${encodeURIComponent(`Buongiorno ${c.nome}, le invio il riepilogo della pratica ${p.numero}. Cordiali saluti.`)}`} target="_blank" rel="noopener noreferrer" style={{display:"inline-flex",alignItems:"center",gap:6,padding:"8px 14px",borderRadius:2,background:"#25D366",color:"#fff",fontSize:12,fontWeight:700,textDecoration:"none",fontFamily:"'JetBrains Mono',monospace"}}>
              WHATSAPP → {c.nome}
            </a>
          </div>}
        </div>

        {/* Activity Log / Storico */}
        {(p.log||[]).length > 0 && (
          <div style={{marginTop:16,padding:14,background:"#fafbfc",borderRadius:2,border:"1px solid #e2e8f0"}}>
            <h4 style={{fontSize:12,fontWeight:700,color:"#1a1a2e",margin:"0 0 10px",fontFamily:"'JetBrains Mono',monospace",textTransform:"uppercase",letterSpacing:"0.5px"}}>STORICO ATTIVITA</h4>
            <div style={{maxHeight:200,overflowY:"auto"}}>
              {[...(p.log||[])].reverse().map((l: any, i: number) => (
                <div key={i} style={{display:"flex",gap:8,padding:"6px 0",borderBottom:i<(p.log.length-1)?"1px solid #e8e8e8":"none",fontSize:12}}>
                  <span style={{color:"#7a8194",fontFamily:"'JetBrains Mono',monospace",fontSize:10,whiteSpace:"nowrap"}}>{new Date(l.ts).toLocaleString("it-IT",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}</span>
                  <span style={{color:"#1a1a2e",flex:1}}>{l.msg}</span>
                  <span style={{color:"#9ca3b8",fontSize:10}}>{l.by?.split("@")[0]||""}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ==================== FREEHAND CANVAS ====================
function FreehandCanvas({ drawing, onSave, label, color }: any) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(!!drawing);
  const strokeColor = color || "#2563eb";
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Set canvas size
    canvas.width = canvas.offsetWidth * 2;
    canvas.height = canvas.offsetHeight * 2;
    ctx.scale(2, 2);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2;
    ctx.strokeStyle = strokeColor;
    // Restore saved drawing
    if (drawing) {
      const img = new Image();
      img.onload = () => { ctx.drawImage(img, 0, 0, canvas.offsetWidth, canvas.offsetHeight); };
      img.src = drawing;
    }
  }, []);
  
  function getPos(e: any) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches ? e.touches[0] : e;
    return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
  }
  
  function startDraw(e: any) {
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;
    setIsDrawing(true);
    setHasDrawn(true);
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  }
  
  function draw(e: any) {
    if (!isDrawing) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  }
  
  function endDraw() {
    setIsDrawing(false);
    saveCanvas();
  }
  
  function saveCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const data = canvas.toDataURL("image/png");
    onSave(data);
  }
  
  function clearCanvas() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
    onSave("");
  }
  
  return (
    <div style={{marginBottom:12,background:"#f8fafc",borderRadius:2,padding:12,border:`1.5px solid ${strokeColor}33`}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <span style={{fontSize:12,fontWeight:700,color:"#374151"}}>{label||"✏️ Disegno"}</span>
        {hasDrawn && <button onClick={clearCanvas} style={{padding:"4px 10px",borderRadius:2,border:"none",background:"#fee2e2",color:"#dc2626",fontSize:11,fontWeight:700,cursor:"pointer"}}> Cancella</button>}
      </div>
      <canvas ref={canvasRef} style={{width:"100%",height:200,border:"2px solid #d1d5db",borderRadius:2,background:"#fff",cursor:"crosshair",touchAction:"none"}}
        onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
        onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw}
      />
      <p style={{fontSize:9,color:"#94a3b8",textAlign:"center",marginTop:4}}>Disegna con il dito o il mouse</p>
    </div>
  );
}

// ==================== VETRATA DESIGNER ====================
function VetrataDesigner({ design, onChange }: any) {
  // Data: { columns: [{ cells: [{ apertura: "DX" }] }] }
  const TIPI = [
    { key: "DX", icon: "→", color: "#2563eb" },
    { key: "SX", icon: "←", color: "#2563eb" },
    { key: "Fisso", icon: "■", color: "#64748b" },
    { key: "Vasistas", icon: "↑", color: "#d97706" },
    { key: "A/R", icon: "↕", color: "#059669" },
    { key: "Sopraluce", icon: "△", color: "#8b5cf6" },
    { key: "Sottoluce", icon: "▽", color: "#8b5cf6" },
  ];
  const d = design?.columns ? design : { columns: [{ cells: [{ apertura: "Fisso" }] }] };
  const columns = d.columns;
  
  function emit(cols: any[]) { onChange({ columns: cols }); }
  
  // MONTANTE: add vertical divider = add a new column
  function addMontante() {
    if (columns.length >= 6) return;
    emit([...columns, { cells: [{ apertura: "Fisso" }] }]);
  }
  function removeMontante(colIdx: number) {
    if (columns.length <= 1) return;
    emit(columns.filter((_: any, i: number) => i !== colIdx));
  }
  
  // TRAVERSO: add horizontal divider in a column = add a cell
  function addTraverso(colIdx: number) {
    if (columns[colIdx].cells.length >= 4) return;
    const cols = [...columns];
    cols[colIdx] = { cells: [...cols[colIdx].cells, { apertura: "Fisso" }] };
    emit(cols);
  }
  function removeTraverso(colIdx: number, cellIdx: number) {
    if (columns[colIdx].cells.length <= 1) return;
    const cols = [...columns];
    cols[colIdx] = { cells: cols[colIdx].cells.filter((_: any, i: number) => i !== cellIdx) };
    emit(cols);
  }
  
  // APERTURA: cycle type on click
  function cycleApertura(colIdx: number, cellIdx: number) {
    const cur = columns[colIdx].cells[cellIdx].apertura;
    const keys = TIPI.map(t => t.key);
    const next = keys[(keys.indexOf(cur) + 1) % keys.length];
    const cols = columns.map((col: any, ci: number) => {
      if (ci !== colIdx) return col;
      return { cells: col.cells.map((cell: any, ri: number) => ri === cellIdx ? { ...cell, apertura: next } : cell) };
    });
    emit(cols);
  }
  
  // Compute max rows for equal height
  const maxRows = Math.max(...columns.map((c: any) => c.cells.length));
  
  // Summary string
  const summary = columns.map((col: any, ci: number) => 
    col.cells.map((cell: any) => cell.apertura).join("+")
  ).join(" | ");
  
  return (
    <div style={{marginBottom:12}}>
      <div style={{background:"#f8fafc",borderRadius:2,padding:12,border:"1.5px solid #d1d5db"}}>
        
        {/* VISUAL PREVIEW */}
        <div style={{display:"flex",border:"4px solid #1e293b",borderRadius:3,minHeight:120,overflow:"hidden",maxWidth:340,margin:"0 auto",background:"#fff"}}>
          {columns.map((col: any, ci: number) => (
            <div key={ci} style={{flex:1,display:"flex",flexDirection:"column",borderRight:ci<columns.length-1?"3px solid #1e293b":"none",position:"relative",minWidth:44}}>
              {col.cells.map((cell: any, ri: number) => {
                const tipo = TIPI.find(t => t.key === cell.apertura) || TIPI[2];
                return (
                  <div key={ri} onClick={()=>cycleApertura(ci,ri)} style={{
                    flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
                    borderBottom:ri<col.cells.length-1?"2px solid #1e293b":"none",
                    cursor:"pointer",padding:4,minHeight:Math.max(40, 120/maxRows),
                    background:cell.apertura==="Fisso"?"#e2e8f0":"#fff",
                    transition:"background 0.15s",
                  }}>
                    <div style={{fontSize:Math.max(16,24-columns.length*2),fontWeight:900,color:tipo.color,lineHeight:1}}>{tipo.icon}</div>
                    <div style={{fontSize:Math.max(8,10-columns.length),fontWeight:800,color:tipo.color,marginTop:2}}>{cell.apertura}</div>
                  </div>
                );
              })}
              {/* Remove column button */}
              {columns.length > 1 && (
                <button onClick={(e)=>{e.stopPropagation();removeMontante(ci);}} style={{position:"absolute",top:-2,right:-2,width:16,height:16,borderRadius:"50%",background:"#ef4444",border:"none",color:"#fff",fontSize:9,cursor:"pointer",lineHeight:1,zIndex:2}}>×</button>
              )}
            </div>
          ))}
        </div>
        
        {/* CONTROLS */}
        <div style={{marginTop:10,display:"flex",gap:6,justifyContent:"center",flexWrap:"wrap"}}>
          <button onClick={addMontante} disabled={columns.length>=6} style={{padding:"5px 12px",borderRadius:2,border:"1.5px solid #1e293b",background:"#fff",color:"#1e293b",fontSize:11,fontWeight:700,cursor:columns.length<6?"pointer":"default",opacity:columns.length<6?1:0.4}}>┃ + Montante</button>
          {columns.map((_: any, ci: number) => (
            <button key={ci} onClick={()=>addTraverso(ci)} disabled={columns[ci].cells.length>=4} style={{padding:"5px 12px",borderRadius:2,border:"1.5px solid #d97706",background:"#fffbeb",color:"#92400e",fontSize:11,fontWeight:700,cursor:columns[ci].cells.length<4?"pointer":"default",opacity:columns[ci].cells.length<4?1:0.4}}>━ Traverso Col.{ci+1}</button>
          ))}
        </div>
        
        {/* CELL LIST + REMOVE TRAVERSO */}
        <div style={{marginTop:8,display:"flex",gap:4,flexWrap:"wrap",alignItems:"center"}}>
          {columns.map((col: any, ci: number) => 
            col.cells.map((cell: any, ri: number) => (
              <div key={`${ci}-${ri}`} style={{display:"inline-flex",alignItems:"center",gap:3,padding:"3px 8px",borderRadius:6,background:"#eff6ff",fontSize:10,fontWeight:700,color:"#4338ca"}}>
                C{ci+1}R{ri+1}: {cell.apertura}
                {col.cells.length > 1 && <button onClick={()=>removeTraverso(ci,ri)} style={{background:"none",border:"none",color:"#ef4444",fontSize:12,cursor:"pointer",padding:0,lineHeight:1}}>×</button>}
              </div>
            ))
          )}
        </div>
        
        <p style={{fontSize:9,color:"#94a3b8",textAlign:"center",marginTop:6}}>Tocca una cella per cambiare apertura · {summary}</p>
      </div>
    </div>
  );
}

// ==================== MISURE FORM ====================
function MisureForm({ pratica, client, sistemi, tipologie, vetri, coloriMap, allColori, userId, onSave, onBack }: any) {
  const m = pratica?.misure;
  const [cantiere, setCantiere] = useState(m?.cantiere||client?.nome||"");
  const [indirizzo, setIndirizzo] = useState(m?.indirizzo||pratica?.indirizzo||"");
  const [sistema, setSistema] = useState(m?.sistema||"");
  const [materialeId, setMaterialeId] = useState(m?.materialeId||"");
  const [coloreInt, setColoreInt] = useState(m?.coloreInt||"Bianco");
  const [coloreEst, setColoreEst] = useState(m?.coloreEst||"Bianco");
  const [vetro, setVetro] = useState(m?.vetro||"");
  const [piano, setPiano] = useState(m?.piano||"");
  const [mezziSalita, setMezziSalita] = useState(m?.mezziSalita||"");
  const [noteGen, setNoteGen] = useState(m?.noteGen||"");
  const [vani, setVani] = useState(m?.vani||[makeVano()]);
  const coloriPerMat = materialeId && coloriMap[materialeId] ? coloriMap[materialeId] : allColori || [];
  function makeVano() { return {id:gid(),ambiente:"",l:"",h:"",q:"1",apertura:"DX",sistema:"",vetro:"",note:"",photos:{},altroColore:false,coloreIntVano:"",coloreEstVano:"",design:{columns:[{cells:[{apertura:"DX"}]}]},showFreehand:false,showVetrata:false,showLamiera:false,freehandData:"",lamieraData:""}; }
  function uv(i: number,f: string,v: any) { const n=[...vani]; n[i]={...n[i],[f]:v}; setVani(n); }
  const useTipologie = tipologie?.length > 0 ? tipologie : SISTEMI;
  return (
    <div style={S.container}>
      <div style={{...S.secHdr,background:"#d4820e",}}><button onClick={onBack} style={{...S.backBtn,color:"#fff"}}>← Indietro</button><h2 style={{...S.secTitle,color:"#fff"}}>SCHEDA MISURE</h2></div>
      <div style={{padding:20}}>
        <div style={S.praticaRef}>{pratica?.numero} · {client?.nome}</div>
        <Field label="Cantiere" value={cantiere} onChange={setCantiere} placeholder="Rif. cantiere" />
        <Field label="Indirizzo" value={indirizzo} onChange={setIndirizzo} placeholder="Indirizzo" />
        {/* === DATI GENERALI IN ALTO === */}
        <div style={{background:"#fdf3eb",borderRadius:2,padding:16,marginBottom:16,border:"2px solid #f59e0b"}} data-vano="commessa">
          <h4 style={{fontSize:14,fontWeight:800,color:"#92400e",margin:"0 0 12px"}}>IMPOSTAZIONI COMMESSA</h4>
          <div style={{display:"flex",gap:12}}>
            <div style={{flex:1}}><label style={S.fLabel}>Materiale</label><select value={materialeId} onChange={(e: any)=>{setMaterialeId(e.target.value);autoAdvanceField(e.target);}} style={S.input}><option value="">— Seleziona —</option>{(sistemi||DEFAULT_SISTEMI).map((s: any)=><option key={s.id} value={s.id}>{s.icon} {s.nome}</option>)}</select></div>
            <div style={{flex:1}}><label style={S.fLabel}>Piano di Salita</label><select value={piano} onChange={(e: any)=>{setPiano(e.target.value);autoAdvanceField(e.target);}} autoComplete="off" name="floor-level" style={S.input}><option value="">—</option>{["Terra","1°","2°","3°","4°","5°","6°","7°","8°","9°","10°","11°","12°","13°"].map(p=><option key={p}>{p}</option>)}</select></div>
            <div style={{flex:1}}><label style={S.fLabel}>Mezzi di Salita</label><input value={mezziSalita} onChange={(e: any)=>setMezziSalita(e.target.value)} placeholder="Es. piattaforma aerea, a mano..." style={S.input} /></div>
          </div>
          <div style={{display:"flex",gap:12}}>
            <div style={{flex:1}}><label style={S.fLabel}>Colore Int. (default)</label><select value={coloreInt} onChange={(e: any)=>{setColoreInt(e.target.value);autoAdvanceField(e.target);}} style={S.input}><option value="">—</option>{coloriPerMat.map((c: string)=><option key={c}>{c}</option>)}<option value="__custom">+ Personalizzato</option></select>{coloreInt==="__custom"&&<input value="" onChange={(e: any)=>setColoreInt(e.target.value)} placeholder="Inserisci colore..." style={{...S.input,marginTop:4}} autoFocus />}</div>
            <div style={{flex:1}}><label style={S.fLabel}>Colore Est. (default)</label><select value={coloreEst} onChange={(e: any)=>{setColoreEst(e.target.value);autoAdvanceField(e.target);}} style={S.input}><option value="">—</option>{coloriPerMat.map((c: string)=><option key={c}>{c}</option>)}<option value="__custom">+ Personalizzato</option></select>{coloreEst==="__custom"&&<input value="" onChange={(e: any)=>setColoreEst(e.target.value)} placeholder="Inserisci colore..." style={{...S.input,marginTop:4}} autoFocus />}</div>
          </div>
          <div style={{marginTop:8}}>
            <label style={S.fLabel}>VETRO (DEFAULT)</label>
            <select value={vetro} onChange={(e: any)=>{setVetro(e.target.value);autoAdvanceField(e.target);}} style={S.input}>
              <option value="">— Seleziona vetro —</option>
              {(vetri||DEFAULT_VETRI).map((v: string)=><option key={v}>{v}</option>)}
              <option value="__custom">+ Personalizzato</option>
            </select>
            {vetro==="__custom"&&<input value="" onChange={(e: any)=>setVetro(e.target.value)} placeholder="Inserisci vetro..." style={{...S.input,marginTop:4}} autoFocus />}
          </div>
        </div>
        <h3 style={{...S.sectionTitle,marginTop:20}}>Vani ({vani.length})</h3>
        {vani.map((v: any,i: number)=>(
          <div key={v.id} data-vano={i} style={S.vanoCard}>
            <div style={S.vanoHdr}><span style={S.vanoNum}>{i+1}</span><span style={{fontSize:15,fontWeight:700,flex:1}}>Vano {i+1}</span>{vani.length>1 && <button onClick={()=>setVani(vani.filter((_: any,j: number)=>j!==i))} style={S.vanoRm}>×</button>}</div>
            <Field label="Ambiente" value={v.ambiente} onChange={(val: string)=>uv(i,"ambiente",val)} placeholder="Soggiorno, Camera..." />
            <div style={{flex:1,marginBottom:8}}><label style={S.fLabel}>Tipologia</label><select value={v.sistema||sistema} onChange={(e: any)=>{uv(i,"sistema",e.target.value);autoAdvanceField(e.target);}} style={S.input}><option value="">—</option>{useTipologie.map((s: string)=><option key={s}>{s}</option>)}</select></div>
            <div style={{flex:1,marginBottom:8}}><label style={S.fLabel}>VETRO</label><select value={v.vetro||vetro} onChange={(e: any)=>{uv(i,"vetro",e.target.value);autoAdvanceField(e.target);}} style={S.input}><option value="">{vetro ? `Default: ${vetro}` : "— Seleziona —"}</option>{(vetri||DEFAULT_VETRI).map((vt: string)=><option key={vt}>{vt}</option>)}<option value="__custom">+ Personalizzato</option></select>{v.vetro==="__custom"&&<input onChange={(e: any)=>uv(i,"vetro",e.target.value)} placeholder="Vetro personalizzato..." style={{...S.input,marginTop:4}} autoFocus />}</div>
            <div style={{display:"flex",gap:8}}><Field label="L (mm)" value={v.l} onChange={(val: string)=>uv(i,"l",val)} type="number" placeholder="Larg." style={{flex:1}} /><Field label="H (mm)" value={v.h} onChange={(val: string)=>uv(i,"h",val)} type="number" placeholder="Alt." style={{flex:1}} /><Field label="Q.tà" value={v.q} onChange={(val: string)=>uv(i,"q",val)} type="number" style={{flex:"0 0 60px"}} /></div>
            <div style={S.fGroup}><label style={S.fLabel}>Apertura</label><div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{APERTURE.map(a=><button key={a} onClick={()=>uv(i,"apertura",a)} style={{...S.pill,background:v.apertura===a?"#d97706":"#f3f4f6",color:v.apertura===a?"#fff":"#6b7280"}}>{a}</button>)}</div></div>
            {/* DISEGNO - toggle per attivare */}
            <div style={{marginBottom:12}}>
              <label style={{fontSize:10,fontWeight:700,color:"#5c6370",textTransform:"uppercase",letterSpacing:"1px",display:"block",marginBottom:8,fontFamily:"'JetBrains Mono','SF Mono',monospace"}}>STRUMENTI DISEGNO</label>
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
                <button onClick={()=>uv(i,"showVetrata",!v.showVetrata)} style={{padding:"8px 14px",borderRadius:2,border:v.showVetrata?"2px solid #059669":"1px solid #d5d8de",background:v.showVetrata?"#ecfdf5":"#fafbfc",cursor:"pointer",fontSize:12,fontWeight:700,color:v.showVetrata?"#059669":"#5c6370"}}>
                  {v.showVetrata?"● ":"○ "}Schema Vetrata
                </button>
                <button onClick={()=>uv(i,"showFreehand",!v.showFreehand)} style={{padding:"8px 14px",borderRadius:2,border:v.showFreehand?"2px solid #2563eb":"1px solid #d5d8de",background:v.showFreehand?"#eff6ff":"#fafbfc",cursor:"pointer",fontSize:12,fontWeight:700,color:v.showFreehand?"#2563eb":"#5c6370"}}>
                  {v.showFreehand?"● ":"○ "}Disegno a Mano
                </button>
                <button onClick={()=>uv(i,"showLamiera",!v.showLamiera)} style={{padding:"8px 14px",borderRadius:2,border:v.showLamiera?"2px solid #d97706":"1px solid #d5d8de",background:v.showLamiera?"#fffbeb":"#fafbfc",cursor:"pointer",fontSize:12,fontWeight:700,color:v.showLamiera?"#d97706":"#5c6370"}}>
                  {v.showLamiera?"● ":"○ "}Disegno Lamiera
                </button>
              </div>
              {v.showVetrata && <VetrataDesigner design={v.design} onChange={(d: any)=>uv(i,"design",d)} />}
              {v.showFreehand && <FreehandCanvas drawing={v.freehandData} onSave={(data: string)=>uv(i,"freehandData",data)} label="DISEGNO A MANO LIBERA" />}
              {v.showLamiera && <FreehandCanvas drawing={v.lamieraData} onSave={(data: string)=>uv(i,"lamieraData",data)} label="DISEGNO LAMIERA" color="#d97706" />}
            </div>
            {/* FLAG ALTRO COLORE */}
            <div style={{marginBottom:8}}>
              <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:13,fontWeight:600,color:"#374151"}}>
                <input type="checkbox" checked={v.altroColore||false} onChange={(e: any)=>uv(i,"altroColore",e.target.checked)} style={{width:18,height:18,accentColor:"#d97706"}} />
                Colore diverso per questo vano
              </label>
            </div>
            {v.altroColore && (
              <div style={{display:"flex",gap:8,marginBottom:8,background:"#fffbeb",padding:10,borderRadius:2,border:"1px solid #fbbf24"}}>
                <div style={{flex:1}}><label style={{...S.fLabel,fontSize:10}}>Colore Int.</label><select value={v.coloreIntVano||""} onChange={(e: any)=>uv(i,"coloreIntVano",e.target.value)} style={{...S.input,fontSize:12}}><option value="">—</option>{coloriPerMat.map((c: string)=><option key={c}>{c}</option>)}<option value="__custom">+ Custom</option></select>{v.coloreIntVano==="__custom"&&<input onChange={(e: any)=>uv(i,"coloreIntVano",e.target.value)} placeholder="Colore..." style={{...S.input,fontSize:12,marginTop:4}} />}</div>
                <div style={{flex:1}}><label style={{...S.fLabel,fontSize:10}}>Colore Est.</label><select value={v.coloreEstVano||""} onChange={(e: any)=>uv(i,"coloreEstVano",e.target.value)} style={{...S.input,fontSize:12}}><option value="">—</option>{coloriPerMat.map((c: string)=><option key={c}>{c}</option>)}<option value="__custom">+ Custom</option></select>{v.coloreEstVano==="__custom"&&<input onChange={(e: any)=>uv(i,"coloreEstVano",e.target.value)} placeholder="Colore..." style={{...S.input,fontSize:12,marginTop:4}} />}</div>
              </div>
            )}
            <div style={S.fGroup}><label style={S.fLabel}>Foto Vano</label><div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{PHOTO_TYPES.map(p=><PhotoCapture key={p.k} url={v.photos[p.k]} label={p.l} icon={p.i} onCapture={async(file: File)=>{if(!userId)return;const url=await uploadPhotoToStorage(file,userId,`misure/${pratica?.id}/${v.id}`);if(url){const photos={...v.photos,[p.k]:url};uv(i,"photos",photos);}}} onDelete={async()=>{if(v.photos[p.k])await deletePhotoFromStorage(v.photos[p.k]);const photos={...v.photos};delete photos[p.k];uv(i,"photos",photos);}} />)}</div></div>
            <Field label="Note" value={v.note} onChange={(val: string)=>uv(i,"note",val)} placeholder="Note vano..." />
          </div>
        ))}
        <button onClick={()=>setVani([...vani,makeVano()])} style={S.addVanoBtn}>+ Aggiungi Vano</button>
        <Field label="Note Generali" value={noteGen} onChange={setNoteGen} placeholder="Note generali..." textarea />
        <button onClick={()=>onSave({cantiere,indirizzo,sistema,materialeId,coloreInt,coloreEst,vetro,piano,mezziSalita,noteGen,vani})} style={{...S.saveBtn,background:"#d4820e",}}>SALVA MISURE</button>
        {pratica?.misure && <button onClick={()=>exportMisure(pratica,client)} style={{...S.saveBtn,background:"#fff",color:"#d97706",border:"2px solid #d97706",boxShadow:"none",marginTop:8}}>STAMPA / PDF</button>}
      </div>
    </div>
  );
}

// ==================== RIPARAZIONE ====================
function RipForm({ pratica, client, userId, onSave, onBack }: any) {
  const r = pratica?.riparazione;
  const [problema, setProblema] = useState(r?.problema||"");
  const [descrizione, setDescrizione] = useState(r?.descrizione||"");
  const [urgenza, setUrgenza] = useState(r?.urgenza||"media");
  const [tipoInfisso, setTipoInfisso] = useState(r?.tipoInfisso||"");
  const [materiale, setMateriale] = useState(r?.materiale||"");
  const [ricambi, setRicambi] = useState(r?.ricambi||"");
  const [costoStimato, setCostoStimato] = useState(r?.costoStimato||"");
  const [noteRip, setNoteRip] = useState(r?.noteRip||"");
  const [fotoDanno, setFotoDanno] = useState<string[]>(r?.fotoDanno||[]);
  const [fotoRiparazione, setFotoRiparazione] = useState<string[]>(r?.fotoRiparazione||[]);
  return (
    <div style={S.container}>
      <div style={{...S.secHdr,background:"#c44040"}}><button onClick={onBack} style={{...S.backBtn,color:"#fff"}}>← Indietro</button><h2 style={{...S.secTitle,color:"#fff"}}> Scheda Riparazione</h2></div>
      <div style={{padding:20}}>
        <div style={{...S.praticaRef,borderLeftColor:"#dc2626"}}>{pratica?.numero} · {client?.nome}</div>
        <div style={S.fGroup}><label style={S.fLabel}>Urgenza</label><div style={{display:"flex",gap:8}}>{URGENZE.map(u=><button key={u.k} onClick={()=>setUrgenza(u.k)} style={{...S.urgBtn,background:urgenza===u.k?u.c:"#f3f4f6",color:urgenza===u.k?"#fff":"#6b7280"}}>{u.i} {u.l}</button>)}</div></div>
        <div style={S.fGroup}><label style={S.fLabel}>Tipo Problema</label><div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{PROBLEMI.map(p=><button key={p} onClick={()=>setProblema(p)} style={{...S.pill,background:problema===p?"#dc2626":"#f3f4f6",color:problema===p?"#fff":"#6b7280"}}>{p}</button>)}</div></div>
        <Field label="Descrizione" value={descrizione} onChange={setDescrizione} placeholder="Dettagli problema..." textarea rows={4} />
        {userId && <PhotoGallery photos={fotoDanno} label=" Foto Danno" userId={userId} folder={`riparazione/${pratica?.id}/danno`} onUpdate={setFotoDanno} />}
        <Field label="Tipo Infisso" value={tipoInfisso} onChange={setTipoInfisso} placeholder="es. Finestra 2 ante PVC" />
        <Field label="Materiale" value={materiale} onChange={setMateriale} placeholder="PVC, Alluminio, Legno..." />
        <Field label="Ricambi" value={ricambi} onChange={setRicambi} placeholder="Pezzi necessari..." textarea />
        <Field label="Costo Stimato (€)" value={costoStimato} onChange={setCostoStimato} type="number" placeholder="0.00" />
        {userId && <PhotoGallery photos={fotoRiparazione} label=" Foto Dopo Intervento" userId={userId} folder={`riparazione/${pratica?.id}/dopo`} onUpdate={setFotoRiparazione} />}
        <Field label="Note" value={noteRip} onChange={setNoteRip} placeholder="Altre note..." textarea />
        <button onClick={()=>onSave({problema,descrizione,urgenza,tipoInfisso,materiale,ricambi,costoStimato,noteRip,fotoDanno,fotoRiparazione})} style={{...S.saveBtn,background:"#c44040"}}> Salva Riparazione</button>
        {pratica?.riparazione && <button onClick={()=>exportRiparazione(pratica,client)} style={{...S.saveBtn,background:"#fff",color:"#dc2626",border:"2px solid #dc2626",boxShadow:"none",marginTop:8}}> Stampa / PDF Riparazione</button>}
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

  // Recalculate all totals on mount (fixes saved data with stale totals)
  useEffect(() => {
    if (prodotti.length === 0) return;
    let changed = false;
    const fixed = prodotti.map((p: any) => {
      const lm = parseFloat(String(p.larghezza)) || 0;
      const hm = parseFloat(String(p.altezza)) || 0;
      const mq = (lm > 0 && hm > 0) ? parseFloat(((lm * hm) / 1000000).toFixed(4)) : (parseFloat(String(p.mq)) || 0);
      const prezzo = parseFloat(String(p.prezzoUnitario)) || 0;
      const qty = parseInt(String(p.quantita)) || 1;
      let totale: number;
      if (p.tipoPrezzo === "mq") {
        totale = parseFloat((prezzo * mq * qty).toFixed(2));
      } else if (p.tipoPrezzo === "manuale") {
        totale = parseFloat(String(p.totale)) || 0;
      } else {
        totale = parseFloat((prezzo * qty).toFixed(2));
      }
      if (totale !== (parseFloat(String(p.totale)) || 0) || mq !== (parseFloat(String(p.mq)) || 0)) {
        changed = true;
        return { ...p, mq, totale };
      }
      return p;
    });
    if (changed) setProdotti(fixed);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
        tipologia: v.sistema || "",
        sistema: "",
        coloreInt: v.altroColore ? (v.coloreIntVano||"") : (m.coloreInt||""),
        coloreEst: v.altroColore ? (v.coloreEstVano||"") : (m.coloreEst||""),
        vetro: v.vetro || m.vetro || "",
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
      id: gid(), descrizione: "", ambiente: "", tipologia: "", sistema: "",
      coloreInt: "", coloreEst: "", vetro: "", tipoPrezzo: "pezzo",
      tipoPrezzoLabel: "€/pezzo", larghezza: "", altezza: "", mq: 0,
      quantita: 1, prezzoUnitario: 0, totale: 0,
    }]);
  }

  function updateProdotto(i: number, field: string, value: any) {
    const n = [...prodotti];
    n[i] = { ...n[i], [field]: value };
    const p = n[i];
    if (field === "tipoPrezzo") {
      const labels: Record<string, string> = { mq: "€/mq", pezzo: "€/pezzo", listino: "Listino", manuale: "Manuale", griglia: "📊 Griglia", ml: "€/ml" };
      p.tipoPrezzoLabel = labels[value] || value;
    }
    // Always recalculate mq from dimensions
    const lm = parseFloat(String(p.larghezza)) || 0;
    const hm = parseFloat(String(p.altezza)) || 0;
    if (lm > 0 && hm > 0) {
      p.mq = parseFloat(((lm * hm) / 1000000).toFixed(4));
    } else {
      p.mq = 0;
    }
    // Always recalculate total as a NUMBER
    const prezzo = parseFloat(String(p.prezzoUnitario)) || 0;
    const qty = parseInt(String(p.quantita)) || 1;
    if (p.tipoPrezzo === "mq") {
      p.totale = parseFloat((prezzo * p.mq * qty).toFixed(2));
    } else if (p.tipoPrezzo === "manuale") {
      if (field === "totale") p.totale = parseFloat(String(value)) || 0;
      else p.totale = parseFloat(String(p.totale)) || 0;
    } else {
      p.totale = parseFloat((prezzo * qty).toFixed(2));
    }
    setProdotti(n);
  }

  function removeProdotto(i: number) {
    setProdotti(prodotti.filter((_: any, j: number) => j !== i));
  }

  function applyFromListino(prodIndex: number, listinoItem: any) {
    const n = [...prodotti];
    if(listinoItem.tipo === "griglia") {
      // For grid products, store the grid reference and let user enter dimensions
      n[prodIndex] = { ...n[prodIndex], descrizione: listinoItem.descrizione, tipoPrezzo: "griglia", tipoPrezzoLabel: "📊 Griglia", listinoGridId: listinoItem.id, listinoGrid: listinoItem.griglia, minimoFatt: listinoItem.minimoFatt || 0 };
      // If dimensions already exist, calculate price from grid
      const p = n[prodIndex];
      const l = parseFloat(p.larghezza) || 0;
      const h = parseFloat(p.altezza) || 0;
      if(l > 0 && h > 0 && listinoItem.griglia?.prezzi) {
        const g = listinoItem.griglia;
        const snapL = Math.round(l / g.stepL) * g.stepL;
        const snapH = Math.round(h / g.stepH) * g.stepH;
        const clampL = Math.max(g.minL, Math.min(g.maxL, snapL));
        const clampH = Math.max(g.minH, Math.min(g.maxH, snapH));
        const price = g.prezzi[`${clampL}x${clampH}`];
        if(price !== undefined) { p.prezzoUnitario = price; p.totale = price * (parseInt(p.quantita)||1); }
      }
    } else {
      n[prodIndex] = { ...n[prodIndex], descrizione: listinoItem.descrizione, prezzoUnitario: listinoItem.prezzo, tipoPrezzo: listinoItem.tipo || "pezzo", tipoPrezzoLabel: listinoItem.tipo === "mq" ? "€/mq" : listinoItem.tipo === "ml" ? "€/ml" : "€/pezzo", minimoFatt: listinoItem.minimoFatt || 0 };
      const p = n[prodIndex];
      const prezzo = parseFloat(p.prezzoUnitario) || 0;
      const qty = parseInt(p.quantita) || 1;
      p.totale = p.tipoPrezzo === "mq" ? prezzo * (p.mq || 0) * qty : prezzo * qty;
    }
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

  function calcProdTotale(p: any): number {
    const pr = parseFloat(String(p.prezzoUnitario))||0;
    const qt = parseInt(String(p.quantita))||1;
    const minFatt = parseFloat(String(p.minimoFatt))||0;
    if(p.tipoPrezzo==="griglia"){
      // For grid: price is per piece from grid, recalculate if dimensions changed
      const g = p.listinoGrid;
      if(g?.prezzi) {
        const l = parseFloat(String(p.larghezza))||0;
        const h = parseFloat(String(p.altezza))||0;
        if(l>0 && h>0) {
          const snapL = Math.round(l/g.stepL)*g.stepL;
          const snapH = Math.round(h/g.stepH)*g.stepH;
          const clampL = Math.max(g.minL,Math.min(g.maxL,snapL));
          const clampH = Math.max(g.minH,Math.min(g.maxH,snapH));
          const gridPrice = g.prezzi[`${clampL}x${clampH}`];
          if(gridPrice!==undefined) return Math.max(minFatt, parseFloat((gridPrice*qt).toFixed(2)));
        }
      }
      return Math.max(minFatt, parseFloat((pr*qt).toFixed(2)));
    }
    if(p.tipoPrezzo==="mq"){const mq=(parseFloat(String(p.larghezza))||0)*(parseFloat(String(p.altezza))||0)/1000000; return Math.max(minFatt, parseFloat((pr*mq*qt).toFixed(2)));}
    if(p.tipoPrezzo==="manuale") return Math.max(minFatt, parseFloat(String(p.totale))||0);
    return Math.max(minFatt, parseFloat((pr*qt).toFixed(2)));
  }
  const subtotale = prodotti.reduce((s: number, p: any) => s + calcProdTotale(p), 0);
  const scontoVal = subtotale * (sconto || 0) / 100;
  const imponibile = subtotale - scontoVal;
  const ivaVal = imponibile * (iva || 22) / 100;
  const totaleFinale = imponibile + ivaVal;

  const [listinoSearch, setListinoSearch] = useState("");
  const [listinoTarget, setListinoTarget] = useState(-1);
  const [importText, setImportText] = useState("");

  return (
    <div style={S.container}>
      <div style={{...S.secHdr,background:"#6b4c8a"}}>
        <button onClick={onBack} style={{...S.backBtn,color:"#fff"}}>← Indietro</button>
        <h2 style={{...S.secTitle,color:"#fff"}}> Preventivo</h2>
      </div>
      <div style={{padding:20}}>
        <div style={{...S.praticaRef,borderLeftColor:"#8b5cf6"}}>{pratica?.numero} · {client?.nome}</div>

        {/* Import da Misure */}
        {m?.vani?.length > 0 && prodotti.length === 0 && (
          <button onClick={importDaMisure} style={{...S.saveBtn,background:"#d97706",marginBottom:16}}>
             Importa {m.vani.length} vani dalle Misure
          </button>
        )}
        {m?.vani?.length > 0 && prodotti.length > 0 && (
          <button onClick={importDaMisure} style={{width:"100%",padding:10,borderRadius:2,border:"2px dashed #d97706",background:"transparent",color:"#d97706",fontSize:13,fontWeight:600,cursor:"pointer",marginBottom:12}}>
            + Importa altri vani dalle Misure
          </button>
        )}

        {/* Listino */}
        <div style={{display:"flex",gap:8,marginBottom:16}}>
          <button onClick={()=>setShowImport(!showImport)} style={{flex:1,padding:10,borderRadius:2,border:"1.5px solid #8b5cf6",background:"#f5f3ff",color:"#8b5cf6",fontSize:13,fontWeight:600,cursor:"pointer"}}>
             {listino.length > 0 ? `Listino (${listino.length})` : "Importa Listino"}
          </button>
          {listino.length > 0 && (
            <button onClick={()=>setShowListino(!showListino)} style={{flex:1,padding:10,borderRadius:2,border:"1.5px solid #059669",background:"#ecfdf5",color:"#059669",fontSize:13,fontWeight:600,cursor:"pointer"}}>
               Sfoglia Listino
            </button>
          )}
        </div>

        {/* Import Listino Modal */}
        {showImport && (
          <div style={{background:"#f5f3ff",borderRadius:2,padding:14,marginBottom:16,border:"1.5px solid #8b5cf6"}}>
            <h4 style={{fontSize:14,fontWeight:700,color:"#8b5cf6",margin:"0 0 8px"}}> Importa Listino Prezzi</h4>
            <p style={{fontSize:12,color:"#64748b",margin:"0 0 8px"}}>Incolla da Excel o scrivi una riga per prodotto nel formato:<br/><strong>Descrizione;Prezzo;Tipo</strong> (tipo = mq o pezzo)</p>
            <textarea value={importText} onChange={(e: any) => setImportText(e.target.value)} placeholder={"Finestra 2 ante PVC;350;pezzo\nPortoncino blindato;800;pezzo\nSerramento alluminio;280;mq"} style={{...S.textarea,minHeight:100,fontSize:13}} />
            <div style={{display:"flex",gap:8,marginTop:8}}>
              <button onClick={() => importListino(importText)} style={{flex:1,padding:10,borderRadius:2,background:"#8b5cf6",color:"#fff",border:"none",fontWeight:700,cursor:"pointer"}}>✓ Importa</button>
              <button onClick={() => setShowImport(false)} style={{padding:10,borderRadius:2,background:"#f1f5f9",color:"#64748b",border:"none",fontWeight:600,cursor:"pointer"}}>Annulla</button>
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
            
            {/* INLINE SISTEMA / COLORE / TIPOLOGIA */}
            <div style={{background:"#faf5ff",borderRadius:2,padding:10,marginBottom:8,border:"1px solid #e9d5ff"}}>
              <div style={{display:"flex",gap:8,marginBottom:6}}>
                <div style={{flex:1}}><label style={{...S.fLabel,fontSize:10}}>Sistema</label><select value={p.sistema||""} onChange={(e: any)=>updateProdotto(i,"sistema",e.target.value)} style={{...S.input,fontSize:12,padding:"8px 10px"}}><option value="">—</option>{(userSistemi||[]).map((s: any)=><option key={s.id} value={s.nome}>{s.icon} {s.nome}</option>)}</select></div>
                <div style={{flex:1}}><label style={{...S.fLabel,fontSize:10}}>Tipologia</label><select value={p.tipologia||""} onChange={(e: any)=>updateProdotto(i,"tipologia",e.target.value)} style={{...S.input,fontSize:12,padding:"8px 10px"}}><option value="">—</option>{DEFAULT_TIPOLOGIE.map((t: string)=><option key={t}>{t}</option>)}</select></div>
              </div>
              <div style={{display:"flex",gap:8}}>
                <div style={{flex:1}}><label style={{...S.fLabel,fontSize:10}}>Colore Int.</label><input value={p.coloreInt||""} onChange={(e: any)=>updateProdotto(i,"coloreInt",e.target.value)} placeholder="es. Bianco RAL 9010" style={{...S.input,fontSize:12,padding:"8px 10px"}} /></div>
                <div style={{flex:1}}><label style={{...S.fLabel,fontSize:10}}>Colore Est.</label><input value={p.coloreEst||""} onChange={(e: any)=>updateProdotto(i,"coloreEst",e.target.value)} placeholder="es. Grigio RAL 7016" style={{...S.input,fontSize:12,padding:"8px 10px"}} /></div>
              </div>
              <div style={{marginTop:6}}><label style={{...S.fLabel,fontSize:10}}>VETRO</label><input value={p.vetro||""} onChange={(e: any)=>updateProdotto(i,"vetro",e.target.value)} placeholder="es. 4/16/4 Basso Emissivo" style={{...S.input,fontSize:12,padding:"8px 10px"}} /></div>
            </div>
            
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
                <div style={{flex:"0 0 70px"}}><label style={S.fLabel}>MQ</label><div style={{...S.input,background:"#f8fafc",color:"#059669",fontWeight:700}}>{((parseFloat(String(p.larghezza))||0)*(parseFloat(String(p.altezza))||0)/1000000).toFixed(2)}</div></div>
              </div>
            )}

            {/* Dimensioni per griglia L×H */}
            {p.tipoPrezzo === "griglia" && p.listinoGrid && (
              <div>
                <div style={{display:"flex",gap:8}}>
                  <Field label="L (mm)" value={p.larghezza} onChange={(v: string) => updateProdotto(i, "larghezza", v)} type="number" placeholder="Larg." style={{flex:1}} />
                  <Field label="H (mm)" value={p.altezza} onChange={(v: string) => updateProdotto(i, "altezza", v)} type="number" placeholder="Alt." style={{flex:1}} />
                  <div style={{flex:"0 0 100px"}}><label style={S.fLabel}>Prezzo</label><div style={{...S.input,background:"#f5f3ff",color:"#8b5cf6",fontWeight:800,fontSize:14}}>
                    {(()=>{const g=p.listinoGrid;const l=parseFloat(String(p.larghezza))||0;const h=parseFloat(String(p.altezza))||0;if(l>0&&h>0&&g?.prezzi){const sL=Math.round(l/g.stepL)*g.stepL;const sH=Math.round(h/g.stepH)*g.stepH;const cL=Math.max(g.minL,Math.min(g.maxL,sL));const cH=Math.max(g.minH,Math.min(g.maxH,sH));const pr=g.prezzi[`${cL}x${cH}`];return pr!==undefined?`€${pr.toFixed(2)}`:"—";}return "—";})()}
                  </div></div>
                </div>
                {p.minimoFatt > 0 && <div style={{fontSize:10,color:"#d97706",marginTop:2}}>Minimo fatturazione: €{p.minimoFatt}</div>}
              </div>
            )}

            <div style={{display:"flex",gap:8}}>
              <Field label="Quantità" value={p.quantita} onChange={(v: string) => updateProdotto(i, "quantita", v)} type="number" style={{flex:"0 0 80px"}} />
              <Field label={p.tipoPrezzo === "mq" ? "Prezzo €/mq" : p.tipoPrezzo === "griglia" ? "Prezzo (da griglia)" : "Prezzo €/pz"} value={p.prezzoUnitario} onChange={(v: string) => updateProdotto(i, "prezzoUnitario", v)} type="number" placeholder="0.00" style={{flex:1}} />
              <div style={{flex:"0 0 100px"}}><label style={S.fLabel}>Totale</label><div style={{...S.input,background:"#ecfdf5",color:"#059669",fontWeight:800,fontSize:16}}>€ {calcProdTotale(p).toFixed(2)}</div></div>
            </div>
          </div>
        ))}

        <div style={{display:"flex",gap:8,marginBottom:16}}>
          <button onClick={addProdotto} style={{...S.addVanoBtn,borderColor:"#8b5cf6",color:"#8b5cf6",flex:1}}>+ Aggiungi Prodotto</button>
        </div>

        {/* Listino Browser */}
        {showListino && listino.length > 0 && (
          <div style={{background:"#f5f3ff",borderRadius:2,padding:14,marginBottom:16,border:"1.5px solid #8b5cf6"}}>
            <h4 style={{fontSize:14,fontWeight:700,color:"#8b5cf6",margin:"0 0 8px"}}> Listino Prezzi ({listino.length} prodotti)</h4>
            <input value={listinoSearch} onChange={(e: any) => setListinoSearch(e.target.value)} placeholder=" Cerca nel listino..." style={{...S.searchInp,marginBottom:8}} />
            <div style={{maxHeight:250,overflowY:"auto"}}>
              {listino.filter((l: any) => !listinoSearch || l.descrizione.toLowerCase().includes(listinoSearch.toLowerCase())).map((l: any) => (
                <button key={l.id} onClick={() => {
                  if (listinoTarget >= 0) { applyFromListino(listinoTarget, l); setListinoTarget(-1); }
                  else if (prodotti.length > 0) { applyFromListino(prodotti.length - 1, l); }
                }} style={{display:"flex",justifyContent:"space-between",alignItems:"center",width:"100%",padding:"8px 10px",background:"#fff",borderRadius:2,border:"1px solid #e2e8f0",marginBottom:4,cursor:"pointer",textAlign:"left"}}>
                  <span style={{fontSize:13,fontWeight:600,color:"#0f172a"}}>{l.descrizione}</span>
                  <span style={{fontSize:14,fontWeight:700,color:l.tipo==="griglia"?"#8b5cf6":"#059669"}}>{l.tipo==="griglia"?"📊 Griglia":`€ ${(parseFloat(l.prezzo)||0).toFixed(2)}/${l.tipo||"pz"}`}</span>
                </button>
              ))}
            </div>
            <button onClick={() => { setShowListino(false); setListinoTarget(-1); }} style={{marginTop:8,padding:"8px 16px",borderRadius:2,background:"#f1f5f9",border:"none",color:"#64748b",fontWeight:600,cursor:"pointer",width:"100%"}}>Chiudi Listino</button>
          </div>
        )}

        {/* Riepilogo Totali */}
        {prodotti.length > 0 && (
          <div style={{background:"#fff",borderRadius:2,padding:16,border:"2px solid #8b5cf6",marginBottom:16}}>
            <h4 style={{fontSize:15,fontWeight:700,color:"#8b5cf6",margin:"0 0 12px"}}> Riepilogo</h4>
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

        <button onClick={() => {
          // Recalculate all totals before saving
          const fixedProdotti = prodotti.map((p: any) => ({...p, mq: (parseFloat(String(p.larghezza))||0)*(parseFloat(String(p.altezza))||0)/1000000, totale: calcProdTotale(p)}));
          const sub = fixedProdotti.reduce((s: number, p: any) => s + (p.totale || 0), 0);
          const sv = sub * (sconto || 0) / 100;
          const imp = sub - sv;
          const iv = imp * (iva || 22) / 100;
          const tf = imp + iv;
          onSave({ prodotti: fixedProdotti, sconto, iva, condizioni, validita, noteP, listino, totaleFinale: parseFloat(tf.toFixed(2)) });
        }} style={{...S.saveBtn,background:"#6b4c8a"}}> Salva Preventivo</button>
        {pratica?.preventivo && (
          <div style={{display:"flex",gap:8,marginTop:8}}>
            <button onClick={() => exportPreventivo(pratica, client, true)} style={{...S.saveBtn,background:"#fff",color:"#8b5cf6",border:"2px solid #8b5cf6",boxShadow:"none",flex:1}}> Dettagliato</button>
            <button onClick={() => exportPreventivo(pratica, client, false)} style={{...S.saveBtn,background:"#fff",color:"#8b5cf6",border:"2px solid #8b5cf6",boxShadow:"none",flex:1}}> Solo Totale</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ==================== EMAIL VIEW ====================
function EmailView({ pratica, client, settings, onSend, onBack }: any) {
  const [dest, setDest] = useState(client?.email||"");
  // Smart subject based on current fase
  const fase = pratica?.fase || "sopralluogo";
  const smartSubjects: Record<string,string> = {
    sopralluogo: `Sopralluogo - Pratica ${pratica?.numero}`,
    misure: `Misure - Pratica ${pratica?.numero}`,
    preventivo: `Preventivo - Pratica ${pratica?.numero}`,
    conferma: `Conferma d'Ordine - Pratica ${pratica?.numero}`,
    fattura: `Fattura${pratica?.fattura?.numero?" "+pratica.fattura.numero:""} - Pratica ${pratica?.numero}`,
    posa: `Posa in Opera - Pratica ${pratica?.numero}`,
    riparazione: `Riparazione - Pratica ${pratica?.numero}`,
  };
  const [oggetto, setOggetto] = useState(smartSubjects[fase] || `Pratica ${pratica?.numero} - ${client?.nome||""}`);
  const firma = settings?.nomeAzienda ? `\n\n${settings.nomeAzienda}${settings.telefonoAzienda?"\nTel: "+settings.telefonoAzienda:""}${settings.emailAzienda?"\n"+settings.emailAzienda:""}` : "\n\nCordiali saluti";
  const [corpo, setCorpo] = useState(`Gentile ${client?.nome||"Cliente"},\n\nIn riferimento alla pratica ${pratica?.numero}${pratica?.indirizzo?` per l'immobile in ${pratica.indirizzo}`:""}, Le comunichiamo che...\n${firma}`);
  
  // Detect what PDF can be attached
  const allPdfs = [
    { icon: "", label: "Misure", available: !!pratica?.misure, action: () => exportMisure(pratica, client) },
    { icon: "", label: "Preventivo", available: !!pratica?.preventivo, action: () => exportPreventivo(pratica, client, true) },
    { icon: "", label: "Conferma Ordine", available: !!pratica?.confermaOrdine?.firmata, action: () => exportConfermaOrdine(pratica, client) },
    { icon: "", label: "Fattura", available: !!pratica?.fattura, action: () => exportFattura(pratica, client) },
    { icon: "", label: "Riparazione", available: !!pratica?.riparazione, action: () => exportRiparazione(pratica, client) },
    { icon: "", label: "Riepilogo", available: true, action: () => exportPratica(pratica, client) },
  ];

  const cNome = client?.nome || "Cliente";
  const templates = [
    { l: " Conferma Appuntamento", s: `Appuntamento Sopralluogo - Pratica ${pratica?.numero}`, t: `Gentile ${cNome},\n\nLe confermiamo l'appuntamento per il giorno ${dateLabel(pratica?.data)} alle ore ${pratica?.ora}${pratica?.indirizzo?` presso ${pratica.indirizzo}`:""}.\n\nPer qualsiasi necessità non esiti a contattarci.\n${firma}` },
    { l: " Invio Preventivo", s: `Preventivo - Pratica ${pratica?.numero}`, t: `Gentile ${cNome},\n\nIn allegato trova il preventivo relativo alla pratica ${pratica?.numero}.\n\nIl preventivo ha validità 30 giorni.\n\nRestiamo a disposizione per chiarimenti.\n${firma}` },
    { l: " Conferma Ordine", s: `Conferma d'Ordine - Pratica ${pratica?.numero}`, t: `Gentile ${cNome},\n\nLe confermiamo che l'ordine (pratica ${pratica?.numero}) è stato inoltrato al produttore.\n\nIn allegato trova la conferma d'ordine firmata.\n\nTempi di consegna stimati: circa [X] settimane.\n${firma}` },
    { l: " Invio Fattura", s: `Fattura${pratica?.fattura?.numero?" "+pratica.fattura.numero:""} - Pratica ${pratica?.numero}`, t: `Gentile ${cNome},\n\nIn allegato trova la fattura relativa alla pratica ${pratica?.numero}.\n\nModalità di pagamento: [specificare].\n${firma}` },
    { l: " Data Posa", s: `Posa in Opera - Pratica ${pratica?.numero}`, t: `Gentile ${cNome},\n\nLa posa in opera (pratica ${pratica?.numero}) è programmata per il giorno [DATA] alle ore [ORA].\n\nLa preghiamo di assicurarsi che l'accesso sia libero.\n${firma}` },
    { l: " Lavoro Completato", s: `Lavoro Completato - Pratica ${pratica?.numero}`, t: `Gentile ${cNome},\n\nLe comunichiamo che i lavori relativi alla pratica ${pratica?.numero} sono stati completati.\n\nPer qualsiasi segnalazione non esiti a contattarci.\n${firma}` },
  ];
  return (
    <div style={S.container}>
      <div style={{...S.secHdr,background:"#3a7bd5"}}><button onClick={onBack} style={{...S.backBtn,color:"#fff"}}>← Indietro</button><h2 style={{...S.secTitle,color:"#fff"}}> Email</h2></div>
      <div style={{padding:20}}>
        <div style={{...S.praticaRef,borderLeftColor:"#3a7bd5"}}>{pratica?.numero} · {client?.nome||"Cliente"}</div>
        <div style={S.fGroup}><label style={S.fLabel}>Template Rapidi</label><div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{templates.map((t,i)=><button key={i} onClick={()=>{setOggetto(t.s);setCorpo(t.t);}} style={S.templateBtn}>{t.l}</button>)}</div></div>
        <Field label="Destinatario" value={dest} onChange={setDest} placeholder="email@esempio.it" type="email" />
        <Field label="Oggetto" value={oggetto} onChange={setOggetto} placeholder="Oggetto email" />
        <div style={S.fGroup}><label style={S.fLabel}>Messaggio</label><textarea value={corpo} onChange={(e: any)=>setCorpo(e.target.value)} style={{...S.textarea,minHeight:200}} /></div>
        <div style={{marginBottom:16,padding:14,background:"#f8fafc",borderRadius:2,border:"1.5px solid #e2e8f0"}}>
          <label style={{fontSize:12,fontWeight:800,color:"#374151",textTransform:"uppercase",display:"block",marginBottom:8}}> Genera PDF da allegare</label>
          <p style={{fontSize:11,color:"#94a3b8",margin:"0 0 8px"}}>Genera il PDF, poi allegalo manualmente nella tua app email</p>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {allPdfs.map((a,i) => (
              <button key={i} onClick={a.available ? a.action : undefined} disabled={!a.available} style={{padding:"8px 14px",borderRadius:2,border:a.available?"1.5px solid #3a7bd5":"1.5px solid #d1d5db",background:a.available?"#f5f3ff":"#f3f4f6",color:a.available?"#3a7bd5":"#94a3b8",fontSize:12,fontWeight:700,cursor:a.available?"pointer":"default",opacity:a.available?1:0.5}}>{a.icon} {a.label}{!a.available?" ⛔":""}</button>
            ))}
          </div>
        </div>
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
function NoteEditor({ note, pratiche, clients, onSave, onBack }: any) {
  const [testo, setTesto] = useState(note?.testo||"");
  const [colore, setColore] = useState(note?.colore||"#fffbeb");
  const [praticaId, setPraticaId] = useState(note?.praticaId||"");
  const colors = ["#fffbeb","#ecfdf5","#eff6ff","#fef2f2","#f5f3ff","#fff7ed"];
  const getClientName = (cId: string) => (clients||[]).find((c: any)=>c.id===cId)?.nome||"";
  return (
    <div style={S.container}>
      <div style={S.secHdr}><button onClick={onBack} style={S.backBtn}>← Annulla</button><h2 style={S.secTitle}>{note?.id?"Modifica":"Nuova"} Nota</h2></div>
      <div style={{padding:20}}>
        <div style={S.fGroup}><label style={S.fLabel}>Colore</label><div style={{display:"flex",gap:8}}>{colors.map(c=><button key={c} onClick={()=>setColore(c)} style={{width:36,height:36,borderRadius:2,background:c,border:colore===c?"3px solid #2563eb":"2px solid #d1d5db",cursor:"pointer"}} />)}</div></div>
        <div style={S.fGroup}><label style={S.fLabel}> Collega a Pratica (opzionale)</label>
          <select value={praticaId} onChange={(e: any)=>setPraticaId(e.target.value)} style={S.input}>
            <option value="">— Nessuna pratica —</option>
            {(pratiche||[]).map((p: any)=><option key={p.id} value={p.id}>{p.numero} · {getClientName(p.clientId)}</option>)}
          </select>
        </div>
        <div style={S.fGroup}><label style={S.fLabel}>Nota</label><textarea value={testo} onChange={(e: any)=>setTesto(e.target.value)} placeholder="Scrivi la tua nota..." style={{...S.textarea,minHeight:200,background:colore}} autoFocus /></div>
        <button onClick={()=>onSave({...note,testo,colore,praticaId})} style={S.saveBtn}> Salva Nota</button>
      </div>
    </div>
  );
}

// ==================== SHARED ====================
// ==================== PHOTO CAPTURE ====================
function PhotoCapture({ url, label, icon, onCapture, onDelete }: any) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const handleFile = async (e: any) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try { await onCapture(file); } catch(err) { console.error(err); }
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
  };
  if (url) return (
    <div style={{position:"relative",width:76,height:76,borderRadius:2,overflow:"hidden",border:"2.5px solid #059669",flexShrink:0}}>
      <img src={url} alt={label} style={{width:"100%",height:"100%",objectFit:"cover"}} />
      <button onClick={(e)=>{e.stopPropagation();onDelete?.();}} style={{position:"absolute",top:2,right:2,width:22,height:22,borderRadius:"50%",background:"rgba(0,0,0,0.6)",border:"none",color:"#fff",fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
      <div style={{position:"absolute",bottom:0,left:0,right:0,background:"rgba(0,0,0,0.55)",padding:"2px 0",textAlign:"center"}}><span style={{fontSize:8,fontWeight:700,color:"#fff",textTransform:"uppercase"}}>{label}</span></div>
    </div>
  );
  return (
    <div>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" onChange={handleFile} style={{display:"none"}} />
      <button onClick={()=>inputRef.current?.click()} disabled={uploading} style={{width:76,height:76,borderRadius:2,border:"2.5px dashed #cbd5e1",background:uploading?"#f1f5f9":"#f8fafc",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2,cursor:uploading?"wait":"pointer",opacity:uploading?0.6:1}}>
        {uploading ? <span style={{fontSize:18}}>⏳</span> : <span style={{fontSize:16}}>{icon||"📷"}</span>}
        <span style={{fontSize:8,fontWeight:700,color:"#94a3b8",textTransform:"uppercase"}}>{uploading?"Carico...":label}</span>
      </button>
    </div>
  );
}

// Photo gallery for a phase (sopralluogo, posa, riparazione)
function PhotoGallery({ photos, label, userId, folder, onUpdate }: any) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const photoList: string[] = photos || [];
  const handleFiles = async (e: any) => {
    const files = Array.from(e.target.files || []) as File[];
    if (!files.length) return;
    setUploading(true);
    const newPhotos = [...photoList];
    for (const file of files) {
      const url = await uploadPhotoToStorage(file, userId, folder);
      if (url) newPhotos.push(url);
    }
    onUpdate(newPhotos);
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
  };
  const removePhoto = async (idx: number) => {
    const url = photoList[idx];
    if (url) await deletePhotoFromStorage(url);
    const updated = photoList.filter((_: any, i: number) => i !== idx);
    onUpdate(updated);
  };
  return (
    <div style={{marginBottom:16}}>
      <label style={{fontSize:12,fontWeight:800,color:"#374151",textTransform:"uppercase",letterSpacing:"0.5px",display:"block",marginBottom:8}}>{label}</label>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
        {photoList.map((url: string, i: number) => (
          <div key={i} style={{position:"relative",width:76,height:76,borderRadius:2,overflow:"hidden",border:"2.5px solid #059669"}}>
            <img src={url} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}} />
            <button onClick={()=>removePhoto(i)} style={{position:"absolute",top:2,right:2,width:22,height:22,borderRadius:"50%",background:"rgba(0,0,0,0.6)",border:"none",color:"#fff",fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
          </div>
        ))}
        <div>
          <input ref={inputRef} type="file" accept="image/*" capture="environment" multiple onChange={handleFiles} style={{display:"none"}} />
          <button onClick={()=>inputRef.current?.click()} disabled={uploading} style={{width:76,height:76,borderRadius:2,border:"2.5px dashed #cbd5e1",background:uploading?"#f1f5f9":"#f8fafc",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2,cursor:uploading?"wait":"pointer"}}>
            {uploading ? <span style={{fontSize:18}}>⏳</span> : <span style={{fontSize:22}}>📷</span>}
            <span style={{fontSize:9,fontWeight:700,color:"#94a3b8"}}>{uploading?"Carico...":"+ Foto"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type, style, autoFocus, textarea, rows }: any) {
  return (<div style={{...S.fGroup,...style}}><label style={S.fLabel}>{label}</label>
    {textarea ? <textarea value={value} onChange={(e: any)=>onChange(e.target.value)} placeholder={placeholder} style={S.textarea} rows={rows||3} />
    : <input type={type||"text"} value={value} onChange={(e: any)=>onChange(e.target.value)} placeholder={placeholder} style={S.input} autoFocus={autoFocus} />}</div>);
}
function InfoRow({ icon, val }: any) { return <div style={{display:"flex",alignItems:"flex-start",gap:10}}><span style={{fontSize:16,width:24,textAlign:"center",flexShrink:0}}>{icon}</span><span style={{fontSize:15,color:"#374151",lineHeight:1.4}}>{val}</span></div>; }
function TaskRow({ task, onToggle, onDelete, small }: any) {
  const handleToggle = (e: any) => {
    const el = e.currentTarget.closest("[data-task-id]");
    onToggle();
    // If marking as done, scroll to next undone
    if (!task.done && el) {
      scrollToNextUndone(el);
    }
  };
  return (<div data-task-id={task.id} data-task-done={String(task.done)} style={{display:"flex",alignItems:"center",gap:10,padding:small?"7px 10px":"10px 12px",borderRadius:2,marginBottom:4,border:task.done?"1px solid #bbf7d0":"2px solid #e2e8f0",background:task.done?"#f0fdf4":"#fff",transition:"all 0.3s ease"}}>
    <button onClick={handleToggle} style={{width:small?24:28,height:small?24:28,borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:14,fontWeight:700,flexShrink:0,background:task.done?"#059669":"#fff",border:task.done?"2px solid #059669":"2px solid #d1d5db",color:task.done?"#fff":"transparent",transition:"all 0.2s"}}>✓</button>
    <span style={{flex:1,fontSize:small?13:14,textDecoration:task.done?"line-through":"none",color:task.done?"#9ca3af":"#1f2937",transition:"all 0.3s"}}>{task.text}</span>
    {onDelete && <button onClick={onDelete} style={{background:"none",border:"none",color:"#ef4444",fontSize:16,cursor:"pointer",padding:"2px 4px",opacity:0.6}}>×</button>}
  </div>);
}
function ProgressBar({ progress, done, total, small }: any) {
  return (<div style={{marginBottom:small?6:12,background:"#f8fafc",borderRadius:2,padding:small?"6px 10px":"10px 14px"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}><span style={{fontSize:small?12:14,fontWeight:600,color:"#374151"}}>Progresso</span><span style={{fontSize:small?13:16,fontWeight:800,color:progress===100?"#059669":"#2563eb"}}>{progress}%</span></div>
    <div style={{height:small?5:8,background:"#e2e8f0",borderRadius:2,overflow:"hidden"}}><div style={{height:"100%",borderRadius:2,width:`${progress}%`,background:progress===100?"#059669":"#2563eb",transition:"width 0.4s"}} /></div>
    <span style={{fontSize:11,color:"#64748b"}}>{done}/{total}</span></div>);
}

// ==================== STYLES ====================
// ==================== THEMES ====================
const THEMES: Record<string, {name:string;emoji:string;bg:string;headerBg:string;primary:string;primaryLight:string;primaryGrad:string;secondary:string;secondaryLight:string;secondaryGrad:string;accent:string;accentGrad:string;cardShadow:string;loadBg:string}> = {
  classic: { name:"Acciaio",emoji:"",bg:"#f0f1f3",headerBg:"#1a1a2e",primary:"#e07a2f",primaryLight:"#fdf3eb",primaryGrad:"#e07a2f",secondary:"#3a7bd5",secondaryLight:"#eaf1fb",secondaryGrad:"#3a7bd5",accent:"#e07a2f",accentGrad:"#e07a2f",cardShadow:"0 1px 3px rgba(0,0,0,0.08)",loadBg:"#1a1a2e" },
  ocean: { name:"Cantiere",emoji:"",bg:"#eef1f5",headerBg:"#0d1b2a",primary:"#1b9aaa",primaryLight:"#e8f6f8",primaryGrad:"#1b9aaa",secondary:"#d4820e",secondaryLight:"#fef6e8",secondaryGrad:"#d4820e",accent:"#1b9aaa",accentGrad:"#1b9aaa",cardShadow:"0 1px 3px rgba(0,0,0,0.08)",loadBg:"#0d1b2a" },
  forest: { name:"Officina",emoji:"",bg:"#f2f3f0",headerBg:"#1b2a1b",primary:"#2d8a4e",primaryLight:"#edf5f0",primaryGrad:"#2d8a4e",secondary:"#8a6d2d",secondaryLight:"#f8f3ea",secondaryGrad:"#8a6d2d",accent:"#2d8a4e",accentGrad:"#2d8a4e",cardShadow:"0 1px 3px rgba(0,0,0,0.08)",loadBg:"#1b2a1b" },
  midnight: { name:"Notte",emoji:"",bg:"#111318",headerBg:"#0a0c10",primary:"#6c8aec",primaryLight:"#1a1d28",primaryGrad:"#6c8aec",secondary:"#e07a5f",secondaryLight:"#1f1a18",secondaryGrad:"#e07a5f",accent:"#6c8aec",accentGrad:"#6c8aec",cardShadow:"0 1px 4px rgba(0,0,0,0.4)",loadBg:"#0a0c10" },
  rose: { name:"Rame",emoji:"",bg:"#f3f0ef",headerBg:"#2a1a1b",primary:"#c45a3c",primaryLight:"#f8efec",primaryGrad:"#c45a3c",secondary:"#6b4c8a",secondaryLight:"#f1ecf5",secondaryGrad:"#6b4c8a",accent:"#c45a3c",accentGrad:"#c45a3c",cardShadow:"0 1px 3px rgba(0,0,0,0.08)",loadBg:"#2a1a1b" },
  gold: { name:"Ottone",emoji:"",bg:"#f5f2ec",headerBg:"#2a2214",primary:"#b8860b",primaryLight:"#f9f5ec",primaryGrad:"#b8860b",secondary:"#5a4a2a",secondaryLight:"#f2efe8",secondaryGrad:"#5a4a2a",accent:"#b8860b",accentGrad:"#b8860b",cardShadow:"0 1px 3px rgba(0,0,0,0.08)",loadBg:"#2a2214" },
};

function getThemeStyles(themeKey: string): Record<string, React.CSSProperties> {
  const t = THEMES[themeKey] || THEMES.classic;
  const isDark = themeKey === "midnight";
  const cardBg = isDark ? "#1c1f26" : "#fff";
  const textPrimary = isDark ? "#d4d8e0" : "#1a1a2e";
  const textSecondary = isDark ? "#7a8194" : "#5c6370";
  const borderColor = isDark ? "#2a2e38" : "#d5d8de";
  const inputBg = isDark ? "#14161c" : "#fafbfc";
  const inputBorder = isDark ? "#3a3f4c" : "#cdd1d8";
  const mono = "'JetBrains Mono','SF Mono','Cascadia Code','Fira Code',monospace";
  const sans = "'DM Sans','Segoe UI',system-ui,-apple-system,sans-serif";
  return {
  container:{maxWidth:540,width:"100%",margin:"0 auto",minHeight:"100vh",background:t.bg,fontFamily:sans,paddingBottom:72,color:textPrimary,overflowX:"hidden" as any},
  loadWrap:{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:t.loadBg},
  header:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 12px",background:t.headerBg,color:"#fff",borderBottom:`3px solid ${t.primary}`,flexWrap:"wrap" as any,gap:8},
  logo:{fontSize:20,fontWeight:800,margin:0,letterSpacing:"1px",textTransform:"uppercase",fontFamily:mono,color:t.accent},
  subtitle:{fontSize:9,color:"rgba(255,255,255,0.4)",margin:"2px 0 0",letterSpacing:"3px",textTransform:"uppercase",fontWeight:600,fontFamily:mono},
  addBtn:{background:t.primary,color:"#fff",border:"none",borderRadius:2,padding:"10px 18px",fontSize:13,fontWeight:700,cursor:"pointer",letterSpacing:"0.5px",textTransform:"uppercase",fontFamily:mono},
  greetCard:{background:cardBg,borderRadius:2,padding:"18px",marginBottom:12,border:`1px solid ${borderColor}`,boxShadow:t.cardShadow},
  dashStats:{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,marginBottom:14},
  dashStat:{display:"flex",flexDirection:"column",alignItems:"center",gap:2,background:cardBg,borderRadius:2,padding:"10px 2px",border:`1px solid ${borderColor}`,cursor:"pointer",boxShadow:t.cardShadow,transition:"border-color 0.15s",minWidth:0,overflow:"hidden" as any},
  alertCard:{display:"flex",alignItems:"center",gap:12,background:isDark?"#2a1a1a":"#fef2f2",borderRadius:2,padding:"12px 16px",marginBottom:12,borderLeft:`4px solid #dc2626`,boxShadow:t.cardShadow},
  dashSection:{marginBottom:18},
  dashSectionTitle:{fontSize:11,fontWeight:700,color:textSecondary,margin:"0 0 10px",letterSpacing:"2px",textTransform:"uppercase",fontFamily:mono},
  dashEmpty:{fontSize:13,color:textSecondary,margin:"4px 0"},
  appointCard:{display:"flex",alignItems:"center",gap:12,width:"100%",textAlign:"left",padding:"12px 16px",background:cardBg,borderRadius:2,border:`1px solid ${borderColor}`,marginBottom:8,cursor:"pointer",boxShadow:t.cardShadow,transition:"border-color 0.15s"},
  appointTime:{padding:"8px 12px",borderRadius:2,fontSize:13,fontWeight:700,flexShrink:0,fontFamily:mono},
  taskDashRow:{display:"flex",alignItems:"center",gap:10,padding:"10px 16px",background:cardBg,borderRadius:2,border:`1px solid ${borderColor}`,marginBottom:6,boxShadow:t.cardShadow},
  taskCheck:{width:24,height:24,borderRadius:2,border:`2px solid ${borderColor}`,background:inputBg,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:13,color:borderColor,flexShrink:0,transition:"all 0.15s"},
  emailDashCard:{background:cardBg,borderRadius:2,padding:"10px 16px",border:`1px solid ${borderColor}`,marginBottom:6,boxShadow:t.cardShadow},
  noteCard:{display:"block",width:"100%",textAlign:"left",borderRadius:2,padding:"12px 16px",border:`1px solid ${borderColor}`,marginBottom:8,cursor:"pointer",boxShadow:t.cardShadow},
  addNoteBtn:{width:34,height:34,borderRadius:2,background:t.primary,color:"#fff",border:"none",fontSize:18,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"},
  bottomNav:{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:540,display:"flex",background:isDark?"#1c1f26":"#fff",borderTop:`2px solid ${t.primary}`,padding:"6px 0 calc(4px + env(safe-area-inset-bottom, 0px))",zIndex:100,overflow:"hidden" as any},
  navItem:{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:1,background:"none",border:"none",cursor:"pointer",padding:"2px 0",transition:"all 0.15s",minWidth:0,overflow:"hidden" as any},
  stats:{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,padding:"14px 16px 10px"},
  statCard:{display:"flex",flexDirection:"column",alignItems:"center",gap:4,background:cardBg,borderRadius:2,padding:"12px 4px",border:`1px solid ${borderColor}`,cursor:"pointer",boxShadow:t.cardShadow},
  statNum:{fontSize:22,fontWeight:800,color:textPrimary,fontFamily:mono},
  statLbl:{fontSize:9,color:textSecondary,textTransform:"uppercase",fontWeight:700,letterSpacing:"1px",fontFamily:mono},
  searchInp:{width:"100%",padding:"12px 16px",borderRadius:2,border:`2px solid ${inputBorder}`,fontSize:14,color:textPrimary,outline:"none",boxSizing:"border-box",background:inputBg,transition:"border-color 0.15s",fontFamily:sans},
  praticaCard:{display:"block",width:"100%",textAlign:"left",background:cardBg,borderRadius:2,padding:"16px 18px",marginBottom:10,border:`1px solid ${borderColor}`,cursor:"pointer",boxShadow:t.cardShadow,transition:"border-color 0.15s"},
  praticaTop:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6},
  praticaNum:{fontSize:12,fontWeight:700,color:t.secondary,background:t.secondaryLight,padding:"3px 10px",borderRadius:2,fontFamily:mono},
  praticaStatus:{fontSize:10,fontWeight:700,padding:"4px 12px",borderRadius:2,letterSpacing:"0.5px",textTransform:"uppercase",fontFamily:mono},
  praticaCliente:{fontSize:16,fontWeight:800,color:textPrimary,margin:"6px 0 2px"},
  praticaAddr:{fontSize:12,color:textSecondary,margin:"2px 0 0",fontWeight:500},
  praticaMeta:{display:"flex",alignItems:"center",gap:8,marginTop:8},
  praticaActions:{fontSize:10,fontWeight:700,color:t.secondary,background:t.secondaryLight,padding:"3px 10px",borderRadius:2,fontFamily:mono},
  progRow:{display:"flex",alignItems:"center",gap:8,marginTop:8},
  progBar:{flex:1,height:5,background:borderColor,borderRadius:0,overflow:"hidden"},
  progFill:{height:"100%",borderRadius:0,transition:"width 0.3s ease"},
  empty:{textAlign:"center",padding:"50px 20px"},
  emptyTitle:{fontSize:17,fontWeight:800,color:textPrimary,margin:"12px 0 6px"},
  emptySub:{fontSize:13,color:textSecondary,fontWeight:500},
  emptyMini:{textAlign:"center",padding:"30px 20px",fontSize:13,color:textSecondary,fontWeight:500},
  clientRow:{display:"flex",alignItems:"center",gap:12,width:"100%",padding:"14px 16px",background:cardBg,borderRadius:2,border:`1px solid ${borderColor}`,marginBottom:8,cursor:"pointer",textAlign:"left",boxShadow:t.cardShadow,transition:"border-color 0.15s"},
  clientCard:{display:"flex",alignItems:"center",gap:12,padding:"14px 16px",background:cardBg,borderRadius:2,border:`1px solid ${borderColor}`,marginBottom:8,boxShadow:t.cardShadow},
  clientAvatar:{width:42,height:42,borderRadius:2,background:t.primary,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:800,flexShrink:0,fontFamily:mono},
  clientCount:{fontSize:20,fontWeight:800,color:t.primary,fontFamily:mono},
  clientBox:{display:"flex",alignItems:"center",gap:12,background:cardBg,borderRadius:2,padding:"14px 16px",marginBottom:14,border:`1px solid ${borderColor}`,boxShadow:t.cardShadow},
  newClientBtn:{width:"100%",padding:"14px",borderRadius:2,border:`2px dashed ${t.primary}`,background:t.primaryLight,color:t.primary,fontSize:13,fontWeight:700,cursor:"pointer",marginBottom:12,textTransform:"uppercase",letterSpacing:"0.5px",fontFamily:mono},
  secHdr:{display:"flex",alignItems:"center",gap:8,padding:"12px 12px",background:cardBg,borderBottom:`2px solid ${t.primary}`,boxShadow:t.cardShadow},
  secTitle:{fontSize:16,fontWeight:800,color:textPrimary,margin:0,letterSpacing:"0.3px"},
  backBtn:{background:"none",border:"none",fontSize:14,color:t.primary,cursor:"pointer",fontWeight:700,padding:"6px 0",fontFamily:mono},
  fGroup:{marginBottom:14},
  fLabel:{display:"block",fontSize:10,fontWeight:700,color:textSecondary,marginBottom:5,textTransform:"uppercase",letterSpacing:"1px",fontFamily:mono},
  input:{width:"100%",padding:"11px 14px",borderRadius:2,border:`1.5px solid ${inputBorder}`,fontSize:14,color:textPrimary,outline:"none",boxSizing:"border-box",background:inputBg,transition:"border-color 0.15s",fontFamily:sans},
  textarea:{width:"100%",padding:"11px 14px",borderRadius:2,border:`1.5px solid ${inputBorder}`,fontSize:14,color:textPrimary,outline:"none",resize:"vertical",boxSizing:"border-box",fontFamily:sans,background:inputBg,transition:"border-color 0.15s"},
  saveBtn:{width:"100%",padding:"14px",borderRadius:2,border:"none",background:t.primary,color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",marginTop:10,textTransform:"uppercase",letterSpacing:"1px",fontFamily:mono,transition:"opacity 0.15s"},
  infoNote:{background:t.primaryLight,borderRadius:2,padding:"12px 16px",fontSize:13,color:t.primary,marginBottom:14,borderLeft:`4px solid ${t.primary}`,fontWeight:600},
  pill:{padding:"7px 16px",borderRadius:2,border:"none",fontSize:12,fontWeight:700,cursor:"pointer",transition:"all 0.15s",fontFamily:mono},
  pickerHdr:{textAlign:"center",padding:"28px 20px 22px",background:t.headerBg,borderBottom:`3px solid ${t.primary}`},
  pickerCheck:{width:52,height:52,borderRadius:2,background:"rgba(255,255,255,0.1)",color:"#fff",fontSize:24,fontWeight:800,display:"inline-flex",alignItems:"center",justifyContent:"center",marginBottom:12,border:"1px solid rgba(255,255,255,0.15)"},
  pickerTitle:{fontSize:20,fontWeight:800,color:"#fff",margin:"0 0 8px",letterSpacing:"0.5px"},
  pickerNum:{display:"inline-block",background:"rgba(255,255,255,0.1)",color:"#fff",padding:"4px 14px",borderRadius:2,fontSize:14,fontWeight:700,marginBottom:8,fontFamily:mono,border:"1px solid rgba(255,255,255,0.15)"},
  pickerClient:{fontSize:15,color:"rgba(255,255,255,0.85)",fontWeight:700,margin:0},
  pickerAddr:{fontSize:12,color:"rgba(255,255,255,0.5)",margin:"4px 0 0",fontWeight:500},
  pickerQ:{fontSize:16,fontWeight:800,color:textPrimary,padding:"18px 20px 12px"},
  actGrid:{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10,padding:"0 16px"},
  actCard:{display:"flex",flexDirection:"column",alignItems:"center",gap:6,padding:"18px 12px",background:cardBg,borderRadius:2,border:`1px solid ${borderColor}`,cursor:"pointer",boxShadow:t.cardShadow,transition:"border-color 0.15s"},
  skipBtn:{display:"block",width:"calc(100% - 32px)",margin:"14px auto",padding:"12px",background:"transparent",border:`2px solid ${borderColor}`,borderRadius:2,fontSize:13,fontWeight:700,color:textSecondary,cursor:"pointer",textAlign:"center",textTransform:"uppercase",letterSpacing:"0.5px",fontFamily:mono},
  detailHdr:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 12px",background:cardBg,borderBottom:`2px solid ${t.primary}`,boxShadow:t.cardShadow,flexWrap:"wrap" as any,gap:6},
  emailBtn:{background:t.secondaryLight,border:`1px solid ${t.secondary}`,borderRadius:2,padding:"6px 10px",fontSize:12,cursor:"pointer",color:t.secondary,fontWeight:700,whiteSpace:"nowrap" as any},
  delBtn:{background:isDark?"#2a1a1a":"#fef2f2",border:`1px solid ${isDark?"#4a2a2a":"#fecaca"}`,borderRadius:2,padding:"6px 10px",fontSize:12,cursor:"pointer",color:"#dc2626",whiteSpace:"nowrap" as any},
  praticaHdrCard:{background:cardBg,borderRadius:2,padding:"14px 12px",border:`1px solid ${borderColor}`,marginBottom:16,boxShadow:t.cardShadow,wordBreak:"break-word" as any},
  praticaNumBig:{fontSize:15,fontWeight:800,color:t.secondary,background:t.secondaryLight,padding:"5px 14px",borderRadius:2,fontFamily:mono},
  statusBdg:{padding:"5px 14px",borderRadius:2,fontSize:12,fontWeight:700,fontFamily:mono,textTransform:"uppercase"},
  detailName:{fontSize:22,fontWeight:800,color:textPrimary,margin:"10px 0 14px"},
  detailInfo:{display:"flex",flexDirection:"column",gap:8},
  todayChip:{background:t.primary,color:"#fff",fontSize:9,fontWeight:700,padding:"2px 10px",borderRadius:2,marginLeft:8,fontFamily:mono,textTransform:"uppercase"},
  statusChanger:{display:"flex",alignItems:"center",gap:10,marginBottom:16,padding:"14px 0",borderTop:`1px solid ${borderColor}`,borderBottom:`1px solid ${borderColor}`},
  statusLbl:{fontSize:11,fontWeight:700,color:textSecondary,textTransform:"uppercase",minWidth:48,fontFamily:mono},
  statusTgl:{flex:1,padding:"8px 4px",borderRadius:2,fontSize:11,fontWeight:700,cursor:"pointer",transition:"all 0.15s",fontFamily:mono,textTransform:"uppercase"},
  sectionTitle:{fontSize:14,fontWeight:800,color:textPrimary,margin:"0 0 12px"},
  actionBlock:{background:cardBg,borderRadius:2,padding:14,marginBottom:10,border:`1px solid ${borderColor}`,boxShadow:t.cardShadow},
  openFormBtn:{width:"100%",padding:"11px",borderRadius:2,border:`1px solid ${t.primary}`,background:t.primaryLight,color:t.primary,fontSize:13,fontWeight:700,cursor:"pointer",marginBottom:8,textAlign:"center",textTransform:"uppercase",letterSpacing:"0.5px",fontFamily:mono},
  addActionBtn:{width:"100%",padding:"13px",borderRadius:2,border:`2px dashed ${borderColor}`,background:"transparent",fontSize:13,fontWeight:700,color:textSecondary,cursor:"pointer",marginTop:16,textTransform:"uppercase",letterSpacing:"0.5px",fontFamily:mono},
  sendEmailBtn:{width:"100%",padding:"13px",borderRadius:2,border:"none",background:t.secondary,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",marginTop:10,textTransform:"uppercase",letterSpacing:"0.5px",fontFamily:mono},
  dataSummary:{background:cardBg,borderRadius:2,padding:14,marginTop:12,borderLeft:`4px solid ${t.primary}`,border:`1px solid ${borderColor}`,boxShadow:t.cardShadow},
  dataSumTitle:{fontSize:14,fontWeight:800,color:t.primary,margin:"0 0 6px"},
  dataSumLine:{fontSize:12,color:textSecondary,margin:"0 0 2px",fontWeight:500,fontFamily:mono},
  praticaRef:{background:t.secondaryLight,borderRadius:2,padding:"12px 16px",borderLeft:`4px solid ${t.secondary}`,marginBottom:16,fontSize:14,fontWeight:700,color:t.secondary,fontFamily:mono},
  vanoCard:{background:cardBg,borderRadius:2,padding:14,marginBottom:10,border:`1px solid ${borderColor}`,borderLeft:`4px solid #d4820e`,boxShadow:t.cardShadow},
  vanoHdr:{display:"flex",alignItems:"center",gap:10,marginBottom:12},
  vanoNum:{width:30,height:30,borderRadius:2,background:"#d4820e",color:"#fff",fontSize:14,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:mono},
  vanoRm:{background:isDark?"#2a1a1a":"#fef2f2",border:`1px solid ${isDark?"#4a2a2a":"#fecaca"}`,borderRadius:2,width:30,height:30,fontSize:16,color:"#dc2626",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.15s"},
  addVanoBtn:{width:"100%",padding:"12px",borderRadius:2,border:"2px dashed #d4820e",background:"transparent",color:"#d4820e",fontSize:13,fontWeight:700,cursor:"pointer",marginBottom:14,textTransform:"uppercase",letterSpacing:"0.5px",fontFamily:mono},
  photoPH:{width:68,height:68,borderRadius:2,border:"2px dashed",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2},
  urgBtn:{flex:1,padding:"10px 4px",borderRadius:2,border:"none",fontSize:11,fontWeight:700,cursor:"pointer",textAlign:"center",transition:"all 0.15s",fontFamily:mono,textTransform:"uppercase"},
  emailCard:{background:cardBg,borderRadius:2,padding:"10px 16px",border:`1px solid ${borderColor}`,marginBottom:6,boxShadow:t.cardShadow},
  templateBtn:{padding:"8px 14px",borderRadius:2,border:`1.5px solid ${t.secondary}`,background:cardBg,color:t.secondary,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:mono},
  exportBtn:{padding:"10px 16px",borderRadius:2,border:`1.5px solid ${t.primary}`,background:t.primaryLight,color:t.primary,fontSize:12,fontWeight:700,cursor:"pointer",flex:1,textAlign:"center",textTransform:"uppercase",letterSpacing:"0.3px",fontFamily:mono} as React.CSSProperties,
  noteCardFull:{display:"flex",alignItems:"flex-start",gap:10,borderRadius:2,padding:"14px 16px",border:`1px solid ${borderColor}`,marginBottom:8,boxShadow:t.cardShadow},
  noteCardBtn:{flex:1,background:"none",border:"none",textAlign:"left",cursor:"pointer",padding:0},
  noteDelBtn:{background:"none",border:"none",fontSize:14,cursor:"pointer",padding:4,flexShrink:0,color:"#dc2626"},
  };
}
let S = getThemeStyles("classic");
