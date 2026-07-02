const express = require("express");
const { pool } = require("../db/pool");
const { listStudents, getStudent } = require("../services/students");
const { formatReviewAsNotes } = require("../services/formatReview");

const router = express.Router();

function requireSecret(req, res, next) {
  const secret = req.headers["x-internal-secret"];
  if (secret !== process.env.INTERNAL_WEBHOOK_SECRET) {
    console.log(`Rejected request to ${req.path}: missing or incorrect x-internal-secret header (got: ${secret ? "a value" : "nothing"})`);
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
}

// Lovable portal calls this to populate the student selector dropdown.
// Proxies GET /api/students on the existing dialled-call-reviews service -
// no direct database access to that service at all.
router.get("/students", requireSecret, async (req, res) => {
  try {
    const students = await listStudents();
    res.json({ students });
  } catch (err) {
    console.error("Failed to fetch students:", err);
    res.status(502).json({ error: "failed to fetch student roster from existing service" });
  }
});

// Lovable portal calls this to render the edit form.
router.get("/draft/:transcriptId", requireSecret, async (req, res) => {
  const { transcriptId } = req.params;

  const transcript = await pool.query(
    `SELECT * FROM transcripts WHERE id = $1`,
    [transcriptId]
  );
  if (transcript.rows.length === 0) {
    return res.status(404).json({ error: "transcript not found" });
  }

  const draft = await pool.query(
    `SELECT * FROM drafts WHERE transcript_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [transcriptId]
  );
  if (draft.rows.length === 0) {
    return res.status(404).json({ error: "draft not found" });
  }

  res.json({
    transcript: transcript.rows[0],
    draft: draft.rows[0],
  });
});

// Lovable portal calls this when Ryan hits "Submit" after editing.
// studentId must match student_channels.student_id on the existing service.
// callDate, callLink, videoReviewLink are optional passthroughs to
// /api/review-complete on the existing service.
router.post("/submit", requireSecret, async (req, res) => {
  const { transcriptId, draftId, finalOutput, studentId, callDate, callLink, videoReviewLink } = req.body;

  if (!transcriptId || !draftId || !finalOutput || !studentId) {
    return res.status(400).json({
      error: "transcriptId, draftId, finalOutput, and studentId are required",
    });
  }

  const draftRow = await pool.query(`SELECT * FROM drafts WHERE id = $1`, [draftId]);
  if (draftRow.rows.length === 0) {
    return res.status(404).json({ error: "draft not found" });
  }

  const transcriptRow = await pool.query(`SELECT * FROM transcripts WHERE id = $1`, [transcriptId]);
  const callType = transcriptRow.rows[0]?.call_type;

  // Resolve the student from the existing service's roster. Fail loudly now
  // if this student_id doesn't exist, rather than the existing service
  // silently 404ing later.
  const student = await getStudent(studentId);
  if (!student) {
    return res.status(404).json({ error: `No student found for student_id ${studentId}` });
  }

  // 1. Store the before/after pair - this is what feeds the lessons loop
  const editResult = await pool.query(
    `INSERT INTO call_review_edits (draft_id, transcript_id, draft_output, final_output, student_name, call_type)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [draftId, transcriptId, draftRow.rows[0].draft_output, finalOutput, student.name, callType]
  );

  // 2. Forward the finished review to the EXISTING Call Review service's
  // real endpoint - POST /api/review-complete, auth'd with x-api-key,
  // notes as a flattened plain-text block (that service splits it into
  // Discord embed chunks itself, it doesn't expect structured JSON).
  try {
    const notifyResponse = await fetch(`${process.env.CALL_REVIEW_SERVICE_BASE_URL}/api/review-complete`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.CALL_REVIEW_SERVICE_API_KEY,
      },
      body: JSON.stringify({
        student_id: student.student_id,
        student_name: student.name,
        call_date: callDate || undefined,
        notes: formatReviewAsNotes(finalOutput),
        call_link: callLink || undefined,
        video_review_link: videoReviewLink || undefined,
      }),
    });

    if (!notifyResponse.ok) {
      const body = await notifyResponse.text().catch(() => "");
      throw new Error(`Existing service responded ${notifyResponse.status}: ${body}`);
    }
  } catch (err) {
    console.error("Failed to forward to existing Call Review service:", err);
    return res.status(502).json({
      error: "saved locally but failed to notify existing call review service",
      editId: editResult.rows[0].id,
    });
  }

  res.json({ success: true, editId: editResult.rows[0].id, postedToChannel: student.channel_id });
});

module.exports = router;
