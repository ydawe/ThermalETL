import SiteHeader from "@/components/SiteHeader";
import ThermalApp from "@/components/ThermalApp";

export default function HomePage() {
  return (
    <>
      <SiteHeader hero />
      <main className="flex-1 border-t border-ink/10">
        <ThermalApp />
      </main>
    </>
  );
}
