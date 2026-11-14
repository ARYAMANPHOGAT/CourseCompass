"""Skill and career taxonomy.

The source dataset has no explicit "skills" column. Course skills are therefore
*detected* by matching the transparent keyword patterns below against the course's
own title, category, description and syllabus text. Nothing is invented: a skill is
attached to a course only when one of its patterns literally appears in that course's
text. The patterns are application configuration, not course metadata.

Career goals map to taxonomy skills and dataset categories, and define roadmap stages.
They describe learning directions only - they do not guarantee employment or competency.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

SKILL_GROUPS: dict[str, str] = {
    "data": "Data & AI",
    "programming": "Programming",
    "cloud": "Cloud & Infrastructure",
    "security": "Security & Networks",
    "design": "Design & UX",
    "business": "Business & Management",
    "science": "Math & Science",
    "communication": "Communication & Career",
}


@dataclass(frozen=True)
class Skill:
    id: str
    label: str
    group: str
    patterns: tuple[str, ...]
    case_sensitive: tuple[str, ...] = ()


SKILLS: list[Skill] = [
    # Data & AI
    Skill("excel", "Excel & Spreadsheets", "data", (r"\bexcel\b", r"spreadsheet", r"\bvba\b")),
    Skill("sql", "SQL & Databases", "data", (r"\bsql\b", r"\bmysql\b", r"\bdatabases?\b", r"\bnosql\b", r"dynamodb")),
    Skill("data-analysis", "Data Analysis", "data", (r"data analy", r"\banalytics?\b", r"data-driven", r"analy[sz]e data")),
    Skill("data-visualization", "Data Visualization", "data", (r"visuali[sz]", r"\btableau\b", r"dashboards?\b")),
    Skill("statistics", "Statistics & Probability", "data", (r"statistic", r"probabilit", r"regression", r"hypothesis test", r"experimentation")),
    Skill(
        "r-programming",
        "R Programming",
        "data",
        (r"\brstudio\b", r"\br programming\b"),
        case_sensitive=(r"\b(?:with|using|in) R\b",),
    ),
    Skill("data-science", "Data Science", "data", (r"data scien",)),
    Skill("big-data", "Big Data", "data", (r"big data", r"\bhadoop\b", r"\bspark\b")),
    Skill(
        "machine-learning",
        "Machine Learning & AI",
        "data",
        (r"machine learning", r"deep learning", r"neural network", r"\bnlp\b", r"natural language processing",
         r"\bmlops\b", r"artificial intelligence", r"\bai\b", r"chatbot"),
    ),
    # Programming
    Skill("python", "Python", "programming", (r"\bpython\b",)),
    Skill("javascript", "JavaScript", "programming", (r"javascript", r"\breact\b")),
    Skill(
        "web-development",
        "Web Development",
        "programming",
        (r"\bhtml\b", r"\bcss\b", r"web develop", r"front-end", r"back-end", r"full stack", r"\bphp\b", r"web design"),
    ),
    Skill("algorithms", "Algorithms & Data Structures", "programming", (r"algorithm", r"data structure")),
    Skill(
        "software-engineering",
        "Software Engineering",
        "programming",
        (r"software engineer", r"software develop", r"\bgit\b", r"github", r"software requirement", r"software product"),
    ),
    Skill(
        "devops",
        "DevOps & Reliability",
        "programming",
        (r"devops", r"continuous delivery", r"continuous integration", r"ci/cd", r"site reliability", r"infrastructure as code", r"deployment manager"),
    ),
    Skill("game-development", "Game Development", "programming", (r"\bunity\b", r"\bunreal\b", r"game design", r"game develop", r"video game")),
    Skill("c-family", "C / C++ / C#", "programming", (r"\bc\+\+", r"\bc#", r"c-programming", r"\bc programming\b")),
    # Cloud & infrastructure
    Skill("cloud-computing", "Cloud Computing", "cloud", (r"\bcloud\b",)),
    Skill("google-cloud", "Google Cloud", "cloud", (r"google cloud", r"\bgcp\b", r"compute engine", r"kubernetes engine", r"\banthos\b")),
    Skill("aws", "AWS", "cloud", (r"\baws\b", r"amazon web services", r"dynamodb")),
    Skill("kubernetes", "Containers & Kubernetes", "cloud", (r"kubernetes", r"\bcontainers?\b", r"\bdocker\b", r"service mesh")),
    Skill("linux", "Linux & Command Line", "cloud", (r"\blinux\b", r"\bunix\b", r"\bbash\b", r"command[ -]line")),
    Skill("operating-systems", "Operating Systems", "cloud", (r"operating systems?", r"sistem operasi", r"\bwindows\b")),
    Skill(
        "it-support",
        "IT Support & Troubleshooting",
        "cloud",
        (r"technical support", r"\bit support\b", r"troubleshoot", r"help desk", r"helpdesk", r"\bhardware\b",
         r"suporte t[ée]cnico", r"dukungan teknis"),
    ),
    Skill("it-automation", "IT Automation & Scripting", "cloud", (r"automat", r"scripting")),
    # Security & networks
    Skill("cybersecurity", "Cybersecurity", "security", (r"cyber", r"\bsecurity\b", r"\bsscp\b", r"seguran[çc]a", r"keamanan")),
    Skill("network-security", "Network Security", "security", (r"firewall", r"intrusion", r"network security", r"\bvpn\b", r"pare-feu")),
    Skill("cryptography", "Cryptography & Blockchain", "security", (r"cryptograph", r"encryption", r"bitcoin", r"blockchain", r"cryptocurrenc", r"\bnft\b")),
    Skill(
        "networking",
        "Computer Networking",
        "security",
        (r"computer network", r"\bnetworking\b", r"tcp/ip", r"\btcp", r"\bdns\b", r"\brouting\b", r"\bcisco\b",
         r"packet", r"subnet", r"\bredes\b", r"jaringan", r"\bvpc\b", r"load balanc"),
    ),
    Skill("risk-compliance", "Risk & Compliance", "security", (r"compliance", r"risk management", r"governance", r"corruption")),
    # Design & UX
    Skill("ux-design", "UX Design", "design", (r"\bux\b", r"user experience", r"usability", r"user[- ]centered")),
    Skill("ui-design", "UI & Interaction Design", "design", (r"\bui\b", r"user interfaces\b", r"interface design", r"interaction design", r"visual design")),
    Skill("prototyping", "Wireframing & Prototyping", "design", (r"prototyp", r"wirefram", r"storyboard", r"mockups?", r"\bfigma\b", r"adobe xd")),
    Skill("user-research", "User Research", "design", (r"user research", r"usability stud", r"\bpersonas?\b", r"empathi[sz]e")),
    Skill("graphic-design", "Graphic Design", "design", (r"graphic design", r"typography", r"illustrator", r"image-?making")),
    Skill("design-thinking", "Design Thinking", "design", (r"design thinking",)),
    # Business & management
    Skill("project-management", "Project Management", "business", (r"project manag", r"project initiation", r"scheduling", r"budgeting", r"proje y[öo]netim")),
    Skill("agile", "Agile & Scrum", "business", (r"\bagile\b", r"\bscrum\b", r"kanban", r"lean startup")),
    Skill("product-management", "Product Management", "business", (r"product manag", r"product owner", r"hypothesis-driven")),
    Skill("business-strategy", "Business Strategy", "business", (r"business strateg", r"business models?", r"competitive advantage", r"digital transformation")),
    Skill("marketing", "Marketing & Customer Analytics", "business", (r"marketing", r"customer analytics", r"advertis")),
    Skill("leadership", "Leadership & Negotiation", "business", (r"leadership", r"remote team", r"negotiat", r"influenc")),
    Skill("customer-service", "Customer Service", "business", (r"customer service", r"customer support", r"client needs")),
    # Math & science
    Skill(
        "mathematics",
        "Mathematics",
        "science",
        (r"mathemat", r"calculus", r"algebra", r"differential equation", r"\bmatri(?:x|ces)\b", r"fibonacci", r"matem[áa]ticas"),
    ),
    Skill("physics", "Physics", "science", (r"physics", r"relativity", r"quantum", r"spacecraft", r"kinematic", r"tomography", r"fluid", r"finite element")),
    Skill("astronomy", "Astronomy & Space", "science", (r"astronom", r"\bastro", r"black holes?", r"universe", r"planet", r"other earths")),
    Skill("chemistry", "Chemistry", "science", (r"chemistr",)),
    Skill("research-methods", "Research Methods", "science", (r"research method", r"quantitative method", r"research design", r"\bresearcher\b", r"scientific method")),
    Skill("simulation", "Simulation & Modelling", "science", (r"simulat", r"modell?ing", r"numerical method")),
    # Communication & career
    Skill(
        "communication",
        "Communication & Presenting",
        "communication",
        (r"communication skills", r"communicate", r"communicating", r"presenting", r"storytelling", r"public speaking",
         r"\bspeaking\b", r"communication strateg", r"business communication"),
    ),
    Skill("english", "English Language", "communication", (r"english communication", r"learn(?:ing)? english", r"english for")),
    Skill("career-development", "Career Development", "communication", (r"\bcareer", r"job search", r"\bresumes?\b", r"\bportfolio\b")),
]

SKILL_BY_ID: dict[str, Skill] = {s.id: s for s in SKILLS}

_COMPILED: dict[str, list[re.Pattern[str]]] = {
    s.id: [re.compile(p, re.IGNORECASE) for p in s.patterns] + [re.compile(p) for p in s.case_sensitive]
    for s in SKILLS
}


def detect_skills(title: str, body: str, max_skills: int = 8, category: str | None = None) -> list[str]:
    """Return skill ids whose patterns appear in the course text, strongest first.

    Evidence score = 3 x title hits + 2 x category hits + min(body hits, 6). A skill is
    attached only when the score is at least 2, so a single passing mention deep in a
    long syllabus is not enough. Ties are broken alphabetically for determinism.
    """
    title = title or ""
    body = body or ""
    category = category or ""
    scores: dict[str, float] = {}
    for skill_id, patterns in _COMPILED.items():
        title_hits = sum(len(p.findall(title)) for p in patterns)
        category_hits = sum(len(p.findall(category)) for p in patterns)
        body_hits = sum(len(p.findall(body)) for p in patterns)
        score = 3.0 * title_hits + 2.0 * category_hits + min(body_hits, 6)
        if score >= 2:
            scores[skill_id] = score
    ranked = sorted(scores.items(), key=lambda kv: (-kv[1], kv[0]))
    return [skill_id for skill_id, _ in ranked[:max_skills]]


def skill_label(skill_id: str) -> str:
    skill = SKILL_BY_ID.get(skill_id)
    return skill.label if skill else skill_id


@dataclass(frozen=True)
class RoadmapStage:
    id: str
    title: str
    description: str
    skills: tuple[str, ...]


@dataclass(frozen=True)
class CareerGoal:
    id: str
    label: str
    description: str
    skills: tuple[str, ...]
    categories: tuple[str, ...]
    stages: tuple[RoadmapStage, ...] = field(default_factory=tuple)


CAREER_GOALS: list[CareerGoal] = [
    CareerGoal(
        "data-analyst",
        "Data Analyst",
        "Turn raw data into decisions using spreadsheets, SQL, statistics and visualization.",
        ("data-analysis", "excel", "sql", "data-visualization", "statistics", "r-programming", "python"),
        ("Data Analysis", "Business Essentials", "Probability and Statistics"),
        (
            RoadmapStage("da-1", "Data foundations", "Learn to ask good questions of data and work in spreadsheets.", ("data-analysis", "excel")),
            RoadmapStage("da-2", "Query & visualize", "Pull data with SQL and communicate it visually.", ("sql", "data-visualization")),
            RoadmapStage("da-3", "Statistical analysis", "Describe uncertainty and test ideas with statistics.", ("statistics", "r-programming")),
            RoadmapStage("da-4", "Programming for analysis", "Automate analysis with Python and data-science tooling.", ("python", "data-science")),
        ),
    ),
    CareerGoal(
        "data-scientist",
        "Data Scientist / ML Engineer",
        "Build predictive models with Python, mathematics, statistics and machine learning.",
        ("python", "machine-learning", "statistics", "mathematics", "data-science", "sql", "big-data"),
        ("Machine Learning", "Data Analysis", "Math and Logic"),
        (
            RoadmapStage("ds-1", "Python & data basics", "Get fluent with Python and the data-science workflow.", ("python", "data-science")),
            RoadmapStage("ds-2", "Math & statistics", "Linear algebra, calculus and statistics behind ML.", ("mathematics", "statistics")),
            RoadmapStage("ds-3", "Machine learning", "Train, evaluate and interpret machine-learning models.", ("machine-learning",)),
            RoadmapStage("ds-4", "Production & scale", "Ship models and work with large datasets.", ("big-data", "devops")),
        ),
    ),
    CareerGoal(
        "cloud-engineer",
        "Cloud Engineer",
        "Design, deploy and operate infrastructure on public cloud platforms.",
        ("cloud-computing", "google-cloud", "aws", "kubernetes", "networking", "linux", "devops"),
        ("Cloud Computing", "Networking"),
        (
            RoadmapStage("ce-1", "Cloud foundations", "Core cloud concepts and Linux administration.", ("cloud-computing", "linux")),
            RoadmapStage("ce-2", "Platform services", "Hands-on with Google Cloud and AWS services.", ("google-cloud", "aws")),
            RoadmapStage("ce-3", "Networking & containers", "Cloud networking, containers and Kubernetes.", ("networking", "kubernetes")),
            RoadmapStage("ce-4", "Reliability & DevOps", "Automate delivery and run reliable systems.", ("devops",)),
        ),
    ),
    CareerGoal(
        "it-support",
        "IT Support Specialist",
        "Keep people and systems running: troubleshooting, operating systems, networks and automation.",
        ("it-support", "operating-systems", "networking", "linux", "python", "it-automation", "customer-service", "cybersecurity"),
        ("Support and Operations", "Networking", "Security"),
        (
            RoadmapStage("it-1", "Support fundamentals", "Troubleshooting and customer-focused support.", ("it-support", "customer-service")),
            RoadmapStage("it-2", "Systems & networks", "Operating systems, hardware and networking basics.", ("operating-systems", "networking")),
            RoadmapStage("it-3", "Automation", "Script repetitive IT tasks with Python.", ("python", "it-automation")),
            RoadmapStage("it-4", "Security basics", "Protect users and systems.", ("cybersecurity",)),
        ),
    ),
    CareerGoal(
        "cybersecurity-analyst",
        "Cybersecurity Analyst",
        "Defend systems and networks, manage risk and respond to threats.",
        ("cybersecurity", "network-security", "networking", "linux", "cryptography", "risk-compliance", "operating-systems"),
        ("Security", "Computer Security and Networks", "Networking"),
        (
            RoadmapStage("cy-1", "IT & network basics", "How networks and operating systems work.", ("networking", "operating-systems")),
            RoadmapStage("cy-2", "Security fundamentals", "Threats, controls and security concepts.", ("cybersecurity",)),
            RoadmapStage("cy-3", "Defensive operations", "Firewalls, monitoring and Linux hardening.", ("network-security", "linux")),
            RoadmapStage("cy-4", "Governance & cryptography", "Risk, compliance and cryptographic foundations.", ("risk-compliance", "cryptography")),
        ),
    ),
    CareerGoal(
        "ux-designer",
        "UX / UI Designer",
        "Research user needs and design usable, delightful interfaces.",
        ("ux-design", "user-research", "prototyping", "ui-design", "graphic-design", "design-thinking"),
        ("Design and Product", "Music and Art"),
        (
            RoadmapStage("ux-1", "UX foundations", "The user-centred design process and design thinking.", ("ux-design", "design-thinking")),
            RoadmapStage("ux-2", "User research", "Personas, interviews and usability studies.", ("user-research",)),
            RoadmapStage("ux-3", "Wireframes & prototypes", "Turn ideas into testable prototypes.", ("prototyping",)),
            RoadmapStage("ux-4", "Visual & interface design", "Interface patterns, typography and visual craft.", ("ui-design", "graphic-design")),
        ),
    ),
    CareerGoal(
        "software-developer",
        "Software / Web Developer",
        "Write, test and ship software and web applications.",
        ("python", "javascript", "web-development", "algorithms", "software-engineering", "sql", "devops", "c-family"),
        ("Software Development", "Mobile and Web Development", "Algorithms"),
        (
            RoadmapStage("sd-1", "Programming fundamentals", "Core programming with Python or JavaScript.", ("python", "javascript")),
            RoadmapStage("sd-2", "Web development", "HTML, CSS and full-stack web apps.", ("web-development",)),
            RoadmapStage("sd-3", "CS foundations", "Algorithms and data structures.", ("algorithms",)),
            RoadmapStage("sd-4", "Engineering practice", "Databases, DevOps and professional practice.", ("software-engineering", "devops", "sql")),
        ),
    ),
    CareerGoal(
        "product-project-manager",
        "Product / Project Manager",
        "Plan and deliver products and projects with agile methods and clear communication.",
        ("project-management", "agile", "product-management", "communication", "leadership", "design-thinking"),
        ("Leadership and Management", "Design and Product", "Business Essentials"),
        (
            RoadmapStage("pm-1", "Project foundations", "Scope, schedule and budget projects.", ("project-management",)),
            RoadmapStage("pm-2", "Agile delivery", "Iterative delivery with agile practices.", ("agile",)),
            RoadmapStage("pm-3", "Product thinking", "Discover what to build and why.", ("product-management", "design-thinking")),
            RoadmapStage("pm-4", "Leading people", "Lead teams and communicate with impact.", ("leadership", "communication")),
        ),
    ),
    CareerGoal(
        "network-engineer",
        "Network Engineer",
        "Build and secure the networks that connect systems on-premises and in the cloud.",
        ("networking", "network-security", "cloud-computing", "google-cloud", "linux", "it-automation", "operating-systems"),
        ("Networking", "Computer Security and Networks", "Cloud Computing"),
        (
            RoadmapStage("ne-1", "Networking basics", "Protocols, layers and addressing.", ("networking",)),
            RoadmapStage("ne-2", "Systems", "Linux and operating-system administration.", ("linux", "operating-systems")),
            RoadmapStage("ne-3", "Cloud networking", "Networking on cloud platforms.", ("google-cloud", "cloud-computing")),
            RoadmapStage("ne-4", "Secure & automate", "Network security and automation.", ("network-security", "it-automation")),
        ),
    ),
    CareerGoal(
        "business-analyst",
        "Business & Marketing Analyst",
        "Use data and business judgement to improve marketing and strategy decisions.",
        ("excel", "data-analysis", "marketing", "business-strategy", "sql", "data-visualization", "communication"),
        ("Business Essentials", "Marketing", "Business Strategy", "Data Analysis"),
        (
            RoadmapStage("ba-1", "Spreadsheet skills", "Excel for business analysis.", ("excel",)),
            RoadmapStage("ba-2", "Analysis", "Analytical methods and SQL.", ("data-analysis", "sql")),
            RoadmapStage("ba-3", "Marketing & strategy", "Customer and marketing analytics; strategy.", ("marketing", "business-strategy")),
            RoadmapStage("ba-4", "Communicate insights", "Visualize and present findings.", ("data-visualization", "communication")),
        ),
    ),
    CareerGoal(
        "game-developer",
        "Game Developer",
        "Program interactive games with modern engines, math and physics.",
        ("game-development", "c-family", "python", "mathematics", "physics", "graphic-design"),
        ("Software Development", "Music and Art"),
        (
            RoadmapStage("gd-1", "Programming basics", "C# / C++ or Python fundamentals.", ("c-family", "python")),
            RoadmapStage("gd-2", "Game engines", "Build games in Unity or Unreal.", ("game-development",)),
            RoadmapStage("gd-3", "Math & physics for games", "Vectors, matrices and motion.", ("mathematics", "physics")),
            RoadmapStage("gd-4", "Art & design", "Visual design for games.", ("graphic-design",)),
        ),
    ),
    CareerGoal(
        "science-researcher",
        "Science & Research",
        "Explore physics, astronomy and quantitative research methods.",
        ("research-methods", "mathematics", "physics", "astronomy", "statistics", "simulation", "chemistry", "python"),
        ("Physics and Astronomy", "Research Methods", "Math and Logic", "Chemistry"),
        (
            RoadmapStage("sr-1", "Research foundations", "How research is designed and conducted.", ("research-methods",)),
            RoadmapStage("sr-2", "Quantitative toolkit", "Mathematics and statistics for science.", ("mathematics", "statistics")),
            RoadmapStage("sr-3", "Domain science", "Physics, astronomy and chemistry.", ("physics", "astronomy", "chemistry")),
            RoadmapStage("sr-4", "Computational methods", "Simulation and scientific Python.", ("simulation", "python")),
        ),
    ),
]

CAREER_BY_ID: dict[str, CareerGoal] = {c.id: c for c in CAREER_GOALS}

LEVELS = ["beginner", "intermediate", "advanced"]
DURATION_BUCKETS = ["short", "medium", "long", "extended"]
DURATION_BUCKET_LABELS = {
    "short": "Short (under 10 hours)",
    "medium": "Medium (10-40 hours)",
    "long": "Long (40+ hours or 1-3 months)",
    "extended": "Extended (more than 3 months)",
}
CONTENT_TYPES = {
    "course": "Course",
    "specialization": "Specialization",
    "professional_certificate": "Professional Certificate",
    "guided_project": "Guided Project",
}
