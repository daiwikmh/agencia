import { C } from "./theme.js";

const FF = "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

export function GlobalStyle() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,650;9..40,700&display=swap');
      *{box-sizing:border-box}
      html,body{margin:0;padding:0;background:${C.bg};font-family:${FF};font-weight:400}
      ::-webkit-scrollbar{width:7px;height:7px}
      ::-webkit-scrollbar-thumb{background:#D7D7DC;border-radius:4px}
      ::-webkit-scrollbar-track{background:transparent}
      ::selection{background:${C.accent}33}
      @keyframes ag-blink{0%,100%{opacity:1}50%{opacity:.35}}
      @keyframes ag-fade{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
      @keyframes ag-spin{to{transform:rotate(360deg)}}
      .ag-btn{border:none;cursor:pointer;font-family:${FF};font-weight:500;font-size:12.5px;border-radius:999px;padding:9px 18px;transition:filter .15s,opacity .15s,background .15s;display:inline-flex;align-items:center;gap:8px}
      .ag-btn:hover:not(:disabled){filter:brightness(1.06)}
      .ag-btn:disabled{opacity:.45;cursor:not-allowed}
      .ag-tab{position:relative;display:inline-flex;align-items:center;white-space:nowrap;text-decoration:none;font-family:${FF};font-size:14px;font-weight:400;color:${C.muted};padding:6px 2px;transition:color .12s}
      .ag-tab:hover{color:${C.white}}
      .ag-tab.active{color:${C.white};font-weight:500}
      .ag-tab.active::after{content:'';position:absolute;left:0;right:0;bottom:-1px;height:1.5px;background:${C.white};border-radius:2px}
      .ag-icon-btn{width:40px;height:40px;border-radius:50%;border:1px solid ${C.border};background:${C.card};color:${C.muted};display:inline-flex;align-items:center;justify-content:center;cursor:pointer;font-size:14px;flex-shrink:0;transition:color .12s,background .12s;text-decoration:none}
      .ag-icon-btn:hover{color:${C.white};background:${C.navy}}
      .ag-link{color:${C.accent};text-decoration:none}
      .ag-link:hover{text-decoration:underline}
      .ag-seeall{font-size:12.5px;color:${C.ink};text-decoration:none;border-bottom:1px solid ${C.faint};padding-bottom:1px}
      .ag-seeall:hover{color:${C.accent};border-color:${C.accent}}
      .ag-row{background:none;border:none;width:100%;text-align:left;cursor:pointer;font-family:${FF};padding:0}
      textarea,input,select{font-family:${FF};font-weight:400;color:${C.ink};background:${C.navy};border:1px solid ${C.border};border-radius:14px;padding:11px 14px;outline:none;transition:border-color .15s}
      textarea:focus,input:focus,select:focus{border-color:${C.white}}
      textarea{resize:vertical;width:100%;font-size:13px;line-height:1.6}
      input[type=range]{accent-color:${C.accent};padding:0}
      textarea::placeholder,input::placeholder{color:${C.faint}}
      .ag-search{background:${C.card};border-radius:999px;padding:12px 46px 12px 20px;font-size:13.5px;width:100%}
      .ag-pill-select{background:${C.card};border-radius:999px;padding:9px 16px;font-size:13px;color:${C.ink};cursor:pointer}
      .ag-spinner{width:12px;height:12px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:ag-spin .7s linear infinite;display:inline-block}
      .ag-scroll-x{overflow-x:auto;scrollbar-width:none}
      .ag-scroll-x::-webkit-scrollbar{display:none}
      .ag-bento{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);gap:20px;align-items:start}
      .ag-hero{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.05fr);gap:24px;align-items:end}
      .ag-head{display:flex;align-items:center;gap:16px}
      .ag-nav{display:flex;gap:18px;flex:1 1 auto;padding:2px 0}
      @media(max-width:1180px){.ag-bento{grid-template-columns:1fr}.ag-hero{grid-template-columns:1fr}}
      @media(max-width:980px){.ag-head{flex-wrap:wrap}.ag-nav{order:5;flex:1 0 100%}}
    `}</style>
  );
}
