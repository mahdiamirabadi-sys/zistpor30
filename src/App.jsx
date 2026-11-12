
import React, { useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";

const styles = {
  select: {
    width: "100%",
    padding: "12px",
    border: "1px solid #ccc",
    borderRadius: "8px",
    fontSize: "15px",
    background: "white",
    marginTop: "6px"
  },
  action: {
    padding: "12px 20px",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "15px",
    margin: "5px"
  },
  question: {
    background: "#f3f7f4",
    padding: "20px",
    borderRadius: "10px",
    lineHeight: "2.2",
    fontSize: "18px",
    margin: "20px 0"
  },
  label: {
    display: "block",
    marginTop: "16px",
    fontWeight: "bold"
  },
  numberInput: {
    width: "100%",
    padding: "12px",
    border: "1px solid #ccc",
    borderRadius: "8px",
    fontSize: "16px",
    marginTop: "6px",
    boxSizing: "border-box"
  },
  textInput: {
    width: "100%",
    padding: "12px",
    border: "1px solid #ccc",
    borderRadius: "8px",
    fontSize: "15px",
    marginTop: "6px",
    boxSizing: "border-box"
  }
};

function uniqueValues(rows, column) {
  return [...new Set(
    rows
      .map(row => row[column])
      .filter(value => value !== null && value !== undefined && value !== "")
      .map(String)
  )].sort((a, b) =>
    a.localeCompare(b, "fa", { numeric: true })
  );
}

function isTrue(value) {
  return value === true || value === "true" || value === 1;
}

const EMPTY_QUESTION = {
  question_code: "",
  book: "",
  chapter: "",
  lesson: "",
  topic: "",
  statement: "",
  is_true: "true",
  correction: ""
};

const QUESTION_PAGE_SIZE = 20;


// ورود گروهی Excel؛ تنها دبیر به این کامپوننت دسترسی دارد.
// فایل پیش از هر درج اعتبارسنجی می‌شود و شناسه سؤال‌ها توسط دیتابیس تولید می‌شوند.
const IMPORT_COLUMNS = [
  ["question_code", "کد سوال", "کد سؤال", "question_code"],
  ["book", "کتاب زیست", "کتاب", "book"],
  ["chapter", "فصل", "chapter"],
  ["lesson", "گفتار", "lesson"],
  ["topic", "عنوان", "topic"],
  ["statement", "سوال", "سؤال", "متن جمله", "statement"],
  ["is_true", "پاسخ", "درست یا غلط", "is_true"],
  ["correction", "دلیل غلط بودن", "شکل صحیح جمله", "correction"]
];

function normalizeExcelText(value) {
  return String(value ?? "")
    .replace(/[۰-۹]/g, digit => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[\u200c\u200f\u200e_\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeExcelHeader(value) {
  return normalizeExcelText(value).toLowerCase();
}

function readBooleanCell(value) {
  if (value === true || value === false) return value;
  if (value === 1 || value === 0) return value === 1;
  const text = normalizeExcelText(value).toLowerCase();
  if (["true", "درست", "صحیح", "1"].includes(text)) return true;
  if (["false", "غلط", "نادرست", "0"].includes(text)) return false;
  return null;
}

function BulkExcelImport({ questions, onImported, disabled }) {
  const [fileName, setFileName] = useState("");
  const [parsedRows, setParsedRows] = useState([]);
  const [fileError, setFileError] = useState("");
  const [reading, setReading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const [notice, setNotice] = useState("");
  const uploadLock = useRef(false);

  // هنگام ویرایش بانک سؤال، تشخیص تکراری‌ها دوباره محاسبه می‌شود.
  const existingCodes = new Set(questions.map(q => normalizeExcelText(q.question_code)));
  const seenCodes = new Set();
  const validRows = [];
  const invalidRows = [];
  const duplicateRows = [];
  for (const row of parsedRows) {
    const code = normalizeExcelText(row.question_code);
    const required = ["question_code", "book", "chapter", "lesson", "topic", "statement"];
    if (required.some(field => !String(row[field] ?? "").trim())) {
      invalidRows.push(`ردیف ${row.excelRow}: یکی از فیلدهای ضروری خالی است.`);
    } else if (row.is_true === null) {
      invalidRows.push(`ردیف ${row.excelRow}: پاسخ باید «درست» یا «غلط» باشد.`);
    } else if (row.is_true === false && !String(row.correction ?? "").trim()) {
      invalidRows.push(`ردیف ${row.excelRow}: شکل صحیح جمله غلط وارد نشده است.`);
    } else if (row.is_true === true && String(row.correction ?? "").trim()) {
      invalidRows.push(`ردیف ${row.excelRow}: برای جمله درست، ستون دلیل غلط بودن باید خالی باشد.`);
    } else if (existingCodes.has(code) || seenCodes.has(code)) {
      duplicateRows.push(`ردیف ${row.excelRow}: کد ${code} قبلاً ثبت شده یا در همین فایل تکرار شده است.`);
    } else {
      seenCodes.add(code);
      validRows.push({
        question_code: code,
        book: String(row.book).trim(),
        chapter: normalizeExcelText(row.chapter),
        lesson: normalizeExcelText(row.lesson),
        topic: String(row.topic).trim(),
        statement: String(row.statement).trim(),
        is_true: row.is_true,
        correction: row.is_true ? null : String(row.correction).trim(),
        is_active: true
      });
    }
  }

  async function chooseFile(event) {
    const file = event.target.files?.[0];
    event.target.value = ""; // انتخاب مجدد همان فایل هم ممکن باشد.
    setParsedRows([]);
    setFileError("");
    setNotice("");
    setSavedCount(0);
    setFileName(file?.name || "");
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setFileError("فقط فایل Excel با پسوند .xlsx پذیرفته می‌شود. فایل .xls را در Excel با فرمت .xlsx ذخیره کنید.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setFileError("حجم فایل بیشتر از ۱۰ مگابایت است. آن را به چند فایل کوچک‌تر تقسیم کنید.");
      return;
    }
    setReading(true);
    try {
      const { readSheet } = await import("read-excel-file/browser");
      const rows = await readSheet(file);
      if (!rows.length) throw new Error("فایل هیچ ردیفی ندارد.");
      const header = rows[0].map(normalizeExcelHeader);
      const indices = {};
      for (const [key, ...aliases] of IMPORT_COLUMNS) {
        const options = aliases.map(normalizeExcelHeader);
        const index = header.findIndex(value => options.includes(value));
        if (index === -1) throw new Error(`ستون «${aliases[0]}» پیدا نشد. از قالب نمونه استفاده کنید.`);
        indices[key] = index;
      }
      const data = rows.slice(1).flatMap((cells, index) => {
        if (!cells.some(cell => cell !== null && String(cell).trim() !== "")) return [];
        const result = { excelRow: index + 2 };
        for (const [key] of IMPORT_COLUMNS) {
          result[key] = cells[indices[key]] ?? "";
        }
        result.is_true = readBooleanCell(result.is_true);
        return [result];
      });
      if (!data.length) throw new Error("بعد از ردیف عنوان، هیچ سؤال قابل خواندنی پیدا نشد.");
      setParsedRows(data);
    } catch (error) {
      setFileError("خواندن فایل ناموفق بود: " + (error?.message || "خطای نامشخص"));
    } finally {
      setReading(false);
    }
  }

  async function uploadQuestions() {
    if (uploadLock.current || disabled || invalidRows.length || !validRows.length) return;
    if (!window.confirm(`آیا ${validRows.length} سؤال جدید به بانک اضافه شوند؟ ${duplicateRows.length} سؤال تکراری ثبت نخواهند شد.`)) return;
    uploadLock.current = true;
    setUploading(true);
    setNotice("");
    setFileError("");
    let inserted = 0;
    try {
      // هر دسته جداگانه ذخیره می‌شود؛ خطاهای شبکه می‌توانند به درج ناقص منجر شوند.
      for (let i = 0; i < validRows.length; i += 100) {
        const batch = validRows.slice(i, i + 100);
        const { error } = await supabase.from("questions").insert(batch);
        if (error) throw error;
        inserted += batch.length;
        setSavedCount(inserted);
      }
      setNotice(`${inserted} سؤال جدید با موفقیت ثبت شد. ${duplicateRows.length} سؤال تکراری رد شد.`);
      setParsedRows([]);
    } catch (error) {
      setFileError(`ثبت در میانه کار متوقف شد. ${inserted} سؤال از ${validRows.length} سؤال جدید ثبت شده است. ${error?.message || "خطای نامشخص"}؛ پس از به‌روزرسانی فهرست، فایل را دوباره انتخاب کنید تا کدهای ثبت‌شده تکرار نشوند.`);
      setParsedRows([]);
    } finally {
      await onImported(); // وضعیت واقعی بانک را حتی پس از شکست جزئی تازه می‌کنیم.
      setUploading(false);
      uploadLock.current = false;
    }
  }

  return (
    <section dir="rtl" style={{ border: "1px solid #d4e5db", borderRadius: "12px", padding: "16px", margin: "18px 0" }}>
      <h3>ورود گروهی سؤال از Excel</h3>
      <p>فایل دارای ۸ ستونِ کد سؤال، کتاب زیست، فصل، گفتار، عنوان، سؤال، پاسخ و دلیل غلط بودن باشد. تنها صفحه اول Excel خوانده می‌شود.</p>
      <p>کد سؤال باید در کل بانک یکتا باشد. سؤال‌های تکراری ثبت نمی‌شوند؛ اطلاعات قبلی حذف یا ویرایش نمی‌شود.</p>
      <label style={styles.label} htmlFor="bulk-question-file">انتخاب فایل Excel (.xlsx)</label>
      <input id="bulk-question-file" type="file" accept=".xlsx" onChange={chooseFile} disabled={reading || uploading || disabled} style={{ margin: "10px 0", maxWidth: "100%" }} />
      {fileName && <p><b>فایل انتخاب‌شده:</b> {fileName}</p>}
      {reading && <p>در حال خواندن و بررسی فایل...</p>}
      {fileError && <p style={{ color: "#a22", whiteSpace: "pre-wrap" }} role="alert">{fileError}</p>}
      {notice && <p style={{ color: "#176b43" }} role="status">{notice}</p>}
      {parsedRows.length > 0 && !reading && (
        <>
          <p><b>کل سطرها:</b> {parsedRows.length} | <b>آماده ثبت:</b> {validRows.length} | <b>تکراری:</b> {duplicateRows.length} | <b>دارای اشکال:</b> {invalidRows.length}</p>
          {invalidRows.length > 0 && (
            <div style={{ background: "#fff3f0", padding: "12px", borderRadius: "8px" }}>
              <p><b>ابتدا خطاهای زیر را در Excel اصلاح کنید؛ تا آن زمان هیچ سؤالی ثبت نمی‌شود.</b></p>
              {invalidRows.slice(0, 12).map((line, i) => <p key={i}>{line}</p>)}
              {invalidRows.length > 12 && <p>و {invalidRows.length - 12} خطای دیگر...</p>}
            </div>
          )}
          {duplicateRows.length > 0 && (
            <div style={{ background: "#f7f6eb", padding: "12px", borderRadius: "8px" }}>
              <p><b>نمونه ردیف‌های تکراری (ثبت نمی‌شوند):</b></p>
              {duplicateRows.slice(0, 6).map((line, i) => <p key={i}>{line}</p>)}
              {duplicateRows.length > 6 && <p>و {duplicateRows.length - 6} ردیف دیگر...</p>}
            </div>
          )}
          {validRows.length > 0 && (
            <div style={{ overflowX: "auto" }}>
              <p><b>پیش‌نمایش حداکثر ۵ سؤال جدید:</b></p>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "right" }}>
                <thead><tr><th>کد</th><th>کتاب</th><th>متن جمله</th><th>پاسخ</th></tr></thead>
                <tbody>{validRows.slice(0, 5).map((q, i) => (
                  <tr key={i}>
                    <td style={{ borderBottom: "1px solid #ddd", padding: "8px" }}>{q.question_code}</td>
                    <td style={{ borderBottom: "1px solid #ddd", padding: "8px" }}>{q.book}</td>
                    <td style={{ borderBottom: "1px solid #ddd", padding: "8px" }}>{q.statement}</td>
                    <td style={{ borderBottom: "1px solid #ddd", padding: "8px" }}>{q.is_true ? "درست" : "غلط"}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
          <button type="button" onClick={uploadQuestions} disabled={disabled || uploading || invalidRows.length > 0 || validRows.length === 0} style={{ ...styles.action, background: "#176b43", color: "white" }}>
            {uploading ? `در حال ثبت... ${savedCount} از ${validRows.length}` : `تأیید و ثبت ${validRows.length} سؤال جدید`}
          </button>
        </>
      )}
    </section>
  );
}

export default function App() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState("login");

  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [students, setStudents] = useState([]);

  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  const [questions, setQuestions] = useState([]);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [attempts, setAttempts] = useState([]);
  const [attemptsLoading, setAttemptsLoading] = useState(false);
  const [examSessions, setExamSessions] = useState([]);
  const [examSessionsLoading, setExamSessionsLoading] = useState(false);
  const [reportStudentId, setReportStudentId] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [questionPage, setQuestionPage] = useState(1);
  const [editingQuestionId, setEditingQuestionId] = useState(null);
  const [updatingQuestionId, setUpdatingQuestionId] = useState(null);
  const [answerSaving, setAnswerSaving] = useState(false);
  const answerLockRef = useRef(false);

  // جست‌وجوی سؤال‌ها در پنل دبیر
  const [questionSearch, setQuestionSearch] = useState("");

  const [book, setBook] = useState("");
  const [chapter, setChapter] = useState("");
  const [lesson, setLesson] = useState("");
  const [topic, setTopic] = useState("");

  const [questionCount, setQuestionCount] = useState("10");
  const [activityMode, setActivityMode] = useState("practice");

  const [examSessionId, setExamSessionId] = useState(null);
  const [examQuestions, setExamQuestions] = useState([]);
  const [examIndex, setExamIndex] = useState(0);
  const [examAnswers, setExamAnswers] = useState({});
  const [examAnswerSaving, setExamAnswerSaving] = useState(false);
  const [examSubmitting, setExamSubmitting] = useState(false);
  const [examResult, setExamResult] = useState(null);

  const [exerciseQuestions, setExerciseQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState([]);
  const [mistakes, setMistakes] = useState([]);
  const [feedback, setFeedback] = useState(null);

  const [screen, setScreen] = useState("setup");

  const [reviewRemaining, setReviewRemaining] = useState([]);
  // صف ثابتِ هر دور مرور؛ حذف پاسخ صحیح، سؤالات بعدی را جابه‌جا نمی‌کند.
  const [reviewQueue, setReviewQueue] = useState([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [reviewFeedback, setReviewFeedback] = useState(null);

  const [newQuestion, setNewQuestion] = useState({ ...EMPTY_QUESTION });

  const [savingQuestion, setSavingQuestion] = useState(false);

  async function loadProfile(userId) {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (error) {
      setMessage("خطا در دریافت اطلاعات حساب: " + error.message);
      setProfile(null);
      return;
    }

    setProfile(data);
  }

  async function loadStudents() {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("role", "student")
      .order("created_at", { ascending: false });

    if (error) {
      setMessage("خطا در دریافت دانش‌آموزان: " + error.message);
      return;
    }

    setStudents(data || []);
  }

  async function loadQuestions(role = profile?.role) {
    setQuestionsLoading(true);
    try {
      const rows = [];
      const batchSize = 1000;
      let from = 0;
      while (true) {
        // دانش‌آموز فقط صورت سؤال و اطلاعات دسته‌بندی را می‌بیند.
        const request = role === "student"
          ? supabase.rpc("get_practice_questions")
          : supabase.from("questions").select("*").order("id", { ascending: true });
        const { data, error } = await request.range(from, from + batchSize - 1);
        if (error) throw error;
        const batch = data || [];
        rows.push(...batch);
        if (batch.length < batchSize) break;
        from += batchSize;
      }
      rows.sort((a, b) =>
        String(a.question_code ?? "").localeCompare(
          String(b.question_code ?? ""), "fa", { numeric: true }
        )
      );
      setQuestions(rows);
    } catch (error) {
      setMessage("خطا در دریافت سؤال‌ها: " + error.message);
      setQuestions([]);
    } finally {
      setQuestionsLoading(false);
    }
  }

  async function loadAttempts() {
    setAttemptsLoading(true);
    const all = [];
    const batchSize = 1000;
    let from = 0;
    try {
      // Supabase به‌صورت پیش‌فرض نتیجه را در هزار ردیف محدود می‌کند.
      while (true) {
        const { data, error } = await supabase
          .from("attempts")
          .select("*")
          .range(from, from + batchSize - 1);

        if (error) throw error;
        const batch = data || [];
        all.push(...batch);
        if (batch.length < batchSize) break;
        from += batchSize;
      }
      setAttempts(all);
    } catch (error) {
      setAttempts([]);
      setMessage("خطا در دریافت گزارش پاسخ‌ها: " + error.message);
    } finally {
      setAttemptsLoading(false);
    }
  }

  async function loadExamSessions() {
    setExamSessionsLoading(true);
    try {
      const { data, error } = await supabase
        .from("exam_sessions")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(1000);

      if (error) throw error;
      setExamSessions(data || []);
    } catch (error) {
      setExamSessions([]);
      setMessage("خطا در دریافت گزارش آزمون‌ها: " + error.message);
    } finally {
      setExamSessionsLoading(false);
    }
  }

  useEffect(() => {
    let mounted = true;

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;

      setUser(session?.user || null);

      if (session?.user) {
        setTimeout(() => {
          if (mounted) loadProfile(session.user.id);
        }, 0);
      } else {
        setProfile(null);
        setStudents([]);
        setQuestions([]);
        setAttempts([]);
        setExamSessions([]);
        setExamSessionId(null);
        setExamQuestions([]);
        setExamAnswers({});
        setExamResult(null);
        setScreen("setup");
      }
    });

    async function initialize() {
      const { data, error } = await supabase.auth.getSession();

      if (!mounted) return;

      if (error) setMessage(error.message);

      if (data.session?.user) {
        setUser(data.session.user);
        await loadProfile(data.session.user.id);
      }

      if (mounted) setChecking(false);
    }

    initialize();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (profile?.role === "teacher") {
      loadStudents();
      loadQuestions("teacher");
      loadAttempts();
      loadExamSessions();
    }

    if (
      profile?.role === "student" &&
      profile?.is_approved === true
    ) {
      loadQuestions("student");
    }
  }, [profile]);

  async function authenticate(e) {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              display_name: email.split("@")[0]
            }
          }
        });

        setMessage(
          error
            ? error.message
            : "ثبت‌نام انجام شد. پس از تأیید ایمیل و دبیر، حساب شما فعال خواهد شد."
        );
      } else {
        const { data, error } =
          await supabase.auth.signInWithPassword({
            email,
            password
          });

        if (error) {
          setMessage(error.message);
        } else {
          setUser(data.user);
          await loadProfile(data.user.id);
          setMessage("ورود موفقیت‌آمیز بود.");
        }
      }
    } catch (error) {
      setMessage(error.message || "خطا در ارتباط با سرور.");
    }

    setLoading(false);
  }

  async function approveStudent(studentId) {
    setLoading(true);
    setMessage("");

    const { error } = await supabase
      .from("profiles")
      .update({ is_approved: true })
      .eq("id", studentId)
      .eq("role", "student");

    if (error) {
      setMessage("خطا در تأیید دانش‌آموز: " + error.message);
    } else {
      setMessage("دانش‌آموز با موفقیت تأیید شد.");
      await loadStudents();
    }

    setLoading(false);
  }

  async function submitNewQuestion(e) {
    e.preventDefault();
    setMessage("");

    const code = newQuestion.question_code.trim();
    const statement = newQuestion.statement.trim();
    const correction = newQuestion.correction.trim();
    const answerIsTrue = newQuestion.is_true === "true";

    if (!code || !statement) {
      setMessage("لطفاً کد سؤال و متن جمله را وارد کنید.");
      return;
    }

    if ([newQuestion.book, newQuestion.chapter, newQuestion.lesson, newQuestion.topic]
      .some(value => !value.trim())) {
      setMessage("لطفاً کتاب، فصل، گفتار و عنوان را کامل کنید.");
      return;
    }

    if (!answerIsTrue && !correction) {
      setMessage("برای جمله غلط، وارد کردن شکل صحیح جمله الزامی است.");
      return;
    }

    const payload = {
      question_code: code,
      book: newQuestion.book.trim(),
      chapter: newQuestion.chapter.trim(),
      lesson: newQuestion.lesson.trim(),
      topic: newQuestion.topic.trim(),
      statement,
      is_true: answerIsTrue,
      correction: answerIsTrue ? null : correction
    };

    setSavingQuestion(true);
    try {
      const request = editingQuestionId !== null
        ? supabase.from("questions").update(payload).eq("id", editingQuestionId)
        : supabase.from("questions").insert(payload);
      const { error } = await request;
      if (error) throw error;

      setMessage(editingQuestionId !== null
        ? "سؤال با موفقیت ویرایش شد."
        : "سؤال با موفقیت در بانک ثبت شد.");
      setNewQuestion({ ...EMPTY_QUESTION });
      setEditingQuestionId(null);
      await loadQuestions("teacher");
    } catch (error) {
      setMessage("خطا در ذخیره سؤال: " + error.message);
    } finally {
      setSavingQuestion(false);
    }
  }

  function editQuestion(question) {
    setEditingQuestionId(question.id);
    setNewQuestion({
      question_code: String(question.question_code ?? ""),
      book: question.book ?? "",
      chapter: question.chapter ?? "",
      lesson: question.lesson ?? "",
      topic: question.topic ?? "",
      statement: question.statement ?? "",
      is_true: isTrue(question.is_true) ? "true" : "false",
      correction: question.correction ?? ""
    });
    setMessage("");
    document.getElementById("question-form")?.scrollIntoView({ behavior: "smooth" });
  }

  function cancelEditing() {
    setEditingQuestionId(null);
    setNewQuestion({ ...EMPTY_QUESTION });
  }

  async function toggleQuestionActive(question) {
    const active = question.is_active !== false;
    if (active && !window.confirm(
      "این سؤال از تمرین‌های جدید حذف و بایگانی می‌شود. پاسخ‌های قبلی دانش‌آموزان حفظ می‌شوند. ادامه می‌دهید؟"
    )) return;

    setUpdatingQuestionId(question.id);
    setMessage("");
    try {
      const { error } = await supabase
        .from("questions")
        .update({ is_active: !active })
        .eq("id", question.id);
      if (error) throw error;
      setMessage(active ? "سؤال بایگانی شد." : "سؤال به بانک فعال بازگشت.");
      if (editingQuestionId === question.id) cancelEditing();
      await loadQuestions("teacher");
    } catch (error) {
      setMessage("خطا در تغییر وضعیت سؤال: " + error.message);
    } finally {
      setUpdatingQuestionId(null);
    }
  }

  async function logout() {
    const { error } = await supabase.auth.signOut();

    if (error) {
      setMessage(error.message);
    } else {
      setUser(null);
      setProfile(null);
      setStudents([]);
      setQuestions([]);
      setAttempts([]);
      setExamSessions([]);
      setExamSessionId(null);
      setExamQuestions([]);
      setExamAnswers({});
      setExamResult(null);
      setScreen("setup");
      setMessage("");
    }
  }

  async function checkAndSaveAnswer(question, selectedAnswer) {
    // پاسخ در سمت سرور اعتبارسنجی و در attempts ذخیره می‌شود.
    const { data, error } = await supabase.rpc("submit_practice_answer", {
      p_question_id: String(question.id),
      p_selected_answer: selectedAnswer
    });
    if (error) throw error;
    if (!data || typeof data.correct !== "boolean") {
      throw new Error("پاسخ معتبر از سرور دریافت نشد.");
    }
    return {
      correct: data.correct,
      correctAnswer: data.correct_answer === true,
      correction: data.correction ?? null
    };
  }

  // فیلتر و صفحه‌بندی مدیریت بانک سؤال
  const teacherFilteredQuestions = questions.filter(q => {
    if (!showArchived && q.is_active === false) return false;
    const search = questionSearch.trim().toLowerCase();
    if (!search) return true;
    return [q.question_code, q.book, q.chapter, q.lesson, q.topic, q.statement]
      .some(value => String(value ?? "").toLowerCase().includes(search));
  });
  const teacherQuestionPages = Math.max(1, Math.ceil(teacherFilteredQuestions.length / QUESTION_PAGE_SIZE));
  const pagedTeacherQuestions = teacherFilteredQuestions.slice(
    (questionPage - 1) * QUESTION_PAGE_SIZE,
    questionPage * QUESTION_PAGE_SIZE
  );

  useEffect(() => {
    setQuestionPage(1);
  }, [questionSearch, showArchived]);

  // گزارش شامل پاسخ‌های اولیه و تمام دورهای مرور است.
  const reportStats = students.map(student => {
    const answers = attempts.filter(a => String(a.student_id) === String(student.id));
    const correct = answers.filter(a => isTrue(a.is_correct)).length;
    return {
      student,
      total: answers.length,
      correct,
      incorrect: answers.length - correct,
      unique: new Set(answers.map(a => String(a.question_id))).size,
      percent: answers.length ? Math.round(100 * correct / answers.length) : 0
    };
  });
  const reportAttempts = reportStudentId
    ? attempts.filter(a => String(a.student_id) === reportStudentId)
    : attempts;
  const reportCorrect = reportAttempts.filter(a => isTrue(a.is_correct)).length;
  const reportByChapter = new Map();
  const questionById = new Map(questions.map(q => [String(q.id), q]));
  reportAttempts.forEach(a => {
    const question = questionById.get(String(a.question_id));
    const key = question ? `${question.book} / ${question.chapter}` : "سؤال حذف‌شده";
    const prev = reportByChapter.get(key) || { name: key, total: 0, correct: 0 };
    prev.total += 1;
    if (isTrue(a.is_correct)) prev.correct += 1;
    reportByChapter.set(key, prev);
  });
  const chapterStats = [...reportByChapter.values()]
    .map(row => ({ ...row, percent: Math.round(100 * row.correct / row.total) }))
    .sort((a, b) => a.percent - b.percent || b.total - a.total);

  const reportExamSessions = examSessions.filter(session =>
    !reportStudentId || String(session.student_id) === reportStudentId
  );
  const completedExamSessions = reportExamSessions.filter(
    session => session.status === "submitted"
  );
  const averageExamPercent = completedExamSessions.length
    ? Math.round(
        completedExamSessions.reduce(
          (sum, session) => sum + Number(session.score_percent || 0), 0
        ) / completedExamSessions.length
      )
    : 0;
  const studentById = new Map(
    students.map(student => [String(student.id), student])
  );

  const chaptersRows = questions.filter(q =>
    !book || String(q.book) === book
  );

  const lessonsRows = chaptersRows.filter(q =>
    !chapter || String(q.chapter) === chapter
  );

  const topicsRows = lessonsRows.filter(q =>
    !lesson || String(q.lesson) === lesson
  );

  const filteredQuestions = topicsRows.filter(q =>
    !topic || String(q.topic) === topic
  );

  const books = uniqueValues(questions, "book");
  const chapters = uniqueValues(chaptersRows, "chapter");
  const lessons = uniqueValues(lessonsRows, "lesson");
  const topics = uniqueValues(topicsRows, "topic");

  useEffect(() => {
    if (
      filteredQuestions.length > 0 &&
      Number(questionCount) > filteredQuestions.length
    ) {
      setQuestionCount(String(filteredQuestions.length));
    }
  }, [filteredQuestions.length]);

  async function startExercise() {
    const count = Number(questionCount);

    if (filteredQuestions.length === 0) {
      setMessage("برای محدوده انتخاب‌شده سؤالی ثبت نشده است.");
      return;
    }

    if (
      !Number.isInteger(count) ||
      count < 1 ||
      count > filteredQuestions.length
    ) {
      setMessage(
        `لطفاً عددی بین ۱ تا ${filteredQuestions.length} وارد کنید.`
      );
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      // اگر از آزمون ناتمام قبلی خارج شده باشد، با شروع تمرین آن جلسه لغو می‌شود.
      const { data, error } = await supabase.rpc("cancel_my_active_exam");
      if (error) throw error;

      const shuffled = [...filteredQuestions];

      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }

      const selectedQuestions = shuffled.slice(0, count);

      setExerciseQuestions(selectedQuestions);
      setCurrentIndex(0);
      setResults([]);
      setMistakes([]);
      setFeedback(null);
      setMessage(data?.cancelled
        ? "آزمون ناتمام قبلی لغو شد؛ تمرین جدید آغاز شد."
        : "");
      setScreen("exercise");
    } catch (error) {
      setMessage("شروع تمرین انجام نشد: " + (error?.message || "خطای نامشخص"));
    } finally {
      setLoading(false);
    }
  }

  async function startExam() {
    const count = Number(questionCount);

    if (filteredQuestions.length === 0) {
      setMessage("برای محدوده انتخاب‌شده سؤالی ثبت نشده است.");
      return;
    }

    if (!Number.isInteger(count) || count < 1 || count > filteredQuestions.length) {
      setMessage(`لطفاً عددی بین ۱ تا ${filteredQuestions.length} وارد کنید.`);
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      // انتخاب تصادفی سؤال‌ها و ساخت جلسه آزمون در سرور انجام می‌شود.
      const { data, error } = await supabase.rpc("start_exam", {
        p_question_count: count,
        p_book: book || null,
        p_chapter: chapter || null,
        p_lesson: lesson || null,
        p_topic: topic || null
      });

      if (error) throw error;
      if (!data?.session_id || !Array.isArray(data.questions) || !data.questions.length) {
        throw new Error("اطلاعات معتبر آزمون از سرور دریافت نشد.");
      }

      setExamSessionId(data.session_id);
      setExamQuestions(data.questions);
      setExamIndex(0);
      setExamAnswers({});
      setExamResult(null);
      setScreen("exam");
    } catch (error) {
      setMessage("شروع آزمون انجام نشد: " + (error?.message || "خطای نامشخص"));
    } finally {
      setLoading(false);
    }
  }

  async function answerExamQuestion(selectedAnswer) {
    const question = examQuestions[examIndex];
    if (!question || !examSessionId || examAnswerSaving) return;

    setExamAnswerSaving(true);
    setMessage("");
    try {
      const { error } = await supabase.rpc("submit_exam_answer", {
        p_session_id: examSessionId,
        p_question_id: String(question.id),
        p_selected_answer: selectedAnswer
      });
      if (error) throw error;

      setExamAnswers(prev => ({
        ...prev,
        [String(question.id)]: selectedAnswer
      }));
      setMessage("پاسخ ثبت شد. نتیجه تا پایان آزمون نمایش داده نمی‌شود.");
    } catch (error) {
      setMessage("ثبت پاسخ آزمون انجام نشد: " + (error?.message || "خطای نامشخص"));
    } finally {
      setExamAnswerSaving(false);
    }
  }

  async function finishExam() {
    if (!examSessionId || examSubmitting) return;
    const unanswered = examQuestions.filter(
      q => !Object.prototype.hasOwnProperty.call(examAnswers, String(q.id))
    ).length;

    const confirmation = unanswered > 0
      ? `${unanswered} سؤال بدون پاسخ مانده است. پاسخ‌های ثبت‌شده نهایی شوند؟ سؤال‌های بی‌پاسخ نمره صحیح نمی‌گیرند.`
      : "آزمون پایان یابد و نتیجه نهایی نمایش داده شود؟";

    if (!window.confirm(confirmation)) return;

    setExamSubmitting(true);
    setMessage("");
    try {
      const { data, error } = await supabase.rpc("finish_exam", {
        p_session_id: examSessionId
      });
      if (error) throw error;
      if (!data || !Array.isArray(data.questions)) {
        throw new Error("کارنامه معتبر از سرور دریافت نشد.");
      }
      setExamResult(data);
      setScreen("exam-summary");
    } catch (error) {
      setMessage("ثبت نهایی آزمون انجام نشد: " + (error?.message || "خطای نامشخص"));
    } finally {
      setExamSubmitting(false);
    }
  }

  async function cancelExam() {
    if (!examSessionId) {
      setScreen("setup");
      return;
    }
    if (!window.confirm("آزمون فعلی لغو شود؟ پاسخ‌های این آزمون در کارنامه نهایی محاسبه نمی‌شوند.")) return;

    setExamSubmitting(true);
    setMessage("");
    try {
      const { error } = await supabase.rpc("cancel_exam", {
        p_session_id: examSessionId
      });
      if (error) throw error;
      setExamSessionId(null);
      setExamQuestions([]);
      setExamAnswers({});
      setExamResult(null);
      setScreen("setup");
      setMessage("آزمون لغو شد.");
    } catch (error) {
      setMessage("لغو آزمون انجام نشد: " + (error?.message || "خطای نامشخص"));
    } finally {
      setExamSubmitting(false);
    }
  }


  async function answerQuestion(selectedAnswer) {
    if (feedback || answerLockRef.current) return;
    const question = exerciseQuestions[currentIndex];
    if (!question) return;
    answerLockRef.current = true;
    setAnswerSaving(true);
    setMessage("");
    try {
      const verdict = await checkAndSaveAnswer(question, selectedAnswer);
      setResults(prev => [...prev, { question, selectedAnswer, correct: verdict.correct }]);
      if (!verdict.correct) setMistakes(prev => [...prev, question]);
      setFeedback({ ...verdict, question });
    } catch (error) {
      setMessage("ذخیره یا بررسی پاسخ انجام نشد؛ دوباره تلاش کنید: " + error.message);
    } finally {
      answerLockRef.current = false;
      setAnswerSaving(false);
    }
  }

  function nextQuestion() {
    setFeedback(null);
    if (currentIndex + 1 >= exerciseQuestions.length) {
      setScreen("summary");
    } else {
      setCurrentIndex(prev => prev + 1);
    }
  }

  function startReview() {
    setReviewRemaining([...mistakes]);
    setReviewQueue([...mistakes]);
    setReviewIndex(0);
    setReviewFeedback(null);
    setScreen("review");
  }

  async function answerReview(selectedAnswer) {
    if (reviewFeedback || answerLockRef.current) return;
    const question = reviewQueue[reviewIndex];
    if (!question) return;
    answerLockRef.current = true;
    setAnswerSaving(true);
    setMessage("");
    try {
      const verdict = await checkAndSaveAnswer(question, selectedAnswer);
      if (verdict.correct) {
        setReviewRemaining(prev => prev.filter(item => String(item.id) !== String(question.id)));
      }
      setReviewFeedback({ ...verdict, question });
    } catch (error) {
      setMessage("ذخیره یا بررسی پاسخ انجام نشد؛ دوباره تلاش کنید: " + error.message);
    } finally {
      answerLockRef.current = false;
      setAnswerSaving(false);
    }
  }

  function nextReviewQuestion() {
    if (!reviewFeedback) return;
    setReviewFeedback(null);
    if (reviewIndex + 1 < reviewQueue.length) {
      setReviewIndex(prev => prev + 1);
    } else {
      // دور بعدی فقط شامل سؤال‌هایی است که هنوز اشتباه پاسخ داده می‌شوند.
      setReviewQueue([...reviewRemaining]);
      setReviewIndex(0);
    }
  }

  if (checking) {
    return (
      <main className="page" dir="rtl">
        <section className="panel">
          در حال بررسی حساب کاربری...
        </section>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="page" dir="rtl">
        <header>
          <div className="mark">ز</div>
          <div>
            <h1>پرسمان زیست</h1>
            <p>سامانه تمرین جمله‌های درست و نادرست زیست‌شناسی</p>
          </div>
        </header>

        <section className="panel">
          <h2>
            {mode === "login" ? "ورود به سامانه" : "ثبت‌نام دانش‌آموز"}
          </h2>

          <form onSubmit={authenticate}>
            <label>
              ایمیل
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </label>

            <label>
              گذرواژه
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                minLength={6}
                required
              />
            </label>

            <button disabled={loading}>
              {loading
                ? "لطفاً صبر کنید..."
                : mode === "login" ? "ورود" : "ساخت حساب"}
            </button>
          </form>

          <button
            className="link"
            onClick={() => {
              setMode(mode === "login" ? "signup" : "login");
              setMessage("");
            }}
          >
            {mode === "login"
              ? "حساب ندارید؟ ثبت‌نام کنید"
              : "بازگشت به ورود"}
          </button>

          {message && <p className="message">{message}</p>}

          {mode === "login" && (
            <div className="login-contact" aria-label="اطلاعات طراح و پشتیبان سامانه">
              <p className="login-contact__title">طراح و پشتیبان سامانه پرسمان زیست</p>
              <p className="login-contact__name">مهدی امیرآبادی</p>
              <a className="login-contact__phone" href="tel:09304917587" dir="ltr">
                <span aria-hidden="true">☎</span>
                09304917587
              </a>
            </div>
          )}
        </section>

        <footer>پروژه zistpor30 | پرسمان زیست</footer>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="page" dir="rtl">
        <section className="panel">
          <h2>اطلاعات حساب</h2>
          <p>{message || "در حال دریافت اطلاعات پروفایل..."}</p>
          <button onClick={logout}>خروج</button>
        </section>
      </main>
    );
  }

  if (profile.role === "teacher") {
    return (
      <main className="page" dir="rtl">
        <header>
          <div className="mark">ز</div>
          <div>
            <h1>پنل دبیر</h1>
            <p>پرسمان زیست | مدیریت سامانه</p>
          </div>
        </header>

        <section className="panel">
          <h2>خوش آمدید، {profile.display_name}</h2>

          <h3>{editingQuestionId !== null ? "ویرایش سؤال" : "ثبت سؤال جدید"}</h3>
          <form id="question-form" onSubmit={submitNewQuestion}>
            <label style={styles.label}>کد سؤال</label>
            <input
              style={styles.textInput}
              type="text"
              value={newQuestion.question_code}
              onChange={e =>
                setNewQuestion({
                  ...newQuestion,
                  question_code: e.target.value
                })
              }
              placeholder="مثلاً ۱۰۰۱"
              required
            />

            <label style={styles.label}>کتاب زیست</label>
            <input
              style={styles.textInput}
              type="text"
              value={newQuestion.book}
              onChange={e =>
                setNewQuestion({
                  ...newQuestion,
                  book: e.target.value
                })
              }
              placeholder="مثلاً زیست دهم"
              required
            />

            <label style={styles.label}>فصل</label>
            <input
              style={styles.textInput}
              type="text"
              value={newQuestion.chapter}
              onChange={e =>
                setNewQuestion({
                  ...newQuestion,
                  chapter: e.target.value
                })
              }
              placeholder="مثلاً فصل اول"
              required
            />

            <label style={styles.label}>گفتار</label>
            <input
              style={styles.textInput}
              type="text"
              value={newQuestion.lesson}
              onChange={e =>
                setNewQuestion({
                  ...newQuestion,
                  lesson: e.target.value
                })
              }
              placeholder="مثلاً گفتار اول"
              required
            />

            <label style={styles.label}>عنوان</label>
            <input
              style={styles.textInput}
              type="text"
              value={newQuestion.topic}
              onChange={e =>
                setNewQuestion({
                  ...newQuestion,
                  topic: e.target.value
                })
              }
              placeholder="عنوان مبحث"
              required
            />

            <label style={styles.label}>متن جمله</label>
            <textarea
              style={{
                ...styles.textInput,
                minHeight: "110px",
                lineHeight: "2"
              }}
              value={newQuestion.statement}
              onChange={e =>
                setNewQuestion({
                  ...newQuestion,
                  statement: e.target.value
                })
              }
              placeholder="متن جمله را وارد کنید..."
              required
            />

            <label style={styles.label}>پاسخ صحیح جمله</label>

            <div style={{ marginTop: "10px" }}>
              <label style={{ display: "inline-block", marginLeft: "25px" }}>
                <input
                  type="radio"
                  name="questionAnswer"
                  value="true"
                  checked={newQuestion.is_true === "true"}
                  onChange={e =>
                    setNewQuestion({
                      ...newQuestion,
                      is_true: e.target.value,
                      correction: ""
                    })
                  }
                />
                درست
              </label>

              <label style={{ display: "inline-block" }}>
                <input
                  type="radio"
                  name="questionAnswer"
                  value="false"
                  checked={newQuestion.is_true === "false"}
                  onChange={e =>
                    setNewQuestion({
                      ...newQuestion,
                      is_true: e.target.value
                    })
                  }
                />
                غلط
              </label>
            </div>

            {newQuestion.is_true === "false" && (
              <>
                <label style={styles.label}>شکل صحیح جمله</label>
                <textarea
                  style={{
                    ...styles.textInput,
                    minHeight: "100px",
                    lineHeight: "2"
                  }}
                  value={newQuestion.correction}
                  onChange={e =>
                    setNewQuestion({
                      ...newQuestion,
                      correction: e.target.value
                    })
                  }
                  placeholder="شکل صحیح جمله را وارد کنید..."
                  required
                />
              </>
            )}

            <button
              type="submit"
              disabled={savingQuestion}
              style={{
                ...styles.action,
                background: "#176b43",
                color: "white",
                marginTop: "20px"
              }}
            >
              {savingQuestion ? "در حال ذخیره..." : editingQuestionId !== null ? "ذخیره تغییرات سؤال" : "ثبت سؤال در بانک"}
            </button>
            {editingQuestionId !== null && (
              <button type="button" style={styles.action} onClick={cancelEditing}>
                انصراف از ویرایش
              </button>
            )}
          </form>

          <hr style={{ margin: "30px 0" }} />

          <BulkExcelImport questions={questions} onImported={() => loadQuestions("teacher")} disabled={questionsLoading || savingQuestion} />

          {/* مدیریت سؤال‌ها */}
          <h3>مدیریت بانک سؤال</h3>

          <p>
            تعداد کل سؤال‌های ثبت‌شده:
            {" "}
            <b>{questions.length}</b>
            {" | "} فعال: <b>{questions.filter(q => q.is_active !== false).length}</b>
            {" | "} بایگانی: <b>{questions.filter(q => q.is_active === false).length}</b>
          </p>

          <label style={styles.label}>جست‌وجو در بانک سؤال</label>

          <input
            style={styles.textInput}
            type="text"
            value={questionSearch}
            onChange={e => setQuestionSearch(e.target.value)}
            placeholder="کد سؤال، کتاب، فصل، گفتار، عنوان یا متن جمله..."
          />
          <label style={{ display: "block", marginTop: "12px" }}>
            <input
              type="checkbox"
              checked={showArchived}
              onChange={e => setShowArchived(e.target.checked)}
            />{" "} نمایش سؤالات بایگانی‌شده
          </label>

          <div style={{ marginTop: "15px" }}>
            <button
              style={{
                ...styles.action,
                background: "#176b43",
                color: "white"
              }}
              onClick={() => loadQuestions("teacher")}
              disabled={questionsLoading}
            >
              {questionsLoading ? "در حال دریافت..." : "به‌روزرسانی فهرست"}
            </button>
          </div>

          <p>
            تعداد نتایج جست‌وجو:
            {" "}
            <b>{teacherFilteredQuestions.length}</b>
          </p>

          {questionsLoading ? (
            <p>در حال دریافت سؤال‌ها...</p>
          ) : teacherFilteredQuestions.length === 0 ? (
            <p>سؤالی با این مشخصات پیدا نشد.</p>
          ) : (
            pagedTeacherQuestions.map(q => (
              <div
                key={q.id}
                style={{
                  background: "#f3f7f4",
                  padding: "15px",
                  borderRadius: "10px",
                  marginTop: "12px",
                  lineHeight: "2"
                }}
              >
                <p><b>کد سؤال:</b> {q.question_code} {q.is_active === false && <b>(بایگانی)</b>}</p>
                <p><b>کتاب:</b> {q.book}</p>
                <p><b>فصل:</b> {q.chapter}</p>
                <p><b>گفتار:</b> {q.lesson}</p>
                <p><b>عنوان:</b> {q.topic}</p>
                <p><b>جمله:</b> {q.statement}</p>
                <p>
                  <b>پاسخ صحیح:</b>
                  {" "}
                  {isTrue(q.is_true) ? "درست" : "غلط"}
                </p>

                {!isTrue(q.is_true) && (
                  <p>
                    <b>شکل صحیح جمله:</b>{" "}{q.correction}
                  </p>
                )}
                <button type="button" style={styles.action} onClick={() => editQuestion(q)}>
                  ویرایش
                </button>
                <button
                  type="button"
                  style={{ ...styles.action, background: q.is_active === false ? "#176b43" : "#8b3333", color: "white" }}
                  disabled={updatingQuestionId === q.id}
                  onClick={() => toggleQuestionActive(q)}
                >
                  {q.is_active === false ? "بازیابی سؤال" : "حذف از بانک فعال (بایگانی)"}
                </button>
              </div>
            ))
          )}

          {teacherFilteredQuestions.length > QUESTION_PAGE_SIZE && (
            <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
              <button type="button" style={styles.action} disabled={questionPage <= 1}
                onClick={() => setQuestionPage(p => Math.max(1, p - 1))}>صفحه قبل</button>
              <span>صفحه {questionPage} از {teacherQuestionPages}</span>
              <button type="button" style={styles.action} disabled={questionPage >= teacherQuestionPages}
                onClick={() => setQuestionPage(p => Math.min(teacherQuestionPages, p + 1))}>صفحه بعد</button>
            </div>
          )}

          <hr style={{ margin: "30px 0" }} />

          <h3>گزارش عملکرد دانش‌آموزان</h3>
          <p>آمار زیر همه پاسخ‌ها، از جمله پاسخ‌های ثبت‌شده در مرور مجدد، را شامل می‌شود.</p>
          <button type="button" style={{ ...styles.action, background: "#176b43", color: "white" }}
            disabled={attemptsLoading} onClick={loadAttempts}>
            {attemptsLoading ? "در حال دریافت گزارش..." : "به‌روزرسانی گزارش"}
          </button>
          <label style={styles.label}>انتخاب دانش‌آموز برای گزارش تفصیلی</label>
          <select style={styles.select} value={reportStudentId} onChange={e => setReportStudentId(e.target.value)}>
            <option value="">همه دانش‌آموزان</option>
            {students.map(student => (
              <option key={student.id} value={String(student.id)}>{student.display_name || student.id}</option>
            ))}
          </select>
          <div style={{ background: "#f3f7f4", padding: "15px", borderRadius: "10px", marginTop: "15px" }}>
            <p><b>تعداد پاسخ‌های ثبت‌شده:</b> {reportAttempts.length}</p>
            <p><b>تعداد پاسخ درست:</b> {reportCorrect}</p>
            <p><b>تعداد پاسخ نادرست:</b> {reportAttempts.length - reportCorrect}</p>
            <p><b>درصد پاسخ درست:</b> {reportAttempts.length ? Math.round(reportCorrect * 100 / reportAttempts.length) : 0}٪</p>
            <p><b>تعداد سؤال متفاوتِ پاسخ‌داده‌شده:</b> {new Set(reportAttempts.map(a => String(a.question_id))).size}</p>
          </div>
          <h4>عملکرد به تفکیک فصل (از ضعیف‌تر به قوی‌تر)</h4>
          {chapterStats.length === 0 ? <p>هنوز پاسخی ثبت نشده است.</p> : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "right" }}>
                <thead><tr><th>کتاب / فصل</th><th>تعداد پاسخ</th><th>درصد درست</th></tr></thead>
                <tbody>{chapterStats.map(row => (
                  <tr key={row.name}>
                    <td style={{ padding: "8px", borderBottom: "1px solid #ddd" }}>{row.name}</td>
                    <td style={{ padding: "8px", borderBottom: "1px solid #ddd" }}>{row.total}</td>
                    <td style={{ padding: "8px", borderBottom: "1px solid #ddd" }}>{row.percent}٪</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
          <h4>خلاصه عملکرد دانش‌آموزان</h4>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "right" }}>
              <thead><tr><th>نام دانش‌آموز</th><th>پاسخ</th><th>سؤال متفاوت</th><th>درست</th><th>غلط</th><th>درصد درست</th></tr></thead>
              <tbody>{reportStats
                .filter(row => !reportStudentId || String(row.student.id) === reportStudentId)
                .map(row => (
                <tr key={row.student.id}>
                  <td style={{ padding: "8px", borderBottom: "1px solid #ddd" }}>{row.student.display_name}</td>
                  <td style={{ padding: "8px", borderBottom: "1px solid #ddd" }}>{row.total}</td>
                  <td style={{ padding: "8px", borderBottom: "1px solid #ddd" }}>{row.unique}</td>
                  <td style={{ padding: "8px", borderBottom: "1px solid #ddd" }}>{row.correct}</td>
                  <td style={{ padding: "8px", borderBottom: "1px solid #ddd" }}>{row.incorrect}</td>
                  <td style={{ padding: "8px", borderBottom: "1px solid #ddd" }}>{row.percent}٪</td>
                </tr>
              ))}</tbody>
            </table>
          </div>

          <h3>گزارش آزمون‌ها</h3>
          <p>این بخش فقط آزمون‌های نهایی‌شده را در میانگین نمره محاسبه می‌کند؛ آزمون‌های لغوشده جداگانه نمایش داده می‌شوند.</p>
          <button
            type="button"
            style={{ ...styles.action, background: "#245b83", color: "white" }}
            disabled={examSessionsLoading}
            onClick={loadExamSessions}
          >
            {examSessionsLoading ? "در حال دریافت آزمون‌ها..." : "به‌روزرسانی گزارش آزمون‌ها"}
          </button>
          <div style={{ background: "#eef4f8", padding: "15px", borderRadius: "10px", marginTop: "15px" }}>
            <p><b>تعداد کل جلسات:</b> {reportExamSessions.length}</p>
            <p><b>آزمون‌های نهایی‌شده:</b> {completedExamSessions.length}</p>
            <p><b>میانگین درصد آزمون‌های نهایی‌شده:</b> {averageExamPercent}٪</p>
          </div>
          {examSessionsLoading ? (
            <p>در حال دریافت گزارش آزمون‌ها...</p>
          ) : reportExamSessions.length === 0 ? (
            <p>هنوز آزمونی برای این محدوده گزارش ثبت نشده است.</p>
          ) : (
            <div style={{ overflowX: "auto", marginTop: "12px" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "right" }}>
                <thead>
                  <tr>
                    <th>دانش‌آموز</th>
                    <th>زمان شروع</th>
                    <th>محدوده</th>
                    <th>تعداد سؤال</th>
                    <th>درست</th>
                    <th>غلط</th>
                    <th>درصد</th>
                    <th>وضعیت</th>
                  </tr>
                </thead>
                <tbody>
                  {reportExamSessions.slice(0, 200).map(session => {
                    const student = studentById.get(String(session.student_id));
                    const scope = [
                      session.book || "همه کتاب‌ها",
                      session.chapter || "همه فصل‌ها",
                      session.lesson || "همه گفتارها",
                      session.topic || "همه عنوان‌ها"
                    ].join(" / ");
                    const statusLabel = session.status === "submitted"
                      ? "نهایی‌شده"
                      : session.status === "cancelled"
                        ? "لغوشده"
                        : "در حال برگزاری";
                    return (
                      <tr key={session.id}>
                        <td style={{ padding: "8px", borderBottom: "1px solid #ddd" }}>
                          {student?.display_name || session.student_id}
                        </td>
                        <td style={{ padding: "8px", borderBottom: "1px solid #ddd", whiteSpace: "nowrap" }}>
                          {session.started_at ? new Date(session.started_at).toLocaleString("fa-IR") : "—"}
                        </td>
                        <td style={{ padding: "8px", borderBottom: "1px solid #ddd", minWidth: "220px" }}>{scope}</td>
                        <td style={{ padding: "8px", borderBottom: "1px solid #ddd" }}>{session.question_count}</td>
                        <td style={{ padding: "8px", borderBottom: "1px solid #ddd" }}>{session.correct_count ?? "—"}</td>
                        <td style={{ padding: "8px", borderBottom: "1px solid #ddd" }}>{session.wrong_count ?? "—"}</td>
                        <td style={{ padding: "8px", borderBottom: "1px solid #ddd" }}>
                          {session.score_percent === null ? "—" : `${Number(session.score_percent).toFixed(1)}٪`}
                        </td>
                        <td style={{ padding: "8px", borderBottom: "1px solid #ddd" }}>{statusLabel}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {reportExamSessions.length > 200 && (
                <p>۲۰۰ جلسه اخیر نمایش داده شده‌اند؛ برای گزارش کامل از فیلتر دانش‌آموز استفاده کنید.</p>
              )}
            </div>
          )}

          <hr style={{ margin: "30px 0" }} />

          <h3>مدیریت دانش‌آموزان</h3>

          <h3>درخواست‌های در انتظار تأیید</h3>

          {students.filter(s => !s.is_approved).length === 0
            ? <p>در حال حاضر دانش‌آموزی در انتظار تأیید نیست.</p>
            : students.filter(s => !s.is_approved).map(student => (
              <div className="student" key={student.id}>
                <p>{student.display_name}</p>
                <button
                  disabled={loading}
                  onClick={() => approveStudent(student.id)}
                >
                  تأیید دانش‌آموز
                </button>
              </div>
            ))
          }

          <h3>دانش‌آموزان تأییدشده</h3>

          {students.filter(s => s.is_approved).map(student => (
            <div className="student" key={student.id}>
              <p>{student.display_name}</p>
              <span>تأیید شده</span>
            </div>
          ))}

          {message && <p className="message">{message}</p>}

          <button onClick={logout}>خروج از حساب</button>
        </section>
      </main>
    );
  }

  if (profile.role === "student" && !profile.is_approved) {
    return (
      <main className="page" dir="rtl">
        <section className="panel">
          <h2>پرسمان زیست</h2>
          <h3>حساب شما در انتظار تأیید دبیر است.</h3>
          <p>پس از تأیید دبیر، امکان استفاده از تمرین‌ها برای شما فعال می‌شود.</p>
          <button onClick={logout}>خروج از حساب</button>
        </section>
      </main>
    );
  }

  if (profile.role === "student" && profile.is_approved) {
    const currentQuestion = exerciseQuestions[currentIndex];
    const reviewQuestion = reviewQueue[reviewIndex];
    const currentExamQuestion = examQuestions[examIndex];

    return (
      <main className="page" dir="rtl">
        <header>
          <div className="mark">ز</div>
          <div>
            <h1>پرسمان زیست</h1>
            <p>پنل دانش‌آموز</p>
          </div>
        </header>

        <section className="panel">
          <h2>خوش آمدید، {profile.display_name}</h2>

          {screen === "setup" && (
            <>
              <h3>انتخاب نوع فعالیت و محدوده</h3>

              <div style={{ background: "#f3f7f4", padding: "14px", borderRadius: "10px", margin: "14px 0" }}>
                <b>نوع فعالیت</b>
                <label style={{ display: "block", marginTop: "10px" }}>
                  <input
                    type="radio"
                    name="activityMode"
                    value="practice"
                    checked={activityMode === "practice"}
                    onChange={() => setActivityMode("practice")}
                  />{" "}
                  تمرین آموزشی؛ نمایش فوری درست یا غلط بودن پاسخ
                </label>
                <label style={{ display: "block", marginTop: "10px" }}>
                  <input
                    type="radio"
                    name="activityMode"
                    value="exam"
                    checked={activityMode === "exam"}
                    onChange={() => setActivityMode("exam")}
                  />{" "}
                  آزمون؛ نمایش نتیجه و پاسخ صحیح فقط در پایان
                </label>
              </div>

              {questionsLoading ? (
                <p>در حال دریافت سؤال‌ها...</p>
              ) : (
                <>
                  <label style={styles.label}>کتاب زیست</label>
                  <select
                    style={styles.select}
                    value={book}
                    onChange={e => {
                      setBook(e.target.value);
                      setChapter("");
                      setLesson("");
                      setTopic("");
                    }}
                  >
                    <option value="">همه کتاب‌ها</option>
                    {books.map(v => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>

                  <label style={styles.label}>فصل</label>
                  <select
                    style={styles.select}
                    value={chapter}
                    onChange={e => {
                      setChapter(e.target.value);
                      setLesson("");
                      setTopic("");
                    }}
                  >
                    <option value="">همه فصل‌ها</option>
                    {chapters.map(v => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>

                  <label style={styles.label}>گفتار</label>
                  <select
                    style={styles.select}
                    value={lesson}
                    onChange={e => {
                      setLesson(e.target.value);
                      setTopic("");
                    }}
                  >
                    <option value="">همه گفتارها</option>
                    {lessons.map(v => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>

                  <label style={styles.label}>عنوان</label>
                  <select
                    style={styles.select}
                    value={topic}
                    onChange={e => setTopic(e.target.value)}
                  >
                    <option value="">همه عنوان‌ها</option>
                    {topics.map(v => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>

                  <div style={{ marginTop: "20px" }}>
                    <p>
                      تعداد کل سؤال‌های موجود در این محدوده:
                      {" "}
                      <b>{filteredQuestions.length}</b>
                    </p>

                    <label style={styles.label}>
                      {activityMode === "practice"
                        ? "چند سؤال می‌خواهید تمرین کنید؟"
                        : "آزمون چند سؤال داشته باشد؟"}
                    </label>

                    <input
                      type="number"
                      min="1"
                      max={filteredQuestions.length}
                      step="1"
                      style={styles.numberInput}
                      value={questionCount}
                      onChange={e => {
                        const value = e.target.value;

                        if (value === "") {
                          setQuestionCount("");
                          return;
                        }

                        const number = Number(value);

                        if (number > filteredQuestions.length) {
                          setQuestionCount(
                            String(filteredQuestions.length)
                          );
                        } else {
                          setQuestionCount(value);
                        }
                      }}
                      placeholder="مثلاً ۲۰"
                    />

                    <p style={{
                      fontSize: "13px",
                      color: "#666",
                      lineHeight: "1.8"
                    }}>
                      سؤال‌ها به‌صورت تصادفی و بدون تکرار انتخاب می‌شوند.
                      حداکثر تعداد قابل انتخاب:
                      {" "}
                      {filteredQuestions.length}
                    </p>
                  </div>

                  <button
                    style={{
                      ...styles.action,
                      background: "#176b43",
                      color: "white"
                    }}
                    disabled={
                      loading ||
                      filteredQuestions.length === 0 ||
                      !Number.isInteger(Number(questionCount)) ||
                      Number(questionCount) < 1 ||
                      Number(questionCount) > filteredQuestions.length
                    }
                    onClick={activityMode === "practice" ? startExercise : startExam}
                  >
                    {loading
                      ? "در حال آماده‌سازی..."
                      : activityMode === "practice" ? "شروع تمرین" : "شروع آزمون"}
                  </button>
                </>
              )}
            </>
          )}

          {screen === "exercise" && currentQuestion && (
            <>
              <h3>
                سؤال {currentIndex + 1} از {exerciseQuestions.length}
              </h3>

              <div style={styles.question}>
                {currentQuestion.statement}
              </div>

              {!feedback ? (
                <>
                  <p>به نظر شما این جمله درست است یا غلط؟</p>

                  <button
                    style={{
                      ...styles.action,
                      background: "#176b43",
                      color: "white"
                    }}
                    disabled={answerSaving}
                    onClick={() => answerQuestion(true)}
                  >
                    درست
                  </button>

                  <button
                    style={{
                      ...styles.action,
                      background: "#b52c2c",
                      color: "white"
                    }}
                    disabled={answerSaving}
                    onClick={() => answerQuestion(false)}
                  >
                    غلط
                  </button>
                </>
              ) : (
                <>
                  <h3 style={{
                    color: feedback.correct ? "green" : "red"
                  }}>
                    {feedback.correct
                      ? "آفرین! پاسخ شما درست است."
                      : "پاسخ شما نادرست است."}
                  </h3>

                  {!feedback.correct && (
                    <div style={styles.question}>
                      <p><b>پاسخ صحیح: {feedback.correctAnswer ? "درست" : "غلط"}</b></p>
                      <p>{feedback.correctAnswer
                        ? "این جمله صحیح است و نیازی به اصلاح ندارد."
                        : feedback.correction || "شکل صحیح جمله ثبت نشده است."}</p>
                    </div>
                  )}

                  <button
                    style={{
                      ...styles.action,
                      background: "#176b43",
                      color: "white"
                    }}
                    onClick={nextQuestion}
                  >
                    {currentIndex + 1 === exerciseQuestions.length
                      ? "پایان تمرین"
                      : "سؤال بعدی"}
                  </button>
                </>
              )}
            </>
          )}

          {screen === "summary" && (
            <>
              <h3>نتیجه تمرین</h3>

              <p>تعداد کل سؤال‌ها: {results.length}</p>
              <p style={{ color: "green" }}>
                پاسخ‌های درست: {results.filter(r => r.correct).length}
              </p>
              <p style={{ color: "red" }}>
                پاسخ‌های غلط: {results.filter(r => !r.correct).length}
              </p>

              {mistakes.length > 0 ? (
                <>
                  <p>تعداد سؤال‌های نیازمند مرور: {mistakes.length}</p>
                  <button
                    style={{
                      ...styles.action,
                      background: "#176b43",
                      color: "white"
                    }}
                    onClick={startReview}
                  >
                    مرور سؤال‌های اشتباه
                  </button>
                </>
              ) : (
                <p>تبریک! تمام سؤال‌ها را درست پاسخ دادید.</p>
              )}

              <button
                style={styles.action}
                onClick={() => setScreen("setup")}
              >
                بازگشت به انتخاب تمرین
              </button>
            </>
          )}

          {screen === "exam" && currentExamQuestion && (
            <>
              <h3>آزمون | سؤال {examIndex + 1} از {examQuestions.length}</h3>
              <p>
                پاسخ‌های ثبت‌شده: {Object.keys(examAnswers).length} از {examQuestions.length}
              </p>
              <div style={styles.question}>
                {currentExamQuestion.statement}
              </div>
              <p>پاسخ خود را انتخاب کنید. درست یا غلط بودن پاسخ تا پایان آزمون نمایش داده نمی‌شود.</p>

              <button
                type="button"
                style={{
                  ...styles.action,
                  background: examAnswers[String(currentExamQuestion.id)] === true ? "#14532d" : "#176b43",
                  color: "white",
                  outline: examAnswers[String(currentExamQuestion.id)] === true ? "3px solid #9ac7aa" : "none"
                }}
                disabled={examAnswerSaving || examSubmitting}
                onClick={() => answerExamQuestion(true)}
              >
                درست
              </button>
              <button
                type="button"
                style={{
                  ...styles.action,
                  background: examAnswers[String(currentExamQuestion.id)] === false ? "#7f1d1d" : "#b52c2c",
                  color: "white",
                  outline: examAnswers[String(currentExamQuestion.id)] === false ? "3px solid #e5aaaa" : "none"
                }}
                disabled={examAnswerSaving || examSubmitting}
                onClick={() => answerExamQuestion(false)}
              >
                غلط
              </button>

              {Object.prototype.hasOwnProperty.call(examAnswers, String(currentExamQuestion.id)) && (
                <p style={{ color: "#245b83" }}>
                  پاسخ شما ثبت شده است؛ نتیجه تا پایان آزمون مخفی می‌ماند.
                </p>
              )}

              <div style={{ marginTop: "18px" }}>
                <button
                  type="button"
                  style={styles.action}
                  disabled={examIndex === 0 || examAnswerSaving || examSubmitting}
                  onClick={() => setExamIndex(index => Math.max(0, index - 1))}
                >
                  سؤال قبلی
                </button>
                {examIndex < examQuestions.length - 1 ? (
                  <button
                    type="button"
                    style={{ ...styles.action, background: "#245b83", color: "white" }}
                    disabled={examAnswerSaving || examSubmitting}
                    onClick={() => setExamIndex(index => Math.min(examQuestions.length - 1, index + 1))}
                  >
                    سؤال بعدی
                  </button>
                ) : (
                  <button
                    type="button"
                    style={{ ...styles.action, background: "#176b43", color: "white" }}
                    disabled={examAnswerSaving || examSubmitting}
                    onClick={finishExam}
                  >
                    {examSubmitting ? "در حال ثبت نهایی..." : "پایان آزمون و مشاهده نتیجه"}
                  </button>
                )}
              </div>
              <button
                type="button"
                style={{ ...styles.action, background: "#777", color: "white" }}
                disabled={examAnswerSaving || examSubmitting}
                onClick={cancelExam}
              >
                لغو آزمون
              </button>
            </>
          )}

          {screen === "exam-summary" && examResult && (
            <>
              <h3>کارنامه آزمون</h3>
              <div style={{ background: "#eef4f8", padding: "16px", borderRadius: "10px", margin: "14px 0" }}>
                <p><b>تعداد سؤال‌ها:</b> {examResult.total}</p>
                <p style={{ color: "green" }}><b>پاسخ صحیح:</b> {examResult.correct_count}</p>
                <p style={{ color: "#b52c2c" }}><b>پاسخ غلط یا بی‌پاسخ:</b> {examResult.wrong_count}</p>
                <p><b>بی‌پاسخ:</b> {examResult.unanswered_count}</p>
                <p><b>درصد موفقیت:</b> {Number(examResult.score_percent || 0).toFixed(1)}٪</p>
              </div>

              <h4>بررسی پاسخ‌ها</h4>
              {(examResult.questions || []).map((item, index) => (
                <div key={item.id} style={{ ...styles.question, marginTop: "12px" }}>
                  <p><b>سؤال {index + 1}:</b> {item.statement}</p>
                  <p>
                    <b>پاسخ شما:</b>{" "}
                    {item.selected_answer === null
                      ? "بدون پاسخ"
                      : item.selected_answer ? "درست" : "غلط"}
                  </p>
                  <p><b>پاسخ صحیح:</b> {item.correct_answer ? "درست" : "غلط"}</p>
                  <p style={{ color: item.is_correct ? "green" : "#b52c2c" }}>
                    {item.is_correct ? "پاسخ شما صحیح است." : "پاسخ شما صحیح نیست."}
                  </p>
                  {!item.correct_answer && item.correction && (
                    <p><b>شکل صحیح جمله:</b> {item.correction}</p>
                  )}
                  {item.explanation && (
                    <p><b>توضیح:</b> {item.explanation}</p>
                  )}
                </div>
              ))}

              <button
                type="button"
                style={{ ...styles.action, background: "#176b43", color: "white" }}
                onClick={() => {
                  setExamSessionId(null);
                  setExamQuestions([]);
                  setExamAnswers({});
                  setExamResult(null);
                  setScreen("setup");
                }}
              >
                بازگشت به انتخاب فعالیت
              </button>
            </>
          )}

          {screen === "review" && (
            <>
              <h3>مرور سؤال‌های اشتباه</h3>

              {reviewRemaining.length === 0 ? (
                <>
                  <p>تبریک! همه سؤال‌های اشتباه را اصلاح کردید.</p>
                  <button
                    style={styles.action}
                    onClick={() => setScreen("setup")}
                  >
                    بازگشت به تمرین
                  </button>
                </>
              ) : (
                <>
                  <p>سؤال {reviewIndex + 1} از {reviewQueue.length} | باقی‌مانده برای اصلاح: {reviewRemaining.length}</p>

                  <div style={styles.question}>
                    {reviewQuestion.statement}
                  </div>

                  {!reviewFeedback ? (
                    <>
                      <button
                        style={{
                          ...styles.action,
                          background: "#176b43",
                          color: "white"
                        }}
                        disabled={answerSaving}
                        onClick={() => answerReview(true)}
                      >
                        درست
                      </button>

                      <button
                        style={{
                          ...styles.action,
                          background: "#b52c2c",
                          color: "white"
                        }}
                        disabled={answerSaving}
                        onClick={() => answerReview(false)}
                      >
                        غلط
                      </button>
                    </>
                  ) : (
                    <>
                      <h3 style={{
                        color: reviewFeedback.correct ? "green" : "red"
                      }}>
                        {reviewFeedback.correct
                          ? "آفرین! این سؤال از فهرست اشتباهات حذف شد."
                          : "هنوز پاسخ صحیح نیست؛ سؤال در فهرست باقی می‌ماند."}
                      </h3>

                      {!reviewFeedback.correct && (
                        <div style={styles.question}>
                          <p><b>پاسخ صحیح: {reviewFeedback.correctAnswer ? "درست" : "غلط"}</b></p>
                          <p>{reviewFeedback.correctAnswer
                            ? "این جمله صحیح است و نیازی به اصلاح ندارد."
                            : reviewFeedback.correction || "شکل صحیح جمله ثبت نشده است."}</p>
                        </div>
                      )}

                      <button
                        style={{
                          ...styles.action,
                          background: "#176b43",
                          color: "white"
                        }}
                        onClick={nextReviewQuestion}
                      >
                        ادامه مرور
                      </button>
                    </>
                  )}
                </>
              )}
            </>
          )}

          {message && <p className="message">{message}</p>}

          <button
            className="link"
            onClick={logout}
            style={{ marginTop: "20px" }}
          >
            خروج از حساب
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="page" dir="rtl">
      <section className="panel">
        <h2>نقش کاربری معتبر نیست.</h2>
        <button onClick={logout}>خروج</button>
      </section>
    </main>
  );
}
