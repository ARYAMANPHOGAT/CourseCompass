import { Compass } from "lucide-react";
import { LinkButton } from "../components/ui/primitives";
import { EmptyState } from "../components/ui/states";

export default function NotFound() {
  return (
    <EmptyState
      icon={<Compass className="h-5 w-5" />}
      title="This page doesn't exist"
      body="The link may be out of date. Head back to your recommendations or the catalog."
      action={
        <>
          <LinkButton to="/for-you" variant="primary">For You</LinkButton>
          <LinkButton to="/discover">Discover</LinkButton>
        </>
      }
    />
  );
}
