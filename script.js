const API_URL = "https://script.google.com/macros/s/AKfycbwdGxe9wsUT10-PGj24ZuYgb1lFsuTEDEhc2nbiYSzdxALnjQ5KLhwnvpI4kt5-1-sb/exec";

function getSavedUser() {
  try {
    const localUser = localStorage.getItem("mirasCurrentUser");
    const sessionUser = sessionStorage.getItem("mirasCurrentUser");

    if (localUser) return JSON.parse(localUser);
    if (sessionUser) return JSON.parse(sessionUser);

    return null;
  } catch (error) {
    console.error("Error reading saved user:", error);
    return null;
  }
}

const savedUser = getSavedUser();

function redirectToLogin() {
  window.location.href = "login_page.html";
}

function logoutUser() {
  localStorage.removeItem("mirasCurrentUser");
  sessionStorage.removeItem("mirasCurrentUser");
  redirectToLogin();
}

let isLoggedIn = false;
let lastActionMap = {};
let selectedPeriod = "all";
let isSavingLog = false;

let allClasses = [];
let teachersData = [];
let actions = [];
let students = [];
let logs = [];

let selectedClass = "ALL";
let selectedStudent = null;
let selectedAction = null;
let openedCategories = {};
let searchText = "";
let studentSort = "name-asc";
let leaderboardSort = "points-desc";

let currentUser = null;
let allowedClasses = [];

if (!savedUser || !savedUser.isLoggedIn) {
  redirectToLogin();
} else {
  isLoggedIn = true;
  currentUser = {
    teacherName: savedUser.teacherName || "Unknown",
    email: savedUser.email || "",
    role: savedUser.role || "Teacher",
    classes: savedUser.classes || "ALL"
  };
  allowedClasses = parseClasses(currentUser.classes);
}

const classSelect = document.getElementById("classSelect");
const searchInput = document.getElementById("searchInput");
const studentSortSelect = document.getElementById("studentSort");
const periodFilter = document.getElementById("periodFilter");
const studentGrid = document.getElementById("studentGrid");
const leaderboardList = document.getElementById("leaderboardList");
const leaderboardTableWrap = document.getElementById("leaderboardTableWrap");
const leaderboardSearch = document.getElementById("leaderboardSearch");
const leaderboardSortSelect = document.getElementById("leaderboardSort");
const historyList = document.getElementById("historyList");
const studentsTableWrap = document.getElementById("studentsTableWrap");
const topThree = document.getElementById("topThree");
const modalBackdrop = document.getElementById("modalBackdrop");
const actionsGrid = document.getElementById("actionsGrid");
const modalTitle = document.getElementById("modalTitle");
const modalSubtitle = document.getElementById("modalSubtitle");
const selectedActionLabel = document.getElementById("selectedActionLabel");
const selectedActionPoints = document.getElementById("selectedActionPoints");
const commentInput = document.getElementById("commentInput");
const teacherNameTop = document.getElementById("teacherNameTop");
const syncStatus = document.getElementById("syncStatus");
const syncBox = document.getElementById("syncBox");
const undoBtn = document.getElementById("undoBtn");
const userRoleLabel = document.getElementById("userRoleLabel");
const logoutBtn = document.getElementById("logoutBtn");

function safeString(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeBool(value) {
  if (typeof value === "boolean") return value;
  return String(value).toLowerCase() === "true";
}

function normalizeClass(value) {
  return safeString(value).replace(/\s+/g, "").toUpperCase();
}

function normalizeText(value) {
  return safeString(value).toLowerCase();
}

function escapeHtml(value) {
  return safeString(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function badgeLevel(points) {
  if (points >= 40) return "Legend";
  if (points >= 28) return "Gold";
  if (points >= 18) return "Silver";
  if (points >= 10) return "Bronze";
  return "Starter";
}

function fillSelect(select, values, includeAll) {
  if (!select) return;

  let html = "";

  if (includeAll) {
    html += '<option value="ALL">All Classes</option>';
  }

  html += values.map(function(v) {
    return '<option value="' + escapeHtml(v) + '">' + escapeHtml(v) + "</option>";
  }).join("");

  select.innerHTML = html;
}

function parseClasses(value) {
  if (!value) return [];
  if (safeString(value).toUpperCase() === "ALL") return ["ALL"];

  return safeString(value)
    .split(",")
    .map(function(item) {
      return normalizeClass(item);
    })
    .filter(Boolean);
}

function checkAuth(showAlert) {
  if (!currentUser || !isLoggedIn) {
    if (showAlert) {
      alert("Please login first");
    }
    return false;
  }
  return true;
}

function parseLogDate(value) {
  if (!value) return null;

  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value)) {
    return value;
  }

  const raw = safeString(value);
  if (!raw) return null;

  const parsed = new Date(raw.replace(" ", "T"));
  if (isNaN(parsed.getTime())) return null;

  return parsed;
}

function formatLogDate(value) {
  const date = parseLogDate(value);

  if (!date) return safeString(value);

  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");

  return y + "-" + m + "-" + d + " " + h + ":" + min;
}

function isInPeriod(log) {
  if (selectedPeriod === "all") return true;

  const logDate = parseLogDate(log.date);
  const now = new Date();

  if (!logDate) return false;

  if (selectedPeriod === "today") {
    return logDate.toDateString() === now.toDateString();
  }

  if (selectedPeriod === "week") {
    const diffDays = (now - logDate) / (1000 * 60 * 60 * 24);
    return diffDays >= 0 && diffDays <= 7;
  }

  if (selectedPeriod === "month") {
    return (
      logDate.getFullYear() === now.getFullYear() &&
      logDate.getMonth() === now.getMonth()
    );
  }

  return true;
}

function getStudentTotalPoints(student) {
  return logs
    .filter(function(log) {
      return (
        normalizeClass(log.className) === normalizeClass(student.className) &&
        normalizeText(log.studentName) === normalizeText(student.name) &&
        isInPeriod(log)
      );
    })
    .reduce(function(sum, log) {
      return sum + Number(log.points || 0);
    }, 0);
}

function rebuildStudentsWithPoints() {
  students = students.map(function(student) {
    return {
      id: student.id,
      name: student.name,
      className: student.className,
      totalPoints: getStudentTotalPoints(student)
    };
  });
}

async function fetchJson(url) {
  const separator = url.indexOf("?") === -1 ? "?" : "&";
  const finalUrl = url + separator + "_ts=" + Date.now();

  const response = await fetch(finalUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Request failed: " + response.status);
  }

  return await response.json();
}

async function loadTeachers() {
  const data = await fetchJson(API_URL + "?action=teachers");
  teachersData = data.filter(function(t) {
    return normalizeBool(t.active);
  });
}



async function loadActions() {
  const data = await fetchJson(API_URL + "?action=actions");
  console.log("RAW ACTIONS DATA:", data);

  actions = data
    .filter(function(a) {
      return normalizeBool(a.active);
    })
    .map(function(a) {
      return {
        id: String(a.actionId || "").trim(),
        category: String(a.category || "Other").trim(),
        label: String(a.actionName || "").trim(),
        points: Number(a.points || 0),
        type: String(a.type || "").trim().toLowerCase()
      };
    })
    .filter(function(a) {
      return a.id && a.label;
    });

  console.log("PARSED ACTIONS:", actions);

  if (!actions.length) {
    throw new Error("No actions found in Google Sheets.");
  }

  selectedAction = null;
}

async function loadStudents() {
  const data = await fetchJson(API_URL + "?action=students");

  students = data
    .filter(function(s) {
      return normalizeBool(s.active);
    })
    .map(function(s) {
      return {
        id: safeString(s.studentId),
        name: safeString(s.fullName),
        className: safeString(s.className),
        totalPoints: 0
      };
    })
    .filter(function(s) {
      return s.id && s.name && s.className;
    });

  allClasses = Array.from(new Set(students.map(function(s) {
    return s.className;
  }))).sort();
}

async function loadLogs() {
  const data = await fetchJson(API_URL + "?action=logs");

  logs = data.map(function(log, index) {
    const shiftedOldRow =
      log &&
      log.id &&
      Object.prototype.toString.call(log.id) === "[object Date]";

    if (shiftedOldRow) {
      return {
        id: index + 1,
        date: formatLogDate(log.id),
        teacher: safeString(log.date),
        className: safeString(log.teacher),
        studentName: safeString(log.className),
        actionLabel: safeString(log.studentName),
        points: Number(log.actionLabel || 0),
        comment: safeString(log.points),
        timestamp: Number(log.timestamp || 0)
      };
    }

    return {
      id: Number(log.id || index + 1),
      date: formatLogDate(log.date),
      teacher: safeString(log.teacher),
      className: safeString(log.className),
      studentName: safeString(log.studentName),
      actionLabel: safeString(log.actionLabel),
      points: Number(log.points || 0),
      comment: safeString(log.comment),
      timestamp: Number(log.timestamp || 0)
    };
  });
}

function getAccessibleStudents() {
  if (!checkAuth(false)) return [];

  if (allowedClasses.indexOf("ALL") !== -1) {
    return students.slice();
  }

  return students.filter(function(student) {
    return allowedClasses.indexOf(normalizeClass(student.className)) !== -1;
  });
}

function sortStudentsBy(mode) {
  return function(a, b) {
    if (mode === "name-asc") return a.name.localeCompare(b.name);
    if (mode === "name-desc") return b.name.localeCompare(a.name);
    if (mode === "points-desc") return b.totalPoints - a.totalPoints;
    if (mode === "points-asc") return a.totalPoints - b.totalPoints;
    return 0;
  };
}

function getFilteredStudents() {
  return getAccessibleStudents()
    .filter(function(student) {
      const classMatch = selectedClass === "ALL" || normalizeClass(student.className) === normalizeClass(selectedClass);
      const searchMatch = normalizeText(student.name).indexOf(normalizeText(searchText)) !== -1;
      return classMatch && searchMatch;
    })
    .sort(sortStudentsBy(studentSort));
}

function getLeaderboardStudents() {
  const searchValue = leaderboardSearch ? normalizeText(leaderboardSearch.value) : "";

  return getAccessibleStudents()
    .filter(function(student) {
      const classMatch = selectedClass === "ALL" || normalizeClass(student.className) === normalizeClass(selectedClass);
      const searchMatch = normalizeText(student.name).indexOf(searchValue) !== -1;
      return classMatch && searchMatch;
    })
    .sort(sortStudentsBy(leaderboardSort));
}

function updateStats() {
  if (!checkAuth(false)) {
    document.getElementById("statStudents").textContent = "0";
    document.getElementById("statPoints").textContent = "0";
    document.getElementById("statAverage").textContent = "0";
    document.getElementById("statNegative").textContent = "0";
    return;
  }

  const current = getFilteredStudents();
  const total = current.reduce(function(sum, s) {
    return sum + s.totalPoints;
  }, 0);
  const avg = current.length ? Math.round(total / current.length) : 0;

  const negative = logs.filter(function(l) {
    const classMatch = selectedClass === "ALL" || normalizeClass(l.className) === normalizeClass(selectedClass);
    const periodMatch = isInPeriod(l);
    const accessMatch = allowedClasses.indexOf("ALL") !== -1 || allowedClasses.indexOf(normalizeClass(l.className)) !== -1;
    return classMatch && periodMatch && accessMatch && Number(l.points) < 0;
  }).length;

  document.getElementById("statStudents").textContent = current.length;
  document.getElementById("statPoints").textContent = total;
  document.getElementById("statAverage").textContent = avg;
  document.getElementById("statNegative").textContent = negative;
}

function renderStudents() {
  if (!checkAuth(false)) {
    studentGrid.innerHTML = "";
    studentsTableWrap.innerHTML = "";
    return;
  }

  const list = getFilteredStudents();

  studentGrid.innerHTML = list.map(function(student) {
    return '' +
      '<div class="student-card">' +
      "<h4>" + escapeHtml(student.name) + "</h4>" +
      "<p>Class " + escapeHtml(student.className) + "</p>" +
      '<div class="student-footer">' +
      '<span class="points-badge">' + student.totalPoints + " pts</span>" +
      '<button class="btn btn-primary" onclick="openStudentModal(\'' + String(student.id).replace(/'/g, "\\'") + "')\">Manage</button>" +
      "</div>" +
      "</div>";
  }).join("");

  studentsTableWrap.innerHTML =
    '<table class="table">' +
    "<thead>" +
    "<tr>" +
    "<th>Name</th>" +
    "<th>Class</th>" +
    "<th>Total Points</th>" +
    "<th>Badge</th>" +
    "<th>Action</th>" +
    "</tr>" +
    "</thead>" +
    "<tbody>" +
    list.map(function(student) {
      return '' +
        "<tr>" +
        "<td>" + escapeHtml(student.name) + "</td>" +
        "<td>" + escapeHtml(student.className) + "</td>" +
        "<td>" + student.totalPoints + "</td>" +
        "<td>" + badgeLevel(student.totalPoints) + "</td>" +
        '<td><button class="btn" onclick="openStudentModal(\'' + String(student.id).replace(/'/g, "\\'") + "')\">Manage Points</button></td>" +
        "</tr>";
    }).join("") +
    "</tbody>" +
    "</table>";
}

function renderLeaderboard() {
  if (!checkAuth(false)) {
    topThree.innerHTML = "";
    leaderboardTableWrap.innerHTML = "";
    leaderboardList.innerHTML = "";
    return;
  }

  const ranked = getLeaderboardStudents();

  topThree.innerHTML = ranked.slice(0, 3).map(function(student, index) {
    return '' +
      '<div class="top-item">' +
      "<h4>#" + (index + 1) + " " + escapeHtml(student.name) + "</h4>" +
      "<p>" + badgeLevel(student.totalPoints) + "</p>" +
      '<div class="student-footer">' +
      '<span class="level-badge">' + student.totalPoints + " pts</span>" +
      "</div>" +
      "</div>";
  }).join("");

  leaderboardTableWrap.innerHTML =
    '<table class="table">' +
    "<thead>" +
    "<tr>" +
    "<th>Rank</th>" +
    "<th>Name</th>" +
    "<th>Class</th>" +
    "<th>Points</th>" +
    "<th>Badge</th>" +
    "</tr>" +
    "</thead>" +
    "<tbody>" +
    ranked.map(function(student, index) {
      return '' +
        "<tr>" +
        "<td>#" + (index + 1) + "</td>" +
        "<td>" + escapeHtml(student.name) + "</td>" +
        "<td>" + escapeHtml(student.className) + "</td>" +
        "<td>" + student.totalPoints + "</td>" +
        "<td>" + badgeLevel(student.totalPoints) + "</td>" +
        "</tr>";
    }).join("") +
    "</tbody>" +
    "</table>";

  leaderboardList.innerHTML = "";
}

function renderHistory() {
  if (!checkAuth(false)) {
    historyList.innerHTML = "";
    return;
  }

  historyList.innerHTML = logs
    .filter(function(log) {
      const classMatch = selectedClass === "ALL" || normalizeClass(log.className) === normalizeClass(selectedClass);
      const periodMatch = isInPeriod(log);
      const accessMatch = allowedClasses.indexOf("ALL") !== -1 || allowedClasses.indexOf(normalizeClass(log.className)) !== -1;
      return classMatch && periodMatch && accessMatch;
    })
    .slice()
    .reverse()
    .map(function(log) {
      return '' +
        '<div class="history-item">' +
        '<div class="leader-right">' +
        "<div>" +
        "<h4>" + escapeHtml(log.studentName) + " | " + escapeHtml(log.className) + "</h4>" +
        "<p>" + escapeHtml(log.teacher) + " | " + escapeHtml(log.date) + "</p>" +
        "</div>" +
        '<span class="mini-badge ' + (log.points >= 0 ? "positive" : "negative") + '">' +
        (log.points >= 0 ? "+" : "") + log.points + " pts" +
        "</span>" +
        "</div>" +
        "<p><strong>" + escapeHtml(log.actionLabel) + "</strong></p>" +
        "<p>" + escapeHtml(log.comment) + "</p>" +
        "</div>";
    }).join("");
}

function renderModalActions() {
  if (!actionsGrid) return;

  const grouped = {};

  actions.forEach(function(action) {
    const category = action.category || "Other";
    if (!grouped[category]) {
      grouped[category] = [];
    }
    grouped[category].push(action);
  });

  const categories = Object.keys(grouped);

  actionsGrid.innerHTML = categories.map(function(category, index) {
    const items = grouped[category];
    const isOpen = !!openedCategories[category];

    return `
      <div class="category-block">
        <button
          type="button"
          class="category-toggle ${isOpen ? "active" : ""}"
          onclick="toggleCategory('${category.replace(/'/g, "\\'")}')"
        >
          <span class="category-title">${category}</span>
          <span class="category-icon">${isOpen ? "−" : "+"}</span>
        </button>

        <div class="category-dropdown ${isOpen ? "open" : ""}">
          ${items.map(function(action) {
            const isActive = selectedAction && selectedAction.id === action.id;
            const pointsText = (action.points >= 0 ? "+" : "") + action.points + " points";

            return `
              <div class="action-item ${isActive ? "active" : ""}" onclick="selectAction('${action.id}')">
                <div class="action-item-top">
                  <h5>${action.label}</h5>
                  <span class="action-points ${action.points >= 0 ? "positive" : "negative"}">${pointsText}</span>
                </div>
                <p>${action.type === "negative" ? "Negative" : "Positive"} action</p>
              </div>
            `;
          }).join("")}
        </div>
      </div>
    `;
  }).join("");

  if (selectedAction) {
    selectedActionLabel.textContent = selectedAction.label;
    selectedActionPoints.textContent =
      (selectedAction.points >= 0 ? "+" : "") + selectedAction.points + " pts";
  } else {
    selectedActionLabel.textContent = "No action selected";
    selectedActionPoints.textContent = "0 pts";
  }
}

function renderAll() {
  teacherNameTop.textContent = currentUser ? currentUser.teacherName : "Not logged in";

  if (userRoleLabel && currentUser) {
    userRoleLabel.textContent = currentUser.role || currentUser.position || "Teacher";
  }

  updateStats();
  renderStudents();
  renderLeaderboard();
  renderHistory();
}

window.openStudentModal = function(studentId) {
  if (!checkAuth(true)) return;

  selectedStudent = students.find(function(s) {
    return String(s.id) === String(studentId);
  });

  if (!selectedStudent) return;

selectedAction = null;
commentInput.value = "";
openedCategories = {};

actions.forEach(function(action) {
  if (!openedCategories[action.category]) {
    openedCategories[action.category] = false;
  }
});

  modalTitle.textContent = "Manage Points | " + selectedStudent.name;
  modalSubtitle.textContent =
    "Teacher: " + currentUser.teacherName +
    " | Class " + selectedStudent.className +
    " | Current total: " + selectedStudent.totalPoints + " points";

  renderModalActions();
  modalBackdrop.classList.remove("hidden");
};

window.selectAction = function(actionId) {
  selectedAction = actions.find(function(a) {
    return a.id === actionId;
  });
  renderModalActions();
};

window.toggleCategory = function(category) {
  openedCategories[category] = !openedCategories[category];
  renderModalActions();
};

function closeModal() {
  modalBackdrop.classList.add("hidden");
  selectedStudent = null;
}

function undoLast() {
  if (!checkAuth(true)) return;

  const lastLog = logs[logs.length - 1];
  if (!lastLog) {
    alert("No actions to undo.");
    return;
  }

  if (!confirm("Delete last action locally?")) return;

  logs.pop();
  rebuildStudentsWithPoints();
  closeModal();
  renderAll();
}

async function syncLog(log) {
  try {
    syncStatus.textContent = "Syncing...";

    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify(log)
    });

    const result = await response.json();

    if (!result.success) {
      syncStatus.textContent = "Save error";
      alert("Error saving");
      return false;
    }

    syncStatus.textContent = "Saved ✅";
    if (syncBox) {
      syncBox.classList.add("synced");
      setTimeout(function() {
        syncBox.classList.remove("synced");
      }, 800);
    }

    return true;
  } catch (error) {
    console.error("Sync error:", error);
    syncStatus.textContent = "Connection error";
    alert("Connection error");
    return false;
  }
}

async function savePoints() {
  if (!checkAuth(true)) return;
  if (!selectedStudent || !selectedAction || !currentUser) return;
  if (isSavingLog) return;

  const saveBtn = document.getElementById("saveBtn");
  isSavingLog = true;

  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving...";
  }

  try {
    const key = selectedStudent.id + "_" + selectedAction.id;
    const now = Date.now();

    if (lastActionMap[key] && now - lastActionMap[key] < 5000) {
      alert("Please wait a few seconds before sending the same action again.");
      return;
    }

    lastActionMap[key] = now;

    const dateObj = new Date();
    const date =
      dateObj.getFullYear() + "-" +
      String(dateObj.getMonth() + 1).padStart(2, "0") + "-" +
      String(dateObj.getDate()).padStart(2, "0") + " " +
      String(dateObj.getHours()).padStart(2, "0") + ":" +
      String(dateObj.getMinutes()).padStart(2, "0");

    const newLog = {
      studentId: selectedStudent.id,
      studentName: selectedStudent.name,
      className: selectedStudent.className,
      teacher: currentUser.teacherName,
      actionLabel: selectedAction.label,
      points: selectedAction.points,
      comment: commentInput.value.trim() || "No comment added.",
      date: date,
      timestamp: now
    };

    const success = await syncLog(newLog);
    if (!success) return;

    logs.push({
      id: logs.length + 1,
      date: newLog.date,
      teacher: newLog.teacher,
      className: newLog.className,
      studentName: newLog.studentName,
      actionLabel: newLog.actionLabel,
      points: newLog.points,
      comment: newLog.comment,
      timestamp: newLog.timestamp
    });

    rebuildStudentsWithPoints();
    renderAll();
    closeModal();
  } catch (error) {
    console.error("Save error:", error);
    alert("Error while saving data.");
  } finally {
    isSavingLog = false;

    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = "Save and Sync";
    }
  }
}

function switchTab(tab) {
  if (!checkAuth(true)) return;

  document.querySelectorAll(".menu-link").forEach(function(btn) {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });

  document.querySelectorAll(".tab-content").forEach(function(el) {
    el.classList.remove("active");
  });

  const targetTab = document.getElementById("tab-" + tab);
  if (targetTab) {
    targetTab.classList.add("active");
  }
}

async function loadAllData() {
  try {
    syncStatus.textContent = "Loading data from Google Sheets...";

    await Promise.all([
      loadTeachers(),
      loadActions(),
      loadStudents(),
      loadLogs()
    ]);

    const foundTeacher = teachersData.find(function(t) {
      return normalizeText(t.email) === normalizeText(currentUser.email);
    });

    if (!foundTeacher) {
      alert("This account was not found in Teachers sheet.");
      logoutUser();
      return;
    }

    currentUser = {
      teacherName: foundTeacher.teacherName || foundTeacher.fullName || "Unknown user",
      email: foundTeacher.email || "",
      role: foundTeacher.role || foundTeacher.position || "Teacher",
      classes: foundTeacher.classes || "ALL"
    };

    allowedClasses = parseClasses(currentUser.classes);
    if (!allowedClasses.length) {
      allowedClasses = ["ALL"];
    }

    rebuildStudentsWithPoints();

    if (allowedClasses.indexOf("ALL") !== -1) {
      fillSelect(classSelect, allClasses, true);
    } else {
      const visibleClasses = allClasses.filter(function(className) {
        return allowedClasses.indexOf(normalizeClass(className)) !== -1;
      });
      fillSelect(classSelect, visibleClasses, true);
    }

    selectedClass = "ALL";
    if (classSelect) classSelect.value = "ALL";

    teacherNameTop.textContent = currentUser.teacherName;
    if (userRoleLabel) {
      userRoleLabel.textContent = currentUser.role || "Teacher";
    }

    renderAll();
    syncStatus.textContent = "Loaded from Google Sheets";
  } catch (error) {
    console.error("Load error:", error);
    syncStatus.textContent = "Failed to load Google Sheets data";
    alert("Could not load data from Google Sheets. Check Apps Script and sheet structure.");
  }
}

document.getElementById("closeModal").addEventListener("click", closeModal);
document.getElementById("cancelBtn").addEventListener("click", closeModal);
document.getElementById("saveBtn").addEventListener("click", savePoints);
document.getElementById("undoBtn").addEventListener("click", undoLast);

classSelect.addEventListener("change", function(e) {
  selectedClass = e.target.value;
  renderAll();
});

searchInput.addEventListener("input", function(e) {
  searchText = e.target.value;
  renderStudents();
  updateStats();
});

studentSortSelect.addEventListener("change", function(e) {
  studentSort = e.target.value;
  renderStudents();
});

periodFilter.addEventListener("change", function(e) {
  selectedPeriod = e.target.value;
  rebuildStudentsWithPoints();
  renderAll();
});

leaderboardSortSelect.addEventListener("change", function(e) {
  leaderboardSort = e.target.value;
  renderLeaderboard();
});

leaderboardSearch.addEventListener("input", function() {
  renderLeaderboard();
});

document.querySelectorAll(".menu-link").forEach(function(btn) {
  btn.addEventListener("click", function() {
    switchTab(btn.dataset.tab);
  });
});

modalBackdrop.addEventListener("click", function(e) {
  if (e.target === modalBackdrop) {
    closeModal();
  }
});

if (logoutBtn) {
  logoutBtn.addEventListener("click", logoutUser);
}

loadAllData();
