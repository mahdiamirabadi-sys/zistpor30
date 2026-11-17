import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";

// کارنامه فقط با تابعِ امن سمت سرور، برای شناسه حساب واردشده دریافت می‌شود.
// این کامپوننت هیچ پاسخ‌نامه، متن سؤال یا داده دانش‌آموز دیگری درخواست نمی‌کند.
const FA_NUMBER = new Intl.NumberFormat("fa-IR");
const FA_PERCENT = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 1 });
const DATE_KEY = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit"
});
const SHOW_DATE = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
  timeZone: "Asia/Tehran", year: "numeric", month: "long", day: "numeric"
});
const SHOW_SHORT_DATE = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
  timeZone: "Asia/Tehran", month: "short", day: "numeric"
});
const PERIODS = [["all", "کل دوره"], ["7", "۷ روز"], ["30", "۳۰ روز"], ["90", "۹۰ روز"]];
const toCount = value => FA_NUMBER.format(Number(value) || 0);
const isCorrect = value => value === true || value === "true" || value === 1;
const toPercent = (correct, count) => count ? `${FA_PERCENT.format(100 * correct / count)}٪` : "—";
const percentValue = (correct, count) => count ? 100 * correct / count : 0;

function dayKey(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = Object.fromEntries(DATE_KEY.formatToParts(date)
    .filter(p => ["year", "month", "day"].includes(p.type))
    .map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function displayDate(value, short = false) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : (short ? SHOW_SHORT_DATE : SHOW_DATE).format(date);
}
function inPeriod(at, period, todayISO) {
  if (period === "all") return true;
  const key = dayKey(at);
  if (!key) return false;
  const delta = Date.parse(`${todayISO}T00:00:00Z`) - Date.parse(`${key}T00:00:00Z`);
  return delta >= 0 && delta < Number(period) * 86400000;
}
function getNames(row) {
  const chapter = `${row.book || "کتاب نامشخص"} / ${row.chapter || "فصل نامشخص"}`;
  const topic = `${chapter} / ${row.lesson || "گفتار نامشخص"} / ${row.topic || "مبحث نامشخص"}`;
  return { chapter, topic };
}
function emptyRow(name) {
  return { name, firstTotal: 0, firstCorrect: 0, repeats: 0, repeatedCorrect: 0,
    practiceTotal: 0, practiceCorrect: 0, examTotal: 0, examCorrect: 0 };
}
function getRow(map, name) {
  if (!map.has(name)) map.set(name, emptyRow(name));
  return map.get(name);
}
// آستانه‌ها آموزشی و پیشنهادی‌اند؛ با کمتر از ۵ مشاهده معتبر برچسب قطعی نمی‌زنیم.
function learningState(row) {
  const enoughFirst = row.firstTotal >= 5;
  const enoughExam = row.examTotal >= 5;
  if (!enoughFirst && !enoughExam) return { code: "limited", text: "داده ناکافی" };
  const first = percentValue(row.firstCorrect, row.firstTotal);
  const exam = percentValue(row.examCorrect, row.examTotal);
  const repeat = percentValue(row.repeatedCorrect, row.repeats);
  if ((enoughFirst && first < 50) || (enoughExam && exam < 50))
    return { code: "weak", text: "نیازمند تقویت" };
  if (enoughFirst && first >= 80 && (!enoughExam || exam >= 70) && (row.repeats < 3 || repeat >= 65))
    return { code: "strong", text: "نقطه قوت" };
  if (!enoughFirst && enoughExam && exam >= 80)
    return { code: "strong", text: "نقطه قوت" };
  return { code: "improve", text: "نیازمند تمرین" };
}
function Meter({ correct, total, blue = false }) {
  return <div className="sr-meter" title={total ? `${toCount(correct)} از ${toCount(total)} پاسخ صحیح` : "بدون داده"}>
    <div className="sr-meter__track" aria-hidden="true"><span className={blue ? "sr-meter__fill sr-meter__fill--blue" : "sr-meter__fill"}
      style={{ width: `${percentValue(correct, total)}%` }} /></div>
    <strong>{toPercent(correct, total)}</strong>
  </div>;
}
function Stat({ label, value, note, variant = "" }) {
  return <div className={`sr-stat ${variant ? `sr-stat--${variant}` : ""}`}>
    <span>{label}</span><strong>{value}</strong><small>{note}</small>
  </div>;
}
function Badge({ status }) {
  return <span className={`sr-badge sr-badge--${status.code}`}>{status.text}</span>;
}

export default function StudentReport({ studentName, studentId, todayISO, onBack }) {
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [period, setPeriod] = useState("all");
  const [detail, setDetail] = useState("chapter");
  const [allExams, setAllExams] = useState(false);

  useEffect(() => {
    if (!studentId) return;
    let cancelled = false;
    setBusy(true);
    setError("");
    (async () => {
      try {
        const { data, error: fetchError } = await supabase.rpc("pz_get_my_learning_report");
        if (fetchError) throw fetchError;
        if (!data || !Array.isArray(data.attempts) || !Array.isArray(data.sessions) || !Array.isArray(data.exam_questions))
          throw new Error("اطلاعات کارنامه کامل دریافت نشد.");
        if (!cancelled) setReport(data);
      } catch (reason) {
        if (!cancelled) { setError(reason?.message || "خطای نامشخص در دریافت کارنامه"); setReport(null); }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, [studentId, reload]);

  const analysis = useMemo(() => {
    if (!report) return null;
    const today = todayISO || dayKey(new Date());
    // تشخیص «اولین تلاش» همیشه بر پایه کل سوابق است، حتی اگر فیلتر ۷ روزه باشد.
    const sorted = [...report.attempts].sort((a, b) => {
      const diff = (Date.parse(a.attempted_at) || 0) - (Date.parse(b.attempted_at) || 0);
      return diff || String(a.id ?? "").localeCompare(String(b.id ?? ""), "en", { numeric: true });
    });
    const seen = new Set();
    const history = new Map();
    const annotated = sorted.map(attempt => {
      const key = String(attempt.question_id);
      const phase = seen.has(key) ? "repeat" : "first";
      seen.add(key);
      const group = history.get(key) || { first: attempt, last: attempt, count: 0 };
      group.count += 1;
      group.last = attempt;
      history.set(key, group);
      return { ...attempt, phase };
    });
    const attempts = annotated.filter(a => inPeriod(a.attempted_at, period, today));
    const sessions = [...report.sessions]
      .filter(s => inPeriod(s.submitted_at || s.ended_at || s.started_at, period, today))
      .sort((a, b) => new Date(b.submitted_at || b.started_at) - new Date(a.submitted_at || a.started_at));
    const sessionIds = new Set(sessions.map(s => String(s.id)));
    const examQuestions = report.exam_questions.filter(r => sessionIds.has(String(r.session_id)));
    const examBySession = new Map();
    for (const row of examQuestions) {
      const id = String(row.session_id);
      if (!examBySession.has(id)) examBySession.set(id, []);
      examBySession.get(id).push(row);
    }
    const chapters = new Map();
    const topics = new Map();
    let correct = 0, firstTotal = 0, firstCorrect = 0, repeatedTotal = 0, repeatedCorrect = 0;
    for (const a of attempts) {
      const right = isCorrect(a.is_correct);
      if (right) correct++;
      if (a.phase === "first") { firstTotal++; if (right) firstCorrect++; }
      else { repeatedTotal++; if (right) repeatedCorrect++; }
      const names = getNames(a);
      for (const [map, name] of [[chapters, names.chapter], [topics, names.topic]]) {
        const r = getRow(map, name);
        r.practiceTotal++;
        if (right) r.practiceCorrect++;
        if (a.phase === "first") { r.firstTotal++; if (right) r.firstCorrect++; }
        else { r.repeats++; if (right) r.repeatedCorrect++; }
      }
    }
    for (const e of examQuestions) {
      const names = getNames(e);
      for (const [map, name] of [[chapters, names.chapter], [topics, names.topic]]) {
        const r = getRow(map, name);
        r.examTotal++;
        if (isCorrect(e.is_correct)) r.examCorrect++;
      }
    }
    const examTotal = sessions.reduce((sum, s) => sum + Number(s.question_count || 0), 0);
    const examCorrect = sessions.reduce((sum, s) => sum + Number(s.correct_count || 0), 0);
    const ranked = [...topics.values()].map(r => ({ ...r, status: learningState(r) }))
      .sort((a, b) => ({ weak: 0, improve: 1, strong: 2, limited: 3 }[a.status.code] -
        { weak: 0, improve: 1, strong: 2, limited: 3 }[b.status.code] ||
        percentValue(a.firstCorrect + a.examCorrect, a.firstTotal + a.examTotal) -
        percentValue(b.firstCorrect + b.examCorrect, b.firstTotal + b.examTotal)));
    const classified = { strong: 0, weak: 0, improve: 0, limited: 0 };
    ranked.forEach(r => { classified[r.status.code]++; });
    const recommendations = ranked.filter(r => ["weak", "improve"].includes(r.status.code)).slice(0, 5);
    const openMistakes = [...history.values()]
      .filter(group => !isCorrect(group.last.is_correct) && inPeriod(group.last.attempted_at, period, today))
      .sort((a, b) => new Date(b.last.attempted_at) - new Date(a.last.attempted_at))
      .slice(0, 8).map(group => group.last);
    const correctedMistakes = [...history.values()]
      .filter(group => !isCorrect(group.first.is_correct) && group.count >= 2 &&
        isCorrect(group.last.is_correct) && inPeriod(group.last.attempted_at, period, today)).length;
    const performance = Array.from({ length: 8 }, (_, i) => ({
      label: `هفته ${FA_NUMBER.format(i + 1)}`,
      practiceTotal: 0, practiceCorrect: 0, examTotal: 0, examCorrect: 0
    }));
    const todayMillis = Date.parse(`${today}T00:00:00Z`);
    function weekIndex(at) {
      const key = dayKey(at);
      const elapsed = key ? Math.floor((todayMillis - Date.parse(`${key}T00:00:00Z`)) / 86400000) : -1;
      return elapsed >= 0 && elapsed < 56 ? 7 - Math.floor(elapsed / 7) : -1;
    }
    for (const a of attempts) {
      const i = weekIndex(a.attempted_at);
      if (i < 0) continue;
      performance[i].practiceTotal++;
      if (isCorrect(a.is_correct)) performance[i].practiceCorrect++;
    }
    for (const s of sessions) {
      const i = weekIndex(s.submitted_at || s.ended_at || s.started_at);
      if (i < 0) continue;
      performance[i].examTotal += Number(s.question_count || 0);
      performance[i].examCorrect += Number(s.correct_count || 0);
    }
    return { attempts, sessions, examQuestions, examBySession, correct, firstTotal, firstCorrect,
      repeatedTotal, repeatedCorrect, examTotal, examCorrect, chapters: [...chapters.values()],
      topics: ranked, classified, recommendations, openMistakes, correctedMistakes, performance };
  }, [report, todayISO, period]);

  return <section className="student-report" aria-label="کارنامه هوشمند من">
    <div className="sr-heading">
      <div><span className="sr-eyebrow">پرسمان زیست / پرونده آموزشی شخصی</span>
        <h2>کارنامه هوشمند من</h2><p>{studentName || "دانش‌آموز"} | گزارش اختصاصی فعالیت‌های شما</p></div>
      <div className="sr-actions student-report-print-hidden">
        <button type="button" className="sr-button sr-button--light" onClick={onBack}>بازگشت به تمرین</button>
        <button type="button" className="sr-button sr-button--light" disabled={busy} onClick={() => setReload(n => n + 1)}>به‌روزرسانی</button>
        <button type="button" className="sr-button" disabled={!analysis || busy} onClick={() => window.print()}>چاپ / ذخیره PDF</button>
      </div>
    </div>
    {busy && <p className="sr-notice" role="status">در حال دریافت و محاسبه کارنامه...</p>}
    {error && <div className="sr-error" role="alert">
      <b>دریافت کارنامه انجام نشد.</b>
      <p>{error}</p>
      {(/pz_get_my_learning_report|function.*does not exist|schema cache|PGRST202/i.test(error)) &&
        <p>ابتدا فایل SQL همراه بسته را یک بار در Supabase اجرا کنید.</p>}
      <button type="button" className="sr-button" onClick={() => setReload(n => n + 1)}>تلاش دوباره</button>
    </div>}
    {analysis && !busy && <div className="sr-content">
      <div className="sr-filters student-report-print-hidden" role="group" aria-label="بازه زمانی کارنامه">
        <strong>بازه گزارش:</strong>
        {PERIODS.map(([value, label]) => <button key={value} type="button"
          className={period === value ? "sr-chip is-active" : "sr-chip"}
          aria-pressed={period === value} onClick={() => setPeriod(value)}>{label}</button>)}
      </div>
      <p className="sr-period-caption">گزارش {PERIODS.find(([value]) => value === period)?.[1]} • تاریخ تهیه: {displayDate(new Date())}</p>
      <div className="sr-stats">
        <Stat label="پاسخ‌های تمرینی" value={toCount(analysis.attempts.length)} note={`${toCount(analysis.correct)} پاسخ صحیح`} />
        <Stat label="درصد صحیح تمرین" value={toPercent(analysis.correct, analysis.attempts.length)} note="شامل تلاش‌های تکراری" />
        <Stat label="اولین پاسخ به سؤال" value={toPercent(analysis.firstCorrect, analysis.firstTotal)} note={`${toCount(analysis.firstTotal)} سؤال متفاوت در بازه`} />
        <Stat label="درصد پاسخ‌های تکراری" value={toPercent(analysis.repeatedCorrect, analysis.repeatedTotal)} note={`${toCount(analysis.repeatedTotal)} پاسخ بعدی`} />
        <Stat label="آزمون‌های نهایی" value={toCount(analysis.sessions.length)} note={`${toCount(analysis.examTotal)} سؤال آزمونی`} variant="exam" />
        <Stat label="درصد صحت آزمون" value={toPercent(analysis.examCorrect, analysis.examTotal)} note="محاسبه‌شده از همه سؤال‌های آزمون" variant="exam" />
      </div>
      <div className="sr-panel">
        <h3>پیشرفت یادگیری من</h3>
        <div className="sr-highlights">
          <div><strong>{toCount(analysis.correctedMistakes)}</strong><span>سؤال ابتدا اشتباه که پاسخ آخر آن اصلاح شده</span></div>
          <div><strong>{toCount(analysis.classified.strong)}</strong><span>مبحث دارای عملکرد خوب</span></div>
          <div><strong>{toCount(analysis.classified.weak + analysis.classified.improve)}</strong><span>مبحث دارای پیشنهاد تمرین</span></div>
        </div>
        <p className="sr-muted">اولین پاسخ بر پایه نخستین تلاش ثبت‌شده برای هر سؤال محاسبه می‌شود؛ پاسخ بعدی لزوماً مربوط به بخش مرور نیست. این آمار برای شناخت روند یادگیری است، نه مقایسه با دیگران.</p>
      </div>
      <div className="sr-panel">
        <div className="sr-panel-heading"><h3>روند درصد پاسخ صحیح در ۸ هفته اخیر</h3>
          <span><i className="sr-legend sr-legend--practice" /> تمرین <i className="sr-legend sr-legend--exam" /> آزمون</span></div>
        <div className="sr-chart" role="img" aria-label="نمودار درصد پاسخ صحیح تمرین و آزمون در هشت هفته اخیر">
          {analysis.performance.map(week => <div className="sr-week" key={week.label}
            title={`${week.label} | تمرین: ${toPercent(week.practiceCorrect, week.practiceTotal)} (${toCount(week.practiceTotal)} پاسخ) | آزمون: ${toPercent(week.examCorrect, week.examTotal)} (${toCount(week.examTotal)} سؤال)`}>
            <div className="sr-week-bars">
              <div className="sr-week-rail"><span className="sr-week-fill sr-week-fill--practice" style={{ height: `${percentValue(week.practiceCorrect, week.practiceTotal)}%` }} /></div>
              <div className="sr-week-rail"><span className="sr-week-fill sr-week-fill--exam" style={{ height: `${percentValue(week.examCorrect, week.examTotal)}%` }} /></div>
            </div><small>{week.label}</small>
          </div>)}
        </div>
        <p className="sr-muted">نمودار از هفته قدیمی‌تر (راست) تا هفته جاری (چپ) است. ستون خالی می‌تواند به معنی نبود فعالیت یا صفر درصد صحیح باشد.</p>
      </div>
      <div className="sr-panel">
        <div className="sr-panel-heading"><h3>نقاط قوت و مباحث نیازمند تمرین</h3><span>به تفکیک فصل، گفتار و مبحث</span></div>
        <div className="sr-topic-summary">
          <span className="sr-badge sr-badge--strong">{toCount(analysis.classified.strong)} نقطه قوت</span>
          <span className="sr-badge sr-badge--improve">{toCount(analysis.classified.improve)} نیازمند تمرین</span>
          <span className="sr-badge sr-badge--weak">{toCount(analysis.classified.weak)} نیازمند تقویت</span>
          <span className="sr-badge sr-badge--limited">{toCount(analysis.classified.limited)} داده ناکافی</span>
        </div>
        {analysis.topics.length === 0 ? <p className="sr-muted">هنوز داده کافی برای تحلیل مباحث وجود ندارد.</p> :
          <div className="sr-topic-list">
            {analysis.topics.filter(t => t.status.code !== "limited").slice(0, 8).map(t =>
              <div key={t.name} className="sr-topic-item"><span>{t.name}</span><Badge status={t.status} /></div>)}
            {analysis.topics.every(t => t.status.code === "limited") && <p className="sr-muted">با پاسخ دادن به سؤال‌های بیشتر، تحلیل دقیق‌تر خواهد شد.</p>}
          </div>}
      </div>
      <div className="sr-panel">
        <div className="sr-panel-heading"><h3>عملکرد من در فصل‌ها و مباحث</h3>
          <div className="sr-view-switch student-report-print-hidden" role="group" aria-label="نوع تفکیک">
            <button type="button" aria-pressed={detail === "chapter"} className={detail === "chapter" ? "is-active" : ""} onClick={() => setDetail("chapter")}>فصل</button>
            <button type="button" aria-pressed={detail === "topic"} className={detail === "topic" ? "is-active" : ""} onClick={() => setDetail("topic")}>گفتار و مبحث</button>
          </div></div>
        <div className="sr-table-scroll"><table className="sr-table">
          <thead><tr><th>{detail === "chapter" ? "کتاب / فصل" : "کتاب / فصل / گفتار / مبحث"}</th>
            <th>اولین تلاش</th><th>تلاش‌های بعدی</th><th>آزمون</th><th>وضعیت</th></tr></thead>
          <tbody>{(detail === "chapter" ? analysis.chapters : analysis.topics).map(row =>
            <tr key={row.name}><td>{row.name}</td>
              <td><Meter correct={row.firstCorrect} total={row.firstTotal} /><small>{toCount(row.firstTotal)} سؤال</small></td>
              <td><Meter correct={row.repeatedCorrect} total={row.repeats} /><small>{toCount(row.repeats)} پاسخ</small></td>
              <td><Meter correct={row.examCorrect} total={row.examTotal} blue /><small>{toCount(row.examTotal)} سؤال</small></td>
              <td><Badge status={learningState(row)} /></td></tr>)}
          </tbody></table></div>
        {(detail === "chapter" ? analysis.chapters : analysis.topics).length === 0 && <p className="sr-muted">فعلاً پاسخی برای این بازه ثبت نشده است.</p>}
      </div>
      <div className="sr-panel">
        <h3>برای تمرین بعدی چه کنم؟</h3>
        {analysis.recommendations.length ? <div className="sr-recommendations">
          {analysis.recommendations.map((t, i) => <div key={t.name}>
            <b>{toCount(i + 1)}. {t.name}</b><Badge status={t.status} />
            <p>تمرین اولیه: {toPercent(t.firstCorrect, t.firstTotal)} از {toCount(t.firstTotal)} سؤال | آزمون: {toPercent(t.examCorrect, t.examTotal)} از {toCount(t.examTotal)} سؤال</p>
          </div>)}
        </div> : <p className="sr-muted">فعلاً مبحثی با داده کافی برای پیشنهاد تمرین بیشتر شناسایی نشده است. تمرین مستمر را ادامه دهید.</p>}
        {analysis.openMistakes.length > 0 && <div className="sr-review-list">
          <h4>سؤال‌هایی که آخرین بار اشتباه پاسخ داده‌ام</h4>
          {analysis.openMistakes.map((a, i) => <p key={`${a.question_id}-${i}`}>
            <b>کد {a.question_code || "نامشخص"}</b> — {getNames(a).topic}
          </p>)}
          <small>این فهرست متن یا پاسخ صحیح سؤال‌ها را نمایش نمی‌دهد.</small>
        </div>}
      </div>
      <div className="sr-panel">
        <div className="sr-panel-heading"><h3>تاریخچه آزمون‌های من</h3><span>{toCount(analysis.sessions.length)} آزمون نهایی</span></div>
        {analysis.sessions.length === 0 ? <p className="sr-muted">در این بازه آزمون نهایی ثبت نشده است.</p> : <div className="sr-exam-list">
          {analysis.sessions.slice(0, allExams ? undefined : 10).map(session => {
            const questions = analysis.examBySession.get(String(session.id)) || [];
            const byChapter = new Map();
            for (const q of questions) {
              const label = getNames(q).chapter;
              const value = byChapter.get(label) || { total: 0, correct: 0 };
              value.total++;
              if (isCorrect(q.is_correct)) value.correct++;
              byChapter.set(label, value);
            }
            return <details key={session.id} className="sr-exam-item">
              <summary><strong>{displayDate(session.submitted_at || session.ended_at || session.started_at)}</strong>
                <span>{toCount(session.correct_count)} درست از {toCount(session.question_count)} سؤال</span>
                <b>{toPercent(Number(session.correct_count || 0), Number(session.question_count || 0))}</b></summary>
              <div className="sr-exam-details">
                <p>بی‌پاسخ: {toCount(session.unanswered_count)} | نادرست یا بی‌پاسخ: {toCount(session.wrong_count)}</p>
                <p>محدوده: {[session.book, session.chapter, session.lesson, session.topic].filter(Boolean).join(" / ") || "همه مباحث"}</p>
                {byChapter.size > 0 && <div className="sr-exam-chapters">
                  {[...byChapter].map(([label, value]) => <div key={label}><span>{label}</span>
                    <Meter correct={value.correct} total={value.total} blue /></div>)}
                </div>}
              </div>
            </details>;
          })}
          {analysis.sessions.length > 10 && <button type="button" className="sr-show-all student-report-print-hidden"
            onClick={() => setAllExams(v => !v)}>{allExams ? "نمایش ۱۰ آزمون اخیر" : `نمایش همه ${toCount(analysis.sessions.length)} آزمون`}</button>}
        </div>}
      </div>
      <p className="sr-footnote">اطلاعات فقط متعلق به حساب شماست. آزمون‌های ناتمام یا لغوشده محاسبه نمی‌شوند. وضعیت مباحث پس از حداقل ۵ پاسخ اولیه یا ۵ سؤال آزمونی پیشنهاد می‌شود و تشخیص قطعی سطح علمی نیست. در پنجره چاپ، گزینه «Save as PDF / ذخیره به‌صورت PDF» را انتخاب کنید.</p>
    </div>}
  </section>;
}
