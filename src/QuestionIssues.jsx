import React, { useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";

const CATEGORIES = [
  ["statement", "متن سؤال"],
  ["answer", "پاسخ صحیح"],
  ["explanation", "توضیح یا اصلاح جمله"],
  ["other", "موارد دیگر"]
];
const CATEGORY_LABELS = Object.fromEntries(CATEGORIES);
const STATUS_LABELS = { new: "جدید", reviewing: "در حال بررسی", resolved: "بررسی و اصلاح شد", dismissed: "اشکالی تأیید نشد" };
const STATUS_OPTIONS = Object.entries(STATUS_LABELS);
const dateFormatter = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
  timeZone: "Asia/Tehran", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
});

export function QuestionIssueButton({ question }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("statement");
  const [description, setDescription] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const textareaRef = useRef(null);
  const questionId = question?.id;

  useEffect(() => {
    if (!open) return;
    textareaRef.current?.focus();
    const onEscape = event => { if (event.key === "Escape" && !sending) setOpen(false); };
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [open, sending]);

  if (questionId === null || questionId === undefined) return null;

  async function submit(event) {
    event.preventDefault();
    if (sending) return;
    const text = description.trim();
    if (text.length < 10 || text.length > 1500) {
      setError("لطفاً اشکال سؤال را در ۱۰ تا ۱۵۰۰ نویسه توضیح دهید.");
      return;
    }
    setSending(true);
    setError("");
    try {
      const { error: saveError } = await supabase.rpc("pz_report_question_issue", {
        p_question_id: String(questionId), p_category: category, p_description: text
      });
      if (saveError) throw saveError;
      setSent(true);
      setOpen(false);
      setDescription("");
    } catch (err) {
      setError("ارسال گزارش انجام نشد: " + (err?.message || "خطای ارتباطی"));
    } finally {
      setSending(false);
    }
  }

  return <div className="question-issue-control">
    {sent ? <span className="question-issue-sent" role="status">✓ گزارش ثبت شد</span> :
      <button type="button" className="question-issue-trigger" onClick={() => { setError(""); setOpen(true); }}>
        گزارش اشتباه
      </button>}
    {open && <div className="question-issue-overlay" onMouseDown={event => {
      if (event.target === event.currentTarget && !sending) setOpen(false);
    }}>
      <section className="question-issue-dialog" role="dialog" aria-modal="true" aria-label="گزارش اشتباه در سؤال" dir="rtl">
        <h3>گزارش اشتباه در سؤال</h3>
        <p>اگر در متن، پاسخ یا توضیح سؤال اشکالی می‌بینید، آن را برای بررسی دبیر بنویسید. ثبت گزارش، نتیجه تمرین یا آزمون را تغییر نمی‌دهد.</p>
        {question?.question_code && <p className="question-issue-code">کد سؤال: {question.question_code}</p>}
        <form onSubmit={submit}>
          <label htmlFor="issue-category">اشکال مربوط به کدام بخش است؟</label>
          <select id="issue-category" value={category} disabled={sending} onChange={event => setCategory(event.target.value)}>
            {CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <label htmlFor="issue-description">توضیح اشتباه</label>
          <textarea id="issue-description" ref={textareaRef} rows={5} minLength={10} maxLength={1500}
            required disabled={sending} value={description} onChange={event => setDescription(event.target.value)}
            placeholder="مثلاً کدام بخش جمله، پاسخ یا توضیح به نظرتان اشتباه است و چرا؟" />
          <small>{description.trim().length.toLocaleString("fa-IR")} از ۱۵۰۰ نویسه</small>
          {error && <p className="question-issue-error" role="alert">{error}</p>}
          <div className="question-issue-dialog-actions">
            <button type="button" className="question-issue-cancel" disabled={sending} onClick={() => setOpen(false)}>انصراف</button>
            <button type="submit" disabled={sending || description.trim().length < 10}>
              {sending ? "در حال ارسال..." : "ارسال گزارش"}
            </button>
          </div>
        </form>
      </section>
    </div>}
  </div>;
}

function IssueCard({ issue, onSaved }) {
  const [status, setStatus] = useState(issue.status);
  const [note, setNote] = useState(issue.teacher_note || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const changed = status !== issue.status || note.trim() !== (issue.teacher_note || "").trim();

  useEffect(() => {
    setStatus(issue.status);
    setNote(issue.teacher_note || "");
    setError("");
    setSuccess(false);
  }, [issue.status, issue.teacher_note]);

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess(false);
    try {
      const { error: saveError } = await supabase.rpc("pz_teacher_review_question_issue", {
        p_issue_id: issue.id, p_status: status, p_teacher_note: note.trim()
      });
      if (saveError) throw saveError;
      setSuccess(true);
      await onSaved();
    } catch (err) {
      setError("ثبت بررسی انجام نشد: " + (err?.message || "خطای نامشخص"));
    } finally {
      setSaving(false);
    }
  }

  return <article className="teacher-issue-card">
    <div className="teacher-issue-title">
      <div><strong>کد سؤال: {issue.question_code || "نامشخص"}</strong>
        <span className={`teacher-issue-status teacher-issue-status--${issue.status}`}>{STATUS_LABELS[issue.status] || issue.status}</span></div>
      <small>{issue.created_at ? dateFormatter.format(new Date(issue.created_at)) : ""}</small>
    </div>
    <p className="teacher-issue-meta"><b>دانش‌آموز:</b> {issue.student_name || "حساب حذف‌شده"} | <b>نوع اشکال:</b> {CATEGORY_LABELS[issue.category] || "سایر"}</p>
    <p className="teacher-issue-meta"><b>محدوده:</b> {[issue.book, issue.chapter, issue.lesson, issue.topic].filter(Boolean).join(" / ") || "نامشخص"}</p>
    <div className="teacher-issue-statement"><b>متن سؤال هنگام گزارش:</b><p>{issue.question_statement || "در دسترس نیست"}</p></div>
    <div className="teacher-issue-description"><b>توضیح دانش‌آموز:</b><p>{issue.description}</p></div>
    <form onSubmit={save}>
      <label htmlFor={`issue-state-${issue.id}`}>وضعیت بررسی</label>
      <select id={`issue-state-${issue.id}`} value={status} disabled={saving} onChange={event => { setStatus(event.target.value); setSuccess(false); }}>
        {STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      <label htmlFor={`issue-note-${issue.id}`}>یادداشت دبیر (اختیاری؛ فقط در پنل دبیر)</label>
      <textarea id={`issue-note-${issue.id}`} maxLength={1500} rows={2} value={note} disabled={saving}
        placeholder="نتیجه بررسی یا اقدام انجام‌شده" onChange={event => { setNote(event.target.value); setSuccess(false); }} />
      <div className="teacher-issue-actions">
        <button type="submit" disabled={saving || !changed}>{saving ? "در حال ثبت..." : "ذخیره بررسی"}</button>
        {success && <span role="status">تغییرات ثبت شد.</span>}
      </div>
      {error && <p className="question-issue-error" role="alert">{error}</p>}
    </form>
  </article>;
}

export function TeacherQuestionIssues() {
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("pending");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const { data, error: loadError } = await supabase.rpc("pz_teacher_question_issue_reports");
      if (loadError) throw loadError;
      setIssues(Array.isArray(data) ? data : []);
    } catch (err) {
      setError("دریافت گزارش‌ها ناموفق بود: " + (err?.message || "خطای نامشخص"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);
  const pendingCount = issues.filter(item => item.status === "new" || item.status === "reviewing").length;
  const visible = filter === "all" ? issues : filter === "pending"
    ? issues.filter(item => item.status === "new" || item.status === "reviewing")
    : issues.filter(item => item.status === filter);

  return <div className="teacher-issues-page">
    <div className="teacher-issues-topline">
      <div><h3>گزارش‌های اشتباه در سؤال</h3><p>دانش‌آموز می‌تواند برای هر سؤال توضیح بفرستد؛ بررسی و تغییر وضعیت فقط توسط دبیر انجام می‌شود.</p></div>
      <button type="button" onClick={() => void load()} disabled={loading}>{loading ? "در حال دریافت..." : "به‌روزرسانی گزارش‌ها"}</button>
    </div>
    <p className="teacher-issues-count">{issues.length.toLocaleString("fa-IR")} گزارش ثبت‌شده | {pendingCount.toLocaleString("fa-IR")} گزارش نیازمند بررسی</p>
    <div className="teacher-issues-filters" role="group" aria-label="فیلتر وضعیت گزارش‌ها">
      {[["pending", "نیازمند بررسی"], ["all", "همه"], ["resolved", "اصلاح‌شده"], ["dismissed", "اشکال تأییدنشده"]].map(([value, label]) =>
        <button type="button" key={value} className={filter === value ? "is-active" : ""} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>
      )}
    </div>
    {error && <p className="question-issue-error" role="alert">{error}</p>}
    {!loading && !error && visible.length === 0 && <p className="teacher-issues-empty">در این بخش گزارشی ثبت نشده است.</p>}
    {visible.map(issue => <IssueCard key={issue.id} issue={issue} onSaved={load} />)}
    {issues.length >= 1000 && <p className="teacher-issues-empty">فقط ۱۰۰۰ گزارش جدید نمایش داده می‌شود.</p>}
  </div>;
}
