import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, getDoc,
  onSnapshot, query, where,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// ====== 1) ضع إعدادات Firebase الخاصة بك هنا ======
const firebaseConfig = {
  apiKey: "PASTE_HERE",
  authDomain: "PASTE_HERE",
  projectId: "PASTE_HERE",
  storageBucket: "PASTE_HERE",
  messagingSenderId: "PASTE_HERE",
  appId: "PASTE_HERE",
};

// ====== 2) أسماء المناطق (يجب أن تطابق ما تكتبه في حسابات الفنيين) ======
const REGIONS = ["المنطقة أ", "المنطقة ب", "المنطقة ج", "المنطقة د"];

const STATUS = { new: "جديدة", prog: "تحت الإجراء", done: "تم الإنجاز", prob: "مشكلة" };

const fbApp = initializeApp(firebaseConfig);
const db = getFirestore(fbApp);
const auth = getAuth(fbApp);
const ticketsCol = collection(db, "tickets");

// ====== الحالة ======
let tickets = [];
let profile = null;
let unsubscribe = null;
let pendingLoginMsg = "";
let techRegion = null;
let techFilter = "open";
let adminRegion = "all";

// ====== أدوات ======
const $ = (id) => document.getElementById(id);

function esc(text) {
  const d = document.createElement("div");
  d.textContent = text == null ? "" : String(text);
  return d.innerHTML;
}
function fmtDate(ts) {
  return new Date(ts).toLocaleString("ar-SA", { dateStyle: "medium", timeStyle: "short" });
}
function chip(label, active, onclick) {
  return `<button class="chip ${active ? "on" : ""}" onclick="${onclick}">${label}</button>`;
}

// ====== تسجيل الدخول ======
$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("loginMsg").textContent = "";
  try {
    await signInWithEmailAndPassword(auth, $("lEmail").value.trim(), $("lPass").value);
  } catch (err) {
    $("loginMsg").textContent = "البريد الإلكتروني أو كلمة المرور غير صحيحة";
  }
});
$("logoutBtn").onclick = () => signOut(auth);

onAuthStateChanged(auth, async (user) => {
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  tickets = [];
  profile = null;

  if (!user) {
    $("appView").classList.add("hidden");
    $("loginView").classList.remove("hidden");
    $("loginMsg").textContent = pendingLoginMsg;
    pendingLoginMsg = "";
    return;
  }

  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    if (!snap.exists()) throw new Error("no-profile");
    profile = snap.data();
  } catch (err) {
    pendingLoginMsg = "حسابك غير مفعّل. تواصل مع المسؤول.";
    await signOut(auth);
    return;
  }

  $("loginView").classList.add("hidden");
  $("appView").classList.remove("hidden");
  $("whoami").textContent = user.email;

  const isAdmin = profile.role === "admin";
  $("adminView").classList.toggle("hidden", !isAdmin);
  $("techView").classList.toggle("hidden", isAdmin);

  if (!isAdmin) {
    const regs = profile.regions || [];
    techRegion = regs[0] || null;
  }
  listenTickets(isAdmin);
  render();
});

// ====== قراءة التذاكر مباشرة ======
function listenTickets(isAdmin) {
  let q;
  if (isAdmin) {
    q = query(ticketsCol);
  } else {
    const regs = profile.regions || [];
    if (!regs.length) return;
    q = query(ticketsCol, where("region", "in", regs));
  }
  unsubscribe = onSnapshot(
    q,
    (snap) => {
      tickets = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => b.createdAt - a.createdAt);
      render();
    },
    (err) => console.error("خطأ في قراءة التذاكر", err)
  );
}

// ====== العمليات ======
async function addTicket() {
  const school = $("fSchool").value.trim();
  const region = $("fRegion").value;
  const num = $("fNum").value.trim();
  const desc = $("fDesc").value.trim();
  if (!school || !desc) {
    $("formMsg").textContent = "اكتب اسم المدرسة ووصف المشكلة";
    return;
  }
  try {
    await addDoc(ticketsCol, {
      school, region, num, desc,
      status: "new", note: "",
      createdAt: Date.now(), updatedAt: Date.now(),
    });
    $("fSchool").value = "";
    $("fNum").value = "";
    $("fDesc").value = "";
    $("formMsg").textContent = "✓ تم رفع التذكرة";
  } catch (err) {
    $("formMsg").textContent = "تعذر رفع التذكرة";
  }
}

async function setStatus(id, status) {
  const data = { status, updatedAt: Date.now() };
  if (status === "prob") {
    const note = prompt("اكتب وصف المشكلة:");
    if (note === null) return;
    data.note = note;
  }
  try {
    await updateDoc(doc(db, "tickets", id), data);
  } catch (err) {
    alert("تعذر حفظ الحالة");
  }
}

async function removeTicket(id) {
  if (!confirm("حذف هذه التذكرة؟")) return;
  try {
    await deleteDoc(doc(db, "tickets", id));
  } catch (err) {
    alert("تعذر الحذف");
  }
}

// ====== الرسم ======
function ticketCard(t, forTech) {
  const actions = forTech
    ? `<div class="acts">
         <button class="a-done ${t.status === "done" ? "cur" : ""}" onclick="setStatus('${t.id}','done')">✅ تم الإنجاز</button>
         <button class="a-prog ${t.status === "prog" ? "cur" : ""}" onclick="setStatus('${t.id}','prog')">⏳ تحت الإجراء</button>
         <button class="a-prob ${t.status === "prob" ? "cur" : ""}" onclick="setStatus('${t.id}','prob')">⚠️ مشكلة</button>
       </div>`
    : `<button class="del" onclick="removeTicket('${t.id}')">حذف التذكرة</button>`;

  return `
    <div class="card">
      <div class="top">
        <div>
          <div class="school">${esc(t.school)}</div>
          <div class="meta">${esc(t.region)}${t.num ? " · رقم " + esc(t.num) : ""} · ${fmtDate(t.createdAt)}</div>
        </div>
        <span class="badge s-${t.status}">${STATUS[t.status]}</span>
      </div>
      <div class="desc">${esc(t.desc)}</div>
      ${t.note ? `<div class="note">📝 ${esc(t.note)}</div>` : ""}
      ${actions}
    </div>`;
}

function renderTech() {
  const regs = profile.regions || [];
  if (!regs.length) {
    $("techRegions").innerHTML = "";
    $("techFilters").innerHTML = "";
    $("techList").innerHTML = '<div class="empty">لم يتم تعيين منطقة لحسابك بعد</div>';
    return;
  }
  const mine = tickets.filter((t) => t.region === techRegion);
  const openCount = mine.filter((t) => t.status !== "done").length;

  $("techRegions").innerHTML = regs
    .map((r) => chip(r, r === techRegion, `setTechRegion('${r}')`))
    .join("");

  $("techFilters").innerHTML =
    chip(`غير منجزة (${openCount})`, techFilter === "open", "setTechFilter('open')") +
    chip("المنجزة", techFilter === "done", "setTechFilter('done')") +
    chip("الكل", techFilter === "all", "setTechFilter('all')");

  const list = mine.filter((t) =>
    techFilter === "open" ? t.status !== "done" : techFilter === "done" ? t.status === "done" : true
  );
  $("techList").innerHTML = list.length
    ? list.map((t) => ticketCard(t, true)).join("")
    : '<div class="empty">لا توجد تذاكر 🎉</div>';
}

function renderAdmin() {
  const count = (s) => tickets.filter((t) => t.status === s).length;
  $("stats").innerHTML =
    `<span class="badge s-new">${count("new")} جديدة</span>` +
    `<span class="badge s-prog">${count("prog")} تحت الإجراء</span>` +
    `<span class="badge s-prob">${count("prob")} مشكلة</span>` +
    `<span class="badge s-done">${count("done")} منجزة</span>`;

  $("adminRegions").innerHTML =
    chip("كل المناطق", adminRegion === "all", "setAdminRegion('all')") +
    REGIONS.map((r) => chip(r, adminRegion === r, `setAdminRegion('${r}')`)).join("");

  const shown = tickets.filter((t) => adminRegion === "all" || t.region === adminRegion);
  $("adminList").innerHTML = shown.length
    ? shown.map((t) => ticketCard(t, false)).join("")
    : '<div class="empty">لا توجد تذاكر</div>';
}

function render() {
  if (!profile) return;
  if (profile.role === "admin") renderAdmin();
  else renderTech();
}

// ====== دوال التنقل ======
function setTechRegion(r) { techRegion = r; render(); }
function setTechFilter(f) { techFilter = f; render(); }
function setAdminRegion(r) { adminRegion = r; render(); }

// ====== البدء ======
$("addBtn").onclick = addTicket;
$("fRegion").innerHTML = REGIONS.map((r) => `<option>${r}</option>`).join("");

Object.assign(window, { setStatus, removeTicket, setTechRegion, setTechFilter, setAdminRegion });