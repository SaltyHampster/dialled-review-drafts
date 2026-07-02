const BASE_URL = process.env.CALL_REVIEW_SERVICE_BASE_URL;
const API_KEY = process.env.CALL_REVIEW_SERVICE_API_KEY;

// Small in-memory cache so the portal dropdown and repeated submits don't
// hammer the existing service's DB on every request. Good enough for a
// roster that changes rarely; restart the service if you need an
// immediate refresh after adding a student.
let cache = { data: null, fetchedAt: 0 };
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function listStudents({ forceRefresh = false } = {}) {
  const isFresh = Date.now() - cache.fetchedAt < CACHE_TTL_MS;
  if (!forceRefresh && cache.data && isFresh) {
    return cache.data;
  }

  const response = await fetch(`${BASE_URL}/api/students`, {
    headers: { "x-api-key": API_KEY },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch students from existing service: ${response.status}`);
  }

  const students = await response.json();
  cache = { data: students, fetchedAt: Date.now() };
  return students;
}

async function getStudent(studentId) {
  const students = await listStudents();
  return students.find((s) => s.student_id === studentId) || null;
}

module.exports = { listStudents, getStudent };
