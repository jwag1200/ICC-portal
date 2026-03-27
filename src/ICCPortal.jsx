import { useState, useEffect, useCallback, Component } from "react";

const TRIGGERS = [
  "Deal >= 50% of Rep's Quota",
  "Windfall Attainment (250%+)",
  "Rep-Filed Dispute",
  "De-booking > $250,000",
];
const RESOLUTION_OPTIONS = [
  { id:"full", label:"Commission + Full Quota Retirement", desc:"Standard treatment. Commission paid, booking counts toward quota attainment." },
  { id:"no_retire", label:"Commission, No Quota Retirement", desc:"Commission paid but booking does not retire quota. Use for extraordinary one-time deals where attainment would be misleading." },
  { id:"spot", label:"Spot Bonus", desc:"Discretionary cash payment outside the commission plan. Use when contribution is real but does not fit commission calculation." },
  { id:"partial", label:"Partial Commission + Partial Quota Retirement", desc:"Pay a percentage of calculated commission, retire corresponding quota percentage. Use for split-credit or disputed attribution." },
  { id:"deferred", label:"Deferred Commission", desc:"Commission approved but payment tied to future milestone: cash collection, Minco start, customer acceptance, or defined date." },
  { id:"credit_only", label:"Commission Credit Only (No Cash)", desc:"Quota retirement credit granted but no cash payout. Use for deals bridging plan periods or where cash timing is inappropriate." },
];
const TIER_CLS = { 1:"p-green", 2:"p-gold", 3:"p-blue" };
const STATUS_COLOR = {
  "Open":"#1072ba","In Review":"#fdb73e",
  "Decided":"#8bad44","Closed":"#5a646a","Pending Review":"#9b59b6",
};
const EMPTY_FORM = {
  participant:"",role:"",manager:"",planPeriod:"2026 1H",
  trigger:"",dealDesc:"",dealValue:"",quota:"",
  compClaimed:"",compCalculated:"",policyIssue:"",cgoOpinion:"",advisory:"",
  repEmail:"",docLink:"",assignedTo:"",
};

const PLAN_REFS = {
  "Deal >= 50% of Rep's Quota": { sections: [
    { source:"2026 1H Incentive Compensation Plan", ref:"Section 5 -- Attainment and Accelerators", text:"If a single deal is equal or greater than 50% of your plan period quota, the Sales Incentive Committee reserves the right to review said deal and determine the equitable treatment of the deal." },
    { source:"2026 1H Incentive Compensation Plan", ref:"Exhibit 1, Footnote ***", text:"If a deal is equal or greater than 50% of your quota, it is subject to Sales Incentive Committee review." },
    { source:"ICC Charter v1.1", ref:"Section 4 -- Jurisdiction, Tier 3 Triggers", text:"Any deal >= 50% of a rep's plan-period quota is a mandatory Tier 3 Full Committee trigger." },
  ]},
  "Windfall Attainment (250%+)": { sections: [
    { source:"2026 1H Incentive Compensation Plan", ref:"Section 5 -- Attainment and Accelerators", text:"If you achieve more than the highest attainment percentage set forth in your Incentive Compensation Agreement, the Sales Incentive Committee may determine the applicable commission earned." },
    { source:"2026 1H Incentive Compensation Plan", ref:"Exhibit 1, Footnote **", text:"250% attainment triggers windfall. Sales Incentive Committee review." },
    { source:"ICC Charter v1.1", ref:"Section 4.1 -- Windfall Review", text:"Windfall review is not presumptively adverse. The Committee may confirm full payment, modify payment, or authorize payment above the calculated amount where commercial context warrants." },
  ]},
  "Rep-Filed Dispute": { sections: [
    { source:"2026 1H Incentive Compensation Plan", ref:"Section 7.3 -- Disputes", text:"You must notify the Sales Incentive Committee of any dispute no later than 30 days after the date that incentive compensation is paid, together with a recitation of all facts and provision of all documentation in support of your dispute." },
    { source:"2026 1H Incentive Compensation Plan", ref:"Section 7.3 -- Resolution timeline", text:"The Sales Incentive Committee will issue a final determination no later than 15 business days after delivery of your notice of dispute." },
    { source:"ICC Charter v1.1", ref:"Section 6.3 -- Rep Dispute Submission Requirements", text:"To initiate a Tier 3 dispute, a plan participant must submit written notice to the CGO's office within 30 calendar days of the date compensation was paid (or due if unpaid)." },
  ]},
  "De-booking > $250,000": { sections: [
    { source:"Alianza Booking Definition Policy (Jan 1, 2026)", ref:"De-booking -- Executive approval threshold", text:"Executive sign-off is required if de-booking is over $250,000." },
    { source:"Alianza Booking Definition Policy (Jan 1, 2026)", ref:"De-booking -- Finance authority", text:"De-booking is a Finance call. Finance can initiate a de-booking. Sales Ops to seek Finance approval including the reasoning on the deal note." },
    { source:"ICC Charter v1.1", ref:"Section 4 -- Jurisdiction, Tier 3 Triggers", text:"Any de-booking event exceeding $250,000 is a mandatory Tier 3 Full Committee trigger." },
  ]},
};

function genRef(t) {
  const y = new Date().getFullYear();
  const n = String(Math.floor(Math.random()*900)+100);
  return t===2 ? "CGO-"+y+"-"+n : "ICC-"+y+"-"+n;
}
function todayStr() {
  return new Date().toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});
}
function slaDay(c) {
  // Calculate business days elapsed since case opened
  if(!c.opened) return 0;
  const start = new Date(c.opened);
  if(isNaN(start.getTime())) return 0;
  const now = new Date();
  let days = 0;
  const cur = new Date(start);
  while(cur < now) {
    cur.setDate(cur.getDate()+1);
    const dow = cur.getDay();
    if(dow!==0&&dow!==6) days++;
  }
  return days;
}
function appendAudit(c, action) {
  const entry = todayStr()+" -- "+action;
  const existing = c.auditLog||[];
  return { auditLog: [...existing, entry] };
}
function classifyLocal(trigger, dealValue) {
  const val = parseFloat(String(dealValue).replace(/[^0-9.]/g,""))||0;
  if (["Rep-Filed Dispute","Windfall Attainment (250%+)","De-booking > $250,000","Deal >= 50% of Rep's Quota"].includes(trigger)||val>250000)
    return {tier:3, note:"Mandatory Tier 3 trigger -- Full Committee review required."};
  return {tier:2, note:"Nature-of-decision trigger -- CGO pre-approval required. Payout impact must be under $50k and within CGO budget."};
}
function drTemplate(c, inf, ag) {
  var planSections = "";
  if(PLAN_REFS[c.trigger]) {
    planSections = PLAN_REFS[c.trigger].sections.map(function(s){
      return s.source+" -- "+s.ref+":\n\""+s.text+"\"";
    }).join("\n\n");
  } else {
    planSections = "[Cite the specific 2026 1H Incentive Compensation Plan section(s) or Alianza Booking Definition Policy (January 1, 2026, and successor policies) that govern this matter.]";
  }
  var dispOpt = RESOLUTION_OPTIONS.find(function(r){return r.id===(c.disposition||"");});
  var dispLabel = dispOpt ? dispOpt.label : "[Select disposition in Committee Action tab before loading template]";
  var voteStr = (inf+ag)>0 ? "The Committee voted "+inf+" in favor and "+ag+" against." : "[Vote to be recorded in Committee Action tab]";
  var lines = [
    "CASE SUMMARY:",
    "Participant "+(c.participant||"[name]")+" ("+(c.role||"[role]")+") submitted a "+(c.trigger)+" matter for review under the "+(c.planPeriod)+" Incentive Compensation Plan.",
    "Deal value: $"+(c.dealValue||"[value]")+". Compensation claimed by rep: $"+(c.compClaimed||"[amount]")+". Compensation calculated by CommOps: $"+(c.compCalculated||"[amount]")+".",
    "",
    "POLICY ANALYSIS:",
    "The following plan provisions and policies were reviewed by the Committee in reaching this determination:",
    "",
    planSections,
    "",
    "[Note any additional provisions or considerations. Delete any provisions above that were not directly applicable to this matter.]",
    "",
    "COMMITTEE DELIBERATION:",
    "[Document the Committee's interpretation of the applicable provisions, the key considerations weighed, and the reasoning that led to the determination below. If the vote was not unanimous, note the basis for any dissent.]",
    "",
    "DISPOSITION:",
    dispLabel,
    "",
    "DETERMINATION:",
    voteStr+" [State the specific ruling: amount approved or denied, methodology applied, effective date, and any conditions or milestones attached to payment.]",
  ];
  return lines.join("\n");
}

function buildAcceptEmail(c) {
  const subj = "ICC Compensation Review -- Case "+c.ref+" Accepted";
  const to = c.repEmail ? encodeURIComponent(c.repEmail) : "";
  const bodyLines = [
    "Dear "+(c.participant||"[Name]")+",",
    "",
    "Your compensation review request (Case "+c.ref+") has been accepted for Incentive Compensation Committee review.",
    "",
    "The Committee will convene within 15 business days. You will receive written notification of the outcome along with a Decision Record once a ruling has been issued.",
    "",
    "While your case is under review, please refrain from discussing the details with other members of the sales team.",
    "",
    "If you have any questions, please reach out to your manager.",
    "",
    "",
    "",
  ];
  return "mailto:"+to+"?subject="+encodeURIComponent(subj)+"&body="+encodeURIComponent(bodyLines.join("\n"));
}

function buildRejectEmail(c, reason) {
  const subj = "ICC Compensation Review -- Case "+c.ref+" Not Escalated";
  const to = c.repEmail ? encodeURIComponent(c.repEmail) : "";
  const bodyLines = [
    "Dear "+(c.participant||"[Name]")+",",
    "",
    "Your compensation review request (Case "+c.ref+") has been reviewed and will not be escalated to the Incentive Compensation Committee at this time.",
    "",
    "Reason: "+reason,
    "",
    "If you have any questions, or believe this decision was made in error, please contact your manager or reach out to the CGO directly to discuss next steps.",
    "",
    "",
    "",
  ];
  return "mailto:"+to+"?subject="+encodeURIComponent(subj)+"&body="+encodeURIComponent(bodyLines.join("\n"));
}

function buildDecisionEmail(c, inf, ag) {
  const subj = "ICC Decision Record -- Case "+c.ref;
  const to = c.repEmail ? encodeURIComponent(c.repEmail) : "";
  const determination = (c.decisionDraft||"").split("\n").find(function(l){return l.startsWith("DETERMINATION:");}) || "See attached Decision Record.";
  const bodyLines = [
    "Dear "+(c.participant||"[Name]")+",",
    "",
    "The Incentive Compensation Committee has issued a ruling on Case "+c.ref+". Please find the Decision Record attached to this email.",
    "",
    determination,
    "",
    "This decision is final per the ICC Charter.",
    "",
    "APPEAL PROCESS",
    "If you believe there are valid grounds for a CEO Plan Interpretation Review, you may submit a written appeal request to the CEO's office. Please note the following:",
    "",
    "-- You have 15 business days from the date of this email to submit your appeal.",
    "-- Appeals are limited to the following grounds only: (1) procedural defect in how the Committee conducted its review, (2) material new evidence that was not available at the time of the ruling, or (3) manifest misapplication of the plan language.",
    "-- Disagreement with the outcome or the Committee's judgment is not a valid ground for appeal.",
    "-- Your written appeal must include: the case reference number, the specific ground(s) you are asserting, a factual summary supporting your position, and any supporting documentation.",
    "-- Submit your appeal in writing directly to the CEO's office. The CGO can assist you in understanding the process if needed.",
    "",
    "If you have any questions, please reach out to your manager or the CGO.",
    "",
    "",
    "",
  ];
  return "mailto:"+to+"?subject="+encodeURIComponent(subj)+"&body="+encodeURIComponent(bodyLines.join("\n"));
}

function downloadDecisionPDF(c) {
  const determination = (c.decisionDraft||"").split("\n").find(function(l){return l.startsWith("DETERMINATION:");}) || "";
  const html = [
    "<html><head><style>",
    "body{font-family:Arial,sans-serif;font-size:12px;color:#1a2530;margin:0;padding:0}",
    ".header{background:#17477e;color:white;padding:20px 32px;margin-bottom:0}",
    ".header-co{font-size:16px;font-weight:bold;letter-spacing:0.1em;margin-bottom:4px}",
    ".header-sub{font-size:11px;color:#b9e0f7}",
    ".gold-bar{height:4px;background:#fdb73e}",
    ".body{padding:32px}",
    ".title{font-size:18px;color:#17477e;font-weight:normal;margin-bottom:4px}",
    ".ref{font-size:11px;color:#8a969c;margin-bottom:24px;font-family:Courier New,monospace}",
    ".meta{display:flex;gap:32px;margin-bottom:24px;padding:16px;background:#f4f7fa;border-radius:6px}",
    ".meta-item{}",
    ".meta-lbl{font-size:9px;text-transform:uppercase;letter-spacing:0.07em;color:#8a969c;margin-bottom:2px}",
    ".meta-val{font-size:12px;color:#1a2530;font-weight:bold}",
    ".section{margin-bottom:20px}",
    ".section-title{font-size:10px;font-weight:bold;text-transform:uppercase;letter-spacing:0.07em;color:#1072ba;border-bottom:1px solid #e8edf2;padding-bottom:4px;margin-bottom:10px}",
    ".section-body{font-size:12px;line-height:1.7;color:#1a2530;white-space:pre-wrap}",
    ".footer{margin-top:40px;padding-top:16px;border-top:1px solid #e8edf2;font-size:10px;color:#8a969c;display:flex;justify-content:space-between}",
    ".determination{background:#f4f7fa;border-left:3px solid #17477e;padding:12px 16px;border-radius:0 6px 6px 0;font-size:12px;line-height:1.7;margin-bottom:20px}",
    "</style></head><body>",
    "<div class='header'><div class='header-co'>ALIANZA</div><div class='header-sub'>Incentive Compensation Committee -- Decision Record</div></div>",
    "<div class='gold-bar'></div>",
    "<div class='body'>",
    "<div class='title'>Decision Record</div>",
    "<div class='ref'>"+c.ref+" &nbsp;|&nbsp; "+( c.planPeriod||"")+" &nbsp;|&nbsp; Decided "+( c.decided||"")+"</div>",
    "<div class='meta'>",
    "<div class='meta-item'><div class='meta-lbl'>Participant</div><div class='meta-val'>"+(c.participant||"—")+"</div></div>",
    "<div class='meta-item'><div class='meta-lbl'>Role</div><div class='meta-val'>"+(c.role||"—")+"</div></div>",
    "<div class='meta-item'><div class='meta-lbl'>Trigger</div><div class='meta-val'>"+(c.trigger||"—")+"</div></div>",
    "<div class='meta-item'><div class='meta-lbl'>Plan Period</div><div class='meta-val'>"+(c.planPeriod||"—")+"</div></div>",
    "</div>",
  ];

  const draftLines = (c.decisionDraft||"").split("\n");
  const sections = ["CASE SUMMARY","POLICY ANALYSIS","COMMITTEE DELIBERATION","DISPOSITION","DETERMINATION"];
  sections.forEach(function(sec) {
    const startIdx = draftLines.findIndex(function(l){return l.startsWith(sec+":");});
    if(startIdx === -1) return;
    const endIdx = draftLines.findIndex(function(l,i){
      if(i <= startIdx) return false;
      return sections.some(function(s){return l.startsWith(s+":");});
    });
    const content = draftLines.slice(startIdx+1, endIdx===-1?undefined:endIdx).join("\n").trim();
    if(sec === "DETERMINATION" || sec === "DISPOSITION") {
      html.push("<div class='determination'><strong>"+sec+":</strong><br/>"+content.replace(/\n/g,"<br/>")+"</div>");
    } else {
      html.push("<div class='section'><div class='section-title'>"+sec+"</div><div class='section-body'>"+content+"</div></div>");
    }
  });

  html.push("<div class='footer'><span>Alianza Confidential -- ICC Archive</span><span>"+c.ref+"</span></div>");
  html.push("</div></body></html>");

  const blob = new Blob([html.join("")], {type:"text/html"});
  const url = URL.createObjectURL(blob);
  const filename = "ICC Decision Record - Case "+c.ref+".pdf";
  const win = window.open(url,"_blank");
  if(win) {
    win.document.title = filename;
    win.onload = function(){
      win.print();
      setTimeout(function(){URL.revokeObjectURL(url);}, 2000);
    };
  }
}

const store = {
  async get(k) { try { const v=localStorage.getItem(k); return v?{value:v}:null; } catch { return null; } },
  async set(k,v) { try { localStorage.setItem(k,v); } catch {} },
};

const STYLES = `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f4f7fa}
.app{display:flex;min-height:100vh}
.sidebar{width:210px;background:#17477e;display:flex;flex-direction:column;flex-shrink:0;position:sticky;top:0;height:100vh}
.slogo{padding:20px 16px 16px;border-bottom:1px solid rgba(255,255,255,0.1)}
.slogo-co{font-size:14px;font-weight:600;color:white;letter-spacing:0.1em}
.slogo-sub{font-size:10px;color:#b9e0f7;margin-top:3px;line-height:1.4}
.nav-btn{width:100%;display:flex;align-items:center;gap:8px;padding:10px 16px;background:none;border:none;cursor:pointer;font-size:12px;color:rgba(255,255,255,0.6);text-align:left;border-left:2px solid transparent;transition:all 0.1s;font-family:inherit}
.nav-btn.active{background:rgba(255,255,255,0.1);color:white;font-weight:500;border-left-color:#fdb73e}
.nav-badge{background:#fdb73e;color:#0f2d52;border-radius:8px;padding:1px 6px;font-size:10px;font-weight:700;margin-left:auto}
.main{flex:1;overflow-y:auto}
.page{padding:28px 32px;max-width:960px}
.page-title{font-size:22px;font-weight:300;color:#17477e;margin-bottom:4px}
.page-sub{font-size:12px;color:#8a969c;margin-bottom:22px}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px}
.stat{background:white;border-radius:8px;padding:16px;border-top:3px solid #1072ba;box-shadow:0 1px 3px rgba(0,0,0,0.06)}
.stat-n{font-size:26px;font-weight:300;color:#17477e;margin-bottom:2px}
.stat-l{font-size:10px;color:#8a969c;text-transform:uppercase;letter-spacing:0.07em}
.card{background:white;border-radius:8px;border:1px solid #e8edf2;overflow:hidden;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,0.04)}
.card-hd{padding:12px 16px;border-bottom:1px solid #e8edf2;display:flex;justify-content:space-between;align-items:center;font-size:13px;font-weight:500;color:#17477e}
.card-hd-btns{display:flex;gap:8px;align-items:center}
table{width:100%;border-collapse:collapse}
th{padding:8px 14px;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.07em;color:#8a969c;text-align:left;background:#f8fafc}
td{padding:10px 14px;font-size:12px;color:#1a2530;border-top:1px solid #f0f4f8}
.trow{cursor:pointer}
.trow:hover td{background:#f4f7fa}
.pill{display:inline-flex;align-items:center;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase}
.p-blue{background:#1072ba15;color:#1072ba;border:1px solid #1072ba30}
.p-gold{background:#fdb73e18;color:#8a5200;border:1px solid #fdb73e50}
.p-green{background:#8bad4418;color:#3a5a00;border:1px solid #8bad4440}
.p-gray{background:#f0f4f8;color:#5a646a;border:1px solid #d0d8e0}
.p-navy{background:#17477e15;color:#17477e;border:1px solid #17477e30}
.p-red{background:#e24b4a15;color:#c0392b;border:1px solid #e24b4a30}
.p-purple{background:#9b59b615;color:#6c3483;border:1px solid #9b59b630}
.dot{width:6px;height:6px;border-radius:50%;display:inline-block;margin-right:5px}
.btn{padding:7px 14px;border-radius:6px;font-size:12px;font-weight:500;cursor:pointer;border:1px solid #d0d8e0;background:transparent;color:#1a2530;transition:all 0.1s;font-family:inherit}
.btn:hover{background:#f4f7fa}
.btn-p{background:#1072ba;color:white;border-color:#1072ba}
.btn-p:hover{background:#0d5fa0}
.btn-ok{background:#8bad44;color:white;border-color:#8bad44}
.btn-ok:hover{background:#7a9d3a}
.btn-danger{background:#e24b4a15;color:#c0392b;border-color:#e24b4a40}
.btn-danger:hover{background:#e24b4a25}
.btn-sm{padding:5px 11px;font-size:11px}
.btn:disabled{opacity:0.4;cursor:not-allowed}
.lbl{display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:#5a646a;margin-bottom:5px}
.inp,.sel,.ta{width:100%;padding:8px 10px;border:1px solid #d0d8e0;border-radius:6px;font-size:12px;color:#1a2530;background:white;font-family:inherit;outline:none;transition:border 0.1s}
.inp:focus,.sel:focus,.ta:focus{border-color:#1072ba}
.fg{margin-bottom:14px}
.fr{display:grid;grid-template-columns:1fr 1fr;gap:0 16px}
.sbar{display:flex;align-items:center;gap:10px;margin:18px 0 12px}
.sbar-l{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#17477e;white-space:nowrap}
.sbar-line{flex:1;height:1px;background:#e8edf2}
.cob{border-left:3px solid #1072ba;background:#1072ba08;padding:10px 12px;border-radius:0 6px 6px 0;margin-bottom:14px;font-size:12px;color:#5a646a;line-height:1.6}
.cob-warn{border-color:#fdb73e;background:#fdb73e08}
.cob-ok{border-color:#8bad44;background:#8bad4408}
.cob-err{border-color:#c0392b;background:#c0392b08}
.cob-gold{border-color:#fdb73e;background:#fdb73e08}
.cob-purple{border-color:#9b59b6;background:#9b59b608}
.tb{padding:5px 12px;border-radius:6px;font-size:11px;font-weight:500;cursor:pointer;border:1px solid #d0d8e0;background:transparent;color:#8a969c;font-family:inherit}
.tb.t1a{background:#8bad4415;color:#3a5a00;border-color:#8bad44}
.tb.t2a{background:#fdb73e15;color:#8a5200;border-color:#fdb73e}
.tb.t3a{background:#1072ba15;color:#1072ba;border-color:#1072ba}
.tabs{display:flex;border-bottom:1px solid #e8edf2;margin-bottom:16px}
.tab{padding:9px 16px;background:none;border:none;cursor:pointer;font-size:12px;color:#8a969c;border-bottom:2px solid transparent;margin-bottom:-1px;transition:all 0.1s;font-family:inherit}
.tab.act{color:#17477e;font-weight:500;border-bottom-color:#17477e}
.vrow{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border:1px solid #e8edf2;border-radius:6px;margin-bottom:8px;background:#f8fafc}
.vbtns{display:flex;gap:6px}
.vb{padding:4px 10px;border-radius:4px;font-size:10px;font-weight:600;cursor:pointer;border:1px solid #d0d8e0;background:transparent;color:#8a969c;font-family:inherit}
.vb-f{background:#8bad4415;color:#3a5a00;border-color:#8bad44}
.vb-a{background:#e24b4a15;color:#c0392b;border-color:#e24b4a}
.vb-r{background:#fdb73e15;color:#8a5200;border-color:#fdb73e}
.dg{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}
.df-l{font-size:10px;text-transform:uppercase;letter-spacing:0.07em;color:#8a969c;margin-bottom:2px}
.df-v{font-size:13px;color:#1a2530}
.dr-area{width:100%;padding:10px 12px;border:1px solid #d0d8e0;border-radius:6px;font-size:12px;color:#1a2530;background:#f8fafc;font-family:inherit;outline:none;resize:vertical;line-height:1.7;min-height:220px}
.dr-area:focus{border-color:#1072ba;background:white}
.empty{padding:40px;text-align:center;color:#8a969c}
.back-btn{background:none;border:none;cursor:pointer;font-size:11px;color:#8a969c;display:flex;align-items:center;gap:4px;margin-bottom:14px;padding:0;font-family:inherit}
.back-btn:hover{color:#17477e}
.sfooter{padding:12px 16px;border-top:1px solid rgba(255,255,255,0.1);font-size:10px;color:rgba(255,255,255,0.4);line-height:1.6}
.plan-ref{background:#f4f7fa;border:1px solid #e8edf2;border-radius:6px;padding:12px 14px;margin-bottom:10px}
.plan-ref-src{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.07em;color:#1072ba;margin-bottom:4px}
.plan-ref-sec{font-size:11px;font-weight:600;color:#17477e;margin-bottom:4px}
.plan-ref-txt{font-size:12px;color:#5a646a;line-height:1.6;font-style:italic}
.res-opt{border:1px solid #d0d8e0;border-radius:6px;padding:10px 12px;margin-bottom:8px;cursor:pointer;transition:all 0.1s}
.res-opt:hover{border-color:#1072ba;background:#1072ba06}
.res-opt.selected{border-color:#1072ba;background:#1072ba0d}
.res-opt-label{font-size:12px;font-weight:600;color:#17477e;margin-bottom:3px}
.res-opt-desc{font-size:11px;color:#8a969c;line-height:1.5}
.equity-check{display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border:1px solid #e8edf2;border-radius:6px;margin-bottom:8px;background:#f8fafc}
.equity-check input{margin-top:2px;flex-shrink:0;accent-color:#1072ba}
.equity-check-text{font-size:12px;color:#5a646a;line-height:1.5}
.modal-backdrop{position:absolute;top:0;left:0;width:100%;min-height:100%;background:rgba(23,71,126,0.18);display:flex;align-items:flex-start;justify-content:center;padding-top:60px;z-index:100}
.modal{background:white;border-radius:10px;border:1px solid #e8edf2;padding:24px;width:600px;max-width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.12)}
.modal-title{font-size:16px;font-weight:500;color:#17477e;margin-bottom:8px}
.modal-sub{font-size:12px;color:#8a969c;margin-bottom:16px;line-height:1.5}
.search-bar{display:flex;gap:8px;margin-bottom:16px}
.copy-cite{background:none;border:1px solid #d0d8e0;border-radius:4px;padding:3px 8px;font-size:10px;color:#8a969c;cursor:pointer;font-family:inherit;white-space:nowrap}
.copy-cite:hover{background:#f4f7fa;color:#17477e}
.copy-cite.copied{background:#8bad4415;color:#3a5a00;border-color:#8bad44}
`;

function Pill({label,cls}){return <span className={"pill "+(cls||"p-gray")}>{label}</span>;}
function SBar({label}){return <div className="sbar"><span className="sbar-l">{label}</span><div className="sbar-line"/></div>;}
function DF({label,value}){return <div style={{marginBottom:10}}><div className="df-l">{label}</div><div className="df-v">{value||<em style={{color:"#8a969c"}}>Not provided</em>}</div></div>;}
function Cob({children,variant}){
  const m={warn:"cob-warn",ok:"cob-ok",err:"cob-err",gold:"cob-gold",purple:"cob-purple"};
  return <div className={"cob"+(m[variant]?" "+m[variant]:"")}>{children}</div>;
}
function PlanRefsPanel({trigger}){
  if(!trigger||!PLAN_REFS[trigger]) return null;
  return(
    <div style={{marginBottom:14}}>
      <div style={{fontSize:11,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.07em",color:"#17477e",marginBottom:8}}>Relevant Plan Provisions</div>
      {PLAN_REFS[trigger].sections.map(function(s,i){return(
        <div key={i} className="plan-ref">
          <div className="plan-ref-src">{s.source}</div>
          <div className="plan-ref-sec">{s.ref}</div>
          <div className="plan-ref-txt">"{s.text}"</div>
        </div>
      );})}
      <div style={{fontSize:10,color:"#8a969c",marginTop:4,fontStyle:"italic"}}>Verify against current plan version before citing in a Decision Record.</div>
    </div>
  );
}

// ── RESOLUTION SELECTOR ───────────────────────────────────────────────────────
function ResolutionSelector({value, onChange}){
  return(
    <div>
      {RESOLUTION_OPTIONS.map(function(opt){
        const sel = value===opt.id;
        return(
          <div key={opt.id} className={"res-opt"+(sel?" selected":"")} onClick={function(){onChange(opt.id);}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{width:14,height:14,borderRadius:"50%",border:"2px solid "+(sel?"#1072ba":"#d0d8e0"),background:sel?"#1072ba":"white",flexShrink:0}}/>
              <div className="res-opt-label">{opt.label}</div>
            </div>
            <div className="res-opt-desc" style={{marginLeft:22}}>{opt.desc}</div>
          </div>
        );
      })}
    </div>
  );
}

// ── EQUITY ATTESTATION ────────────────────────────────────────────────────────
function EquityAttestation({checks, onChange}){
  const items = [
    "I have searched the ICC Precedent Register for materially similar prior rulings and either applied them consistently or documented distinguishing facts in this memo.",
    "I have reviewed current-period Tier 2 decisions and this ruling is consistent with same-period treatment, or I have documented the distinguishing facts above.",
    "I have considered whether similarly situated reps in comparable roles and territories have received consistent treatment and I am not aware of material inconsistency not explained by facts documented above.",
    "The payout impact of this decision is under $50,000 and within my approved CGO budget authority.",
  ];
  return(
    <div>
      {items.map(function(text,i){
        return(
          <div key={i} className="equity-check">
            <input type="checkbox" checked={!!checks[i]} onChange={function(e){
              const next={...checks,[i]:e.target.checked};
              onChange(next);
            }}/>
            <div className="equity-check-text">{text}</div>
          </div>
        );
      })}
    </div>
  );
}

// ── IMPORT MODAL ──────────────────────────────────────────────────────────────
function ImportModal({onImport,onClose}){
  const [json,setJson]=useState("");
  const [err,setErr]=useState("");
  function handleImport(){
    try{
      const parsed=JSON.parse(json.trim());
      if(!parsed.participant||!parsed.trigger){setErr("Missing required fields: participant and trigger.");return;}
      onImport(parsed);
    }catch(e){setErr("Invalid JSON. Copy the full JSON block from the notification email.");}
  }
  return(
    <div className="modal-backdrop" onClick={function(e){if(e.target===e.currentTarget)onClose();}}>
      <div className="modal">
        <div className="modal-title">Import Case from Email</div>
        <div className="modal-sub">Paste the JSON block from the SalesOps notification email. The case will be created in Pending Review status for your acceptance or rejection.</div>
        <div className="fg">
          <label className="lbl">JSON Payload</label>
          <textarea className="ta" rows={10} value={json} onChange={function(e){setJson(e.target.value);setErr("");}} style={{fontFamily:"monospace",fontSize:11}} placeholder={'{\n  "participant": "Jane Smith",\n  "trigger": "Rep-Filed Dispute",\n  ...\n}'}/>
        </div>
        {err&&<div className="cob cob-err" style={{marginBottom:12}}>{err}</div>}
        <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-p" onClick={handleImport} disabled={!json.trim()}>Import Case</button>
        </div>
      </div>
    </div>
  );
}

// ── HISTORICAL MODAL ──────────────────────────────────────────────────────────
function HistoricalModal({onSave,onClose}){
  const [hf,setHf]=useState({ref:"",date:"",participant:"",trigger:"",planPeriod:"",outcome:"",rationale:"",precedentNote:""});
  function uf(k){return function(e){setHf(function(p){return {...p,[k]:e.target.value};});};}
  const valid=hf.ref&&hf.trigger&&hf.outcome;
  function handleSave(){
    if(!valid)return;
    const draft=["DETERMINATION:",hf.outcome,"","COMMITTEE RATIONALE:",hf.rationale,"","PRECEDENT NOTE:",hf.precedentNote].join("\n");
    onSave({...hf,source:"historical",status:"Decided",decided:hf.date||"Pre-portal",opened:hf.date||"Pre-portal",decisionDraft:draft,votes:{},tier:3});
  }
  return(
    <div className="modal-backdrop" onClick={function(e){if(e.target===e.currentTarget)onClose();}}>
      <div className="modal" style={{width:640}}>
        <div className="modal-title">Add Historical Precedent</div>
        <div className="modal-sub">Record a Committee or CGO decision that pre-dates this portal. It will appear in the Precedent Register with a "Pre-portal" badge.</div>
        <div className="fr">
          <div className="fg"><label className="lbl">Case / Reference # *</label><input className="inp" value={hf.ref} onChange={uf("ref")} placeholder="e.g. ICC-2025-001 or descriptive name"/></div>
          <div className="fg"><label className="lbl">Date of Decision</label><input className="inp" value={hf.date} onChange={uf("date")} placeholder="e.g. Nov 15, 2025"/></div>
        </div>
        <div className="fr">
          <div className="fg"><label className="lbl">Participant (optional)</label><input className="inp" value={hf.participant} onChange={uf("participant")}/></div>
          <div className="fg"><label className="lbl">Plan Period</label><input className="inp" value={hf.planPeriod} onChange={uf("planPeriod")} placeholder="e.g. 2025 2H"/></div>
        </div>
        <div className="fg"><label className="lbl">Trigger Type *</label>
          <select className="sel" value={hf.trigger} onChange={uf("trigger")}>
            <option value="">Select...</option>
            {TRIGGERS.map(function(t){return <option key={t}>{t}</option>;})}
            <option value="Other / Pre-policy">Other / Pre-policy</option>
          </select>
        </div>
        <div className="fg"><label className="lbl">Determination / Outcome *</label>
          <textarea className="ta" rows={3} value={hf.outcome} onChange={uf("outcome")} placeholder="State what was decided and at what amount or treatment."/>
        </div>
        <div className="fg"><label className="lbl">Committee Rationale</label>
          <textarea className="ta" rows={3} value={hf.rationale} onChange={uf("rationale")} placeholder="Summarize the reasoning behind the ruling."/>
        </div>
        <div className="fg"><label className="lbl">Precedent Note</label>
          <textarea className="ta" rows={2} value={hf.precedentNote} onChange={uf("precedentNote")} placeholder="Describe the principle established and when it applies."/>
        </div>
        <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-p" onClick={handleSave} disabled={!valid}>Add to Register</button>
        </div>
      </div>
    </div>
  );
}

// ── CASE ENRICHMENT MODAL (for imported cases) ────────────────────────────────
function CaseEnrichmentModal({c, onSave, onClose}){
  const [ef, setEf] = useState({
    repEmail: c.repEmail||"",
    policyIssue: c.policyIssue||"",
    cgoOpinion: c.cgoOpinion||"",
    advisory: c.advisory||"",
    docLink: c.docLink||"",
  });
  function uf(k){return function(e){setEf(function(p){return {...p,[k]:e.target.value};});};}
  return(
    <div className="modal-backdrop" onClick={function(e){if(e.target===e.currentTarget)onClose();}}>
      <div className="modal" style={{width:640}}>
        <div className="modal-title">Complete Case Before Accepting</div>
        <div className="modal-sub">Add any context SalesOps or the CGO can provide before this case goes to the Committee. All fields are optional -- you can also complete them from the Case Detail view after accepting.</div>
        <div className="fg"><label className="lbl">Rep Email</label>
          <input className="inp" value={ef.repEmail} onChange={uf("repEmail")} placeholder="rep@alianza.com -- pre-populates notification emails"/>
        </div>
        <div className="fg"><label className="lbl">Plan / Policy Provision at Issue</label>
          <textarea className="ta" rows={2} value={ef.policyIssue} onChange={uf("policyIssue")} placeholder="Cite relevant 2026 1H Plan sections or Alianza Booking Definition Policy..."/>
        </div>
        <div className="fg"><label className="lbl">CGO Advisory Opinion</label>
          <textarea className="ta" rows={3} value={ef.cgoOpinion} onChange={uf("cgoOpinion")} placeholder="Recommended outcome and rationale. Advisory only -- does not bind the Committee."/>
        </div>
        <div className="fg"><label className="lbl">Advisory Resource (if applicable)</label>
          <input className="inp" value={ef.advisory} onChange={uf("advisory")} placeholder="e.g. EVP Customer Success, SVP GTM Strategy and Operations"/>
        </div>
        <div className="fg"><label className="lbl">Supporting Documents (SharePoint / OneDrive link)</label>
          <input className="inp" value={ef.docLink} onChange={uf("docLink")} placeholder="Paste a SharePoint or OneDrive sharing link"/>
        </div>
        <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-ok" onClick={function(){onSave(ef);}}>Accept and Open Case</button>
        </div>
      </div>
    </div>
  );
}

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
function Dashboard({cases,onGo,onImport}){
  const [showImport,setShowImport]=useState(false);
  const open=cases.filter(function(c){return ["Open","In Review","Pending Review"].includes(c.status);}).length;
  const pending=cases.filter(function(c){return c.status==="Pending Review";}).length;
  function handleImport(parsed){setShowImport(false);onImport(parsed);}
  return(
    <div style={{position:"relative"}}>
      {showImport&&<ImportModal onImport={handleImport} onClose={function(){setShowImport(false);}}/>}
      <div className="page">
        <div className="page-title">Case Dashboard</div>
        <div className="page-sub">All Incentive Compensation Committee cases across all tiers.</div>
        {pending>0&&(
          <Cob variant="purple">{pending} case{pending>1?"s":""} pending SalesOps review. Open to accept or reject.</Cob>
        )}
        {cases.filter(function(c){return c.status==="Open"||c.status==="In Review";}).some(function(c){
          const d=slaDay(c); return d>=10;
        })&&(
          <Cob variant="warn">One or more open cases are approaching the 15 business day deadline. Review the Case Log for cases flagged in red.</Cob>
        )}
        <div className="stats">
          {[["Total Cases",cases.length,"#1072ba"],["Open / In Review",open,"#fdb73e"],["Pending Review",pending,"#9b59b6"],["Decided",cases.filter(function(c){return c.status==="Decided";}).length,"#8bad44"]].map(function(item){
            return <div key={item[0]} className="stat" style={{borderTopColor:item[2]}}><div className="stat-n">{item[1]}</div><div className="stat-l">{item[0]}</div></div>;
          })}
        </div>
        <div className="card">
          <div className="card-hd">All Cases
            <div className="card-hd-btns">
              <button className="btn btn-sm" onClick={function(){
                const open=cases.filter(function(c){return c.status==="Open"||c.status==="In Review";});
                const payload=JSON.stringify(open.map(function(c){return {ref:c.ref,participant:c.participant,trigger:c.trigger,opened:c.opened,slaDay:slaDay(c),status:c.status};}),null,2);
                fallbackCopy(payload,"sla-status");
                alert("Case status copied to clipboard. Paste into your Power Automate SLA flow variable.");
              }} title="Copy open case status for Power Automate SLA flow">Copy Status for PA</button>
              <button className="btn btn-sm" onClick={function(){setShowImport(true);}}>Import from Email</button>
              <button className="btn btn-p btn-sm" onClick={function(){onGo("new");}}>+ New Case</button>
            </div>
          </div>
          {cases.length===0
            ?<div className="empty"><div style={{fontSize:22,marginBottom:8}}>◎</div><div style={{fontSize:13,fontWeight:500}}>No cases yet</div><div style={{fontSize:11,marginTop:4}}>Open a new case or import from the M365 intake form.</div></div>
            :<table><thead><tr><th>Reference</th><th>Participant</th><th>Trigger</th><th>Tier</th><th>Status</th><th>SLA</th><th>Source</th><th>Opened</th></tr></thead>
              <tbody>{cases.map(function(c){return(
                <tr key={c.ref} className="trow" onClick={function(){onGo("detail",c.ref);}}>
                  <td style={{fontFamily:"monospace",fontSize:11,fontWeight:600,color:"#17477e"}}>{c.ref}</td>
                  <td>{c.participant||"—"}</td>
                  <td><Pill label={(c.trigger||"—").slice(0,24)} cls="p-navy"/></td>
                  <td><Pill label={c.tier?"T"+c.tier:"—"} cls={TIER_CLS[c.tier]||"p-gray"}/></td>
                  <td><span className="dot" style={{background:STATUS_COLOR[c.status]||"#999"}}/>{c.status}</td>
                  <td>{(function(){
                    if(c.status!=="Open"&&c.status!=="In Review") return <span style={{color:"#8a969c",fontSize:11}}>—</span>;
                    const d=slaDay(c);
                    const col=d>=14?"#c0392b":d>=10?"#e67e22":"#3a5a00";
                    const bg=d>=14?"#c0392b15":d>=10?"#fdb73e15":"#8bad4415";
                    return <span style={{fontSize:11,fontWeight:600,color:col,background:bg,padding:"2px 6px",borderRadius:4}}>Day {d} of 15</span>;
                  })()}</td>
                  <td>{c.source==="historical"?<Pill label="Pre-portal" cls="p-purple"/>:c.source==="import"?<Pill label="M365 Form" cls="p-blue"/>:<span style={{color:"#8a969c",fontSize:11}}>Manual</span>}</td>
                  <td style={{color:"#8a969c"}}>{c.opened}</td>
                </tr>
              );})}</tbody>
            </table>
          }
        </div>
      </div>
    </div>
  );
}

// ── NEW CASE ──────────────────────────────────────────────────────────────────
function NewCase({onSave,onBack}){
  const [fd,setFd]=useState(EMPTY_FORM);
  const [tier,setTier]=useState(null);
  const [note,setNote]=useState("");
  const [showRefs,setShowRefs]=useState(false);
  function uf(k){return function(e){setFd(function(p){return {...p,[k]:e.target.value};});};}
  function doClassify(){
    if(!fd.trigger)return;
    const r=classifyLocal(fd.trigger,fd.dealValue);
    setTier(r.tier);setNote(r.note);
    if(PLAN_REFS[fd.trigger])setShowRefs(true);
  }
  function handleSave(){
    if(!fd.participant||!fd.trigger||!tier)return;
    onSave({...fd,tier,ref:genRef(tier),status:"Open",opened:todayStr(),decisionDraft:"",votes:{}});
  }
  const dis=!fd.participant||!fd.trigger||!tier;
  return(
    <div className="page" style={{maxWidth:760}}>
      <button className="back-btn" onClick={onBack}>← Back</button>
      <div className="page-title">Open New Case</div>
      <div className="page-sub">Complete all required fields, then classify the tier.</div>
      <div className="card"><div style={{padding:"16px 20px"}}>
        <SBar label="A -- Participant"/>
        <div className="fr">
          <div className="fg"><label className="lbl">Participant Name *</label><input className="inp" value={fd.participant} onChange={uf("participant")}/></div>
          <div className="fg"><label className="lbl">Title / Role *</label><input className="inp" value={fd.role} onChange={uf("role")}/></div>
          <div className="fg"><label className="lbl">Direct Manager *</label><input className="inp" value={fd.manager} onChange={uf("manager")}/></div>
          <div className="fg"><label className="lbl">Plan Period</label>
            <select className="sel" value={fd.planPeriod} onChange={uf("planPeriod")}>
              <option>2026 1H</option><option>2026 2H</option><option>2025 2H</option>
            </select>
          </div>
          <div className="fg"><label className="lbl">Rep Email</label><input className="inp" value={fd.repEmail} onChange={uf("repEmail")} placeholder="rep@alianza.com -- used to pre-populate notification emails"/></div>
        </div>
        <SBar label="B -- Trigger"/>
        <div className="fg"><label className="lbl">Trigger Type *</label>
          <select className="sel" value={fd.trigger} onChange={uf("trigger")}>
            <option value="">Select...</option>
            {TRIGGERS.map(function(t){return <option key={t}>{t}</option>;})}
          </select>
        </div>
        <div className="fg"><label className="lbl">Deal / Event Description *</label>
          <textarea className="ta" rows={3} value={fd.dealDesc} onChange={uf("dealDesc")} placeholder="Customer, product(s), booking date, relevant context..."/>
        </div>
        <div className="fr">
          <div className="fg"><label className="lbl">Deal Value ($) *</label><input className="inp" value={fd.dealValue} onChange={uf("dealValue")} placeholder="e.g. 1,250,000"/></div>
          <div className="fg"><label className="lbl">Rep Quota ($)</label><input className="inp" value={fd.quota} onChange={uf("quota")} placeholder="Required for >= 50% trigger"/></div>
          <div className="fg"><label className="lbl">Comp Claimed by Rep ($)</label><input className="inp" value={fd.compClaimed} onChange={uf("compClaimed")}/></div>
          <div className="fg"><label className="lbl">Comp Calculated (CommOps) ($)</label><input className="inp" value={fd.compCalculated} onChange={uf("compCalculated")}/></div>
        </div>
        <SBar label="C -- Policy Context"/>
        {showRefs&&tier&&<PlanRefsPanel trigger={fd.trigger}/>}
        <div className="fg"><label className="lbl">Plan / Policy Provision at Issue</label>
          <textarea className="ta" rows={3} value={fd.policyIssue} onChange={uf("policyIssue")} placeholder="Cite 2026 1H Plan sections or Alianza Booking Definition Policy (Jan 1, 2026 and successor policies)..."/>
        </div>
        <div className="fg">
          <label className="lbl">Supporting Documents (SharePoint / OneDrive link)</label>
          <input className="inp" value={fd.docLink} onChange={uf("docLink")} placeholder="Paste a SharePoint or OneDrive sharing link to any supporting documents"/>
          <div style={{fontSize:10,color:"#8a969c",marginTop:4}}>Upload documents to SharePoint first, then paste the sharing link here. The link will be accessible from the case detail view.</div>
        </div>
        <SBar label="D -- CGO Advisory"/>
        <div className="fg"><label className="lbl">CGO Advisory Opinion</label>
          <textarea className="ta" rows={3} value={fd.cgoOpinion} onChange={uf("cgoOpinion")} placeholder="Recommended outcome and rationale. Advisory only -- does not bind the Committee."/>
        </div>
        <div className="fg"><label className="lbl">Advisory Resource (if applicable)</label>
          <input className="inp" value={fd.advisory} onChange={uf("advisory")} placeholder="e.g. EVP Customer Success, SVP GTM Strategy and Operations"/>
        </div>
        <SBar label="E -- Tier Classification"/>
        <Cob>Click Classify to determine the tier and surface relevant plan provisions. Override if needed.</Cob>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
          <button className="btn btn-p btn-sm" onClick={doClassify} disabled={!fd.trigger}>Classify Tier</button>
          {tier&&<Pill label={"Tier "+tier} cls={TIER_CLS[tier]||"p-gray"}/>}
        </div>
        {tier&&<>
          <div style={{display:"flex",gap:8,marginBottom:8}}>
            {[1,2,3].map(function(n){return <button key={n} className={"tb"+(tier===n?" t"+n+"a":"")} onClick={function(){setTier(n);}}>Tier {n}</button>;} )}
          </div>
          <Cob variant={tier===3?"":tier===2?"warn":"ok"}>{note}</Cob>
        </>}
        <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:8}}>
          <button className="btn" onClick={onBack}>Cancel</button>
          <button className="btn btn-p" onClick={handleSave} disabled={dis}>Open Case</button>
        </div>
      </div></div>
    </div>
  );
}

// ── CASE DETAIL ───────────────────────────────────────────────────────────────
function CaseDetail({c,onPatch,onBack}){
  const [tab,setTab]=useState("overview");
  const [cgoMemo,setCgoMemo]=useState({resolution:"",payoutImpact:"",effectiveDate:"",methodology:"",precedentRef:"",equityChecks:{}});
  const [prep,setPrep]=useState({repEmail:"",policyIssue:"",cgoOpinion:"",advisory:"",docLink:""});
  const [disposition,setDisposition]=useState("");

  useEffect(function(){
    if(c&&c.cgoMemo) setCgoMemo(c.cgoMemo);
    if(c) setPrep({
      repEmail:c.repEmail||"",
      policyIssue:c.policyIssue||"",
      cgoOpinion:c.cgoOpinion||"",
      advisory:c.advisory||"",
      docLink:c.docLink||"",
      assignedTo:c.assignedTo||"",
    });
    if(c&&c.disposition) setDisposition(c.disposition);
  },[c&&c.ref]);

  if(!c) return <div className="page"><div className="empty">Case not found.<br/><button className="btn" style={{marginTop:12}} onClick={onBack}>Back</button></div></div>;

  const votes=c.votes||{};
  const inf=Object.values(votes).filter(function(v){return v==="In Favor";}).length;
  const ag=Object.values(votes).filter(function(v){return v==="Against";}).length;
  const quorum=Object.keys(votes).length===3;
  const decided=quorum&&(inf>=2||ag>=2);
  const isPending=c.status==="Pending Review";
  const allEquityChecked=cgoMemo.equityChecks[0]&&cgoMemo.equityChecks[1]&&cgoMemo.equityChecks[2]&&cgoMemo.equityChecks[3];

  function upPrep(k){return function(e){setPrep(function(p){return {...p,[k]:e.target.value};});};}
  function savePrep(){onPatch(c.ref,{...prep});}
  function submitToCommittee(){
    onPatch(c.ref,{...prep,status:"Open",...appendAudit(c,"Submitted to Committee by SalesOps")});
    window.location.href=buildAcceptEmail({...c,...prep});
  }
  function recordVote(member,vote){onPatch(c.ref,{votes:{...votes,[member]:vote}});}
  const [dispSaved,setDispSaved]=useState(false);
  function saveDisposition(){
    onPatch(c.ref,{disposition});
    setDispSaved(true);
    setTimeout(function(){setDispSaved(false);},2500);
  }
  function finalize(){onPatch(c.ref,{status:"Decided",decided:todayStr(),disposition,...appendAudit(c,"Decision finalized. Vote: "+inf+" in favor / "+ag+" against. Disposition: "+disposition)});}
  function saveCgoMemo(){onPatch(c.ref,{cgoMemo,status:"Decided",decided:todayStr()});}
  function loadTemplate(){onPatch(c.ref,{decisionDraft:drTemplate(c,inf,ag)});}
  function rejectCase(){
    const reason=window.prompt("Rejection reason:\n\n1. Does not meet Tier 3 trigger criteria\n2. Insufficient information -- resubmit with supporting documentation\n3. Duplicate of an existing open case\n4. Matter resolved through other means\n5. Other");
    if(reason===null)return;
    onPatch(c.ref,{status:"Closed",rejectedReason:reason,decided:todayStr(),...appendAudit(c,"Case rejected by SalesOps. Reason: "+reason)});
    window.location.href=buildRejectEmail({...c,...prep},reason);
  }
  function sendDecision(){
    window.location.href=buildDecisionEmail({...c,...prep},inf,ag);
  }

  const baseTabs = c.tier===2
    ? [["overview","Case Overview"],["prepare","Case Preparation"],["cgo","CGO Memo"],["decision","Decision Record"]]
    : [["overview","Case Overview"],["prepare","Case Preparation"],["committee","Committee Action"],["decision","Decision Record"]];
  const tabList = isPending
    ? [["overview","Case Overview"],["prepare","Case Preparation"]]
    : baseTabs;

  return(
    <div className="page" style={{maxWidth:880}}>
      <button className="back-btn" onClick={onBack}>\u2190 Back to Case Dashboard</button>

      {isPending&&(
        <div className="cob cob-purple" style={{marginBottom:16}}>
          <strong>Pending Review</strong> -- Imported from the M365 intake form. Use the Case Preparation tab to add policy context, CGO opinion, and supporting documents. Click Submit to Committee when ready. To close without proceeding, use Reject below.
          <div style={{display:"flex",gap:8,marginTop:10}}>
            <button className="btn btn-danger btn-sm" onClick={rejectCase}>Reject -- opens notification email</button>
          </div>
        </div>
      )}

      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
        <div>
          <div style={{fontSize:20,fontWeight:400,color:"#17477e",marginBottom:6}}>{c.participant||"Unnamed"}</div>
          <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
            <span style={{fontFamily:"monospace",fontSize:11,color:"#8a969c"}}>{c.ref}</span>
            {c.tier&&<Pill label={"Tier "+c.tier} cls={TIER_CLS[c.tier]||"p-gray"}/>}
            <span><span className="dot" style={{background:STATUS_COLOR[c.status]||"#999"}}/>{c.status}</span>
            {c.source==="historical"&&<Pill label="Pre-portal" cls="p-purple"/>}
            {c.source==="import"&&<Pill label="M365 Form" cls="p-blue"/>}
            <span style={{fontSize:11,color:"#8a969c"}}>Opened {c.opened}</span>
            {(c.assignedTo||prep.assignedTo)&&<span style={{fontSize:11,color:"#8a969c"}}>Assigned: {c.assignedTo||prep.assignedTo}</span>}
            {(c.status==="Open"||c.status==="In Review")&&(function(){
              const d=slaDay(c);
              const col=d>=14?"#c0392b":d>=10?"#e67e22":"#3a5a00";
              const bg=d>=14?"#c0392b15":d>=10?"#fdb73e15":"#8bad4415";
              return <span style={{fontSize:11,fontWeight:600,color:col,background:bg,padding:"2px 6px",borderRadius:4}}>Day {d} of 15</span>;
            })()}
          </div>
        </div>
        <div style={{display:"flex",gap:8}}>
          {c.status!=="Decided"&&c.status!=="Closed"&&!isPending&&decided&&c.tier===3&&(
            <button className="btn btn-p btn-sm" onClick={finalize}>Finalize Decision</button>
          )}
          {c.status==="Decided"&&(
            <button className="btn btn-sm" onClick={function(){downloadDecisionPDF(c);}}>Download Decision Record</button>
          )}
          {c.status==="Decided"&&(
            <button className="btn btn-sm" onClick={sendDecision}>Send Decision to Rep</button>
          )}
        </div>
      </div>

      <div className="tabs">
        {tabList.map(function(item){return(
          <button key={item[0]} className={"tab"+(tab===item[0]?" act":"")} onClick={function(){setTab(item[0]);}}>{item[1]}</button>
        );}) }
      </div>

      {tab==="overview"&&(
        <>
          <div className="dg">
            <div className="card" style={{padding:16}}>
              <SBar label="Participant"/>
              <DF label="Name" value={c.participant}/><DF label="Role" value={c.role}/>
              <DF label="Manager" value={c.manager}/><DF label="Plan Period" value={c.planPeriod}/>
              {(c.repEmail||prep.repEmail)&&<DF label="Email" value={c.repEmail||prep.repEmail}/>}
            </div>
            <div className="card" style={{padding:16}}>
              <SBar label="Financials"/>
              <DF label="Deal Value" value={c.dealValue?"$"+c.dealValue:null}/>
              <DF label="Comp Claimed" value={c.compClaimed?"$"+c.compClaimed:null}/>
              <DF label="Comp (CommOps)" value={c.compCalculated?"$"+c.compCalculated:null}/>
              {(c.advisory||prep.advisory)&&<DF label="Advisory Resource" value={c.advisory||prep.advisory}/>}
            </div>
          </div>
          <div className="card" style={{padding:16,marginBottom:12}}>
            <SBar label="Deal Description"/>
            <div style={{fontSize:12,lineHeight:1.7}}>{c.dealDesc||<em style={{color:"#8a969c"}}>Not provided</em>}</div>
          </div>
          {(c.docLink||prep.docLink)&&(
            <div className="card" style={{padding:16,marginBottom:12}}>
              <SBar label="Supporting Documents"/>
              <a href={c.docLink||prep.docLink} target="_blank" rel="noreferrer" style={{fontSize:12,color:"#1072ba",wordBreak:"break-all"}}>{c.docLink||prep.docLink}</a>
              <div style={{fontSize:10,color:"#8a969c",marginTop:4}}>Opens in SharePoint / OneDrive</div>
            </div>
          )}
          <div className="card" style={{padding:16}}>
            <SBar label="Policy Context and Plan Provisions"/>
            <div style={{fontSize:12,lineHeight:1.7,marginBottom:12}}>
              {(c.policyIssue||prep.policyIssue)||<em style={{color:"#8a969c"}}>Not provided -- complete in Case Preparation tab</em>}
            </div>
            <SBar label="CGO Advisory Opinion"/>
            <div style={{fontSize:12,lineHeight:1.7}}>
              {(c.cgoOpinion||prep.cgoOpinion)||<em style={{color:"#8a969c"}}>Not provided -- complete in Case Preparation tab</em>}
            </div>
          </div>
          {c.auditLog&&c.auditLog.length>0&&(
            <div className="card" style={{padding:16}}>
              <SBar label="Case Activity Log"/>
              {c.auditLog.map(function(entry,i){return(
                <div key={i} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"6px 0",borderBottom:i<c.auditLog.length-1?"1px solid #f0f4f8":"none"}}>
                  <span style={{fontSize:10,color:"#8a969c",whiteSpace:"nowrap",minWidth:90}}>{entry.split(" -- ")[0]}</span>
                  <span style={{fontSize:12,color:"#5a646a"}}>{entry.split(" -- ").slice(1).join(" -- ")}</span>
                </div>
              );})}
            </div>
          )}
        </>
      )}

      {tab==="prepare"&&(
        <div className="card" style={{padding:16}}>
          <div style={{fontSize:13,fontWeight:500,color:"#17477e",marginBottom:4}}>Case Preparation</div>
          <div style={{fontSize:11,color:"#8a969c",marginBottom:16,lineHeight:1.5}}>
            {isPending
              ? "Complete these fields before submitting to the Committee. Save progress at any time. When ready, click Submit to Committee -- this will open the acceptance email to the rep and move the case to Open."
              : "Edit case context at any time. Use Save Progress to update the case record."}
          </div>
          <SBar label="Rep Contact"/>
          <div className="fg"><label className="lbl">Rep Email {c.source==="import"&&prep.repEmail&&<span style={{fontSize:10,color:"#8bad44",marginLeft:6}}>from form</span>}</label>
            <input className="inp" value={prep.repEmail} onChange={upPrep("repEmail")} placeholder="rep@alianza.com -- pre-populates To: field on all notification emails"
              style={c.source==="import"&&prep.repEmail?{background:"#f8fafc",color:"#3a5a00"}:{}}/>
            {c.source==="import"&&prep.repEmail&&<div style={{fontSize:10,color:"#8a969c",marginTop:3}}>Auto-populated from form submission. Edit only if incorrect.</div>}
          </div>
          <div className="fg"><label className="lbl">Assigned To</label>
            <input className="inp" value={prep.assignedTo} onChange={upPrep("assignedTo")} placeholder="SalesOps or CGO name responsible for next action"/>
          </div>
          <SBar label="Policy Context"/>
          <div className="fg"><label className="lbl">Plan / Policy Provision at Issue</label>
            <textarea className="ta" rows={3} value={prep.policyIssue} onChange={upPrep("policyIssue")} placeholder="Cite relevant 2026 1H Plan sections or Alianza Booking Definition Policy (Jan 1, 2026 and successor policies)..."/>
          </div>
          <SBar label="CGO Advisory"/>
          <div className="fg"><label className="lbl">CGO Advisory Opinion</label>
            <textarea className="ta" rows={4} value={prep.cgoOpinion} onChange={upPrep("cgoOpinion")} placeholder="Recommended outcome and rationale. Advisory only -- does not bind the Committee. The CGO should complete this before the case goes to vote."/>
          </div>
          <div className="fg"><label className="lbl">Advisory Resource (if applicable)</label>
            <input className="inp" value={prep.advisory} onChange={upPrep("advisory")} placeholder="e.g. EVP Customer Success, SVP GTM Strategy and Operations"/>
          </div>
          <SBar label="Supporting Documents"/>
          <div className="fg">
            <label className="lbl">SharePoint / OneDrive Link</label>
            <input className="inp" value={prep.docLink} onChange={upPrep("docLink")} placeholder="Paste a sharing link to supporting documents (contracts, booking records, commission statements)"/>
            <div style={{fontSize:10,color:"#8a969c",marginTop:4}}>Upload to SharePoint first, then paste the link. Accessible to all Committee members from Case Overview.</div>
          </div>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:8}}>
            <button className="btn btn-sm" onClick={savePrep}>Save Progress</button>
            {isPending&&(
              <button className="btn btn-ok" onClick={submitToCommittee}>Submit to Committee -- opens acceptance email</button>
            )}
          </div>
        </div>
      )}

      {tab==="cgo"&&c.tier===2&&(
        <div className="card" style={{padding:16}}>
          <div style={{fontSize:13,fontWeight:500,color:"#17477e",marginBottom:4}}>CGO Exception Memo</div>
          <div style={{fontSize:11,color:"#8a969c",marginBottom:16}}>Complete all sections. Retained in the ICC archive. Must be consistent with the Precedent Register.</div>
          <SBar label="1 -- Resolution Mechanism"/>
          <Cob>Select the resolution type. Appears in the Precedent Register and Case Log.</Cob>
          <ResolutionSelector value={cgoMemo.resolution} onChange={function(v){setCgoMemo(function(p){return {...p,resolution:v};});}}/>
          <SBar label="2 -- Payout Impact"/>
          <div className="fr">
            <div className="fg"><label className="lbl">Payout Impact ($) *</label>
              <input className="inp" value={cgoMemo.payoutImpact} onChange={function(e){setCgoMemo(function(p){return {...p,payoutImpact:e.target.value};});}} placeholder="Delta between CommOps calc and CGO ruling"/>
            </div>
            <div className="fg"><label className="lbl">Effective Date</label>
              <input className="inp" value={cgoMemo.effectiveDate||""} onChange={function(e){setCgoMemo(function(p){return {...p,effectiveDate:e.target.value};});}} placeholder="e.g. April 30, 2026"/>
            </div>
          </div>
          {cgoMemo.payoutImpact&&(parseFloat(String(cgoMemo.payoutImpact).replace(/[^0-9.]/g,""))>50000)&&(
            <Cob variant="err">Payout impact exceeds $50,000. Must escalate to full Committee (Tier 3).</Cob>
          )}
          <SBar label="3 -- Methodology and Rationale"/>
          <div className="fg"><label className="lbl">Rationale *</label>
            <textarea className="ta" rows={4} value={cgoMemo.methodology} onChange={function(e){setCgoMemo(function(p){return {...p,methodology:e.target.value};});}} placeholder="Explain the plan interpretation applied, why this resolution is appropriate, and the policy basis."/>
          </div>
          <SBar label="4 -- Precedent Reference"/>
          <Cob>Search the Precedent Register, find the relevant entry, click Copy Reference, and paste below.</Cob>
          <div className="fg"><label className="lbl">Precedent Citation</label>
            <textarea className="ta" rows={3} value={cgoMemo.precedentRef} onChange={function(e){setCgoMemo(function(p){return {...p,precedentRef:e.target.value};});}} placeholder={"ICC-2025-014 -- Rep-Filed Dispute -- 2025 2H\nResolution: Partial commission (60%), no quota retirement\nConsistent with this ruling: Yes"}/>
          </div>
          <div style={{fontSize:10,color:"#8a969c",marginBottom:14,fontStyle:"italic"}}>If this ruling departs from prior treatment, document the distinguishing facts above.</div>
          <SBar label="5 -- Equity Attestation"/>
          <Cob variant="gold">All four items must be checked before saving.</Cob>
          <EquityAttestation checks={cgoMemo.equityChecks} onChange={function(v){setCgoMemo(function(p){return {...p,equityChecks:v};});}}/>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:16}}>
            <button className="btn btn-p" onClick={saveCgoMemo} disabled={!cgoMemo.resolution||!cgoMemo.methodology||!allEquityChecked}>
              {!allEquityChecked?"Complete equity attestation to save":"Save Memo and Close Case"}
            </button>
          </div>
        </div>
      )}

      {tab==="committee"&&c.tier===3&&(
        <>
          {c.source==="historical"
            ?<Cob variant="purple">Pre-portal historical record. Voting not applicable.</Cob>
            :<>
              <Cob>All three voting members must record their vote. Simple majority (2 of 3) determines the outcome.</Cob>
              {["COO (Chair)","CFO","CLO"].map(function(m){
                const v=votes[m];
                return(
                  <div key={m} className="vrow">
                    <div><div style={{fontSize:13,fontWeight:500}}>{m}</div><div style={{fontSize:10,color:"#8a969c",marginTop:1}}>Voting Member</div></div>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      {v&&<Pill label={v} cls={v==="In Favor"?"p-green":v==="Against"?"p-red":"p-gold"}/>}
                      {c.status!=="Decided"&&<div className="vbtns">
                        {[["In Favor","vb-f"],["Against","vb-a"],["Recused","vb-r"]].map(function(item){return(
                          <button key={item[0]} className={"vb"+(v===item[0]?" "+item[1]:"")} onClick={function(){recordVote(m,item[0]);}}>{item[0]}</button>
                        );} )}
                      </div>}
                    </div>
                  </div>
                );
              })}
              {quorum&&(
                <Cob variant={decided?(inf>=2?"ok":"err"):"warn"}>
                  {decided
                    ?(inf>=2?"Approved "+inf+"-"+ag+". Select the disposition below, then click Finalize Decision.":"Denied "+ag+"-"+inf+".")
                    :"Voting in progress -- "+Object.keys(votes).length+"/3 votes recorded."}
                </Cob>
              )}
              <SBar label="Disposition"/>
              <Cob>Record the resolution the Committee has approved. This populates the Precedent Register and Case Log.</Cob>
              <ResolutionSelector value={disposition} onChange={function(v){setDisposition(v);}}/>
              {disposition&&c.status!=="Decided"&&(
                <div style={{display:"flex",gap:10,justifyContent:"flex-end",alignItems:"center",marginTop:8}}>
                  {dispSaved&&<span style={{fontSize:11,color:"#3a5a00"}}>Disposition saved</span>}
                  <button className={"btn btn-sm"+(dispSaved?" btn-ok":"")} onClick={saveDisposition}>
                    {dispSaved?"Saved ✓":"Save Disposition"}
                  </button>
                </div>
              )}
            </>
          }
        </>
      )}

      {tab==="decision"&&(
        <div className="card" style={{padding:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
            <div>
              <div style={{fontSize:13,fontWeight:500,color:"#17477e"}}>Decision Record</div>
              <div style={{fontSize:11,color:"#8a969c",marginTop:2}}>Complete all four sections. CGO reviews before distributing.</div>
            </div>
            {c.source!=="historical"&&<button className="btn btn-sm" onClick={loadTemplate}>{c.decisionDraft?"Reset Template":"Load Template"}</button>}
          </div>
          {!c.decisionDraft&&<Cob variant="gold">Click Load Template to populate the structure with case details pre-filled.</Cob>}
          {c.decisionDraft&&(
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:12}}>
              {[["Vote",inf+" in favor / "+ag+" against"],["Reference",c.ref],["Plan Period",c.planPeriod||"\u2014"]].map(function(item){return(
                <div key={item[0]} style={{background:"#f8fafc",borderRadius:6,padding:"10px 12px",border:"1px solid #e8edf2"}}>
                  <div style={{fontSize:10,textTransform:"uppercase",letterSpacing:"0.07em",color:"#8a969c",marginBottom:3}}>{item[0]}</div>
                  <div style={{fontSize:12,fontWeight:500}}>{item[1]}</div>
                </div>
              );})}
            </div>
          )}
          <textarea className="dr-area" value={c.decisionDraft||""} onChange={function(e){onPatch(c.ref,{decisionDraft:e.target.value});}} placeholder="Click Load Template above, or type directly here." rows={16}/>
          <div style={{fontSize:10,color:"#8a969c",marginTop:6,fontStyle:"italic"}}>Retain in the ICC archive per the Committee Charter.</div>
        </div>
      )}
    </div>
  );
}

function fallbackCopy(text, ref) {
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  } catch(e) {}
}

// ── PRECEDENTS ────────────────────────────────────────────────────────────────
function Precedents({cases,onAddHistorical}){
  const [showModal,setShowModal]=useState(false);
  const [search,setSearch]=useState("");
  const [filterTrigger,setFilterTrigger]=useState("");
  const [filterRes,setFilterRes]=useState("");
  const [copiedRef,setCopiedRef]=useState(null);

  const ps=cases.filter(function(c){return (c.status==="Decided"||c.source==="historical")&&c.decisionDraft;});

  const filtered=ps.filter(function(c){
    const matchSearch=!search||
      (c.ref&&c.ref.toLowerCase().includes(search.toLowerCase()))||
      (c.participant&&c.participant.toLowerCase().includes(search.toLowerCase()))||
      (c.decisionDraft&&c.decisionDraft.toLowerCase().includes(search.toLowerCase()));
    const matchTrigger=!filterTrigger||c.trigger===filterTrigger;
    const matchRes=!filterRes||(c.cgoMemo&&c.cgoMemo.resolution===filterRes);
    return matchSearch&&matchTrigger&&matchRes;
  });

  function copyRef(c){
    const res=c.cgoMemo&&c.cgoMemo.resolution
      ? RESOLUTION_OPTIONS.find(function(r){return r.id===c.cgoMemo.resolution;})
      : null;
    const determination=(c.decisionDraft||"").split("\n").find(function(l){return l.startsWith("DETERMINATION:");}) || "";
    const lines=[
      c.ref+" -- "+(c.trigger||"Unknown trigger")+" -- "+(c.planPeriod||""),
      "Resolution: "+(res?res.label:"See decision record"),
      determination,
      "Consistent with this ruling: Yes / No -- if No, explain:",
    ];
    const text=lines.join("\n");
    try {
      if(navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function(){
          setCopiedRef(c.ref);
          setTimeout(function(){setCopiedRef(null);},2000);
        }).catch(function(){
          fallbackCopy(text, c.ref);
        });
      } else {
        fallbackCopy(text, c.ref);
      }
    } catch(e) {
      fallbackCopy(text, c.ref);
    }
  }

  function handleSave(entry){setShowModal(false);onAddHistorical(entry);}

  return(
    <div style={{position:"relative"}}>
      {showModal&&<HistoricalModal onSave={handleSave} onClose={function(){setShowModal(false);}}/>}
      <div className="page">
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
          <div>
            <div className="page-title">Precedent Register</div>
            <div className="page-sub" style={{marginBottom:0}}>Search for a prior ruling, then click Copy Reference to paste into a CGO memo.</div>
          </div>
          <button className="btn btn-sm" style={{flexShrink:0,marginTop:4}} onClick={function(){setShowModal(true);}}>+ Add Historical</button>
        </div>

        <div className="search-bar">
          <input className="inp" style={{flex:1}} value={search} onChange={function(e){setSearch(e.target.value);}} placeholder="Search by reference, participant, or keyword..."/>
          <select className="sel" style={{width:220}} value={filterTrigger} onChange={function(e){setFilterTrigger(e.target.value);}}>
            <option value="">All trigger types</option>
            {TRIGGERS.map(function(t){return <option key={t} value={t}>{t.slice(0,32)}</option>;})}
          </select>
          <select className="sel" style={{width:200}} value={filterRes} onChange={function(e){setFilterRes(e.target.value);}}>
            <option value="">All resolutions</option>
            {RESOLUTION_OPTIONS.map(function(r){return <option key={r.id} value={r.id}>{r.label.slice(0,28)}</option>;})}
          </select>
        </div>

        {filtered.length===0
          ?<div className="card"><div className="empty">
            <div style={{fontSize:22,marginBottom:8}}>⊞</div>
            <div style={{fontSize:13,fontWeight:500}}>{ps.length===0?"No precedents yet":"No results match your filters"}</div>
            {ps.length===0&&<button className="btn btn-sm" style={{marginTop:12}} onClick={function(){setShowModal(true);}}>+ Add a historical precedent</button>}
          </div></div>
          :filtered.map(function(c){
            const res=c.cgoMemo&&c.cgoMemo.resolution?RESOLUTION_OPTIONS.find(function(r){return r.id===c.cgoMemo.resolution;}):null;
            const determination=(c.decisionDraft||"").split("\n").find(function(l){return l.startsWith("DETERMINATION:");})
              ||(c.decisionDraft||"").split("\n").find(function(l){return l.trim().length>20;})
              ||"Decision recorded.";
            return(
              <div key={c.ref} className="card" style={{borderLeft:"3px solid "+(c.source==="historical"?"#9b59b6":STATUS_COLOR[c.status]||"#1072ba")}}>
                <div style={{padding:"14px 16px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                    <div>
                      <div style={{fontFamily:"monospace",fontSize:10,color:"#8a969c",marginBottom:2}}>{c.ref}</div>
                      <div style={{fontSize:13,fontWeight:500}}>{c.participant?c.participant+" -- ":""}{c.trigger}</div>
                    </div>
                    <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
                      {res&&<Pill label={res.label.split(" ")[0]} cls="p-blue"/>}
                      {c.source==="historical"?<Pill label="Pre-portal" cls="p-purple"/>:<Pill label="Active" cls="p-green"/>}
                      <button className={"copy-cite"+(copiedRef===c.ref?" copied":"")} onClick={function(){copyRef(c);}}>
                        {copiedRef===c.ref?"Copied!":"Copy Reference"}
                      </button>
                    </div>
                  </div>
                  <div style={{fontSize:12,color:"#5a646a",background:"#f8fafc",padding:"10px 12px",borderRadius:6,lineHeight:1.7}}>
                    {determination}
                  </div>
                  <div style={{fontSize:10,color:"#8a969c",marginTop:6,display:"flex",gap:12,flexWrap:"wrap",alignItems:"center"}}>
                    <span>{c.source==="historical"?"Pre-portal decision":"Decided"} {c.decided||c.opened}{c.planPeriod?" -- "+c.planPeriod:""}</span>
                    {(function(){
                      const rid=c.disposition||(c.cgoMemo&&c.cgoMemo.resolution)||"";
                      const ropt=RESOLUTION_OPTIONS.find(function(r){return r.id===rid;});
                      return ropt?<span style={{fontWeight:600,color:"#17477e",fontSize:11}}>{ropt.label}</span>:null;
                    })()}
                  </div>
                </div>
              </div>
            );
          })
        }
      </div>
    </div>
  );
}

// ── CASE LOG ──────────────────────────────────────────────────────────────────
function CaseLog({cases,onGo}){
  const [filterStatus,setFilterStatus]=useState("");
  const [filterPeriod,setFilterPeriod]=useState("");
  const [filterRes,setFilterRes]=useState("");
  const filtered=cases.filter(function(c){
    return (!filterStatus||c.status===filterStatus)
      &&(!filterPeriod||c.planPeriod===filterPeriod)
      &&(!filterRes||(c.cgoMemo&&c.cgoMemo.resolution===filterRes));
  });
  const periods=[...new Set(cases.map(function(c){return c.planPeriod;}).filter(Boolean))];
  return(
    <div className="page">
      <div className="page-title">Case Log</div>
      <div className="page-sub">Complete index. Filter by status, plan period, or resolution type. Click any row to open.</div>
      <div className="search-bar" style={{marginBottom:16}}>
        <select className="sel" value={filterStatus} onChange={function(e){setFilterStatus(e.target.value);}}>
          <option value="">All statuses</option>
          {["Open","In Review","Pending Review","Decided","Closed"].map(function(s){return <option key={s} value={s}>{s}</option>;})}
        </select>
        <select className="sel" value={filterPeriod} onChange={function(e){setFilterPeriod(e.target.value);}}>
          <option value="">All plan periods</option>
          {periods.map(function(p){return <option key={p} value={p}>{p}</option>;})}
        </select>
        <select className="sel" value={filterRes} onChange={function(e){setFilterRes(e.target.value);}}>
          <option value="">All resolutions</option>
          {RESOLUTION_OPTIONS.map(function(r){return <option key={r.id} value={r.id}>{r.label.slice(0,30)}</option>;})}
        </select>
      </div>
      <div className="card">
        {filtered.length===0
          ?<div className="empty"><div style={{fontSize:22,marginBottom:8}}>≡</div><div style={{fontSize:13}}>No cases match the current filters.</div></div>
          :<table><thead><tr><th>Ref #</th><th>Participant</th><th>Trigger</th><th>Tier</th><th>Resolution</th><th>Payout Impact</th><th>Status</th><th>Source</th><th>Decided</th></tr></thead>
            <tbody>{filtered.map(function(c){
              const res=c.cgoMemo&&c.cgoMemo.resolution?RESOLUTION_OPTIONS.find(function(r){return r.id===c.cgoMemo.resolution;}):null;
              return(
                <tr key={c.ref} className="trow" onClick={function(){onGo("detail",c.ref);}}>
                  <td style={{fontFamily:"monospace",fontSize:11,fontWeight:600,color:"#17477e"}}>{c.ref}</td>
                  <td style={{fontWeight:500}}>{c.participant||"—"}</td>
                  <td><Pill label={(c.trigger||"—").slice(0,18)} cls="p-navy"/></td>
                  <td>{c.tier?<Pill label={"T"+c.tier} cls={TIER_CLS[c.tier]||"p-gray"}/>:<span style={{color:"#8a969c"}}>—</span>}</td>
                  <td style={{fontSize:11}}>{res?res.label.split("+")[0].trim():"—"}</td>
                  <td style={{fontSize:11}}>{c.cgoMemo&&c.cgoMemo.payoutImpact?"$"+c.cgoMemo.payoutImpact:"—"}</td>
                  <td><span className="dot" style={{background:STATUS_COLOR[c.status]||"#999"}}/>{c.status}</td>
                  <td>{c.source==="historical"?<Pill label="Pre-portal" cls="p-purple"/>:c.source==="import"?<Pill label="M365" cls="p-blue"/>:<span style={{color:"#8a969c",fontSize:11}}>Manual</span>}</td>
                  <td style={{color:"#8a969c",fontSize:11}}>{c.decided||"—"}</td>
                </tr>
              );
            })}</tbody>
          </table>
        }
      </div>
    </div>
  );
}

// ── ERROR BOUNDARY ────────────────────────────────────────────────────────────
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(e) { return { error: e }; }
  render() {
    if(this.state.error) return(
      <div style={{padding:40,fontFamily:"sans-serif",color:"#c0392b"}}>
        <div style={{fontSize:16,fontWeight:600,marginBottom:8}}>ICC Portal failed to load</div>
        <div style={{fontSize:13,color:"#5a646a",marginBottom:16}}>Error: {this.state.error.message}</div>
        <button onClick={function(){window.location.reload();}} style={{padding:"8px 16px",background:"#1072ba",color:"white",border:"none",borderRadius:6,cursor:"pointer",fontSize:13}}>Reload</button>
      </div>
    );
    return this.props.children;
  }
}

// ── ROOT ──────────────────────────────────────────────────────────────────────
export default function ICCPortal(){
  const [view,setView]=useState("dashboard");
  const [cases,setCases]=useState([]);
  const [selectedRef,setSelectedRef]=useState(null);
  const [loaded,setLoaded]=useState(false);

  useEffect(function(){
    store.get("icc_v1").then(function(r){
      if(r&&r.value) try{setCases(JSON.parse(r.value));}catch(e){}
      setLoaded(true);
    });
  },[]);

  const saveCases=useCallback(function(updated){
    setCases(updated);
    store.set("icc_v1",JSON.stringify(updated));
  },[]);

  function addCase(c){saveCases([c,...cases]);setView("dashboard");}
  function patchCase(ref,patch){saveCases(cases.map(function(c){return c.ref===ref?{...c,...patch}:c;}));}

  function importCase(parsed){
    const trigger=parsed.trigger||"";
    const result=classifyLocal(trigger,parsed.dealValue||"");
    const ref=genRef(result.tier);
    addCase({...parsed,tier:result.tier,ref,status:"Pending Review",source:"import",opened:todayStr(),decisionDraft:"",votes:{}});
  }

  function addHistorical(entry){
    const ref=entry.ref&&!cases.find(function(c){return c.ref===entry.ref;})?entry.ref:"HIST-"+Date.now();
    saveCases([{...entry,ref,source:"historical"},...cases]);
  }

  function go(v,ref){setView(v);if(ref!==undefined)setSelectedRef(ref);}

  const open=cases.filter(function(c){return ["Open","In Review","Pending Review"].includes(c.status);}).length;

  if(!loaded) return <div style={{height:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"sans-serif",color:"#8a969c",fontSize:13}}>Loading ICC Portal...</div>;

  return(
    <ErrorBoundary>
    <>
      <style>{STYLES}</style>
      <div className="app">
        <div className="sidebar">
          <div className="slogo"><div className="slogo-co">ALIANZA</div><div className="slogo-sub">Incentive Compensation<br/>Committee</div></div>
          <nav style={{flex:1,padding:"8px 0"}}>
            {[{id:"dashboard",icon:"▦",label:"Case Dashboard",badge:open||0},{id:"new",icon:"+",label:"Open New Case"},{id:"precedents",icon:"⊞",label:"Precedent Register"},{id:"log",icon:"≡",label:"Case Log"}].map(function(item){return(
              <button key={item.id} className={"nav-btn"+(view===item.id?" active":"")} onClick={function(){go(item.id);}}>
                <span style={{fontSize:13,width:16,textAlign:"center"}}>{item.icon}</span>
                {item.label}
                {item.badge?<span className="nav-badge">{item.badge}</span>:null}
              </button>
            );})}
          </nav>
          <div className="sfooter">ICC Portal v3.0<br/>ICC Charter v1.1 -- April 1, 2026<br/>Alianza Confidential</div>
        </div>
        <div className="main">
          {view==="dashboard"&&<Dashboard cases={cases} onGo={go} onImport={importCase}/>}
          {view==="new"&&<NewCase onSave={addCase} onBack={function(){go("dashboard");}}/>}
          {view==="detail"&&<CaseDetail c={cases.find(function(c){return c.ref===selectedRef;})||null} onPatch={patchCase} onBack={function(){go("dashboard");}}/>}
          {view==="precedents"&&<Precedents cases={cases} onAddHistorical={addHistorical}/>}
          {view==="log"&&<CaseLog cases={cases} onGo={go}/>}
        </div>
      </div>
    </>
    </ErrorBoundary>
  );
}
