const currentHost = window.location.hostname || "127.0.0.1";

const API_BASES = [
  `http://${currentHost}:5000/api`,
  `http://${currentHost}:5001/api`,
  "http://127.0.0.1:5000/api",
  "http://localhost:5000/api",
  "http://127.0.0.1:5001/api",
  "http://localhost:5001/api",
];

const ANALYZE_URLS = [
  `http://${currentHost}:5000/api/analyze`,
  `http://${currentHost}:5000/analyze`,
  `http://${currentHost}:5001/api/analyze`,
  `http://${currentHost}:5001/analyze`,
  "http://127.0.0.1:5000/api/analyze",
  "http://127.0.0.1:5000/analyze",
  "http://localhost:5000/api/analyze",
  "http://localhost:5000/analyze",
  "http://127.0.0.1:5001/api/analyze",
  "http://127.0.0.1:5001/analyze",
  "http://localhost:5001/api/analyze",
  "http://localhost:5001/analyze",
];

const page = (window.location.pathname.split("/").pop() || "index.html").toLowerCase();

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setText(el, text, type = null) {
  if (!el) return;
  el.textContent = text;
  el.classList.remove("success", "error");
  if (type) el.classList.add(type);
}

function getUser() {
  const userRaw = sessionStorage.getItem("lsi_user");
  if (!userRaw) return null;
  try {
    return JSON.parse(userRaw);
  } catch {
    return null;
  }
}

function setUser(user) {
  sessionStorage.setItem("lsi_user", JSON.stringify(user));
}

function clearSession() {
  sessionStorage.removeItem("lsi_user");
  sessionStorage.removeItem("lsi_analysis_payload");
}

function getAnalysisPayload() {
  const raw = sessionStorage.getItem("lsi_analysis_payload");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function setAnalysisPayload(payload) {
  sessionStorage.setItem("lsi_analysis_payload", JSON.stringify(payload));
}

function normalizeSpaces(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function ensureAuth() {
  const user = getUser();
  if (!user) {
    window.location.href = "index.html#home";
    return null;
  }

  const badge = document.getElementById("userBadge");
  if (badge) {
    badge.textContent = `${user.fullName || user.email || "User"}`;
  }

  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      clearSession();
      window.location.href = "index.html#home";
    });
  }

  return user;
}

async function postAuth(endpoint, payload) {
  let response = null;
  let data = null;
  let lastNetworkError = null;

  for (const base of API_BASES) {
    try {
      response = await fetch(`${base}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      data = await response.json().catch(() => null);
      lastNetworkError = null;
      break;
    } catch (error) {
      lastNetworkError = error;
    }
  }

  if (lastNetworkError) {
    throw new Error(`Cannot reach backend at ${API_BASES.join(", ")}.`);
  }

  return { response, data };
}

async function runDocumentAnalysis(formData) {
  let response = null;
  let data = null;
  let lastNetworkError = null;
  let status = null;

  for (const url of ANALYZE_URLS) {
    try {
      response = await fetch(url, { method: "POST", body: formData });
      data = await response.json().catch(() => null);
      status = response.status;
      lastNetworkError = null;
      if (response.status !== 404) break;
    } catch (error) {
      lastNetworkError = error;
    }
  }

  if (lastNetworkError) {
    throw new Error("Cannot connect to backend for analysis.");
  }

  if (!response.ok) {
    throw new Error(data?.error || `Analysis request failed with HTTP ${status || response.status}.`);
  }

  return data;
}

function buildIssueRows(lineIssues, category) {
  const rows = lineIssues
    .filter((item) => item.category === category)
    .slice(0, 80)
    .map(
      (item) => `
      <tr>
        <td>${escapeHtml(item.location || `Pg ${item.page}, Ln ${item.line}`)}</td>
        <td>${escapeHtml(item.issueType || "-")}</td>
        <td>${escapeHtml(item.confidence ?? "-")}</td>
      </tr>
    `
    )
    .join("");

  if (!rows) {
    return `<p class="result-muted">No ${category} lines detected.</p>`;
  }

  return `
    <div class="table-wrap">
      <table class="result-table">
        <thead>
          <tr>
            <th>Page/Line</th>
            <th>Issue Type</th>
            <th>Confidence</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function initIndexPage() {
  const loginTab = document.getElementById("loginTab");
  const signupTab = document.getElementById("signupTab");
  const authForm = document.getElementById("authForm");
  const nameField = document.getElementById("nameField");
  const fullNameInput = document.getElementById("fullName");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const submitBtn = document.getElementById("submitBtn");
  const formSubtitle = document.getElementById("formSubtitle");
  const message = document.getElementById("message");

  let mode = "login";

  function setMode(nextMode) {
    mode = nextMode;
    const isSignup = mode === "signup";
    signupTab.classList.toggle("active", isSignup);
    loginTab.classList.toggle("active", !isSignup);
    nameField.classList.toggle("hidden", !isSignup);
    submitBtn.textContent = isSignup ? "Create Account" : "Login";
    formSubtitle.textContent = isSignup
      ? "Create your account to start securely."
      : "Enter your credentials to access your account.";
    fullNameInput.required = isSignup;
    setText(message, "", null);
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();
    setText(message, "", null);

    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const fullName = fullNameInput.value.trim();

    if (!email || !password || (mode === "signup" && !fullName)) {
      setText(message, "Please fill all required fields.", "error");
      return;
    }

    submitBtn.disabled = true;

    try {
      const endpoint = mode === "signup" ? "/register" : "/login";
      const payload = mode === "signup" ? { fullName, email, password } : { email, password };
      const { response, data } = await postAuth(endpoint, payload);

      if (!response.ok) {
        throw new Error(data?.error || `Request failed with HTTP ${response.status}.`);
      }

      if (mode === "signup") {
        setText(message, "Account created. Please login now.", "success");
        authForm.reset();
        setMode("login");
        return;
      }

      const user = data?.user || { fullName: fullName || email, email };
      setUser(user);
      window.location.href = "upload.html";
    } catch (error) {
      setText(message, error.message || "Something went wrong.", "error");
    } finally {
      submitBtn.disabled = false;
    }
  }

  loginTab.addEventListener("click", () => setMode("login"));
  signupTab.addEventListener("click", () => setMode("signup"));
  authForm.addEventListener("submit", handleAuthSubmit);
  setMode("login");

  if (getUser()) {
    window.location.href = "upload.html";
  }
}

function initUploadPage() {
  if (!ensureAuth()) return;

  const uploadForm = document.getElementById("uploadForm");
  const legalFile = document.getElementById("legalFile");
  const referenceFiles = document.getElementById("referenceFiles");
  const scanMode = document.getElementById("scanMode");
  const uploadMessage = document.getElementById("uploadMessage");
  const loadingState = document.getElementById("loadingState");
  const analysisInputSummary = document.getElementById("analysisInputSummary");

  function renderUploadSummary() {
    if (!legalFile.files || !legalFile.files[0]) return;
    const selectedFile = legalFile.files[0];
    const refs = Array.from((referenceFiles && referenceFiles.files) ? referenceFiles.files : []).slice(0, 2);
    const refNames = refs.length ? refs.map((f) => escapeHtml(f.name)).join(", ") : "None";

    analysisInputSummary.classList.remove("hidden");
    analysisInputSummary.innerHTML = `
      <p><strong>Final File:</strong> ${escapeHtml(selectedFile.name)}</p>
      <p><strong>Final Type:</strong> ${escapeHtml(selectedFile.type || "unknown")}</p>
      <p><strong>Final Size:</strong> ${escapeHtml((selectedFile.size / 1024).toFixed(2))} KB</p>
      <p><strong>Reference Docs:</strong> ${refs.length}</p>
      <p><strong>Reference Names:</strong> ${refNames}</p>
      <p><strong>Scan Mode:</strong> ${escapeHtml(scanMode.value)}</p>
    `;
    setText(uploadMessage, `Final document selected: ${selectedFile.name}`, "success");
  }

  legalFile.addEventListener("change", () => {
    renderUploadSummary();
  });

  if (referenceFiles) {
    referenceFiles.addEventListener("change", () => {
      const refs = Array.from(referenceFiles.files || []);
      if (refs.length > 2) {
        setText(uploadMessage, "Please select at most 2 reference documents.", "error");
        referenceFiles.value = "";
        return;
      }
      renderUploadSummary();
    });
  }

  scanMode.addEventListener("change", () => {
    renderUploadSummary();
  });

  uploadForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setText(uploadMessage, "", null);

    if (!legalFile.files || legalFile.files.length === 0) {
      setText(uploadMessage, "Please choose a file to continue.", "error");
      return;
    }

    const selectedFile = legalFile.files[0];
    const selectedScanMode = scanMode.value;
    const refs = Array.from((referenceFiles && referenceFiles.files) ? referenceFiles.files : []);
    if (refs.length > 2) {
      setText(uploadMessage, "You can upload up to 2 reference documents.", "error");
      return;
    }

    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("scanMode", selectedScanMode);
    refs.forEach((file) => formData.append("referenceFiles", file));

    uploadForm.classList.add("hidden");
    loadingState.classList.remove("hidden");

    try {
      const payload = await runDocumentAnalysis(formData);
      payload._meta = {
        fileName: selectedFile.name,
        fileType: selectedFile.type || "unknown",
        fileSizeKb: Number((selectedFile.size / 1024).toFixed(2)),
        referenceFiles: refs.map((f) => f.name),
      };
      setAnalysisPayload(payload);
      window.location.href = "issues.html";
    } catch (error) {
      loadingState.classList.add("hidden");
      uploadForm.classList.remove("hidden");
      setText(uploadMessage, error.message || "Analysis failed.", "error");
    }
  });
}

function initIssuesPage() {
  if (!ensureAuth()) return;

  const payload = getAnalysisPayload();
  if (!payload) {
    window.location.href = "upload.html";
    return;
  }

  const summary = payload.summary || {};
  const lineIssues = Array.isArray(payload.finalLineIssues)
    ? payload.finalLineIssues
    : Array.isArray(payload.lineIssues)
      ? payload.lineIssues
      : [];

  const issueStats = document.getElementById("issueStats");
  issueStats.innerHTML = `
    <article class="stat-card stat-dup">
      <h3>Duplication</h3>
      <p>${escapeHtml(summary.duplicationCount ?? 0)}</p>
    </article>
    <article class="stat-card stat-inc">
      <h3>Inconsistency</h3>
      <p>${escapeHtml(summary.inconsistencyCount ?? 0)}</p>
    </article>
    <article class="stat-card stat-con">
      <h3>Contradiction</h3>
      <p>${escapeHtml(summary.contradictionCount ?? 0)}</p>
    </article>
  `;

  const lineIssueTables = document.getElementById("lineIssueTables");
  lineIssueTables.innerHTML = `
    <section class="result-card">
      <h4>Duplication Lines</h4>
      ${buildIssueRows(lineIssues, "duplication")}
    </section>
    <section class="result-card">
      <h4>Inconsistency Lines</h4>
      ${buildIssueRows(lineIssues, "inconsistency")}
    </section>
    <section class="result-card">
      <h4>Contradiction Lines</h4>
      ${buildIssueRows(lineIssues, "contradiction")}
    </section>
  `;
}

function initSummaryPage() {
  if (!ensureAuth()) return;

  const payload = getAnalysisPayload();
  if (!payload) {
    window.location.href = "upload.html";
    return;
  }

  const summary = payload.summary || {};
  const findings = Array.isArray(payload.findings) ? payload.findings : [];
  const pageSummaries = Array.isArray(payload.pageSummaries) ? payload.pageSummaries : [];
  const lineIssues = Array.isArray(payload.finalLineIssues)
    ? payload.finalLineIssues
    : Array.isArray(payload.lineIssues)
      ? payload.lineIssues
      : [];
  const detailedSummary = String(payload.detailedSummary || "").trim();
  const meta = payload._meta || {};

  const summaryDetails = document.getElementById("summaryDetails");
  summaryDetails.innerHTML = `
    <article class="summary-item"><span>File</span><strong>${escapeHtml(meta.fileName || "-")}</strong></article>
    <article class="summary-item"><span>Scan Mode</span><strong>${escapeHtml(summary.scanMode || "-")}</strong></article>
    <article class="summary-item"><span>Threshold</span><strong>${escapeHtml(summary.threshold ?? "-")}</strong></article>
    <article class="summary-item"><span>Vendor</span><strong>${escapeHtml(summary.vendor || "Not found")}</strong></article>
    <article class="summary-item"><span>Vendee</span><strong>${escapeHtml(summary.vendee || "Not found")}</strong></article>
    <article class="summary-item"><span>Clauses</span><strong>${escapeHtml(summary.clauses ?? 0)}</strong></article>
    <article class="summary-item"><span>Pairs Compared</span><strong>${escapeHtml(summary.pairsCompared ?? 0)}</strong></article>
    <article class="summary-item"><span>Total Issues</span><strong>${escapeHtml(summary.issuesFound ?? 0)}</strong></article>
    <article class="summary-item"><span>Reference Docs</span><strong>${escapeHtml(summary.referenceDocs ?? 0)}</strong></article>
  `;

  const findingsBoard = document.getElementById("findingsBoard");
  const pageSummaryBoard = document.getElementById("pageSummaryBoard");
  const detailedSummaryText = document.getElementById("detailedSummaryText");

  if (detailedSummaryText) {
    detailedSummaryText.textContent = detailedSummary || "Detailed summary is not available for this document.";
  }

  if (pageSummaryBoard) {
    if (pageSummaries.length === 0) {
      pageSummaryBoard.innerHTML =
        `<article class="result-card"><p class="result-muted">No page-wise summary available for this document.</p></article>`;
    } else {
      pageSummaryBoard.innerHTML = pageSummaries
        .map((item) => {
          const keyLines = Array.isArray(item.keyLines) ? item.keyLines : [];
          const keyLineHtml = keyLines.length
            ? keyLines.map((k) => `<li>${escapeHtml(k)}</li>`).join("")
            : "<li>No flagged lines on this page.</li>";
          return `
          <article class="result-card">
            <h4>Page ${escapeHtml(item.page)}</h4>
            <p><strong>Clauses:</strong> ${escapeHtml(item.clauseCount ?? 0)}</p>
            <p><strong>Issues:</strong> ${escapeHtml(item.issueCount ?? 0)} (Duplication: ${escapeHtml(item.duplicationCount ?? 0)}, Inconsistency: ${escapeHtml(item.inconsistencyCount ?? 0)}, Contradiction: ${escapeHtml(item.contradictionCount ?? 0)})</p>
            <p><strong>Page Snippet:</strong> ${escapeHtml(item.pageSnippet || "-")}</p>
            <p><strong>Summary:</strong> ${escapeHtml(item.summaryText || "-")}</p>
            <p><strong>Key Lines:</strong></p>
            <ul>${keyLineHtml}</ul>
          </article>
        `;
        })
        .join("");
    }
  }

  if (findings.length === 0) {
    findingsBoard.innerHTML = `<article class="result-card"><p class="result-muted">No major findings detected for this document.</p></article>`;
    return;
  }

  const topFindings = findings.slice(0, 20);
  findingsBoard.innerHTML = topFindings
    .map(
      (item) => `
      <article class="result-card">
        <h4>${escapeHtml(item.category || "issue")} - ${escapeHtml(item.issueType || "-")}</h4>
        <p><strong>Confidence:</strong> ${escapeHtml(item.confidence ?? "-")}</p>
        <p><strong>Location A:</strong> ${escapeHtml(item.location1 || "-")}</p>
        <p><strong>Location B:</strong> ${escapeHtml(item.location2 || "-")}</p>
        <p><strong>Reason:</strong> ${escapeHtml(item.reason || "-")}</p>
      </article>
    `
    )
    .join("");

}

function initDashboardPage() {
  if (!ensureAuth()) return;

  const payload = getAnalysisPayload();
  if (!payload) {
    window.location.href = "upload.html";
    return;
  }

  const findings = Array.isArray(payload.findings) ? payload.findings : [];
  const lineIssues = Array.isArray(payload.finalLineIssues)
    ? payload.finalLineIssues
    : Array.isArray(payload.lineIssues)
      ? payload.lineIssues
      : [];

  const lineErrorDashboard = document.getElementById("lineErrorDashboard");
  const comparisonBoard = document.getElementById("comparisonBoard");

  if (lineErrorDashboard) {
    if (lineIssues.length === 0) {
      lineErrorDashboard.innerHTML = `<p class="result-muted">No line-level errors detected.</p>`;
    } else {
      const rows = lineIssues
        .slice(0, 200)
        .map(
          (item) => `
          <tr>
            <td>${escapeHtml(item.location || `Pg ${item.page}, Ln ${item.line}`)}</td>
            <td>${escapeHtml(item.category || "-")}</td>
            <td>${escapeHtml(item.issueType || "-")}</td>
            <td>${escapeHtml(item.confidence ?? "-")}</td>
            <td>${escapeHtml(item.reason || "-")}</td>
          </tr>
        `
        )
        .join("");

      lineErrorDashboard.innerHTML = `
        <div class="table-wrap">
          <table class="result-table">
            <thead>
              <tr>
                <th>Page/Line</th>
                <th>Category</th>
                <th>Issue Type</th>
                <th>Confidence</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `;
    }
  }

  if (comparisonBoard) {
    const crossFindings = findings
      .filter((f) => String(f.source1 || "").startsWith("reference_") || String(f.source2 || "").startsWith("reference_"))
      .slice(0, 80);

    if (!crossFindings.length) {
      comparisonBoard.innerHTML = `<article class="result-card"><p class="result-muted">Reference vs Final cross-verification mismatches not found.</p></article>`;
      return;
    }

    function suggestionFor(category, issueType, refText, finalText) {
      const c = String(category || "").toLowerCase();
      const i = String(issueType || "").toLowerCase();
      if (c === "duplication" || i.includes("duplication")) {
        return "இந்த clause repeated/near-duplicate. ஒரே legal meaning உள்ள line-ஐ மட்டும் வைத்துக்கொண்டு மற்றதை remove செய்யவும்.";
      }
      if (c === "inconsistency" || i.includes("inconsistency") || i.includes("numeric")) {
        return "Number/term mismatch இருக்கு. Reference document value-ஐ verify பண்ணி final document-ல் same value update செய்யவும்.";
      }
      if (c === "contradiction" || i.includes("conflict") || i.includes("contradiction")) {
        return "இரண்டு lines opposite meaning கொடுக்குது. Reference document intent எது சரி என்று confirm செய்து final document line-ஐ அதற்கு align செய்யவும்.";
      }
      if (String(refText || "").trim() && String(finalText || "").trim()) {
        return "Reference line மற்றும் final line legal intent same ஆக இருக்கிறதா verify செய்து, ambiguous words remove செய்து rewrite செய்யவும்.";
      }
      return "Clause wording-ஐ reference document-ஓடு compare செய்து consistent version-ஆ மாற்றவும்.";
    }

    comparisonBoard.innerHTML = crossFindings
      .map((item) => {
        const source1 = String(item.source1 || "");
        const source2 = String(item.source2 || "");
        const firstIsFinal = source1 === "final";
        const finalText = firstIsFinal ? item.clause1 : item.clause2;
        const refText = firstIsFinal ? item.clause2 : item.clause1;
        const finalLoc = firstIsFinal ? item.location1 : item.location2;
        const refLoc = firstIsFinal ? item.location2 : item.location1;
        const refLabel = firstIsFinal ? item.sourceLabel2 : item.sourceLabel1;
        const fixSuggestion = suggestionFor(item.category, item.issueType, refText, finalText);
        return `
          <article class="result-card comparison-card">
            <h4>Error at ${escapeHtml(finalLoc || "-")}</h4>
            <p><strong>Type:</strong> ${escapeHtml(item.category || "issue")} - ${escapeHtml(item.issueType || "-")}</p>
            <p><strong>What is wrong:</strong> ${escapeHtml(item.reason || "-")}</p>
            <p><strong>Original (${escapeHtml(refLabel || "Reference")} - ${escapeHtml(refLoc || "-")}):</strong></p>
            <p class="compare-text">${escapeHtml(refText || "-")}</p>
            <p><strong>Your Final Document (${escapeHtml(finalLoc || "-")}):</strong></p>
            <p class="compare-text">${escapeHtml(finalText || "-")}</p>
            <p><strong>How to rectify:</strong> ${escapeHtml(fixSuggestion)}</p>
            <div class="workflow-actions">
              <button
                type="button"
                class="secondary-btn rectify-btn"
                data-ref-text="${escapeHtml(normalizeSpaces(refText || ""))}"
                data-final-text="${escapeHtml(normalizeSpaces(finalText || ""))}"
              >
                Rectify this line
              </button>
              <span class="rectify-hint">Suggested corrected line will be copied.</span>
            </div>
          </article>
        `;
      })
      .join("");

    const rectifyButtons = comparisonBoard.querySelectorAll(".rectify-btn");
    rectifyButtons.forEach((btn) => {
      btn.addEventListener("click", async () => {
        const refLine = normalizeSpaces(btn.getAttribute("data-ref-text") || "");
        const finalLine = normalizeSpaces(btn.getAttribute("data-final-text") || "");
        const suggestion = refLine || finalLine || "Review this clause with reference document and update wording for consistency.";

        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(suggestion);
          }
          const hint = btn.parentElement && btn.parentElement.querySelector(".rectify-hint");
          if (hint) {
            hint.textContent = "Corrected line copied. Paste into your final document.";
          }
          btn.textContent = "Copied";
        } catch {
          const hint = btn.parentElement && btn.parentElement.querySelector(".rectify-hint");
          if (hint) {
            hint.textContent = `Suggested line: ${suggestion}`;
          }
        }
      });
    });
  }
}

if (page === "index.html" || page === "") {
  initIndexPage();
} else if (page === "upload.html") {
  initUploadPage();
} else if (page === "issues.html") {
  initIssuesPage();
} else if (page === "summary.html") {
  initSummaryPage();
} else if (page === "dashboard.html") {
  initDashboardPage();
} else if (page === "workflow.html") {
  window.location.href = "upload.html";
}
