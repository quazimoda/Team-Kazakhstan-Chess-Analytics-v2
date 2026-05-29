import { Dashboard } from "@/components/dashboard";
import { PageHeader } from "@/components/ui";

export default function HomePage() {
  return (
    <>
      <PageHeader eyebrow="Stage 1" title="Team Kazakhstan Chess Analytics" description="Operational dashboard for club matches, leagues, player performance, and contribution tracking." />
      <Dashboard />
    </>
  );
}
