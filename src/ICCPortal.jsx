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

const CGO_MEMO_EMPTY = {
  participant:"",role:"",manager:"",planPeriod:"2026 1H",
  trigger:"",dealDesc:"",dealValue:"",compCalculated:"",
  resolution:"",payoutImpact:"",effectiveDate:"",
  policyBasis:"",rationale:"",
  precedentRef:"",precedentConsistent:"yes",precedentDistinguish:"",
  eq1:false,eq2:false,eq3:false,eq4:false,
  repEmail:"",assignedTo:"",
};

const APPEAL_GROUNDS = [
  {id:"procedural",label:"Procedural Defect",desc:"The Committee failed to follow a material requirement of the ICC Charter."},
  {id:"evidence",label:"Material New Evidence",desc:"Evidence that was not available at the time of the ruling and would likely have affected the outcome."},
  {id:"misapplication",label:"Manifest Misapplication",desc:"The Committee's interpretation is clearly inconsistent with the express terms of the applicable plan."},
];

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

// ── NOTIFICATION LAYER — Azure Functions → Microsoft Graph → icc@alianza.com ──
// All notifications route through the sendMail Azure Function, which authenticates
// to Microsoft Graph and sends from icc@alianza.com. No Power Automate required.

async function sendNotification(type, data) {
  try {
    const res = await fetch(API+"/sendMail", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ type, data }),
    });
    if(!res.ok) {
      const err = await res.json().catch(function(){return {};});
      console.error("ICC Portal: sendMail returned HTTP "+res.status, err);
      return false;
    }
    return true;
  } catch(e) {
    console.error("ICC Portal: sendMail call failed:", e.message);
    return false;
  }
}

function notifyAccepted(c) {
  return sendNotification("accepted", {
    caseRef:      c.ref,
    participant:  c.participant || "",
    repEmail:     c.repEmail || "",
    planPeriod:   c.planPeriod || "",
    trigger:      c.trigger || "",
    tier:         c.tier || "",
    opened:       c.opened || todayStr(),
  });
}

function notifyRejected(c, reason) {
  return sendNotification("rejected", {
    caseRef:      c.ref,
    participant:  c.participant || "",
    repEmail:     c.repEmail || "",
    planPeriod:   c.planPeriod || "",
    trigger:      c.trigger || "",
    rejectedReason: reason,
    rejectedDate: todayStr(),
  });
}

function notifyDecision(c, inf, ag) {
  const determination = (c.decisionDraft||"").split("\n").find(function(l){return l.startsWith("DETERMINATION:");}) || "";
  const dispOpt = RESOLUTION_OPTIONS.find(function(r){return r.id===(c.disposition||"");});
  return sendNotification("decision", {
    caseRef:        c.ref,
    participant:    c.participant || "",
    repEmail:       c.repEmail || "",
    planPeriod:     c.planPeriod || "",
    trigger:        c.trigger || "",
    disposition:    dispOpt ? dispOpt.label : "",
    determination:  determination,
    votesInFavor:   inf,
    votesAgainst:   ag,
    decidedDate:    todayStr(),
  });
}

function notifyAppeal(c, appealData) {
  return sendNotification("appeal", {
    caseRef:      c.ref,
    participant:  c.participant || "",
    repEmail:     c.repEmail || "",
    planPeriod:   c.planPeriod || "",
    grounds:      (appealData.grounds || []).join(", "),
    summary:      appealData.summary || "",
    submittedDate: todayStr(),
  });
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
  const filename = c.ref+".pdf";
  const win = window.open(url,"_blank");
  if(win) {
    win.document.title = filename;
    win.onload = function(){
      win.print();
      setTimeout(function(){URL.revokeObjectURL(url);}, 2000);
    };
  }
}

const API = "https://icc-portal-api-anh3fnfabvfreabs.centralus-01.azurewebsites.net/api";

const store = {
  async get(k) {
    try {
      const res = await fetch(API+"/getCases");
      if(!res.ok) throw new Error("API error "+res.status);
      const cases = await res.json();
      return cases.length > 0 ? {value: JSON.stringify(cases)} : null;
    } catch(e) {
      // Fallback to localStorage if API unavailable
      try { const v=localStorage.getItem(k); return v?{value:v}:null; } catch { return null; }
    }
  },
  async set(k,v) {
    // set() is now a no-op -- individual saves handled by saveCases
  },
};

async function apiCreateCase(c) {
  try {
    const res = await fetch(API+"/createCase", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify(c)
    });
    return res.ok;
  } catch(e) { return false; }
}

async function apiUpdateCase(ref, patch) {
  try {
    const res = await fetch(API+"/updateCase?ref="+encodeURIComponent(ref), {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify(patch)
    });
    return res.ok;
  } catch(e) { return false; }
}

const STYLES = `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Roboto',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f0f5fb;color:#5a646a;font-size:14px}
.app{display:flex;min-height:100vh}
.sidebar{width:248px;background:white;border-right:1px solid #dce6f0;display:flex;flex-direction:column;flex-shrink:0;position:sticky;top:0;height:100vh;overflow-y:auto}
.slogo{padding:24px 22px 20px;border-bottom:2px solid #e8f4fc}
.slogo-img{height:26px;margin-bottom:10px;display:block}
.slogo-pill{display:inline-flex;align-items:center;gap:6px;background:#e8f4fc;border-radius:20px;padding:5px 12px;margin-top:8px}
.slogo-dot{width:7px;height:7px;border-radius:50%;background:#1072ba;flex-shrink:0}
.slogo-sub{font-size:11px;font-weight:700;color:#1072ba;letter-spacing:0.04em}
.nav-section{padding:14px 22px 4px;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:0.12em;color:#c8d0d8}
.nav-btn{width:100%;display:flex;align-items:center;gap:12px;padding:11px 22px;background:none;border:none;cursor:pointer;font-size:13px;color:#5a646a;text-align:left;border-left:3px solid transparent;transition:all 0.12s;font-family:inherit;font-weight:400}
.nav-btn:hover{background:#f4f8fc;color:#17477e}
.nav-btn.active{background:#e8f4fc;color:#1072ba;font-weight:700;border-left-color:#1072ba}
.nav-icon{width:20px;height:20px;display:flex;align-items:center;justify-content:center;font-size:15px;opacity:0.5;flex-shrink:0}
.nav-btn.active .nav-icon{opacity:1}
.nav-badge{margin-left:auto;background:#1072ba;color:white;border-radius:12px;padding:2px 8px;font-size:10px;font-weight:700}
.sfooter{padding:16px 22px;border-top:1px solid #edf2f8;font-size:11px;color:#c8d0d8;line-height:1.8;margin-top:auto}
.main{flex:1;overflow-y:auto;min-width:0}
.page-header{background:white;border-bottom:1px solid #dce6f0;padding:20px 28px;display:flex;align-items:center;justify-content:space-between}
.page-title{font-size:22px;font-weight:300;color:#17477e;letter-spacing:-0.02em;line-height:1.2;margin-bottom:0}
.page-sub{font-size:13px;color:#aab4bc;margin-top:3px;margin-bottom:0}
.page-header-btns{display:flex;gap:10px;align-items:center}
.page{padding:20px 28px 28px;max-width:1000px}
.alert-strip{background:linear-gradient(90deg,#fff3e8,#fef9f0);border-bottom:1px solid #fde5b8;padding:10px 28px;display:flex;align-items:center;gap:10px;font-size:13px;color:#8a5200;font-weight:500}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:20px}
.stat{background:white;border-radius:10px;padding:20px 22px;border:1px solid #dce6f0;position:relative;overflow:hidden;transition:box-shadow 0.15s}
.stat:hover{box-shadow:0 4px 16px rgba(23,71,126,0.1)}
.stat-accent{position:absolute;top:0;left:0;right:0;height:3px}
.stat-icon{width:36px;height:36px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:17px;margin-bottom:12px}
.stat-n{font-size:34px;font-weight:300;color:#17477e;line-height:1;letter-spacing:-0.02em}
.stat-l{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:#aab4bc;margin-top:4px}
.stat-trend{font-size:11px;font-weight:700;margin-top:8px}
.card{background:white;border-radius:10px;border:1px solid #dce6f0;overflow:hidden;margin-bottom:16px}
.card-hd{padding:16px 20px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #edf2f8}
.card-title{font-size:14px;font-weight:700;color:#17477e}
.card-sub{font-size:12px;color:#aab4bc;margin-top:1px}
.card-hd-btns{display:flex;gap:8px;align-items:center}
table{width:100%;border-collapse:collapse}
th{padding:10px 18px;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:0.1em;color:#aab4bc;text-align:left;background:#fafbfe}
td{padding:13px 18px;font-size:13px;border-top:1px solid #f2f5fb;color:#5a646a;vertical-align:middle}
.trow{cursor:pointer}
.trow:hover td{background:#f7fafd}
.pill{display:inline-flex;align-items:center;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;white-space:nowrap}
.p-blue{background:#ddeeff;color:#1060a0}
.p-gold{background:#fef0cc;color:#8a5200}
.p-green{background:#e8f5d8;color:#3a5a00}
.p-gray{background:#f0f4f8;color:#5a646a}
.p-navy{background:#e4ecf6;color:#17477e}
.p-red{background:#fce8e8;color:#b02020}
.p-purple{background:#f0e8f8;color:#5a2090}
.dot{width:8px;height:8px;border-radius:50%;display:inline-block;margin-right:6px;vertical-align:middle;flex-shrink:0}
.btn{padding:9px 18px;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;border:1.5px solid #dce6f0;background:white;color:#5a646a;transition:all 0.12s;font-family:inherit;letter-spacing:0.02em}
.btn:hover{border-color:#1072ba;color:#1072ba}
.btn-p{background:#1072ba;color:white;border-color:#1072ba}
.btn-p:hover{background:#0d5fa0;border-color:#0d5fa0}
.btn-ok{background:#8bad44;color:white;border-color:#8bad44}
.btn-ok:hover{background:#7a9d3a}
.btn-danger{background:#fce8e8;color:#b02020;border-color:#f0b8b8}
.btn-danger:hover{background:#f0d0d0}
.btn-sm{padding:6px 14px;font-size:12px}
.btn:disabled{opacity:0.4;cursor:not-allowed}
.lbl{display:block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:#aab4bc;margin-bottom:5px}
.inp,.sel,.ta{width:100%;padding:9px 12px;border:1.5px solid #dce6f0;border-radius:6px;font-size:13px;color:#17477e;background:white;font-family:inherit;outline:none;transition:border 0.12s}
.inp:focus,.sel:focus,.ta:focus{border-color:#1072ba}
.fg{margin-bottom:16px}
.fr{display:grid;grid-template-columns:1fr 1fr;gap:0 16px}
.sbar{display:flex;align-items:center;gap:10px;margin:20px 0 14px}
.sbar-l{font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:0.1em;color:#17477e;white-space:nowrap}
.sbar-line{flex:1;height:1px;background:#edf2f8}
.cob{border-left:4px solid #1072ba;background:#e8f4fc;padding:11px 14px;border-radius:0 8px 8px 0;margin-bottom:14px;font-size:13px;color:#17477e;line-height:1.6}
.cob-warn{border-color:#fdb73e;background:#fef3dc;color:#8a5200}
.cob-ok{border-color:#8bad44;background:#edf5e0;color:#3a5a00}
.cob-err{border-color:#e24b4a;background:#fce8e8;color:#b02020}
.cob-gold{border-color:#fdb73e;background:#fef3dc;color:#8a5200}
.cob-purple{border-color:#9b59b6;background:#f5eefa;color:#5a2090}
.tabs{display:flex;background:white;border-bottom:1px solid #dce6f0;padding:0 20px;margin-bottom:16px}
.tab{padding:13px 18px;background:none;border:none;cursor:pointer;font-size:13px;font-weight:700;color:#aab4bc;border-bottom:3px solid transparent;margin-bottom:-1px;transition:all 0.12s;font-family:inherit}
.tab.act{color:#1072ba;border-bottom-color:#1072ba}
.tb{padding:6px 14px;border-radius:20px;font-size:12px;font-weight:700;cursor:pointer;border:1.5px solid #dce6f0;background:white;color:#aab4bc;font-family:inherit;transition:all 0.12s}
.tb.t1a{background:#e8f5d8;color:#3a5a00;border-color:#b8d898}
.tb.t2a{background:#fef0cc;color:#8a5200;border-color:#f0d080}
.tb.t3a{background:#ddeeff;color:#1060a0;border-color:#99ccee}
.vrow{display:flex;align-items:center;justify-content:space-between;background:white;border:1px solid #dce6f0;border-radius:8px;padding:14px 18px;margin-bottom:8px}
.vbtns{display:flex;gap:6px}
.vb{padding:5px 14px;border-radius:20px;font-size:11px;font-weight:700;cursor:pointer;border:1.5px solid #dce6f0;background:transparent;color:#5a646a;font-family:inherit;transition:all 0.1s}
.vb-f{background:#e8f5d8;color:#3a5a00;border-color:#b8d898}
.vb-a{background:#fce8e8;color:#b02020;border-color:#f0b8b8}
.vb-r{background:#fef0cc;color:#8a5200;border-color:#f0d080}
.dg{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px}
.df-l{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:#c8d0d8;margin-bottom:3px}
.df-v{font-size:14px;color:#17477e}
.dr-area{width:100%;padding:12px 14px;border:1.5px solid #dce6f0;border-radius:8px;font-size:13px;color:#17477e;background:#fafbfe;font-family:inherit;outline:none;resize:vertical;line-height:1.7;min-height:220px}
.dr-area:focus{border-color:#1072ba;background:white}
.empty{padding:48px;text-align:center;color:#aab4bc}
.back-btn{background:none;border:none;cursor:pointer;font-size:12px;color:#aab4bc;display:flex;align-items:center;gap:5px;margin-bottom:16px;padding:0;font-family:inherit;font-weight:700;letter-spacing:0.03em;text-transform:uppercase}
.back-btn:hover{color:#17477e}
.plan-ref{background:#e8f4fc;border-left:4px solid #1072ba;border-radius:0 8px 8px 0;padding:13px 16px;margin-bottom:10px}
.plan-ref-src{font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:0.08em;color:#1072ba;margin-bottom:3px}
.plan-ref-sec{font-size:12px;font-weight:700;color:#17477e;margin-bottom:4px}
.plan-ref-txt{font-size:12px;color:#5a646a;line-height:1.6;font-style:italic}
.res-opt{border:1.5px solid #dce6f0;border-radius:8px;padding:12px 14px;margin-bottom:8px;cursor:pointer;transition:all 0.12s;background:white}
.res-opt:hover{border-color:#1072ba;background:#f0f8ff}
.res-opt.selected{border-color:#1072ba;background:#e8f4fc}
.res-opt-label{font-size:13px;font-weight:700;color:#17477e;margin-bottom:3px}
.res-opt-desc{font-size:12px;color:#aab4bc;line-height:1.5}
.equity-check{display:flex;align-items:flex-start;gap:10px;padding:12px 14px;border:1.5px solid #dce6f0;border-radius:8px;margin-bottom:8px;background:white}
.equity-check input{margin-top:2px;flex-shrink:0;accent-color:#1072ba;width:16px;height:16px}
.equity-check-text{font-size:13px;color:#5a646a;line-height:1.5}
.modal-backdrop{position:absolute;top:0;left:0;width:100%;min-height:100%;background:rgba(23,71,126,0.2);display:flex;align-items:flex-start;justify-content:center;padding-top:60px;z-index:100}
.modal{background:white;border-radius:12px;border:1px solid #dce6f0;padding:28px;width:640px;max-width:92%;box-shadow:0 8px 40px rgba(23,71,126,0.15)}
.modal-title{font-size:18px;font-weight:300;color:#17477e;margin-bottom:6px;letter-spacing:-0.01em}
.modal-sub{font-size:13px;color:#aab4bc;margin-bottom:20px;line-height:1.5}
.search-bar{display:flex;gap:10px;margin-bottom:16px}
.copy-cite{background:none;border:1.5px solid #dce6f0;border-radius:20px;padding:4px 12px;font-size:11px;font-weight:700;color:#aab4bc;cursor:pointer;font-family:inherit;white-space:nowrap;transition:all 0.12s}
.copy-cite:hover{border-color:#1072ba;color:#1072ba}
.copy-cite.copied{background:#e8f5d8;color:#3a5a00;border-color:#b8d898}
`;
const SPIN_STYLE = document.createElement("style");
SPIN_STYLE.textContent = "@keyframes spin { to { transform: rotate(360deg); } }";

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

// ── CEO APPEAL MODAL ──────────────────────────────────────────────────────────
function CEOAppealModal({c, onClose, onSave}) {
  const [grounds, setGrounds] = useState([]);
  const [summary, setSummary] = useState("");
  const [docs, setDocs] = useState("");
  const [relief, setRelief] = useState("");

  function toggleGround(id) {
    setGrounds(function(prev) {
      return prev.includes(id) ? prev.filter(function(g){return g!==id;}) : [...prev,id];
    });
  }

  function handleSubmit() {
    if(!grounds.length || !summary.trim()) return;
    const appealData = {
      appealStatus: "Submitted",
      appealDate: todayStr(),
      appealGrounds: grounds,
      appealSummary: summary,
      appealDocs: docs,
      appealRelief: relief,
    };
    onSave(appealData);
    // Build mailto to CEO office
    const groundLabels = grounds.map(function(g){
      const found = APPEAL_GROUNDS.find(function(a){return a.id===g;});
      return found ? found.label : g;
    }).join("; ");
    const bodyLines = [
      "Dear CEO,",
      "",
      "I am submitting a formal Plan Interpretation Review request regarding ICC Case " + c.ref + ".",
      "",
      "CASE REFERENCE: " + c.ref,
      "PARTICIPANT: " + (c.participant||"[name]"),
      "PLAN PERIOD: " + (c.planPeriod||"[period]"),
      "DECISION DATE: " + (c.decided||"[date]"),
      "APPEAL SUBMISSION DATE: " + todayStr(),
      "",
      "GROUND(S) FOR APPEAL:",
      groundLabels,
      "",
      "FACTUAL SUMMARY:",
      summary,
      "",
      docs ? ("SUPPORTING DOCUMENTATION:\n" + docs) : "",
      "",
      "RELIEF REQUESTED:",
      relief || "[describe requested outcome]",
      "",
      "This appeal is submitted within the 15 business day window per the ICC Charter.",
      "",
      "Sincerely,",
      (c.participant||"[Name]"),
    ];
    const body = bodyLines.filter(function(l,i,arr){
      return !(l===""&&arr[i-1]==="");
    }).join("\n");
    const subj = "Plan Interpretation Review Request -- Case " + c.ref;
    const to = "icc@alianza.com";
    const href = ["mailto:",encodeURIComponent(to),
      "?subject=",encodeURIComponent(subj),
      "&cc=",encodeURIComponent("icc@alianza.com"),
      "&body=",encodeURIComponent(body)
    ].join("");
    window.location.href = href;
    onClose();
  }

  const canSubmit = grounds.length > 0 && summary.trim().length > 20;

  return (
    <div className="modal-backdrop" onClick={function(e){if(e.target===e.currentTarget)onClose();}}>
      <div className="modal" style={{width:680}}>
        <div className="modal-title">Escalate to CEO Plan Interpretation Review</div>
        <div className="modal-sub">Complete all required fields. This will open a pre-drafted appeal email to icc@alianza.com for the CEO office. The appeal must be submitted within 15 business days of the Decision Record.</div>

        <div style={{background:"#fef3dc",border:"1px solid #fde5b8",borderRadius:8,padding:"12px 16px",marginBottom:16,fontSize:13,color:"#8a5200"}}>
          <strong>Valid grounds only:</strong> Procedural defect, material new evidence, or manifest misapplication. Disagreement with the outcome is not a valid ground.
        </div>

        <SBar label="Case Reference"/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:16}}>
          {[["Case",c.ref],["Participant",c.participant||"--"],["Decided",c.decided||"--"]].map(function(item){return(
            <div key={item[0]} style={{background:"#f7fafd",borderRadius:6,padding:"10px 12px",border:"1px solid #dce6f0"}}>
              <div style={{fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.07em",color:"#aab4bc",marginBottom:3}}>{item[0]}</div>
              <div style={{fontSize:13,fontWeight:700,color:"#17477e"}}>{item[1]}</div>
            </div>
          );})}
        </div>

        <SBar label="Ground(s) for Appeal *"/>
        {APPEAL_GROUNDS.map(function(g){return(
          <div key={g.id} className="equity-check" style={{cursor:"pointer",borderColor:grounds.includes(g.id)?"#1072ba":"#dce6f0",background:grounds.includes(g.id)?"#e8f4fc":"white"}} onClick={function(){toggleGround(g.id);}}>
            <input type="checkbox" checked={grounds.includes(g.id)} onChange={function(){toggleGround(g.id);}} style={{marginTop:2,accentColor:"#1072ba",width:16,height:16,flexShrink:0}}/>
            <div>
              <div style={{fontSize:13,fontWeight:700,color:"#17477e",marginBottom:2}}>{g.label}</div>
              <div className="equity-check-text">{g.desc}</div>
            </div>
          </div>
        );})}

        <div className="fg" style={{marginTop:12}}>
          <label className="lbl">Factual Summary * <span style={{color:"#aab4bc",fontWeight:400,textTransform:"none"}}>(describe the basis for each ground asserted)</span></label>
          <textarea className="ta" rows={5} value={summary} onChange={function(e){setSummary(e.target.value);}} placeholder="Describe specifically what procedural defect occurred, what new evidence exists, or how the plan language was misapplied. Focus on the appeal ground(s) -- do not restate the original dispute."/>
        </div>
        <div className="fg">
          <label className="lbl">Supporting Documents (optional)</label>
          <input className="inp" value={docs} onChange={function(e){setDocs(e.target.value);}} placeholder="List document titles and SharePoint links"/>
        </div>
        <div className="fg">
          <label className="lbl">Relief Requested</label>
          <textarea className="ta" rows={2} value={relief} onChange={function(e){setRelief(e.target.value);}} placeholder="Affirm the ruling, modify the ruling, or remand to Committee for reconsideration..."/>
        </div>

        <div style={{display:"flex",justifyContent:"flex-end",gap:10,marginTop:8}}>
          <button className="btn btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn btn-p btn-sm" onClick={handleSubmit} disabled={!canSubmit} style={{opacity:canSubmit?1:0.5}}>Submit Appeal + Open Email</button>
        </div>
      </div>
    </div>
  );
}

// ── CGO EXCEPTION MEMO (standalone page) ─────────────────────────────────────
function CGOExceptionMemo({onSave, onBack}) {
  const [fd, setFd] = useState(CGO_MEMO_EMPTY);
  function uf(k){return function(e){setFd(function(p){return{...p,[k]:e.target.value};});};}
  function ub(k){return function(e){setFd(function(p){return{...p,[k]:e.target.checked};});};}

  const payoutNum = parseFloat((fd.payoutImpact||"").replace(/,/g,""))||0;
  const overLimit = payoutNum > 50000;
  const allChecked = fd.eq1&&fd.eq2&&fd.eq3&&fd.eq4;
  const canSave = fd.participant&&fd.trigger&&fd.resolution&&fd.rationale&&allChecked&&!overLimit;

  function handleSave() {
    if(!canSave) return;
    const ref = "CGO-" + new Date().getFullYear() + "-" + String(Math.floor(Math.random()*900)+100);
    onSave({
      ...fd,
      tier: 2,
      ref,
      status: "Decided",
      source: "cgo",
      opened: todayStr(),
      decided: todayStr(),
      cgoMemo: {
        resolution: fd.resolution,
        payoutImpact: fd.payoutImpact,
        effectiveDate: fd.effectiveDate,
        methodology: fd.rationale,
        precedentRef: fd.precedentRef,
        equityChecks: {eq1:fd.eq1,eq2:fd.eq2,eq3:fd.eq3,eq4:fd.eq4},
      },
      decisionDraft: [
        "CASE SUMMARY:",
        (fd.participant||"[name]")+" ("+(fd.role||"[role]")+") -- "+(fd.trigger||"[trigger]")+" -- "+(fd.planPeriod)+".",
        "Deal value: $"+(fd.dealValue||"[value]")+". Compensation calculated by CommOps: $"+(fd.compCalculated||"[amount]")+".",
        "Payout impact of CGO ruling: $"+(fd.payoutImpact||"[amount]")+".",
        "",
        "POLICY BASIS:",
        fd.policyBasis||"[see CGO Exception Memo]",
        "",
        "CGO RATIONALE:",
        fd.rationale,
        "",
        "DISPOSITION:",
        (RESOLUTION_OPTIONS.find(function(r){return r.id===fd.resolution;})||{label:"[see memo]"}).label,
        "",
        "DETERMINATION:",
        "CGO pre-approval per ICC Charter Section 4.2. Effective: "+(fd.effectiveDate||todayStr())+".",
        fd.precedentRef?"Precedent reference: "+fd.precedentRef:"",
        "",
        "EQUITY ATTESTATION: All four attestations completed by CGO.",
      ].filter(Boolean).join("\n"),
      votes: {},
      auditLog: [todayStr()+" -- CGO Exception Memo completed and case created."],
    });
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">CGO Exception Memo</div>
          <div className="page-sub">Tier 2 pre-approval -- complete all sections and equity attestations before saving</div>
        </div>
        <div className="page-header-btns">
          <button className="btn btn-sm" onClick={onBack}>Back to Dashboard</button>
        </div>
      </div>
      <div className="page" style={{maxWidth:800}}>
        {overLimit&&<div className="cob cob-err" style={{marginBottom:16}}><strong>Payout impact exceeds $50,000.</strong> This matter must be escalated to Tier 3 Full Committee. You cannot save this CGO Memo until the payout impact is corrected or the case is reclassified.</div>}

        <div className="card"><div style={{padding:"18px 20px"}}>
          <SBar label="Section 1 -- Case Identification"/>
          <div className="fr">
            <div className="fg"><label className="lbl">Participant Name *</label><input className="inp" value={fd.participant} onChange={uf("participant")}/></div>
            <div className="fg"><label className="lbl">Title / Role</label><input className="inp" value={fd.role} onChange={uf("role")}/></div>
            <div className="fg"><label className="lbl">Direct Manager</label><input className="inp" value={fd.manager} onChange={uf("manager")}/></div>
            <div className="fg"><label className="lbl">Plan Period</label>
              <select className="sel" value={fd.planPeriod} onChange={uf("planPeriod")}>
                <option>2026 1H</option><option>2026 2H</option><option>2025 2H</option>
              </select>
            </div>
            <div className="fg"><label className="lbl">Rep Email</label><input className="inp" value={fd.repEmail} onChange={uf("repEmail")} placeholder="rep@alianza.com"/></div>
            <div className="fg"><label className="lbl">Effective Date</label><input className="inp" value={fd.effectiveDate} onChange={uf("effectiveDate")} placeholder="e.g. Apr 1, 2026"/></div>
          </div>
          <SBar label="Trigger / Nature of Decision"/>
          <div className="fg"><label className="lbl">Trigger Type *</label>
            <select className="sel" value={fd.trigger} onChange={uf("trigger")}>
              <option value="">Select...</option>
              {TRIGGERS.map(function(t){return <option key={t}>{t}</option>;})}
              <option value="Plan Language Ambiguity">Plan Language Ambiguity</option>
              <option value="Non-Standard Payout Request">Non-Standard Payout Request</option>
              <option value="Booking Policy Edge Case">Booking Policy Edge Case</option>
              <option value="Fairness / Equity Concern">Fairness / Equity Concern</option>
            </select>
          </div>
          <div className="fg"><label className="lbl">Deal / Event Description</label>
            <textarea className="ta" rows={3} value={fd.dealDesc} onChange={uf("dealDesc")} placeholder="Customer, product(s), booking date, relevant context..."/>
          </div>
          <div className="fr">
            <div className="fg"><label className="lbl">Deal Value ($)</label><input className="inp" value={fd.dealValue} onChange={uf("dealValue")}/></div>
            <div className="fg"><label className="lbl">Comp Calculated (CommOps) ($)</label><input className="inp" value={fd.compCalculated} onChange={uf("compCalculated")}/></div>
            <div className="fg" style={{gridColumn:"span 2"}}>
              <label className="lbl">Payout Impact ($) * <span style={{color:"#aab4bc",fontWeight:400,textTransform:"none"}}>(delta between CommOps calculation and CGO ruling)</span></label>
              <input className="inp" value={fd.payoutImpact} onChange={uf("payoutImpact")} placeholder="Must be under $50,000" style={{borderColor:overLimit?"#e24b4a":""}}/>
              {overLimit&&<div style={{fontSize:11,color:"#b02020",marginTop:4,fontWeight:700}}>Exceeds $50,000 limit -- must escalate to Tier 3</div>}
            </div>
          </div>
        </div></div>

        <div className="card"><div style={{padding:"18px 20px"}}>
          <SBar label="Section 2 -- Resolution Mechanism *"/>
          {RESOLUTION_OPTIONS.map(function(r){return(
            <div key={r.id} className={"res-opt"+(fd.resolution===r.id?" selected":"")} onClick={function(){setFd(function(p){return{...p,resolution:r.id};});}}>
              <div className="res-opt-label">{r.label}</div>
              <div className="res-opt-desc">{r.desc}</div>
            </div>
          );})}
        </div></div>

        <div className="card"><div style={{padding:"18px 20px"}}>
          <SBar label="Section 3 -- Policy Basis and Rationale"/>
          {fd.trigger&&PLAN_REFS[fd.trigger]&&<PlanRefsPanel trigger={fd.trigger}/>}
          <div className="fg"><label className="lbl">Applicable Plan Provisions</label>
            <textarea className="ta" rows={3} value={fd.policyBasis} onChange={uf("policyBasis")} placeholder="Cite the specific 2026 1H Plan section(s) or Alianza Booking Definition Policy that govern this matter..."/>
          </div>
          <div className="fg"><label className="lbl">Rationale *</label>
            <textarea className="ta" rows={5} value={fd.rationale} onChange={uf("rationale")} placeholder="Explain the plan interpretation applied, why this resolution is appropriate, and the policy basis for the ruling. Must be sufficient for a future reader to understand the reasoning without access to the underlying case files."/>
          </div>
        </div></div>

        <div className="card"><div style={{padding:"18px 20px"}}>
          <SBar label="Section 4 -- Precedent Reference"/>
          <div className="cob" style={{marginBottom:14}}>Search the Precedent Register, click Copy Reference on the relevant prior ruling, and paste below. If no materially similar prior ruling exists, state that here.</div>
          <div className="fg"><label className="lbl">Prior Ruling Reference</label>
            <textarea className="ta" rows={3} value={fd.precedentRef} onChange={uf("precedentRef")} placeholder={"ICC-2025-014 -- Rep-Filed Dispute -- 2025 2H\nResolution: Partial commission (60%), no quota retirement\nConsistent with this ruling: Yes"}/>
          </div>
          <div className="fg">
            <label className="lbl">Consistent with prior ruling?</label>
            <div style={{display:"flex",gap:12,marginTop:4}}>
              {["yes","no","no_prior"].map(function(v){return(
                <label key={v} style={{display:"flex",alignItems:"center",gap:6,fontSize:13,cursor:"pointer",color:fd.precedentConsistent===v?"#17477e":"#5a646a"}}>
                  <input type="radio" name="precedentConsistent" value={v} checked={fd.precedentConsistent===v} onChange={uf("precedentConsistent")} style={{accentColor:"#1072ba"}}/> 
                  {v==="yes"?"Yes":v==="no"?"No -- see distinguishing facts below":"No prior ruling found"}
                </label>
              );})}
            </div>
          </div>
          {fd.precedentConsistent==="no"&&(
            <div className="fg"><label className="lbl">Distinguishing Facts</label>
              <textarea className="ta" rows={3} value={fd.precedentDistinguish} onChange={uf("precedentDistinguish")} placeholder="Explain what facts distinguish this matter and justify different treatment..."/>
            </div>
          )}
        </div></div>

        <div className="card"><div style={{padding:"18px 20px"}}>
          <SBar label="Section 5 -- Equity Attestation"/>
          <div className="cob cob-warn" style={{marginBottom:14}}>All four attestations must be checked before this memo can be saved.</div>
          {[
            {k:"eq1",text:"I have searched the ICC Precedent Register for materially similar prior rulings and either applied them consistently or documented distinguishing facts in Section 4 above."},
            {k:"eq2",text:"I have reviewed current-period Tier 2 decisions and this ruling is consistent with same-period treatment, or I have documented the distinguishing facts in Section 4 above."},
            {k:"eq3",text:"I have considered whether similarly situated participants in comparable roles and territories have received consistent treatment, and I am not aware of material inconsistency not explained by the facts documented above."},
            {k:"eq4",text:"The payout impact of this decision is under $50,000 and within my approved CGO budget authority for the current plan period."},
          ].map(function(item){return(
            <div key={item.k} className="equity-check" style={{borderColor:fd[item.k]?"#8bad44":"#dce6f0",background:fd[item.k]?"#edf5e0":"white"}}>
              <input type="checkbox" checked={!!fd[item.k]} onChange={ub(item.k)} style={{marginTop:2,accentColor:"#8bad44",width:16,height:16,flexShrink:0}}/>
              <div className="equity-check-text">{item.text}</div>
            </div>
          );})}
          {!allChecked&&<div style={{fontSize:11,color:"#aab4bc",marginTop:8,fontStyle:"italic"}}>Complete all four attestations to enable saving.</div>}
        </div></div>

        <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:8,paddingBottom:32}}>
          <button className="btn" onClick={onBack}>Cancel</button>
          <button className="btn btn-p" onClick={handleSave} disabled={!canSave} style={{opacity:canSave?1:0.5}}>Save CGO Exception Memo</button>
        </div>
      </div>
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

  // Auto-load DR template when decision tab is opened and draft is still empty
  useEffect(function(){
    if(tab==="decision" && c && !c.decisionDraft && c.source!=="historical"){
      onPatch(c.ref,{decisionDraft:drTemplate(c,inf,ag)});
    }
  },[tab]);

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
  const [notifStatus,setNotifStatus]=useState(null); // null | "sending" | "sent" | "error"

  function showNotifFeedback(success) {
    setNotifStatus(success ? "sent" : "error");
    setTimeout(function(){setNotifStatus(null);}, 4000);
  }

  async function submitToCommittee(){
    const merged = {...c,...prep};
    onPatch(c.ref,{...prep,status:"Open",...appendAudit(c,"Submitted to Committee by SalesOps")});
    setNotifStatus("sending");
    const ok = await notifyAccepted(merged);
    showNotifFeedback(ok, false);
  }

  function recordVote(member,vote){onPatch(c.ref,{votes:{...votes,[member]:vote}});}
  const [dispSaved,setDispSaved]=useState(false);
  const [showAppeal,setShowAppeal]=useState(false);

  function saveDisposition(){
    onPatch(c.ref,{disposition});
    setDispSaved(true);
    setTimeout(function(){setDispSaved(false);},2500);
  }

  // DR validation: all 5 sections must have content before finalizing
  function drSectionsComplete(draft) {
    const required = ["CASE SUMMARY","POLICY ANALYSIS","COMMITTEE DELIBERATION","DISPOSITION","DETERMINATION"];
    return required.every(function(sec){
      const idx = (draft||"").indexOf(sec+":");
      if(idx === -1) return false;
      const after = (draft||"").indexOf("\n", idx) + 1;
      const next = required.filter(function(s){return s!==sec;}).map(function(s){return (draft||"").indexOf(s+":", after);}).filter(function(i){return i > after;});
      const end = next.length ? Math.min(...next) : (draft||"").length;
      const content = (draft||"").substring(after, end).trim();
      return content.length > 10; // must have at least some real content
    });
  }

  async function finalize(){
    if(!drSectionsComplete(c.decisionDraft)){
      alert("All five Decision Record sections must be completed before finalizing.\n\nPlease complete: Case Summary, Policy Analysis, Committee Deliberation, Disposition, and Determination.");
      return;
    }
    onPatch(c.ref,{status:"Decided",decided:todayStr(),disposition,...appendAudit(c,"Decision finalized. Vote: "+inf+" in favor / "+ag+" against. Disposition: "+disposition)});
  }

  function saveCgoMemo(){onPatch(c.ref,{cgoMemo,status:"Decided",decided:todayStr()});}

  // Auto-load template if DR is empty when tab is opened (handled in tab render)
  function loadTemplate(){onPatch(c.ref,{decisionDraft:drTemplate(c,inf,ag)});}

  async function rejectCase(){
    const reason=window.prompt("Rejection reason:\n\n1. Does not meet Tier 3 trigger criteria\n2. Insufficient information -- resubmit with supporting documentation\n3. Duplicate of an existing open case\n4. Matter resolved through other means\n5. Other");
    if(reason===null)return;
    onPatch(c.ref,{status:"Closed",rejectedReason:reason,decided:todayStr(),...appendAudit(c,"Case rejected by SalesOps. Reason: "+reason)});
    setNotifStatus("sending");
    const ok = await notifyRejected({...c,...prep}, reason);
    showNotifFeedback(ok, false);
  }

  async function sendDecision(){
    setNotifStatus("sending");
    const ok = await notifyDecision({...c,...prep}, inf, ag);
    showNotifFeedback(ok, false);
    if(ok) onPatch(c.ref,{...appendAudit(c,"Decision Record notification sent to rep via icc@alianza.com")});
  }

  const baseTabs = c.tier===2
    ? [["overview","Case Overview"],["prepare","Case Preparation"],["cgo","CGO Memo"],["decision","Decision Record"]]
    : [["overview","Case Overview"],["prepare","Case Preparation"],["committee","Committee Action"],["decision","Decision Record"]];
  const tabList = isPending
    ? [["overview","Case Overview"],["prepare","Case Preparation"]]
    : baseTabs;

  return(
    <div style={{position:"relative"}}>
      {showAppeal&&<CEOAppealModal c={c} onClose={function(){setShowAppeal(false);}} onSave={function(data){
        onPatch(c.ref,data);
        notifyAppeal(c, data.appeal||{});
        setShowAppeal(false);
      }}/>}

      {/* Notification status banner */}
      {notifStatus==="sending"&&(
        <div style={{background:"#e8f4fc",borderBottom:"1px solid #b8d8f0",padding:"10px 28px",fontSize:13,color:"#17477e",display:"flex",alignItems:"center",gap:8}}>
          <span style={{display:"inline-block",width:12,height:12,borderRadius:"50%",border:"2px solid #1072ba",borderTopColor:"transparent",animation:"spin 0.7s linear infinite"}}/>
          Sending notification via icc@alianza.com...
        </div>
      )}
      {notifStatus==="sent"&&(
        <div style={{background:"#edf5e0",borderBottom:"1px solid #b8d898",padding:"10px 28px",fontSize:13,color:"#3a5a00",fontWeight:600}}>
          ✓ Notification sent from icc@alianza.com
        </div>
      )}
      {notifStatus==="error"&&(
        <div style={{background:"#fce8e8",borderBottom:"1px solid #f0b8b8",padding:"10px 28px",fontSize:13,color:"#b02020",fontWeight:600}}>
          Notification failed to send. Check the Azure Functions log for details.
        </div>
      )}
    <div className="page" style={{maxWidth:880}}>
      <button className="back-btn" onClick={onBack}>\u2190 Back to Case Dashboard</button>

      {isPending&&(
        <div className="cob cob-purple" style={{marginBottom:16}}>
          <strong>Pending Review</strong> -- Imported from the M365 intake form. Use the Case Preparation tab to add policy context, CGO opinion, and supporting documents. Click Submit to Committee when ready. To close without proceeding, use Reject below.
          <div style={{display:"flex",gap:8,marginTop:10}}>
            <button className="btn btn-danger btn-sm" onClick={rejectCase}>Reject — send not-escalated notification</button>
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
          {c.status==="Decided"&&<button className="btn btn-sm" onClick={function(){downloadDecisionPDF(c);}}>Download Decision Record</button>}
          {c.status==="Decided"&&!c.appealStatus&&<button className="btn btn-sm" style={{borderColor:"#f0d080",color:"#8a5200",background:"#fef3dc"}} onClick={function(){setShowAppeal(true);}}>Escalate to CEO Review</button>}
          {c.appealStatus&&<span style={{fontSize:11,fontWeight:700,background:"#f5eefa",color:"#5a2090",border:"1px solid #d8b8f0",borderRadius:20,padding:"4px 12px"}}>Appeal: {c.appealStatus} {c.appealDate||""}</span>}
          {c.status==="Decided"&&(
            <button className="btn btn-sm" onClick={sendDecision}>Send Decision Notification</button>
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
              <button className="btn btn-ok" onClick={submitToCommittee}>Submit to Committee — sends acceptance notification</button>
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
        <div>
          <div className="card" style={{overflow:"visible",marginBottom:0,borderBottom:"none",borderRadius:"10px 10px 0 0"}}>
            <div style={{background:"linear-gradient(135deg,#17477e 0%,#354c59 100%)",padding:"18px 20px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div>
                <div style={{fontSize:10,fontWeight:700,color:"rgba(255,255,255,0.5)",textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:4}}>Incentive Compensation Committee</div>
                <div style={{fontSize:20,fontWeight:300,color:"white",letterSpacing:"-0.01em"}}>Decision Record</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:10,color:"rgba(255,255,255,0.5)",marginBottom:2}}>Case Reference</div>
                <div style={{fontSize:16,fontWeight:700,color:"white",fontFamily:"monospace"}}>{c.ref}</div>
                {c.source!=="historical"&&<button className="btn btn-sm" style={{marginTop:10,background:"rgba(255,255,255,0.15)",color:"white",border:"1px solid rgba(255,255,255,0.3)",fontSize:11}} onClick={loadTemplate}>{c.decisionDraft?"Reset Template":"Load Template"}</button>}
              </div>
            </div>
          </div>

          <div className="card" style={{borderRadius:0,borderTop:"none",borderBottom:"none",marginBottom:0}}>
            <div style={{padding:"16px 20px"}}>
              <div style={{fontSize:10,fontWeight:900,textTransform:"uppercase",letterSpacing:"0.1em",color:"#1072ba",marginBottom:12}}>Case Identification</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",border:"1px solid #dce6f0",borderRadius:8,overflow:"hidden"}}>
                {[["Participant",c.participant||"--"],["Role",c.role||"--"],["Manager",c.manager||"--"],["Plan Period",c.planPeriod||"--"],["Trigger",(c.trigger||"--").slice(0,28)],["Tier",c.tier?"Tier "+c.tier:"--"],["Opened",c.opened||"--"],["Decided",c.decided||"--"],["Vote",inf+ag>0?inf+" in favor / "+ag+" against":"Pending"]].map(function(item,idx){return(
                  <div key={item[0]} style={{padding:"10px 14px",borderRight:idx%3<2?"1px solid #dce6f0":"none",borderBottom:idx<6?"1px solid #dce6f0":"none",background:Math.floor(idx/3)%2===0?"#fafbfe":"white"}}>
                    <div style={{fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",color:"#aab4bc",marginBottom:3}}>{item[0]}</div>
                    <div style={{fontSize:12,color:"#17477e",fontWeight:700}}>{item[1]}</div>
                  </div>
                );})}
              </div>
            </div>
          </div>

          {[
            {key:"CASE SUMMARY",     label:"Case Summary",          rows:4, hint:"State the participant, role, trigger type, and plan period. Include deal value, compensation claimed by rep, and compensation calculated by CommOps."},
            {key:"POLICY ANALYSIS",  label:"Policy Analysis",       rows:8, hint:"The following provisions were reviewed. Auto-populated from plan refs when you load the template -- delete inapplicable provisions, add any additional provisions or ambiguities considered."},
            {key:"COMMITTEE DELIBERATION", label:"Committee Deliberation", rows:6, hint:"Document the Committee's interpretation of applicable provisions, key considerations weighed, and the reasoning behind the determination. If the vote was not unanimous, note the basis for any dissent without attributing positions to individuals."},
            {key:"DISPOSITION",      label:"Disposition",           rows:3, hint:"State the selected resolution mechanism (e.g. Commission + Full Quota Retirement) and any conditions, amounts, or milestones attached."},
            {key:"DETERMINATION",    label:"Determination",         rows:4, hint:"The Committee voted [X] in favor and [Y] against. State the specific ruling: amount approved or denied, methodology applied, effective date, and any conditions or milestones attached to payment."},
          ].map(function(sec){
            const ALL_KEYS=["CASE SUMMARY","POLICY ANALYSIS","COMMITTEE DELIBERATION","DISPOSITION","DETERMINATION"];
            const draft=c.decisionDraft||"";
            const secStart=draft.indexOf(sec.key+":");
            let secContent="";
            if(secStart>-1){
              const afterLabel=draft.indexOf("\n",secStart)+1;
              const nextPositions=ALL_KEYS.filter(function(k){return k!==sec.key;}).map(function(k){return draft.indexOf(k+":",afterLabel);}).filter(function(i){return i>afterLabel;});
              const secEnd=nextPositions.length?Math.min(...nextPositions):draft.length;
              secContent=draft.substring(afterLabel,secEnd).trim();
            }
            function handleChange(e){
              const newVal=e.target.value;
              const existing=c.decisionDraft||"";
              const parsed={};
              ALL_KEYS.forEach(function(k,ki){
                const kStart=existing.indexOf(k+":");
                if(kStart>-1){
                  const afterLbl=existing.indexOf("\n",kStart)+1;
                  const nexts=ALL_KEYS.slice(ki+1).map(function(nk){return existing.indexOf(nk+":",afterLbl);}).filter(function(i){return i>afterLbl;});
                  const kEnd=nexts.length?Math.min(...nexts):existing.length;
                  parsed[k]=existing.substring(afterLbl,kEnd).trim();
                } else { parsed[k]=""; }
              });
              parsed[sec.key]=newVal;
              const rebuilt=ALL_KEYS.map(function(k){return k+":\n"+parsed[k];}).join("\n\n");
              onPatch(c.ref,{decisionDraft:rebuilt});
            }
            return(
              <div key={sec.key} className="card" style={{borderRadius:0,borderTop:"none",borderBottom:"none",marginBottom:0}}>
                <div style={{padding:"16px 20px"}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                    <div style={{fontSize:10,fontWeight:900,textTransform:"uppercase",letterSpacing:"0.1em",color:"#1072ba"}}>{sec.label}</div>
                    {!c.decisionDraft&&<span style={{fontSize:11,color:"#aab4bc",fontStyle:"italic"}}>Load template to pre-populate</span>}
                  </div>
                  <textarea className="dr-area" rows={sec.rows} style={{background:"white"}} placeholder={sec.hint} value={secContent} onChange={handleChange}/>
                </div>
              </div>
            );
          })}

          <div className="card" style={{borderRadius:"0 0 10px 10px",borderTop:"none",marginBottom:16}}>
            <div style={{padding:"16px 20px"}}>
              <div style={{fontSize:10,fontWeight:900,textTransform:"uppercase",letterSpacing:"0.1em",color:"#1072ba",marginBottom:8}}>Appeal Rights</div>
              <div style={{fontSize:12,color:"#5a646a",lineHeight:1.7,background:"#f7fafd",border:"1px solid #dce6f0",borderRadius:6,padding:"12px 14px"}}>
                This decision is final per the ICC Charter. A plan participant may request a CEO Plan Interpretation Review within <strong>15 business days</strong> of receipt. Valid grounds: (1) procedural defect, (2) material new evidence not available at time of ruling, (3) manifest misapplication of plan language. Submit written appeal to the CEO office with copy to <strong>icc@alianza.com</strong>.
              </div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:12}}>
                <div style={{fontSize:10,color:"#aab4bc",fontStyle:"italic"}}>Retain per Charter Section 9. Distribution: participant, direct manager, ICC archive.</div>
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  <div style={{fontSize:10,color:"#aab4bc"}}>Reviewed and approved for distribution by CGO:</div>
                  <div style={{fontSize:12,color:"#17477e",fontWeight:700,borderBottom:"1px solid #aab4bc",minWidth:160,paddingBottom:2}}>&nbsp;</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
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
    document.head.appendChild(SPIN_STYLE);
    return function(){ try { document.head.removeChild(SPIN_STYLE); } catch(e){} };
  },[]);

  useEffect(function(){
    // Try API first, fall back to localStorage
    fetch("https://icc-portal-api-anh3fnfabvfreabs.centralus-01.azurewebsites.net/api/getCases")
      .then(function(res){ return res.ok ? res.json() : null; })
      .then(function(data){
        if(data && data.length > 0) {
          setCases(data);
          // Sync to localStorage as backup
          try { localStorage.setItem("icc_v1", JSON.stringify(data)); } catch(e) {}
        } else {
          // Fall back to localStorage if API returns empty or fails
          try {
            const v = localStorage.getItem("icc_v1");
            if(v) setCases(JSON.parse(v));
          } catch(e) {}
        }
        setLoaded(true);
      })
      .catch(function(){
        // API unavailable - load from localStorage
        try {
          const v = localStorage.getItem("icc_v1");
          if(v) setCases(JSON.parse(v));
        } catch(e) {}
        setLoaded(true);
      });
  },[]);

  const saveCases=useCallback(function(updated){
    setCases(updated);
    // localStorage backup for resilience
    try { localStorage.setItem("icc_v1", JSON.stringify(updated)); } catch(e) {}
  },[]);

  // Wire individual case mutations to the API
  const apiAddCase = useCallback(async function(c) {
    await apiCreateCase(c);
  },[]);

  const apiPatchCase = useCallback(async function(ref, patch) {
    await apiUpdateCase(ref, patch);
  },[]);

  function addCase(c){
    saveCases([c,...cases]);
    apiAddCase(c);
    setView("dashboard");
  }
  function patchCase(ref,patch){
    saveCases(cases.map(function(c){return c.ref===ref?{...c,...patch}:c;}));
    apiPatchCase(ref, patch);
  }

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
          <div className="slogo">
            <img className="slogo-img" src="data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZlcnNpb249IjEuMSIgdmlld0JveD0iMCAwIDQwMC4yIDExNS45Ij4KICA8ZGVmcz48c3R5bGU+LmNscy0xe2ZpbGw6IzE3NDc3ZTt9PC9zdHlsZT48L2RlZnM+CiAgPGcgaWQ9IkxheWVyXzEiPjxwYXRoIGNsYXNzPSJjbHMtMSIgZD0iTTcwLjgsNjIuNGwtNy45LTE1LjUtOC4yLDE1LjVoMTYuMlpNNTksMzkuNWg4LjNsMjEuMiwzOC4xaC05LjdsLTQuNC04LjNoLTIzLjRsLTQuMyw4LjNoLTguNmwyMC45LTM4LjEiLz48cG9seWdvbiBjbGFzcz0iY2xzLTEiIHBvaW50cz0iOTYuMSAzOS41IDEwNC43IDM5LjUgMTA0LjcgNzAuNCAxMzIuNCA3MC40IDEzMi40IDc3LjYgOTYuMSA3Ny42IDk2LjEgMzkuNSIvPjxyZWN0IGNsYXNzPSJjbHMtMSIgeD0iMTQyLjIiIHk9IjM5LjUiIHdpZHRoPSI4LjYiIGhlaWdodD0iMzguMSIvPjxwYXRoIGNsYXNzPSJjbHMtMSIgZD0iTTE5Mi40LDYyLjRsLTcuOS0xNS41LTguMywxNS41aDE2LjJaTTE4MC42LDM5LjVoOC4zbDIxLjIsMzguMWgtOS43bC00LjQtOC4zaC0yMy40bC00LjMsOC4zaC04LjZsMjAuOS0zOC4xIi8+PHBhdGggY2xhc3M9ImNscy0xIiBkPSJNMjE2LjIsMzkuNWg1LjlsMjYsMjIuNGMxLjUsMS4yLDIuOSwyLjYsNC4yLDQuMS0uMi0zLjItLjQtNS40LS40LTYuNnYtMjBoNy43djM4LjFoLTUuOWwtMjcuMi0yMy42Yy0xLjEtMS0yLjEtMS45LTMuMS0zLjEuMywyLjkuNCw0LjkuNCw2djIwLjZoLTcuN3YtMzguMVoiLz48cG9seWdvbiBjbGFzcz0iY2xzLTEiIHBvaW50cz0iMjY3LjcgNzMuNCAyOTMuNiA0Ni4zIDI3MC4zIDQ2LjMgMjcwLjMgMzkuNSAzMDcuNCAzOS41IDMwNy40IDQzLjIgMjgxLjIgNzAuNCAzMDcuNCA3MC40IDMwNy40IDc3LjYgMjY3LjcgNzcuNiAyNjcuNyA3My40Ii8+PHBhdGggY2xhc3M9ImNscy0xIiBkPSJNMzQ0LjQsNjIuNGwtNy45LTE1LjUtOC4yLDE1LjVoMTYuMlpNMzMyLjYsMzkuNWg4LjNsMjEuMiwzOC4xaC05LjdsLTQuNC04LjNoLTIzLjRsLTQuMyw4LjNoLTguNmwyMC45LTM4LjEiLz48L2c+PC9zdmc+" alt="ALIANZA"/>
            <div className="slogo-pill"><span className="slogo-dot"></span><span className="slogo-sub">ICC Portal</span></div>
          </div>
          <nav style={{flex:1,paddingTop:8}}>
            <div className="nav-section">Main</div>
            {[{id:"dashboard",icon:"▦",label:"Case Dashboard",badge:open||0},{id:"new",icon:"+",label:"Open New Case"},{id:"cgo-memo",icon:"▣",label:"CGO Exception Memo"}].map(function(item){return(
              <button key={item.id} className={"nav-btn"+(view===item.id?" active":"")} onClick={function(){go(item.id);}}>
                <span className="nav-icon">{item.icon}</span>
                {item.label}
                {item.badge?<span className="nav-badge">{item.badge}</span>:null}
              </button>
            );})}
            <div className="nav-section" style={{marginTop:8}}>Records</div>
            {[{id:"precedents",icon:"⊞",label:"Precedent Register"},{id:"log",icon:"≡",label:"Case Log"}].map(function(item){return(
              <button key={item.id} className={"nav-btn"+(view===item.id?" active":"")} onClick={function(){go(item.id);}}>
                <span className="nav-icon">{item.icon}</span>
                {item.label}
              </button>
            );})}
          </nav>
          <div className="sfooter">ICC Portal v4.0<br/>ICC Charter v1.1 -- April 1, 2026<br/>Alianza Confidential</div>
        </div>
        <div className="main">
          {view==="dashboard"&&<Dashboard cases={cases} onGo={go} onImport={importCase}/>}
          {view==="new"&&<NewCase onSave={addCase} onBack={function(){go("dashboard");}}/>}
          {view==="cgo-memo"&&<CGOExceptionMemo onSave={addCase} onBack={function(){go("dashboard");}}/>}
          {view==="detail"&&<CaseDetail c={cases.find(function(c){return c.ref===selectedRef;})||null} onPatch={patchCase} onBack={function(){go("dashboard");}}/>}
          {view==="precedents"&&<Precedents cases={cases} onAddHistorical={addHistorical}/>}
          {view==="log"&&<CaseLog cases={cases} onGo={go}/>}
        </div>
      </div>
    </>
    </ErrorBoundary>
  );
}
