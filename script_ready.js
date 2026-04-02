const API_URL = "https://script.google.com/macros/s/AKfycbwdGxe9wsUT10-PGj24ZuYgb1lFsuTEDEhc2nbiYSzdxALnjQ5KLhwnvpI4kt5-1-sb/exec";

const savedUser =
  JSON.parse(localStorage.getItem("mirasCurrentUser")) ||
  JSON.parse(sessionStorage.getItem("mirasCurrentUser"));

function redirectToLogin() {
  window.location.href = "login_page.html"; // или login.html, если ты переименовал файл
}

function logoutUser() {
  try {
    localStorage.removeItem("mirasCurrentUser");
    sessionStorage.removeItem("mirasCurrentUser");
    window.location.replace("login_page.html"); // или login.html
  } catch (error) {
    console.error("Logout error:", error);
    alert("Could not log out properly.");
  }
}

const logoutBtn = document.getElementById("logoutBtn");

if (logoutBtn) {
  logoutBtn.addEventListener("click", function () {
    logoutUser();
  });
}

function logoutUser() {
  localStorage.removeItem("mirasCurrentUser");
  sessionStorage.removeItem("mirasCurrentUser");
  redirectToLogin();
}

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

// 🔐 Проверка входа
if (!savedUser || !savedUser.isLoggedIn) {
  redirectToLogin();
} else {
  isLoggedIn = true;
  currentUser = {
    teacherName: savedUser.teacherName,
    email: savedUser.email,
    role: savedUser.role
  };
}

// DOM
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

// 🔧 ВАЖНО: поддержка Excel (число/строка)
function safeString(val) {
  if (val === undefined || val === null) return "";
  return String(val).trim();
}

// 🔧 универсальная проверка пользователя
function matchUser(user, email, password) {
  const userEmail = safeString(user.email).toLowerCase();
  const userPassword = safeString(user.password);

  return (
    userEmail === email ||
    safeString(user.teacherId).toLowerCase() === email ||
    safeString(user.teacherName).toLowerCase() === email
  ) && userPassword === password;
}

// 🔧 загрузка учителей
async function loadTeachers() {
  const response = await fetch(API_URL + "?action=teachers");
  const data = await response.json();

  teachersData = data.filter(t => {
    return String(t.active).toLowerCase() === "true";
  });
}

// 🔧 загрузка студентов
async function loadStudents() {
  const response = await fetch(API_URL + "?action=students");
  const data = await response.json();

  students = data.map(s => ({
    id: s.studentId,
    name: s.fullName,
    className: s.className,
    totalPoints: 0
  }));

  allClasses = [...new Set(students.map(s => s.className))];
}

// 🔧 загрузка логов (защита от кривого Excel)
async function loadLogs() {
  const response = await fetch(API_URL + "?action=logs");
  const data = await response.json();

  logs = data.map((log, i) => ({
    id: i,
    date: log.date || "",
    teacher: log.teacher || "",
    className: log.className || "",
    studentName: log.studentName || "",
    actionLabel: log.actionLabel || "",
    points: Number(log.points || 0),
    comment: log.comment || ""
  }));
}

// 🔧 загрузка действий
async function loadActions() {
  const response = await fetch(API_URL + "?action=actions");
  const data = await response.json();

  actions = data.map(a => ({
    id: a.actionId,
    label: a.actionName,
    points: Number(a.points)
  }));

  selectedAction = actions[0];
}

// 🔥 основной загрузчик
async function loadAllData() {
  try {
    syncStatus.textContent = "Loading...";

    await Promise.all([
      loadTeachers(),
      loadStudents(),
      loadLogs(),
      loadActions()
    ]);

    const foundTeacher = teachersData.find(t =>
      safeString(t.email).toLowerCase() === safeString(currentUser.email).toLowerCase()
    );

    if (!foundTeacher) {
      alert("User not found in Teachers sheet");
      logoutUser();
      return;
    }

    currentUser = foundTeacher;

    teacherNameTop.textContent = currentUser.teacherName;
    userRoleLabel.textContent = currentUser.role || "Teacher";

    syncStatus.textContent = "Connected to Google Sheets";

    renderAll();
  } catch (e) {
    console.error(e);
    syncStatus.textContent = "Error loading data";
  }
}

// 🔧 UI
function renderAll() {
  teacherNameTop.textContent = currentUser.teacherName;
}

// 🔧 logout
if (logoutBtn) {
  logoutBtn.addEventListener("click", logoutUser);
}

// 🔥 старт
loadAllData();
