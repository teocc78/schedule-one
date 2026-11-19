import { Suspense } from "react";
import CourseBrowser from "@/components/CourseBrowser";
import { majors } from "@/lib/majors";

export const metadata = { title: "Upper-division classes · Schedule One" };

async function Browser({ searchParams }: { searchParams: Promise<{ major?: string | string[] }> }) {
  const { major } = await searchParams;
  const wanted = Array.isArray(major) ? major[0] : major;
  const initial = majors().some((m) => m.code === wanted) ? wanted! : majors()[0].code;
  return <CourseBrowser initialProgram={initial} />;
}

export default function CoursesPage(props: { searchParams: Promise<{ major?: string | string[] }> }) {
  return (
    <Suspense fallback={<p className="fine" style={{ padding: "2rem 1rem" }}>Loading classes…</p>}>
      <Browser searchParams={props.searchParams} />
    </Suspense>
  );
}
