"""
routers/resume.py – Resume upload & AI question generation endpoint.

Flow:
  1. Accept PDF or DOCX file upload (multipart/form-data)
  2. Extract text using pdfplumber (PDF) or python-docx (DOCX)
  3. Keyword-based NLP skill extraction with frequency scoring
  4. Call OpenAI to generate 10 tailored technical questions for detected skills
  5. Create an interview session in MongoDB (real user ID if logged in)
  6. Store the questions in session_questions collection
  7. Return { session_id, questions_count, skills_detected, generated_questions }
"""

import json
import re
import tempfile
import traceback
from collections import Counter
from pathlib import Path

from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId
from openai import AsyncOpenAI

from app.config import get_settings
from app.database import get_database
from app.models.interview import InterviewSession
from app.utils.auth import get_current_user_optional

settings = get_settings()
router = APIRouter(prefix="/resume", tags=["Resume"])


# ── Text extraction ────────────────────────────────────────────────────────────

def _extract_pdf_text(path: str) -> str:
    """Extract text from PDF using pdfplumber (best quality), fallback to PyPDF2."""
    try:
        import pdfplumber
        text = ""
        with pdfplumber.open(path) as pdf:
            for page in pdf.pages:
                text += (page.extract_text() or "") + "\n"
        if text.strip():
            return text.strip()
    except Exception:
        pass

    try:
        import PyPDF2
        with open(path, "rb") as f:
            reader = PyPDF2.PdfReader(f)
            return "\n".join(page.extract_text() or "" for page in reader.pages).strip()
    except Exception:
        pass

    try:
        from pdfminer.high_level import extract_text as _extract
        return _extract(path).strip()
    except Exception:
        pass

    raise RuntimeError("No PDF parsing library available.")


def _extract_docx_text(path: str) -> str:
    """Extract text from DOCX using python-docx."""
    from docx import Document
    doc = Document(path)
    return "\n".join(p.text for p in doc.paragraphs).strip()


def _extract_text(path: str, filename: str) -> str:
    """Dispatch to the right extractor based on file extension."""
    ext = Path(filename).suffix.lower()
    if ext == ".pdf":
        return _extract_pdf_text(path)
    elif ext in (".docx", ".doc"):
        return _extract_docx_text(path)
    raise RuntimeError(f"Unsupported file type: {ext}")


# ── Skill keyword database ─────────────────────────────────────────────────────

# Map canonical skill name → list of patterns to match (case-insensitive)
SKILL_PATTERNS: dict[str, list[str]] = {
    # Languages
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
    # Frontend
    "React":        [r"\bReact\b", r"\bReactJS\b"],
    "Angular":      [r"\bAngular\b"],
    "Vue":          [r"\bVue\b", r"\bVue\.?js\b"],
    "Next.js":      [r"\bNext\.?js\b"],
    "HTML":         [r"\bHTML\b"],
    "CSS":          [r"\bCSS\b"],
    "Tailwind":     [r"\bTailwind\b"],
    "Redux":        [r"\bRedux\b"],
    # Backend
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
    # AI/ML
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
    # Data
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
    Scan resume text for known skills using regex patterns.
    Returns skills sorted by frequency (most mentioned first), up to 20.
    """
    counts: Counter = Counter()
    text_lower = text  # keep original case for display; match case-insensitively

    for skill, patterns in SKILL_PATTERNS.items():
        total_hits = 0
        for pattern in patterns:
            hits = re.findall(pattern, text_lower, re.IGNORECASE)
            total_hits += len(hits)
        if total_hits > 0:
            counts[skill] = total_hits

    # Sort by frequency descending, return top 20
    sorted_skills = [skill for skill, _ in counts.most_common(20)]
    return sorted_skills


# ── LLM question generation ────────────────────────────────────────────────────

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
    """Generate 10 tailored technical questions using detected skills."""
    client = AsyncOpenAI(api_key=settings.openai_api_key)

    skills_str = ", ".join(skills) if skills else "General software engineering"
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
        temperature=0.6,
        max_tokens=1200,
        response_format={"type": "json_object"},
    )

    raw = response.choices[0].message.content.strip()
    parsed = json.loads(raw)

    questions = parsed.get("questions", [])
    if not isinstance(questions, list) or len(questions) < 1:
        raise ValueError("LLM did not return a valid questions list")
    return questions[:15]   # cap at 15


# ── Default fallback questions ─────────────────────────────────────────────────

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


# ── Route ──────────────────────────────────────────────────────────────────────

@router.post("/upload")
async def upload_resume(
    resume: UploadFile = File(...),
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: dict | None = Depends(get_current_user_optional),
):
    """
    Accept a PDF or DOCX resume, extract skills, generate 10 tailored questions,
    create an interview session, and return session_id + skills_detected + generated_questions.
    """
    filename = resume.filename or "resume"
    ext = Path(filename).suffix.lower()

    # ── Validate file type ────────────────────────────────────────────────────
    allowed_mimes = ("pdf", "docx", "doc",
                     "vnd.openxmlformats-officedocument.wordprocessingml.document",
                     "msword")
    is_valid_mime = resume.content_type and any(m in resume.content_type.lower() for m in allowed_mimes)
    is_valid_ext  = ext in (".pdf", ".docx", ".doc")

    if not is_valid_mime and not is_valid_ext:
        raise HTTPException(status_code=400, detail="Only PDF or DOCX files are accepted.")

    # ── Validate file size (10 MB) ────────────────────────────────────────────
    contents = await resume.read()
    if len(contents) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File size must be under 10 MB.")

    # ── Save to temp file ─────────────────────────────────────────────────────
    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        tmp.write(contents)
        tmp_path = tmp.name

    try:
        resume_text = _extract_text(tmp_path, filename)
    except Exception as e:
        print(f"[Resume] Text extraction error: {e}")
        resume_text = ""
    finally:
        Path(tmp_path).unlink(missing_ok=True)

    if not resume_text.strip():
        resume_text = "No text could be extracted from the resume."

    # ── Extract skills using keyword matching ─────────────────────────────────
    skills_detected = extract_skills(resume_text)
    print(f"[Resume] Detected {len(skills_detected)} skills: {skills_detected}")

    # ── Generate questions via OpenAI ─────────────────────────────────────────
    questions_list = DEFAULT_QUESTIONS[:]
    if settings.openai_api_key and settings.openai_api_key not in ("", "sk-your-key-here"):
        try:
            questions_list = await _generate_questions(skills_detected, resume_text)
        except Exception as e:
            print(f"[Resume] OpenAI question generation failed: {e}\n{traceback.format_exc()}")
            print("[Resume] Falling back to default questions.")

    # ── Create interview session ───────────────────────────────────────────────
    if current_user:
        user_doc = await db["users"].find_one({"_id": ObjectId(current_user["sub"])})
        candidate_id    = current_user["sub"]
        candidate_name  = user_doc["full_name"] if user_doc else filename
        candidate_email = user_doc["email"] if user_doc else "anonymous@interview.local"
    else:
        candidate_id    = "anonymous"
        candidate_name  = filename
        candidate_email = "anonymous@interview.local"

    session = InterviewSession(
        candidate_id=candidate_id,
        candidate_name=candidate_name,
        candidate_email=candidate_email,
        role_applied="Resume Upload Session",
    )
    result = await db["sessions"].insert_one(session.model_dump())
    session_id = str(result.inserted_id)

    # ── Store questions in session_questions collection ───────────────────────
    for i, q_text in enumerate(questions_list):
        await db["session_questions"].insert_one({
            "text": q_text,
            "category": "tailored",
            "difficulty": "medium",
            "expected_duration_seconds": 120,
            "session_id": session_id,
            "order": i + 1,
        })

    print(f"[Resume] Session {session_id} created — {len(questions_list)} questions, skills: {skills_detected}")

    return {
        "session_id":          session_id,
        "questions_count":     len(questions_list),
        "skills_detected":     skills_detected,
        "generated_questions": questions_list,
        "message":             "Session created with tailored interview questions",
    }
