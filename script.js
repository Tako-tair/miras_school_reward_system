const API_URL = "https://script.google.com/macros/s/AKfycbwdGxe9wsUT10-PGj24ZuYgb1lFsuTEDEhc2nbiYSzdxALnjQ5KLhwnvpI4kt5-1-sb/exec";

let isLoggedIn = false;
let lastActionMap = {};
let selectedPeriod = "all";

let allClasses = [];
let teachersData = [];
let actions = [];
let students = [];
let logs = [];

let selectedClass = "ALL";
let selectedStudent = null;
let selectedAction = null;
let searchText = "";
let studentSort = "name-asc";
let leaderboardSort = "points-desc";

let currentUser = null;
let allowedClasses = [];

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

const loginBtn = document.getElementById("loginBtn");
const loginEmail = document.getElementById("loginEmail");
const loginPassword = document.getElementById("loginPassword");
const undoBtn = document.getElementById("undoBtn");

function badgeLevel(points) {
  if (points >= 40) return "Legend";
  if (points >= 28) return "Gold";
  if (points >= 18) return "Silver";
  if (points >= 10) return "Bronze";
  return "Starter";
}

function normalizeBool(value) {
  if (typeof value === "boolean") return value;
  return String(value).toLowerCase() === "true";
}

function fillSelect(select, values, includeAll) {
  let html = "";

  if (includeAll) {
    html += '<option value="ALL">All Classes</option>';
  }

  html += values.map(function(v) {
    return '<option value="' + v + '">' + v + '</option>';
  }).join("");

  select.innerHTML = html;
}

function parseClasses(value) {
  if (!value) return [];
  if (String(value).trim().toUpperCase() === "ALL") return ["ALL"];

  return String(value)
    .split(",")
    .map(function(item) {
      return item.trim();
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

function isInPeriod(log) {
  if (selectedPeriod === "all") return true;

  const logDate = new Date(log.date.replace(" ", "T"));
  const now = new Date();

  if (isNaN(logDate.getTime())) return false;

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
        log.className === student.className &&
        log.studentName === student.name &&
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
  const response = await fetch(url);
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
  actions = data
    .filter(function(a) {
      return normalizeBool(a.active);
    })
    .map(function(a) {
      return {
        id: a.actionId,
        label: a.actionName,
        points: Number(a.points),
        type: a.type
      };
    })
    .filter(function(a) {
      return a.id && a.label;
    });

  if (!actions.length) {
    throw new Error("No actions found in Google Sheets.");
  }

  selectedAction = actions[0];
}

async function loadStudents() {
  const data = await fetchJson(API_URL + "?action=students");
  students = data
    .filter(function(s) {
      return normalizeBool(s.active);
    })
    .map(function(s) {
      return {
        id: s.studentId,
        name: s.fullName,
        className: s.className,
        totalPoints: 0
      };
    })
    .filter(function(s) {
      return s.id && s.name && s.className;
    });

  allClasses = Array.from(
    new Set(
      students.map(function(s) {
        return s.className;
      })
    )
  ).sort();
}

async function loadLogs() {
  const data = await fetchJson(API_URL + "?action=logs");
  logs = data.map(function(log, index) {
    return {
      id: index + 1,
      date: log.date || "",
      teacher: log.teacher || "",
      className: log.className || "",
      studentName: log.studentName || "",
      actionLabel: log.actionLabel || "",
      points: Number(log.points || 0),
      comment: log.comment || "",
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
    return allowedClasses.indexOf(student.className) !== -1;
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
      const classMatch = selectedClass === "ALL" || student.className === selectedClass;
      const searchMatch = student.name.toLowerCase().indexOf(searchText.toLowerCase()) !== -1;
      return classMatch && searchMatch;
    })
    .sort(sortStudentsBy(studentSort));
}

function getLeaderboardStudents() {
  const searchValue = leaderboardSearch ? leaderboardSearch.value.toLowerCase() : "";

  return getAccessibleStudents()
    .filter(function(student) {
      const classMatch = selectedClass === "ALL" || student.className === selectedClass;
      const searchMatch = student.name.toLowerCase().indexOf(searchValue) !== -1;
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
    const classMatch = selectedClass === "ALL" || l.className === selectedClass;
    const periodMatch = isInPeriod(l);
    const accessMatch = allowedClasses.indexOf("ALL") !== -1 || allowedClasses.indexOf(l.className) !== -1;
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
      '<h4>' + student.name + '</h4>' +
      '<p>Class ' + student.className + '</p>' +
      '<div class="student-footer">' +
      '<span class="points-badge">' + student.totalPoints + ' pts</span>' +
      '<button class="btn btn-primary" onclick="openStudentModal(\'' + student.id + '\')">Manage</button>' +
      '</div>' +
      '</div>';
  }).join("");

  studentsTableWrap.innerHTML =
    '<table class="table">' +
    '<thead>' +
    '<tr>' +
    '<th>Name</th>' +
    '<th>Class</th>' +
    '<th>Total Points</th>' +
    '<th>Badge</th>' +
    '<th>Action</th>' +
    '</tr>' +
    '</thead>' +
    '<tbody>' +
    list.map(function(student) {
      return '' +
        '<tr>' +
        '<td>' + student.name + '</td>' +
        '<td>' + student.className + '</td>' +
        '<td>' + student.totalPoints + '</td>' +
        '<td>' + badgeLevel(student.totalPoints) + '</td>' +
        '<td><button class="btn" onclick="openStudentModal(\'' + student.id + '\')">Manage Points</button></td>' +
        '</tr>';
    }).join("") +
    '</tbody>' +
    '</table>';
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
      '<h4>#' + (index + 1) + ' ' + student.name + '</h4>' +
      '<p>' + badgeLevel(student.totalPoints) + '</p>' +
      '<div class="student-footer">' +
      '<span class="level-badge">' + student.totalPoints + ' pts</span>' +
      '</div>' +
      '</div>';
  }).join("");

  leaderboardTableWrap.innerHTML =
    '<table class="table">' +
    '<thead>' +
    '<tr>' +
    '<th>Rank</th>' +
    '<th>Name</th>' +
    '<th>Class</th>' +
    '<th>Points</th>' +
    '<th>Badge</th>' +
    '</tr>' +
    '</thead>' +
    '<tbody>' +
    ranked.map(function(student, index) {
      return '' +
        '<tr>' +
        '<td>#' + (index + 1) + '</td>' +
        '<td>' + student.name + '</td>' +
        '<td>' + student.className + '</td>' +
        '<td>' + student.totalPoints + '</td>' +
        '<td>' + badgeLevel(student.totalPoints) + '</td>' +
        '</tr>';
    }).join("") +
    '</tbody>' +
    '</table>';

  leaderboardList.innerHTML = "";
}

function renderHistory() {
  if (!checkAuth(false)) {
    historyList.innerHTML = "";
    return;
  }

  historyList.innerHTML = logs
    .filter(function(log) {
      const classMatch = selectedClass === "ALL" || log.className === selectedClass;
      const periodMatch = isInPeriod(log);
      const accessMatch = allowedClasses.indexOf("ALL") !== -1 || allowedClasses.indexOf(log.className) !== -1;
      return classMatch && periodMatch && accessMatch;
    })
    .slice()
    .reverse()
    .map(function(log) {
      return '' +
        '<div class="history-item">' +
        '<div class="leader-right">' +
        '<div>' +
        '<h4>' + log.studentName + ' | ' + log.className + '</h4>' +
        '<p>' + log.teacher + ' | ' + log.date + '</p>' +
        '</div>' +
        '<span class="mini-badge ' + (log.points >= 0 ? 'positive' : 'negative') + '">' +
        (log.points >= 0 ? '+' : '') + log.points + ' pts' +
        '</span>' +
        '</div>' +
        '<p><strong>' + log.actionLabel + '</strong></p>' +
        '<p>' + log.comment + '</p>' +
        '</div>';
    }).join("");
}

function renderModalActions() {
  actionsGrid.innerHTML = actions.map(function(action) {
    const isActive = selectedAction && selectedAction.id === action.id;

    return '' +
      '<div class="action-item ' + (isActive ? 'active' : '') + '" onclick="selectAction(\'' + action.id + '\')">' +
      '<h5>' + action.label + '</h5>' +
      '<p>' + (action.type === 'positive' ? 'Positive' : 'Negative') + ' | ' +
      (action.points >= 0 ? '+' : '') + action.points + ' points</p>' +
      '</div>';
  }).join("");

  if (selectedAction) {
    selectedActionLabel.textContent = selectedAction.label;
    selectedActionPoints.textContent = (selectedAction.points >= 0 ? '+' : '') + selectedAction.points;
  }
}

function renderAll() {
  teacherNameTop.textContent = currentUser ? currentUser.teacherName : "Not logged in";
  updateStats();
  renderStudents();
  renderLeaderboard();
  renderHistory();
}

window.openStudentModal = function(studentId) {
  if (!checkAuth(true)) return;

  selectedStudent = students.find(function(s) {
    return s.id === studentId;
  });

  if (!selectedStudent) return;

  selectedAction = actions[0];
  commentInput.value = "";

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
    syncStatus.textContent = "Syncing to Google Sheets...";

    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify(log)
    });

    const result = await response.json();

    if (result.success) {
      syncStatus.textContent = "Synced to Google Sheets at " + log.date;
      syncBox.classList.add("synced");
      setTimeout(function() {
        syncBox.classList.remove("synced");
      }, 900);
      return true;
    } else {
      syncStatus.textContent = "Sync failed";
      alert("Data was not saved to Google Sheets.");
      return false;
    }
  } catch (error) {
    console.error("Sync error:", error);
    syncStatus.textContent = "Connection error";
    alert("Could not connect to Google Apps Script.");
    return false;
  }
}

async function savePoints() {
  if (!checkAuth(true)) return;
  if (!selectedStudent || !selectedAction || !currentUser) return;

  const key = selectedStudent.id + "_" + selectedAction.id;
  const now = Date.now();

  if (lastActionMap[key] && now - lastActionMap[key] < 10000) {
    const shouldContinue = confirm("You already gave this action recently. Continue?");
    if (!shouldContinue) return;
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
  closeModal();
  renderAll();
}

async function loginUser() {
  const email = loginEmail.value.trim().toLowerCase();
  const password = loginPassword.value.trim();

  if (!email || !password) {
    alert("Enter email and password.");
    return;
  }

  const found = teachersData.find(function(t) {
    return (
      String(t.email || "").toLowerCase() === email &&
      String(t.password || "") === password &&
      normalizeBool(t.active)
    );
  });

  if (!found) {
    alert("Wrong login or password.");
    return;
  }

  currentUser = found;
  isLoggedIn = true;
  allowedClasses = parseClasses(found.classes);

  if (allowedClasses.indexOf("ALL") !== -1) {
    fillSelect(classSelect, allClasses, true);
  } else {
    fillSelect(classSelect, allowedClasses, true);
  }

  selectedClass = "ALL";
  classSelect.value = "ALL";
  teacherNameTop.textContent = found.teacherName;
  syncStatus.textContent = "Logged in as " + found.teacherName;

  renderAll();
}

function switchTab(tab) {
  if (!checkAuth(true)) return;

  document.querySelectorAll(".menu-link").forEach(function(btn) {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });

  document.querySelectorAll(".tab-content").forEach(function(el) {
    el.classList.remove("active");
  });

  document.getElementById("tab-" + tab).classList.add("active");
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

    rebuildStudentsWithPoints();
    fillSelect(classSelect, allClasses, true);
    classSelect.value = "ALL";

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
document.getElementById("loginBtn").addEventListener("click", loginUser);
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

loadAllData();
