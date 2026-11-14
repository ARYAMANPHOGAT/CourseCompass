import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AppProviders } from "../App";

export function renderAt(element: ReactElement, { path = "/", route = "/" }: { path?: string; route?: string } = {}) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AppProviders>
        <Routes>
          <Route path={path} element={element} />
        </Routes>
      </AppProviders>
    </MemoryRouter>,
  );
}
