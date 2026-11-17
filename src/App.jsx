
import React, { useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import TeacherAnalytics from "./TeacherAnalytics";
import StudentReport from "./StudentReport";
import { QuestionIssueButton, TeacherQuestionIssues } from "./QuestionIssues";

// آیکون‌های مستقل از کتابخانه؛ فقط برای بهبود ظاهر رابط کاربری.
function InterfaceIcon({ name, size = 19 }) {
  const paths = {
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
    questions: <><path d="M4 5.5C6.8 4 9.7 4.4 12 6v14c-2.3-1.6-5.2-2-8-.5z"/><path d="M20 5.5c-2.8-1.5-5.7-1.1-8 .5v14c2.3-1.6 5.2-2 8-.5z"/></>,
    students: <><circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2z"/><path d="M17 6a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 4v1"/></>,
    reports: <><path d="M4 20V11M10 20V4M16 20v-8M22 20v-5M2 21h21"/></>,
    issues: <><path d="M12 3 2.5 20h19z"/><path d="M12 9v5M12 17h.01"/></>,
    home: <><path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-7h6v7"/></>,
    chart: <><path d="M3 3v18h18"/><path d="m7 16 4-5 3 2 5-7"/></>,
    arrow: <><path d="M18 12H6M11 7l-5 5 5 5"/></>,
    check: <><path d="m5 12 4 4L19 6"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>
  };
  return <svg className="interface-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[name] || paths.dashboard}</svg>;
}

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
    background: "#ffffff",
    padding: "clamp(22px, 4vw, 36px)",
    borderRadius: "20px",
    border: "1px solid #dcece1",
    boxShadow: "0 14px 36px rgba(14, 64, 42, 0.055)",
    lineHeight: "2.3",
    fontSize: "clamp(18px, 2vw, 22px)",
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

// تاریخ‌های شمسی فقط در واسط کاربری استفاده می‌شوند؛ دیتابیس تاریخ میلادی ISO ذخیره می‌کند.
const persianDayFormatter = new Intl.DateTimeFormat("en-US-u-ca-persian", {
  timeZone: "UTC", year: "numeric", month: "numeric", day: "numeric"
});
const iranDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit"
});

function getDateParts(formatter, date) {
  const values = Object.fromEntries(formatter.formatToParts(date)
    .filter(p => ["year", "month", "day"].includes(p.type))
    .map(p => [p.type, Number(p.value)]));
  return [values.year, values.month, values.day];
}

function todayInIranISO() {
  const [y, m, d] = getDateParts(iranDateFormatter, new Date());
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function gregorianISOToJalali(iso) {
  if (!iso) return "";
  const parts = String(iso).slice(0, 10).split("-").map(Number);
  if (parts.length !== 3 || parts.some(v => !Number.isInteger(v))) return "";
  const [year, month, day] = getDateParts(persianDayFormatter,
    new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 12)));
  return `${year}/${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}`;
}

function jalaliToGregorianISO(raw) {
  const input = String(raw ?? "").trim()
    .replace(/[۰-۹]/g, c => String("۰۱۲۳۴۵۶۷۸۹".indexOf(c)))
    .replace(/[٠-٩]/g, c => String("٠١٢٣٤٥٦٧٨٩".indexOf(c)));
  if (!input) return null; // محدودیت زمانی ندارد
  const match = /^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/.exec(input);
  if (!match) throw new Error("تاریخ را به شکل ۱۴۰۵/۰۹/۳۰ وارد کنید.");
  const wanted = match.slice(1).map(Number);
  const [y, m, d] = wanted;
  if (y < 1300 || y > 1500 || m < 1 || m > 12 || d < 1 || d > 31) {
    throw new Error("تاریخ شمسی واردشده معتبر نیست.");
  }
  // پیدا کردن روز میلادی متناظر با تاریخ شمسی؛ با تقویم رسمی Intl، بدون وابستگی جدید.
  let low = Math.floor(Date.UTC(y + 620, 0, 1) / 86400000);
  let high = Math.floor(Date.UTC(y + 623, 0, 1) / 86400000);
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const found = getDateParts(persianDayFormatter, new Date(middle * 86400000 + 43200000));
    const comparison = found[0] !== y ? found[0] - y : found[1] !== m ? found[1] - m : found[2] - d;
    if (comparison === 0) return new Date(middle * 86400000).toISOString().slice(0, 10);
    if (comparison < 0) low = middle + 1;
    else high = middle - 1;
  }
  throw new Error("این روز در تقویم شمسی وجود ندارد.");
}

function studentAccessState(student, todayISO) {
  if (!student.is_approved) return "pending";
  if (student.access_start_date && todayISO < student.access_start_date) return "future";
  if (student.access_end_date && todayISO > student.access_end_date) return "expired";
  return "active";
}

// روزشمار بر اساس روز تقویمی ایران است؛ در روز پایان، مقدار صفر خواهد بود.
// استفاده از UTC فقط برای محاسبه فاصله روزهای تقویمی است (بدون خطای ساعت تابستانی).
function daysUntilAccessEnds(todayISO, accessEndDate) {
  if (!accessEndDate) return null;
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!datePattern.test(todayISO) || !datePattern.test(String(accessEndDate))) return null;
  const todayMillis = Date.parse(`${todayISO}T00:00:00Z`);
  const endMillis = Date.parse(`${accessEndDate}T00:00:00Z`);
  if (!Number.isFinite(todayMillis) || !Number.isFinite(endMillis)) return null;
  return Math.round((endMillis - todayMillis) / 86400000);
}

function StudentAccessEditor({ student, onSave, disabled, todayISO }) {
  const [startText, setStartText] = useState(() => gregorianISOToJalali(student.access_start_date));
  const [endText, setEndText] = useState(() => gregorianISOToJalali(student.access_end_date));
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    setStartText(gregorianISOToJalali(student.access_start_date));
    setEndText(gregorianISOToJalali(student.access_end_date));
    setLocalError("");
  }, [student.access_start_date, student.access_end_date]);

  const status = studentAccessState(student, todayISO);
  const statusTitle = {
    pending: "در انتظار تأیید دبیر",
    active: "دسترسی فعال",
    future: "هنوز زمان دسترسی شروع نشده",
    expired: "دوره دسترسی پایان یافته"
  }[status];

  function save(e) {
    e.preventDefault();
    setLocalError("");
    try {
      const start = jalaliToGregorianISO(startText);
      const end = jalaliToGregorianISO(endText);
      if (start && end && end < start) throw new Error("تاریخ پایان نباید قبل از شروع باشد.");
      onSave(student.id, start, end);
    } catch (error) {
      setLocalError(error.message || "تاریخ نامعتبر است.");
    }
  }

  return (
    <form onSubmit={save} style={{ width: "100%", marginTop: "10px", padding: "12px", border: "1px solid #dce8e1", borderRadius: "12px", background: "#f8fbf9" }}>
      <div style={{ marginBottom: "6px", fontWeight: 700 }}>
        زمان دسترسی: <span style={{ color: status === "active" ? "#167451" : "#aa6526" }}>{statusTitle}</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "flex-end" }}>
        <label style={{ flex: "1 1 145px", margin: 0 }}>
          تاریخ شروع (شمسی)
          <input type="text" inputMode="numeric" dir="ltr" aria-label={`تاریخ شروع ${student.display_name || "دانش‌آموز"}`}
            placeholder="۱۴۰۵/۰۹/۰۱" value={startText} disabled={disabled}
            onChange={e => setStartText(e.target.value)} style={{ display: "block", width: "100%", marginTop: "5px" }} />
        </label>
        <label style={{ flex: "1 1 145px", margin: 0 }}>
          تاریخ پایان (شمسی)
          <input type="text" inputMode="numeric" dir="ltr" aria-label={`تاریخ پایان ${student.display_name || "دانش‌آموز"}`}
            placeholder="۱۴۰۵/۱۰/۳۰" value={endText} disabled={disabled}
            onChange={e => setEndText(e.target.value)} style={{ display: "block", width: "100%", marginTop: "5px" }} />
        </label>
        <button type="submit" disabled={disabled} style={{ flex: "0 0 auto" }}>ذخیره دوره دسترسی</button>
      </div>
      <small style={{ display: "block", color: "#64766e", marginTop: "6px" }}>
        تاریخ‌ها شامل همان روز نیز هستند؛ کادر خالی یعنی بدون محدودیت. برای تمدید، تاریخ پایان را تغییر دهید.
      </small>
      {localError && <p role="alert" style={{ margin: "4px 0 0", color: "#ad2424" }}>{localError}</p>}
    </form>
  );
}

// اجباری بودن تکمیل مشخصات؛ نمایش پنل تنها پس از تأیید ثبت این فیلدها توسط سرور.
function normalizeMobile(value) {
  return String(value ?? "")
    .replace(/[۰-۹]/g, digit => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[\s\-]/g, "");
}

function studentProfileComplete(profile) {
  return Boolean(profile &&
    String(profile.first_name || "").trim().length >= 2 &&
    String(profile.last_name || "").trim().length >= 2 &&
    /^09\d{9}$/.test(String(profile.mobile || "")));
}

function studentFullName(student) {
  const first = String(student?.first_name || "").trim();
  const last = String(student?.last_name || "").trim();
  return [first, last].filter(Boolean).join(" ") || student?.display_name || "ثبت‌نام ناقص";
}

function StudentIdentityForm({ profile, required = false, onSaved, onLogout }) {
  const [firstName, setFirstName] = useState(profile.first_name || "");
  const [lastName, setLastName] = useState(profile.last_name || "");
  const [mobile, setMobile] = useState(profile.mobile || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    setFirstName(profile.first_name || "");
    setLastName(profile.last_name || "");
    setMobile(profile.mobile || "");
  }, [profile.first_name, profile.last_name, profile.mobile]);

  async function save(event) {
    event.preventDefault();
    if (busy) return;
    setError("");
    setSuccess("");
    const normalized = normalizeMobile(mobile);
    if (firstName.trim().length < 2 || lastName.trim().length < 2) {
      setError("نام و نام خانوادگی باید جداگانه وارد شوند (حداقل دو حرف).");
      return;
    }
    if (!/^09\d{9}$/.test(normalized)) {
      setError("شماره موبایل را به‌صورت ۱۱ رقم و با ۰۹ وارد کنید.");
      return;
    }
    setBusy(true);
    try {
      const { error: saveError } = await supabase.rpc("pz_complete_student_profile", {
        p_first_name: firstName.trim(),
        p_last_name: lastName.trim(),
        p_mobile: normalized
      });
      if (saveError) throw saveError;
      await onSaved();
      setSuccess("مشخصات شما با موفقیت ذخیره شد.");
    } catch (reason) {
      setError("ثبت مشخصات انجام نشد: " + (reason?.message || "خطای نامشخص"));
    } finally {
      setBusy(false);
    }
  }

  return <div className={`student-identity ${required ? "student-identity--required" : ""}`}>
    <h3>{required ? "تکمیل اجباری مشخصات دانش‌آموز" : "مشخصات ثبت‌نامی من"}</h3>
    <p>{required ? "پیش از ورود به پنل دانش‌آموز، نام، نام خانوادگی و موبایل خود را ثبت کنید. تا تکمیل این فرم، تمرین، آزمون و کارنامه در دسترس نیستند." : "در صورت نیاز می‌توانید مشخصات خود را اصلاح کنید."}</p>
    <form onSubmit={save} className="student-identity__form">
      <label>نام
        <input required autoComplete="given-name" maxLength={60} minLength={2}
          value={firstName} onChange={event => setFirstName(event.target.value)} disabled={busy}/>
      </label>
      <label>نام خانوادگی
        <input required autoComplete="family-name" maxLength={60} minLength={2}
          value={lastName} onChange={event => setLastName(event.target.value)} disabled={busy}/>
      </label>
      <label>شماره موبایل دانش‌آموز
        <input type="tel" required inputMode="tel" dir="ltr" autoComplete="tel-national"
          maxLength={16} placeholder="09123456789" value={mobile}
          onChange={event => setMobile(event.target.value)} disabled={busy}/>
      </label>
      <div className="student-identity__actions">
        <button type="submit" disabled={busy}>{busy ? "در حال ذخیره..." : "ذخیره مشخصات"}</button>
        {required && <button type="button" className="secondary-action" onClick={onLogout} disabled={busy}>خروج از حساب</button>}
      </div>
    </form>
    {error && <p role="alert" className="student-identity__error">{error}</p>}
    {success && !required && <p role="status" className="student-identity__success">{success}</p>}
  </div>;
}

// جلوگیری از کپی معمولی متن سؤال در پنل دانش‌آموز؛ این کار محافظت مطلق نیست.
// دسترسی صفحه‌خوان و عملکرد دکمه‌های پاسخ همچنان حفظ می‌شود.
function ProtectedQuestionText({ children, style }) {
  const preventTextCopy = event => event.preventDefault();
  return (
    <div
      className="student-protected-question"
      style={style}
      onCopy={preventTextCopy}
      onCut={preventTextCopy}
      onContextMenu={preventTextCopy}
      onDragStart={preventTextCopy}
    >
      {children}
    </div>
  );
}

export default function App() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState("login");
  const [signupFirstName, setSignupFirstName] = useState("");
  const [signupLastName, setSignupLastName] = useState("");
  const [signupMobile, setSignupMobile] = useState("");
  const [teacherTab, setTeacherTab] = useState("dashboard");

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
  const [deletingArchivedQuestions, setDeletingArchivedQuestions] = useState(false);
  const [selectedArchivedQuestionIds, setSelectedArchivedQuestionIds] = useState([]);
  const [deletingStudentId, setDeletingStudentId] = useState(null);
  const [savingStudentAccessId, setSavingStudentAccessId] = useState(null);
  const [todayISO, setTodayISO] = useState(todayInIranISO);
  const [answerSaving, setAnswerSaving] = useState(false);
  const answerLockRef = useRef(false);
  // جلوگیری از نمایش خطا/اطلاعات درخواست‌های قدیمی پس از خروج از حساب.
  const authEpochRef = useRef(0);
  const questionsRequestRef = useRef(0);

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
    const epoch = authEpochRef.current;
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (epoch !== authEpochRef.current) return;
    if (error) {
      setMessage("خطا در دریافت اطلاعات حساب: " + error.message);
      setProfile(null);
      return;
    }

    setProfile(data);
  }

  async function loadStudents() {
    const epoch = authEpochRef.current;
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("role", "student")
      .order("created_at", { ascending: false });

    if (epoch !== authEpochRef.current) return;
    if (error) {
      setMessage("خطا در دریافت دانش‌آموزان: " + error.message);
      return;
    }

    setStudents(data || []);
  }

  async function loadQuestions(role = profile?.role) {
    const epoch = authEpochRef.current;
    const requestId = ++questionsRequestRef.current;
    const stillCurrent = () => epoch === authEpochRef.current && requestId === questionsRequestRef.current;
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
      if (stillCurrent()) setQuestions(rows);
    } catch (error) {
      if (stillCurrent()) {
        setMessage("خطا در دریافت سؤال‌ها: " + error.message);
        setQuestions([]);
      }
    } finally {
      if (stillCurrent()) setQuestionsLoading(false);
    }
  }

  async function loadAttempts() {
    const epoch = authEpochRef.current;
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
      if (epoch === authEpochRef.current) setAttempts(all);
    } catch (error) {
      if (epoch === authEpochRef.current) {
        setAttempts([]);
        setMessage("خطا در دریافت گزارش پاسخ‌ها: " + error.message);
      }
    } finally {
      if (epoch === authEpochRef.current) setAttemptsLoading(false);
    }
  }

  async function loadExamSessions() {
    const epoch = authEpochRef.current;
    setExamSessionsLoading(true);
    try {
      const { data, error } = await supabase
        .from("exam_sessions")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(1000);

      if (error) throw error;
      if (epoch === authEpochRef.current) setExamSessions(data || []);
    } catch (error) {
      if (epoch === authEpochRef.current) {
        setExamSessions([]);
        setMessage("خطا در دریافت گزارش آزمون‌ها: " + error.message);
      }
    } finally {
      if (epoch === authEpochRef.current) setExamSessionsLoading(false);
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
        // با قطع نشست، نتیجه درخواست‌های قبلی دیگر نباید صفحه ورود را تغییر دهد.
        authEpochRef.current += 1;
        questionsRequestRef.current += 1;
        setEmail("");
        setPassword("");
        setSignupFirstName("");
        setSignupLastName("");
        setSignupMobile("");
        setMode("login");
        setMessage("");
        setQuestionsLoading(false);
        setAttemptsLoading(false);
        setExamSessionsLoading(false);
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

  // به‌روز کردن روز جاری ایران؛ تا صفحه بازمانده پس از انقضا هم مسدود شود.
  useEffect(() => {
    const refresh = () => setTodayISO(todayInIranISO());
    const interval = window.setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  // اگر دبیر تاریخ‌ها را عوض کند، هنگام بازگشت دانش‌آموز به تب، پروفایل تازه شود.
  useEffect(() => {
    if (!user?.id || profile?.role !== "student") return;
    const refreshProfile = () => { void loadProfile(user.id); };
    window.addEventListener("focus", refreshProfile);
    return () => window.removeEventListener("focus", refreshProfile);
  }, [user?.id, profile?.role]);

  useEffect(() => {
    if (profile?.role === "teacher") {
      loadStudents();
      loadQuestions("teacher");
      loadAttempts();
      loadExamSessions();
    }

    if (
      profile?.role === "student" &&
      studentProfileComplete(profile) &&
      studentAccessState(profile, todayISO) === "active"
    ) {
      loadQuestions("student");
    }
  }, [profile, todayISO]);

  const [exportingStudentRegistry, setExportingStudentRegistry] = useState(false);

  async function exportStudentRegistryExcel() {
    if (exportingStudentRegistry) return;
    setExportingStudentRegistry(true);
    setMessage("");
    try {
      // اطلاعات ایمیل فقط از تابع محافظت‌شده مخصوص دبیر دریافت می‌شود.
      const { data, error } = await supabase.rpc("pz_teacher_student_registry");
      if (error) throw error;
      if (!Array.isArray(data)) throw new Error("اطلاعات ثبت‌نام دریافت نشد.");
      const XLSX = await import("xlsx");
      const rows = data.map((student, index) => ({
        "ردیف": index + 1,
        "نام": student.first_name || "",
        "نام خانوادگی": student.last_name || "",
        "نام نمایشی": student.display_name || "",
        "شماره موبایل": student.mobile || "",
        "ایمیل ثبت‌نامی": student.email || "",
        "وضعیت مشخصات": student.profile_complete ? "تکمیل" : "ناقص",
        "وضعیت تأیید": student.is_approved ? "تأییدشده" : "در انتظار تأیید",
        "شروع دسترسی": gregorianISOToJalali(student.access_start_date) || "نامحدود",
        "پایان دسترسی": gregorianISOToJalali(student.access_end_date) || "نامحدود",
        "تاریخ ثبت‌نام": student.created_at ? new Intl.DateTimeFormat("fa-IR-u-ca-persian", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(student.created_at)) : "",
        "شناسه حساب": student.id || ""
      }));
      const columns = ["ردیف", "نام", "نام خانوادگی", "نام نمایشی", "شماره موبایل", "ایمیل ثبت‌نامی", "وضعیت مشخصات", "وضعیت تأیید", "شروع دسترسی", "پایان دسترسی", "تاریخ ثبت‌نام", "شناسه حساب"];
      const worksheet = XLSX.utils.json_to_sheet(rows, { header: columns });
      worksheet["!cols"] = [7, 17, 22, 25, 18, 34, 18, 20, 19, 19, 18, 38].map(wch => ({ wch }));
      // ستون موبایل متنی باقی می‌ماند تا صفر ابتدای شماره حفظ شود.
      const mobileCol = "E";
      rows.forEach((_, index) => {
        const cell = worksheet[`${mobileCol}${index + 2}`];
        if (cell) { cell.t = "s"; cell.z = "@"; }
      });
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "دانش‌آموزان");
      XLSX.writeFile(workbook, `porseman-students-${todayInIranISO()}.xlsx`);
      setMessage(`خروجی اطلاعات ثبت‌نام ${data.length.toLocaleString("fa-IR")} دانش‌آموز آماده شد.`);
    } catch (reason) {
      setMessage("دریافت خروجی اکسل انجام نشد: " + (reason?.message || "خطای نامشخص"));
    } finally {
      setExportingStudentRegistry(false);
    }
  }

  async function authenticate(e) {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      if (mode === "signup") {
        const first = signupFirstName.trim();
        const last = signupLastName.trim();
        const phone = normalizeMobile(signupMobile);
        if (first.length < 2 || last.length < 2 || !/^09\d{9}$/.test(phone)) {
          throw new Error("نام، نام خانوادگی و شماره موبایل معتبر را تکمیل کنید.");
        }
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              first_name: first,
              last_name: last,
              mobile: phone,
              display_name: first + " " + last
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
          const metadata = data.user.user_metadata || {};
          const autoMobile = normalizeMobile(metadata.mobile);
          if (String(metadata.first_name || "").trim().length >= 2 &&
              String(metadata.last_name || "").trim().length >= 2 && /^09\d{9}$/.test(autoMobile)) {
            const { data: existing } = await supabase.from("profiles")
              .select("role,first_name,last_name,mobile").eq("id", data.user.id).maybeSingle();
            if (existing?.role === "student" && !studentProfileComplete(existing)) {
              // حساب جدید: اطلاعات ثبت‌نام فقط پس از تأیید مجدد در سرور وارد profiles می‌شود.
              await supabase.rpc("pz_complete_student_profile", {
                p_first_name: String(metadata.first_name).trim(),
                p_last_name: String(metadata.last_name).trim(),
                p_mobile: autoMobile
              });
            }
          }
          await loadProfile(data.user.id);
          setPassword("");
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

  async function saveStudentAccess(studentId, startDate, endDate) {
    if (savingStudentAccessId || deletingStudentId) return;
    setSavingStudentAccessId(String(studentId));
    setMessage("");
    try {
      const { error } = await supabase.rpc("pz_set_student_access_dates", {
        p_student_id: studentId,
        p_access_start_date: startDate,
        p_access_end_date: endDate
      });
      if (error) throw error;
      await loadStudents();
      setMessage("تاریخ شروع و پایان دسترسی دانش‌آموز ذخیره شد.");
    } catch (error) {
      setMessage("ذخیره دوره دسترسی انجام نشد: " + (error?.message || "خطای نامشخص"));
    } finally {
      setSavingStudentAccessId(null);
    }
  }

  async function submitNewQuestion(e) {
    e.preventDefault();
    setMessage("");

    const code = newQuestion.question_code.trim();
    // The check includes both active and archived questions; ignore the current row when editing.
    const normalizedCode = normalizeExcelText(code);
    const codeAlreadyUsed = questions.some(q =>
      String(q.id) !== String(editingQuestionId) &&
      normalizeExcelText(q.question_code) === normalizedCode
    );
    if (normalizedCode && codeAlreadyUsed) {
      setMessage("این کد سؤال قبلاً ثبت شده است؛ لطفاً کد دیگری انتخاب کنید.");
      return;
    }
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

  // حذف دائمی سؤالات بایگانی‌شده: سوابق پاسخ‌های مرتبط و کل جلسه آزمون
  // دارای این سؤالات هم حذف می‌شوند تا ارجاع خراب در کارنامه باقی نماند.
  // تمام بررسی‌های دسترسی و حذف وابستگی‌ها در SQL و در یک تراکنش انجام می‌شود.
  async function deleteArchivedQuestions(questionIds) {
    if (deletingArchivedQuestions || !questionIds.length) return;

    const archivedIds = new Set(
      questions.filter(q => q.is_active === false).map(q => String(q.id))
    );
    const safeIds = [...new Set(questionIds.map(String))]
      .filter(id => archivedIds.has(id));
    if (!safeIds.length) {
      setMessage("هیچ سؤال بایگانی‌شده‌ای برای حذف انتخاب نشده است.");
      return;
    }

    const description = safeIds.length === 1
      ? "این سؤال بایگانی‌شده"
      : `${safeIds.length} سؤال بایگانی‌شده انتخاب‌شده`;
    if (!window.confirm(
      `حذف دائمی ${description} انجام شود؟\n\n` +
      "این عملیات قابل بازگشت نیست. سوابق تمرین این سؤال‌ها و جلسات آزمونی که شامل آن‌ها باشند نیز پاک می‌شوند. " +
      "اگر لازم است، ابتدا از داده‌ها نسخه پشتیبان تهیه کنید."
    )) return;

    setDeletingArchivedQuestions(true);
    setMessage("");
    try {
      const { data, error } = await supabase.rpc("pz_delete_archived_questions", {
        p_question_ids: safeIds
      });
      if (error) throw error;
      const deleted = Number(data?.deleted ?? 0);
      const attemptsDeleted = Number(data?.attempts_deleted ?? 0);
      const examSessionsDeleted = Number(data?.exam_sessions_deleted ?? 0);
      const otherCount = Number(data?.not_archived_or_missing ?? 0);
      setSelectedArchivedQuestionIds([]);
      setQuestionPage(1);
      await Promise.all([
        loadQuestions("teacher"), loadAttempts(), loadExamSessions()
      ]);
      setMessage(
        `${deleted} سؤال بایگانی‌شده حذف شد. ` +
        `${attemptsDeleted} پاسخ تمرینی و ${examSessionsDeleted} جلسه آزمون مرتبط نیز حذف شد.` +
        (otherCount ? ` ${otherCount} سؤال پیدا نشد یا بایگانی نبود.` : "")
      );
    } catch (error) {
      setMessage("حذف سؤال‌ها انجام نشد: " + (error?.message || "خطای نامشخص"));
    } finally {
      setDeletingArchivedQuestions(false);
    }
  }

  // حذف حساب دانش‌آموز، همراه سوابق خود او؛ سرور نقش و وابستگی‌ها را کنترل می‌کند.
  async function deleteStudent(student) {
    if (deletingStudentId) return;
    const name = student.display_name || "این دانش‌آموز";
    if (!window.confirm(
      `آیا حساب «${name}» و تمام پاسخ‌ها و آزمون‌های مربوط به او برای همیشه حذف شوند؟\n\n` +
      "این کار قابل بازگشت نیست و دسترسی دانش‌آموز به حساب از بین می‌رود. " +
      "قبل از ادامه نسخه پشتیبان تهیه کنید."
    )) return;
    const typedName = window.prompt(
      `برای تأیید حذف دائمی «${name}»، عبارت «حذف دانش آموز» را وارد کنید:`
    );
    if (typedName?.trim() !== "حذف دانش آموز") {
      setMessage("حذف دانش‌آموز لغو شد.");
      return;
    }

    setDeletingStudentId(String(student.id));
    setMessage("");
    try {
      const { data, error } = await supabase.rpc("pz_delete_student", {
        p_student_id: student.id
      });
      if (error) throw error;
      if (reportStudentId === String(student.id)) setReportStudentId("");
      await Promise.all([loadStudents(), loadAttempts(), loadExamSessions()]);
      setMessage(`حساب «${name}» حذف شد؛ ${Number(data?.attempts_deleted ?? 0)} پاسخ تمرینی و ${Number(data?.exam_sessions_deleted ?? 0)} جلسه آزمون مرتبط نیز حذف شدند.`);
    } catch (error) {
      setMessage("حذف دانش‌آموز انجام نشد: " + (error?.message || "خطای نامشخص"));
    } finally {
      setDeletingStudentId(null);
    }
  }

  async function logout() {
    // از همین لحظه هیچ پاسخِ دیررسِ حساب قبلی نباید روی فرم ورود اثر بگذارد.
    authEpochRef.current += 1;
    questionsRequestRef.current += 1;
    setMessage("");
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;

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
      setMode("login");
      setEmail("");
      setPassword("");
      setSignupFirstName("");
      setSignupLastName("");
      setSignupMobile("");
      setQuestionsLoading(false);
      setAttemptsLoading(false);
      setExamSessionsLoading(false);
      setMessage("");
    } catch (error) {
      setMessage("خروج از حساب انجام نشد: " + (error?.message || "خطای ارتباطی"));
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

  // All records (active and archived) count towards the code summary.
  // Numeric codes are compared as BigInt so large codes do not lose precision.
  const lastRegisteredQuestion = questions.reduce((last, q) =>
    !last || BigInt(String(q.id)) > BigInt(String(last.id)) ? q : last, null);
  const highestNumericQuestionCode = questions.reduce((highest, q) => {
    const code = normalizeExcelText(q.question_code);
    if (!/^\d+$/.test(code)) return highest;
    const value = BigInt(code);
    return !highest || value > highest.value ? { value, code } : highest;
  }, null);
  const nextSuggestedQuestionCode = highestNumericQuestionCode
    ? (highestNumericQuestionCode.value + 1n).toString()
        .padStart(highestNumericQuestionCode.code.length, "0")
    : questions.length === 0 ? "1" : null;
  const newCodeNormalized = normalizeExcelText(newQuestion.question_code);
  const newCodeIsDuplicate = Boolean(newCodeNormalized) && questions.some(q =>
    String(q.id) !== String(editingQuestionId) &&
    normalizeExcelText(q.question_code) === newCodeNormalized
  );

  // فیلتر و صفحه‌بندی مدیریت بانک سؤال
  const teacherFilteredQuestions = questions.filter(q => {
    if (!showArchived && q.is_active === false) return false;
    const search = questionSearch.trim().toLowerCase();
    if (!search) return true;
    return [q.question_code, q.book, q.chapter, q.lesson, q.topic, q.statement]
      .some(value => String(value ?? "").toLowerCase().includes(search));
  });
  const filteredArchivedQuestions = teacherFilteredQuestions.filter(q => q.is_active === false);
  const selectedArchivedSet = new Set(selectedArchivedQuestionIds);
  const allFilteredArchivedSelected = filteredArchivedQuestions.length > 0 &&
    filteredArchivedQuestions.every(q => selectedArchivedSet.has(String(q.id)));
  const teacherQuestionPages = Math.max(1, Math.ceil(teacherFilteredQuestions.length / QUESTION_PAGE_SIZE));
  const pagedTeacherQuestions = teacherFilteredQuestions.slice(
    (questionPage - 1) * QUESTION_PAGE_SIZE,
    questionPage * QUESTION_PAGE_SIZE
  );

  useEffect(() => {
    setQuestionPage(1);
    setSelectedArchivedQuestionIds([]);
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


  // خروج از تمرین یا مرور، پاسخ‌های ذخیره‌شده را حذف نمی‌کند.
  // خروج از آزمون با لغو امن جلسه در سمت سرور انجام می‌شود.
  function cancelActivityAndReturnHome() {
    if (answerSaving || examAnswerSaving || examSubmitting || answerLockRef.current) return;
    if (screen === "exam") {
      cancelExam();
      return;
    }
    if (!window.confirm("فعالیت فعلی لغو شود و به صفحه اول بازگردید؟ پاسخ‌های ثبت‌شده محفوظ می‌مانند، اما ادامه این نوبت تمرین یا مرور از دست می‌رود.")) return;

    setExerciseQuestions([]);
    setCurrentIndex(0);
    setResults([]);
    setMistakes([]);
    setFeedback(null);
    setReviewRemaining([]);
    setReviewQueue([]);
    setReviewIndex(0);
    setReviewFeedback(null);
    setMessage("");
    setScreen("setup");
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
      <main className="page page--auth" dir="rtl">
        <header>
          <div className="mark">ز</div>
          <div>
            <h1>پرسمان زیست</h1>
            <p>سامانه تمرین جمله‌های درست و نادرست زیست‌شناسی</p>
          </div>
        </header>

        <section className="panel auth-panel">
          <div className="auth-intro"><span className="auth-eyebrow">مسیر یادگیری، یک سؤال در هر قدم</span></div>
          <h2>
            {mode === "login" ? "ورود به سامانه" : "ثبت‌نام دانش‌آموز"}
          </h2>

          <form onSubmit={authenticate} autoComplete="off">
            <label>
              ایمیل
              <input
                type="email"
                autoComplete="off"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </label>

            <label>
              گذرواژه
              <input
                type="password"
                autoComplete="off"
                value={password}
                onChange={e => setPassword(e.target.value)}
                minLength={6}
                required
              />
            </label>

            {mode === "signup" && <div className="student-signup-fields">
              <label>نام دانش‌آموز
                <input required maxLength={60} minLength={2} autoComplete="given-name"
                  value={signupFirstName} onChange={e => setSignupFirstName(e.target.value)} />
              </label>
              <label>نام خانوادگی دانش‌آموز
                <input required maxLength={60} minLength={2} autoComplete="family-name"
                  value={signupLastName} onChange={e => setSignupLastName(e.target.value)} />
              </label>
              <label>شماره موبایل دانش‌آموز
                <input required type="tel" inputMode="tel" dir="ltr" autoComplete="tel-national"
                  maxLength={16} placeholder="09123456789"
                  value={signupMobile} onChange={e => setSignupMobile(e.target.value)} />
              </label>
            </div>}

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
      <main className="page page--teacher" dir="rtl">
        <header className="teacher-top-header">
          <div className="mark">ز</div>
          <div>
            <h1>مرکز مدیریت پرسمان زیست</h1>
            <p>پنل دبیر · مدیریت آموزشی، دانش‌آموزان و گزارش‌ها</p>
          </div>
        </header>

        <section className="panel teacher-panel">
          <div className="teacher-panel-heading">
            <div>
              <span className="teacher-eyebrow">فضای مدیریت آموزشی</span>
              <h2>خوش آمدید، {profile.display_name}</h2>
              <p>ابزارهای سامانه در منوی کناری در دسترس شما هستند.</p>
            </div>
            <button type="button" className="teacher-panel-logout" onClick={logout}>خروج از حساب</button>
          </div>

          <div className="teacher-tabs" role="tablist" aria-label="بخش‌های پنل دبیر"
            onKeyDown={event => {
              const tabs = ["dashboard", "questions", "students", "reports", "issues"];
              const currentIndex = tabs.indexOf(teacherTab);
              let nextIndex;
              if (event.key === "ArrowLeft") nextIndex = (currentIndex + 1) % tabs.length;
              else if (event.key === "ArrowRight") nextIndex = (currentIndex + tabs.length - 1) % tabs.length;
              else if (event.key === "Home") nextIndex = 0;
              else if (event.key === "End") nextIndex = tabs.length - 1;
              else return;
              event.preventDefault();
              setTeacherTab(tabs[nextIndex]);
              const nextButton = event.currentTarget.querySelector(`[data-teacher-tab="${tabs[nextIndex]}"]`);
              nextButton?.focus();
            }}>
            {[
              ["dashboard", "داشبورد"],
              ["questions", "سؤال‌ها"],
              ["students", "دانش‌آموزان"],
              ["reports", "گزارش‌ها"],
              ["issues", "گزارش اشتباه"]
            ].map(([key, label]) => (
              <button type="button" role="tab" id={`teacher-tab-${key}`} key={key}
                data-teacher-tab={key}
                aria-selected={teacherTab === key}
                aria-controls={`teacher-panel-${key}`}
                tabIndex={teacherTab === key ? 0 : -1}
                className={teacherTab === key ? "teacher-tab is-active" : "teacher-tab"}
                onClick={() => setTeacherTab(key)}>
                <InterfaceIcon name={key} size={19} />
                <span>{label}</span>
              </button>
            ))}
          </div>

          {teacherTab === "dashboard" && (
            <section className="teacher-tab-content" id="teacher-panel-dashboard" role="tabpanel" aria-labelledby="teacher-tab-dashboard" tabIndex={0}>
              <div className="teacher-section-heading">
                <h3>نمای کلی سامانه</h3>
                <p>وضعیت آموزشی و فعالیت‌های ثبت‌شده در یک نگاه</p>
              </div>
              <div className="teacher-overview-grid">
                {[
                  ["کل دانش‌آموزان", students.length, `${students.filter(s => studentAccessState(s, todayISO) === "active").length} نفر با دسترسی فعال`],
                  ["سؤال‌های بانک", questions.length, `${questions.filter(q => q.is_active === false).length} سؤال بایگانی‌شده`],
                  ["پاسخ‌های تمرینی", attempts.length, `${attempts.filter(a => isTrue(a.is_correct)).length} پاسخ صحیح`],
                  ["آزمون‌های نهایی‌شده", examSessions.filter(s => s.status === "submitted").length, "گزارش جزئیات در زبانه گزارش‌ها"]
                ].map(([label, value, detail]) => (
                  <div className="teacher-overview-card" key={label}>
                    <span>{label}</span>
                    <strong>{Number(value).toLocaleString("fa-IR")}</strong>
                    <small>{detail}</small>
                  </div>
                ))}
              </div>
              <div className="teacher-overview-actions">
                <h3>دسترسی سریع</h3>
                <div>
                  <button type="button" onClick={() => setTeacherTab("questions")}>ثبت و مدیریت سؤال‌ها</button>
                  <button type="button" onClick={() => setTeacherTab("students")}>مدیریت دانش‌آموزان</button>
                  <button type="button" onClick={() => setTeacherTab("reports")}>گزارش‌ها و پرونده تحلیلی</button>
                  <button type="button" onClick={() => setTeacherTab("issues")}>گزارش اشتباهات سؤالات</button>
                </div>
              </div>
              <button type="button" className="teacher-refresh-button" disabled={questionsLoading || attemptsLoading || examSessionsLoading}
                onClick={() => { void Promise.all([loadStudents(), loadQuestions("teacher"), loadAttempts(), loadExamSessions()]); }}>
                به‌روزرسانی آمار
              </button>
            </section>
          )}

          {teacherTab === "questions" && (
            <section className="teacher-tab-content" id="teacher-panel-questions" role="tabpanel" aria-labelledby="teacher-tab-questions" tabIndex={0}>
              <div className="teacher-section-heading">
                <h3>مدیریت سؤال‌ها</h3>
                <p>ثبت سؤال، کدگذاری، ورود Excel، بایگانی و حذف گروهی</p>
              </div>

          <div style={{
            border: "1px solid #cce5d7", borderRadius: "14px", background: "#f1f9f4",
            padding: "16px", margin: "18px 0 24px"
          }} aria-label="راهنمای کد سؤال‌ها">
            <strong style={{ color: "#0b4b36", fontSize: "16px" }}>راهنمای کدگذاری سؤال‌ها</strong>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginTop: "12px" }}>
              {[
                ["آخرین کد ثبت‌شده", lastRegisteredQuestion?.question_code ?? "—"],
                ["بزرگ‌ترین کد عددی موجود", highestNumericQuestionCode?.code ?? "—"],
                ["کد عددی پیشنهادی بعدی", nextSuggestedQuestionCode ?? "—"]
              ].map(([label, value]) => (
                <div key={label} style={{
                  flex: "1 1 170px", minWidth: "0", padding: "10px 12px",
                  borderRadius: "10px", background: "#fff", border: "1px solid #dce8e1"
                }}>
                  <div style={{ color: "#64766e", fontSize: "12px" }}>{label}</div>
                  <div dir="ltr" style={{ color: "#0b4b36", fontSize: "22px", fontWeight: 800, textAlign: "right", wordBreak: "break-word" }}>
                    {questionsLoading && questions.length === 0 ? "در حال دریافت..." : value}
                  </div>
                </div>
              ))}
            </div>
            <p style={{ margin: "8px 0 0", fontSize: "12px", color: "#536a5e" }}>
              کدهای سؤال‌های فعال و بایگانی‌شده هر دو محاسبه می‌شوند؛ آخرین کد ثبت‌شده ممکن است با بزرگ‌ترین کد عددی متفاوت باشد.
            </p>
            <button type="button" onClick={() => loadQuestions("teacher")}
              disabled={questionsLoading} style={{ marginTop: "10px", fontSize: "12px", minHeight: "36px" }}>
              {questionsLoading ? "در حال به‌روزرسانی..." : "به‌روزرسانی کدها"}
            </button>
          </div>

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
              aria-invalid={newCodeIsDuplicate}
              required
            />
            {newCodeIsDuplicate && (
              <p role="alert" style={{ margin: "6px 0", color: "#a52c2c", fontWeight: 700, fontSize: "13px" }}>
                این کد سؤال قبلاً در بانک ثبت شده است (حتی اگر بایگانی باشد).
              </p>
            )}

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
              disabled={savingQuestion || newCodeIsDuplicate}
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

          {showArchived && filteredArchivedQuestions.length > 0 && (
            <div className="archived-bulk-actions">
              <label className="archived-bulk-actions__check">
                <input
                  type="checkbox"
                  checked={allFilteredArchivedSelected}
                  disabled={deletingArchivedQuestions}
                  onChange={event => {
                    const ids = filteredArchivedQuestions.map(q => String(q.id));
                    setSelectedArchivedQuestionIds(prev => event.target.checked
                      ? [...new Set([...prev, ...ids])]
                      : prev.filter(id => !ids.includes(id))
                    );
                  }}
                />
                انتخاب همه سؤال‌های بایگانی‌شده در نتایج جست‌وجو (تمام صفحه‌ها)
              </label>
              <p>
                <b>{selectedArchivedQuestionIds.length}</b> سؤال بایگانی‌شده انتخاب شده است.
              </p>
              <div className="archived-bulk-actions__buttons">
                <button
                  type="button"
                  className="danger-action"
                  disabled={deletingArchivedQuestions || selectedArchivedQuestionIds.length === 0}
                  onClick={() => deleteArchivedQuestions(selectedArchivedQuestionIds)}
                >
                  {deletingArchivedQuestions ? "در حال حذف..." : "حذف دائمی سؤال‌های انتخاب‌شده"}
                </button>
                <button
                  type="button"
                  className="secondary-action"
                  disabled={deletingArchivedQuestions || selectedArchivedQuestionIds.length === 0}
                  onClick={() => setSelectedArchivedQuestionIds([])}
                >
                  لغو انتخاب‌ها
                </button>
              </div>
              <p className="archived-bulk-actions__note">
                حذف دائمی قابل بازگشت نیست؛ پاسخ‌های مرتبط و جلسات آزمون دارای این سؤال‌ها نیز پاک می‌شوند.
              </p>
            </div>
          )}

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
                {q.is_active === false && (
                  <label className="archived-question-choice">
                    <input
                      type="checkbox"
                      checked={selectedArchivedSet.has(String(q.id))}
                      disabled={deletingArchivedQuestions}
                      onChange={event => setSelectedArchivedQuestionIds(prev =>
                        event.target.checked
                          ? [...new Set([...prev, String(q.id)])]
                          : prev.filter(id => id !== String(q.id))
                      )}
                    />
                    انتخاب سؤال برای حذف گروهی
                  </label>
                )}
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
                <button type="button" style={styles.action} disabled={deletingArchivedQuestions} onClick={() => editQuestion(q)}>
                  ویرایش
                </button>
                <button
                  type="button"
                  style={{ ...styles.action, background: q.is_active === false ? "#176b43" : "#8b3333", color: "white" }}
                  disabled={deletingArchivedQuestions || updatingQuestionId === q.id}
                  onClick={() => toggleQuestionActive(q)}
                >
                  {q.is_active === false ? "بازیابی سؤال" : "حذف از بانک فعال (بایگانی)"}
                </button>
                {q.is_active === false && (
                  <button
                    type="button"
                    className="danger-action"
                    disabled={deletingArchivedQuestions || updatingQuestionId === q.id}
                    onClick={() => deleteArchivedQuestions([String(q.id)])}
                  >
                    {deletingArchivedQuestions ? "در حال حذف..." : "حذف دائمی این سؤال"}
                  </button>
                )}
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

            </section>
          )}

          {teacherTab === "reports" && (
            <section className="teacher-tab-content" id="teacher-panel-reports" role="tabpanel" aria-labelledby="teacher-tab-reports" tabIndex={0}>
              <div className="teacher-section-heading">
                <h3>گزارش‌ها و پرونده تحلیلی</h3>
                <p>عملکرد فردی، تحلیل فصل و مبحث، نمودار پیشرفت و خروجی CSV</p>
              </div>
              <TeacherAnalytics
                students={students}
                questions={questions}
                attempts={attempts}
                examSessions={examSessions}
                todayISO={todayISO}
                selectedStudentId={reportStudentId}
                onStudentSelect={setReportStudentId}
                refreshing={questionsLoading || attemptsLoading || examSessionsLoading}
                onRefresh={() => {
                  void Promise.all([loadStudents(), loadQuestions("teacher"), loadAttempts(), loadExamSessions()]);
                }}
              />
              {/* آمارهای قدیمی در داشبورد یکپارچه شده‌اند؛ تاریخچه جلسات و خروجی CSV محفوظ است. */}
            </section>
          )}

          {teacherTab === "issues" && (
            <section className="teacher-tab-content" id="teacher-panel-issues" role="tabpanel" aria-labelledby="teacher-tab-issues" tabIndex={0}>
              <TeacherQuestionIssues />
            </section>
          )}

          {teacherTab === "students" && (
            <section className="teacher-tab-content" id="teacher-panel-students" role="tabpanel" aria-labelledby="teacher-tab-students" tabIndex={0}>
              <div className="teacher-section-heading">
                <h3>مدیریت دانش‌آموزان</h3>
                <p>تأیید حساب، تعیین دوره دسترسی، اطلاعات ثبت‌نامی و مشاهده پرونده تحلیلی</p>
                <button type="button" className="teacher-student-export" onClick={exportStudentRegistryExcel}
                  disabled={exportingStudentRegistry}>{exportingStudentRegistry ? "در حال آماده‌سازی اکسل..." : "دریافت اکسل اطلاعات ثبت‌نام دانش‌آموزان (.xlsx)"}</button>
              </div>

          <h3>درخواست‌های در انتظار تأیید</h3>

          {students.filter(s => !s.is_approved).length === 0
            ? <p>در حال حاضر دانش‌آموزی در انتظار تأیید نیست.</p>
            : students.filter(s => !s.is_approved).map(student => (
              <div className="student student-access-row" key={student.id}>
                <div className="teacher-student-identity">
                  <strong>{studentFullName(student)}</strong>
                  <span>نام: {student.first_name || "ثبت‌نشده"} | نام خانوادگی: {student.last_name || "ثبت‌نشده"}</span>
                  <span>موبایل: <b dir="ltr">{student.mobile || "ثبت‌نشده"}</b></span>
                  {!studentProfileComplete(student) && <span className="teacher-student-identity__incomplete">مشخصات ثبت‌نام ناقص است</span>}
                </div>
                <div className="student-management-actions">
                  <button
                    disabled={loading || Boolean(deletingStudentId) || !studentProfileComplete(student)}
                    title={!studentProfileComplete(student) ? "ابتدا دانش‌آموز باید مشخصاتش را تکمیل کند" : "تأیید دانش‌آموز"}
                    onClick={() => approveStudent(student.id)}
                  >
                    تأیید دانش‌آموز
                  </button>
                  <button type="button" className="teacher-profile-button" onClick={() => {
                    setReportStudentId(String(student.id));
                    setTeacherTab("reports");
                    window.scrollTo({ top: 0, behavior: "auto" });
                  }}>پرونده تحلیلی</button>
                  <button
                    type="button"
                    className="danger-action"
                    disabled={loading || Boolean(deletingStudentId)}
                    onClick={() => deleteStudent(student)}
                  >
                    {deletingStudentId === String(student.id) ? "در حال حذف..." : "حذف دانش‌آموز"}
                  </button>
                </div>
                <StudentAccessEditor
                  student={student} todayISO={todayISO}
                  disabled={loading || Boolean(deletingStudentId) || Boolean(savingStudentAccessId)}
                  onSave={saveStudentAccess}
                />
              </div>
            ))
          }

          <h3>دانش‌آموزان تأییدشده</h3>

          {students.filter(s => s.is_approved).map(student => (
            <div className="student student-access-row" key={student.id}>
              <div className="teacher-student-identity">
                <strong>{studentFullName(student)}</strong>
                <span>نام: {student.first_name || "ثبت‌نشده"} | نام خانوادگی: {student.last_name || "ثبت‌نشده"}</span>
                <span>موبایل: <b dir="ltr">{student.mobile || "ثبت‌نشده"}</b></span>
                {!studentProfileComplete(student) && <span className="teacher-student-identity__incomplete">مشخصات ثبت‌نام ناقص است</span>}
              </div>
              <div className="student-management-actions">
                <span>تأیید شده</span>
                <button type="button" className="teacher-profile-button" onClick={() => {
                  setReportStudentId(String(student.id));
                  setTeacherTab("reports");
                  window.scrollTo({ top: 0, behavior: "auto" });
                }}>پرونده تحلیلی</button>
                <button
                  type="button"
                  className="danger-action"
                  disabled={loading || Boolean(deletingStudentId)}
                  onClick={() => deleteStudent(student)}
                >
                  {deletingStudentId === String(student.id) ? "در حال حذف..." : "حذف دانش‌آموز"}
                </button>
              </div>
              <StudentAccessEditor
                student={student} todayISO={todayISO}
                disabled={loading || Boolean(deletingStudentId) || Boolean(savingStudentAccessId)}
                onSave={saveStudentAccess}
              />
            </div>
          ))}

            </section>
          )}
          {message && <p className="message teacher-panel-message" role="status">{message}</p>}
        </section>
      </main>
    );
  }

  // حتی حساب‌های تأییدشده قدیمی تا تکمیل مشخصات به هیچ بخشی از پنل نمی‌رسند.
  if (profile.role === "student" && !studentProfileComplete(profile)) {
    return <main className="page" dir="rtl">
      <header><div className="mark">ز</div><div><h1>پرسمان زیست</h1><p>مرحله ضروری ثبت‌نام</p></div></header>
      <section className="panel">
        <StudentIdentityForm profile={profile} required onSaved={() => loadProfile(user.id)} onLogout={logout}/>
      </section>
    </main>;
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

  // تاریخ شروع و پایان در سمت سرور نیز روی همه عملیات تمرین/آزمون کنترل می‌شود.
  if (profile.role === "student" && studentAccessState(profile, todayISO) !== "active" && profile.is_approved) {
    const notStarted = studentAccessState(profile, todayISO) === "future";
    return (
      <main className="page" dir="rtl">
        <header>
          <div className="mark">ز</div>
          <div><h1>پرسمان زیست</h1><p>وضعیت دسترسی دانش‌آموز</p></div>
        </header>
        <section className="panel">
          <h2>{notStarted ? "زمان دسترسی شما هنوز شروع نشده است" : "مدت دسترسی شما به پایان رسیده است"}</h2>
          <p>
            {notStarted ? "برای آغاز دوره آموزشی، منتظر تاریخ شروع تعیین‌شده توسط دبیر باشید." :
              "برای تمدید دوره دسترسی، با دبیر یا پشتیبان سامانه هماهنگ کنید."}
          </p>
          <p>شروع دوره: {gregorianISOToJalali(profile.access_start_date) || "بدون محدودیت"}</p>
          <p>پایان دوره: {gregorianISOToJalali(profile.access_end_date) || "بدون محدودیت"}</p>
          <p>پاسخ‌ها و کارنامه‌های قبلی شما حذف نشده‌اند.</p>
          <button type="button" onClick={() => loadProfile(user.id)}>بررسی مجدد وضعیت دسترسی</button>{" "}
          <button type="button" onClick={() => setScreen(current => current === "report" ? "setup" : "report")}>{screen === "report" ? "بستن کارنامه" : "مشاهده کارنامه قبلی"}</button>{" "}
          <button type="button" onClick={logout}>خروج از حساب</button>
          {screen === "report" && <StudentReport
            studentId={user.id} studentName={studentFullName(profile)} todayISO={todayISO}
            onBack={() => setScreen("setup")}
          />}
        </section>
      </main>
    );
  }

  if (profile.role === "student" && profile.is_approved) {
    const daysRemaining = daysUntilAccessEnds(todayISO, profile.access_end_date);
    const showAccessCountdown = daysRemaining !== null && daysRemaining >= 0 && daysRemaining <= 7;
    const currentQuestion = exerciseQuestions[currentIndex];
    const reviewQuestion = reviewQueue[reviewIndex];
    const currentExamQuestion = examQuestions[examIndex];

    return (
      <main className="page page--student" dir="rtl">
        <header className="student-header">
          <div className="mark">ز</div>
          <div>
            <h1>پرسمان زیست</h1>
            <p>فضای شخصی یادگیری و پیشرفت</p>
          </div>
          <button
            type="button"
            className="student-header__logout"
            onClick={() => {
              if (window.confirm("آیا می‌خواهید از حساب کاربری خارج شوید؟")) {
                logout();
              }
            }}
          >
            خروج از حساب
          </button>
        </header>

        <section className={`panel student-panel student-panel--${screen}`}>
          {(screen === "setup" || screen === "report") && <div className="student-welcome">
            <div>
              <span className="student-welcome__eyebrow">داشبورد شخصی شما</span>
              <h2>سلام، {studentFullName(profile)}!</h2>
              <p>با تمرین منظم، پیشرفت خودت را در هر فصل ببین.</p>
            </div>
            <div className="student-welcome__ornament" aria-hidden="true"><InterfaceIcon name="chart" size={38}/></div>
          </div>}
          {screen === "setup" && (
            <details className="student-identity-details"><summary>مشاهده یا ویرایش مشخصات من</summary><StudentIdentityForm profile={profile} onSaved={() => loadProfile(user.id)}/></details>
          )}

          {showAccessCountdown && (
            <aside className="access-countdown" role="status" aria-live="polite">
              <div className="access-countdown__count" aria-label={daysRemaining === 0 ? "آخرین روز دسترسی" : `${daysRemaining} روز باقی‌مانده`}>
                <strong>{daysRemaining.toLocaleString("fa-IR")}</strong>
                <span>{daysRemaining === 0 ? "روز پایانی" : "روز مانده"}</span>
              </div>
              <div className="access-countdown__details">
                <p className="access-countdown__title">
                  {daysRemaining === 0
                    ? "امروز آخرین روز دوره دسترسی شماست"
                    : `${daysRemaining.toLocaleString("fa-IR")} روز تا پایان دوره دسترسی شما باقی مانده است`}
                </p>
                <p className="access-countdown__description">
                  پایان دوره: <b>{gregorianISOToJalali(profile.access_end_date)}</b> — برای تمدید، با دبیر یا پشتیبان سامانه هماهنگ کنید.
                </p>
              </div>
            </aside>
          )}

          {(["exercise", "exam", "review"].includes(screen)) && (
            <div className="student-activity-exit" style={{ display: "flex", justifyContent: "flex-start", margin: "8px 0 18px" }}>
              <button
                type="button"
                className="secondary-action"
                onClick={cancelActivityAndReturnHome}
                disabled={answerSaving || examAnswerSaving || examSubmitting}
              >
                لغو و بازگشت به صفحه اول
              </button>
            </div>
          )}

          {(screen === "setup" || screen === "report") && (
            <nav className="student-report-nav" aria-label="بخش‌های پنل دانش‌آموز">
              <button type="button" className={screen === "setup" ? "is-active" : ""}
                aria-current={screen === "setup" ? "page" : undefined}
                onClick={() => setScreen("setup")}><InterfaceIcon name="questions" size={19}/> تمرین و آزمون</button>
              <button type="button" className={screen === "report" ? "is-active" : ""}
                aria-current={screen === "report" ? "page" : undefined}
                onClick={() => setScreen("report")}><InterfaceIcon name="reports" size={19}/> کارنامه هوشمند من</button>
            </nav>
          )}

          {screen === "report" && <StudentReport
            studentId={user.id} studentName={studentFullName(profile)} todayISO={todayISO}
            onBack={() => setScreen("setup")}
          />}

          {screen === "setup" && (
            <div className="student-setup-layout">
              <section className="student-setup-card student-setup-card--mode" aria-labelledby="student-mode-title">
                <div className="student-setup-title">
                  <span className="student-step">۰۱</span>
                  <div><h3 id="student-mode-title">نوع فعالیت را انتخاب کن</h3>
                    <p>تمرین برای یادگیری، آزمون برای سنجش آمادگی</p></div>
                </div>
                <fieldset className="student-mode-options">
                  <legend className="sr-only">نوع فعالیت</legend>
                  <label className={`student-mode-choice ${activityMode === "practice" ? "is-selected" : ""}`}>
                    <input type="radio" name="activityMode" value="practice"
                      checked={activityMode === "practice"} onChange={() => setActivityMode("practice")}/>
                    <span className="student-mode-choice__icon"><InterfaceIcon name="questions" size={24}/></span>
                    <span className="student-mode-choice__content"><strong>تمرین آموزشی</strong>
                      <small>نتیجه هر پاسخ را همان لحظه مشاهده می‌کنی.</small></span>
                  </label>
                  <label className={`student-mode-choice ${activityMode === "exam" ? "is-selected" : ""}`}>
                    <input type="radio" name="activityMode" value="exam"
                      checked={activityMode === "exam"} onChange={() => setActivityMode("exam")}/>
                    <span className="student-mode-choice__icon"><InterfaceIcon name="check" size={24}/></span>
                    <span className="student-mode-choice__content"><strong>آزمون</strong>
                      <small>پاسخ‌ها و نتیجه را پس از پایان آزمون می‌بینی.</small></span>
                  </label>
                </fieldset>
              </section>
              <section className="student-setup-card student-setup-card--filters" aria-labelledby="student-filters-title">
                <div className="student-setup-title">
                  <span className="student-step">۰۲</span>
                  <div><h3 id="student-filters-title">محدوده مطالعه را مشخص کن</h3>
                    <p>کتاب، فصل، گفتار و مبحث موردنظر را انتخاب کن.</p></div>
                </div>
                {questionsLoading ? (
                  <p role="status">در حال دریافت سؤال‌ها...</p>
                ) : (
                  <>
                    <div className="student-filter-grid">
                      <label>کتاب زیست
                        <select value={book} onChange={e => {
                          setBook(e.target.value); setChapter(""); setLesson(""); setTopic("");
                        }}>
                          <option value="">همه کتاب‌ها</option>
                          {books.map(v => <option key={v} value={v}>{v}</option>)}
                        </select>
                      </label>
                      <label>فصل
                        <select value={chapter} onChange={e => {
                          setChapter(e.target.value); setLesson(""); setTopic("");
                        }}>
                          <option value="">همه فصل‌ها</option>
                          {chapters.map(v => <option key={v} value={v}>{v}</option>)}
                        </select>
                      </label>
                      <label>گفتار
                        <select value={lesson} onChange={e => {
                          setLesson(e.target.value); setTopic("");
                        }}>
                          <option value="">همه گفتارها</option>
                          {lessons.map(v => <option key={v} value={v}>{v}</option>)}
                        </select>
                      </label>
                      <label>عنوان / مبحث
                        <select value={topic} onChange={e => setTopic(e.target.value)}>
                          <option value="">همه عنوان‌ها</option>
                          {topics.map(v => <option key={v} value={v}>{v}</option>)}
                        </select>
                      </label>
                    </div>
                    <div className="student-start-panel">
                      <div className="student-start-panel__details">
                        <span>سؤال‌های موجود در این محدوده</span>
                        <strong>{filteredQuestions.length.toLocaleString("fa-IR")} سؤال</strong>
                        <small>سؤال‌ها به‌صورت تصادفی و بدون تکرار انتخاب می‌شوند.</small>
                      </div>
                      <label className="student-count-choice">
                        {activityMode === "practice" ? "تعداد سؤال تمرین" : "تعداد سؤال آزمون"}
                        <input type="number" min="1" max={filteredQuestions.length} step="1"
                          value={questionCount} onChange={e => {
                            const value = e.target.value;
                            if (value === "") { setQuestionCount(""); return; }
                            const count = Number(value);
                            if (count > filteredQuestions.length) setQuestionCount(String(filteredQuestions.length));
                            else setQuestionCount(value);
                          }} placeholder="مثلاً ۲۰" />
                      </label>
                      <button type="button" className="student-start-button"
                        disabled={loading || filteredQuestions.length === 0 ||
                          !Number.isInteger(Number(questionCount)) || Number(questionCount) < 1 ||
                          Number(questionCount) > filteredQuestions.length}
                        onClick={activityMode === "practice" ? startExercise : startExam}>
                        {loading ? "در حال آماده‌سازی..." : activityMode === "practice" ? "شروع تمرین" : "شروع آزمون"}
                        {!loading && <InterfaceIcon name="arrow" size={19}/>} 
                      </button>
                    </div>
                  </>
                )}
              </section>
            </div>
          )}

          {screen === "exercise" && currentQuestion && (
            <>
              <div className="student-question-header">
                <h3>سؤال {currentIndex + 1} از {exerciseQuestions.length}</h3>
                <QuestionIssueButton key={`practice-${currentQuestion.id}`} question={currentQuestion} />
              </div>
              <div className="student-quiz-progress" aria-label={`پیشرفت تمرین: سؤال ${currentIndex + 1} از ${exerciseQuestions.length}`}>
                <progress max={exerciseQuestions.length} value={currentIndex + 1}/>
                <span>{Math.round(((currentIndex + 1) / exerciseQuestions.length) * 100).toLocaleString("fa-IR")}٪</span>
              </div>
              <ProtectedQuestionText style={styles.question}>
                {currentQuestion.statement}
              </ProtectedQuestionText>

              {!feedback ? (
                <>
                  <p>به نظر شما این جمله درست است یا غلط؟</p>

                  <button className="student-answer-button student-answer-button--true"
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

                  <button className="student-answer-button student-answer-button--false"
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
                  <ProtectedQuestionText>
                    <h3 style={{ color: feedback.correct ? "green" : "red" }}>
                      {feedback.correct
                        ? "آفرین! پاسخ شما درست است."
                        : "پاسخ شما نادرست است."}
                    </h3>
                  </ProtectedQuestionText>

                  {!feedback.correct && (
                    <ProtectedQuestionText style={styles.question}>
                      <p><b>پاسخ صحیح: {feedback.correctAnswer ? "درست" : "غلط"}</b></p>
                      <p>{feedback.correctAnswer
                        ? "این جمله صحیح است و نیازی به اصلاح ندارد."
                        : feedback.correction || "شکل صحیح جمله ثبت نشده است."}</p>
                    </ProtectedQuestionText>
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
              <div className="student-question-header">
                <h3>آزمون | سؤال {examIndex + 1} از {examQuestions.length}</h3>
                <QuestionIssueButton key={`exam-${currentExamQuestion.id}`} question={currentExamQuestion} />
              </div>
              <div className="student-quiz-progress" aria-label={`پیشرفت آزمون: سؤال ${examIndex + 1} از ${examQuestions.length}`}>
                <progress max={examQuestions.length} value={examIndex + 1}/>
                <span>{Math.round(((examIndex + 1) / examQuestions.length) * 100).toLocaleString("fa-IR")}٪</span>
              </div>
              <p>
                پاسخ‌های ثبت‌شده: {Object.keys(examAnswers).length} از {examQuestions.length}
              </p>
              <ProtectedQuestionText style={styles.question}>
                {currentExamQuestion.statement}
              </ProtectedQuestionText>
              <p>پاسخ خود را انتخاب کنید. درست یا غلط بودن پاسخ تا پایان آزمون نمایش داده نمی‌شود.</p>

              <button className="student-answer-button student-answer-button--true"
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
              <button className="student-answer-button student-answer-button--false"
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
                <React.Fragment key={item.id}>
                  <div className="student-question-header">
                    <span>سؤال {index + 1} | بررسی پاسخ</span>
                    <QuestionIssueButton question={item} />
                  </div>
                  <ProtectedQuestionText style={{ ...styles.question, marginTop: "12px" }}>
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
                  </ProtectedQuestionText>
                </React.Fragment>
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
                  <div className="student-question-header">
                    <p>سؤال {reviewIndex + 1} از {reviewQueue.length} | باقی‌مانده برای اصلاح: {reviewRemaining.length}</p>
                    {reviewQuestion && <QuestionIssueButton key={`review-${reviewQuestion.id}`} question={reviewQuestion} />}
                  </div>
                  <div className="student-quiz-progress" aria-label={`پیشرفت مرور: سؤال ${reviewIndex + 1} از ${reviewQueue.length}`}>
                    <progress max={reviewQueue.length} value={reviewIndex + 1}/>
                    <span>{Math.round(((reviewIndex + 1) / reviewQueue.length) * 100).toLocaleString("fa-IR")}٪</span>
                  </div>
                  <ProtectedQuestionText style={styles.question}>
                    {reviewQuestion.statement}
                  </ProtectedQuestionText>

                  {!reviewFeedback ? (
                    <>
                      <button className="student-answer-button student-answer-button--true"
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

                      <button className="student-answer-button student-answer-button--false"
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
                      <ProtectedQuestionText>
                        <h3 style={{ color: reviewFeedback.correct ? "green" : "red" }}>
                          {reviewFeedback.correct
                            ? "آفرین! این سؤال از فهرست اشتباهات حذف شد."
                            : "هنوز پاسخ صحیح نیست؛ سؤال در فهرست باقی می‌ماند."}
                        </h3>
                      </ProtectedQuestionText>

                      {!reviewFeedback.correct && (
                        <ProtectedQuestionText style={styles.question}>
                          <p><b>پاسخ صحیح: {reviewFeedback.correctAnswer ? "درست" : "غلط"}</b></p>
                          <p>{reviewFeedback.correctAnswer
                            ? "این جمله صحیح است و نیازی به اصلاح ندارد."
                            : reviewFeedback.correction || "شکل صحیح جمله ثبت نشده است."}</p>
                        </ProtectedQuestionText>
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
