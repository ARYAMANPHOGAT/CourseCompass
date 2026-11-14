import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import Discover from "../pages/Discover";
import ForYou from "../pages/ForYou";
import MyLearning from "../pages/MyLearning";
import { ScoreBreakdown } from "../components/ScoreBreakdown";
import { course, enrollment, profile, recommendation, recResponse, taxonomy } from "./fixtures";
import { renderAt } from "./render";
import { render } from "@testing-library/react";

vi.mock("../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/client")>();
  return {
    ...actual,
    api: {
      taxonomy: vi.fn(),
      profile: vi.fn(),
      courses: vi.fn(),
      recommendations: vi.fn(),
      wishlist: vi.fn(),
      addWishlist: vi.fn(),
      removeWishlist: vi.fn(),
      sendFeedback: vi.fn(),
      learning: vi.fn(),
      updateEnrollment: vi.fn(),
      explain: vi.fn(),
      similar: vi.fn(),
      sessions: vi.fn(),
    },
  };
});

import { api } from "../api/client";
const m = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

const sql = course("sql-basics", "SQL Basics");
const viz = course("viz-101", "Visualizing Data", { skills: ["excel"], skill_labels: ["Excel & Spreadsheets"], match_percent: 64 });

function searchResponse(items = [sql, viz]) {
  return {
    items,
    total: items.length,
    page: 1,
    page_size: 12,
    pages: 1,
    sort: "match",
    query: null,
    personalized: true,
    facets: {
      categories: [{ value: "Data Analysis", label: "Data Analysis", count: items.length }],
      content_types: [{ value: "course", label: "Course", count: items.length }],
      levels: [{ value: "beginner", label: "beginner", count: items.length }],
      durations: [{ value: "medium", label: "medium", count: items.length }],
      price_statuses: [],
      languages: [{ value: "English", label: "English", count: items.length }],
    },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  window.localStorage.clear();
  m.taxonomy.mockResolvedValue(taxonomy);
  m.profile.mockResolvedValue(profile);
  m.wishlist.mockResolvedValue([]);
});

describe("Discover", () => {
  it("renders catalog results with match scores", async () => {
    m.courses.mockResolvedValue(searchResponse());
    renderAt(<Discover />);
    expect(await screen.findByRole("link", { name: "SQL Basics" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Visualizing Data" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Match score 82 out of 100" })).toBeInTheDocument();
    expect(screen.getByText(/2 courses/)).toBeInTheDocument();
  });

  it("sends the search text and selected filters to the API", async () => {
    m.courses.mockResolvedValue(searchResponse());
    const user = userEvent.setup();
    renderAt(<Discover />);
    await screen.findByRole("link", { name: "SQL Basics" });
    await user.type(screen.getByRole("searchbox", { name: "Search courses" }), "sql");
    await waitFor(() => expect(m.courses).toHaveBeenCalledWith(expect.objectContaining({ q: "sql" })));
    await user.click(screen.getByRole("checkbox", { name: /Free to enrol only/ }));
    await waitFor(() => expect(m.courses).toHaveBeenCalledWith(expect.objectContaining({ q: "sql", free_only: true })));
  });

  it("shows an empty state and resets filters", async () => {
    m.courses.mockResolvedValue(searchResponse([]));
    const user = userEvent.setup();
    renderAt(<Discover />, { route: "/?q=zzz&level=advanced" });
    expect(await screen.findByText("No courses match these filters")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear search and filters" }));
    await waitFor(() => expect(m.courses).toHaveBeenLastCalledWith(expect.objectContaining({ q: undefined, level: [] })));
  });

  it("shows an error state with retry when the backend is unreachable", async () => {
    let backendUp = false;
    m.courses.mockImplementation(async (q: { page_size?: number }) => {
      if (q.page_size !== 1 && !backendUp) throw new ApiError(0, "network_error", "Can't reach the CourseCompass backend.");
      return searchResponse();
    });
    const user = userEvent.setup();
    renderAt(<Discover />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Can't reach the CourseCompass backend.");
    backendUp = true;
    await user.click(await screen.findByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("link", { name: "SQL Basics" })).toBeInTheDocument();
  });
});

describe("For You", () => {
  it("renders ranked recommendations with explanations and method status", async () => {
    m.recommendations.mockResolvedValue(recResponse([recommendation(sql, 1, 0.82), recommendation(viz, 2, 0.64)]));
    renderAt(<ForYou />);
    expect(await screen.findByRole("link", { name: "SQL Basics" })).toBeInTheDocument();
    expect(screen.getAllByText("Recommended because its description closely matches your goals.")).toHaveLength(2);
    expect(screen.getByText(/collaborative unavailable/i)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Match score 82 out of 100" })).toBeInTheDocument();
  });

  it("saves a course to the wishlist", async () => {
    m.recommendations.mockResolvedValue(recResponse([recommendation(sql, 1)]));
    m.addWishlist.mockResolvedValue({ course_id: sql.id, added_at: "now", note: null, demo: false, course: sql });
    const user = userEvent.setup();
    renderAt(<ForYou />);
    await screen.findByRole("link", { name: "SQL Basics" });
    await user.click(screen.getByRole("button", { name: "Save to wishlist" }));
    await waitFor(() => expect(m.addWishlist).toHaveBeenCalledWith("sql-basics"));
    expect(await screen.findByText("Saved to your wishlist")).toBeInTheDocument();
  });

  it("sends relevance feedback and refreshes the ranking", async () => {
    m.recommendations.mockResolvedValue(recResponse([recommendation(sql, 1)]));
    m.sendFeedback.mockResolvedValue({ course_id: sql.id, kind: "irrelevant", rating: null, updated_at: null, demo: false });
    const user = userEvent.setup();
    renderAt(<ForYou />);
    await screen.findByRole("link", { name: "SQL Basics" });
    const calls = m.recommendations.mock.calls.length;
    await user.click(screen.getByRole("button", { name: "Not relevant to me" }));
    await waitFor(() => expect(m.sendFeedback).toHaveBeenCalledWith("sql-basics", "irrelevant"));
    await waitFor(() => expect(m.recommendations.mock.calls.length).toBeGreaterThan(calls));
  });

  it("shows an empty state when nothing is left to recommend", async () => {
    m.recommendations.mockResolvedValue(recResponse([]));
    renderAt(<ForYou />);
    expect(await screen.findByText("Nothing left to recommend")).toBeInTheDocument();
  });
});

describe("My Learning", () => {
  it("updates lesson progress", async () => {
    m.learning.mockResolvedValue([enrollment(sql)]);
    m.updateEnrollment.mockResolvedValue(enrollment(sql, { completed_lessons: 3 }));
    const user = userEvent.setup();
    renderAt(<MyLearning />);
    const row = (await screen.findByRole("link", { name: "SQL Basics" })).closest("li")!;
    expect(within(row).getByRole("progressbar", { name: /SQL Basics progress/ })).toHaveAttribute("aria-valuenow", "50");
    await user.click(within(row).getByRole("button", { name: "One more lesson done" }));
    await waitFor(() => expect(m.updateEnrollment).toHaveBeenCalledWith("sql-basics", { completed_lessons: 3 }));
  });

  it("shows an empty state with a way forward", async () => {
    m.learning.mockResolvedValue([]);
    renderAt(<MyLearning />);
    expect(await screen.findByText("Nothing in My Learning yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See recommendations" })).toHaveAttribute("href", "/for-you");
  });
});

describe("ScoreBreakdown", () => {
  it("lists scored components by contribution and explains unscored ones", () => {
    render(<ScoreBreakdown result={recommendation(sql, 1)} />);
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Goal & topic alignment");
    expect(items[0]).toHaveTextContent("+46.0");
    expect(items[1]).toHaveTextContent("Content relevance");
    expect(screen.getByText(/Not scored/).parentElement).toHaveTextContent("Duration fit");
  });
});
