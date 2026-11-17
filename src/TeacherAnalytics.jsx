import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";

// داشبورد دبیر؛ همه داده‌ها با همان حساب دبیر و سیاست‌های RLS خوانده می‌شوند.
// آمار تمرین (attempts) و آزمون نهایی (exam_sessions) از هم مستقل است.
const NUMBER = new Intl.NumberFormat("fa-IR");
const PERCENT = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 1 });
const TEHRAN_DATE = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit"
});
const FA_DATE = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
  timeZone: "Asia/Tehran", year: "numeric", month: "long", day: "numeric"
});
const FA_DATETIME = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
  timeZone: "Asia/Tehran", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
});

const yes = value => value === true || value === "true" || value === 1;
const number = value => NUMBER.format(Number(value) || 0);
const percent = (correct, total) => total > 0 ? `${PERCENT.format(correct * 100 / total)}٪` : "—";
const nameOf = student => student?.display_name || "بدون نام";
const PERIOD_OPTIONS = [
  ["all", "کل دوره"], ["7", "۷ روز اخیر"], ["30", "۳۰ روز اخیر"], ["90", "۹۰ روز اخیر"]
];
const PERIOD_LABELS = Object.fromEntries(PERIOD_OPTIONS);
function dateInPeriod(value, period, today) {
  if (period === "all") return true;
  const day = localDateKey(value);
  if (!day) return false;
  const ms = Date.parse(`${today}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`);
  return ms >= 0 && ms < Number(period) * 86400000;
}
function questionScope(q) {
  const chapter = `${q.book || "بدون کتاب"} / ${q.chapter || "بدون فصل"}`;
  return { chapter, topic: `${chapter} / ${q.lesson || "بدون گفتار"} / ${q.topic || "بدون موضوع"}` };
}
function learningStatus(row) {
  // پاسخ‌های تکراری به تنهایی تسلط اولیه را اثبات نمی‌کنند؛ برای تشخیص
  // حداقل پنج مواجهه اولیه یا پنج سؤال آزمون نیاز است.
  const firstReady = row.firstTotal >= 5;
  const examReady = row.examTotal >= 5;
  if (!firstReady && !examReady) return { key: "limited", label: "داده ناکافی", explanation: "برای قضاوت دست‌کم ۵ پاسخ اولیه یا ۵ سؤال آزمون لازم است." };
  const firstRate = row.firstTotal ? row.firstCorrect / row.firstTotal : null;
  const examRate = row.examTotal ? row.examCorrect / row.examTotal : null;
  const repeatRate = row.repeatedTotal ? row.repeatedCorrect / row.repeatedTotal : null;
  const lowFirst = firstReady && firstRate < 0.6;
  const lowExam = examReady && examRate < 0.55;
  const firstStrong = firstReady && firstRate >= 0.8;
  const examStrong = examReady && examRate >= 0.8;
  const repeatImproving = row.repeatedTotal >= 3 && repeatRate >= 0.75;
  if ((lowFirst || lowExam) && !repeatImproving) return { key: "weak", label: "نقطه ضعف", explanation: "دقت پایین در پاسخ اولیه یا آزمون؛ تمرین هدفمند پیشنهاد می‌شود." };
  if ((firstStrong || examStrong) && (!examReady || examRate >= 0.7) && (!firstReady || firstRate >= 0.7)) {
    return { key: "strong", label: "نقطه قوت", explanation: "عملکرد اولیه یا آزمون مناسب است و شواهد متعارض مهم دیده نمی‌شود." };
  }
  return { key: "improve", label: "نیازمند تمرین", explanation: repeatImproving && (lowFirst || lowExam)
    ? "پس از تکرار پیشرفت دیده می‌شود؛ تثبیت یادگیری هنوز مهم است."
    : "برای رسیدن به تسلط پایدار، تمرین تکمیلی مفید است." };
}
function LearningBadge({ status }) {
  return <span className={`analytics-learning-badge analytics-learning-badge--${status.key}`}
    title={status.explanation}>{status.label}</span>;
}

function localDateKey(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = Object.fromEntries(TEHRAN_DATE.formatToParts(date)
    .filter(part => ["year", "month", "day"].includes(part.type))
    .map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function readableDate(value, withTime = false) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : (withTime ? FA_DATETIME : FA_DATE).format(d);
}
function accessStatus(student, todayISO) {
  if (!student.is_approved) return { label: "در انتظار تأیید", style: "pending" };
  if (student.access_start_date && todayISO < student.access_start_date) return { label: "شروع‌نشده", style: "future" };
  if (student.access_end_date && todayISO > student.access_end_date) return { label: "پایان‌یافته", style: "expired" };
  return { label: "فعال", style: "active" };
}
function newCounter(label) {
  return { label, practiceTotal: 0, practiceCorrect: 0,
    firstTotal: 0, firstCorrect: 0, repeatedTotal: 0, repeatedCorrect: 0,
    examTotal: 0, examCorrect: 0 };
}

// جدول attempts نوع «تمرین عادی» یا «مرور» را ثبت نمی‌کند.
// برای هر دانش‌آموز و هر سؤال، قدیمی‌ترین پاسخ ثبت‌شده «اولین پاسخ» است
// و موارد بعدی «پاسخ تکراری» محسوب می‌شوند؛ حتی اگر در یک تمرین تازه باشند.
function orderedPracticeAttempts(rows) {
  return [...rows].sort((a, b) => {
    const left = Date.parse(a.attempted_at || "") || 0;
    const right = Date.parse(b.attempted_at || "") || 0;
    if (left !== right) return left - right;
    return String(a.id ?? "").localeCompare(String(b.id ?? ""), "en", { numeric: true });
  });
}
function getCounter(map, key, label) {
  if (!map.has(key)) map.set(key, newCounter(label));
  return map.get(key);
}
function sortRows(rows) {
  return [...rows].sort((a, b) => (a.practiceTotal + a.examTotal) === (b.practiceTotal + b.examTotal)
    ? a.label.localeCompare(b.label, "fa")
    : (b.practiceTotal + b.examTotal) - (a.practiceTotal + a.examTotal));
}
function csvCell(value) {
  // جلوگیری از تبدیل مقدار سلول به فرمول هنگام باز شدن در Excel.
  let text = String(value ?? "");
  if (/^[\s]*[=+@\-]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
function downloadCsv(filename, rows) {
  const content = "\uFEFF" + rows.map(row => row.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function AnalyticsStat({ title, value, caption, kind = "default" }) {
  return <div className={`analytics-stat analytics-stat--${kind}`}>
    <span className="analytics-stat__title">{title}</span>
    <strong className="analytics-stat__value">{value}</strong>
    <small>{caption}</small>
  </div>;
}

function ResultProgress({ correct, total, kind = "practice" }) {
  const value = total ? Math.max(0, Math.min(100, (correct / total) * 100)) : 0;
  return <div className="analytics-progress-line" title={total ? `${percent(correct, total)} پاسخ صحیح` : "داده‌ای ثبت نشده"}>
    <div className="analytics-progress-track" aria-hidden="true">
      <span className={`analytics-progress-fill analytics-progress-fill--${kind}`} style={{ width: `${value}%` }}/>
    </div>
    <span>{percent(correct, total)}</span>
  </div>;
}

function TopicTable({ rows, title, level, onDetail }) {
  return <div className="analytics-table-section">
    <h4>{title}</h4>
    {rows.length === 0 ? <p className="analytics-muted">برای این بخش هنوز پاسخ قابل دسته‌بندی وجود ندارد.</p> :
      <div className="analytics-scroll-table">
        <table className="analytics-table">
          <thead><tr><th>{level}</th><th>وضعیت یادگیری</th><th>تمرین (کل)</th><th>درصد کل تمرین</th><th>اولین پاسخ به هر سؤال</th><th>پاسخ‌های تکراری</th><th>سؤالات آزمون</th><th>درصد آزمون</th><th>جزئیات</th></tr></thead>
          <tbody>{rows.map(row => <tr key={row.label}>
            <td>{row.label}</td>
            <td><LearningBadge status={learningStatus(row)}/></td>
            <td>{number(row.practiceTotal)}</td>
            <td><ResultProgress total={row.practiceTotal} correct={row.practiceCorrect} /></td>
            <td><ResultProgress total={row.firstTotal} correct={row.firstCorrect} /></td>
            <td><ResultProgress total={row.repeatedTotal} correct={row.repeatedCorrect} /></td>
            <td>{number(row.examTotal)}</td>
            <td><ResultProgress total={row.examTotal} correct={row.examCorrect} kind="exam" /></td>
            <td><button type="button" className="analytics-mini-button" onClick={() => onDetail(row.label)}>سؤال‌ها</button></td>
          </tr>)}</tbody>
        </table>
      </div>}
  </div>;
}

export default function TeacherAnalytics({ students = [], questions = [], attempts = [], examSessions = [], todayISO, onRefresh, refreshing = false, selectedStudentId = "", onStudentSelect = () => {} }) {
  const [studentSearch, setStudentSearch] = useState("");
  const [examQuestionRows, setExamQuestionRows] = useState([]);
  const [examDetailLoading, setExamDetailLoading] = useState(false);
  const [examDetailError, setExamDetailError] = useState("");
  const [activeView, setActiveView] = useState("chapter");
  const [period, setPeriod] = useState("all");
  const [openedDetail, setOpenedDetail] = useState(null);
  const [showExamHistory, setShowExamHistory] = useState(false);

  useEffect(() => { setOpenedDetail(null); }, [selectedStudentId, activeView, period]);

  // exam_sessions فقط نتیجه کلی جلسه را دارد؛ جزئیات فصلی آزمون
  // از exam_session_questions (با RLS ویژه دبیر) خوانده می‌شود.
  useEffect(() => {
    let cancelled = false;
    const finalIds = examSessions.filter(s => s.status === "submitted").map(s => String(s.id));
    if (!finalIds.length) {
      setExamQuestionRows([]);
      setExamDetailError("");
      setExamDetailLoading(false);
      return () => { cancelled = true; };
    }
    setExamDetailLoading(true);
    setExamDetailError("");
    (async () => {
      try {
        const rows = [];
        // تعداد شناسه‌ها در هر درخواست محدود می‌شود تا URL از حد مجاز فراتر نرود.
        for (let i = 0; i < finalIds.length; i += 60) {
          const ids = finalIds.slice(i, i + 60);
          for (let from = 0;; from += 1000) {
            const { data, error } = await supabase.from("exam_session_questions")
              .select("session_id,question_id,selected_answer,is_correct")
              .in("session_id", ids)
              .order("id", { ascending: true })
              .range(from, from + 999);
            if (error) throw error;
            rows.push(...(data || []));
            if (cancelled) return;
            if (!data || data.length < 1000) break;
          }
        }
        if (!cancelled) setExamQuestionRows(rows);
      } catch (error) {
        if (!cancelled) {
          setExamQuestionRows([]);
          setExamDetailError("جزئیات سؤالات آزمون دریافت نشد؛ آمار کلی آزمون‌ها همچنان در دسترس است. " + (error?.message || ""));
        }
      } finally {
        if (!cancelled) setExamDetailLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [examSessions]);

  const selectedStudent = students.find(s => String(s.id) === selectedStudentId) || null;
  const visibleStudentIds = useMemo(() => new Set(selectedStudent ? [String(selectedStudent.id)] : students.map(s => String(s.id))), [students, selectedStudent]);

  const analytics = useMemo(() => {
    const questionMap = new Map(questions.map(q => [String(q.id), q]));
    const sessionMap = new Map(examSessions.map(s => [String(s.id), s]));
    const today = todayISO || localDateKey(new Date());
    // ابتدا فاز هر پاسخ را در کل سوابقِ بارگذاری‌شده می‌یابیم؛ فیلتر زمانی
    // نباید یک پاسخ قدیمی تکراری را به اشتباه «اولین پاسخ» تبدیل کند.
    const firstGlobal = new Map();
    const practicePhases = new Map();
    for (const a of orderedPracticeAttempts(attempts)) {
      const key = JSON.stringify([String(a.student_id), String(a.question_id)]);
      const first = firstGlobal.get(key);
      practicePhases.set(a, first ? "repeated" : "first");
      if (!first) firstGlobal.set(key, a);
    }
    const scopedPractice = attempts.filter(a => visibleStudentIds.has(String(a.student_id)) && dateInPeriod(a.attempted_at, period, today));
    const scopedSessions = examSessions.filter(s => visibleStudentIds.has(String(s.student_id)) && dateInPeriod(s.submitted_at || s.ended_at || s.started_at, period, today));
    const finalExams = scopedSessions.filter(s => s.status === "submitted");
    const finalExamIds = new Set(finalExams.map(s => String(s.id)));
    const practiceCorrect = scopedPractice.filter(a => yes(a.is_correct)).length;
    const examCorrect = finalExams.reduce((total, s) => total + Number(s.correct_count || 0), 0);
    const examTotal = finalExams.reduce((total, s) => total + Number(s.question_count || 0), 0);
    const chapters = new Map();
    const topics = new Map();
    const perStudent = new Map(students.map(s => [String(s.id), {
      practice: 0, correct: 0, firstTotal: 0, firstCorrect: 0,
      repeatedTotal: 0, repeatedCorrect: 0, recovered: 0,
      exams: 0, examCorrect: 0, examTotal: 0
    }]));
    const practiceGroups = new Map();
    const questionDetails = new Map();
    const detailFor = questionId => {
      const id = String(questionId);
      if (!questionDetails.has(id)) {
        const q = questionMap.get(id);
        if (!q) return null;
        questionDetails.set(id, { id, code: q.question_code || q.code || `شناسه ${id}`,
          statement: q.statement || "", ...questionScope(q), firstWrong: 0,
          repeatWrong: 0, examWrong: 0, examUnanswered: 0,
          lastWrongStudents: new Set(), studentStates: new Map() });
      }
      return questionDetails.get(id);
    };
    let firstTotal = 0;
    let firstCorrect = 0;
    let repeatedTotal = 0;
    let repeatedCorrect = 0;
    let initialErrorsRepeated = 0;
    let recoveredOnLast = 0;

    const addClassified = (question, kind, correct, phase = null) => {
      if (!question) return;
      const { chapter, topic } = questionScope(question);
      for (const [map, key] of [[chapters, chapter], [topics, topic]]) {
        const row = getCounter(map, key, key);
        if (kind === "practice") {
          row.practiceTotal += 1;
          if (correct) row.practiceCorrect += 1;
          if (phase === "first") {
            row.firstTotal += 1;
            if (correct) row.firstCorrect += 1;
          } else if (phase === "repeated") {
            row.repeatedTotal += 1;
            if (correct) row.repeatedCorrect += 1;
          }
        } else {
          row.examTotal += 1;
          if (correct) row.examCorrect += 1;
        }
      }
    };

    for (const a of orderedPracticeAttempts(scopedPractice)) {
      const stat = perStudent.get(String(a.student_id));
      const isCorrect = yes(a.is_correct);
      // JSON.stringify مانع برخورد احتمالی شناسه‌های مرکب می‌شود.
      const groupKey = JSON.stringify([String(a.student_id), String(a.question_id)]);
      const group = practiceGroups.get(groupKey);
      const phase = practicePhases.get(a) || "first";
      if (!group) practiceGroups.set(groupKey, { first: firstGlobal.get(groupKey) || a, last: a, count: 1, repeatedInPeriod: phase === "repeated" });
      else { group.last = a; group.count += 1; if (phase === "repeated") group.repeatedInPeriod = true; }
      const detail = detailFor(a.question_id);
      if (detail) {
        if (!isCorrect) {
          if (phase === "first") detail.firstWrong++;
          else detail.repeatWrong++;
        }
        detail.studentStates.set(String(a.student_id), { correct: isCorrect, date: a.attempted_at });
      }

      if (phase === "first") {
        firstTotal++;
        if (isCorrect) firstCorrect++;
      } else {
        repeatedTotal++;
        if (isCorrect) repeatedCorrect++;
      }
      if (stat) {
        stat.practice++;
        if (isCorrect) stat.correct++;
        if (phase === "first") {
          stat.firstTotal++;
          if (isCorrect) stat.firstCorrect++;
        } else {
          stat.repeatedTotal++;
          if (isCorrect) stat.repeatedCorrect++;
        }
      }
      addClassified(questionMap.get(String(a.question_id)), "practice", isCorrect, phase);
    }
    for (const [key, group] of practiceGroups) {
      if (yes(group.first.is_correct) || !group.repeatedInPeriod) continue;
      initialErrorsRepeated++;
      if (yes(group.last.is_correct)) {
        recoveredOnLast++;
        const studentId = JSON.parse(key)[0];
        const stat = perStudent.get(studentId);
        if (stat) stat.recovered++;
      }
    }
    for (const s of finalExams) {
      const stat = perStudent.get(String(s.student_id));
      if (stat) { stat.exams++; stat.examCorrect += Number(s.correct_count || 0); stat.examTotal += Number(s.question_count || 0); }
    }
    // پاسخ ندادن هم در نمره آزمون نادرست محسوب می‌شود.
    for (const row of examQuestionRows) {
      const session = sessionMap.get(String(row.session_id));
      if (!session || !finalExamIds.has(String(row.session_id))) continue;
      const detail = detailFor(row.question_id);
      if (detail && !yes(row.is_correct)) {
        detail.examWrong++;
        if (row.selected_answer === null || row.selected_answer === undefined) detail.examUnanswered++;
      }
      addClassified(questionMap.get(String(row.question_id)), "exam", yes(row.is_correct));
    }

    for (const detail of questionDetails.values()) {
      for (const [studentId, state] of detail.studentStates) {
        if (!state.correct) detail.lastWrongStudents.add(studentId);
      }
    }
    const problemQuestions = [...questionDetails.values()]
      .map(d => ({ ...d, lastWrong: d.lastWrongStudents.size, studentsSeen: d.studentStates.size }))
      .filter(d => d.firstWrong || d.repeatWrong || d.examWrong)
      .sort((a, b) => (b.firstWrong + b.repeatWrong + b.examWrong) - (a.firstWrong + a.repeatWrong + a.examWrong));
    const timeline = [];
    for (const a of scopedPractice) {
      if (a.attempted_at) timeline.push({ type: "practice", phase: practicePhases.get(a), at: a.attempted_at, correct: yes(a.is_correct), question: questionMap.get(String(a.question_id)) });
    }
    for (const s of finalExams) {
      timeline.push({ type: "exam", at: s.submitted_at || s.ended_at || s.started_at, score: s.score_percent, count: s.question_count, correct: s.correct_count });
    }
    timeline.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

    const trend = Array.from({ length: 14 }, (_, i) => {
      const date = new Date(`${today}T12:00:00Z`);
      date.setUTCDate(date.getUTCDate() - (13 - i));
      const key = date.toISOString().slice(0, 10);
      return { key, label: readableDate(date), practice: 0, exam: 0 };
    });
    const trendMap = new Map(trend.map(item => [item.key, item]));
    for (const a of scopedPractice) { const day = trendMap.get(localDateKey(a.attempted_at)); if (day) day.practice++; }
    for (const s of finalExams) { const day = trendMap.get(localDateKey(s.submitted_at || s.ended_at || s.started_at)); if (day) day.exam++; }

    // هشت بازه هفت‌روزه اخیر برای سنجش تغییر درصد پاسخ صحیح در طول زمان.
    const performanceTrend = Array.from({ length: 8 }, (_, i) => ({
      label: `هفته ${NUMBER.format(i + 1)}`,
      practiceTotal: 0, practiceCorrect: 0, examTotal: 0, examCorrect: 0
    }));
    const todayMillis = Date.parse(`${today}T00:00:00Z`);
    function getWeekBucket(at) {
      const key = localDateKey(at);
      if (!key) return -1;
      const elapsedDays = Math.floor((todayMillis - Date.parse(`${key}T00:00:00Z`)) / 86400000);
      if (elapsedDays < 0 || elapsedDays >= 56) return -1;
      return 7 - Math.floor(elapsedDays / 7);
    }
    for (const row of scopedPractice) {
      const index = getWeekBucket(row.attempted_at);
      if (index < 0) continue;
      performanceTrend[index].practiceTotal += 1;
      if (yes(row.is_correct)) performanceTrend[index].practiceCorrect += 1;
    }
    for (const session of finalExams) {
      const index = getWeekBucket(session.submitted_at || session.ended_at || session.started_at);
      if (index < 0) continue;
      performanceTrend[index].examTotal += Number(session.question_count || 0);
      performanceTrend[index].examCorrect += Number(session.correct_count || 0);
    }

    return { scopedPractice, scopedSessions, finalExams, practiceCorrect, examCorrect, examTotal,
      problemQuestions, uniqueQuestions: new Set(scopedPractice.map(a => String(a.question_id))).size,
      firstTotal, firstCorrect, repeatedTotal, repeatedCorrect,
      initialErrorsRepeated, recoveredOnLast,
      chapters: sortRows([...chapters.values()]), topics: sortRows([...topics.values()]), perStudent,
      timeline, trend, performanceTrend,
      unknownPractice: scopedPractice.filter(a => !questionMap.has(String(a.question_id))).length,
      unknownExam: examQuestionRows.filter(row => finalExamIds.has(String(row.session_id)) && !questionMap.has(String(row.question_id))).length
    };
  }, [students, questions, attempts, examSessions, examQuestionRows, visibleStudentIds, todayISO, period]);

  const filteredStudents = students.filter(s => nameOf(s).toLocaleLowerCase("fa").includes(studentSearch.trim().toLocaleLowerCase("fa")));
  const activeStudents = students.filter(s => accessStatus(s, todayISO).style === "active").length;
  const selectableTitle = selectedStudent ? `پرونده تحلیلی: ${nameOf(selectedStudent)}` : "نمای کلی کلاس";
  const maxTrend = Math.max(1, ...analytics.trend.map(t => t.practice + t.exam));
  const categorizedTopics = analytics.topics.map(t => ({ ...t, status: learningStatus(t) }));
  const strengths = categorizedTopics.filter(t => t.status.key === "strong")
    .sort((a, b) => (b.firstTotal ? b.firstCorrect / b.firstTotal : b.examCorrect / (b.examTotal || 1)) -
      (a.firstTotal ? a.firstCorrect / a.firstTotal : a.examCorrect / (a.examTotal || 1))).slice(0, 5);
  const needsAttention = categorizedTopics.filter(t => ["weak", "improve"].includes(t.status.key))
    .sort((a, b) => (a.status.key === b.status.key ?
      (a.firstCorrect / (a.firstTotal || 1)) - (b.firstCorrect / (b.firstTotal || 1)) :
      a.status.key === "weak" ? -1 : 1)).slice(0, 6);
  const selectedProblemQuestions = openedDetail ? analytics.problemQuestions.filter(q => q[activeView] === openedDetail) : [];
  const periodLabel = PERIOD_LABELS[period] || "کل دوره";

  function exportCurrentReport() {
    const rows = [
      ["پرسمان زیست - گزارش آموزشی", selectableTitle],
      ["تاریخ تهیه", readableDate(new Date())],
      ["بازه گزارش", periodLabel],
      ["تعداد سؤال متفاوت تمرین", analytics.uniqueQuestions],
      ["تعداد پاسخ تمرین", analytics.scopedPractice.length],
      ["پاسخ صحیح تمرین", analytics.practiceCorrect],
      ["تعداد اولین پاسخ به هر سؤال", analytics.firstTotal],
      ["پاسخ صحیح در اولین مواجهه", analytics.firstCorrect],
      ["درصد صحت اولین پاسخ", percent(analytics.firstCorrect, analytics.firstTotal)],
      ["تعداد پاسخ‌های تکراری", analytics.repeatedTotal],
      ["پاسخ صحیح تکراری", analytics.repeatedCorrect],
      ["درصد صحت پاسخ‌های تکراری", percent(analytics.repeatedCorrect, analytics.repeatedTotal)],
      ["سؤال‌های ابتدا غلط که دوباره پاسخ داده شده‌اند", analytics.initialErrorsRepeated],
      ["سؤال‌های ابتدا غلط که در آخرین تکرار درست شده‌اند", analytics.recoveredOnLast],
      ["توجه", "تکرار یعنی پاسخ دوم و بعدی دانش‌آموز به یک سؤال؛ لزوماً دور مرور نیست."],
      ["تعداد آزمون‌های نهایی", analytics.finalExams.length],
      ["سؤالات آزمون", analytics.examTotal],
      ["پاسخ صحیح آزمون", analytics.examCorrect],
      [],
      ["روند ۸ هفته", "درصد تمرین", "تعداد پاسخ تمرین", "درصد آزمون", "تعداد سؤال آزمون"],
      ...analytics.performanceTrend.map(r => [r.label, percent(r.practiceCorrect, r.practiceTotal), r.practiceTotal, percent(r.examCorrect, r.examTotal), r.examTotal]),
      [],
      ["عملکرد فصل", "وضعیت یادگیری", "پاسخ تمرین", "صحیح تمرین", "درصد تمرین", "اولین پاسخ", "صحیح اولیه", "درصد اولیه", "پاسخ تکراری", "صحیح تکراری", "درصد تکرار", "سؤالات آزمون", "صحیح آزمون", "درصد آزمون"],
      ...analytics.chapters.map(r => [r.label, learningStatus(r).label, r.practiceTotal, r.practiceCorrect, percent(r.practiceCorrect, r.practiceTotal), r.firstTotal, r.firstCorrect, percent(r.firstCorrect, r.firstTotal), r.repeatedTotal, r.repeatedCorrect, percent(r.repeatedCorrect, r.repeatedTotal), r.examTotal, r.examCorrect, percent(r.examCorrect, r.examTotal)]),
      [],
      ["عملکرد مبحث", "وضعیت یادگیری", "پاسخ تمرین", "صحیح تمرین", "درصد تمرین", "اولین پاسخ", "صحیح اولیه", "درصد اولیه", "پاسخ تکراری", "صحیح تکراری", "درصد تکرار", "سؤالات آزمون", "صحیح آزمون", "درصد آزمون"],
      ...analytics.topics.map(r => [r.label, learningStatus(r).label, r.practiceTotal, r.practiceCorrect, percent(r.practiceCorrect, r.practiceTotal), r.firstTotal, r.firstCorrect, percent(r.firstCorrect, r.firstTotal), r.repeatedTotal, r.repeatedCorrect, percent(r.repeatedCorrect, r.repeatedTotal), r.examTotal, r.examCorrect, percent(r.examCorrect, r.examTotal)]),
      [],
      ["سؤالات دارای خطا", "مبحث", "خطای اولیه", "خطای تکراری", "خطای آزمون", "بی‌پاسخ آزمون", "آخرین تمرین غلط (نفر)"],
      ...analytics.problemQuestions.map(q => [q.code, q.topic, q.firstWrong, q.repeatWrong, q.examWrong, q.examUnanswered, q.lastWrong]),
      [],
      ["جلسات آزمون", "دانش‌آموز", "تاریخ", "وضعیت", "تعداد سؤال", "درست", "درصد"],
      ...analytics.scopedSessions.map(s => [s.id, nameOf(students.find(st => String(st.id) === String(s.student_id))),
        readableDate(s.submitted_at || s.ended_at || s.started_at, true),
        s.status === "submitted" ? "نهایی‌شده" : s.status === "cancelled" ? "لغوشده" : "در جریان",
        s.question_count, s.correct_count, s.score_percent]),
      [],
      ["نوع فعالیت", "تاریخ", "نتیجه", "عنوان/موضوع"],
      ...analytics.timeline.map(r => [r.type === "practice" ? "تمرین" : "آزمون", readableDate(r.at, true),
        r.type === "practice" ? (r.correct ? "درست" : "نادرست") : percent(Number(r.correct || 0), Number(r.count || 0)),
        r.type === "practice" ? [r.phase === "first" ? "اولین پاسخ" : "پاسخ تکراری", r.question?.book, r.question?.chapter, r.question?.topic].filter(Boolean).join(" / ") : "آزمون نهایی"])
    ];
    downloadCsv(selectedStudent ? "porseman-student-report.csv" : "porseman-class-report.csv", rows);
  }

  return <section className="analytics-dashboard" aria-label="داشبورد تحلیلی دبیر">
    <div className="analytics-heading">
      <div>
        <span className="analytics-eyebrow">پرسمان زیست / مرکز تحلیل آموزشی</span>
        <h2>داشبورد دبیر و پرونده دانش‌آموزان</h2>
        <p>آمار تمرین و آزمون به‌صورت جداگانه محاسبه می‌شود.</p>
      </div>
      <div className="analytics-toolbar">
        <button type="button" className="analytics-button analytics-button--light" onClick={onRefresh} disabled={refreshing}>{refreshing ? "در حال دریافت..." : "به‌روزرسانی آمار"}</button>
        <button type="button" className="analytics-button" onClick={exportCurrentReport}>خروجی CSV (اکسل)</button>
      </div>
    </div>

    <div className="analytics-body">
      <div className="analytics-period-selector" role="group" aria-label="بازه زمانی تحلیل">
        <strong>بازه گزارش:</strong>
        {PERIOD_OPTIONS.map(([key, label]) => <button key={key} type="button"
          className={`analytics-period-button${period === key ? " is-active" : ""}`}
          aria-pressed={period === key} onClick={() => setPeriod(key)}>{label}</button>)}
        <small>فیلتر برای تمرین، آزمون، نمودارها، تحلیل‌ها و خروجی CSV اعمال می‌شود.</small>
      </div>
      <div className="analytics-selector">
        <label htmlFor="analytics-student-choice">گزارش مربوط به</label>
        <select id="analytics-student-choice" value={selectedStudentId} onChange={e => onStudentSelect(e.target.value)}>
          <option value="">همه دانش‌آموزان (نمای کلی)</option>
          {[...students].sort((a, b) => nameOf(a).localeCompare(nameOf(b), "fa")).map(s => <option key={s.id} value={String(s.id)}>{nameOf(s)}</option>)}
        </select>
      </div>
      {selectedStudent && <div className="analytics-student-overview">
        <div>
          <strong>{nameOf(selectedStudent)}</strong>
          <span className={`analytics-access analytics-access--${accessStatus(selectedStudent, todayISO).style}`}>{accessStatus(selectedStudent, todayISO).label}</span>
        </div>
        <small>شروع دوره: {selectedStudent.access_start_date ? readableDate(`${selectedStudent.access_start_date}T12:00:00Z`) : "بدون محدودیت"} | پایان دوره: {selectedStudent.access_end_date ? readableDate(`${selectedStudent.access_end_date}T12:00:00Z`) : "بدون محدودیت"}</small>
      </div>}

      <div className="analytics-stats">
        <AnalyticsStat title={selectedStudent ? "وضعیت حساب" : "کل دانش‌آموزان"} value={selectedStudent ? accessStatus(selectedStudent, todayISO).label : number(students.length)} caption={selectedStudent ? "براساس تاریخ و تأیید دبیر" : `${number(activeStudents)} نفر با دسترسی فعال`} kind="students" />
        <AnalyticsStat title="پاسخ‌های تمرینی" value={number(analytics.scopedPractice.length)} caption={`${number(analytics.practiceCorrect)} پاسخ درست؛ ${number(analytics.uniqueQuestions)} سؤال متفاوت`} kind="practice" />
        <AnalyticsStat title="درصد صحت تمرین" value={percent(analytics.practiceCorrect, analytics.scopedPractice.length)} caption="شامل پاسخ‌های مرور مجدد" kind="practice" />
        <AnalyticsStat title="آزمون‌های نهایی" value={number(analytics.finalExams.length)} caption={`${number(analytics.examTotal)} سؤال آزمونی`} kind="exam" />
        <AnalyticsStat title="درصد صحت آزمون" value={percent(analytics.examCorrect, analytics.examTotal)} caption="از مجموع همه سؤالات آزمون‌های نهایی" kind="exam" />
      </div>

      <div className="analytics-chart-card">
        <div className="analytics-section-title">
          <h3>پاسخ اولیه در مقایسه با پاسخ‌های تکراری</h3>
          <span>مبنای محاسبه: هر دانش‌آموز و هر کد سؤال</span>
        </div>
        <div className="analytics-stats">
          <AnalyticsStat title="اولین پاسخ ثبت‌شده" value={percent(analytics.firstCorrect, analytics.firstTotal)} caption={`${number(analytics.firstCorrect)} پاسخ درست از ${number(analytics.firstTotal)} سؤال`} kind="practice" />
          <AnalyticsStat title="پاسخ‌های تکراری" value={percent(analytics.repeatedCorrect, analytics.repeatedTotal)} caption={`${number(analytics.repeatedCorrect)} پاسخ درست از ${number(analytics.repeatedTotal)} پاسخ بعدی`} kind="practice" />
          <AnalyticsStat title="اصلاح اشتباه اولیه" value={`${number(analytics.recoveredOnLast)} از ${number(analytics.initialErrorsRepeated)}`} caption="سؤال‌هایی که ابتدا غلط بوده‌اند و آخرین پاسخ به آن‌ها درست شده" kind="students" />
        </div>
        <p className="analytics-muted">«اولین پاسخ» اولین رکورد ثبت‌شده برای هر دانش‌آموز و سؤال است؛ «تکراری» تمام پاسخ‌های بعدی همان دانش‌آموز به همان سؤال است. چون نوع فعالیت در سوابق قبلی ذخیره نشده، پاسخ تکراری لزوماً از بخش «مرور اشتباهات» نیست.</p>
      </div>

      <div className="analytics-chart-card">
        <div className="analytics-section-title"><h3>روند فعالیت در ۱۴ روز اخیر</h3><span> <i className="analytics-dot analytics-dot--practice" /> پاسخ تمرین <i className="analytics-dot analytics-dot--exam" /> آزمون نهایی</span></div>
        <div className="analytics-bars" role="img" aria-label="نمودار تعداد پاسخ تمرین و آزمون نهایی در چهارده روز اخیر">
          {analytics.trend.map(t => <div className="analytics-bar-item" key={t.key} title={`${t.label} | تمرین: ${number(t.practice)} پاسخ | آزمون: ${number(t.exam)} جلسه`}>
            <div className="analytics-bar-columns">
              <div className="analytics-bar analytics-bar--practice" style={{ height: `${Math.max(t.practice ? 3 : 0, t.practice / maxTrend * 100)}%` }} />
              <div className="analytics-bar analytics-bar--exam" style={{ height: `${Math.max(t.exam ? 3 : 0, t.exam / maxTrend * 100)}%` }} />
            </div>
            <small>{new Intl.DateTimeFormat("fa-IR-u-ca-persian", { timeZone: "UTC", day: "numeric" }).format(new Date(`${t.key}T12:00:00Z`))}</small>
          </div>)}
        </div>
        <div className="analytics-chart-caption">برای مشاهده آمار هر روز، نشانگر را روی ستون قرار دهید. تعداد آزمون‌ها بر اساس جلسات نهایی‌شده است.</div>
      </div>

      <div className="analytics-chart-card">
        <div className="analytics-section-title"><h3>روند درصد پاسخ صحیح در ۸ هفته اخیر</h3><span>سبز: تمرین | آبی: آزمون</span></div>
        <div className="analytics-perf-chart" role="img" aria-label="نمودار درصد پاسخ صحیح تمرین و آزمون در هشت هفته اخیر">
          {analytics.performanceTrend.map(t => <div className="analytics-perf-week" key={t.label}
            title={`${t.label} | تمرین: ${percent(t.practiceCorrect, t.practiceTotal)} (${number(t.practiceTotal)} پاسخ) | آزمون: ${percent(t.examCorrect, t.examTotal)} (${number(t.examTotal)} سؤال)`}>
            <div className="analytics-perf-columns">
              <div className="analytics-perf-rail"><div className="analytics-perf-bar analytics-perf-bar--practice" style={{ height: `${t.practiceTotal ? t.practiceCorrect / t.practiceTotal * 100 : 0}%` }} /></div>
              <div className="analytics-perf-rail"><div className="analytics-perf-bar analytics-perf-bar--exam" style={{ height: `${t.examTotal ? t.examCorrect / t.examTotal * 100 : 0}%` }} /></div>
            </div>
            <small>{t.label}</small>
          </div>)}
        </div>
        <div className="analytics-chart-caption">از قدیمی‌ترین هفته در سمت راست تا هفته جاری در سمت چپ؛ ستون خالی به معنی نبود داده یا صفر درصد پاسخ صحیح است.</div>
      </div>

      {!selectedStudent && <div className="analytics-student-list">
        <div className="analytics-section-title"><h3>انتخاب پرونده دانش‌آموز</h3><span>برای مشاهده تحلیل اختصاصی، روی «مشاهده پرونده» کلیک کنید.</span></div>
        <label htmlFor="analytics-student-search">جست‌وجوی نام دانش‌آموز</label>
        <input id="analytics-student-search" value={studentSearch} onChange={e => setStudentSearch(e.target.value)} placeholder="نام دانش‌آموز را بنویسید" />
        <div className="analytics-scroll-table"><table className="analytics-table">
          <thead><tr><th>دانش‌آموز</th><th>وضعیت</th><th>تمرین</th><th>درصد تمرین</th><th>اولین پاسخ</th><th>پاسخ‌های تکراری</th><th>آزمون</th><th>درصد آزمون</th><th>پرونده</th></tr></thead>
          <tbody>{filteredStudents.map(s => {
            const stat = analytics.perStudent.get(String(s.id));
            const status = accessStatus(s, todayISO);
            return <tr key={s.id}>
              <td><strong>{nameOf(s)}</strong></td>
              <td><span className={`analytics-access analytics-access--${status.style}`}>{status.label}</span></td>
              <td>{number(stat?.practice)}</td><td>{percent(stat?.correct || 0, stat?.practice || 0)}</td>
              <td>{percent(stat?.firstCorrect || 0, stat?.firstTotal || 0)}</td>
              <td>{percent(stat?.repeatedCorrect || 0, stat?.repeatedTotal || 0)}</td>
              <td>{number(stat?.exams)}</td><td>{percent(stat?.examCorrect || 0, stat?.examTotal || 0)}</td>
              <td><button type="button" className="analytics-mini-button" onClick={() => onStudentSelect(String(s.id))}>مشاهده پرونده</button></td>
            </tr>;
          })}</tbody>
        </table></div>
        {filteredStudents.length === 0 && <p className="analytics-muted">دانش‌آموزی با این نام پیدا نشد.</p>}
      </div>}

      {selectedStudent && <div className="analytics-back-row"><button type="button" className="analytics-mini-button" onClick={() => onStudentSelect("")}>بازگشت به نمای کل کلاس</button></div>}

      <div className="analytics-analysis">
        <div className="analytics-section-title"><h3>{selectedStudent ? "تحلیل اختصاصی عملکرد" : "تحلیل آموزشی کلاس"}</h3><span>تمرین و آزمون جدا نمایش داده می‌شوند.</span></div>
        <div className="analytics-tabbar" role="group" aria-label="نوع دسته‌بندی تحلیل">
          <button type="button" aria-pressed={activeView === "chapter"} className={activeView === "chapter" ? "is-active" : ""} onClick={() => setActiveView("chapter")}>به تفکیک فصل</button>
          <button type="button" aria-pressed={activeView === "topic"} className={activeView === "topic" ? "is-active" : ""} onClick={() => setActiveView("topic")}>به تفکیک گفتار و مبحث</button>
        </div>
        {activeView === "chapter" ? <TopicTable rows={analytics.chapters} title="عملکرد فصل‌به‌فصل" level="کتاب / فصل"
          onDetail={setOpenedDetail} />
          : <TopicTable rows={analytics.topics} title="عملکرد گفتار و مبحث" level="کتاب / فصل / گفتار / عنوان"
            onDetail={setOpenedDetail} />}
        {openedDetail && <div className="analytics-question-detail" role="region" aria-label="سؤال‌های دارای خطا">
          <div className="analytics-detail-heading"><h4>سؤال‌های دارای خطا: {openedDetail}</h4>
            <button type="button" className="analytics-mini-button" onClick={() => setOpenedDetail(null)}>بستن جزئیات</button></div>
          {selectedProblemQuestions.length ? <div className="analytics-scroll-table"><table className="analytics-table">
            <thead><tr><th>کد سؤال</th><th>خطای پاسخ اول</th><th>خطای تکرار</th><th>خطای آزمون</th><th>بی‌پاسخ آزمون</th><th>آخرین تمرین نادرست</th></tr></thead>
            <tbody>{selectedProblemQuestions.map(q => <tr key={q.id}>
              <td title={q.statement}>{q.code}</td><td>{number(q.firstWrong)}</td>
              <td>{number(q.repeatWrong)}</td><td>{number(q.examWrong)}</td>
              <td>{number(q.examUnanswered)}</td><td>{number(q.lastWrong)} نفر</td>
            </tr>)}</tbody>
          </table></div> : <p className="analytics-muted">برای این بخش خطایی در بازه انتخاب‌شده ثبت نشده است.</p>}
          <p className="analytics-muted">خطاهای آزمونی از سؤال‌های جلسات نهایی‌شده محاسبه می‌شوند؛ ستون «آخرین تمرین نادرست» مربوط به آخرین تمرین هر دانش‌آموز در بازه است.</p>
        </div>}
        <div className="analytics-learning-overview">
          <div className="analytics-learning-panel">
            <h4>نقاط قوت شناسایی‌شده</h4>
            {strengths.length ? strengths.map(t => <div className="analytics-learning-row" key={t.label}>
              <LearningBadge status={t.status}/><span>{t.label}</span><strong>{percent(t.firstCorrect, t.firstTotal)} اولیه</strong>
            </div>) : <p className="analytics-muted">هنوز مبحثی با شواهد کافی برای تشخیص نقطه قوت وجود ندارد.</p>}
          </div>
          <div className="analytics-learning-panel">
            <h4>اولویت‌های تمرین و تقویت</h4>
            {needsAttention.length ? needsAttention.map(t => <div className="analytics-learning-row" key={t.label}>
              <LearningBadge status={t.status}/><span>{t.label}</span><strong>{percent(t.firstCorrect, t.firstTotal)} اولیه</strong>
            </div>) : <p className="analytics-muted">در بازه انتخاب‌شده ضعف قابل اتکایی شناسایی نشده است.</p>}
          </div>
        </div>
        <p className="analytics-muted">وضعیت یادگیری یک برآورد آموزشی است، نه تشخیص قطعی. برای قضاوت دست‌کم ۵ پاسخ اولیه یا ۵ سؤال آزمون نیاز است؛ کیفیت پاسخ‌های تکراری نیز در تشخیص پیشرفت لحاظ می‌شود.</p>
        {(analytics.unknownPractice > 0 || analytics.unknownExam > 0) && <p className="analytics-muted">توجه: اطلاعات برخی سؤال‌های حذف‌شده موجود نیست؛ آمار کلی محفوظ مانده اما آن پاسخ‌ها در تحلیل فصل و مبحث دسته‌بندی نشده‌اند.</p>}
        {examDetailLoading && <p className="analytics-muted" role="status">در حال دریافت جزئیات آزمون‌ها برای تحلیل فصل و مبحث...</p>}
        {examDetailError && <p className="analytics-warning" role="alert">{examDetailError}</p>}
      </div>

      <div className="analytics-chart-card">
        <div className="analytics-section-title">
          <h3>تاریخچه جلسات آزمون (شامل لغوشده‌ها)</h3>
          <button type="button" className="analytics-mini-button" onClick={() => setShowExamHistory(v => !v)}
            aria-expanded={showExamHistory}>{showExamHistory ? "بستن جدول" : "نمایش جدول"}</button>
        </div>
        <p className="analytics-muted">{number(analytics.scopedSessions.length)} جلسه در بازه انتخاب‌شده؛ {number(analytics.finalExams.length)} جلسه نهایی‌شده.</p>
        {showExamHistory && (analytics.scopedSessions.length === 0 ? <p className="analytics-muted">هنوز جلسه‌ای وجود ندارد.</p> :
          <div className="analytics-scroll-table"><table className="analytics-table">
            <thead><tr><th>دانش‌آموز</th><th>تاریخ</th><th>محدوده آزمون</th><th>تعداد سؤال</th><th>پاسخ صحیح</th><th>درصد</th><th>وضعیت</th></tr></thead>
            <tbody>{[...analytics.scopedSessions].sort((a, b) => Date.parse(b.started_at || 0) - Date.parse(a.started_at || 0)).slice(0, 200).map(s =>
              <tr key={s.id}><td>{nameOf(students.find(st => String(st.id) === String(s.student_id)))}</td>
                <td>{readableDate(s.started_at, true)}</td>
                <td>{[s.book, s.chapter, s.lesson, s.topic].filter(Boolean).join(" / ") || "همه مباحث"}</td>
                <td>{number(s.question_count)}</td><td>{s.correct_count == null ? "—" : number(s.correct_count)}</td>
                <td>{s.status === "submitted" ? `${PERCENT.format(Number(s.score_percent || 0))}٪` : "—"}</td>
                <td>{s.status === "submitted" ? "نهایی‌شده" : s.status === "cancelled" ? "لغوشده" : "در جریان"}</td>
              </tr>)}</tbody>
          </table>
          {analytics.scopedSessions.length > 200 && <p className="analytics-muted">۲۰۰ جلسه آخر نمایش داده می‌شود؛ خروجی CSV تمام جلسات بارگذاری‌شده را دارد.</p>}
          </div>)}
      </div>
      <div className="analytics-history">
        <div className="analytics-section-title"><h3>آخرین فعالیت‌ها</h3><span>۱۲ مورد اخیر</span></div>
        {!analytics.timeline.length ? <p className="analytics-muted">هنوز فعالیتی ثبت نشده است.</p> : <div className="analytics-history-list">
          {analytics.timeline.slice(0, 12).map((a, i) => <div className="analytics-history-item" key={`${a.type}-${a.at}-${i}`}>
            <span className={`analytics-history-tag analytics-history-tag--${a.type}`}>{a.type === "practice" ? (a.phase === "first" ? "پاسخ اول" : "تکرار") : "آزمون"}</span>
            <span className="analytics-history-text">{a.type === "practice" ? [a.question?.book, a.question?.chapter, a.question?.topic].filter(Boolean).join(" / ") || "سؤال حذف‌شده" : `آزمون نهایی (${number(a.count)} سؤال)`}</span>
            <strong>{a.type === "practice" ? (a.correct ? "درست" : "نادرست") : `${PERCENT.format(Number(a.score ?? 0))}٪`}</strong>
            <time>{readableDate(a.at, true)}</time>
          </div>)}
        </div>}
      </div>
      <p className="analytics-footnote">دقت گزارش: بازه زمانی بر تمام شاخص‌ها و خروجی اعمال می‌شود؛ تشخیص اولین پاسخ با توجه به کل سوابق بارگذاری‌شده انجام می‌شود. درصد کل تمرین شامل همه پاسخ‌های اولیه و تکراری است. تفکیک «پاسخ اول/تکرار» از زمان و ترتیب رکوردها به‌دست می‌آید و جایگزین ثبت صریح «تمرین/مرور» نیست. آزمون فقط جلسات نهایی‌شده را در بر می‌گیرد. گزارش آزمون‌ها براساس حداکثر ۱۰۰۰ جلسه آخر بارگذاری‌شده در پنل است. داده‌های حذف‌شده قابل بازیابی نیستند.</p>
    </div>
  </section>;
}
