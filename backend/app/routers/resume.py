"""
routers/resume.py – Resume upload and AI-powered tailored question generation endpoint.

URL prefix: /resume
Endpoint:   POST /resume/upload

Full processing flow:
  1. Receive PDF or DOCX file via multipart/form-data
  2. Validate file type (PDF or DOCX) and size (max 10 MB)
  3. Save to a temp file on disk (required by PDF/DOCX parsing libraries)
  4. Extract all readable text from the resume:
       • PDF  → pdfplumber (best quality) → PyPDF2 → pdfminer (fallbacks)
       • DOCX → python-docx
  5. Scan the text for known technical skills using regex patterns (SKILL_PATTERNS dict)
     Each skill has one or more regex patterns; hits are counted → top 20 skills returned
  6. Send the skills + resume text snippet to GPT → generates 10 tailored questions
     Falls back to DEFAULT_QUESTIONS if OpenAI is not configured or the call fails
  7. Create an InterviewSession in MongoDB
     (linked to the logged-in user, or "anonymous" if not authenticated)
  8. Store the generated questions in the session_questions collection
     (linked to the new session_id by order)
  9. Return: { session_id, questions_count, skills_detected, generated_questions }
     The frontend uses session_id to navigate to /candidate/interview/:sessionId

Authentication: uses get_current_user_optional — works for both logged-in users
and anonymous users (anonymous users get candidate_id = "anonymous").
"""

import json
import re
import tempfile                       # for creating a temporary file on disk
import traceback
from collections import Counter       # Counter: a dict-like object for counting frequencies
from pathlib import Path

from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId
from openai import AsyncOpenAI

from app.config import get_settings
from app.database import get_database
from app.models.interview import InterviewSession
from app.utils.auth import get_current_user_optional  # allows both logged-in and anonymous users

settings = get_settings()
router = APIRouter(prefix="/resume", tags=["Resume"])


# ── Text extraction utilities ─────────────────────────────────────────────────

def _extract_pdf_text(path: str) -> str:
    """
    Attempts to extract all text from a PDF using three different libraries,
    trying each in order and falling back to the next if one fails.

    Priority order (best quality → most compatible):
      1. pdfplumber: best for complex layouts, tables, multi-column PDFs
      2. PyPDF2: lighter weight, good for simple text-only PDFs
      3. pdfminer: lowest-level, most compatible but output quality varies

    Raises RuntimeError if all three libraries fail (unlikely in practice).
    """
    # ── Try pdfplumber first (best quality) ───────────────────────────────────
    try:
        import pdfplumber
        text = ""
        with pdfplumber.open(path) as pdf:
            for page in pdf.pages:
                # extract_text() can return None if a page has no extractable text
                text += (page.extract_text() or "") + "\n"
        if text.strip():  # only use this result if we got actual text
            return text.strip()
    except Exception:
        pass  # fall through to next library

    # ── Try PyPDF2 as fallback ────────────────────────────────────────────────
    try:
        import PyPDF2
        with open(path, "rb") as f:
            reader = PyPDF2.PdfReader(f)
            return "\n".join(page.extract_text() or "" for page in reader.pages).strip()
    except Exception:
        pass

    # ── Try pdfminer as last resort ───────────────────────────────────────────
    try:
        from pdfminer.high_level import extract_text as _extract
        return _extract(path).strip()
    except Exception:
        pass

    raise RuntimeError("No PDF parsing library available.")


def _extract_docx_text(path: str) -> str:
    """
    Extracts text from a DOCX file using python-docx.
    Iterates through all paragraphs in the document and joins their text.
    Note: This extracts body text only — text in headers, footers, and tables
    inside text boxes may not be captured.
    """
    from docx import Document
    doc = Document(path)
    return "\n".join(p.text for p in doc.paragraphs).strip()


def _extract_text(path: str, filename: str) -> str:
    """
    Dispatcher: chooses the right text extractor based on the file extension.
    Raises RuntimeError for unsupported file types.
    """
    ext = Path(filename).suffix.lower()  # e.g. ".pdf", ".docx", ".doc"
    if ext == ".pdf":
        return _extract_pdf_text(path)
    elif ext in (".docx", ".doc"):
        return _extract_docx_text(path)
    raise RuntimeError(f"Unsupported file type: {ext}")


# ── Skill keyword database ─────────────────────────────────────────────────────
# Maps a canonical skill name → list of regex patterns that match it.
# Multiple patterns handle variations: e.g. "React" / "ReactJS" / "react.js"
# All patterns are matched case-insensitively using re.IGNORECASE.
SKILL_PATTERNS: dict[str, list[str]] = {
    # Programming Languages
    "C":            [r"\bC\b"],
    "C++":          [r"C\+\+", r"CPP\b", r"cpp\b"],
    "C#":           [r"C#", r"csharp"],
    "Java":         [r"\bJava\b"],
    "Python":       [r"\bPython\b"],
    "JavaScript":   [r"\bJavaScript\b", r"\bJS\b"],
    "TypeScript":   [r"\bTypeScript\b", r"\bTS\b"],
    "Go":           [r"\bGolang\b", r"\bGo\b"],
    "Rust":         [r"\bRust\b"],
    "Swift":        [r"\bSwift\b"],
    "Kotlin":       [r"\bKotlin\b"],
    "PHP":          [r"\bPHP\b"],
    "Ruby":         [r"\bRuby\b"],
    "Scala":        [r"\bScala\b"],
    "R":            [r"\bR\b"],
    "MATLAB":       [r"\bMATLAB\b"],
    "Bash":         [r"\bBash\b", r"\bShell\b"],
    "SQL":          [r"\bSQL\b"],
    # Frontend Frameworks & Tools
    "React":        [r"\bReact\b", r"\bReactJS\b"],
    "Angular":      [r"\bAngular\b"],
    "Vue":          [r"\bVue\b", r"\bVue\.?js\b"],
    "Next.js":      [r"\bNext\.?js\b"],
    "HTML":         [r"\bHTML\b"],
    "CSS":          [r"\bCSS\b"],
    "Tailwind":     [r"\bTailwind\b"],
    "Redux":        [r"\bRedux\b"],
    # Backend Frameworks
    "Node.js":      [r"\bNode\.?js\b", r"\bNodeJS\b"],
    "Express":      [r"\bExpress(\.?js)?\b"],
    "FastAPI":      [r"\bFastAPI\b"],
    "Django":       [r"\bDjango\b"],
    "Flask":        [r"\bFlask\b"],
    "Spring":       [r"\bSpring\b"],
    "Laravel":      [r"\bLaravel\b"],
    "GraphQL":      [r"\bGraphQL\b"],
    "REST":         [r"\bREST\b", r"\bRESTful\b"],
    # Databases
    "MongoDB":      [r"\bMongoDB\b"],
    "PostgreSQL":   [r"\bPostgres(SQL)?\b"],
    "MySQL":        [r"\bMySQL\b"],
    "Redis":        [r"\bRedis\b"],
    "Elasticsearch":[r"\bElasticsearch\b", r"\bElastic\b"],
    "Firebase":     [r"\bFirebase\b"],
    "Supabase":     [r"\bSupabase\b"],
    # AI / Machine Learning
    "Machine Learning": [r"\bMachine\s+Learning\b", r"\bML\b"],
    "Deep Learning":    [r"\bDeep\s+Learning\b", r"\bDL\b"],
    "AI":               [r"\bArtificial\s+Intelligence\b", r"\bAI\b"],
    "Neural Networks":  [r"\bNeural\s+Net(work)?s?\b"],
    "NLP":              [r"\bNLP\b", r"\bNatural\s+Language\s+Processing\b"],
    "Computer Vision":  [r"\bComputer\s+Vision\b", r"\bCV\b"],
    "TensorFlow":       [r"\bTensorFlow\b"],
    "PyTorch":          [r"\bPyTorch\b"],
    "Scikit-learn":     [r"\bscikit[-\s]learn\b", r"\bsklearn\b"],
    "Keras":            [r"\bKeras\b"],
    "Pandas":           [r"\bPandas\b"],
    "NumPy":            [r"\bNumPy\b"],
    "OpenCV":           [r"\bOpenCV\b"],
    "LangChain":        [r"\bLangChain\b"],
    "LLMs":             [r"\bLLM\b", r"\bLarge\s+Language\s+Model\b"],
    # Cloud & DevOps
    "AWS":          [r"\bAWS\b", r"\bAmazon\s+Web\s+Services\b"],
    "GCP":          [r"\bGCP\b", r"\bGoogle\s+Cloud\b"],
    "Azure":        [r"\bAzure\b"],
    "Docker":       [r"\bDocker\b"],
    "Kubernetes":   [r"\bKubernetes\b", r"\bK8s\b"],
    "CI/CD":        [r"\bCI/CD\b", r"\bGitHub\s+Actions\b", r"\bJenkins\b"],
    "Linux":        [r"\bLinux\b"],
    "Git":          [r"\bGit\b"],
    # Data Engineering & BI
    "Spark":        [r"\bApache\s+Spark\b", r"\bPySpark\b"],
    "Kafka":        [r"\bApache\s+Kafka\b", r"\bKafka\b"],
    "Hadoop":       [r"\bHadoop\b"],
    "Tableau":      [r"\bTableau\b"],
    "Power BI":     [r"\bPower\s+BI\b"],
    # Mobile
    "React Native": [r"\bReact\s+Native\b"],
    "Flutter":      [r"\bFlutter\b"],
    "Android":      [r"\bAndroid\b"],
    "iOS":          [r"\biOS\b"],
}


def extract_skills(text: str) -> list[str]:
    """
    Scans the resume text for all known technical skills using regex matching.

    Algorithm:
      1. For each skill, try all its regex patterns against the text
      2. Count total pattern hits (more mentions → higher frequency)
      3. Sort skills by frequency (most mentioned first)
      4. Return the top 20 skills

    The frequency sort puts the candidate's primary skills first, which helps
    the LLM prioritize those skills when generating questions.

    re.IGNORECASE makes matching case-insensitive:
      "python" and "Python" and "PYTHON" all match the Python pattern.
    """
    counts: Counter = Counter()

    for skill, patterns in SKILL_PATTERNS.items():
        total_hits = 0
        for pattern in patterns:
            # re.findall() returns a list of all non-overlapping matches
            hits = re.findall(pattern, text, re.IGNORECASE)
            total_hits += len(hits)
        if total_hits > 0:
            counts[skill] = total_hits  # store total occurrence count for this skill

    # most_common(20) returns the 20 skills with the highest counts
    sorted_skills = [skill for skill, _ in counts.most_common(20)]
    return sorted_skills


# ── LLM question generation ────────────────────────────────────────────────────

# System prompt that instructs GPT on its persona and strict output rules.
# The GPT model plays the role of a senior technical interviewer.
SYSTEM_PROMPT = """\
You are a senior technical interviewer conducting a screening interview.
You will be given a structured list of skills detected from a candidate's resume,
followed by the full resume text for additional context (projects, experience, education).

YOUR TASK:
Generate exactly 10 interview questions based STRICTLY on the detected skills.

STRICT RULES:
1. Every single question MUST reference at least one skill from the detected skills list.
2. Distribute questions across the skills — do NOT ask 10 questions about one skill.
3. For EACH programming language or framework in the list, ask at least one deep technical question.
   Examples of good questions:
   - "Explain pointers and pointer arithmetic in C. When would you use them?"
   - "What is the difference between JVM, JRE, and JDK in Java?"
   - "How does the Virtual DOM work in React and why does it improve performance?"
   - "What is the difference between supervised and unsupervised learning in Machine Learning?"
4. If the resume mentions specific projects, include at least 1–2 project-based questions.
5. Include a mix of: conceptual, problem-solving, and experience-based questions.
6. Questions must be appropriate for a software engineer candidate interview.
7. Do NOT ask generic questions like "Tell me about yourself" — every question must be skill-specific.

OUTPUT FORMAT (strict):
Return ONLY a valid JSON object with exactly this shape — no markdown, no explanation:
{
  "questions": ["Question 1?", "Question 2?", ..., "Question 10?"]
}
"""


async def _generate_questions(skills: list[str], resume_text: str) -> list[str]:
    """
    Calls GPT to generate 10 tailored interview questions from the detected skills.

    Sends:
      - Skills list (sorted by frequency): the primary signal for question generation
      - First 5000 characters of resume text: provides project and experience context

    response_format={"type": "json_object"}: forces GPT to return valid JSON
    (available in models that support JSON mode, e.g. gpt-4o-mini, gpt-4o).

    Returns: list of up to 15 question strings (capped to prevent runaway responses)
    """
    client = AsyncOpenAI(api_key=settings.openai_api_key)

    # Format skills as a comma-separated string; fallback if no skills detected
    skills_str = ", ".join(skills) if skills else "General software engineering"
    # Truncate resume text to avoid using too many GPT tokens (expensive)
    truncated_resume = resume_text[:5000]

    user_message = (
        f"DETECTED SKILLS (sorted by frequency in resume):\n{skills_str}\n\n"
        f"RESUME TEXT (for project/experience context):\n{truncated_resume}\n\n"
        f"Generate exactly 10 technical interview questions covering the detected skills above."
    )

    response = await client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user",   "content": user_message},
        ],
        temperature=0.6,                            # some creativity while staying relevant
        max_tokens=1200,                            # enough for 10 questions in JSON
        response_format={"type": "json_object"},    # enforce valid JSON output
    )

    raw = response.choices[0].message.content.strip()
    parsed = json.loads(raw)

    # Validate the structure: must be a list with at least one question
    questions = parsed.get("questions", [])
    if not isinstance(questions, list) or len(questions) < 1:
        raise ValueError("LLM did not return a valid questions list")
    return questions[:15]  # cap at 15 questions max


# ── Default fallback questions ─────────────────────────────────────────────────
# Used when OpenAI is not configured or the GPT call fails.
# These are general software engineering questions that apply to any candidate.
DEFAULT_QUESTIONS = [
    "Tell us about yourself and your technical background.",
    "Explain the difference between stack and heap memory.",
    "What is object-oriented programming? Describe its four pillars.",
    "How does version control with Git work? What is the difference between merge and rebase?",
    "Describe a challenging technical project you worked on and how you solved the main problem.",
    "What is the difference between SQL and NoSQL databases?",
    "Explain what REST APIs are and how they work.",
    "What is time complexity? Give examples of O(n) and O(n²) algorithms.",
    "How would you approach debugging a production bug you've never seen before?",
    "Where do you see your technical skills evolving in the next 2 years?",
]


# ── Resume upload route ────────────────────────────────────────────────────────

@router.post("/upload")
async def upload_resume(
    resume: UploadFile = File(...),              # the uploaded file from the frontend
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: dict | None = Depends(get_current_user_optional),  # None if not logged in
):
    """
    Accept a PDF or DOCX resume, extract skills, generate tailored questions,
    create an interview session, and return the session ID.

    Returns:
        {
            "session_id":          str,
            "questions_count":     int,
            "skills_detected":     list[str],
            "generated_questions": list[str],
            "message":             str
        }
    """
    filename = resume.filename or "resume"
    ext = Path(filename).suffix.lower()  # file extension: ".pdf", ".docx", or ".doc"

    # ── Validate file type ─────────────────────────────────────────────────────
    # Check both the MIME type (from browser) and the file extension (from filename)
    # because some browsers report incorrect MIME types for DOCX files
    allowed_mimes = ("pdf", "docx", "doc",
                     "vnd.openxmlformats-officedocument.wordprocessingml.document",
                     "msword")
    is_valid_mime = resume.content_type and any(m in resume.content_type.lower() for m in allowed_mimes)
    is_valid_ext  = ext in (".pdf", ".docx", ".doc")

    if not is_valid_mime and not is_valid_ext:
        raise HTTPException(status_code=400, detail="Only PDF or DOCX files are accepted.")

    # ── Validate file size (10 MB max) ─────────────────────────────────────────
    # Read the entire file into memory first so we can check the size
    contents = await resume.read()
    if len(contents) > 10 * 1024 * 1024:  # 10 MB in bytes
        raise HTTPException(status_code=400, detail="File size must be under 10 MB.")

    # ── Save to temp file on disk ──────────────────────────────────────────────
    # pdfplumber and python-docx require a real file path, not a file object
    # delete=False means the file persists after the `with` block (we delete it manually)
    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        tmp.write(contents)
        tmp_path = tmp.name  # e.g. "/tmp/tmpXYZ123.pdf"

    # ── Extract text from the resume ───────────────────────────────────────────
    try:
        resume_text = _extract_text(tmp_path, filename)
    except Exception as e:
        print(f"[Resume] Text extraction error: {e}")
        resume_text = ""  # continue with empty text (will use default questions)
    finally:
        # Always clean up the temp file, even if extraction throws an exception
        Path(tmp_path).unlink(missing_ok=True)

    if not resume_text.strip():
        # If no text was extracted (e.g. scanned image-only PDF), use placeholder
        resume_text = "No text could be extracted from the resume."

    # ── Extract skills using keyword regex matching ────────────────────────────
    skills_detected = extract_skills(resume_text)
    print(f"[Resume] Detected {len(skills_detected)} skills: {skills_detected}")

    # ── Generate tailored interview questions via OpenAI ──────────────────────
    # Start with default questions as the fallback
    questions_list = DEFAULT_QUESTIONS[:]
    if settings.openai_api_key and settings.openai_api_key not in ("", "sk-your-key-here"):
        try:
            # Try to generate better, tailored questions using GPT
            questions_list = await _generate_questions(skills_detected, resume_text)
        except Exception as e:
            # Log the error and fall back to default questions — don't fail the whole request
            print(f"[Resume] OpenAI question generation failed: {e}\n{traceback.format_exc()}")
            print("[Resume] Falling back to default questions.")

    # ── Create an interview session in MongoDB ─────────────────────────────────
    # Use the logged-in user's info if available; otherwise use "anonymous"
    if current_user:
        user_doc = await db["users"].find_one({"_id": ObjectId(current_user["sub"])})
        candidate_id    = current_user["sub"]
        candidate_name  = user_doc["full_name"] if user_doc else filename
        candidate_email = user_doc["email"] if user_doc else "anonymous@interview.local"
    else:
        # Anonymous user: no authentication required for this route
        candidate_id    = "anonymous"
        candidate_name  = filename     # use the resume filename as a display name
        candidate_email = "anonymous@interview.local"

    session = InterviewSession(
        candidate_id=candidate_id,
        candidate_name=candidate_name,
        candidate_email=candidate_email,
        role_applied="Resume Upload Session",  # placeholder since no specific role was given
    )
    result = await db["sessions"].insert_one(session.model_dump())
    session_id = str(result.inserted_id)

    # ── Store questions in the session_questions collection ────────────────────
    # Each question is stored as a separate document linked to this session by session_id
    # 'order' field ensures questions appear in the same order GPT generated them
    for i, q_text in enumerate(questions_list):
        await db["session_questions"].insert_one({
            "text":                     q_text,
            "category":                 "tailored",   # custom questions from the resume
            "difficulty":               "medium",
            "expected_duration_seconds": 120,         # suggested 2 minutes per answer
            "session_id":               session_id,
            "order":                    i + 1,        # 1-indexed ordering
        })

    print(f"[Resume] Session {session_id} created — {len(questions_list)} questions, skills: {skills_detected}")

    return {
        "session_id":          session_id,
        "questions_count":     len(questions_list),
        "skills_detected":     skills_detected,
        "generated_questions": questions_list,
        "message":             "Session created with tailored interview questions",
    }
