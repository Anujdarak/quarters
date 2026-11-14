import { EmptyState, TextLink } from "@/components/ui";

export default function NotFound() {
  return (
    <EmptyState title="Page not found">
      The company or page you requested does not exist in the current dataset. <TextLink href="/companies">Search all companies</TextLink>
    </EmptyState>
  );
}
