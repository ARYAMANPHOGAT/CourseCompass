import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AlertCircle,
  ArrowUpRight,
  Award,
  Bookmark,
  BookmarkCheck,
  Columns3,
  History,
  Plus,
  Star,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { api } from "../api/client";
import type { FeedbackKind } from "../api/types";
import { CourseArt } from "../components/CourseArt";
import { Rating } from "../components/CourseCard";
import { EnrollDialog } from "../components/LearningDialogs";
import { ScoreBreakdown } from "../components/ScoreBreakdown";
import { ScoreDial } from "../components/ScoreDial";
import { SimilarCourses } from "../components/SimilarCourses";
import { Badge, Button, LinkButton } from "../components/ui/primitives";
import { BlockSkeleton, EmptyState, ErrorState } from "../components/ui/states";
import { useAppData, useCourseActions, useUiPrefs } from "../hooks/AppContext";
import { useAsync } from "../hooks/useAsync";
import { durationLabel, EXCLUSION_LABEL, formatDate, LEVEL_LABEL, priceLabel } from "../lib/format";

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="border-b border-line/60 py-2.5 last:border-0">
      <dt className="text-xs text-faint">{label}</dt>
      <dd className="mt-0.5 text-sm text-ink">{value}</dd>
    </div>
  );
}

export default function CourseDetail() {
  const { id = "" } = useParams();
  const { version } = useAppData();
  const actions = useCourseActions();
  const { compareIds } = useUiPrefs();
  const detail = useAsync(() => api.course(id), [id, version]);
  const [enrollOpen, setEnrollOpen] = useState(false);

  if (detail.error) {
    return detail.error.message.includes("No course") ? (
      <EmptyState title="Course not found" body={detail.error.message} action={<LinkButton to="/discover">Browse the catalog</LinkButton>} />
    ) : (
      <ErrorState message={detail.error.message} onRetry={() => void detail.reload()} />
    );
  }
  if (!detail.data) return <BlockSkeleton rows={5} />;

  const { course, personalization: p, user, link } = detail.data;
  const fb = user.feedback;
  const inCompare = compareIds.includes(course.id);
  const sendFeedback = async (kind: FeedbackKind) => {
    if (fb?.kind === kind) await actions.clearFeedback(course.id);
    else await actions.feedback(course.id, kind);
  };

  return (
    <article>
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted">
        <Link to="/discover">Discover</Link>
        <span className="mx-2 text-faint">/</span>
        <span className="text-ink">{course.category ?? "Course"}</span>
      </nav>

      <header className="surface overflow-hidden">
        <div className="grid lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="p-6 sm:p-8">
            <div className="flex flex-wrap gap-2">
              {course.content_type_label && <Badge tone="violet">{course.content_type_label}</Badge>}
              {course.source === "sample" && <Badge tone="amber">Sample record, not a real course</Badge>}
              {user.enrollment_state && <Badge tone="cyan">{user.enrollment_state === "completed" ? "Completed" : "In My Learning"}</Badge>}
            </div>
            <h1 className="mt-4 text-balance font-display text-2xl font-semibold leading-tight sm:text-3xl">{course.title}</h1>
            <p className="mt-2 text-muted">{course.provider ?? "Provider not listed in source data"}</p>
            <div className="mt-4 flex flex-wrap items-center gap-4">
              <Rating value={course.rating} />
              <span className="text-xs text-faint">Review count not available in the dataset</span>
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              {!user.enrollment_state && (
                <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setEnrollOpen(true)}>
                  Add to My Learning
                </Button>
              )}
              {user.enrollment_state && (
                <LinkButton to="/learning" variant="cyan">
                  Open in My Learning
                </LinkButton>
              )}
              <Button
                variant="secondary"
                icon={user.wishlisted ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
                onClick={() => void (user.wishlisted ? actions.unsave(course.id) : actions.save(course.id))}
              >
                {user.wishlisted ? "Saved" : "Save"}
              </Button>
              <Button variant="secondary" icon={<Columns3 className="h-4 w-4" />} onClick={() => actions.compare(course.id)}>
                {inCompare ? "In comparison" : "Compare"}
              </Button>
              {link.url && (
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-10 items-center gap-2 rounded-md border border-line px-4 text-sm font-semibold text-ink no-underline hover:border-line-strong hover:no-underline"
                >
                  View on Coursera
                  <ArrowUpRight className="h-4 w-4" aria-hidden />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              )}
            </div>
            <p className="mt-2 text-2xs text-faint">{link.note}</p>
          </div>
          <CourseArt course={course} className="min-h-[220px] w-full" />
        </div>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-8">
          <section aria-labelledby="about">
            <h2 id="about" className="section-title">About this course</h2>
            <p className="mt-3 max-w-prose whitespace-pre-line text-pretty leading-relaxed text-ink/90">
              {course.description ?? "The source data has no description for this listing."}
            </p>
          </section>

          {course.skill_labels.length > 0 && (
            <section aria-labelledby="skills">
              <h2 id="skills" className="section-title">Skills mentioned</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {course.skill_labels.map((s) => (
                  <Badge key={s} tone={p.explanation.new_skills.includes(s) ? "violet" : p.explanation.known_skills.includes(s) ? "mint" : "neutral"}>
                    {s}
                  </Badge>
                ))}
              </div>
              <p className="mt-2 text-xs text-faint">
                Detected from the course text with keyword patterns. Violet = new for you, green = you already have it.
              </p>
            </section>
          )}

          <section aria-labelledby="syllabus">
            <h2 id="syllabus" className="section-title">Syllabus modules</h2>
            {course.modules.length ? (
              <ol className="mt-3 space-y-2">
                {course.modules.map((m, i) => (
                  <li key={m} className="flex gap-3 rounded-md border border-line bg-charcoal px-4 py-2.5 text-sm">
                    <span className="num w-5 text-faint">{i + 1}</span>
                    <span className="text-ink">{m}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-3 text-sm text-muted">No syllabus was captured for this listing.</p>
            )}
          </section>

          <section aria-labelledby="similar">
            <h2 id="similar" className="section-title">Similar courses</h2>
            <div className="mt-3">
              <SimilarCourses courseId={course.id} />
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="surface p-5" aria-labelledby="match">
            <div className="flex items-center gap-4">
              <ScoreDial value={p.match_percent} size={96} />
              <div>
                <h2 id="match" className="section-title">Your match</h2>
                <p className="text-sm text-muted">
                  {p.excluded_reason
                    ? `Not in your recommendations: ${EXCLUSION_LABEL[p.excluded_reason] ?? p.excluded_reason}.`
                    : p.rank
                      ? `Ranked #${p.rank} in your recommendations`
                      : "Not ranked yet"}
                </p>
              </div>
            </div>
            <p className="mt-4 text-sm text-ink">{p.explanation.summary}</p>
            {p.explanation.cautions.length > 0 && (
              <ul className="mt-3 space-y-1">
                {p.explanation.cautions.map((w) => (
                  <li key={w} className="flex items-start gap-1.5 text-xs text-amber">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                    {w}
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-5">
              <ScoreBreakdown result={p} />
            </div>
            <p className="mt-4 text-xs text-faint">{p.explanation.prerequisite_note}</p>
            <p className="mt-1 text-xs text-faint">{p.explanation.score_note}</p>
          </section>

          <section className="surface p-5" aria-labelledby="fb">
            <h2 id="fb" className="section-title">Your feedback</h2>
            <p className="mt-1 text-xs text-muted">Feedback changes future rankings. Select again to undo.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant={fb?.kind === "relevant" ? "cyan" : "secondary"} icon={<ThumbsUp className="h-3.5 w-3.5" />} onClick={() => void sendFeedback("relevant")}>
                Relevant
              </Button>
              <Button size="sm" variant={fb?.kind === "irrelevant" ? "danger" : "secondary"} icon={<ThumbsDown className="h-3.5 w-3.5" />} onClick={() => void sendFeedback("irrelevant")}>
                Not relevant
              </Button>
              <Button
                size="sm"
                variant={fb?.kind === "previously_studied" ? "cyan" : "secondary"}
                icon={<History className="h-3.5 w-3.5" />}
                onClick={() => void sendFeedback("previously_studied")}
              >
                Studied before
              </Button>
            </div>
            <div className="mt-4">
              <span className="text-xs font-semibold text-muted">Your rating</span>
              <div className="mt-1 flex gap-1" role="radiogroup" aria-label="Rate this course">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={fb?.rating === n}
                    aria-label={`${n} star${n > 1 ? "s" : ""}`}
                    onClick={() => void actions.rate(course.id, n)}
                    className="rounded-sm p-1 hover:bg-slate"
                  >
                    <Star className={`h-5 w-5 ${fb?.rating && n <= fb.rating ? "fill-amber text-amber" : "text-faint"}`} />
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="surface p-5" aria-labelledby="facts">
            <h2 id="facts" className="section-title">Details</h2>
            <dl className="mt-2">
              <Fact label="Level" value={course.level ? LEVEL_LABEL[course.level] : "Not listed"} />
              <Fact label="Length" value={course.duration_text ?? durationLabel(course)} />
              <Fact label="Price" value={priceLabel(course)} />
              <Fact label="Language" value={course.language ?? "Not listed"} />
              <Fact
                label="Certificate"
                value={
                  course.certificate ? (
                    <span className="inline-flex items-center gap-1">
                      <Award className="h-4 w-4 text-cyan" aria-hidden /> Shareable certificate listed
                    </span>
                  ) : (
                    "Not listed"
                  )
                }
              />
              <Fact label="Prerequisites" value={course.prerequisites ?? "Not listed in source data"} />
              <Fact label="Captured" value={formatDate(course.scraped_at)} />
            </dl>
          </section>
        </aside>
      </div>
      <EnrollDialog course={course} open={enrollOpen} onClose={() => setEnrollOpen(false)} />
    </article>
  );
}
