import { C } from "./theme.js";

const FF_BTN = "'Space Grotesk',sans-serif";
const FF_INPUT = "'Inter',sans-serif";

export function GlobalStyle() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Space+Mono:wght@400;700&family=Inter:wght@400;500;600&display=swap');
      *{box-sizing:border-box}
      html,body{margin:0;padding:0;background:${C.bg}}
      ::-webkit-scrollbar{width:7px;height:7px}
      ::-webkit-scrollbar-thumb{background:${C.border};border-radius:4px}
      ::-webkit-scrollbar-track{background:transparent}
      ::selection{background:${C.accent}44}
      @keyframes ag-blink{0%,100%{opacity:1}50%{opacity:.35}}
      @keyframes ag-fade{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
      @keyframes ag-spin{to{transform:rotate(360deg)}}
      .ag-btn{border:none;cursor:pointer;font-family:${FF_BTN};font-weight:600;font-size:12.5px;border-radius:9px;padding:8px 16px;transition:filter .15s,opacity .15s;display:inline-flex;align-items:center;gap:8px}
      .ag-btn:hover:not(:disabled){filter:brightness(1.12)}
      .ag-btn:disabled{opacity:.45;cursor:not-allowed}
      .ag-nav-row{display:flex;align-items:center;gap:10px;width:calc(100% - 12px);margin:1px 6px;text-align:left;background:none;border:none;border-radius:9px;cursor:pointer;font-family:${FF_BTN};font-size:13px;font-weight:500;padding:9px 12px;color:${C.muted};transition:color .12s,background .12s}
      .ag-nav-row:hover{color:${C.ink};background:${C.navyLight}}
      .ag-nav-row.active{color:${C.white};background:${C.accentBg};font-weight:600}
      .ag-link{color:${C.accent};text-decoration:none}
      .ag-link:hover{text-decoration:underline}
      textarea,input{font-family:${FF_INPUT};color:${C.ink};background:${C.navy};border:1px solid ${C.border};border-radius:10px;padding:10px 12px;outline:none;transition:border-color .15s}
      textarea:focus,input:focus{border-color:${C.accent}}
      textarea{resize:vertical;width:100%;font-size:13px;line-height:1.6}
      input[type=range]{accent-color:${C.accent};padding:0}
      textarea::placeholder{color:${C.faint}}
      .ag-spinner{width:12px;height:12px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:ag-spin .7s linear infinite;display:inline-block}
    `}</style>
  );
}
